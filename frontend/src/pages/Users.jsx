import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { FiPlus, FiEdit2, FiToggleLeft, FiToggleRight, FiKey, FiUser, FiX, FiTrash2, FiEye, FiEyeOff } from 'react-icons/fi'
import { getUsers, createUser, updateUser, deleteUser, toggleUserStatus, resetUserPassword } from '../api/users'
import { formatDate, getRoleLabel, getRoleLevel } from '../utils/helpers'
import useAuthStore from '../store/authStore'

const ROLES_FOR_LEVEL = {
  3: ['Manager', 'Sales'],
  4: ['Super Admin', 'CEO', 'Manager', 'Sales'],
}

const ROLE_COLORS = {
  'Super Admin': 'bg-purple-100 text-purple-700',
  'CEO': 'bg-blue-100 text-blue-700',
  'Manager': 'bg-orange-100 text-orange-700',
  'Sales': 'bg-green-100 text-green-700',
}

function Modal({ isOpen, onClose, title, children, size = 'md' }) {
  React.useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  React.useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape' && onClose) onClose() }
    if (isOpen) document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [isOpen, onClose])

  if (!isOpen) return null
  const sizeMap = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg' }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose} />
      <div className={`relative bg-white rounded-2xl shadow-2xl w-full ${sizeMap[size] || sizeMap.md} max-h-[90vh] flex flex-col`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-orange-500 rounded-t-2xl flex-shrink-0">
          <h3 className="text-white font-bold text-lg">{title}</h3>
          <button onClick={onClose} className="text-white hover:text-orange-200 p-1 rounded-lg">
            <FiX size={20} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  )
}

function PasswordInput({ register: reg, name, rules, placeholder, label, error }) {
  const [show, setShow] = useState(false)
  return (
    <div>
      {label && <label className="block text-sm font-semibold text-gray-700 mb-1">{label}</label>}
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          {...reg(name, rules)}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 pr-10"
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={() => setShow(s => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          {show ? <FiEyeOff size={16} /> : <FiEye size={16} />}
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  )
}

function UserForm({ user: editUser, myRole, onSubmit, loading }) {
  const myLevel = getRoleLevel(myRole)
  const availableRoles = ROLES_FOR_LEVEL[myLevel] || []
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: editUser
      ? { username: editUser.username, email: editUser.email, role: editUser.role }
      : {},
  })

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">Username *</label>
        <input
          {...register('username', { required: 'Username is required' })}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          placeholder="e.g. john_doe"
          autoFocus
        />
        {errors.username && <p className="mt-1 text-xs text-red-500">{errors.username.message}</p>}
      </div>
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">
          Email <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <input
          type="email"
          {...register('email', {
            validate: v => !v || /^\S+@\S+\.\S+$/.test(v) || 'Enter a valid email address',
          })}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          placeholder="user@example.com"
        />
        {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>}
      </div>
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">Role *</label>
        <select
          {...register('role', { required: 'Role is required' })}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
        >
          <option value="">Select Role</option>
          {availableRoles.map(r => (
            <option key={r} value={r}>{getRoleLabel(r)}</option>
          ))}
        </select>
        {errors.role && <p className="mt-1 text-xs text-red-500">{errors.role.message}</p>}
      </div>
      {!editUser && (
        <PasswordInput
          register={register}
          name="password"
          label="Password *"
          placeholder="Min 6 characters"
          rules={{ required: 'Password required', minLength: { value: 6, message: 'Min 6 characters' } }}
          error={errors.password?.message}
        />
      )}
      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold rounded-xl text-sm transition-colors"
      >
        {loading ? 'Saving...' : editUser ? 'Update User' : 'Create User'}
      </button>
    </form>
  )
}

