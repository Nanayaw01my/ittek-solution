import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { FiPlus, FiEdit2, FiTrash2, FiPackage, FiUpload, FiRefreshCw, FiCopy, FiZap, FiCrosshair, FiX, FiCheck } from 'react-icons/fi'
import { getProducts, createProduct, updateProduct, deleteProduct, getCategories, getSuppliers, getProductSummary, generateBarcode, getProductByBarcode, commitStockCount } from '../api/products'
import { formatCurrency, getRoleLevel } from '../utils/helpers'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'
import Table from '../components/Table'
import ConfirmDialog from '../components/ConfirmDialog'
import Badge from '../components/Badge'
import ImageUpload from '../components/ImageUpload'
import VariantEditor from '../components/VariantEditor'
import useAuthStore from '../store/authStore'
import ProductImportModal from '../components/ProductImportModal'
import DuplicateProductsModal from '../components/DuplicateProductsModal'
import { getMe } from '../api/auth'
import { effectiveMode } from '../config/pageAccess'

/**
 * The form registers camelCase names but a product document is snake_case, so
 * handing the document straight to defaultValues left Cost Price, Selling
 * Price, Quantity, Low Stock, Category and Supplier blank on every edit — the
 * whole product had to be retyped, and anything missed was sent as NaN.
 *
 * category_id / supplier_id arrive either populated (an object) or as a bare
 * id, so both shapes are reduced to an id string for the <select>.
 */
const idOf = (v) => (v && typeof v === 'object' ? v._id : v) || ''

const toFormValues = (product) => {
  if (!product) return {}
  return {
    name: product.name ?? '',
    barcode: product.barcode ?? '',
    category: idOf(product.category_id),
    supplier: idOf(product.supplier_id),
    costPrice: product.cost_price ?? '',
    sellingPrice: product.selling_price ?? '',
    quantity: product.quantity ?? '',
    lowStockLevel: product.low_stock_level ?? '',
  }
}

