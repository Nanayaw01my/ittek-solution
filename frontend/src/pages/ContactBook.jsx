import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import {
  FiPlus, FiSearch, FiUsers, FiPhone, FiEdit2, FiSlash, FiGift, FiDownloadCloud,
} from 'react-icons/fi'
import {
  getContacts, getContactsSummary, createContact, updateContact, backfillContacts,
} from '../api/contacts'
import { formatCurrency, formatDate } from '../utils/helpers'
import { isOwner } from '../config/pageAccess'
import { displayGhanaPhone } from '../utils/phone'
import useAuthStore from '../store/authStore'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'
import Table from '../components/Table'
import StatCard from '../components/StatCard'
import RefreshButton from '../components/RefreshButton'

/**
 * The shop's customers, and how to reach them.
 *
 * The book already filled itself from the till — every number typed on a
 * sale lands here — but there was no screen for it and no way to put
 * somebody in by hand. So the people the shop most wants to keep in touch
 * with were the ones it could not add: the customer who rang and has not
 * bought yet, the old customer whose number arrived on paper, the site whose
 * quote is still out.
 *
 * Sending is left to Reminders, which already does it properly. This is the
 * book itself: who is in it, and getting people into it.
 */

function ContactForm({ contact, onSubmit, loading }) {
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: contact
      ? {
        name: contact.name || '',
        phone: displayGhanaPhone(contact.phone) || '',
        notes: contact.notes || '',
        birthday: contact.birthday ? String(contact.birthday).split('T')[0] : '',
      }
      : { name: '', phone: '', notes: '', birthday: '' },
  })

  const field = 'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500'

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Phone number *</label>
        <input
          {...register('phone', { required: 'Enter their number' })}
          disabled={!!contact}
          placeholder="0244 123 456"
          className={`${field} ${contact ? 'bg-gray-50 text-gray-500' : ''}`}
        />
        {/* The number is the one thing that identifies a person here, so it
            is not editable afterwards — changing it would silently become a
            different customer under the same name. */}
        {contact && (
          <p className="mt-1 text-xs text-gray-400">
            The number cannot be changed. Add them again under the new one.
          </p>
        )}
        {errors.phone && <p className="mt-1 text-xs text-red-500">{errors.phone.message}</p>}
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Name</label>
        <input {...register('name')} placeholder="Abena Serwaa" className={field} />
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">
          Birthday <span className="font-normal text-gray-400">(optional)</span>
        </label>
        <input type="date" {...register('birthday')} className={field} />
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">
          Notes <span className="font-normal text-gray-400">(optional)</span>
        </label>
        <textarea
          {...register('notes')}
          rows={2}
          placeholder="Where you know them from, what they asked about…"
          className={`${field} resize-none`}
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold rounded-xl text-sm transition-colors"
      >
        {loading ? 'Saving…' : contact ? 'Save' : 'Add to the book'}
      </button>
    </form>
  )
}