function ResetPasswordModal({ user, onClose, onSubmit, loading }) {
  const { register, handleSubmit, watch, formState: { errors } } = useForm()
  const newPw = watch('new_password')

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
      <p className="text-sm text-gray-600">
        Set a new password for <span className="font-bold text-gray-900">{user?.username}</span>.
      </p>
      <PasswordInput
        register={register}
        name="new_password"
        label="New Password *"
        placeholder="Min 6 characters"
        rules={{ required: 'Password required', minLength: { value: 6, message: 'Min 6 characters' } }}
        error={errors.new_password?.message}
      />
      <PasswordInput
        register={register}
        name="confirm_password"
        label="Confirm Password *"
        placeholder="Re-enter password"
        rules={{
          required: 'Please confirm password',
          validate: v => v === newPw || 'Passwords do not match',
        }}
        error={errors.confirm_password?.message}
      />
      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 py-2.5 border border-gray-200 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold rounded-xl text-sm transition-colors"
        >
          {loading ? 'Saving...' : 'Reset Password'}
        </button>
      </div>
    </form>
  )
}

function DeleteConfirmModal({ user, onClose, onConfirm, loading }) {
  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-100 rounded-xl">
        <FiTrash2 size={20} className="text-red-500 flex-shrink-0" />
        <p className="text-sm text-red-700">
          This will permanently delete <span className="font-bold">{user?.username}</span>. This cannot be undone.
        </p>
      </div>
      <div className="flex gap-3">
        <button
          onClick={onClose}
          className="flex-1 py-2.5 border border-gray-200 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 disabled:opacity-60 text-white font-bold rounded-xl text-sm transition-colors"
        >
          {loading ? 'Deleting...' : 'Delete User'}
        </button>
      </div>
    </div>
  )
}

