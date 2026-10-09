import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { FiPlus, FiEye, FiDownload, FiFileText, FiRepeat } from 'react-icons/fi'
import {
  getCreditAgreements, createCreditAgreement, recordCreditPayment, generateCreditPDF,
  exchangeCreditProduct, getExchangeNote
} from '../api/creditAgreements'
import { formatCurrency, formatDate } from '../utils/helpers'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'
import Table from '../components/Table'
import Badge from '../components/Badge'
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

function PassportPlaceholder({ label }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="w-16 h-20 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 flex flex-col items-center justify-center relative overflow-hidden">
        <div className="absolute inset-1 opacity-20">
          <svg width="100%" height="100%"><line x1="0" y1="0" x2="100%" y2="100%" stroke="#999" strokeWidth="1"/><line x1="100%" y1="0" x2="0" y2="100%" stroke="#999" strokeWidth="1"/></svg>
        </div>
        <p className="text-xs text-gray-400 font-medium text-center leading-tight z-10">PASSPORT<br/>PHOTO</p>
      </div>
      <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">{label}</p>
    </div>
  )
}

function AgreementForm({ onSubmit, loading }) {
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
    })
  }

  const inp = 'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500'
  const lbl = 'block text-xs font-semibold text-gray-600 mb-1'
  const err = (e) => e && <p className="mt-1 text-xs text-red-500">{e.message}</p>

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="p-5 space-y-6">

      {/* Header preview */}
      <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4">
        <div className="flex items-center gap-4">
          <PassportPlaceholder label="Customer" />
          <div className="flex-1 text-center py-2">
            <p className="text-xs font-black text-gray-800 uppercase tracking-wide">DAN & DOR SOLAR</p>
            <p className="text-xs font-bold text-gray-700">COMPANY LIMITED</p>
            <p className="text-xs text-gray-500 mt-1">Bogoso, Western Region</p>
            <p className="text-xs text-orange-600 font-bold mt-1 uppercase tracking-wider">Credit Sale Agreement</p>
          </div>
          <PassportPlaceholder label="Guarantor" />
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
            <input {...register('customerPhone', { required: 'Required' })} className={inp} placeholder="+233 XXXXXXXXX" />
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
            <input {...register('guarantorPhone', { required: 'Required' })} className={inp} placeholder="+233 XXXXXXXXX" />
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

/**
 * The instalments this agreement actually commits the customer to.
 *
 * An agreement is three instalments, spaced by the plan they chose — three
 * weeks, three months, or three days — so "weekly" answers the question the
 * shop is really asking at the counter: how much, and by when. The screen used
 * to show the word "weekly" and nothing else, which told nobody what was due.
 *
 * Payments are applied oldest instalment first, the way a ledger settles, so a
 * part payment shows as part of the instalment it went against rather than
 * floating loose.
 */
const EVERY = {
  daily: { label: 'day', add: (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n) },
  weekly: { label: 'week', add: (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n * 7) },
  monthly: { label: 'month', add: (d, n) => new Date(d.getFullYear(), d.getMonth() + n, d.getDate()) },
}

const buildSchedule = (agreement) => {
  const plan = EVERY[agreement.payment_plan] ? agreement.payment_plan : 'weekly'
  const every = EVERY[plan]
  const count = 3
  const balance = Math.max(0, (agreement.total_amount || 0) - (agreement.down_payment || 0))
  const each = Number((balance / count).toFixed(2))
  const start = new Date(agreement.start_date || agreement.createdAt || Date.now())

  // What has been paid, spread over the instalments in order.
  let pot = (agreement.payments || []).reduce((sum, p) => sum + (p.amount || 0), 0)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const rows = []
  for (let n = 1; n <= count; n++) {
    // The last instalment carries any rounding, so the three add to the balance.
    const due = n === count ? Number((balance - each * (count - 1)).toFixed(2)) : each
    const paid = Math.min(pot, due)
    pot = Math.max(0, pot - due)

    const dueDate = every.add(start, n)
    const settled = paid >= due - 0.005
    const overdue = !settled && dueDate < today

    rows.push({
      n, due, paid, outstanding: Number((due - paid).toFixed(2)),
      dueDate, settled, overdue,
      partly: paid > 0 && !settled,
    })
  }

  return { plan, every, count, each, balance, rows, extra: pot }
}

