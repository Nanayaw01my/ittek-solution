import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import {
  FiSmartphone, FiPlus, FiCamera, FiCheckCircle, FiXCircle, FiLock, FiUser,
} from 'react-icons/fi'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'
import LoadingSpinner from '../components/LoadingSpinner'
import RefreshButton from '../components/RefreshButton'
import { formatCurrency } from '../utils/helpers'
import { uploadImage } from '../api/upload'
import { resizeImageToDataUrl, dataUrlToFile } from '../utils/resizeImage'
import {
  getPhoneSales, createPhoneSale, approvePhoneSale, rejectPhoneSale,
} from '../api/phoneSales'
import useAuthStore from '../store/authStore'

const STATUS_STYLES = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}

const STATUS_LABELS = {
  pending: 'Waiting on approval',
  approved: 'Approved',
  rejected: 'Rejected',
}

/**
 * One photograph in the paperwork. Resized before it leaves the phone — a
 * modern camera produces several megabytes an image and there are up to six
 * of them per application, most of which would never survive a shop
 * connection.
 */
function PhotoBox({ label, value, onChange }) {
  const [busy, setBusy] = useState(false)

  const pick = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    try {
      // Bigger than an avatar: a card number has to stay readable.
      const small = await resizeImageToDataUrl(file, 1000, 0.8)
      try {
        const res = await uploadImage(dataUrlToFile(small, 'card.jpg'), 'kyc')
        onChange(res.data?.url || res.data?.data?.url || small)
      } catch {
        // No Cloudinary, or no signal for it — keep the picture rather than
        // losing it. The application is worth more than the storage question.
        onChange(small)
      }
    } catch {
      toast.error('Could not read that photo')
    }
    setBusy(false)
  }

  return (
    <label className={`relative flex flex-col items-center justify-center gap-1 h-28 rounded-xl border-2 border-dashed cursor-pointer transition-colors overflow-hidden ${
      value ? 'border-green-400 bg-green-50' : 'border-gray-200 hover:border-orange-400 hover:bg-orange-50'
    }`}>
      {value
        ? <img src={value} alt={label} className="absolute inset-0 w-full h-full object-cover" />
        : <>
            <FiCamera className={busy ? 'animate-pulse text-orange-500' : 'text-gray-400'} size={20} />
            <span className="text-[11px] font-semibold text-gray-500 text-center px-1">{label}</span>
          </>}
      {value && (
        <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] font-bold py-0.5 text-center">
          {label} — tap to change
        </span>
      )}
      <input type="file" accept="image/*" capture="environment" onChange={pick} className="hidden" />
    </label>
  )
}

