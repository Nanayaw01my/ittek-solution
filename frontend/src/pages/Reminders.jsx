import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import {
  FiBell, FiPlus, FiMessageCircle, FiCopy, FiPhone, FiCheck, FiTrash2, FiAlertCircle,
  FiHeart, FiGift, FiRepeat, FiSend, FiZap,
} from 'react-icons/fi'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'
import LoadingSpinner from '../components/LoadingSpinner'
import RefreshButton from '../components/RefreshButton'
import ConfirmDialog from '../components/ConfirmDialog'
import { formatCurrency } from '../utils/helpers'
import { normaliseGhanaPhone } from '../utils/phone'
import {
  getReminders, createReminder, logReminderSent, deleteReminder, updateReminder,
  sendReminderSms,
} from '../api/reminders'
import { getSmsBalance } from '../api/settings'

const SOURCE_LABELS = {
  debt: 'Debt',
  layaway: 'Layaway',
  credit: 'Credit agreement',
  phone_credit: 'Phone credit',
  custom: 'Reminder',
}

const PURPOSE_LABELS = { wish: 'Good wishes', note: 'A word', checkup: 'Check-up' }

const PURPOSE_STYLES = {
  wish: 'bg-pink-100 text-pink-700',
  note: 'bg-sky-100 text-sky-700',
  checkup: 'bg-emerald-100 text-emerald-700',
}

const SOURCE_STYLES = {
  debt: 'bg-red-100 text-red-700',
  layaway: 'bg-blue-100 text-blue-700',
  credit: 'bg-purple-100 text-purple-700',
  phone_credit: 'bg-indigo-100 text-indigo-700',
  custom: 'bg-gray-200 text-gray-700',
}

const when = (d) => (d ? format(new Date(d), 'dd MMM yyyy') : '—')

/**
 * WhatsApp cannot be made to send by itself — a deep link only opens the chat
 * with the words already written, and a person taps send. That is WhatsApp's
 * rule, not a gap here, and it is why this is a button rather than a job that
 * runs overnight.
 */
const whatsAppLink = (phone, message) => {
  const msisdn = normaliseGhanaPhone(phone)
  if (!msisdn) return null
  const text = encodeURIComponent(message || '')
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  return mobile
    ? `https://wa.me/${msisdn}?text=${text}`
    : `https://web.whatsapp.com/send?phone=${msisdn}&text=${text}`
}

/** What a goodwill message is for, and the words that go with each. */
const PURPOSES = [
  {
    key: 'wish', label: 'Wish them well', icon: FiGift,
    hint: 'A birthday, a festival, a congratulations.',
    placeholder: 'e.g. Happy Birthday, or Merry Christmas',
  },
  {
    key: 'note', label: 'Tell them something', icon: FiBell,
    hint: 'Anything that is not money — a visit, a part that has come in.',
    placeholder: 'e.g. the installation visit on Friday',
  },
  {
    key: 'checkup', label: 'Check up on them', icon: FiHeart,
    hint: 'How is it working? Anything needing attention?',
    placeholder: 'e.g. the 300W panels fitted last month',
  },
]