export default function Users() {
  const { user: me } = useAuthStore()
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [editUser, setEditUser] = useState(null)
  const [resetTarget, setResetTarget] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['users', search],
    queryFn: () => getUsers({ search: search || undefined }).then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      toast.success('User created!')
      queryClient.invalidateQueries(['users'])
      setShowModal(false)
    },
    onError: err => toast.error(err.response?.data?.message || 'Failed to create user'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateUser(id, data),
    onSuccess: () => {
      toast.success('User updated!')
      queryClient.invalidateQueries(['users'])
      setShowModal(false)
      setEditUser(null)
    },
    onError: err => toast.error(err.response?.data?.message || 'Failed to update user'),
  })

  const toggleMutation = useMutation({
    mutationFn: (id) => toggleUserStatus(id),
    onSuccess: () => {
      toast.success('Status updated!')
      queryClient.invalidateQueries(['users'])
    },
    onError: err => toast.error(err.response?.data?.message || 'Failed to update'),
  })

  const resetPwMutation = useMutation({
    mutationFn: ({ id, password }) => resetUserPassword(id, password),
    onSuccess: () => {
      toast.success('Password reset successfully!')
      queryClient.invalidateQueries(['users'])
      setResetTarget(null)
    },
    onError: err => toast.error(err.response?.data?.message || 'Failed to reset password'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteUser(id),
    onSuccess: () => {
      toast.success('User deleted!')
      queryClient.invalidateQueries(['users'])
      setDeleteTarget(null)
    },
    onError: err => toast.error(err.response?.data?.message || 'Failed to delete user'),
  })

  const users = data?.users || data || []
  const myLevel = getRoleLevel(me?.role)

  const visibleUsers = me?.role === 'CEO'
    ? users.filter(u => ['Manager', 'Sales'].includes(u.role))
    : users

  const activeCount = visibleUsers.filter(u => u.is_active).length
  const inactiveCount = visibleUsers.filter(u => !u.is_active).length
  const managerCount = visibleUsers.filter(u => u.role === 'Manager').length
  const salesCount = visibleUsers.filter(u => u.role === 'Sales').length

  const canActOn = (row) => {
    if (row._id === me?.id || row._id === me?._id) return false
    return getRoleLevel(row.role) < myLevel
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-gray-900">User Management</h1>
          <p className="text-sm text-gray-500">Manage system users and roles</p>
        </div>
        <button
          onClick={() => { setEditUser(null); setShowModal(true) }}
          className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold text-sm transition-colors shadow-sm"
        >
          <FiPlus size={18} /> Add New User
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Active Users', value: activeCount, color: 'bg-green-50 border-green-100', text: 'text-green-700' },
          { label: 'Managers', value: managerCount, color: 'bg-blue-50 border-blue-100', text: 'text-blue-700' },
          { label: 'Sales Staff', value: salesCount, color: 'bg-orange-50 border-orange-100', text: 'text-orange-700' },
          { label: 'Inactive', value: inactiveCount, color: 'bg-red-50 border-red-100', text: 'text-red-700' },
        ].map(s => (
          <div key={s.label} className={`${s.color} border rounded-xl p-4 flex items-center gap-3`}>
            <div className={`w-9 h-9 rounded-lg ${s.color} flex items-center justify-center`}>
              <FiUser size={18} className={s.text} />
            </div>
            <div>
              <p className={`text-xl font-black ${s.text}`}>{s.value}</p>
              <p className="text-xs text-gray-500 font-medium">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search users by name or email..."
        className="w-full max-w-sm px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
      />

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide">User</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide">Role</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide whitespace-nowrap">Last Login</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                Array(5).fill(0).map((_, i) => (
                  <tr key={i}>
                    {Array(5).fill(0).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : visibleUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-gray-400 text-sm">No users found</td>
                </tr>
              ) : visibleUsers.map(row => (
                <tr key={row._id} className="hover:bg-gray-50 transition-colors">
                  {/* User */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
                        {row.avatar_url ? (
                          <img src={row.avatar_url} alt={row.username} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-orange-600 font-bold text-xs">
                            {(row.username || '?').charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-800 text-sm">{row.username}</p>
                        <p className="text-xs text-gray-500">{row.email || '—'}</p>
                      </div>
                    </div>
                  </td>
                  {/* Role */}
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${ROLE_COLORS[row.role] || 'bg-gray-100 text-gray-600'}`}>
                      {row.role}
                    </span>
                  </td>
                  {/* Status */}
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${row.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {row.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  {/* Last Login */}
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {row.last_login ? formatDate(row.last_login) : 'Never'}
                  </td>
                  {/* Actions */}
                  <td className="px-4 py-3">
                    {row._id === me?._id ? (
                      <span className="text-xs text-gray-400 italic">You</span>
                    ) : !canActOn(row) ? (
                      <span className="text-xs text-gray-300">—</span>
                    ) : (
                      <div className="flex items-center gap-1">
                        {/* Edit */}
                        <button
                          onClick={() => { setEditUser(row); setShowModal(true) }}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Edit user"
                        >
                          <FiEdit2 size={15} />
                        </button>
                        {/* Toggle active */}
                        <button
                          onClick={() => toggleMutation.mutate(row._id)}
                          disabled={toggleMutation.isPending}
                          className={`p-1.5 rounded-lg transition-colors ${row.is_active ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-50'}`}
                          title={row.is_active ? 'Deactivate' : 'Activate'}
                        >
                          {row.is_active ? <FiToggleRight size={17} /> : <FiToggleLeft size={17} />}
                        </button>
                        {/* Reset password */}
                        <button
                          onClick={() => setResetTarget(row)}
                          className="p-1.5 text-orange-500 hover:bg-orange-50 rounded-lg transition-colors"
                          title="Reset password"
                        >
                          <FiKey size={15} />
                        </button>
                        {/* Delete */}
                        <button
                          onClick={() => setDeleteTarget(row)}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete user"
                        >
                          <FiTrash2 size={15} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setEditUser(null) }}
        title={editUser ? `Edit — ${editUser.username}` : 'Add New User'}
        size="md"
      >
        <UserForm
          user={editUser}
          myRole={me?.role}
          loading={createMutation.isPending || updateMutation.isPending}
          onSubmit={(formData) => {
            const payload = {
              username: formData.username,
              email: formData.email || undefined,
              role: formData.role,
              ...(!editUser && { password: formData.password }),
            }
            if (editUser) {
              updateMutation.mutate({ id: editUser._id, data: payload })
            } else {
              createMutation.mutate(payload)
            }
          }}
        />
      </Modal>

      {/* Reset Password Modal */}
      <Modal
        isOpen={!!resetTarget}
        onClose={() => setResetTarget(null)}
        title="Reset Password"
        size="sm"
      >
        <ResetPasswordModal
          user={resetTarget}
          onClose={() => setResetTarget(null)}
          loading={resetPwMutation.isPending}
          onSubmit={(data) => resetPwMutation.mutate({ id: resetTarget._id, password: data.new_password })}
        />
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete User"
        size="sm"
      >
        <DeleteConfirmModal
          user={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          loading={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(deleteTarget._id)}
        />
      </Modal>
    </div>
  )
}
