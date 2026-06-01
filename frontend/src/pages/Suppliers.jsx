import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { FiPlus, FiEdit2, FiTrash2, FiTruck, FiPhone, FiMail, FiMapPin } from 'react-icons/fi'
import { getSuppliers, createSupplier, updateSupplier, deleteSupplier } from '../api/products'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'

function SupplierForm({ supplier, onSubmit, loading }) {
  const { register, handleSubmit, formState: { errors } } = useForm({ defaultValues: supplier || {} })
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">Supplier Name *</label>
        <input {...register('name', { required: 'Name is required' })}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          placeholder="Company or person name" />
        {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Phone</label>
          <input {...register('phone')}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            placeholder="+233 XXXXXXXXX" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Email</label>
          <input type="email" {...register('email')}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            placeholder="supplier@example.com" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">Address</label>
        <input {...register('address')}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          placeholder="Supplier address" />
      </div>
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">Notes</label>
        <textarea {...register('notes')} rows={2}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
          placeholder="Any additional information..." />
      </div>
      <button type="submit" disabled={loading}
        className="w-full py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold rounded-xl text-sm">
        {loading ? 'Saving...' : supplier ? 'Update Supplier' : 'Add Supplier'}
      </button>
    </form>
  )
}

export default function Suppliers() {
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [editSupplier, setEditSupplier] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['suppliers', search],
    queryFn: () => getSuppliers().then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: createSupplier,
    onSuccess: () => { toast.success('Supplier added!'); queryClient.invalidateQueries(['suppliers']); setShowModal(false) },
    onError: err => toast.error(err.response?.data?.message || 'Failed'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateSupplier(id, data),
    onSuccess: () => { toast.success('Supplier updated!'); queryClient.invalidateQueries(['suppliers']); setShowModal(false); setEditSupplier(null) },
    onError: err => toast.error(err.response?.data?.message || 'Failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteSupplier(id),
    onSuccess: () => { toast.success('Supplier deleted'); queryClient.invalidateQueries(['suppliers']); setDeleteTarget(null) },
    onError: err => toast.error(err.response?.data?.message || 'Delete failed'),
  })

  const suppliers = (data?.suppliers || data || []).filter(s =>
    !search || s.name?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <PageHeader
        title="Suppliers"
        subtitle="Manage your product suppliers"
        action={
          <button onClick={() => { setEditSupplier(null); setShowModal(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-semibold text-sm">
            <FiPlus size={16} /> Add Supplier
          </button>
        }
      />

      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search suppliers..."
        className="w-full max-w-sm px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 mb-5"
      />

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array(6).fill(0).map((_, i) => <div key={i} className="h-32 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {suppliers.map(supplier => (
            <div key={supplier._id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
                  <FiTruck size={20} className="text-orange-600" />
                </div>
                <div className="flex gap-1">
                  <button onClick={() => { setEditSupplier(supplier); setShowModal(true) }}
                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg">
                    <FiEdit2 size={14} />
                  </button>
                  <button onClick={() => setDeleteTarget(supplier)}
                    className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg">
                    <FiTrash2 size={14} />
                  </button>
                </div>
              </div>
              <h3 className="font-bold text-gray-900 mb-2">{supplier.name}</h3>
              <div className="space-y-1.5">
                {supplier.phone && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <FiPhone size={12} className="text-gray-400" />
                    {supplier.phone}
                  </div>
                )}
                {supplier.email && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <FiMail size={12} className="text-gray-400" />
                    <span className="truncate">{supplier.email}</span>
                  </div>
                )}
                {supplier.address && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <FiMapPin size={12} className="text-gray-400" />
                    <span className="truncate">{supplier.address}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
          {suppliers.length === 0 && (
            <div className="col-span-full text-center py-12 text-gray-400">
              <FiTruck size={40} className="mx-auto mb-3 opacity-30" />
              <p>No suppliers found. Add your first supplier!</p>
            </div>
          )}
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => { setShowModal(false); setEditSupplier(null) }} title={editSupplier ? 'Edit Supplier' : 'Add Supplier'} size="md">
        <SupplierForm
          supplier={editSupplier}
          loading={createMutation.isPending || updateMutation.isPending}
          onSubmit={d => editSupplier ? updateMutation.mutate({ id: editSupplier._id, data: d }) : createMutation.mutate(d)}
        />
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate(deleteTarget._id)}
        title="Delete Supplier"
        message={`Delete supplier "${deleteTarget?.name}"?`}
        confirmText="Delete"
        danger
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