export default function ContactBook() {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const owner = isOwner(user?.role)

  const [q, setQ] = useState('')
  const [sort, setSort] = useState('last_seen')
  const [page, setPage] = useState(1)
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState(null)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['contacts', q, sort, page],
    queryFn: () => getContacts({ q: q || undefined, sort, page, limit: 25 }).then(r => r.data),
  })
  const { data: summary } = useQuery({
    queryKey: ['contacts-summary'],
    queryFn: () => getContactsSummary().then(r => r.data),
  })

  const contacts = Array.isArray(data?.contacts) ? data.contacts : []
  // A list that never arrived is not an empty book, and must not read as one.
  const brokeDown = !isLoading && (!!error || (data !== undefined && !Array.isArray(data?.contacts)))

  const done = (msg) => {
    toast.success(msg)
    queryClient.invalidateQueries({ queryKey: ['contacts'] })
    queryClient.invalidateQueries({ queryKey: ['contacts-summary'] })
  }

  const addMutation = useMutation({
    mutationFn: createContact,
    onSuccess: (res) => {
      // The server says whether this was new or somebody already known, which
      // is worth repeating — otherwise adding a duplicate looks like it did
      // nothing at all.
      done(res.data?.created === false ? 'Already in the book — details saved.' : 'Added to the book.')
      setShowAdd(false)
    },
    onError: err => toast.error(err.response?.data?.message || 'Could not save them'),
  })

  const editMutation = useMutation({
    mutationFn: ({ id, body }) => updateContact(id, body),
    onSuccess: () => { done('Saved.'); setEditing(null) },
    onError: err => toast.error(err.response?.data?.message || 'Could not save'),
  })

  const fillMutation = useMutation({
    mutationFn: backfillContacts,
    onSuccess: (res) => done(res.data?.message || 'Gathered.'),
    onError: err => toast.error(err.response?.data?.message || 'Could not gather them'),
  })

  const columns = [
    {
      header: 'Customer',
      key: 'name',
      render: (v, row) => (
        <div className="min-w-0">
          <p className="font-semibold text-gray-800 truncate">{v || 'No name yet'}</p>
          {/* Stored as 233…, shown as it is written and dialled here. */}
          <p className="text-xs text-gray-400 font-mono">{displayGhanaPhone(row.phone)}</p>
        </div>
      ),
    },
    {
      header: 'Last seen',
      key: 'last_seen',
      render: (v, row) => (
        <div>
          <p className="text-sm text-gray-600">{row.visits > 0 ? formatDate(v) : '—'}</p>
          <p className="text-[11px] text-gray-400">
            {row.visits > 0
              ? `${row.visits} visit${row.visits === 1 ? '' : 's'}`
              : 'added by hand'}
          </p>
        </div>
      ),
    },
    {
      header: 'Spent',
      key: 'total_spent',
      render: v => <span className="text-sm text-gray-700">{v > 0 ? formatCurrency(v) : '—'}</span>,
    },
    {
      header: 'Birthday',
      key: 'birthday',
      render: (v, row) => (v ? (
        <span className="text-sm text-gray-600 flex items-center gap-1">
          <FiGift size={12} className="text-orange-400" />
          {formatDate(v)}
          {row.birthday_in === 0 && <span className="text-orange-600 font-bold">today</span>}
        </span>
      ) : <span className="text-gray-300">—</span>),
    },
    {
      header: '',
      key: '_id',
      render: (id, row) => (
        <div className="flex items-center gap-1 justify-end">
          {row.do_not_contact && (
            <span
              title="Asked not to be contacted"
              className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-200 text-gray-600 text-[10px] font-bold"
            >
              <FiSlash size={10} /> NO TEXTS
            </span>
          )}
          <button
            onClick={e => { e.stopPropagation(); setEditing(row) }}
            title="Edit"
            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"
          >
            <FiEdit2 size={14} />
          </button>
        </div>
      ),
    },
  ]

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <PageHeader
        title="Contact Book"
        subtitle="Every customer number the shop can reach"
        action={
          <div className="flex gap-2">
            <RefreshButton keys={['contacts', 'contacts-summary']} />
            {owner && (
              <button
                onClick={() => fillMutation.mutate()}
                disabled={fillMutation.isPending}
                title="Gather numbers from past sales into the book"
                className="flex items-center gap-2 px-4 py-2 border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 rounded-xl font-semibold text-sm disabled:opacity-60"
              >
                <FiDownloadCloud size={15} />
                {fillMutation.isPending ? 'Gathering…' : 'From past sales'}
              </button>
            )}
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-semibold text-sm"
            >
              <FiPlus size={16} /> Add customer
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
        <StatCard icon={FiUsers} value={summary?.total ?? '—'} label="In the book" color="orange" />
        <StatCard icon={FiPhone} value={summary?.contactable ?? '—'} label="Can be texted" color="green" />
        <StatCard icon={FiGift} value={summary?.birthdays_this_month ?? '—'} label="Birthdays this month" color="blue" />
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            value={q}
            onChange={e => { setQ(e.target.value); setPage(1) }}
            placeholder="Search by name or number…"
            className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
        <select
          value={sort}
          onChange={e => { setSort(e.target.value); setPage(1) }}
          className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
        >
          <option value="last_seen">Most recent</option>
          <option value="name">By name</option>
          <option value="visits">Most visits</option>
          <option value="spent">Biggest spenders</option>
        </select>
      </div>

      {brokeDown && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800">
          <p className="font-semibold">The customer list did not load.</p>
          <p className="mt-0.5 text-xs">
            {error?.response?.data?.message
              || error?.message
              || 'The server sent back something that is not a list of customers.'}
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
        data={contacts}
        loading={isLoading}
        emptyMessage={q ? `Nobody matches “${q}”` : 'Nobody in the book yet — add your first customer'}
        pagination={data?.pagination}
        onPageChange={setPage}
      />

      <p className="mt-3 text-xs text-gray-400">
        Numbers typed at the till are saved here on their own. To send these
        customers a message, go to Reminders.
      </p>

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add customer" size="md">
        <ContactForm loading={addMutation.isPending} onSubmit={d => addMutation.mutate(d)} />
      </Modal>

      <Modal isOpen={!!editing} onClose={() => setEditing(null)} title="Edit customer" size="md">
        {editing && (
          <>
            <ContactForm
              contact={editing}
              loading={editMutation.isPending}
              onSubmit={d => editMutation.mutate({
                id: editing._id,
                body: { name: d.name, notes: d.notes, birthday: d.birthday || null },
              })}
            />
            <div className="px-5 pb-5">
              <button
                onClick={() => editMutation.mutate({
                  id: editing._id,
                  body: { do_not_contact: !editing.do_not_contact },
                })}
                className="w-full py-2.5 border border-gray-200 rounded-xl font-semibold text-sm text-gray-600 hover:bg-gray-50"
              >
                {editing.do_not_contact
                  ? 'Allow texts to this customer again'
                  : 'Stop texting this customer'}
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}