function NewReminderModal({ onClose, kind = 'money' }) {
  const queryClient = useQueryClient()
  const goodwill = kind === 'goodwill'
  const [form, setForm] = useState({
    customer_name: '', customer_phone: '', about: '', due_date: '', amount: '',
  })
  const [purpose, setPurpose] = useState('wish')
  const [yearly, setYearly] = useState(false)
  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }))
  const chosen = PURPOSES.find((p) => p.key === purpose) || PURPOSES[0]

  const save = useMutation({
    mutationFn: () => createReminder({
      ...form,
      kind,
      ...(goodwill ? { purpose, yearly } : {}),
      amount: goodwill || form.amount === '' ? 0 : Number(form.amount),
      due_date: form.due_date || undefined,
    }),
    onSuccess: (res) => {
      toast.success(goodwill
        ? `${res.data.customer_name} is on the keeping-in-touch list.`
        : `Reminder set for ${res.data.customer_name}.`)
      queryClient.invalidateQueries({ queryKey: ['reminders'] })
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not save it'),
  })

  const numberOk = !form.customer_phone || !!normaliseGhanaPhone(form.customer_phone)
  const ready = form.customer_name.trim() && form.customer_phone.trim()
    && form.about.trim() && numberOk && (!yearly || form.due_date)
  const field = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400'

  return (
    <Modal isOpen onClose={onClose} title={goodwill ? 'Keep in touch' : 'Remind a customer'} size="md">
      <div className="p-5 space-y-4">
        {goodwill && (
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">What is this for?</label>
            <div className="grid grid-cols-3 gap-2">
              {PURPOSES.map((p) => {
                const Icon = p.icon
                return (
                  <button
                    key={p.key}
                    onClick={() => setPurpose(p.key)}
                    className={`px-2 py-2.5 rounded-xl border text-[11px] font-bold flex flex-col items-center gap-1 transition-colors ${
                      purpose === p.key
                        ? 'bg-orange-500 border-orange-500 text-white'
                        : 'bg-white border-gray-200 text-gray-600 hover:bg-orange-50'
                    }`}
                  >
                    <Icon size={15} />
                    {p.label}
                  </button>
                )
              })}
            </div>
            <p className="mt-1.5 text-[11px] text-gray-500">{chosen.hint}</p>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Customer *</label>
            <input value={form.customer_name} onChange={set('customer_name')}
              autoFocus placeholder="Name" className={field} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Phone *</label>
            <input value={form.customer_phone} onChange={set('customer_phone')}
              placeholder="0244…" className={field} />
            {form.customer_phone && !numberOk && (
              <p className="mt-1 text-[11px] text-red-600 font-semibold">
                That is not a Ghana number we can message.
              </p>
            )}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">
            {goodwill ? 'What to say *' : 'What about *'}
          </label>
          <input value={form.about} onChange={set('about')}
            placeholder={goodwill ? chosen.placeholder : 'e.g. balance on the inverter'}
            className={field} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          {!goodwill && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Amount <span className="font-normal text-gray-400">— if money is owed</span>
              </label>
              <input type="number" step="0.01" min="0" value={form.amount}
                onChange={set('amount')} placeholder="0.00" className={field} />
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              {goodwill ? 'On what day' : 'Remind on'}
              {goodwill && <span className="font-normal text-gray-400"> — optional</span>}
            </label>
            <input type="date" value={form.due_date} onChange={set('due_date')} className={field} />
          </div>
        </div>

        {goodwill && purpose === 'wish' && (
          <label className="flex items-start gap-2.5 text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-xl p-3 cursor-pointer">
            <input type="checkbox" checked={yearly} onChange={(e) => setYearly(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-orange-500" />
            <span>
              <span className="font-bold">Every year</span> — a birthday is not finished once
              it has been wished. Sending it keeps it on the list for next year rather than
              closing it.
              {yearly && !form.due_date && (
                <span className="block mt-1 font-semibold text-amber-700">
                  Set the day it falls on, or there is nothing to come round.
                </span>
              )}
            </span>
          </label>
        )}

        {!goodwill && (
          <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-xl p-3">
            Debts, layaways, credit agreements and phone instalments appear here on their
            own — you do not need to add those. This is for anything else.
          </p>
        )}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl font-semibold text-sm">
            Cancel
          </button>
          <button onClick={() => save.mutate()} disabled={!ready || save.isPending}
            className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold text-sm disabled:opacity-50">
            {save.isPending ? 'Saving…' : goodwill ? 'Add to the list' : 'Set the reminder'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default function Reminders() {
  const queryClient = useQueryClient()
  // Chasing money and keeping in touch are two jobs. Together, the kind thing
  // gets lost among the debts and never gets done.
  const [kind, setKind] = useState('money')
  const goodwill = kind === 'goodwill'
  const [within, setWithin] = useState(7)
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [reading, setReading] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['reminders', kind, within],
    queryFn: () => getReminders({ kind, within }).then((r) => r.data),
  })

  const rows = data?.reminders || []
  const summary = data?.summary || {}

  const logSent = useMutation({
    mutationFn: (payload) => logReminderSent(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] })
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not log it'),
  })

  const settle = useMutation({
    mutationFn: (id) => updateReminder(id, { status: 'done' }),
    onSuccess: () => {
      toast.success('Marked done.')
      queryClient.invalidateQueries({ queryKey: ['reminders'] })
    },
  })

  const remove = useMutation({
    mutationFn: (id) => deleteReminder(id),
    onSuccess: () => {
      toast.success('Deleted.')
      queryClient.invalidateQueries({ queryKey: ['reminders'] })
      setDeleting(null)
    },
  })

  /**
   * Text them, through Arkesel.
   *
   * The WhatsApp button below opens a chat and trusts somebody to press send.
   * This actually sends, and the log afterwards says what arrived rather than
   * what was prepared.
   */
  const [texting, setTexting] = useState(false)
  const [textingAll, setTextingAll] = useState(false)

  const { data: credits } = useQuery({
    queryKey: ['sms-balance'],
    queryFn: () => getSmsBalance().then((r) => r.data).catch(() => null),
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  const textThem = async (list) => {
    const able = list.filter((r) => r.can_message)
    if (able.length === 0) {
      toast.error('None of these have a number we can text.')
      return
    }
    const many = able.length > 1
    if (many) setTextingAll(true); else setTexting(able[0]._id)
    try {
      const res = await sendReminderSms({
        messages: able.map((r) => ({
          reminder_id: r.is_custom ? r._id : undefined,
          customer_name: r.customer_name,
          customer_phone: r.customer_phone,
          about: r.about,
          amount: r.amount,
          kind: r.kind,
          purpose: r.purpose,
          message: r.message,
        })),
      })
      const { sent = 0, failed = 0, results = [] } = res.data || {}
      if (sent > 0) toast.success(`Texted ${sent}${failed ? `, ${failed} did not go` : ''}.`)
      // Name the ones that failed — "3 did not go" without saying who is
      // something nobody can act on.
      results.filter((x) => !x.ok).slice(0, 4).forEach((x) => {
        toast.error(`${x.customer_name}: ${x.message}`, { duration: 7000 })
      })
      queryClient.invalidateQueries({ queryKey: ['reminders'] })
      queryClient.invalidateQueries({ queryKey: ['sms-balance'] })
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not send.', { duration: 8000 })
    } finally {
      setTexting(false)
      setTextingAll(false)
    }
  }

  /** Open the chat with the words ready, then write down that we did. */
  const send = (r) => {
    const link = whatsAppLink(r.customer_phone, r.message)
    if (!link) {
      toast.error(`${r.customer_phone || 'No number'} is not a number we can message.`)
      return
    }
    window.open(link, '_blank', 'noopener')
    logSent.mutate({
      reminder_id: r.is_custom ? r._id : undefined,
      customer_name: r.customer_name,
      customer_phone: r.customer_phone,
      about: r.about,
      amount: r.amount,
      channel: 'whatsapp',
    })
  }

  const copy = async (r) => {
    try {
      await navigator.clipboard.writeText(r.message)
      toast.success('Message copied — paste it into SMS or WhatsApp.')
    } catch {
      setReading(r)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reminders"
        subtitle={goodwill
          ? 'Customers worth a word that is not about money'
          : 'Who to chase, and what to say to them'}
        action={
          <div className="flex items-center gap-2">
            <RefreshButton keys={['reminders']} />
            <button onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold text-sm">
              <FiPlus /> {goodwill ? 'Keep in touch' : 'Remind someone'}
            </button>
          </div>
        }
      />

      {/* The two lists. Full width and large enough to hit on a phone, since
          this is the control the whole screen hangs off. */}
      <div className="grid grid-cols-2 gap-2 bg-gray-100 p-1 rounded-2xl">
        {[
          { key: 'money', label: 'Money owed', sub: 'Debts and instalments', icon: FiAlertCircle },
          { key: 'goodwill', label: 'Keeping in touch', sub: 'Wishes and check-ups', icon: FiHeart },
        ].map((t) => {
          const Icon = t.icon
          const on = kind === t.key
          return (
            <button
              key={t.key}
              onClick={() => { setKind(t.key); setWithin(t.key === 'goodwill' ? 30 : 7) }}
              className={`px-3 py-2.5 rounded-xl text-left transition-colors ${
                on ? 'bg-white shadow-sm' : 'hover:bg-gray-50'
              }`}
            >
              <span className={`flex items-center gap-1.5 text-sm font-bold ${
                on ? 'text-gray-900' : 'text-gray-500'
              }`}>
                <Icon size={14} className={on ? 'text-orange-500' : ''} />
                {t.label}
              </span>
              <span className="block text-[11px] text-gray-400">{t.sub}</span>
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-gray-100 rounded-2xl p-4">
          <p className="text-[11px] text-gray-500">{goodwill ? 'On the list' : 'To chase'}</p>
          <p className="text-xl font-black text-gray-900">{summary.total || 0}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4">
          <p className="text-[11px] text-gray-500">{goodwill ? 'Past their day' : 'Overdue'}</p>
          <p className={`text-xl font-black ${goodwill ? 'text-amber-600' : 'text-red-600'}`}>
            {summary.overdue || 0}
          </p>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4">
          <p className="text-[11px] text-gray-500">{goodwill ? 'Today' : 'Due today'}</p>
          <p className="text-xl font-black text-amber-600">{summary.today || 0}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4">
          <p className="text-[11px] text-gray-500">
            {goodwill ? 'Not heard from in a month' : 'Owed in total'}
          </p>
          <p className="text-xl font-black text-orange-600">
            {goodwill ? (summary.out_of_touch || 0) : formatCurrency(summary.owed || 0)}
          </p>
        </div>
      </div>

      {rows.some((r) => r.can_message) && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-gray-100 rounded-2xl px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900">
              Text everybody on this list
            </p>
            <p className="text-[11px] text-gray-500">
              {rows.filter((r) => r.can_message).length} with a number
              {rows.length - rows.filter((r) => r.can_message).length > 0
                && ` · ${rows.length - rows.filter((r) => r.can_message).length} have none`}
              {credits?.balance != null && ` · ${credits.balance} credits left`}
            </p>
          </div>
          <button
            onClick={() => textThem(rows)}
            disabled={textingAll}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-xl font-bold text-sm flex-shrink-0"
          >
            <FiZap size={14} /> {textingAll ? 'Sending…' : 'Text them all'}
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 text-sm">
        <span className="text-xs font-semibold text-gray-600">
          {goodwill ? 'Showing what comes up within' : 'Showing what is due within'}
        </span>
        <select value={within} onChange={(e) => setWithin(Number(e.target.value))}
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white">
          <option value={0}>today</option>
          <option value={3}>3 days</option>
          <option value={7}>a week</option>
          <option value={30}>a month</option>
          {/* A birthday is next March. Without a year's view most wishes
              would sit out of sight for most of the year. */}
          {goodwill && <option value={90}>3 months</option>}
          {goodwill && <option value={366}>the year ahead</option>}
        </select>
      </div>

      {summary.no_number > 0 && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
          <FiAlertCircle className="inline mr-1" size={13} />
          {summary.no_number} of these have no phone number saved, so they cannot be
          messaged. Add a number to the customer and they will appear properly.
        </p>
      )}

      {isLoading ? <LoadingSpinner /> : rows.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-2xl p-10 text-center">
          {goodwill ? <FiHeart className="mx-auto text-gray-300" size={34} />
            : <FiBell className="mx-auto text-gray-300" size={34} />}
          <p className="mt-2 text-sm text-gray-500">
            {goodwill
              ? 'Nobody on the list yet. Add a birthday, or someone worth checking up on.'
              : 'Nobody to chase. Everything is settled.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={`${r.source}-${r._id}`} className="bg-white border border-gray-100 rounded-2xl p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-black text-gray-900">{r.customer_name}</p>
                    <span className={`px-2 py-0.5 text-[11px] font-bold rounded-full ${
                      r.kind === 'goodwill'
                        ? PURPOSE_STYLES[r.purpose] || PURPOSE_STYLES.note
                        : SOURCE_STYLES[r.source]
                    }`}>
                      {r.kind === 'goodwill'
                        ? PURPOSE_LABELS[r.purpose] || PURPOSE_LABELS.note
                        : SOURCE_LABELS[r.source]}
                    </span>
                    {r.yearly && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-gray-400">
                        <FiRepeat size={10} /> every year
                      </span>
                    )}
                    <span className={`text-[11px] font-bold ${
                      r.days !== null && r.days < 0 ? 'text-red-600'
                        : r.days === 0 ? 'text-amber-600' : 'text-gray-500'
                    }`}>
                      {r.when}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 mt-0.5">
                    {r.about}
                    {r.due_date ? ` · ${when(r.due_date)}` : ''}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {r.customer_phone || <span className="text-amber-700 font-semibold">no number saved</span>}
                    {r.last_contacted && (
                      <span> · last reminded {when(r.last_contacted)}</span>
                    )}
                  </p>
                </div>

                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  {r.amount > 0 && (
                    <p className="text-lg font-black text-orange-600">{formatCurrency(r.amount)}</p>
                  )}
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => copy(r)}
                      title="Copy the message"
                      className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg">
                      <FiCopy size={14} />
                    </button>
                    {r.customer_phone && (
                      <a href={`tel:${r.customer_phone}`}
                        title="Call them"
                        className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg">
                        <FiPhone size={14} />
                      </a>
                    )}
                    <button onClick={() => textThem([r])}
                      disabled={!r.can_message || texting === r._id || textingAll}
                      title="Send it as a text message now"
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-orange-500 rounded-lg hover:bg-orange-600 disabled:opacity-40">
                      <FiSend size={13} /> {texting === r._id ? 'Sending…' : 'Text'}
                    </button>
                    <button onClick={() => send(r)} disabled={!r.can_message}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-40">
                      <FiMessageCircle size={13} /> WhatsApp
                    </button>
                    {r.is_custom && (
                      <>
                        <button onClick={() => settle.mutate(r._id)}
                          title="Done with this"
                          className="p-2 text-green-600 hover:bg-green-50 rounded-lg">
                          <FiCheck size={14} />
                        </button>
                        <button onClick={() => setDeleting(r)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg">
                          <FiTrash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {adding && <NewReminderModal kind={kind} onClose={() => setAdding(false)} />}

      {/* Where the clipboard is blocked, the words are shown to copy by hand. */}
      {reading && (
        <Modal isOpen onClose={() => setReading(null)} title={`Message for ${reading.customer_name}`} size="sm">
          <div className="p-5 space-y-3">
            <textarea readOnly value={reading.message} rows={8}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-mono" />
            <button onClick={() => setReading(null)}
              className="w-full py-2.5 border border-gray-200 rounded-xl font-semibold text-sm">
              Close
            </button>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => remove.mutate(deleting._id)}
        title="Delete this reminder?"
        message={`${deleting?.about} for ${deleting?.customer_name}.`}
        confirmText="Delete"
        danger
        loading={remove.isPending}
      />
    </div>
  )
}