function NewApplicationModal({ onClose }) {
  const queryClient = useQueryClient()
  const [f, setF] = useState({
    customer_name: '', customer_phone: '', customer_address: '', customer_occupation: '',
    guarantor_name: '', guarantor_phone: '', guarantor_address: '', guarantor_relationship: '',
    phone_model: '', imei: '', total_amount: '', down_payment: '',
    plan: 'monthly', notes: '',
  })
  const [customerId, setCustomerId] = useState({})
  const [guarantorId, setGuarantorId] = useState({})
  const set = (k) => (e) => setF((prev) => ({ ...prev, [k]: e.target.value }))

  const total = parseFloat(f.total_amount) || 0
  const down = parseFloat(f.down_payment) || 0
  const balance = Math.max(0, total - down)
  const count = f.plan === 'weekly' ? 12 : 3
  const each = balance > 0 ? balance / count : 0

  const mutation = useMutation({
    mutationFn: () => createPhoneSale({
      ...f,
      total_amount: total,
      down_payment: down,
      installments: count,
      customer_id: customerId,
      guarantor_id: guarantorId,
    }),
    onSuccess: () => {
      toast.success('Sent to the CEO for approval')
      queryClient.invalidateQueries({ queryKey: ['phone-sales'] })
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not submit'),
  })

  const ready = f.customer_name && f.customer_phone && f.guarantor_name
    && f.guarantor_phone && f.phone_model && total > 0
    && customerId.ghana_card_front_url && guarantorId.ghana_card_front_url

  const field = (key, label, opts = {}) => (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
      <input
        value={f[key]} onChange={set(key)} type={opts.type || 'text'}
        placeholder={opts.placeholder}
        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
      />
    </div>
  )

  return (
    <Modal isOpen onClose={onClose} title="New phone credit application" size="lg">
      <div className="p-5 space-y-5">
        <section>
          <h3 className="text-xs font-black text-gray-500 uppercase tracking-wide mb-2">The customer</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {field('customer_name', 'Full name *')}
            {field('customer_phone', 'Phone *')}
            {field('customer_address', 'Address / area')}
            {field('customer_occupation', 'Work they do')}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Ghana card number</label>
              <input
                value={customerId.ghana_card_number || ''}
                onChange={(e) => setCustomerId((p) => ({ ...p, ghana_card_number: e.target.value }))}
                placeholder="GHA-XXXXXXXXX-X"
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3">
            <PhotoBox label="Card front *" value={customerId.ghana_card_front_url}
              onChange={(url) => setCustomerId((p) => ({ ...p, ghana_card_front_url: url }))} />
            <PhotoBox label="Card back" value={customerId.ghana_card_back_url}
              onChange={(url) => setCustomerId((p) => ({ ...p, ghana_card_back_url: url }))} />
            <PhotoBox label="Their photo" value={customerId.photo_url}
              onChange={(url) => setCustomerId((p) => ({ ...p, photo_url: url }))} />
          </div>
        </section>

        <section>
          <h3 className="text-xs font-black text-gray-500 uppercase tracking-wide mb-2">The guarantor</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {field('guarantor_name', 'Full name *')}
            {field('guarantor_phone', 'Phone *')}
            {field('guarantor_address', 'Address / area')}
            {field('guarantor_relationship', 'Relation to customer', { placeholder: 'Brother, employer…' })}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Ghana card number</label>
              <input
                value={guarantorId.ghana_card_number || ''}
                onChange={(e) => setGuarantorId((p) => ({ ...p, ghana_card_number: e.target.value }))}
                placeholder="GHA-XXXXXXXXX-X"
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3">
            <PhotoBox label="Card front *" value={guarantorId.ghana_card_front_url}
              onChange={(url) => setGuarantorId((p) => ({ ...p, ghana_card_front_url: url }))} />
            <PhotoBox label="Card back" value={guarantorId.ghana_card_back_url}
              onChange={(url) => setGuarantorId((p) => ({ ...p, ghana_card_back_url: url }))} />
            <PhotoBox label="Their photo" value={guarantorId.photo_url}
              onChange={(url) => setGuarantorId((p) => ({ ...p, photo_url: url }))} />
          </div>
        </section>

        <section>
          <h3 className="text-xs font-black text-gray-500 uppercase tracking-wide mb-2">The phone</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {field('phone_model', 'Model *', { placeholder: 'iPhone 12 Pro' })}
            {field('imei', 'IMEI / serial')}
            {field('total_amount', 'Total price (GH₵) *', { type: 'number' })}
            {field('down_payment', 'Down payment (GH₵)', { type: 'number' })}
          </div>
          <div className="flex gap-2 mt-3">
            {[['monthly', '3 months'], ['weekly', '12 weeks']].map(([value, label]) => (
              <button
                key={value} type="button"
                onClick={() => setF((p) => ({ ...p, plan: value }))}
                className={`flex-1 py-2 text-xs font-bold rounded-xl border ${
                  f.plan === value
                    ? 'bg-orange-500 text-white border-orange-500'
                    : 'bg-white text-gray-600 border-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {balance > 0 && (
            <div className="mt-3 bg-orange-50 border border-orange-200 rounded-xl p-3 text-sm">
              <p className="text-orange-800">
                Balance <span className="font-black">{formatCurrency(balance)}</span> over {count}
                {f.plan === 'weekly' ? ' weeks' : ' months'} —
                <span className="font-black"> {formatCurrency(each)}</span> each.
              </p>
            </div>
          )}
        </section>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-xl">
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!ready || mutation.isPending}
            className="px-5 py-2 text-sm font-bold text-white bg-orange-600 rounded-xl disabled:opacity-50 hover:bg-orange-700"
          >
            {mutation.isPending ? 'Sending…' : 'Send for approval'}
          </button>
        </div>
        {!ready && (
          <p className="text-xs text-gray-500 text-right">
            Both Ghana card fronts, both names and phones, the model and the price are needed.
          </p>
        )}
      </div>
    </Modal>
  )
}

/** The paperwork, as only an owner sees it. */
function DetailModal({ sale, onClose }) {
  const queryClient = useQueryClient()
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')

  const done = (msg) => {
    toast.success(msg)
    queryClient.invalidateQueries({ queryKey: ['phone-sales'] })
    onClose()
  }
  const approve = useMutation({
    mutationFn: () => approvePhoneSale(sale._id),
    onSuccess: () => done(`${sale.reference} approved`),
    onError: (err) => toast.error(err.response?.data?.message || 'Could not approve'),
  })
  const reject = useMutation({
    mutationFn: () => rejectPhoneSale(sale._id, reason),
    onSuccess: () => done(`${sale.reference} rejected`),
    onError: (err) => toast.error(err.response?.data?.message || 'Could not reject'),
  })

  const Person = ({ title, name, phone, address, extra, extraLabel, id }) => (
    <section>
      <h3 className="text-xs font-black text-gray-500 uppercase tracking-wide mb-2">{title}</h3>
      <div className="text-sm space-y-0.5">
        <p className="font-bold text-gray-900">{name}</p>
        {phone && <p className="text-gray-600">{phone}</p>}
        {address && <p className="text-gray-600">{address}</p>}
        {extra && <p className="text-gray-500 text-xs">{extraLabel}: {extra}</p>}
        {id?.ghana_card_number && (
          <p className="text-gray-600 font-mono text-xs">{id.ghana_card_number}</p>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2 mt-2">
        {[['ghana_card_front_url', 'Card front'], ['ghana_card_back_url', 'Card back'], ['photo_url', 'Photo']]
          .map(([key, label]) => (
            id?.[key]
              ? <a key={key} href={id[key]} target="_blank" rel="noreferrer" className="block">
                  <img src={id[key]} alt={label} className="h-24 w-full object-cover rounded-lg border" />
                  <span className="text-[10px] text-gray-500">{label} — tap to enlarge</span>
                </a>
              : <div key={key} className="h-24 rounded-lg border border-dashed border-gray-200 flex items-center justify-center text-[10px] text-gray-400">
                  No {label.toLowerCase()}
                </div>
          ))}
      </div>
    </section>
  )

  return (
    <Modal isOpen onClose={onClose} title={`${sale.reference} — ${sale.phone_model}`} size="lg">
      <div className="p-5 space-y-5">
        <div className="flex items-center justify-between">
          <span className={`px-2 py-0.5 text-[11px] font-bold rounded-full ${STATUS_STYLES[sale.status]}`}>
            {STATUS_LABELS[sale.status]}
          </span>
          <p className="text-xs text-gray-500">
            by {sale.submitted_by?.username || '—'} · {format(new Date(sale.submitted_at), 'dd MMM yyyy')}
          </p>
        </div>

        <div className="bg-gray-50 rounded-xl p-3 grid grid-cols-3 gap-2 text-sm">
          <div><p className="text-[11px] text-gray-500">Total</p><p className="font-black">{formatCurrency(sale.total_amount)}</p></div>
          <div><p className="text-[11px] text-gray-500">Down</p><p className="font-black">{formatCurrency(sale.down_payment)}</p></div>
          <div><p className="text-[11px] text-gray-500">Balance</p><p className="font-black text-orange-600">{formatCurrency(sale.balance)}</p></div>
          <div className="col-span-3 text-xs text-gray-600">
            {sale.installments} × {formatCurrency(sale.installment_amount)}
            {sale.plan === 'weekly' ? ' weekly' : ' monthly'}
            {sale.imei ? ` · IMEI ${sale.imei}` : ''}
          </div>
        </div>

        <Person title="Customer" name={sale.customer_name} phone={sale.customer_phone}
          address={sale.customer_address} extra={sale.customer_occupation} extraLabel="Work"
          id={sale.customer_id} />
        <Person title="Guarantor" name={sale.guarantor_name} phone={sale.guarantor_phone}
          address={sale.guarantor_address} extra={sale.guarantor_relationship} extraLabel="Relation"
          id={sale.guarantor_id} />

        {sale.notes && <p className="text-sm text-gray-600">{sale.notes}</p>}

        {sale.status === 'rejected' && sale.rejection_reason && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
            Rejected: {sale.rejection_reason}
          </p>
        )}

        {sale.status === 'pending' && (
          rejecting ? (
            <div className="space-y-2 pt-2 border-t">
              <input
                value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder="Why is it being turned down?"
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
              />
              <div className="flex gap-2">
                <button onClick={() => setRejecting(false)} className="flex-1 py-2 border border-gray-200 rounded-xl text-sm font-semibold">
                  Back
                </button>
                <button
                  onClick={() => reject.mutate()} disabled={!reason.trim() || reject.isPending}
                  className="flex-1 py-2 bg-red-600 text-white rounded-xl text-sm font-bold disabled:opacity-50"
                >
                  {reject.isPending ? 'Rejecting…' : 'Confirm rejection'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2 pt-2 border-t">
              <button onClick={() => setRejecting(true)}
                className="flex-1 py-2.5 border border-red-200 text-red-600 rounded-xl font-bold text-sm hover:bg-red-50">
                <FiXCircle className="inline mr-1" /> Reject
              </button>
              <button onClick={() => approve.mutate()} disabled={approve.isPending}
                className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold text-sm disabled:opacity-50">
                <FiCheckCircle className="inline mr-1" /> {approve.isPending ? 'Approving…' : 'Approve'}
              </button>
            </div>
          )
        )}
      </div>
    </Modal>
  )
}

export default function PhoneSales() {
  const { user } = useAuthStore()
  const [showNew, setShowNew] = useState(false)
  const [viewing, setViewing] = useState(null)
  const [status, setStatus] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['phone-sales', status],
    queryFn: () => getPhoneSales({ status: status || undefined }).then((r) => r.data),
  })
  const sales = data?.sales || []
  // The server decides this, not the browser — it is the same answer either
  // way, but only one of them is the one that matters.
  const isReviewer = !!data?.canApprove
  const pending = sales.filter((s) => s.status === 'pending').length

  return (
    <div>
      <PageHeader
        title="Phone Credit Sales"
        subtitle={isReviewer
          ? 'Applications taken in the field — read the paperwork, then approve or turn down.'
          : 'Take the customer and guarantor details, and send them for approval.'}
        action={
          <button
            onClick={() => setShowNew(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-orange-600 rounded-xl hover:bg-orange-700"
          >
            <FiPlus /> New application
          </button>
        }
      >
        <RefreshButton keys={['phone-sales']} />
      </PageHeader>

      {isReviewer && pending > 0 && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-amber-800">
          {pending} application{pending > 1 ? 's' : ''} waiting on you.
        </div>
      )}

      <div className="flex gap-1 mb-4">
        {[['', 'All'], ['pending', 'Waiting'], ['approved', 'Approved'], ['rejected', 'Rejected']]
          .map(([value, label]) => (
            <button
              key={value || 'all'} onClick={() => setStatus(value)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg border ${
                status === value ? 'bg-orange-600 text-white border-orange-600' : 'bg-white text-gray-600 border-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
      </div>

      {isLoading && <LoadingSpinner />}

      {!isLoading && sales.length === 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl p-10 text-center">
          <FiSmartphone className="mx-auto text-3xl text-gray-300" />
          <p className="mt-3 text-sm text-gray-500">No applications yet.</p>
        </div>
      )}

      <div className="space-y-3">
        {sales.map((s) => (
          <div key={s._id} className="bg-white border border-gray-100 rounded-2xl p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-black text-gray-900">{s.customer_name}</p>
                  <span className={`px-2 py-0.5 text-[11px] font-bold rounded-full ${STATUS_STYLES[s.status]}`}>
                    {STATUS_LABELS[s.status]}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {s.reference} · {s.phone_model} · {format(new Date(s.submitted_at), 'dd MMM yyyy')}
                  {s.submitted_by?.username ? ` · by ${s.submitted_by.username}` : ''}
                </p>
                <p className="text-xs text-gray-600 mt-1">
                  {formatCurrency(s.total_amount)} · {formatCurrency(s.down_payment)} down ·
                  {' '}{s.installments} × {formatCurrency(s.installment_amount)}
                  {s.plan === 'weekly' ? ' weekly' : ' monthly'}
                </p>
              </div>

              {isReviewer ? (
                <button
                  onClick={() => setViewing(s)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-gray-800 rounded-lg hover:bg-gray-900"
                >
                  <FiUser /> {s.status === 'pending' ? 'Review' : 'View'}
                </button>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-gray-400">
                  <FiLock size={11} /> Customer details are owners-only
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {showNew && <NewApplicationModal onClose={() => setShowNew(false)} />}
      {viewing && <DetailModal sale={viewing} onClose={() => setViewing(null)} />}
    </div>
  )
}
