import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { FiClock, FiTrash2, FiPlay } from 'react-icons/fi'
import { format } from 'date-fns'
import Modal from './Modal'
import { useTranslation } from '../i18n'
import { formatCurrency } from '../utils/helpers'
import { getHolds, deleteHold } from '../api/pos'
import useOnlineStatus from '../hooks/useOnlineStatus'
import { getLocalHolds, removeLocalHold } from '../utils/offlineQueue'

/** Parked carts, ready to be resumed at the till. */
export default function HeldSalesModal({ isOpen, onClose, onResume }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const isOnline = useOnlineStatus()
  const [localHolds, setLocalHolds] = React.useState([])

  const { data: serverHolds = [], isLoading } = useQuery({
    queryKey: ['held-sales'],
    queryFn: () => getHolds().then((r) => r.data),
    enabled: isOpen && isOnline,
    retry: false,
  })

  React.useEffect(() => {
    if (isOpen) setLocalHolds(getLocalHolds())
  }, [isOpen])

  // Device-local holds first — they are the ones only this till can see.
  const holds = [...localHolds, ...serverHolds]

  const removeMutation = useMutation({
    mutationFn: (id) => deleteHold(id),
    onSuccess: () => {
      toast.success('Held sale discarded')
      queryClient.invalidateQueries({ queryKey: ['held-sales'] })
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not discard held sale'),
  })

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('pos.heldSales')} size="md">
      <div className="p-5">
        {isLoading ? (
          <p className="text-sm text-gray-500 text-center py-8">{t('common.loading')}</p>
        ) : holds.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <FiClock size={32} className="mx-auto mb-2" />
            <p className="text-sm">{t('pos.noHeldSales')}</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {holds.map((hold) => {
              const total = (hold.items || []).reduce((sum, i) => sum + i.unit_price * i.quantity, 0)
              return (
                <div
                  key={hold._id}
                  className="border border-gray-200 rounded-xl p-3 flex items-center gap-3 hover:border-orange-300 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{hold.reference}</span>
                      {hold.local && (
                        <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                          THIS DEVICE
                        </span>
                      )}
                      <p className="font-semibold text-sm text-gray-800 truncate">
                        {hold.label || hold.customer_name || '—'}
                      </p>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {hold.items?.length || 0} item(s) · {formatCurrency(total)} ·{' '}
                      {hold.held_by?.username || (hold.local ? 'offline' : '—')} ·{' '}
                      {hold.createdAt ? format(new Date(hold.createdAt), 'dd/MM HH:mm') : ''}
                    </p>
                    {hold.note && <p className="text-xs text-gray-400 italic mt-0.5 truncate">{hold.note}</p>}
                  </div>
                  <button
                    onClick={() => { onResume(hold); onClose() }}
                    className="flex items-center gap-1 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-xs font-bold transition-colors"
                  >
                    <FiPlay size={12} /> {t('pos.resume')}
                  </button>
                  <button
                    onClick={() => {
                      if (hold.local) {
                        removeLocalHold(hold._id)
                        setLocalHolds(getLocalHolds())
                        toast.success('Held sale discarded')
                        return
                      }
                      removeMutation.mutate(hold._id)
                    }}
                    className="text-red-400 hover:text-red-600 p-1.5 transition-colors"
                    aria-label="Discard held sale"
                  >
                    <FiTrash2 size={15} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Modal>
  )
}
