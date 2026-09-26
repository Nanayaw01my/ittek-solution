import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import {
  FiSmartphone, FiPlus, FiCamera, FiCheckCircle, FiXCircle, FiLock, FiUser, FiTrash2,
  FiDollarSign,
} from 'react-icons/fi'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'
import LoadingSpinner from '../components/LoadingSpinner'
import RefreshButton from '../components/RefreshButton'
import { formatCurrency } from '../utils/helpers'
import { uploadImage } from '../api/upload'
import { resizeImageToDataUrl, dataUrlToFile } from '../utils/resizeImage'
import { getProducts } from '../api/products'
import {
  getPhoneSales, createPhoneSale, approvePhoneSale, payPhoneSale, rejectPhoneSale,
  deletePhoneSale,
} from '../api/phoneSales'
import useAuthStore from '../store/authStore'

const STATUS_STYLES = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  completed: 'bg-blue-100 text-blue-700',
}

const METHOD_LABELS = { cash: 'Cash', mobile_money: 'Mobile Money', card: 'Card' }

const STATUS_LABELS = {
  pending: 'Waiting on approval',
  approved: 'Approved',
  rejected: 'Rejected',
  completed: 'Fully paid',
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

/**
 * Taking an application, one thing at a time.
 *
 * This was a single scroll holding two people, six photographs, the phone and
 * the money. On a phone — which is where a rep fills it in, standing in front
 * of the customer — that is a wall to get lost in, and it is easy to reach the
 * bottom having missed something in the middle. It is now four short steps,
 * each of which fits a screen, and each checked before moving on so nothing is
 * discovered missing at the end.
 */
const STEPS = ['Customer', 'Guarantor', 'The phone', 'Check & send']

function StepDots({ step }) {
  return (
    <div className="flex items-center gap-1.5 mb-5">
      {STEPS.map((label, i) => (
        <div key={label} className="flex-1">
          <div className={`h-1.5 rounded-full transition-colors ${
            i < step ? 'bg-green-500' : i === step ? 'bg-orange-500' : 'bg-gray-200'
          }`} />
          <p className={`mt-1 text-[10px] font-bold truncate ${
            i === step ? 'text-orange-600' : 'text-gray-400'
          }`}>
            {i + 1}. {label}
          </p>
        </div>
      ))}
    </div>
  )
}

/** One person's details and their three photographs, used for both people. */
function PersonStep({ who, values, onChange, docs, onDocs, relationLabel }) {
  const set = (k) => (e) => onChange({ ...values, [k]: e.target.value })
  const input = (k, label, opts = {}) => (
    <div className={opts.wide ? 'sm:col-span-2' : ''}>
      <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
      <input
        value={values[k] || ''} onChange={set(k)} type={opts.type || 'text'}
        placeholder={opts.placeholder} inputMode={opts.inputMode}
        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
      />
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {input('name', 'Full name *', { placeholder: 'As written on the card' })}
        {input('phone', 'Phone number *', { type: 'tel', inputMode: 'tel', placeholder: '024 000 0000' })}
        {input('address', 'Address / area', { placeholder: 'House, town' })}
        {relationLabel
          ? input('relationship', relationLabel, { placeholder: 'Brother, employer…' })
          : input('occupation', 'Work they do', { placeholder: 'Trader, teacher…' })}
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-gray-600 mb-1">Ghana card number</label>
          <input
            value={docs.ghana_card_number || ''}
            onChange={(e) => onDocs({ ...docs, ghana_card_number: e.target.value })}
            placeholder="GHA-XXXXXXXXX-X"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-600 mb-2">
          Photographs — the card front is required
        </p>
        <div className="grid grid-cols-3 gap-2">
          <PhotoBox label="Card front *" value={docs.ghana_card_front_url}
            onChange={(url) => onDocs({ ...docs, ghana_card_front_url: url })} />
          <PhotoBox label="Card back" value={docs.ghana_card_back_url}
            onChange={(url) => onDocs({ ...docs, ghana_card_back_url: url })} />
          <PhotoBox label={`${who}'s face`} value={docs.photo_url}
            onChange={(url) => onDocs({ ...docs, photo_url: url })} />
        </div>
      </div>
    </div>
  )
}

function NewApplicationModal({ onClose }) {
  const queryClient = useQueryClient()
  const [step, setStep] = useState(0)

  const [customer, setCustomer] = useState({ name: '', phone: '', address: '', occupation: '' })
  const [customerId, setCustomerId] = useState({})
  const [guarantor, setGuarantor] = useState({ name: '', phone: '', address: '', relationship: '' })
  const [guarantorId, setGuarantorId] = useState({})
  const [deal, setDeal] = useState({
    phone_model: '', product_id: '', imei: '', total_amount: '', down_payment: '',
    plan: 'monthly', notes: '',
  })
  const [phoneSearch, setPhoneSearch] = useState('')

  const { data: phoneProducts } = useQuery({
    queryKey: ['phone-products', phoneSearch],
    queryFn: () => getProducts({ search: phoneSearch, limit: 6 }).then((r) => r.data),
    enabled: phoneSearch.trim().length > 1 && !deal.product_id,
  })
  const phoneMatches = phoneProducts?.products || phoneProducts || []
  const setDealField = (k) => (e) => setDeal((p) => ({ ...p, [k]: e.target.value }))

  const total = parseFloat(deal.total_amount) || 0
  const down = parseFloat(deal.down_payment) || 0
  const balance = Math.max(0, total - down)
  const count = deal.plan === 'weekly' ? 12 : 3
  const each = balance > 0 ? balance / count : 0

  // What is missing on the step being looked at, said in words rather than
  // leaving someone to hunt for the red field.
  const missing = () => {
    if (step === 0) {
      if (!customer.name.trim()) return "the customer's full name"
      if (!customer.phone.trim()) return "the customer's phone number"
      if (!customerId.ghana_card_front_url) return "a photo of the customer's Ghana card"
    }
    if (step === 1) {
      if (!guarantor.name.trim()) return "the guarantor's full name"
      if (!guarantor.phone.trim()) return "the guarantor's phone number"
      if (!guarantorId.ghana_card_front_url) return "a photo of the guarantor's Ghana card"
    }
    if (step === 2) {
      if (!deal.phone_model.trim()) return 'which phone is being sold'
      if (total <= 0) return 'the total price'
      if (down > total) return 'a down payment no bigger than the price'
    }
    return null
  }
  const blocker = missing()

  const mutation = useMutation({
    mutationFn: () => createPhoneSale({
      customer_name: customer.name,
      customer_phone: customer.phone,
      customer_address: customer.address,
      customer_occupation: customer.occupation,
      customer_id: customerId,
      guarantor_name: guarantor.name,
      guarantor_phone: guarantor.phone,
      guarantor_address: guarantor.address,
      guarantor_relationship: guarantor.relationship,
      guarantor_id: guarantorId,
      phone_model: deal.phone_model,
      product_id: deal.product_id || undefined,
      imei: deal.imei,
      total_amount: total,
      down_payment: down,
      plan: deal.plan,
      installments: count,
      notes: deal.notes,
    }),
    onSuccess: () => {
      toast.success('Sent to the CEO for approval')
      queryClient.invalidateQueries({ queryKey: ['phone-sales'] })
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not submit'),
  })

  const Row = ({ label, value }) => (
    <div className="flex justify-between gap-3 py-1.5 border-b border-gray-100 last:border-0">
      <span className="text-xs text-gray-500 flex-shrink-0">{label}</span>
      <span className="text-sm text-gray-900 font-semibold text-right break-words">{value || '—'}</span>
    </div>
  )

  const Thumbs = ({ docs }) => (
    <div className="flex gap-1.5 mt-2">
      {['ghana_card_front_url', 'ghana_card_back_url', 'photo_url'].map((k) => (
        docs[k]
          ? <img key={k} src={docs[k]} alt="" className="h-12 w-12 object-cover rounded-lg border" />
          : <div key={k} className="h-12 w-12 rounded-lg border border-dashed border-gray-200" />
      ))}
    </div>
  )

  return (
    <Modal isOpen onClose={onClose} title="New phone credit application" size="lg">
      <div className="p-5">
        <StepDots step={step} />

        {step === 0 && (
          <PersonStep who="Customer" values={customer} onChange={setCustomer}
            docs={customerId} onDocs={setCustomerId} />
        )}

        {step === 1 && (
          <PersonStep who="Guarantor" values={guarantor} onChange={setGuarantor}
            docs={guarantorId} onDocs={setGuarantorId}
            relationLabel="Relation to customer" />
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-600 mb-1">Phone model *</label>
                <input
                  value={deal.phone_model}
                  onChange={(e) => {
                    // Typing over a picked phone unlinks it — the name and the
                    // product must not drift apart, or the wrong thing comes
                    // off the shelf.
                    setDeal((p) => ({ ...p, phone_model: e.target.value, product_id: '' }))
                    setPhoneSearch(e.target.value)
                  }}
                  placeholder="iPhone 12 Pro"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />

                {/* Linking it to the catalogue is what lets the phone come off
                    stock when the application is approved. Typed on its own it
                    still works — the deal is recorded, the stock is not. */}
                {deal.product_id ? (
                  <p className="mt-1 text-xs font-semibold text-green-700">
                    Linked to stock — this phone comes off the shelf when you approve it.
                  </p>
                ) : phoneMatches.length > 0 ? (
                  <div className="mt-1 border border-gray-100 rounded-xl divide-y max-h-36 overflow-y-auto">
                    {phoneMatches.map((p) => (
                      <button
                        key={p._id} type="button"
                        onClick={() => {
                          setDeal((d) => ({
                            ...d,
                            product_id: p._id,
                            phone_model: p.name,
                            total_amount: d.total_amount || String(p.selling_price ?? ''),
                          }))
                          setPhoneSearch('')
                        }}
                        className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-orange-50"
                      >
                        <span className="truncate">{p.name}</span>
                        <span className="text-xs text-gray-500 flex-shrink-0">
                          {p.quantity} in stock
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-gray-500">
                    Type to search the catalogue. Not found? Leave it typed — the deal is
                    still recorded, but no phone comes off stock.
                  </p>
                )}
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-600 mb-1">IMEI / serial number</label>
                <input
                  value={deal.imei} onChange={setDealField('imei')} inputMode="numeric"
                  placeholder="Dial *#06# on the phone"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Total price (GH₵) *</label>
                <input
                  type="number" inputMode="decimal" value={deal.total_amount} onChange={setDealField('total_amount')}
                  placeholder="0.00"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Down payment (GH₵)</label>
                <input
                  type="number" inputMode="decimal" value={deal.down_payment} onChange={setDealField('down_payment')}
                  placeholder="0.00"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-600 mb-1.5">Pay the balance over</p>
              <div className="flex gap-2">
                {[['monthly', '3 months'], ['weekly', '12 weeks']].map(([value, label]) => (
                  <button
                    key={value} type="button"
                    onClick={() => setDeal((p) => ({ ...p, plan: value }))}
                    className={`flex-1 py-2.5 text-xs font-bold rounded-xl border ${
                      deal.plan === value
                        ? 'bg-orange-500 text-white border-orange-500'
                        : 'bg-white text-gray-600 border-gray-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {balance > 0 && (
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
                <p className="text-sm text-orange-800">
                  Balance <span className="font-black">{formatCurrency(balance)}</span> —
                  {' '}<span className="font-black">{formatCurrency(each)}</span> every
                  {deal.plan === 'weekly' ? ' week for 12 weeks' : ' month for 3 months'}.
                </p>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Anything else worth noting</label>
              <textarea
                value={deal.notes} onChange={setDealField('notes')} rows={2}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <section>
              <h3 className="text-xs font-black text-gray-500 uppercase tracking-wide mb-1">Customer</h3>
              <Row label="Name" value={customer.name} />
              <Row label="Phone" value={customer.phone} />
              <Row label="Address" value={customer.address} />
              <Row label="Work" value={customer.occupation} />
              <Row label="Ghana card" value={customerId.ghana_card_number} />
              <Thumbs docs={customerId} />
            </section>

            <section>
              <h3 className="text-xs font-black text-gray-500 uppercase tracking-wide mb-1">Guarantor</h3>
              <Row label="Name" value={guarantor.name} />
              <Row label="Phone" value={guarantor.phone} />
              <Row label="Address" value={guarantor.address} />
              <Row label="Relation" value={guarantor.relationship} />
              <Row label="Ghana card" value={guarantorId.ghana_card_number} />
              <Thumbs docs={guarantorId} />
            </section>

            <section>
              <h3 className="text-xs font-black text-gray-500 uppercase tracking-wide mb-1">The phone</h3>
              <Row label="Model" value={deal.phone_model} />
              <Row label="IMEI" value={deal.imei} />
              <Row label="Price" value={formatCurrency(total)} />
              <Row label="Down payment" value={formatCurrency(down)} />
              <Row label="Balance" value={formatCurrency(balance)} />
              <Row label="Repayment"
                value={`${count} × ${formatCurrency(each)} ${deal.plan === 'weekly' ? 'weekly' : 'monthly'}`} />
              {deal.notes && <Row label="Notes" value={deal.notes} />}
            </section>

            <p className="text-xs text-gray-500">
              This goes to the CEO for approval. Nothing is sold and no stock moves until they agree to it.
            </p>
          </div>
        )}

        {/* One bar, in the same place at every step. */}
        <div className="flex items-center gap-2 pt-4 mt-4 border-t">
          <button
            onClick={() => (step === 0 ? onClose() : setStep(step - 1))}
            className="px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-xl"
          >
            {step === 0 ? 'Cancel' : 'Back'}
          </button>
          <div className="flex-1 text-right">
            {blocker && (
              <p className="text-xs text-gray-500">Still need {blocker}.</p>
            )}
          </div>
          {step < STEPS.length - 1 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={!!blocker}
              className="px-6 py-2.5 text-sm font-bold text-white bg-orange-600 rounded-xl disabled:opacity-40 hover:bg-orange-700"
            >
              Next
            </button>
          ) : (
            <button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              className="px-6 py-2.5 text-sm font-bold text-white bg-orange-600 rounded-xl disabled:opacity-50 hover:bg-orange-700"
            >
              {mutation.isPending ? 'Sending…' : 'Send for approval'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}

/** The paperwork, as only an owner sees it. */
function DetailModal({ sale: initial, onClose }) {
  const queryClient = useQueryClient()
  // The record as it stands now. A payment replaces it with what the server
  // sends back, so the paid and remaining figures move under the button that
  // was just pressed instead of waiting for the modal to be reopened.
  const [sale, setSale] = useState(initial)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [payAmount, setPayAmount] = useState('')
  const [payHow, setPayHow] = useState('cash')
  // How the down payment was taken. Asked at approval because that is the
  // moment the money actually changes hands.
  const [payMethod, setPayMethod] = useState('cash')

  const done = (msg) => {
    toast.success(msg)
    queryClient.invalidateQueries({ queryKey: ['phone-sales'] })
    onClose()
  }
  const approve = useMutation({
    mutationFn: () => approvePhoneSale(sale._id, payMethod),
    onSuccess: (res) => {
      // Say exactly what moved, so an owner is not left guessing. Built here
      // rather than read off the reply: the interceptor keeps only the record.
      const moved = [
        sale.product_id && 'the phone is off stock',
        sale.down_payment > 0 && `${formatCurrency(sale.down_payment)} taken`,
        sale.balance > 0 && `${formatCurrency(sale.balance)} left to collect`,
      ].filter(Boolean)
      toast.success(
        `${sale.reference} approved${moved.length ? ' — ' + moved.join(', ') : ''}.`,
        { duration: 9000 }
      )
      queryClient.invalidateQueries({ queryKey: ['phone-sales'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      queryClient.invalidateQueries({ queryKey: ['debts'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not approve'),
  })
  const pay = useMutation({
    mutationFn: () => payPhoneSale(sale._id, {
      amount: Number(payAmount),
      payment_method: payHow,
    }),
    onSuccess: (res) => {
      // The interceptor unwraps { success, data } — res.data is the record
      // itself and the server's message did not survive the trip, so the
      // confirmation is built from the record that came back.
      const updated = res.data
      const owing = Math.max(0, Number(updated?.balance ?? 0))
      toast.success(
        `${formatCurrency(Number(payAmount))} recorded — `
        + (owing > 0 ? `${formatCurrency(owing)} left.` : 'fully paid.'),
        { duration: 7000 }
      )
      if (updated?._id) setSale(updated)
      setPayAmount('')
      // The money is in the day's takings, so the dashboard is now stale.
      queryClient.invalidateQueries({ queryKey: ['phone-sales'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not record the payment'),
  })

  const reject = useMutation({
    mutationFn: () => rejectPhoneSale(sale._id, reason),
    onSuccess: () => done(`${sale.reference} rejected`),
    onError: (err) => toast.error(err.response?.data?.message || 'Could not reject'),
  })

  // Everything the customer has handed over, and what is still owed on it.
  const paid = Number(sale.amount_paid ?? sale.down_payment ?? 0)
  const left = Math.max(0, Number(sale.balance ?? 0))
  const progress = sale.total_amount > 0 ? (paid / sale.total_amount) * 100 : 0
  // Payments only make sense once an owner has agreed to the deal.
  const settled = ['approved', 'completed'].includes(sale.status)

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
          <div><p className="text-[11px] text-gray-500">Phone price</p><p className="font-black">{formatCurrency(sale.total_amount)}</p></div>
          <div><p className="text-[11px] text-gray-500">Paid so far</p><p className="font-black text-green-700">{formatCurrency(paid)}</p></div>
          <div><p className="text-[11px] text-gray-500">Remaining</p><p className={`font-black ${left > 0 ? 'text-orange-600' : 'text-green-700'}`}>{formatCurrency(left)}</p></div>

          {/* How far along the deal is, at a glance. */}
          <div className="col-span-3">
            <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
              <div
                className={`h-full rounded-full ${left > 0 ? 'bg-orange-500' : 'bg-green-600'}`}
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              />
            </div>
          </div>

          <div className="col-span-3 text-xs text-gray-600">
            Deposit {formatCurrency(sale.down_payment)} · {sale.installments} ×{' '}
            {formatCurrency(sale.installment_amount)}
            {sale.plan === 'weekly' ? ' weekly' : ' monthly'}
            {sale.imei ? ` · IMEI ${sale.imei}` : ''}
          </div>
        </div>

        {/* ── What has been paid, and taking the next one ────────────────── */}
        {settled && (
          <section className="border border-gray-200 rounded-xl overflow-hidden">
            <h3 className="text-xs font-black text-gray-500 uppercase tracking-wide px-3 py-2 bg-gray-50 border-b">
              Payment record
            </h3>

            <ul className="divide-y text-sm">
              {sale.down_payment > 0 && (
                <li className="flex items-center justify-between px-3 py-2">
                  <div>
                    <p className="font-semibold text-gray-900">Deposit</p>
                    <p className="text-[11px] text-gray-500">
                      {sale.reviewed_at ? format(new Date(sale.reviewed_at), 'dd MMM yyyy') : '—'}
                      {sale.invoice_no ? ` · ${sale.invoice_no}` : ''}
                    </p>
                  </div>
                  <span className="font-black text-gray-900">{formatCurrency(sale.down_payment)}</span>
                </li>
              )}

              {(sale.payments || []).map((p, i) => (
                <li key={i} className="flex items-center justify-between px-3 py-2">
                  <div>
                    <p className="font-semibold text-gray-900">
                      Payment {i + 1}
                      <span className="ml-1 font-normal text-gray-500">{METHOD_LABELS[p.method] || p.method}</span>
                    </p>
                    <p className="text-[11px] text-gray-500">
                      {p.paid_at ? format(new Date(p.paid_at), 'dd MMM yyyy') : '—'}
                      {p.invoice_no ? ` · ${p.invoice_no}` : ''}
                    </p>
                  </div>
                  <span className="font-black text-gray-900">{formatCurrency(p.amount)}</span>
                </li>
              ))}

              {sale.down_payment <= 0 && (sale.payments || []).length === 0 && (
                <li className="px-3 py-3 text-sm text-gray-500">Nothing paid yet.</li>
              )}
            </ul>

            <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-t text-sm">
              <span className="font-bold text-gray-700">Paid {formatCurrency(paid)}</span>
              <span className={`font-black ${left > 0 ? 'text-orange-600' : 'text-green-700'}`}>
                {left > 0 ? `${formatCurrency(left)} remaining` : 'Fully paid'}
              </span>
            </div>

            {left > 0 && (
              <div className="p-3 border-t space-y-2">
                <div className="flex gap-2">
                  <input
                    type="number" step="0.01" min="0" max={left}
                    value={payAmount} onChange={(e) => setPayAmount(e.target.value)}
                    placeholder={`Amount (next is ${formatCurrency(sale.installment_amount)})`}
                    className="flex-1 min-w-0 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                  />
                  {/* The common case is the agreed instalment, or whatever is
                      left if that is less than a full one. */}
                  <button
                    type="button"
                    onClick={() => setPayAmount(String(Math.min(sale.installment_amount, left)))}
                    className="px-3 py-2 border border-gray-200 rounded-xl text-xs font-bold text-gray-600 whitespace-nowrap"
                  >
                    Instalment
                  </button>
                </div>

                <div className="flex gap-2">
                  {[['cash', 'Cash'], ['mobile_money', 'MoMo'], ['card', 'Card']].map(([v, l]) => (
                    <button
                      key={v} type="button" onClick={() => setPayHow(v)}
                      className={`flex-1 py-2 text-xs font-bold rounded-lg border ${
                        payHow === v
                          ? 'bg-orange-500 text-white border-orange-500'
                          : 'bg-white text-gray-600 border-gray-200'
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => pay.mutate()}
                  disabled={pay.isPending || !(Number(payAmount) > 0) || Number(payAmount) > left}
                  className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold text-sm disabled:opacity-50"
                >
                  <FiDollarSign className="inline mr-1" />
                  {pay.isPending ? 'Recording…' : 'Pay'}
                </button>
                <p className="text-[11px] text-gray-500 text-center">
                  Goes straight into today's sales.
                </p>
              </div>
            )}
          </section>
        )}

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
            <div className="pt-2 border-t space-y-3">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                <p className="text-xs font-bold text-amber-900 uppercase tracking-wide">
                  Approving will
                </p>
                <ul className="text-sm text-amber-900 mt-1 space-y-0.5">
                  {sale.product_id && <li>• take the phone off stock</li>}
                  {sale.down_payment > 0 && (
                    <li>• record {formatCurrency(sale.down_payment)} in today's sales</li>
                  )}
                  {sale.balance > 0 && (
                    <li>
                      • leave {formatCurrency(sale.balance)} to collect over{' '}
                      {sale.installments} {sale.plan === 'weekly' ? 'weeks' : 'months'} —
                      take each instalment with the Pay button here
                    </li>
                  )}
                  {!sale.product_id && (
                    <li className="text-amber-700">
                      • nothing comes off stock — no catalogue phone was linked
                    </li>
                  )}
                </ul>
              </div>

              {sale.down_payment > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-600 mb-1.5">
                    How was the deposit paid?
                  </p>
                  <div className="flex gap-2">
                    {[['cash', 'Cash'], ['mobile_money', 'Mobile Money'], ['card', 'Card']].map(([v, l]) => (
                      <button
                        key={v} type="button" onClick={() => setPayMethod(v)}
                        className={`flex-1 py-2 text-xs font-bold rounded-lg border ${
                          payMethod === v
                            ? 'bg-orange-500 text-white border-orange-500'
                            : 'bg-white text-gray-600 border-gray-200'
                        }`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              )}

            <div className="flex gap-2">
              <button onClick={() => setRejecting(true)}
                className="flex-1 py-2.5 border border-red-200 text-red-600 rounded-xl font-bold text-sm hover:bg-red-50">
                <FiXCircle className="inline mr-1" /> Reject
              </button>
              <button onClick={() => approve.mutate()} disabled={approve.isPending}
                className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold text-sm disabled:opacity-50">
                <FiCheckCircle className="inline mr-1" /> {approve.isPending ? 'Approving…' : 'Approve'}
              </button>
            </div>
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
  const [deleting, setDeleting] = useState(null)
  const [status, setStatus] = useState('')
  const queryClient = useQueryClient()

  const removeMutation = useMutation({
    mutationFn: (id) => deletePhoneSale(id),
    onSuccess: (_res, id) => {
      const gone = sales.find((x) => x._id === id)
      toast.success(`${gone?.reference || 'Application'} deleted`)
      queryClient.invalidateQueries({ queryKey: ['phone-sales'] })
      setDeleting(null)
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not delete'),
  })

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
    // Same gutter as every other screen. Without it the heading and
    // the cards sit flush against the edge of a phone.
    <div className="p-4 sm:p-6 space-y-1">
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

      <div className="flex flex-wrap gap-1.5 mb-4">
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
                  {/* On a live deal, what is still to come is the useful number. */}
                  {['approved', 'completed'].includes(s.status) && (
                    <span className={`ml-1 font-bold ${s.balance > 0 ? 'text-orange-600' : 'text-green-700'}`}>
                      · {s.balance > 0 ? `${formatCurrency(s.balance)} left` : 'fully paid'}
                    </span>
                  )}
                </p>
              </div>

              {isReviewer ? (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => setViewing(s)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-gray-800 rounded-lg hover:bg-gray-900"
                  >
                    <FiUser /> {s.status === 'pending' ? 'Review' : 'View'}
                  </button>
                  <button
                    onClick={() => setDeleting(s)}
                    title="Delete this application"
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                  >
                    <FiTrash2 />
                  </button>
                </div>
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

      {/* Deleting takes the customer's and guarantor's details with it, so the
          confirmation says so plainly rather than asking "are you sure?". */}
      {deleting && (
        <Modal isOpen onClose={() => setDeleting(null)} title="Delete this application?" size="sm">
          <div className="p-5 space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-xl p-3">
              <p className="text-sm font-bold text-red-800">
                {deleting.reference} — {deleting.customer_name}
              </p>
              <p className="text-xs text-red-700 mt-1">
                {deleting.phone_model} · {formatCurrency(deleting.total_amount)} ·
                {' '}{STATUS_LABELS[deleting.status]}
              </p>
            </div>
            <p className="text-sm text-gray-700">
              This removes the record and the Ghana card photographs of both the
              customer and the guarantor. It cannot be undone, and if the phone
              has already gone out there will be nothing left to chase it with.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleting(null)}
                className="flex-1 py-2.5 border border-gray-200 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-50"
              >
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
