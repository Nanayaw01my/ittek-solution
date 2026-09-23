import React, { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { FiTool, FiPlus, FiPrinter, FiTrash2, FiMapPin } from 'react-icons/fi'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'
import LoadingSpinner from '../components/LoadingSpinner'
import RefreshButton from '../components/RefreshButton'
import { formatCurrency } from '../utils/helpers'
import { printReceipt } from '../utils/printReceipt'
import { getSettings } from '../api/settings'
import {
  getServiceCharges, createServiceCharge, deleteServiceCharge,
} from '../api/serviceCharges'
import useAuthStore from '../store/authStore'

const METHODS = [['cash', 'Cash'], ['mobile_money', 'Mobile Money'], ['card', 'Card']]

/**
 * The slip that comes off the thermal printer.
 *
 * It carries the class the print stylesheet looks for, so the same roll-width
 * handling the till receipt uses applies here — no second set of print rules
 * to keep in step. A job slip is not a sale receipt though: what the customer
 * wants to see is the work and where it was done, not a line of stock.
 */
function ServiceReceipt({ charge, company }) {
  if (!charge) return null
  return (
    <div className="receipt-print-area bg-white border border-gray-200 rounded-xl p-4 font-mono text-sm">
      <div className="text-center">
        <p className="font-bold uppercase">{company?.company_name || 'DAN & DOR SOLAR'}</p>
        {company?.company_address && <p className="text-xs">{company.company_address}</p>}
        {company?.company_phone && <p className="text-xs">Tel: {company.company_phone}</p>}
      </div>

      <p className="text-center font-bold mt-2 border-t border-b border-dashed py-1">
        SERVICE RECEIPT
      </p>

      <div className="mt-2 text-xs space-y-0.5">
        <div className="flex justify-between"><span>Ref</span><span>{charge.reference}</span></div>
        {charge.invoice_no && (
          <div className="flex justify-between"><span>Invoice</span><span>{charge.invoice_no}</span></div>
        )}
        <div className="flex justify-between">
          <span>Date</span>
          <span>{format(new Date(charge.charged_at || Date.now()), 'dd/MM/yyyy HH:mm')}</span>
        </div>
      </div>

      <div className="mt-2 pt-2 border-t border-dashed text-xs space-y-0.5">
        <div className="flex justify-between"><span>Customer</span><span>{charge.customer_name}</span></div>
        {charge.customer_phone && (
          <div className="flex justify-between"><span>Phone</span><span>{charge.customer_phone}</span></div>
        )}
        {charge.location && (
          <div className="flex justify-between"><span>Location</span><span>{charge.location}</span></div>
        )}
      </div>

      <div className="mt-2 pt-2 border-t border-dashed">
        <p className="text-xs font-bold">WORK DONE</p>
        <p className="text-xs mt-0.5 break-words">{charge.description}</p>
      </div>

      <div className="mt-2 pt-2 border-t border-dashed">
        <div className="flex justify-between font-bold text-base">
          <span>TOTAL</span>
          <span>GH¢ {Number(charge.amount || 0).toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-xs mt-1">
          <span>Paid by</span>
          <span>{String(charge.payment_method || 'cash').replace(/_/g, ' ').toUpperCase()}</span>
        </div>
        {charge.reference_no && (
          <div className="flex justify-between text-xs"><span>Ref no.</span><span>{charge.reference_no}</span></div>
        )}
      </div>

      <p className="text-center text-xs mt-3 pt-2 border-t border-dashed">
        Thank you for your business
      </p>
    </div>
  )
}

function ReceiptModal({ charge, company, widthMm, onClose }) {
  const ref = useRef(null)
  return (
    <Modal isOpen onClose={onClose} title="Service Receipt" size="sm">
      <div className="p-4">
        <ServiceReceipt charge={charge} company={company} />
        <div className="flex gap-2 mt-4">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-50">
            Close
          </button>
          <button
            onClick={() => printReceipt(widthMm)}
            className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold text-sm inline-flex items-center justify-center gap-2"
          >
            <FiPrinter /> Print
          </button>
        </div>
      </div>
    </Modal>
  )
}

function NewChargeModal({ onClose, onRecorded }) {
  const queryClient = useQueryClient()
  const [f, setF] = useState({
    customer_name: '', customer_phone: '', location: '',
    description: '', amount: '', reference_no: '', notes: '',
  })
  const [method, setMethod] = useState('cash')
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }))
  const amount = parseFloat(f.amount) || 0

  const mutation = useMutation({
    mutationFn: () => createServiceCharge({ ...f, amount, payment_method: method }),
    onSuccess: (res) => {
      const { charge } = res.data || {}
      toast.success(`Recorded — added to today's sales`)
      queryClient.invalidateQueries({ queryKey: ['service-charges'] })
      // It is a real sale, so the day's figures move with it.
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      queryClient.invalidateQueries({ queryKey: ['sales-history'] })
      onClose()
      if (charge) onRecorded(charge)      // straight to the printer
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not record the charge'),
  })

  const field = (k, label, opts = {}) => (
    <div className={opts.wide ? 'sm:col-span-2' : ''}>
      <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
      <input
        value={f[k]} onChange={set(k)} type={opts.type || 'text'}
        inputMode={opts.inputMode} placeholder={opts.placeholder}
        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
      />
    </div>
  )

  const ready = f.customer_name.trim() && f.description.trim() && amount > 0

  return (
    <Modal isOpen onClose={onClose} title="Record a service charge" size="md">
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {field('customer_name', 'Customer name *', { placeholder: 'Who the work was for' })}
          {field('customer_phone', 'Phone number', { type: 'tel', inputMode: 'tel', placeholder: '024 000 0000' })}
          {field('location', 'Location', { wide: true, placeholder: 'Where the job was — house, town' })}
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-gray-600 mb-1">Work done *</label>
            <textarea
              value={f.description} onChange={set('description')} rows={2}
              placeholder="Inverter repair, panel installation, call-out…"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          {field('amount', 'Amount charged (GH₵) *', { type: 'number', inputMode: 'decimal', placeholder: '0.00' })}
          {field('reference_no', 'Payment reference', { placeholder: 'MoMo id, optional' })}
        </div>

        <div>
          <p className="text-xs font-semibold text-gray-600 mb-1.5">Paid by</p>
          <div className="flex gap-2">
            {METHODS.map(([value, label]) => (
              <button
                key={value} type="button" onClick={() => setMethod(value)}
                className={`flex-1 py-2.5 text-xs font-bold rounded-xl border ${
                  method === value
                    ? 'bg-orange-500 text-white border-orange-500'
                    : 'bg-white text-gray-600 border-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <p className="text-xs text-gray-500">
          This is recorded as a sale, so it goes straight into today's takings and
          the sales reports. No stock moves — the whole amount is for the work.
        </p>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <button onClick={onClose} className="px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-xl">
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!ready || mutation.isPending}
            className="px-5 py-2.5 text-sm font-bold text-white bg-orange-600 rounded-xl disabled:opacity-50 hover:bg-orange-700"
          >
            {mutation.isPending ? 'Recording…' : `Record ${amount > 0 ? formatCurrency(amount) : ''}`.trim()}
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default function ServiceCharges() {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const isOwner = ['CEO', 'Super Admin'].includes(user?.role)

  const [showNew, setShowNew] = useState(false)
  const [printing, setPrinting] = useState(null)
  const [deleting, setDeleting] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['service-charges'],
    queryFn: () => getServiceCharges().then((r) => r.data),
  })
  const charges = data?.charges || []

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => getSettings().then((r) => r.data),
  })

  const removeMutation = useMutation({
    mutationFn: (id) => deleteServiceCharge(id),
    onSuccess: (res) => {
      toast.success(res.data?.message || 'Deleted')
      queryClient.invalidateQueries({ queryKey: ['service-charges'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      setDeleting(null)
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not delete'),
  })

  const today = charges.filter(
    (c) => new Date(c.charged_at).toDateString() === new Date().toDateString()
  )
  const todayTotal = today.reduce((s, c) => s + (c.amount || 0), 0)

  return (
    <div className="p-4 sm:p-6 space-y-1">
      <PageHeader
        title="Service Charges"
        subtitle="Money taken for work done — repairs, installations, call-outs. Counts in the day's sales."
        action={
          <button
            onClick={() => setShowNew(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-orange-600 rounded-xl hover:bg-orange-700"
          >
            <FiPlus /> New charge
          </button>
        }
      >
        <RefreshButton keys={['service-charges', 'dashboard-stats']} />
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-white border border-gray-100 rounded-2xl p-4">
          <p className="text-[11px] font-bold text-gray-500 uppercase">Charged today</p>
          <p className="text-2xl font-black text-orange-600 mt-1">{formatCurrency(todayTotal)}</p>
          <p className="text-xs text-gray-500">{today.length} job{today.length === 1 ? '' : 's'}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4">
          <p className="text-[11px] font-bold text-gray-500 uppercase">Showing</p>
          <p className="text-2xl font-black text-gray-900 mt-1">{formatCurrency(data?.total_amount || 0)}</p>
          <p className="text-xs text-gray-500">{charges.length} charge{charges.length === 1 ? '' : 's'}</p>
        </div>
      </div>

      {isLoading && <LoadingSpinner />}

      {!isLoading && charges.length === 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl p-10 text-center">
          <FiTool className="mx-auto text-3xl text-gray-300" />
          <p className="mt-3 text-sm text-gray-500">No service charges yet.</p>
        </div>
      )}

      <div className="space-y-3">
        {charges.map((c) => (
          <div key={c._id} className="bg-white border border-gray-100 rounded-2xl p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-black text-gray-900">{c.customer_name}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {c.reference}
                  {c.invoice_no ? ` · ${c.invoice_no}` : ''} ·
                  {' '}{format(new Date(c.charged_at), 'dd MMM yyyy HH:mm')}
                  {c.recorded_by?.username ? ` · by ${c.recorded_by.username}` : ''}
                </p>
                <p className="text-sm text-gray-700 mt-1 break-words">{c.description}</p>
                <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                  {c.location && <span className="inline-flex items-center gap-1"><FiMapPin size={11} /> {c.location}</span>}
                  {c.customer_phone && <span>{c.customer_phone}</span>}
                  <span className="uppercase">{String(c.payment_method).replace(/_/g, ' ')}</span>
                </p>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <p className="text-lg font-black text-orange-600">{formatCurrency(c.amount)}</p>
                <button
                  onClick={() => setPrinting(c)}
                  title="Print receipt"
                  className="p-2 text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  <FiPrinter />
                </button>
                {isOwner && (
                  <button
                    onClick={() => setDeleting(c)}
                    title="Delete"
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                  >
                    <FiTrash2 />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {showNew && <NewChargeModal onClose={() => setShowNew(false)} onRecorded={setPrinting} />}

      {printing && (
        <ReceiptModal
          charge={printing}
          company={settings}
          widthMm={settings?.receipt_width_mm}
          onClose={() => setPrinting(null)}
        />
      )}

      {deleting && (
        <Modal isOpen onClose={() => setDeleting(null)} title="Delete this charge?" size="sm">
          <div className="p-5 space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-xl p-3">
              <p className="text-sm font-bold text-red-800">
                {deleting.reference} — {deleting.customer_name}
              </p>
              <p className="text-xs text-red-700 mt-1">
                {formatCurrency(deleting.amount)} · {deleting.description}
              </p>
            </div>
            <p className="text-sm text-gray-700">
              This also removes the sale behind it, so the amount comes back out
              of the day's takings. It cannot be undone.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setDeleting(null)}
                className="flex-1 py-2.5 border border-gray-200 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-50">
                Keep it
              </button>
              <button
                onClick={() => removeMutation.mutate(deleting._id)}
                disabled={removeMutation.isPending}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl font-bold text-sm"
              >
                {removeMutation.isPending ? 'Deleting…' : 'Delete for good'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