function ViewAgreementModal({ agreement, isOpen, onClose, onAgreementChange }) {
  const queryClient = useQueryClient()
  const [payAmount, setPayAmount] = useState('')
  const [swapping, setSwapping] = useState(false)
  const [swap, setSwap] = useState({
    returned_description: '', returned_serial: '', returned_condition: '', returned_value: '',
    replacement_description: '', replacement_serial: '', replacement_value: '', reason: '',
  })

  /** Open the note for a swap in a new tab, ready to print. */
  const openNote = async (exchangeId, reference) => {
    try {
      const res = await getExchangeNote(agreement._id, exchangeId)
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
      const win = window.open(url, '_blank')
      // A blocked pop-up must not look like a broken button.
      if (!win) saveAs(new Blob([res.data], { type: 'application/pdf' }), `exchange-${reference || exchangeId}.pdf`)
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch {
      toast.error('Could not open the exchange note')
    }
  }

  const swapMutation = useMutation({
    mutationFn: (data) => exchangeCreditProduct(agreement._id, data),
    onSuccess: (res) => {
      // The axios layer unwraps { success, data } and drops the message with
      // it, so the figure the counter needs is worked out from the record.
      const made = res.data?.exchange
      toast.success(
        made && made.credit_due > 0
          ? `Swapped. We owe the customer ${formatCurrency(made.credit_due)}.`
          : `Swapped. They now owe ${formatCurrency(made?.balance_after || 0)}.`
      )
      queryClient.invalidateQueries(['credit-agreements'])
      // Without this the open modal keeps showing the agreement as it was
      // before the swap — the old item, the old balance and no note to
      // reprint, which is exactly when somebody needs the note.
      if (res.data?.agreement) onAgreementChange?.(res.data.agreement)
      setSwapping(false)
      setSwap({
        returned_description: '', returned_serial: '', returned_condition: '', returned_value: '',
        replacement_description: '', replacement_serial: '', replacement_value: '', reason: '',
      })
      // Straight to the paper — that is the point of doing this at the counter.
      if (made?._id) openNote(made._id, made.reference)
    },
    onError: err => toast.error(err.response?.data?.message || 'Could not record the swap'),
  })

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

  const schedule = buildSchedule(agreement)
  // The one the shop chases next: the first that is not settled.
  const nextDue = schedule.rows.find(r => !r.settled) || null

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

        {/* Header */}
        <div className="flex items-center justify-between bg-orange-50 border border-orange-100 rounded-2xl p-3">
          <PassportPlaceholder label="Customer" />
          <p className="text-xs font-black text-orange-700 uppercase tracking-wide text-center flex-1">Credit Sale Agreement</p>
          <PassportPlaceholder label="Guarantor" />
        </div>

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

        {/* Repayment Schedule */}
        <div>
          <SectionHeader title={`Repayment Schedule — ${schedule.count} ${schedule.every.label}${schedule.count === 1 ? '' : 's'}`} />

          <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 mb-3">
            <p className="text-sm text-orange-900">
              Pays <span className="font-black">{formatCurrency(schedule.each)}</span> every
              {' '}{schedule.every.label}, for {schedule.count} {schedule.every.label}s —
              {' '}<span className="font-black">{formatCurrency(schedule.balance)}</span> in total after the down payment.
            </p>
            {nextDue ? (
              <p className={`text-xs mt-1 font-bold ${nextDue.overdue ? 'text-red-700' : 'text-orange-700'}`}>
                {nextDue.overdue ? 'OVERDUE: ' : 'Next due: '}
                {formatCurrency(nextDue.outstanding)} on {formatDate(nextDue.dueDate)}
              </p>
            ) : (
              <p className="text-xs mt-1 font-bold text-green-700">All instalments paid.</p>
            )}
          </div>

          <div className="border border-gray-100 rounded-xl overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-gray-50 text-[11px] font-bold text-gray-500">
              <span className="col-span-4">DUE ON</span>
              <span className="col-span-3 text-right">AMOUNT</span>
              <span className="col-span-2 text-right">PAID</span>
              <span className="col-span-3 text-right">STATUS</span>
            </div>
            {schedule.rows.map(r => (
              <div key={r.n} className={`grid grid-cols-12 gap-2 px-3 py-2 border-t text-sm ${
                r.overdue ? 'bg-red-50' : r.settled ? 'bg-green-50' : ''
              }`}>
                <span className="col-span-4">
                  <span className="text-gray-400 mr-1">{r.n}.</span>{formatDate(r.dueDate)}
                </span>
                <span className="col-span-3 text-right font-semibold">{formatCurrency(r.due)}</span>
                <span className="col-span-2 text-right text-gray-600">{formatCurrency(r.paid)}</span>
                <span className={`col-span-3 text-right text-xs font-bold ${
                  r.settled ? 'text-green-700' : r.overdue ? 'text-red-700' : 'text-gray-500'
                }`}>
                  {r.settled ? 'Paid' : r.overdue
                    ? `Overdue ${formatCurrency(r.outstanding)}`
                    : r.partly ? `${formatCurrency(r.outstanding)} left` : 'Not yet due'}
                </span>
              </div>
            ))}
          </div>
          {schedule.extra > 0 && (
            <p className="text-xs text-green-700 mt-2">
              Paid {formatCurrency(schedule.extra)} more than the schedule asks for.
            </p>
          )}
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

        {/* Swap the goods. The agreement stands; only the item changes. */}
        {agreement.status !== 'completed' && (
          <div className="border border-blue-200 rounded-xl p-4">
            {!swapping ? (
              <button
                onClick={() => {
                  setSwap(prev => ({
                    ...prev,
                    // Prefilled with what the agreement says they have, since
                    // that is what is coming back nine times out of ten.
                    returned_description: agreement.product_description || agreement.product_type || '',
                    returned_serial: agreement.serial_number || '',
                    returned_value: String(agreement.total_amount || ''),
                  }))
                  setSwapping(true)
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-blue-700 font-bold text-sm hover:bg-blue-50 rounded-xl"
              >
                <FiRepeat size={15} /> Change the product
              </button>
            ) : (
              <div className="space-y-3">
                <p className="text-sm font-bold text-gray-700">Change the product</p>
                <p className="text-xs text-gray-500">
                  The customer brings back what they have and takes something else. The agreement,
                  the guarantor and everything already paid stay as they are — only the item and the
                  balance change.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2 p-3 rounded-xl bg-gray-50 border border-gray-200">
                    <p className="text-[11px] font-black text-gray-500 uppercase tracking-wide">Coming back</p>
                    <input value={swap.returned_description}
                      onChange={e => setSwap({ ...swap, returned_description: e.target.value })}
                      placeholder="What they are returning"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                    <input value={swap.returned_serial}
                      onChange={e => setSwap({ ...swap, returned_serial: e.target.value })}
                      placeholder="Serial number"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                    <input value={swap.returned_condition}
                      onChange={e => setSwap({ ...swap, returned_condition: e.target.value })}
                      placeholder="Condition it came back in"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                    <input type="number" min="0" step="0.01" value={swap.returned_value}
                      onChange={e => setSwap({ ...swap, returned_value: e.target.value })}
                      placeholder="Credit it at (GH₵)"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                  </div>

                  <div className="space-y-2 p-3 rounded-xl bg-orange-50 border border-orange-200">
                    <p className="text-[11px] font-black text-orange-700 uppercase tracking-wide">Going out</p>
                    <input value={swap.replacement_description}
                      onChange={e => setSwap({ ...swap, replacement_description: e.target.value })}
                      placeholder="What they are taking"
                      className="w-full px-3 py-2 border border-orange-200 rounded-lg text-sm" />
                    <input value={swap.replacement_serial}
                      onChange={e => setSwap({ ...swap, replacement_serial: e.target.value })}
                      placeholder="Serial number"
                      className="w-full px-3 py-2 border border-orange-200 rounded-lg text-sm" />
                    <input type="number" min="0.01" step="0.01" value={swap.replacement_value}
                      onChange={e => setSwap({ ...swap, replacement_value: e.target.value })}
                      placeholder="Price of the new item (GH₵)"
                      className="w-full px-3 py-2 border border-orange-200 rounded-lg text-sm" />
                  </div>
                </div>

                <input value={swap.reason}
                  onChange={e => setSwap({ ...swap, reason: e.target.value })}
                  placeholder="Why is it being changed?"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm" />

                {/* The new balance, before anybody commits to it. */}
                {(() => {
                  const back = parseFloat(swap.returned_value) || 0
                  const out = parseFloat(swap.replacement_value) || 0
                  if (!out) return null
                  const paid = (agreement.down_payment || 0) + amountPaid
                  const after = Math.max(0, (agreement.total_amount || 0) - back + out)
                  const owed = Math.max(0, after - paid)
                  const credit = Math.max(0, paid - after)
                  return (
                    <div className={`rounded-xl px-4 py-3 flex justify-between items-center ${credit > 0 ? 'bg-green-600' : 'bg-orange-500'}`}>
                      <span className="text-xs font-bold text-white uppercase tracking-wide">
                        {credit > 0 ? 'We would owe them' : 'They would owe'}
                      </span>
                      <span className="text-lg font-black text-white">
                        {formatCurrency(credit > 0 ? credit : owed)}
                      </span>
                    </div>
                  )
                })()}

                <div className="flex gap-2">
                  <button onClick={() => setSwapping(false)}
                    className="flex-1 py-2.5 border border-gray-200 rounded-xl font-bold text-sm text-gray-600 hover:bg-gray-50">
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      if (!swap.returned_description.trim()) { toast.error('What is coming back?'); return }
                      if (!swap.replacement_description.trim()) { toast.error('What are they taking?'); return }
                      if (!(parseFloat(swap.replacement_value) > 0)) { toast.error('What does the new item cost?'); return }
                      swapMutation.mutate({
                        ...swap,
                        returned_value: swap.returned_value === '' ? undefined : parseFloat(swap.returned_value),
                        replacement_value: parseFloat(swap.replacement_value),
                      })
                    }}
                    disabled={swapMutation.isPending}
                    className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl font-bold text-sm"
                  >
                    {swapMutation.isPending ? 'Saving…' : 'Swap and print the note'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Past swaps, each with its paper. The agreement names the latest
            item; the chain back to what was signed for lives here. */}
        {(agreement.exchanges || []).length > 0 && (
          <div>
            <p className="text-sm font-bold text-gray-700 mb-2">Product changes</p>
            <div className="space-y-2">
              {(agreement.exchanges || []).map((e) => (
                <div key={e._id} className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5">
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <p className="text-sm text-gray-800 truncate">
                        <span className="text-gray-500">{e.returned_description}</span>
                        {' → '}
                        <span className="font-semibold">{e.replacement_description}</span>
                      </p>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        {e.reference} · {formatDate(e.exchanged_on)} ·{' '}
                        {e.credit_due > 0
                          ? `we owed ${formatCurrency(e.credit_due)}`
                          : `balance ${formatCurrency(e.balance_before)} → ${formatCurrency(e.balance_after)}`}
                      </p>
                    </div>
                    <button onClick={() => openNote(e._id, e.reference)}
                      className="flex-shrink-0 px-2.5 py-1.5 rounded-lg bg-white border border-blue-200 text-blue-700 text-[11px] font-bold hover:bg-blue-50">
                      Note
                    </button>
                  </div>
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

  const { data, isLoading, error, refetch } = useQuery({
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

  const agreements = Array.isArray(data?.agreements)
    ? data.agreements
    : (Array.isArray(data) ? data : [])
  // A server older than this app has no handler for an unknown /api path, so
  // it answers with the app's own HTML and a 200. That is not an empty list,
  // and must not be shown as one.
  const badAnswer = !isLoading && !error && data !== undefined
    && !Array.isArray(data) && !Array.isArray(data?.agreements)

  const columns = [
    {
      header: 'Customer',
      key: 'customer_name',
      render: (v, row) => (
        <div>
          <p className="font-semibold">{v}</p>
          <p className="text-xs text-gray-500">{row.customer_phone}</p>
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

      {/* An empty table on its own cannot tell you whether there are no
          agreements or whether the list never arrived. */}
      {!isLoading && (error || badAnswer) && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800">
          <p className="font-semibold">The credit agreements did not load.</p>
          <p className="mt-0.5 text-xs">
            {error?.response?.data?.message
              || error?.message
              || 'The server sent back something that is not a list of agreements. It may be running an older version than this app.'}
          </p>
          <button
            onClick={() => refetch()}
            className="mt-2 px-3 py-1.5 rounded-lg bg-white border border-red-200 text-xs font-semibold hover:bg-red-50"
          >
            Try again
          </button>
        </div>
      )}

      <Table
        columns={columns}
        data={agreements}
        loading={isLoading}
        emptyMessage={search ? `Nothing matches “${search}”` : 'No credit agreements have been created yet'}
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
        onAgreementChange={setViewAgreement}
      />
    </div>
  )
}
