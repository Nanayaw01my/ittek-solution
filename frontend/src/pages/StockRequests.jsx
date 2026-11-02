import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, useFieldArray } from 'react-hook-form'
import toast from 'react-hot-toast'
import { FiPlus, FiTrash2, FiCheck, FiX, FiEye } from 'react-icons/fi'
import { getStockRequests, createStockRequest, approveStockRequest, rejectStockRequest } from '../api/stockRequests'
import { formatCurrency, formatDate, getRoleLevel } from '../utils/helpers'
import useAuthStore from '../store/authStore'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'
import Table from '../components/Table'
import Badge from '../components/Badge'
import ConfirmDialog from '../components/ConfirmDialog'
import ProductPicker from '../components/ProductPicker'

/** One empty line of a request. */
const BLANK_LINE = {
  product: '', productName: '', isNew: false, newName: '',
  quantity: 1,
}

function CreateRequestModal({ isOpen, onClose }) {
  const queryClient = useQueryClient()
  /**
   * No list of products is fetched here any more.
   *
   * It used to ask for `{ limit: 200 }` and fill a dropdown from the
   * result. The server honours that limit and sorts by name, so in a shop
   * with more than two hundred products everything after the two hundredth
   * was simply absent from the dropdown — present in the catalogue, missing
   * from the one screen where somebody is trying to reorder it. ProductPicker
   * searches the server instead, which has no such edge.
   */

  const { register, handleSubmit, control, watch, setValue, formState: { errors } } = useForm({
    defaultValues: { items: [BLANK_LINE], notes: '' }
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'items' })
  // The picker hands back a whole product; the form holds its id and its
  // name, so nothing downstream has to look the name up in a list that is
  // no longer fetched.
  const choose = (index, product) => {
    setValue(`items.${index}.product`, product?._id || '')
    setValue(`items.${index}.productName`, product?.name || '')
  }
  const items = watch('items')


  /**
   * The form works in product ids; the server stores a line of a request —
   * a name, a quantity and a cost. Sending the form's own shape straight up
   * was silently rejected by the database for having no product_name, and
   * every request came back as "Server error".
   */
  const submit = (d) => {
    const lines = (d.items || [])
      // A new item has a typed name instead of a chosen product, so either
      // one makes the line real.
      .filter((i) => (i.isNew ? String(i.newName || '').trim() : i.product) && Number(i.quantity) > 0)
      .map((i) => {
        const line = {
          product_name: i.isNew ? String(i.newName).trim() : (i.productName || 'Unknown product'),
          quantity_requested: Number(i.quantity) || 0,
          is_new_product: !!i.isNew,
        }
        if (!i.isNew) line.product_id = i.product
        return line
      })

    if (lines.length === 0) {
      toast.error('Pick a product — or press "Type a new item" and name it — and give a quantity')
      return
    }
    mutation.mutate({ items: lines, notes: d.notes || undefined })
  }

  const mutation = useMutation({
    mutationFn: createStockRequest,
    onSuccess: () => {
      toast.success('Stock request submitted!')
      queryClient.invalidateQueries(['stock-requests'])
      onClose()
    },
    onError: err => toast.error(err.response?.data?.message || 'Failed to submit'),
  })

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create Stock Request" size="xl">
      <form onSubmit={handleSubmit(submit)} className="p-5 space-y-4">
        <div className="space-y-3">
          {fields.map((field, index) => (
            <div key={field.id} className="grid grid-cols-12 gap-2 items-center">
              <div className="col-span-5">
                {items?.[index]?.isNew ? (
                  <input
                    type="text"
                    placeholder="Name of the new item"
                    {...register(`items.${index}.newName`)}
                    className="w-full px-3 py-2 border border-amber-300 bg-amber-50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                ) : (
                  <ProductPicker
                    value={items?.[index]?.product
                      ? { _id: items[index].product, name: items[index].productName }
                      : null}
                    onChange={(p) => choose(index, p)}
                  />
                )}
                {/* Something the shop has never sold still has to be askable
                    for. Only an owner can create a product, so approving the
                    request is what adds it.

                    A button, not the tick-box this used to be: the box was
                    small, grey and below the field, and the people who need
                    it are the ones who have just failed to find their item
                    in the list. */}
                <button
                  type="button"
                  onClick={() => {
                    const on = !items?.[index]?.isNew
                    setValue(`items.${index}.isNew`, on)
                    // Leaving the old choice behind would submit a line that
                    // is both a product and a new item.
                    if (on) choose(index, null)
                    else setValue(`items.${index}.newName`, '')
                  }}
                  className={`mt-1 text-[11px] font-semibold rounded-lg px-2 py-1 border ${
                    items?.[index]?.isNew
                      ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {items?.[index]?.isNew ? '← Pick from our products instead' : '+ Type a new item (not in our products)'}
                </button>
              </div>
              {/* Quantity, and that is the whole of it.
                  There were two more boxes here: an estimated cost on every
                  line and a selling price on every new one. They were three
                  fields of guesswork between noticing an empty shelf and
                  saying so, and once attendants could raise requests they
                  were asking people to type figures the system takes care
                  never to show them. What something costs is looked up from
                  the shop's own record; what a new item should sell for is
                  named by the owner at the moment they decide to buy it. */}
              <div className="col-span-6">
                <input
                  type="number"
                  min="1"
                  placeholder="How many?"
                  {...register(`items.${index}.quantity`, { required: true, min: 1 })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div className="col-span-1 flex justify-center">
                {/* Always offered, including on the only line. It used to be
                    hidden whenever one line was left, so a request begun by
                    mistake could not be cleared without closing the whole
                    window; now the last line empties itself instead. */}
                <button
                  type="button"
                  title="Remove this line"
                  onClick={() => (fields.length > 1
                    ? remove(index)
                    : (Object.entries(BLANK_LINE).forEach(([k, v]) => setValue(`items.0.${k}`, v))))}
                  className="text-red-400 hover:text-red-600 p-1"
                >
                  <FiTrash2 size={14} />
                </button>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={() => append(BLANK_LINE)}
            className="flex items-center gap-2 text-sm text-orange-600 hover:text-orange-700 font-semibold"
          >
            <FiPlus size={14} /> Add Item
          </button>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Notes</label>
          <textarea
            {...register('notes')}
            rows={3}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
            placeholder="Additional notes..."
          />
        </div>


        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-3 border border-gray-200 text-gray-700 rounded-xl font-semibold text-sm">
            Cancel
          </button>
          <button type="submit" disabled={mutation.isPending} className="flex-1 py-3 bg-orange-500 text-white rounded-xl font-bold text-sm disabled:opacity-60">
            {mutation.isPending ? 'Submitting...' : 'Submit Request'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default function StockRequests() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const userLevel = getRoleLevel(user?.role)
  const canApprove = userLevel >= 3

  const [statusFilter, setStatusFilter] = useState('all')
  const [showCreate, setShowCreate] = useState(false)
  const [approveTarget, setApproveTarget] = useState(null)
  const [rejectTarget, setRejectTarget] = useState(null)
  const [viewing, setViewing] = useState(null)
  /**
   * The quantities being approved, edited in the window that shows the
   * request.
   *
   * They were editable all along — on a second screen, reached by pressing
   * Approve. Nothing on the first screen said so, and a column headed QTY
   * with a plain number in it reads as settled, so the owner saw a request
   * for one of each and a button that looked like it would approve exactly
   * that. A step nobody knows is there is a step that does not exist.
   */
  const [viewQty, setViewQty] = useState([])
  /**
   * The money, which is the owner's to decide and nobody else's.
   *
   * The requester no longer types a cost or a selling price — a sales
   * attendant is shown no cost price anywhere else in the system, and
   * asking them to invent one here was both a leak and a guess. For
   * something already stocked the cost comes from the shop's own record
   * and is prefilled below; for a new item there is nothing to prefill,
   * and the owner names both figures at the moment they decide to buy.
   */
  const [viewCost, setViewCost] = useState([])
  const [viewPrice, setViewPrice] = useState([])
  const openView = (row) => {
    setViewQty((row.items || []).map(i => String(i.quantity_requested ?? '')))
    setViewCost((row.items || []).map(i => (i.estimated_cost ? String(i.estimated_cost) : '')))
    setViewPrice((row.items || []).map(i => (i.selling_price ? String(i.selling_price) : '')))
    setViewing(row)
  }
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['stock-requests', statusFilter, page],
    queryFn: () => getStockRequests({
      status: statusFilter !== 'all' ? statusFilter : undefined,
      page,
      limit: 15,
    }).then(r => r.data),
  })

  // What the owner is actually approving, line by line. Starts at what was
  // asked for, so approving unchanged is still one click.
  const [approveQty, setApproveQty] = useState([])

  const openApprove = (row) => {
    setApproveQty((row.items || []).map(i => String(i.quantity_requested ?? '')))
    setApproveTarget(row)
  }

  const approveMutation = useMutation({
    mutationFn: ({ id, quantities }) => approveStockRequest(id, { quantities }),
    onSuccess: () => {
      toast.success('Request approved!')
      queryClient.invalidateQueries(['stock-requests'])
      queryClient.invalidateQueries(['products'])
      setApproveTarget(null)
      setApproveQty([])
      // Approving can now happen from the detail window too, so that one
      // has to close as well — otherwise it sits there still showing the
      // request as pending.
      setViewing(null)
      setViewQty([])
    },
    onError: err => toast.error(err.response?.data?.message || 'Approval failed'),
  })

  const rejectMutation = useMutation({
    mutationFn: (id) => rejectStockRequest(id, {}),
    onSuccess: () => {
      toast.success('Request rejected')
      queryClient.invalidateQueries(['stock-requests'])
      setRejectTarget(null)
    },
    onError: err => toast.error(err.response?.data?.message || 'Rejection failed'),
  })

  const requests = Array.isArray(data?.requests) ? data.requests
    : Array.isArray(data?.stockRequests) ? data.stockRequests
    : (Array.isArray(data) ? data : [])

  // These read the record's own field names. They used to be camelCase —
  // totalAmount, requestedBy, productName — none of which exist on a stock
  // request, so Est. Total sat at GH0.00 on every row, Created By showed a
  // dash, and the product names never appeared at all.
  const columns = [
    {
      header: 'Request',
      key: 'items',
      render: (items) => (
        <div>
          <p className="font-semibold text-gray-800 flex items-center gap-1.5">
            {items?.length || 0} item(s)
            {/* Approving can be done from this row without opening the
                request, so the row has to say when saying yes also puts a
                new product on the list. */}
            {(items || []).some(i => i.is_new_product) && (
              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-bold">
                {(items || []).filter(i => i.is_new_product).length} NEW
              </span>
            )}
          </p>
          <p className="text-xs text-gray-500 line-clamp-1">
            {(items || []).map(i => i.product_name).filter(Boolean).join(', ') || '—'}
          </p>
        </div>
      ),
    },
    // The server sends no figures to anyone but an owner, so the column
    // would be a row of GH0.00 for everybody else.
    ...(canApprove
      ? [{ header: 'Est. Total', key: 'total_amount', render: (v) => formatCurrency(v || 0) }]
      : []),
    { header: 'Created By', key: 'created_by', render: v => v?.username || '—' },
    { header: 'Date', key: 'request_date', render: (v, row) => formatDate(v || row.createdAt) },
    { header: 'Status', key: 'status', render: v => <Badge status={v} /> },
    {
      header: 'Actions',
      key: '_id',
      render: (id, row) => (
        <div className="flex gap-2">
          <button
            onClick={e => { e.stopPropagation(); openView(row) }}
            className="p-1.5 text-gray-600 hover:bg-gray-100 rounded-lg"
            title="View the request"
          >
            <FiEye size={15} />
          </button>
          {canApprove && row.status === 'pending' && (
            <>
            <button
              onClick={e => { e.stopPropagation(); openApprove(row) }}
              className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg"
              title="Approve"
            >
              <FiCheck size={15} />
            </button>
            <button
              onClick={e => { e.stopPropagation(); setRejectTarget(row) }}
              className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
              title="Reject"
            >
              <FiX size={15} />
            </button>
            </>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <PageHeader
        title="Stock Requests"
        subtitle="Request and manage inventory restocking"
        action={
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-semibold text-sm"
          >
            <FiPlus size={16} /> New Request
          </button>
        }
      />

      {/* Status tabs */}
      <div className="flex flex-wrap gap-1 mb-5 bg-gray-100 p-1 rounded-xl w-fit">
        {['all', 'pending', 'approved', 'rejected'].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold capitalize transition-colors
              ${statusFilter === s ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-600 hover:text-gray-800'}`}
          >
            {s}
          </button>
        ))}
      </div>

      <Table
        columns={columns}
        data={requests}
        loading={isLoading}
        emptyMessage="No stock requests found"
        pagination={data?.pagination}
        onPageChange={setPage}
      />

      <CreateRequestModal isOpen={showCreate} onClose={() => setShowCreate(false)} />

      {/* What was actually asked for. The list can only show a count and a
          total; deciding whether to approve needs the lines themselves. */}
      {viewing && (
        <Modal isOpen onClose={() => { setViewing(null); setViewQty([]) }} title="Stock Request" size="md">
          <div className="p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-gray-900">
                  {viewing.created_by?.username || 'Unknown'} asked for {viewing.items?.length || 0} item(s)
                </p>
                <p className="text-xs text-gray-500">
                  {formatDate(viewing.request_date || viewing.createdAt)}
                </p>
              </div>
              <Badge status={viewing.status} />
            </div>

            {canApprove && viewing.status === 'pending' && (
              <p className="text-xs text-gray-600 bg-orange-50 border border-orange-200 rounded-xl px-3 py-2">
                You decide the quantity. Change any number below before approving —
                set a line to <strong>0</strong> to leave it out altogether.
              </p>
            )}

            <div className="border border-gray-100 rounded-xl overflow-hidden">
              <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-gray-50 text-[11px] font-bold text-gray-500">
                <span className="col-span-6">PRODUCT</span>
                <span className="col-span-2 text-center">
                  {canApprove && viewing.status === 'pending' ? 'APPROVE' : 'QTY'}
                </span>
                <span className="col-span-2 text-right">EACH</span>
                <span className="col-span-2 text-right">
                  {canApprove && viewing.status === 'pending' ? 'SELLS / TOTAL' : 'TOTAL'}
                </span>
              </div>
              {(viewing.items || []).map((i, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 px-3 py-2 border-t text-sm">
                  <span className="col-span-6 min-w-0">
                    <span className="block truncate">{i.product_name}</span>
                    {/* The owner is told which lines they are also agreeing to
                        add to the products list, and what it will sell for —
                        on its own line, because the price is the part they are
                        judging and it was being cut off beside the name. */}
                    {i.is_new_product && (
                      <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-bold whitespace-nowrap">
                        NEW{i.selling_price ? ` · sells ${formatCurrency(i.selling_price)}` : ''}
                      </span>
                    )}
                  </span>
                  <span className="col-span-2 text-center">
                    {canApprove && viewing.status === 'pending' ? (
                      // Prefilled with what was asked for, so approving in
                      // full stays one tap. The number asked for is kept
                      // under it, so changing it never loses the record of
                      // what the shop floor said it needed.
                      <>
                        <input
                          type="number" min="0" step="1" inputMode="numeric"
                          aria-label={`Quantity to approve for ${i.product_name}`}
                          value={viewQty[idx] ?? ''}
                          onChange={e => setViewQty(q => {
                            const next = [...q]; next[idx] = e.target.value; return next
                          })}
                          className="w-full px-1.5 py-1.5 border border-gray-300 rounded-lg text-sm
                                     text-center font-bold focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                        {String(viewQty[idx] ?? '') !== String(i.quantity_requested ?? '') && (
                          <span className="block text-[10px] text-gray-400 mt-0.5">
                            asked {i.quantity_requested}
                          </span>
                        )}
                      </>
                    ) : (
                      /* Approved at something other than what was asked: both
                         numbers are shown, because the request is the record
                         of what the shop floor said it needed. */
                      i.quantity_approved !== undefined && i.quantity_approved !== null
                        && i.quantity_approved !== i.quantity_requested
                        ? <>
                            <span className="line-through text-gray-400">{i.quantity_requested}</span>
                            <span className="ml-1 font-bold text-gray-800">{i.quantity_approved}</span>
                          </>
                        : i.quantity_requested
                    )}
                  </span>
                  <span className="col-span-2 text-right text-gray-600">
                    {canApprove && viewing.status === 'pending' ? (
                      <input
                        type="number" min="0" step="0.01" inputMode="decimal"
                        aria-label={`Cost per unit for ${i.product_name}`}
                        placeholder={i.is_new_product ? 'cost' : '—'}
                        value={viewCost[idx] ?? ''}
                        onChange={e => setViewCost(c => {
                          const next = [...c]; next[idx] = e.target.value; return next
                        })}
                        className="w-full px-1.5 py-1.5 border border-gray-300 rounded-lg text-sm
                                   text-right focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    ) : (i.estimated_cost ? formatCurrency(i.estimated_cost) : '—')}
                  </span>
                  <span className="col-span-2 text-right font-semibold">
                    {canApprove && viewing.status === 'pending' ? (
                      i.is_new_product ? (
                        /* A new item cannot go on the shelf without a price
                           to sell it at, and this is the moment it is being
                           put there. */
                        <input
                          type="number" min="0" step="0.01" inputMode="decimal"
                          aria-label={`Selling price for ${i.product_name}`}
                          placeholder="sells for"
                          value={viewPrice[idx] ?? ''}
                          onChange={e => setViewPrice(pr => {
                            const next = [...pr]; next[idx] = e.target.value; return next
                          })}
                          className="w-full px-1.5 py-1.5 border border-amber-300 bg-amber-50 rounded-lg
                                     text-sm text-right focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                      ) : (
                        <span className="text-gray-500">
                          {formatCurrency((Number(viewCost[idx]) || 0) * (Number(viewQty[idx]) || 0))}
                        </span>
                      )
                    ) : (i.total ? formatCurrency(i.total) : '—')}
                  </span>
                </div>
              ))}
            </div>

            {canApprove && viewing.status === 'pending'
              && (viewing.items || []).some((i, idx) => i.is_new_product && !Number(viewPrice[idx])) && (
              <p className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800">
                Give every NEW item a selling price before approving, or it goes onto the shelf
                priced at nothing.
              </p>
            )}

            {viewing.status === 'pending' && (viewing.items || []).some(i => i.is_new_product) && (
              <p className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
                Approving this also adds the items marked NEW to the products list,
                at zero stock. The quantity lands when the goods are received.
              </p>
            )}

            <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 flex justify-between items-center">
              <span className="text-sm font-semibold text-orange-800">Estimated total</span>
              <span className="text-xl font-black text-orange-900">
                {formatCurrency(viewing.total_amount || 0)}
              </span>
            </div>

            {viewing.notes && (
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-1">Notes</p>
                <p className="text-sm text-gray-700">{viewing.notes}</p>
              </div>
            )}

            {viewing.status === 'rejected' && viewing.rejected_reason && (
              <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
                Rejected: {viewing.rejected_reason}
              </p>
            )}
            {viewing.status === 'approved' && viewing.approved_by && (
              <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl p-3">
                Approved by {viewing.approved_by.username}
                {viewing.approved_date ? ` on ${formatDate(viewing.approved_date)}` : ''}
              </p>
            )}

            {canApprove && viewing.status === 'pending' ? (
              <div className="flex gap-2 pt-2 border-t">
                <button
                  onClick={() => { const r = viewing; setViewing(null); setRejectTarget(r) }}
                  className="flex-1 py-2.5 border border-red-200 text-red-600 rounded-xl font-bold text-sm hover:bg-red-50"
                >
                  Reject
                </button>
                <button
                  onClick={() => approveMutation.mutate({
                    id: viewing._id,
                    // An empty box means "as asked", not "none" — a blank
                    // sent as 0 would quietly approve nothing.
                    quantities: (viewing.items || []).map((i, idx) => {
                      const v = viewQty[idx]
                      return v === '' || v === undefined ? null : Number(v)
                    }),
                    // Blank means "leave it as it is", the same as a blank
                    // quantity does — not zero.
                    costs: (viewing.items || []).map((i, idx) => {
                      const v = viewCost[idx]
                      return v === '' || v === undefined ? null : Number(v)
                    }),
                    prices: (viewing.items || []).map((i, idx) => {
                      const v = viewPrice[idx]
                      return v === '' || v === undefined ? null : Number(v)
                    }),
                  })}
                  disabled={approveMutation.isPending}
                  className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-60
                             text-white rounded-xl font-bold text-sm"
                >
                  {approveMutation.isPending ? 'Approving…' : 'Approve'}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setViewing(null)}
                className="w-full py-2.5 border border-gray-200 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-50"
              >
                Close
              </button>
            )}
          </div>
        </Modal>
      )}

      {/* Approving is also deciding how many. The shop floor asks for ten
          and the office may buy six; the ask stays on the record as asked. */}
      <Modal
        isOpen={!!approveTarget}
        onClose={() => { setApproveTarget(null); setApproveQty([]) }}
        title="Approve Stock Request"
        size="lg"
      >
        {approveTarget && (
          <div className="p-5 space-y-4">
            <p className="text-sm text-gray-600">
              Change any quantity you are not buying in full. Set a line to 0 to leave it out.
            </p>

            <div className="border border-gray-100 rounded-xl overflow-hidden">
              <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-gray-50 text-[11px] font-bold text-gray-500">
                <span className="col-span-6">PRODUCT</span>
                <span className="col-span-2 text-center">ASKED</span>
                <span className="col-span-4 text-right">APPROVE</span>
              </div>
              {(approveTarget.items || []).map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 px-3 py-2 border-t items-center text-sm">
                  <span className="col-span-6 min-w-0">
                    <span className="block truncate">{item.product_name}</span>
                    {item.is_new_product && (
                      <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-bold">
                        NEW
                      </span>
                    )}
                  </span>
                  <span className="col-span-2 text-center text-gray-500">{item.quantity_requested}</span>
                  <span className="col-span-4">
                    <input
                      type="number" min="0" step="1"
                      value={approveQty[idx] ?? ''}
                      onChange={e => setApproveQty(q => {
                        const next = [...q]; next[idx] = e.target.value; return next
                      })}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </span>
                </div>
              ))}
            </div>

            {/* What it comes to at the quantities actually being approved. */}
            <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 flex justify-between items-center">
              <span className="text-sm font-semibold text-orange-800">Approving</span>
              <span className="text-xl font-black text-orange-900">
                {formatCurrency((approveTarget.items || []).reduce(
                  (sum, item, idx) => sum + (Number(approveQty[idx]) || 0) * (item.estimated_cost || 0), 0
                ))}
              </span>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => { setApproveTarget(null); setApproveQty([]) }}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl font-bold text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => approveMutation.mutate({
                  id: approveTarget._id,
                  quantities: approveQty.map(v => (v === '' ? null : Number(v))),
                })}
                disabled={approveMutation.isPending}
                className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white rounded-xl font-bold text-sm"
              >
                {approveMutation.isPending ? 'Approving…' : 'Approve'}
              </button>
            </div>
          </div>
        )}
      </Modal>
      <ConfirmDialog
        isOpen={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        onConfirm={() => rejectMutation.mutate(rejectTarget._id)}
        title="Reject Stock Request"
        message="Are you sure you want to reject this stock request?"
        confirmText="Reject"
        danger
        loading={rejectMutation.isPending}
      />
    </div>
  )
}
