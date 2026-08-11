import React from 'react'
import { FiPlus, FiTrash2 } from 'react-icons/fi'
import { useTranslation } from '../i18n'

/**
 * Edit a product's variants inline on the product form.
 *
 * When a product has variants the parent's own price and stock stop being
 * used — the till sells the variant, and total stock is the sum of them —
 * so the form makes that switch explicit rather than leaving two sources of
 * truth on screen.
 */
export default function VariantEditor({ variants, onChange }) {
  const { t } = useTranslation()

  const update = (index, field, value) => {
    onChange(variants.map((v, i) => (i === index ? { ...v, [field]: value } : v)))
  }

  const add = () => {
    onChange([
      ...variants,
      { sku: '', name: '', barcode: '', cost_price: '', selling_price: '', quantity: 0, is_active: true },
    ])
  }

  const remove = (index) => onChange(variants.filter((_, i) => i !== index))

  const totalStock = variants.reduce((sum, v) => sum + (parseInt(v.quantity) || 0), 0)

  return (
    <div className="border border-gray-200 rounded-xl p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-gray-700">{t('variants.title')}</p>
          <p className="text-xs text-gray-400">
            {variants.length === 0 ? t('variants.noVariants') : t('variants.stockRollup')}
          </p>
        </div>
        {variants.length > 0 && (
          <span className="text-xs font-bold bg-orange-100 text-orange-700 px-2 py-1 rounded-full">
            {totalStock} in stock
          </span>
        )}
      </div>

      {variants.map((variant, i) => (
        <div key={i} className="bg-gray-50 rounded-lg p-2.5 space-y-2">
          <div className="flex gap-2">
            <input
              type="text" value={variant.name} onChange={(e) => update(i, 'name', e.target.value)}
              placeholder={t('variants.optionName')}
              className="flex-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
            <input
              type="text" value={variant.sku} onChange={(e) => update(i, 'sku', e.target.value)}
              placeholder={t('variants.sku')}
              className="w-28 px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
            <button
              type="button" onClick={() => remove(i)}
              className="px-2 text-red-400 hover:text-red-600"
              aria-label="Remove variant"
            >
              <FiTrash2 size={14} />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <input
              type="number" step="0.01" min="0" value={variant.cost_price}
              onChange={(e) => update(i, 'cost_price', e.target.value)} placeholder="Cost"
              className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
            <input
              type="number" step="0.01" min="0" value={variant.selling_price}
              onChange={(e) => update(i, 'selling_price', e.target.value)} placeholder="Price"
              className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
            <input
              type="number" min="0" value={variant.quantity}
              onChange={(e) => update(i, 'quantity', e.target.value)} placeholder="Qty"
              className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
            <input
              type="text" value={variant.barcode || ''}
              onChange={(e) => update(i, 'barcode', e.target.value)} placeholder="Barcode"
              className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>
        </div>
      ))}

      <button
        type="button" onClick={add}
        className="w-full flex items-center justify-center gap-1.5 py-2 border-2 border-dashed border-gray-300 text-gray-600 rounded-lg text-xs font-semibold hover:border-orange-400 hover:text-orange-600 transition-colors"
      >
        <FiPlus size={13} /> {t('variants.add')}
      </button>
    </div>
  )
}
