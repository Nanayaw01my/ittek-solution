import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { FiPlus, FiEye, FiDownload, FiFileText } from 'react-icons/fi'
import {
  getCreditAgreements, createCreditAgreement, recordCreditPayment, generateCreditPDF
} from '../api/creditAgreements'
import { formatCurrency, formatDate } from '../utils/helpers'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'
import Table from '../components/Table'
import Badge from '../components/Badge'
import ImageUpload from '../components/ImageUpload'
import { format, addDays } from 'date-fns'
import { saveAs } from 'file-saver'

const DOC_TYPES = ['Ghana Card', 'Passport', "Driver's License", "Voter's ID", 'Other']
const PLAN_OPTIONS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
]
const PLAN_DAYS = { daily: 1, weekly: 7, monthly: 30 }
const PLAN_LABEL = { daily: 'Day', weekly: 'Week', monthly: 'Month' }

function AgreementForm({ onSubmit, loading }) {
  const [customerPhotoUrl, setCustomerPhotoUrl] = useState(null)
  const [guarantorPhotoUrl, setGuarantorPhotoUrl] = useState(null)

  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    defaultValues: {
      startDate: format(new Date(), 'yyyy-MM-dd'),
      paymentPlan: 'weekly',
      downPayment: '',
      totalAmount: '',
    }
  })

  const totalAmount = parseFloat(watch('totalAmount') || 0)
  const downPayment = parseFloat(watch('downPayment') || 0)
  const startDate = watch('startDate')
  const paymentPlan = watch('paymentPlan') || 'weekly'
  const customerName = watch('customerName') || ''
  const guarantorName = watch('guarantorName') || ''

  const balance = Math.max(0, totalAmount - downPayment)
  const installment = balance > 0 ? balance / 3 : 0
  const days = PLAN_DAYS[paymentPlan] || 7
  const dueDates = startDate
    ? [1, 2, 3].map(n => format(addDays(new Date(startDate), n * days), 'dd/MM/yyyy'))
    : ['—', '—', '—']

  const handleFormSubmit = (d) => {
    onSubmit({
      customer_name: d.customerName,
      customer_phone: d.customerPhone,
      customer_address: d.customerLocation,
      document_type: d.documentType,
      id_number: d.idNumber,
      product_type: d.productType,
      product_description: d.productType,
      serial_number: d.serialNumber,
      down_payment: parseFloat(d.downPayment) || 0,
      payment_plan: d.paymentPlan,
      total_amount: parseFloat(d.totalAmount),
      start_date: d.startDate,
      guarantor_name: d.guarantorName,
      guarantor_ghana_card: d.guarantorGhanaCard,
      guarantor_address: d.guarantorLocation,
      guarantor_phone: d.guarantorPhone,
      customer_passport_url: customerPhotoUrl,
      guarantor_passport_url: guarantorPhotoUrl,
    })
  }

  const inp = 'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500'
  const lbl = 'block text-xs font-semibold text-gray-600 mb-1'
  const err = (e) => e && <p className="mt-1 text-xs text-red-500">{e.message}</p>

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="p-5 space-y-6">

      {/* Passport photos + company info preview */}
      <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0">
            <ImageUpload
              value={customerPhotoUrl}
              onChange={setCustomerPhotoUrl}
              folder="passports"
              label="Customer Photo"
              size="lg"
            />
          </div>
          <div className="flex-1 text-center py-2">
            <p className="text-xs font-black text-gray-800 uppercase tracking-wide">DAN & DOR SOLAR</p>
            <p className="text-xs font-bold text-gray-700">COMPANY LIMITED</p>
            <p className="text-xs text-gray-500 mt-1">Accra, Ghana</p>
            <p className="text-xs text-orange-600 font-bold mt-1 uppercase tracking-wider">Credit Sale Agreement</p>
          </div>
          <div className="flex-shrink-0">
            <ImageUpload
              value={guarantorPhotoUrl}
              onChange={setGuarantorPhotoUrl}
              folder="passports"
              label="Guarantor Photo"
              size="lg"
            />
          </div>
        </div>
      </div>

      {/* Customer Details */}
      <div>
        <h4 className="text-xs font-black text-orange-700 uppercase tracking-wider mb-3 pb-2 border-b-2 border-orange-200">
          Customer Details
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={lbl}>Customer Name *</label>
            <input {...register('customerName', { required: 'Required' })} className={inp} placeholder="Full name" />
            {err(errors.customerName)}
          </div>
          <div>
            <label className={lbl}>Document Type *</label>
            <select {...register('documentType', { required: 'Required' })} className={inp + ' bg-white'}>
              <option value="">Select...</option>
              {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            {err(errors.documentType)}
          </div>
          <div>
            <label className={lbl}>ID Number *</label>
            <input {...register('idNumber', { required: 'Required' })} className={inp} placeholder="e.g. GHA-123456789-0" />
            {err(errors.idNumber)}
          </div>
          <div>
            <label className={lbl}>Date *</label>
            <input type="date" {...register('startDate', { required: 'Required' })} className={inp} />
            {err(errors.startDate)}
          </div>
          <div>
            <label className={lbl}>Location *</label>
            <input {...register('customerLocation', { required: 'Required' })} className={inp} placeholder="Customer's address / area" />
            {err(errors.customerLocation)}
          </div>
          <div>
            <label className={lbl}>Phone / Tel *</label>
            <input {...register('customerPhone', { required: 'Required' })} className={inp} placeholder="+233 XXX XXX XXX" />
            {err(errors.customerPhone)}
          </div>
        </div>
      </div>

      {/* Product & Payment Terms */}
      <div>
        <h4 className="text-xs font-black text-orange-700 uppercase tracking-wider mb-3 pb-2 border-b-2 border-orange-200">
          Product and Payment Terms
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={lbl}>Product Type *</label>
            <input {...register('productType', { required: 'Required' })} className={inp} placeholder="e.g. 200W Solar Panel" />
            {err(errors.productType)}
          </div>
          <div>
            <label className={lbl}>Serial Number</label>
            <input {...register('serialNumber')} className={inp} placeholder="Product serial no." />
          </div>
          <div>
            <label className={lbl}>Down Payment (GH₵) *</label>
            <input type="number" step="0.01" min="0" {...register('downPayment', { required: 'Required' })} className={inp} placeholder="0.00" />
            {err(errors.downPayment)}
          </div>
          <div>
            <label className={lbl}>Payment Plan *</label>
            <select {...register('paymentPlan', { required: 'Required' })} className={inp + ' bg-white'}>
              {PLAN_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={lbl}>Loan Total Amount (GH₵) *</label>
            <input type="number" step="0.01" min="0.01" {...register('totalAmount', { required: 'Required', min: { value: 0.01, message: 'Must be > 0' } })} className={inp} placeholder="0.00" />
            {err(errors.totalAmount)}
          </div>
        </div>

        {/* Balance & payment schedule */}
        {totalAmount > 0 && (
          <div className="mt-4 space-y-3">
            <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-xs text-orange-600 font-semibold">Balance (Total − Down Payment)</p>
                <p className="text-xl font-black text-orange-700">{formatCurrency(balance)}</p>
              </div>
              <div className="text-right text-xs text-gray-500">
                <p>Each instalment</p>
                <p className="text-base font-black text-orange-600">{formatCurrency(installment)}</p>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-orange-500">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-bold text-white">Period</th>
                    <th className="px-3 py-2 text-left text-xs font-bold text-white">Due Date</th>
                    <th className="px-3 py-2 text-right text-xs font-bold text-white">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {[1, 2, 3].map(n => (
                    <tr key={n} className={n % 2 === 0 ? 'bg-orange-50' : 'bg-white'}>
                      <td className="px-3 py-2 text-gray-700">{PLAN_LABEL[paymentPlan] || 'Week'} {n}</td>
                      <td className="px-3 py-2 text-gray-600">{dueDates[n - 1]}</td>
                      <td className="px-3 py-2 text-right font-bold text-orange-700">{formatCurrency(installment)}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-orange-300 bg-orange-100">
                    <td colSpan={2} className="px-3 py-2 text-xs font-black text-orange-800 text-right">TOTAL BALANCE</td>
                    <td className="px-3 py-2 text-right font-black text-orange-800">{formatCurrency(balance)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Guarantor Details */}
      <div>
        <h4 className="text-xs font-black text-orange-700 uppercase tracking-wider mb-3 pb-2 border-b-2 border-orange-200">
          Guarantor Details
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={lbl}>Guarantor Name *</label>
            <input {...register('guarantorName', { required: 'Required' })} className={inp} placeholder="Full name" />
            {err(errors.guarantorName)}
          </div>
          <div>
            <label className={lbl}>Ghana Card Number *</label>
            <input {...register('guarantorGhanaCard', { required: 'Required' })} className={inp} placeholder="GHA-XXXXXXXXX-X" />
            {err(errors.guarantorGhanaCard)}
          </div>
          <div>
            <label className={lbl}>Location *</label>
            <input {...register('guarantorLocation', { required: 'Required' })} className={inp} placeholder="Guarantor's address / area" />
            {err(errors.guarantorLocation)}
          </div>
          <div>
            <label className={lbl}>Phone Number *</label>
            <input {...register('guarantorPhone', { required: 'Required' })} className={inp} placeholder="+233 XXX XXX XXX" />
            {err(errors.guarantorPhone)}
          </div>
        </div>
      </div>

      {/* Agreement preview */}
      {customerName && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
          <p className="text-xs font-bold text-gray-700 uppercase tracking-wide">Agreement Preview</p>
          <p className="text-xs text-gray-600 leading-relaxed">
            I <span className="font-semibold text-orange-700">({customerName})</span> have agreed to the terms and
            conditions of DAN AND DOR SOLAR COMPANY LIMITED. I understand and agree that I am entering into a legally
            binding contract, and I will be bound by its terms. The company can repossess the devices if I fail to pay
            on time. I agree that one third (1/3) of the down payment shall be refunded if I am unable to continue.
          </p>
          {guarantorName && (
            <p className="text-xs text-gray-600 leading-relaxed border-t border-gray-200 pt-3">
              I <span className="font-semibold text-orange-700">({guarantorName})</span> have agreed to witness for{' '}
              <span className="font-semibold text-orange-700">({customerName})</span> in case he/she does not pay on
              time, and I stand to pay his/her debt.
            </p>
          )}
          <p className="text-xs text-gray-500 italic">Four signatories on the PDF: CEO · Manager · Customer · Guarantor</p>
        </div>
      )}

      <button type="submit" disabled={loading}
        className="w-full py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold rounded-xl text-sm">
        {loading ? 'Creating...' : 'Create Agreement & Generate PDF'}
      </button>
    </form>
  )
}

function ViewAgreementModal({ agreement, isOpen, onClose }) {
  const queryClient = useQueryClient()
  const [payAmount, setPayAmount] = useState('')

  const payMutation = useMutation({
    mutationFn: ({ id, data }) => recordCreditPayment(id, data),
    onSuccess: () => {
      toast.success('Payment recorded!')
      queryClient.invalidateQueries(['credit-agreements'])
      setPayAmount('')
    },
    onError: err => toast.error(err.response?.data?.message || 'Payment failed'),
  })

  const handlePDF = async () => {
    try {
      const res = await generateCreditPDF(agreement._id)
      const blob = new Blob([res.data], { type: 'application/pdf' })
      saveAs(blob, `credit-agreement-${agreement._id?.slice(-8)}.pdf`)
      toast.success('PDF downloaded!')
    } catch {
      toast.error('Failed to generate PDF')
    }
  }

  if (!agreement) return null

  const payments = agreement.payments || []
  const amountPaid = payments.reduce((s, p) => s + (p.amount || 0), 0)
  const remaining = Math.max(0, (agreement.total_amount || 0) - (agreement.down_payment || 0) - amountPaid)
  const balance = Math.max(0, (agreement.total_amount || 0) - (agreement.down_payment || 0))

  const SectionHeader = ({ title }) => (
    <div className="flex items-center gap-2 pb-1 border-b-2 border-orange-200 mb-3">
      <h4 className="text-xs font-black text-orange-700 uppercase tracking-wider">{title}</h4>
    </div>
  )

  const Field = ({ label, value }) => (
    <div>
      <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-sm font-medium text-gray-800">{value || '—'}</p>
    </div>
  )

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Credit Agreement Details" size="lg">
      <div className="p-5 space-y-6">

        {/* Passport photos header */}
        {(agreement.customer_passport_url || agreement.guarantor_passport_url) && (
          <div className="flex items-center justify-between bg-orange-50 border border-orange-100 rounded-2xl p-3">
            {agreement.customer_passport_url
              ? <div className="text-center"><img src={agreement.customer_passport_url} alt="Customer" className="w-14 h-18 object-cover rounded-lg border mx-auto" /><p className="text-xs text-gray-500 mt-1">Customer</p></div>
              : <div className="w-14" />}
            <p className="text-xs font-black text-orange-700 uppercase tracking-wide text-center flex-1">Credit Sale Agreement</p>
            {agreement.guarantor_passport_url
              ? <div className="text-center"><img src={agreement.guarantor_passport_url} alt="Guarantor" className="w-14 h-18 object-cover rounded-lg border mx-auto" /><p className="text-xs text-gray-500 mt-1">Guarantor</p></div>
              : <div className="w-14" />}
          </div>
        )}

        {/* Status badge */}
        <div className="flex items-center gap-3">
          <Badge status={agreement.status} />
          <span className="text-xs text-gray-400">Created {formatDate(agreement.createdAt)}</span>
        </div>

        {/* Customer Details */}
        <div>
          <SectionHeader title="Customer Details" />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
            <Field label="Customer Name" value={agreement.customer_name} />
            <Field label="Document Type" value={agreement.document_type} />
            <Field label="I.D Number" value={agreement.id_number} />
            <Field label="Date" value={formatDate(agreement.start_date)} />
            <Field label="Location" value={agreement.customer_address} />
            <Field label="Phone / Tel" value={agreement.customer_phone} />
          </div>
        </div>

        {/* Product & Payment Terms */}
        <div>
          <SectionHeader title="Product and Payment Terms" />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
            <Field label="Product Type" value={agreement.product_type} />
            <Field label="Serial Number" value={agreement.serial_number} />
            <Field label="Down Payment" value={formatCurrency(agreement.down_payment || 0)} />
            <Field label="Payment Plan" value={<span className="capitalize">{agreement.payment_plan || 'weekly'}</span>} />
            <Field label="Loan Total Amount" value={formatCurrency(agreement.total_amount || 0)} />
          </div>
          {/* Balance summary */}
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total Amount', value: formatCurrency(agreement.total_amount || 0), color: 'blue' },
              { label: 'Down Payment', value: formatCurrency(agreement.down_payment || 0), color: 'green' },
              { label: 'Balance', value: formatCurrency(balance), color: 'orange' },
              { label: 'Remaining', value: formatCurrency(remaining), color: 'red' },
            ].map(s => (
              <div key={s.label} className={`bg-${s.color}-50 rounded-xl p-3 text-center`}>
                <p className={`text-xs text-${s.color}-600`}>{s.label}</p>
                <p className={`font-black text-${s.color}-800 text-sm`}>{s.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Guarantor Details */}
        <div>
          <SectionHeader title="Guarantor Details" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
            <Field label="Guarantor Name" value={agreement.guarantor_name} />
            <Field label="Ghana Card Number" value={agreement.guarantor_ghana_card} />
            <Field label="Location" value={agreement.guarantor_address} />
            <Field label="Phone Number" value={agreement.guarantor_phone} />
          </div>
        </div>

        {/* Record Payment */}
        {agreement.status !== 'completed' && remaining > 0 && (
          <div className="border border-orange-200 rounded-xl p-4">
            <p className="text-sm font-bold text-gray-700 mb-3">Record Payment</p>
            <div className="flex gap-2">
              <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)}
                placeholder="Amount (GH₵)" min="0.01" max={remaining}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
              <button onClick={() => {
                if (!payAmount || parseFloat(payAmount) <= 0) { toast.error('Enter amount'); return }
                payMutation.mutate({ id: agreement._id, data: { amount: parseFloat(payAmount) } })
              }} disabled={payMutation.isPending}
                className="px-4 py-2 bg-orange-500 text-white rounded-xl font-bold text-sm hover:bg-orange-600 disabled:opacity-60">
                {payMutation.isPending ? '...' : 'Pay'}
              </button>
            </div>
          </div>
        )}

        {/* Payment History */}
        {payments.length > 0 && (
          <div>
            <p className="text-sm font-bold text-gray-700 mb-2">Payment History</p>
            <div className="space-y-2">
              {payments.map((p, i) => (
                <div key={i} className="flex justify-between items-center text-sm bg-gray-50 rounded-xl px-3 py-2">
                  <span className="text-gray-600">{formatDate(p.payment_date || p.date)}</span>
                  <span className="font-bold text-green-600">{formatCurrency(p.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <button onClick={handlePDF}
          className="w-full flex items-center justify-center gap-2 py-3 border-2 border-orange-500 text-orange-600 rounded-xl font-bold text-sm hover:bg-orange-50 transition-colors">
          <FiDownload size={16} /> Download Agreement PDF
        </button>
      </div>
    </Modal>
  )
}

export default function CreditAgreements() {
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [viewAgreement, setViewAgreement] = useState(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['credit-agreements', search, page],
    queryFn: () => getCreditAgreements({ search: search || undefined, page, limit: 15 }).then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: createCreditAgreement,
    onSuccess: () => {
      toast.success('Credit agreement created!')
      queryClient.invalidateQueries(['credit-agreements'])
      setShowCreate(false)
    },
    onError: err => toast.error(err.response?.data?.message || 'Failed to create'),
  })

  const agreements = data?.agreements || (Array.isArray(data) ? data : [])

  const columns = [
    {
      header: 'Customer',
      key: 'customer_name',
      render: (v, row) => (
        <div className="flex items-center gap-2">
          {row.customer_passport_url && (
            <img src={row.customer_passport_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0 border" />
          )}
          <div>
            <p className="font-semibold">{v}</p>
            <p className="text-xs text-gray-500">{row.customer_phone}</p>
          </div>
        </div>
      ),
    },
    { header: 'Product', key: 'product_type', render: v => v || '—' },
    { header: 'Total', key: 'total_amount', render: v => formatCurrency(v || 0) },
    { header: 'Down Payment', key: 'down_payment', render: v => formatCurrency(v || 0) },
    {
      header: 'Remaining',
      key: '_id',
      render: (_, row) => {
        const paid = (row.payments || []).reduce((s, p) => s + (p.amount || 0), 0)
        return (
          <span className="font-bold text-orange-600">
            {formatCurrency(Math.max(0, (row.total_amount || 0) - (row.down_payment || 0) - paid))}
          </span>
        )
      },
    },
    { header: 'Plan', key: 'payment_plan', render: v => <span className="capitalize text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">{v || 'weekly'}</span> },
    { header: 'Status', key: 'status', render: v => <Badge status={v} /> },
    {
      header: 'Actions',
      key: '_id',
      render: (id, row) => (
        <button onClick={e => { e.stopPropagation(); setViewAgreement(row) }}
          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg">
          <FiEye size={14} />
        </button>
      ),
    },
  ]

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Credit Agreements"
        subtitle="Manage installment credit agreements"
        action={
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-semibold text-sm">
            <FiPlus size={16} /> New Agreement
          </button>
        }
      />

      <div className="mb-4">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by customer name..."
          className="w-full max-w-sm px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
      </div>

      <Table
        columns={columns}
        data={agreements}
        loading={isLoading}
        emptyMessage="No credit agreements found"
        pagination={data?.pagination}
        onPageChange={setPage}
        onRowClick={setViewAgreement}
      />

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="New Credit Agreement" size="2xl">
        <AgreementForm loading={createMutation.isPending} onSubmit={d => createMutation.mutate(d)} />
      </Modal>

      <ViewAgreementModal
        isOpen={!!viewAgreement}
        agreement={viewAgreement}
        onClose={() => setViewAgreement(null)}
      />
    </div>
  )
}
