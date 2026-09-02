import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { FiCopy, FiCheck, FiAlertTriangle, FiZap } from 'react-icons/fi'
import Modal from './Modal'
import { getDuplicateProducts, mergeDuplicateProducts, autoMergeDuplicates } from '../api/products'
import { formatCurrency } from '../utils/helpers'

/**
 * Products the catalogue holds more than once.
 *
 * Which copy to keep is a judgement — usually the one the shop has been
 * counting stock against — so nothing is merged automatically. Each group is
 * shown with its records and you pick the one to keep.
 *
 * The others are deactivated rather than deleted, because past sales point at
 * them and erasing them would put holes in the sales history. Their stock is
 * moved into the kept record by default: the goods are real and on one shelf,
 * split across two records only because the catalogue had the product twice.
 */
export default function DuplicateProductsModal({ isOpen, onClose }) {
  const queryClient = useQueryClient()
  const [keepBy, setKeepBy] = useState({})     // group key -> product id to keep
  const [moveStock, setMoveStock] = useState(true)
  const [confirmAuto, setConfirmAuto] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['product-duplicates'],
    queryFn: () => getDuplicateProducts().then(r => r.data),
    enabled: isOpen,
  })

  const groups = data?.groups || []

  const merge = useMutation({
    mutationFn: ({ keep_id, remove_ids }) =>
      mergeDuplicateProducts({ keep_id, remove_ids, move_stock: moveStock }),
    onSuccess: (res) => {
      toast.success(res.data?.message || 'Duplicates merged.')
      queryClient.invalidateQueries({ queryKey: ['product-duplicates'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['product-summary'] })
      queryClient.invalidateQueries({ queryKey: ['pos-products'] })
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not merge.'),
  })

  const autoMerge = useMutation({
    mutationFn: () => autoMergeDuplicates(),
    onSuccess: (res) => {
      toast.success(res.data?.message || 'Duplicates merged.', { duration: 6000 })
      setConfirmAuto(false)
      queryClient.invalidateQueries({ queryKey: ['product-duplicates'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['product-summary'] })
      queryClient.invalidateQueries({ queryKey: ['pos-products'] })
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not merge.'),
  })

  const mergeGroup = (group) => {
    const keep_id = keepBy[group.key] || group.products[0]._id
    const remove_ids = group.products.map(p => p._id).filter(id => id !== keep_id)
    if (remove_ids.length === 0) return
    merge.mutate({ keep_id, remove_ids })
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Duplicate products" size="lg">
      <div className="p-4">
        {isLoading ? (
          <div className="space-y-3">
            {Array(3).fill(0).map((_, i) => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        ) : groups.length === 0 ? (
          <div className="text-center py-10">
            <FiCheck className="mx-auto text-green-500 mb-2" size={28} />
            <p className="text-sm font-semibold text-gray-700">No duplicates found.</p>
            <p className="text-xs text-gray-500 mt-1">
              Every product in the catalogue has its own name.
            </p>
          </div>
        ) : (
          <>
            <div className="flex gap-2.5 p-3 bg-amber-50 border border-amber-200 rounded-xl mb-4">
              <FiAlertTriangle className="text-amber-500 flex-shrink-0 mt-0.5" size={17} />
              <p className="text-xs text-amber-900">
                <span className="font-bold">{data.group_count} product
                {data.group_count === 1 ? '' : 's'}</span> appear more than once
                ({data.extra_records} extra record{data.extra_records === 1 ? '' : 's'}).
                Choose which copy to keep. The others are deactivated, not deleted —
                past sales still point at them.
              </p>
            </div>

            {/* One button for the whole list. The rule is stated rather than
                left to be discovered after the fact. */}
            {confirmAuto ? (
              <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-xl space-y-3">
                <p className="text-xs text-orange-900">
                  For each of the {data.group_count} duplicated product
                  {data.group_count === 1 ? '' : 's'}, the copy that was
                  <span className="font-bold"> added first</span> is kept, the others are
                  deactivated, and their stock is added into the one kept. Past sales are
                  untouched.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmAuto(false)}
                    className="flex-1 py-2 border border-gray-200 bg-white text-gray-700 rounded-lg font-semibold text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => autoMerge.mutate()}
                    disabled={autoMerge.isPending}
                    className="flex-1 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white rounded-lg font-bold text-xs"
                  >
                    {autoMerge.isPending ? 'Merging…' : 'Yes, merge them all'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmAuto(true)}
                className="w-full mb-4 flex items-center justify-center gap-2 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold text-sm transition-colors"
              >
                <FiZap size={15} /> Merge all automatically
              </button>
            )}

            <p className="text-xs text-gray-400 mb-3 text-center">
              or go through them one at a time below
            </p>

            <label className="flex items-center gap-2 mb-4 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={moveStock}
                onChange={e => setMoveStock(e.target.checked)}
                className="rounded border-gray-300 text-orange-500 focus:ring-orange-500"
              />
              Add the retired copies' stock into the one I keep
            </label>

            <div className="space-y-4">
              {groups.map(group => {
                const keepId = keepBy[group.key] || group.products[0]._id
                return (
                  <div key={group.key} className="border border-gray-200 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200">
                      <p className="text-sm font-bold text-gray-800 truncate">{group.name}</p>
                      <p className="text-xs text-gray-500 flex-shrink-0">
                        {group.count} copies · {group.total_quantity} in stock total
                      </p>
                    </div>

                    <div>
                      {group.products.map(p => (
                        <label
                          key={p._id}
                          className={`flex items-center gap-3 px-3 py-2 border-b border-gray-100 last:border-0 cursor-pointer
                            ${keepId === p._id ? 'bg-orange-50' : 'hover:bg-gray-50'}`}
                        >
                          <input
                            type="radio"
                            name={`keep-${group.key}`}
                            checked={keepId === p._id}
                            onChange={() => setKeepBy(prev => ({ ...prev, [group.key]: p._id }))}
                            className="text-orange-500 focus:ring-orange-500"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-800 truncate">
                              {p.name}
                              {keepId === p._id && (
                                <span className="ml-2 text-xs font-bold text-orange-600">KEEP</span>
                              )}
                            </p>
                            <p className="text-xs text-gray-500 truncate">
                              {p.category || 'No category'}
                              {p.barcode ? ` · ${p.barcode}` : ''}
                              {p.createdAt ? ` · added ${new Date(p.createdAt).toLocaleDateString('en-GB')}` : ''}
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-sm font-bold text-gray-900">{p.quantity} in stock</p>
                            <p className="text-xs text-gray-500">{formatCurrency(p.selling_price || 0)}</p>
                          </div>
                        </label>
                      ))}
                    </div>

                    <div className="px-3 py-2 bg-gray-50 border-t border-gray-200">
                      <button
                        onClick={() => mergeGroup(group)}
                        disabled={merge.isPending}
                        className="w-full py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white rounded-lg font-bold text-xs transition-colors"
                      >
                        {merge.isPending ? 'Merging…' : `Keep the selected one, retire the other ${group.count - 1}`}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        <button
          onClick={onClose}
          className="w-full mt-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-50"
        >
          Close
        </button>
      </div>
    </Modal>
  )
}
