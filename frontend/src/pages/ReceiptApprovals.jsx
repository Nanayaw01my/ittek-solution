import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import {
  FiCheckSquare, FiCheckCircle, FiXCircle, FiTrash2, FiBell, FiBellOff,
} from 'react-icons/fi'
import PageHeader from '../components/PageHeader'
import LoadingSpinner from '../components/LoadingSpinner'
import RefreshButton from '../components/RefreshButton'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import { formatCurrency } from '../utils/helpers'
import {
  getReceiptApprovals, approveReceipt, rejectReceipt, deleteReceiptApproval,
} from '../api/receiptApprovals'
import { enablePush, disablePush, isPushOn, pushState } from '../utils/pushSetup'
import { testPush } from '../api/push'

const STATUS_STYLES = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  used: 'bg-blue-100 text-blue-700',
}

const STATUS_LABELS = {
  pending: 'Waiting on you',
  approved: 'Approved — not printed yet',
  rejected: 'Turned down',
  used: 'Printed',
}

const when = (d) => (d ? format(new Date(d), 'dd MMM yyyy, HH:mm') : '—')

/** Turning this phone's notifications on, so approvals do not wait unseen. */
function PhoneNotifications() {
  const [on, setOn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notes, setNotes] = useState([])
  const state = pushState()

  useEffect(() => { isPushOn().then(setOn) }, [])

  if (!state.ok) {
    return (
      <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-xl p-3">
        {state.reason}
      </p>
    )
  }

  const toggle = async () => {
    setBusy(true)
    const res = on ? await disablePush() : await enablePush()
    if (res.ok) { setOn(!on); toast.success(res.message) } else toast.error(res.message, { duration: 8000 })
    setBusy(false)
  }

  /**
   * "I get no notifications" has half a dozen causes that look the same from
   * the outside. This says which one it is, in one press.
   */
  const test = async () => {
    setBusy(true)
    try {
      const res = await testPush()
      const d = res.data
      if (d.ok) {
        toast.success(`${d.message} It should arrive in a few seconds.`, { duration: 7000 })
        // Push can be working perfectly while nothing ever notifies you.
        setNotes(d.notes || [])
      } else {
        toast.error(d.message, { duration: 12000 })
        setNotes(d.notes || [])
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'The test could not run', { duration: 9000 })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
    <div className={`flex items-center justify-between gap-3 rounded-xl p-3 border ${
      on ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'
    }`}>
      <div className="min-w-0">
        <p className="text-sm font-bold text-gray-900">
          {on ? 'This phone is being notified' : 'Get these on your phone'}
        </p>
        <p className="text-xs text-gray-600">
          {on
            ? 'You will be alerted even with the app closed.'
            : 'Turn on notifications and you will know the moment a receipt needs you.'}
        </p>
      </div>
      <div className="flex flex-col gap-1.5 flex-shrink-0">
        <button
          onClick={toggle} disabled={busy}
          className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap disabled:opacity-50 ${
            on ? 'border border-gray-200 text-gray-600 bg-white' : 'bg-orange-500 text-white'
          }`}
        >
          {on ? <><FiBellOff className="inline mr-1" size={13} /> Turn off</>
            : <><FiBell className="inline mr-1" size={13} /> Turn on</>}
        </button>
        <button
          onClick={test} disabled={busy}
          className="px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap border border-gray-200 bg-white text-gray-600 disabled:opacity-50"
        >
          Send a test
        </button>
      </div>
    </div>

    {notes.length > 0 && (
      <ul className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-1.5">
        {notes.map((n, i) => (
          <li key={i} className="text-xs text-gray-700">• {n}</li>
        ))}
      </ul>
    )}
    </div>
  )
}

function RejectModal({ record, onClose }) {
  const queryClient = useQueryClient()
  const [reason, setReason] = useState('')

  const send = useMutation({
    mutationFn: () => rejectReceipt(record._id, reason),
    onSuccess: () => {
      toast.success(`${record.reference} turned down.`)
      queryClient.invalidateQueries({ queryKey: ['receipt-approvals'] })
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not reject it'),
  })

  return (
    <Modal isOpen onClose={onClose} title={`Turn down ${record.reference}`} size="sm">
      <div className="p-5 space-y-4">
        <p className="text-sm text-gray-600">
          {record.requested_by?.username} will be told, on their phone if they have
          notifications on.
        </p>
        <input
          value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="Why? e.g. the price is wrong"
          className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
        />
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl font-semibold text-sm">
            Cancel
          </button>
          <button onClick={() => send.mutate()} disabled={!reason.trim() || send.isPending}
            className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-sm disabled:opacity-50">
            {send.isPending ? 'Sending…' : 'Turn it down'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default function ReceiptApprovals() {
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('')
  const [rejecting, setRejecting] = useState(null)
  const [deleting, setDeleting] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['receipt-approvals', statusFilter],
    queryFn: () => getReceiptApprovals({ status: statusFilter || undefined }).then((r) => r.data),
    // The point is to answer quickly, so it looks again while the page is open.
    refetchInterval: 30000,
  })

  const rows = data?.approvals || []
  const summary = data?.summary || {}
  const canApprove = data?.can_approve

  const approve = useMutation({
    mutationFn: (id) => approveReceipt(id),
    onSuccess: (res) => {
      toast.success(res.data?.reference
        ? `${res.data.reference} approved — they can print it now.`
        : 'Approved.', { duration: 7000 })
      queryClient.invalidateQueries({ queryKey: ['receipt-approvals'] })
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not approve it'),
  })

  const remove = useMutation({
    mutationFn: (id) => deleteReceiptApproval(id),
    onSuccess: () => {
      toast.success('Deleted.')
      queryClient.invalidateQueries({ queryKey: ['receipt-approvals'] })
      setDeleting(null)
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not delete it'),
  })

  return (
    <div className="space-y-5">
      <PageHeader
        title="Receipt Approvals"
        subtitle={canApprove
          ? 'Packages receipts waiting on you before they can be printed'
          : 'Receipts you have sent up for approval'}
        action={<RefreshButton keys={['receipt-approvals']} />}
      />

      {canApprove && <PhoneNotifications />}

      {summary.pending > 0 && (
        <p className="text-sm font-bold text-amber-700">
          {summary.pending} waiting{canApprove ? ' on you' : ''}.
        </p>
      )}

      <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
        className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white">
        <option value="">All</option>
        {['pending', 'approved', 'rejected', 'used'].map((s) => (
          <option key={s} value={s}>{STATUS_LABELS[s]}</option>
        ))}
      </select>

      {isLoading ? <LoadingSpinner /> : rows.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-2xl p-10 text-center">
          <FiCheckSquare className="mx-auto text-gray-300" size={34} />
          <p className="mt-2 text-sm text-gray-500">Nothing here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r._id} className="bg-white border border-gray-100 rounded-2xl p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-black text-gray-900">
                      {r.customer_name || 'No customer named'}
                    </p>
                    <span className={`px-2 py-0.5 text-[11px] font-bold rounded-full ${STATUS_STYLES[r.status]}`}>
                      {STATUS_LABELS[r.status]}
                    </span>
                    {r.invoice_no && (
                      <span className="text-[11px] font-bold text-blue-700">{r.invoice_no}</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {r.reference} · by {r.requested_by?.username || '—'} · {when(r.requested_at)}
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    {r.item_count} item{r.item_count === 1 ? '' : 's'}
                    {r.takes_stock ? ' · comes off stock' : ' · no stock movement'}
                  </p>
                  {r.rejection_reason && (
                    <p className="text-xs text-red-700 mt-1 italic">{r.rejection_reason}</p>
                  )}
                </div>

                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  <div className="text-right">
                    <p className="text-lg font-black text-gray-900">
                      {formatCurrency(r.grand_total)}
                    </p>
                    <p className="text-[11px] text-gray-500">
                      {formatCurrency(r.amount_paid)} paid
                      {r.balance_due > 0 && (
                        <span className="text-orange-600 font-bold">
                          {' '}· {formatCurrency(r.balance_due)} to Debts
                        </span>
                      )}
                    </p>
                  </div>

                  {canApprove && r.status === 'pending' && (
                    <div className="flex items-center gap-2">
                      <button onClick={() => setRejecting(r)}
                        className="px-3 py-1.5 text-xs font-bold text-red-600 border border-red-200 rounded-lg hover:bg-red-50">
                        <FiXCircle className="inline mr-1" size={12} /> Turn down
                      </button>
                      <button onClick={() => approve.mutate(r._id)} disabled={approve.isPending}
                        className="px-3 py-1.5 text-xs font-bold text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50">
                        <FiCheckCircle className="inline mr-1" size={12} /> Approve
                      </button>
                    </div>
                  )}
                  {r.status !== 'used' && (
                    <button onClick={() => setDeleting(r)}
                      className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg">
                      <FiTrash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {rejecting && <RejectModal record={rejecting} onClose={() => setRejecting(null)} />}

      <ConfirmDialog
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => remove.mutate(deleting._id)}
        title="Delete this request?"
        message={`${deleting?.reference} for ${deleting?.customer_name || 'no customer'}.`}
        confirmText="Delete"
        danger
        loading={remove.isPending}
      />
    </div>
  )
}
