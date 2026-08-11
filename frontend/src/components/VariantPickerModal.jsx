import React from 'react'
import Modal from './Modal'
import { useTranslation } from '../i18n'
import { formatCurrency } from '../utils/helpers'

/**
 * Which variant is the customer buying? Shown when a product with variants is
 * tapped at the till — a product with variants is never sold as itself.
 */
export default function VariantPickerModal({ isOpen, onClose, product, onSelect }) {
  const { t } = useTranslation()
  if (!product) return null

  const variants = (product.variants || []).filter((v) => v.is_active !== false)

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={product.name} size="md">
      <div className="p-5">
        <p className="text-xs text-gray-500 mb-3">{t('pos.selectVariant')}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[60vh] overflow-y-auto">
          {variants.map((variant) => {
            const out = variant.quantity <= 0
            const attrs = variant.attributes
              ? Object.entries(variant.attributes).map(([k, v]) => `${k}: ${v}`).join(' · ')
              : ''
            return (
              <button
                key={variant.sku}
                disabled={out}
                onClick={() => { onSelect(product, variant); onClose() }}
                className={`text-left p-3 rounded-xl border transition-all ${
                  out
                    ? 'bg-gray-50 border-gray-200 opacity-60 cursor-not-allowed'
                    : 'bg-white border-gray-200 hover:border-orange-400 hover:shadow-md active:scale-95'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-gray-800 leading-tight">{variant.name}</p>
                  {out && (
                    <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-bold flex-shrink-0">
                      {t('pos.outOfStock')}
                    </span>
                  )}
                </div>
                {attrs && <p className="text-[11px] text-gray-400 mt-0.5">{attrs}</p>}
                <p className="text-[11px] text-gray-400 font-mono mt-0.5">{variant.sku}</p>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-sm font-black text-orange-600">{formatCurrency(variant.selling_price)}</span>
                  <span className={`text-xs font-semibold ${variant.quantity <= 5 ? 'text-orange-500' : 'text-gray-400'}`}>
                    Qty: {variant.quantity}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </Modal>
  )
}