function ProductForm({ product, categories = [], suppliers = [], onSubmit, loading, restricted = false, initialBarcode = '' }) {
  const [imageUrl, setImageUrl] = useState(product?.image_url || null)
  const [variants, setVariants] = useState(product?.variants || [])
  const [mintingBarcode, setMintingBarcode] = useState(false)
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm({
    // A scanned code that matched nothing opens this form already carrying it.
    defaultValues: product ? toFormValues(product) : { barcode: initialBarcode }
  })
  const costPrice = parseFloat(watch('costPrice') || 0)
  const sellingPrice = parseFloat(watch('sellingPrice') || 0)
  const margin = costPrice > 0 ? (((sellingPrice - costPrice) / costPrice) * 100).toFixed(1) : 0

  return (
    <form
      onSubmit={handleSubmit(data => onSubmit({ ...data, image_url: imageUrl || undefined, variants }))}
      /* A barcode scanner types the code and then presses Enter. Without this
         the Enter saves the product the moment the code lands — before the
         name and the prices have been typed. The Save button is the only way
         out of this form. */
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault()
      }}
      className="p-5 space-y-4"
    >
      <ImageUpload
        value={imageUrl}
        onChange={setImageUrl}
        folder="products"
        label="Product Image (optional)"
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-sm font-semibold text-gray-700 mb-1">Product Name *</label>
          <input
            {...register('name', { required: 'Name is required' })}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            placeholder="e.g. 200W Solar Panel"
          />
          {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Barcode</label>
          <div className="flex gap-2">
            <input
              {...register('barcode')}
              className="flex-1 min-w-0 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono"
              placeholder="Scan or type barcode"
            />
            {/* For stock that came without one — a bundle the shop made up, or
                a label that rubbed off. Overwriting a code already on a product
                would stop every label printed from it scanning, so it asks. */}
            <button
              type="button"
              onClick={async () => {
                const current = (watch('barcode') || '').trim()
                if (current && !window.confirm(
                  `This product already has barcode ${current}. Replace it? Labels already printed will stop working.`
                )) return
                setMintingBarcode(true)
                try {
                  const res = await generateBarcode()
                  setValue('barcode', res.data.barcode, { shouldDirty: true })
                  toast.success(`Barcode ${res.data.barcode} — save the product to keep it`)
                } catch (err) {
                  toast.error(err.response?.data?.message || 'Could not generate a barcode')
                } finally {
                  setMintingBarcode(false)
                }
              }}
              disabled={mintingBarcode}
              className="px-3 py-2.5 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-50 whitespace-nowrap disabled:opacity-50"
            >
              <FiZap className="inline mr-1" size={13} />
              {mintingBarcode ? 'Making…' : 'Generate'}
            </button>
          </div>
          <p className="mt-1 text-[11px] text-gray-500">
            Leave the supplier's barcode where there is one. Generate a code only for
            stock that came without.
          </p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Category {restricted && '*'}</label>
          <select
            {...register('category', restricted ? { required: 'Choose one of your categories' } : {})}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
          >
            <option value="">Select Category</option>
            {categories.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
          {errors.category && <p className="mt-1 text-xs text-red-500">{errors.category.message}</p>}
          {restricted && categories.length === 0 && (
            <p className="mt-1 text-xs text-red-500">
              No categories have been assigned to you yet. Ask the CEO to assign one.
            </p>
          )}
        </div>

        <div className={restricted ? 'hidden' : ''}>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Supplier</label>
          <select
            {...register('supplier')}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
          >
            <option value="">Select Supplier</option>
            {suppliers.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
          </select>
        </div>

        {/* Cost price is the profit-sensitive figure — inventory-only users
            never see or set it. An owner fills it in afterwards. */}
        <div className={restricted ? 'hidden' : ''}>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Cost Price (GH₵) *</label>
          <input
            type="number"
            step="0.01"
            min="0"
            {...register('costPrice', restricted ? {} : { required: 'Required', min: { value: 0, message: 'Must be positive' } })}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            placeholder="0.00"
          />
          {errors.costPrice && <p className="mt-1 text-xs text-red-500">{errors.costPrice.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Selling Price (GH₵) *</label>
          <input
            type="number"
            step="0.01"
            min="0"
            {...register('sellingPrice', { required: 'Required', min: { value: 0.01, message: 'Must be > 0' } })}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            placeholder="0.00"
          />
          {errors.sellingPrice && <p className="mt-1 text-xs text-red-500">{errors.sellingPrice.message}</p>}
        </div>

        {!restricted && sellingPrice > 0 && costPrice > 0 && (
          <div className="sm:col-span-2">
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold
              ${margin >= 20 ? 'bg-green-100 text-green-700' : margin >= 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
              Profit Margin: {margin}%
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Stock Quantity *</label>
          <input
            type="number"
            min="0"
            {...register('quantity', { required: 'Required' })}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            placeholder="0"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Low Stock Level</label>
          <input
            type="number"
            min="0"
            {...register('lowStockLevel')}
            defaultValue={5}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            placeholder="5"
          />
        </div>
      </div>

      {/* Variant rows carry cost and selling prices, so they are for owners. */}
      {!restricted && <VariantEditor variants={variants} onChange={setVariants} />}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold rounded-xl text-sm transition-colors"
        >
          {loading ? 'Saving...' : product ? 'Update Product' : 'Add Product'}
        </button>
      </div>
    </form>
  )
}

/** Quantity and low-stock level only — no prices anywhere on it. */
function StockAdjustForm({ product, onSubmit, loading }) {
  const { register, handleSubmit } = useForm({
    defaultValues: {
      quantity: product.quantity ?? 0,
      low_stock_level: product.low_stock_level ?? 5,
    },
  })

  return (
    <form
      onSubmit={handleSubmit(v => onSubmit({
        quantity: parseInt(v.quantity, 10) || 0,
        low_stock_level: parseInt(v.low_stock_level, 10) || 0,
      }))}
      className="p-5 space-y-4"
    >
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">Quantity in stock</label>
        <input
          type="number"
          min="0"
          autoFocus
          {...register('quantity')}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
      </div>
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">Low stock level</label>
        <input
          type="number"
          min="0"
          {...register('low_stock_level')}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold rounded-xl text-sm transition-colors"
      >
        {loading ? 'Saving...' : 'Save stock'}
      </button>
    </form>
  )
}

/**
 * A scanning session: receiving a delivery, or counting the shelf.
 *
 * Scans are tallied here and written in one go at the end. Saving each scan
 * as it happens means a stock-take that dies halfway leaves the shelf
 * half-corrected, with nobody able to say which half.
 */
function StockCountModal({ onClose }) {
  const queryClient = useQueryClient()
  const [mode, setMode] = useState('add')
  const [code, setCode] = useState('')
  const [lines, setLines] = useState([])
  const [busy, setBusy] = useState(false)
  const [lastMsg, setLastMsg] = useState(null)
  const boxRef = React.useRef(null)

  const scan = async (barcode) => {
    const wanted = barcode.trim()
    if (!wanted) return
    setCode('')

    // Already in the tally? Then this is the same item again — count it.
    const seen = lines.find((l) => l.barcode === wanted)
    if (seen) {
      setLines((prev) => prev.map((l) =>
        l.barcode === wanted ? { ...l, quantity: l.quantity + 1 } : l))
      setLastMsg({ ok: true, text: `${seen.name} — ${seen.quantity + 1}` })
      return
    }

    setBusy(true)
    try {
      const res = await getProductByBarcode(wanted)
      const p = res.data
      if (p.has_variants) {
        setLastMsg({ ok: false, text: `${p.name} has variants — count it by hand.` })
        return
      }
      setLines((prev) => [...prev, {
        product_id: p._id, name: p.name, barcode: wanted,
        on_hand: p.quantity ?? 0, quantity: 1,
      }])
      setLastMsg({ ok: true, text: `${p.name} — 1` })
    } catch {
      // An unknown code stops the session rather than being silently dropped.
      setLastMsg({ ok: false, text: `Nothing matches ${wanted}. Add it as a product first.` })
    } finally {
      setBusy(false)
      boxRef.current?.focus()
    }
  }

  const setQty = (barcode, v) => setLines((prev) => prev.map((l) =>
    l.barcode === barcode ? { ...l, quantity: Math.max(0, Number(v) || 0) } : l))
  const drop = (barcode) => setLines((prev) => prev.filter((l) => l.barcode !== barcode))

  const commit = useMutation({
    mutationFn: () => commitStockCount({
      mode,
      lines: lines.map((l) => ({ product_id: l.product_id, quantity: l.quantity })),
    }),
    onSuccess: (res) => {
      const d = res.data
      toast.success(
        mode === 'set'
          ? `Counted ${d.products} product${d.products === 1 ? '' : 's'}`
            + (d.units === 0 ? ' — the shelf matched.' : ` — ${d.units > 0 ? 'found' : 'missing'} ${Math.abs(d.units)}.`)
          : `Added ${d.units} item${d.units === 1 ? '' : 's'} across ${d.products} product${d.products === 1 ? '' : 's'}.`,
        { duration: 9000 }
      )
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['product-summary'] })
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not save the count'),
  })

  const units = lines.reduce((t, l) => t + l.quantity, 0)

  return (
    <Modal isOpen onClose={onClose} title="Scan stock in" size="lg">
      <div className="p-5 space-y-4">
        <div className="flex gap-2">
          {[['add', 'Receiving a delivery'], ['set', 'Counting the shelf']].map(([v, l]) => (
            <button key={v} type="button" onClick={() => setMode(v)}
              className={`flex-1 py-2.5 text-xs font-bold rounded-xl border ${
                mode === v ? 'bg-orange-500 text-white border-orange-500'
                  : 'bg-white text-gray-600 border-gray-200'}`}>
              {l}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-600">
          {mode === 'add'
            ? 'What you scan is added to what is already on the shelf.'
            : 'What you scan replaces the count — anything you do not scan stays as it is.'}
        </p>

        <input
          ref={boxRef} autoFocus value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); scan(code) } }}
          placeholder="Scan an item…"
          className="w-full px-3 py-3 border-2 border-orange-300 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-400"
        />
        {lastMsg && (
          <p className={`text-xs font-semibold ${lastMsg.ok ? 'text-green-700' : 'text-red-600'}`}>
            {busy ? 'Looking…' : lastMsg.text}
          </p>
        )}

        {lines.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-6">
            Nothing scanned yet. Scan the same item twice and it counts two.
          </p>
        ) : (
          <div className="border border-gray-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-[11px] uppercase text-gray-500 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 font-bold">Product</th>
                  <th className="text-right px-3 py-2 font-bold">On hand</th>
                  <th className="px-3 py-2 font-bold w-20">{mode === 'add' ? 'Adding' : 'Counted'}</th>
                  <th className="text-right px-3 py-2 font-bold">After</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {lines.map((l) => {
                  const after = mode === 'add' ? l.on_hand + l.quantity : l.quantity
                  const diff = after - l.on_hand
                  return (
                    <tr key={l.barcode}>
                      <td className="px-3 py-1.5">
                        <p className="font-semibold text-gray-900">{l.name}</p>
                        <p className="text-[11px] text-gray-400 font-mono">{l.barcode}</p>
                      </td>
                      <td className="px-3 py-1.5 text-right text-gray-600">{l.on_hand}</td>
                      <td className="px-3 py-1.5">
                        <input type="number" min="0" value={l.quantity}
                          onChange={(e) => setQty(l.barcode, e.target.value)}
                          className="w-full px-2 py-1 border border-gray-200 rounded-lg text-sm" />
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <span className="font-black text-gray-900">{after}</span>
                        {diff !== 0 && (
                          <span className={`ml-1 text-[11px] font-bold ${diff > 0 ? 'text-green-700' : 'text-red-600'}`}>
                            {diff > 0 ? `+${diff}` : diff}
                          </span>
                        )}
                      </td>
                      <td className="px-1">
                        <button type="button" onClick={() => drop(l.barcode)}
                          className="p-1 text-gray-400 hover:text-red-600"><FiX size={14} /></button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl font-semibold text-sm">
            Cancel
          </button>
          <button onClick={() => commit.mutate()} disabled={lines.length === 0 || commit.isPending}
            className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold text-sm disabled:opacity-50">
            <FiCheck className="inline mr-1" size={14} />
            {commit.isPending ? 'Saving…'
              : `Save ${lines.length} product${lines.length === 1 ? '' : 's'} (${units} item${units === 1 ? '' : 's'})`}
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default function Products() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [stockFilter, setStockFilter] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [editProduct, setEditProduct] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [stockTarget, setStockTarget] = useState(null)
  const [showImport, setShowImport] = useState(false)
  const [showDuplicates, setShowDuplicates] = useState(false)
  const [showCount, setShowCount] = useState(false)
  // A code scanned that matched nothing — the new-product form opens with it.
  const [newBarcode, setNewBarcode] = useState('')
  const [scanCode, setScanCode] = useState('')
  const [scanBusy, setScanBusy] = useState(false)
  const [page, setPage] = useState(1)

  const user = useAuthStore(s => s.user)
  // A Manager works inside the categories the CEO assigned them, and without
  // seeing what anything costs or sells for. The `view` flag tells the server
  // to apply that scope — the POS asks for products without it, so selling is
  // unaffected. The server strips the prices; this only hides the columns.
  // 'inventory' means the CEO granted this user the Products page in its
  // limited form: add products and correct stock, never see the money.
  const inventoryOnly = effectiveMode(user, 'products') === 'inventory'
  const userLevel = getRoleLevel(user?.role)

  // The stored user is only refreshed at login, so a manager assigned a
  // category mid-shift would see an empty picker until they logged out. Re-read
  // it here; the stored copy is the fallback when offline.
  const { data: meData } = useQuery({
    queryKey: ['me-assigned-categories'],
    queryFn: () => getMe().then(r => r.data),
    enabled: inventoryOnly,
    staleTime: 60_000,
    retry: false,
  })
  const assignedCategoryIds = (
    meData?.assigned_categories || user?.assigned_categories || []
  ).map(c => String(c?._id || c))

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['products', search, categoryFilter, stockFilter, page, inventoryOnly],
    queryFn: () => getProducts({
      search,
      category: categoryFilter || undefined,
      stockFilter: stockFilter !== 'all' ? stockFilter : undefined,
      ...(inventoryOnly ? { view: 'catalogue' } : {}),
      page,
      limit: 15,
    }).then(r => r.data),
  })

  // What the catalogue adds up to, under the same filters as the list — search
  // or pick a category and these follow it, rather than always describing the
  // whole shop.
  const { data: summary } = useQuery({
    queryKey: ['product-summary', search, categoryFilter, stockFilter, inventoryOnly],
    queryFn: () => getProductSummary({
      search,
      category: categoryFilter || undefined,
      ...(inventoryOnly ? { view: 'catalogue' } : {}),
    }).then(r => r.data),
  })

  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => getCategories().then(r => r.data),
  })

  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => getSuppliers().then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: createProduct,
    onSuccess: () => {
      toast.success('Product added!')
      queryClient.invalidateQueries(['products'])
      queryClient.invalidateQueries(['product-summary'])
      setShowModal(false)
    },
    onError: err => toast.error(err.response?.data?.message || 'Failed to add product'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateProduct(id, data),
    onSuccess: () => {
      toast.success('Product updated!')
      queryClient.invalidateQueries(['products'])
      queryClient.invalidateQueries(['product-summary'])
      setShowModal(false)
      setEditProduct(null)
      setStockTarget(null)
    },
    onError: err => toast.error(err.response?.data?.message || 'Failed to update'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteProduct(id),
    onSuccess: () => {
      toast.success('Product deleted')
      queryClient.invalidateQueries(['products'])
      queryClient.invalidateQueries(['product-summary'])
      setDeleteTarget(null)
    },
    onError: err => toast.error(err.response?.data?.message || 'Delete failed'),
  })

  /** Pull the list and its totals again — stock moves as other people sell. */
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['products'] })
    queryClient.invalidateQueries({ queryKey: ['product-summary'] })
    queryClient.invalidateQueries({ queryKey: ['categories'] })
    queryClient.invalidateQueries({ queryKey: ['suppliers'] })
  }

  const products = data?.products || data || []
  const allCategories = categoriesData?.categories || categoriesData || []
  const categories = inventoryOnly
    ? allCategories.filter(c => assignedCategoryIds.includes(String(c._id)))
    : allCategories
  const suppliers = suppliersData?.suppliers || suppliersData || []

  const columns = [
    {
      header: 'Product',
      key: 'name',
      render: (v, row) => (
        <div className="flex items-center gap-3">
          {row.image_url ? (
            <img src={row.image_url} alt={v} className="w-9 h-9 rounded-lg object-cover flex-shrink-0 border border-gray-100" />
          ) : (
            <div className="w-9 h-9 rounded-lg bg-orange-50 flex items-center justify-center flex-shrink-0">
              <FiPackage size={16} className="text-orange-400" />
            </div>
          )}
          <div>
            <p className="font-semibold text-gray-800">{v}</p>
            <p className="text-xs text-gray-400 font-mono">{row.barcode || '—'}</p>
          </div>
        </div>
      ),
    },
    { header: 'Category', key: 'category', render: (v) => v?.name || '—' },
    {
      header: 'Stock',
      key: 'quantity',
      render: (v, row) => (
        <span className={`font-bold ${v === 0 ? 'text-red-500' : v <= (row.lowStockLevel || 5) ? 'text-orange-500' : 'text-gray-700'}`}>
          {v}
        </span>
      ),
    },
    // Inventory-only users get one action: correct the count on the shelf.
    ...(inventoryOnly ? [{
      header: 'Stock',
      key: '_id',
      render: (id, row) => (
        <button
          onClick={e => { e.stopPropagation(); setStockTarget(row) }}
          className="px-3 py-1.5 text-xs font-semibold text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
        >
          Adjust
        </button>
      ),
    }] : [
    { header: 'Cost Price', key: 'cost_price', render: v => formatCurrency(v) },
    { header: 'Selling Price', key: 'selling_price', render: v => formatCurrency(v) },
    {
      header: 'Margin',
      key: 'cost_price',
      render: (cost, row) => {
        const margin = cost > 0 ? (((row.selling_price - cost) / cost) * 100).toFixed(1) : 0
        return (
          <span className={`text-sm font-bold ${margin >= 20 ? 'text-green-600' : margin >= 0 ? 'text-yellow-600' : 'text-red-600'}`}>
            {margin}%
          </span>
        )
      },
    },
    {
      header: 'Actions',
      key: '_id',
      render: (id, row) => (
        <div className="flex gap-2">
          <button
            onClick={e => { e.stopPropagation(); setEditProduct(row); setShowModal(true) }}
            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          >
            <FiEdit2 size={14} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); setDeleteTarget(row) }}
            className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
          >
            <FiTrash2 size={14} />
          </button>
        </div>
      ),
    },
    ]),
  ]

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Products"
        subtitle={inventoryOnly ? 'Add products to the categories assigned to you' : 'Manage your product catalog'}
        action={
          <div className="flex gap-2">
            <button
              onClick={refresh}
              disabled={isFetching}
              title="Refresh"
              className="flex items-center gap-2 px-3 py-2 border border-gray-200 hover:bg-gray-50 disabled:opacity-60 text-gray-700 rounded-xl font-semibold text-sm transition-colors"
            >
              <FiRefreshCw size={16} className={isFetching ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            {/* Importing creates products, so it follows the same rights as
                adding one — an inventory-only user gets it too. */}
            {!inventoryOnly && (
              <button
                onClick={() => setShowImport(true)}
                className="flex items-center gap-2 px-4 py-2 border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl font-semibold text-sm transition-colors"
              >
                <FiUpload size={16} /> Import
              </button>
            )}
            {/* Merging changes what the catalogue says the shop holds, so it
                follows the same rights the server enforces. */}
            {userLevel >= 3 && (
              <button
                onClick={() => setShowDuplicates(true)}
                title="Find products that are in the catalogue more than once"
                className="flex items-center gap-2 px-4 py-2 border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl font-semibold text-sm transition-colors"
              >
                <FiCopy size={16} /> <span className="hidden sm:inline">Duplicates</span>
              </button>
            )}
            <button
              onClick={() => setShowCount(true)}
              title="Scan a delivery in, or count the shelf"
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl font-semibold text-sm transition-colors"
            >
              <FiCrosshair size={16} /> <span className="hidden sm:inline">Scan stock</span>
            </button>
            <button
              onClick={() => { setEditProduct(null); setNewBarcode(''); setShowModal(true) }}
              className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-semibold text-sm transition-colors"
            >
              <FiPlus size={16} /> Add Product
            </button>
          </div>
        }
      />

      {/* Scan to open: a known code opens the product, an unknown one starts
          a new one already carrying the barcode. */}
      <div className="mb-4 relative">
        <FiCrosshair className="absolute left-3 top-1/2 -translate-y-1/2 text-orange-400" size={16} />
        <input
          value={scanCode}
          onChange={(e) => setScanCode(e.target.value)}
          onKeyDown={async (e) => {
            if (e.key !== 'Enter') return
            e.preventDefault()
            const code = scanCode.trim()
            if (!code) return
            setScanCode('')
            setScanBusy(true)
            try {
              const res = await getProductByBarcode(code)
              setEditProduct(res.data)
              setNewBarcode('')
              setShowModal(true)
              toast.success(`${res.data.name} — ${res.data.quantity} on hand`)
            } catch {
              setEditProduct(null)
              setNewBarcode(code)
              setShowModal(true)
              toast(`${code} is new — fill in the rest`, { icon: '🆕' })
            } finally {
              setScanBusy(false)
            }
          }}
          placeholder={scanBusy ? 'Looking…' : 'Scan a barcode to open or add a product…'}
          className="w-full pl-9 pr-3 py-2.5 border border-orange-200 bg-orange-50/40 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-400"
        />
      </div>

      {/* What the list adds up to */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
          <p className="text-xs text-gray-500">Total products</p>
          <p className="text-xl font-black text-gray-800">{summary?.products ?? '—'}</p>
          {summary?.outOfStock > 0 && (
            <p className="text-[11px] text-red-500 mt-0.5">{summary.outOfStock} out of stock</p>
          )}
        </div>
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
          <p className="text-xs text-gray-500">Total units in stock</p>
          <p className="text-xl font-black text-gray-800">{summary?.units ?? '—'}</p>
        </div>
        {/* Cost and the profit it implies are money figures — an inventory-only
            user is not shown them, and the server does not send them either. */}
        {summary?.costValue !== undefined && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
            <p className="text-xs text-blue-700">Stock value at cost</p>
            <p className="text-xl font-black text-blue-800">{formatCurrency(summary.costValue)}</p>
          </div>
        )}
        <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
          <p className="text-xs text-orange-700">Stock value at selling</p>
          <p className="text-xl font-black text-orange-800">
            {formatCurrency(summary?.sellingValue || 0)}
          </p>
          {summary?.potentialProfit !== undefined && (
            <p className="text-[11px] text-green-700 mt-0.5">
              {formatCurrency(summary.potentialProfit)} profit if all sold
            </p>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          placeholder="Search products..."
          className="flex-1 min-w-48 px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
        >
          <option value="">All Categories</option>
          {categories.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
        </select>
        <select
          value={stockFilter}
          onChange={e => setStockFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
        >
          <option value="all">All Stock</option>
          <option value="low">Low Stock</option>
          <option value="out">Out of Stock</option>
        </select>
      </div>

      <Table
        columns={columns}
        data={products}
        loading={isLoading}
        emptyMessage="No products found"
        pagination={data?.pagination}
        onPageChange={setPage}
      />

      {/* Add/Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setEditProduct(null); setNewBarcode('') }}
        title={editProduct ? 'Edit Product' : 'Add New Product'}
        size="lg"
      >
        <ProductForm
          /* Remount per product: useForm reads defaultValues once, so without
             this the form kept whatever the previously opened product left. */
          key={editProduct?._id || `new-${newBarcode}`}
          product={editProduct}
          initialBarcode={newBarcode}
          restricted={inventoryOnly}
          categories={categories}
          suppliers={suppliers}
          loading={createMutation.isPending || updateMutation.isPending}
          onSubmit={(formData) => {
            // A blank or unparseable field must never be sent as NaN — on an
            // edit that would wipe a price the user never touched, so fall
            // back to what the product already has.
            const num = (v, fallback) => {
              const n = parseFloat(v)
              return Number.isFinite(n) ? n : fallback
            }
            const int = (v, fallback) => {
              const n = parseInt(v, 10)
              return Number.isFinite(n) ? n : fallback
            }
            const payload = {
              name: formData.name,
              barcode: formData.barcode || undefined,
              category_id: formData.category || undefined,
              supplier_id: formData.supplier || undefined,
              cost_price: num(formData.costPrice, editProduct?.cost_price ?? 0),
              // An inventory-only user never entered a cost price; the field is
              // hidden and the server ignores it on their updates anyway.
              selling_price: num(formData.sellingPrice, editProduct?.selling_price ?? 0),
              quantity: int(formData.quantity, editProduct?.quantity ?? 0),
              low_stock_level: int(formData.lowStockLevel, editProduct?.low_stock_level ?? 5),
              image_url: formData.image_url || undefined,
              // Empty rows are dropped; a product with no variants stays a
              // plain single-SKU product.
              variants: (formData.variants || [])
                .filter(v => v.name?.trim() && v.sku?.trim())
                .map(v => ({
                  sku: v.sku.trim(),
                  name: v.name.trim(),
                  barcode: v.barcode?.trim() || undefined,
                  cost_price: parseFloat(v.cost_price) || 0,
                  selling_price: parseFloat(v.selling_price) || 0,
                  quantity: parseInt(v.quantity) || 0,
                  is_active: v.is_active !== false,
                })),
            }
            if (editProduct) {
              updateMutation.mutate({ id: editProduct._id, data: payload })
            } else {
              createMutation.mutate(payload)
            }
          }}
        />
      </Modal>

      <DuplicateProductsModal
        isOpen={showDuplicates}
        onClose={() => setShowDuplicates(false)}
      />

      {/* Import from a file */}
      <Modal
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        title="Import products from a file"
        size="4xl"
      >
        <ProductImportModal
          onClose={() => setShowImport(false)}
          onImported={() => queryClient.invalidateQueries(['products'])}
        />
      </Modal>

      {/* Stock adjustment — the only edit an inventory-only user may make.
          The server ignores every other field from them regardless. */}
      <Modal
        isOpen={!!stockTarget}
        onClose={() => setStockTarget(null)}
        title={stockTarget ? `Adjust stock — ${stockTarget.name}` : 'Adjust stock'}
        size="sm"
      >
        {stockTarget && (
          <StockAdjustForm
            product={stockTarget}
            loading={updateMutation.isPending}
            onSubmit={(values) => updateMutation.mutate({ id: stockTarget._id, data: values })}
          />
        )}
      </Modal>

      {/* Delete Confirm */}
      {showCount && <StockCountModal onClose={() => setShowCount(false)} />}

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate(deleteTarget._id)}
        title="Delete Product"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        danger
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
