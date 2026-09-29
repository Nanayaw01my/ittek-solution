import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, useFieldArray } from 'react-hook-form'
import toast from 'react-hot-toast'
import { FiPlus, FiTrash2, FiEye, FiCrosshair } from 'react-icons/fi'
import { getPurchases, createPurchase } from '../api/purchases'
import { getProducts, getSuppliers, getProductByBarcode } from '../api/products'
import { formatCurrency, formatDate } from '../utils/helpers'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'
import Table from '../components/Table'

function PurchaseForm({ onSubmit, loading }) {
  const { data: productsData } = useQuery({ queryKey: ['products-brief'], queryFn: () => getProducts({ limit: 300 }).then(r => r.data) })
  const { data: suppliersData } = useQuery({ queryKey: ['suppliers'], queryFn: () => getSuppliers().then(r => r.data) })

  const products = productsData?.products || (Array.isArray(productsData) ? productsData : [])
  const suppliers = suppliersData?.suppliers || (Array.isArray(suppliersData) ? suppliersData : [])

  const { register, handleSubmit, control, watch, setValue, formState: { errors } } = useForm({
    defaultValues: { items: [{ product: '', quantity: 1, unitCost: '' }] }
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'items' })
  const items = watch('items')

  const [scan, setScan] = useState('')
  const [scanBusy, setScanBusy] = useState(false)
  const [lastScan, setLastScan] = useState(null)

  /**
   * Receiving a delivery by scanning it in.
   *
   * Scanning the same thing again counts another one rather than starting a
   * second line — a delivery of twenty panels is twenty scans, not twenty
   * rows to tidy up afterwards. The cost comes in at what the product last
   * cost, so only a price that has actually changed needs typing.
   */
  const scanIn = async (code) => {
    const wanted = String(code || '').trim()
    if (!wanted) return
    setScan('')
    setScanBusy(true)
    try {
      const res = await getProductByBarcode(wanted)
      const p = res.data

      const at = items.findIndex((it) => it.product === p._id)
      if (at >= 0) {
        const now = (parseInt(items[at].quantity, 10) || 0) + 1
        setValue(`items.${at}.quantity`, now)
        setLastScan({ ok: true, text: `${p.name} — ${now}` })
      } else {
        // The first blank line is used before a new one is added, so a fresh
        // form does not end up with an empty row above the scanned goods.
        const blank = items.findIndex((it) => !it.product)
        const line = {
          product: p._id,
          quantity: 1,
          unitCost: p.cost_price != null ? String(p.cost_price) : '',
        }
        if (blank >= 0) {
          setValue(`items.${blank}.product`, line.product)
          setValue(`items.${blank}.quantity`, line.quantity)
          setValue(`items.${blank}.unitCost`, line.unitCost)
        } else {
          append(line)
        }
        setLastScan({ ok: true, text: `${p.name} — 1` })
      }
    } catch {
      setLastScan({
        ok: false,
        text: `Nothing matches ${wanted}. Add it as a product first, or pick it from the list.`,
      })
    } finally {
      setScanBusy(false)
    }
  }
  const total = items.reduce((s, i) => s + (parseFloat(i.unitCost || 0) * parseFloat(i.quantity || 0)), 0)

  const handleSubmitTransform = (d) => {
    onSubmit({
      supplier_id: d.supplier,
      notes: d.notes,
      items: d.items.map(item => ({
        product_id: item.product,
        quantity: parseInt(item.quantity),
        unit_cost: parseFloat(item.unitCost || 0),
      })),
    })
  }

  return (
    <form
      onSubmit={handleSubmit(handleSubmitTransform)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault()
      }}
      className="p-5 space-y-4"
    >
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">Supplier *</label>
        <select {...register('supplier', { required: 'Supplier required' })}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white">
          <option value="">Select Supplier</option>
          {suppliers.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
        </select>
        {errors.supplier && <p className="mt-1 text-xs text-red-500">{errors.supplier.message}</p>}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-semibold text-gray-700">Items *</label>
          <button type="button" onClick={() => append({ product: '', quantity: 1, unitCost: '' })}
            className="flex items-center gap-1 text-sm text-orange-600 font-semibold">
            <FiPlus size={13} /> Add Item
          </button>
        </div>
        {/* Scan the delivery in. A scanner types the code and presses Enter,
            so Enter here adds the item rather than submitting the form. */}
        <div className="mb-3">
          <div className="relative">
            <FiCrosshair className="absolute left-3 top-1/2 -translate-y-1/2 text-orange-400" size={15} />
            <input
              value={scan}
              onChange={(e) => setScan(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                e.preventDefault()
                scanIn(scan)
              }}
              placeholder={scanBusy ? 'Looking…' : 'Scan an item to add it…'}
              className="w-full pl-9 pr-3 py-2.5 border border-orange-200 bg-orange-50/40 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>
          {lastScan && (
            <p className={`mt-1 text-xs font-semibold ${lastScan.ok ? 'text-green-700' : 'text-red-600'}`}>
              {lastScan.text}
            </p>
          )}
          <p className="mt-1 text-[11px] text-gray-500">
            Scan the same thing twice and it counts two. The cost comes in at what it
            last cost — change it if the supplier's price has moved.
          </p>
        </div>

        <div className="space-y-2">
          {fields.map((field, i) => (
            <div key={field.id} className="grid grid-cols-12 gap-2 items-center">
              <div className="col-span-5">
                <select {...register(`items.${i}.product`, { required: true })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white">
                  <option value="">Product</option>
                  {products.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <input type="number" min="1" {...register(`items.${i}.quantity`, { required: true, min: 1 })}
                  className="w-full px-2 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="Qty" />
              </div>
              <div className="col-span-4">
                <input type="number" step="0.01" min="0"
                  {...register(`items.${i}.unitCost`, { required: true, min: 0.01 })}
                  className="w-full px-2 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="Unit cost (GH₵)" />
              </div>
              <div className="col-span-1 text-center">
                {fields.length > 1 && (
                  <button type="button" onClick={() => remove(i)} className="text-red-400 hover:text-red-600 p-1">
                    <FiTrash2 size={13} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">Notes</label>
        <textarea {...register('notes')} rows={2}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
          placeholder="Additional notes..." />
      </div>

      {total > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex justify-between items-center">
          <span className="font-semibold text-orange-800">Grand Total:</span>
          <span className="text-xl font-black text-orange-600">{formatCurrency(total)}</span>
        </div>
      )}

      <button type="submit" disabled={loading}
        className="w-full py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold rounded-xl text-sm">
        {loading ? 'Saving...' : 'Record Purchase'}
      </button>
    </form>
  )
}

export default function Purchases() {
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [viewPurchase, setViewPurchase] = useState(null)
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['purchases', page],
    queryFn: () => getPurchases({ page, limit: 15 }).then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: createPurchase,
    onSuccess: () => {
      toast.success('Purchase recorded! Stock updated.')
      queryClient.invalidateQueries(['purchases'])
      queryClient.invalidateQueries(['products'])
      setShowModal(false)
    },
    onError: err => toast.error(err.response?.data?.message || 'Failed to record purchase'),
  })

  const purchases = data?.purchases || (Array.isArray(data) ? data : [])

  const columns = [
    { header: 'Date', key: 'createdAt', render: v => formatDate(v) },
    { header: 'Supplier', key: 'supplier_id', render: v => v?.name || '—' },
    { header: 'Items', key: 'items', render: v => `${v?.length || 0} item(s)` },
    { header: 'Total Cost', key: 'total_amount', render: v => <span className="font-bold text-orange-600">{formatCurrency(v || 0)}</span> },
    { header: 'Recorded By', key: 'created_by', render: v => v?.username || '—' },
    {
      header: 'Actions',
      key: '_id',
      render: (id, row) => (
        <button onClick={e => { e.stopPropagation(); setViewPurchase(row) }}
          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg">
          <FiEye size={14} />
        </button>
      ),
    },
  ]

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <PageHeader
        title="Purchases"
        subtitle="Record stock purchases and update inventory"
        action={
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-semibold text-sm">
            <FiPlus size={16} /> Add Purchase
          </button>
        }
      />

      <Table
        columns={columns}
        data={purchases}
        loading={isLoading}
        emptyMessage="No purchases recorded"
        pagination={data?.pagination}
        onPageChange={setPage}
        onRowClick={setViewPurchase}
      />

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Record Purchase" size="xl">
        <PurchaseForm loading={createMutation.isPending} onSubmit={d => createMutation.mutate(d)} />
      </Modal>

      {/* View Purchase Modal */}
      <Modal isOpen={!!viewPurchase} onClose={() => setViewPurchase(null)} title="Purchase Details" size="lg">
        {viewPurchase && (
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-500">Date:</span> <span className="font-semibold">{formatDate(viewPurchase.createdAt)}</span></div>
              <div><span className="text-gray-500">Supplier:</span> <span className="font-semibold">{viewPurchase.supplier_id?.name || '—'}</span></div>
              <div><span className="text-gray-500">Recorded By:</span> <span className="font-semibold">{viewPurchase.created_by?.username || '—'}</span></div>
            </div>
            <div>
              <p className="text-sm font-bold text-gray-700 mb-2">Items</p>
              <div className="space-y-2">
                {viewPurchase.items?.map((item, i) => (
                  <div key={i} className="flex justify-between text-sm bg-gray-50 rounded-xl px-4 py-2">
                    <div>
                      <p className="font-semibold">{item.product_id?.name || item.product_name || '—'}</p>
                      <p className="text-xs text-gray-500">Qty: {item.quantity}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{formatCurrency(item.unit_cost || 0)}/unit</p>
                      <p className="font-black text-orange-600">{formatCurrency((item.quantity || 0) * (item.unit_cost || 0))}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex justify-between">
              <span className="font-bold text-orange-800">Total Cost:</span>
              <span className="text-xl font-black text-orange-600">{formatCurrency(viewPurchase.total_amount || 0)}</span>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
