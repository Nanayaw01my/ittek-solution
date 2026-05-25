import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { FiPlus, FiEdit2, FiTrash2, FiTag } from 'react-icons/fi'
import { getCategories, createCategory, updateCategory, deleteCategory } from '../api/products'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'

function CategoryForm({ category, onSubmit, loading }) {
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: category || {}
  })
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">Category Name *</label>
        <input
          {...register('name', { required: 'Name is required' })}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          placeholder="e.g. Solar Panels"
        />
        {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>}
      </div>
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">Description</label>
        <textarea
          {...register('description')}
          rows={3}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
          placeholder="Optional description"
        />
      </div>
      <button type="submit" disabled={loading}
        className="w-full py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold rounded-xl text-sm">
        {loading ? 'Saving...' : category ? 'Update Category' : 'Add Category'}
      </button>
    </form>
  )
}

export default function Categories() {
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [editCategory, setEditCategory] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: () => getCategories().then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: createCategory,
    onSuccess: () => { toast.success('Category added!'); queryClient.invalidateQueries(['categories']); setShowModal(false) },
    onError: err => toast.error(err.response?.data?.message || 'Failed'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateCategory(id, data),
    onSuccess: () => { toast.success('Category updated!'); queryClient.invalidateQueries(['categories']); setShowModal(false); setEditCategory(null) },
    onError: err => toast.error(err.response?.data?.message || 'Failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteCategory(id),
    onSuccess: () => { toast.success('Category deleted'); queryClient.invalidateQueries(['categories']); setDeleteTarget(null) },
    onError: err => toast.error(err.response?.data?.message || 'Delete failed'),
  })

  const categories = data?.categories || data || []

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <PageHeader
        title="Categories"
        subtitle="Manage product categories"
        action={
          <button onClick={() => { setEditCategory(null); setShowModal(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-semibold text-sm">
            <FiPlus size={16} /> Add Category
          </button>
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {Array(6).fill(0).map((_, i) => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map(cat => (
            <div key={cat._id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
                  <FiTag size={20} className="text-orange-600" />
                </div>
                <div className="flex gap-1">
                  <button onClick={() => { setEditCategory(cat); setShowModal(true) }}
                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg">
                    <FiEdit2 size={14} />
                  </button>
                  <button onClick={() => setDeleteTarget(cat)}
                    className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg">
                    <FiTrash2 size={14} />
                  </button>
                </div>
              </div>
              <h3 className="font-bold text-gray-900">{cat.name}</h3>
              {cat.description && <p className="text-sm text-gray-500 mt-1 line-clamp-2">{cat.description}</p>}
              {cat.productCount !== undefined && (
                <p className="text-xs text-orange-600 font-semibold mt-2">{cat.productCount} products</p>
              )}
            </div>
          ))}
          {categories.length === 0 && (
            <div className="col-span-full text-center py-12 text-gray-400">
              <FiTag size={40} className="mx-auto mb-3 opacity-30" />
              <p>No categories yet. Add your first one!</p>
            </div>
          )}
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => { setShowModal(false); setEditCategory(null) }} title={editCategory ? 'Edit Category' : 'Add Category'} size="md">
        <CategoryForm
          category={editCategory}
          loading={createMutation.isPending || updateMutation.isPending}
          onSubmit={d => editCategory ? updateMutation.mutate({ id: editCategory._id, data: d }) : createMutation.mutate(d)}
        />
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate(deleteTarget._id)}
        title="Delete Category"
        message={`Delete category "${deleteTarget?.name}"? Products in this category may be affected.`}
        confirmText="Delete"
        danger
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
