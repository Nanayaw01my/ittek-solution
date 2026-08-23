import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { FiPlus, FiEdit2, FiTrash2, FiPackage, FiUpload } from 'react-icons/fi'
import { getProducts, createProduct, updateProduct, deleteProduct, getCategories, getSuppliers } from '../api/products'
import { formatCurrency } from '../utils/helpers'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'
import Table from '../components/Table'
import ConfirmDialog from '../components/ConfirmDialog'
import Badge from '../components/Badge'
import ImageUpload from '../components/ImageUpload'
import VariantEditor from '../components/VariantEditor'
import useAuthStore from '../store/authStore'
import ProductImportModal from '../components/ProductImportModal'
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

function ProductForm({ product, categories = [], suppliers = [], onSubmit, loading, restricted = false }) {
  const [imageUrl, setImageUrl] = useState(product?.image_url || null)
  const [variants, setVariants] = useState(product?.variants || [])
  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    defaultValues: toFormValues(product)
  })
  const costPrice = parseFloat(watch('costPrice') || 0)
  const sellingPrice = parseFloat(watch('sellingPrice') || 0)
  const margin = costPrice > 0 ? (((sellingPrice - costPrice) / costPrice) * 100).toFixed(1) : 0

  return (
    <form onSubmit={handleSubmit(data => onSubmit({ ...data, image_url: imageUrl || undefined, variants }))} className="p-5 space-y-4">
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
          <input
            {...register('barcode')}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono"
            placeholder="Scan or type barcode"
          />
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
  const [page, setPage] = useState(1)

  const user = useAuthStore(s => s.user)
  // A Manager works inside the categories the CEO assigned them, and without
  // seeing what anything costs or sells for. The `view` flag tells the server
  // to apply that scope — the POS asks for products without it, so selling is
  // unaffected. The server strips the prices; this only hides the columns.
  // 'inventory' means the CEO granted this user the Products page in its
  // limited form: add products and correct stock, never see the money.
  const inventoryOnly = effectiveMode(user, 'products') === 'inventory'

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

  const { data, isLoading } = useQuery({
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
      setShowModal(false)
    },
    onError: err => toast.error(err.response?.data?.message || 'Failed to add product'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateProduct(id, data),
    onSuccess: () => {
      toast.success('Product updated!')
      queryClient.invalidateQueries(['products'])
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
      setDeleteTarget(null)
    },
    onError: err => toast.error(err.response?.data?.message || 'Delete failed'),
  })

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
            <button
              onClick={() => { setEditProduct(null); setShowModal(true) }}
              className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-semibold text-sm transition-colors"
            >
              <FiPlus size={16} /> Add Product
            </button>
          </div>
        }
      />

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
        onClose={() => { setShowModal(false); setEditProduct(null) }}
        title={editProduct ? 'Edit Product' : 'Add New Product'}
        size="lg"
      >
        <ProductForm
          /* Remount per product: useForm reads defaultValues once, so without
             this the form kept whatever the previously opened product left. */
          key={editProduct?._id || 'new'}
          product={editProduct}
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
