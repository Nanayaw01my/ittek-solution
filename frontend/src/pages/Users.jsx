import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { openPdfInNewTab } from '../utils/openPdf'
import toast from 'react-hot-toast'
import { FiPlus, FiEdit2, FiToggleLeft, FiToggleRight, FiKey, FiUser, FiX, FiTrash2, FiEye, FiEyeOff, FiCreditCard , FiPrinter, FiCrosshair, FiCheckCircle, FiAlertTriangle } from 'react-icons/fi'
import { getUsers, createUser, updateUser, deleteUser, toggleUserStatus, resetUserPassword, issueBadge, revokeBadge, getBadgeCards, identifyBadge } from '../api/users'
import { getCategories } from '../api/products'
import { resizeImageToDataUrl, dataUrlToFile } from '../utils/resizeImage'
import { uploadImage } from '../api/upload'
import { GRANTABLE_PAGES, MODE_LABELS } from '../config/pageAccess'
import { formatDate, getRoleLabel, getRoleLevel } from '../utils/helpers'
import useAuthStore from '../store/authStore'
import useBarcodeScanner from '../hooks/useBarcodeScanner'

const ROLES_FOR_LEVEL = {
  3: ['Manager', 'Sales', 'Field Agent'],
  4: ['Super Admin', 'CEO', 'Manager', 'Sales', 'Field Agent'],
}

const ROLE_COLORS = {
  'Super Admin': 'bg-purple-100 text-purple-700',
  'CEO': 'bg-blue-100 text-blue-700',
  'Manager': 'bg-orange-100 text-orange-700',
  'Sales': 'bg-green-100 text-green-700',
  'Field Agent': 'bg-teal-100 text-teal-700',
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
  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    defaultValues: editUser
      ? { username: editUser.username, email: editUser.email, role: editUser.role }
      : {},
  })

  // Screens this user may reach on top of what their role opens, as
  // page -> mode. Ticking Products as 'inventory' lets them add products and
  // fix stock counts without ever seeing a price.
  const selectedRole = watch('role')
  const [grants, setGrants] = useState(() => ({ ...(editUser?.page_access || {}) }))
  const setGrant = (page, mode) =>
    setGrants(prev => {
      const next = { ...prev }
      if (mode) next[page] = mode
      else delete next[page]
      return next
    })
  const grantablePages = Object.entries(GRANTABLE_PAGES).filter(
    ([, def]) => getRoleLevel(selectedRole) < def.defaultLevel
  )
  const [assigned, setAssigned] = useState(
    (editUser?.assigned_categories || []).map(c => String(c?._id || c))
  )

  // Staff photo. Uploaded as soon as it is chosen so the form only ever
  // carries the resulting URL — the image itself never rides along with the
  // rest of the user's details.
  const [avatarUrl, setAvatarUrl] = useState(editUser?.avatar_url || '')
  const [avatarBusy, setAvatarBusy] = useState(false)

  /**
   * Shrink the photo first, then put it on the image service — and if that
   * cannot be reached, keep the shrunk copy with the user record instead.
   *
   * Shrinking first is worth it either way: a phone photo is several
   * megabytes and this sends about four kilobytes, which matters on a shop
   * connection. And because the small copy already exists, a problem with the
   * image service costs nothing — the photo is simply stored the other way
   * rather than the upload failing and leaving an empty circle.
   */
  const pickAvatar = async (file) => {
    if (!file) return
    if (!/^image\//.test(file.type)) return toast.error('Choose an image file.')
    setAvatarBusy(true)
    try {
      const small = await resizeImageToDataUrl(file)
      try {
        const res = await uploadImage(dataUrlToFile(small), 'avatars')
        const url = res.data?.url || res.data?.data?.url
        setAvatarUrl(url || small)
      } catch {
        setAvatarUrl(small)
      }
    } catch (err) {
      toast.error(err.message || 'Could not read that photo.')
    } finally {
      setAvatarBusy(false)
    }
  }
  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => getCategories().then(r => r.data),
    enabled: grants.products === 'inventory',
  })
  const categories = categoriesData?.categories || categoriesData || []

  const toggleCategory = (id) =>
    setAssigned(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))

  return (
    <form
      onSubmit={handleSubmit(data => onSubmit({ ...data, avatar_url: avatarUrl, assigned_categories: assigned, page_access: grants }))}
      className="p-5 space-y-4"
    >
      {/* The photo, first: it is what the person sees when they sign in. */}
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full overflow-hidden bg-orange-100 flex items-center justify-center flex-shrink-0 border border-orange-200">
          {avatarUrl
            ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
            : <FiUser className="text-orange-400" size={26} />}
        </div>
        <div className="min-w-0">
          <label className="block text-sm font-semibold text-gray-700 mb-1">Photo</label>
          <div className="flex items-center gap-2">
            <label className={`px-3 py-2 border border-gray-200 rounded-xl text-xs font-semibold cursor-pointer hover:bg-gray-50 ${avatarBusy ? 'opacity-60 pointer-events-none' : ''}`}>
              {avatarBusy ? 'Uploading…' : avatarUrl ? 'Change' : 'Choose photo'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => pickAvatar(e.target.files?.[0])}
              />
            </label>
            {avatarUrl && !avatarBusy && (
              <button
                type="button"
                onClick={() => setAvatarUrl('')}
                className="px-3 py-2 text-xs font-semibold text-gray-500 hover:text-red-600"
              >
                Remove
              </button>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-1">Shown when they sign in. Optional.</p>
        </div>
      </div>

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
      {selectedRole && grantablePages.length > 0 && (
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">
            Extra screens this user can open
          </label>
          <p className="text-xs text-gray-500 mb-2">
            Their role already opens the rest. A grant only adds access — it never
            takes any away. Users, Audit Logs, Backup and Settings cannot be granted.
          </p>
          <div className="border border-gray-200 rounded-xl divide-y divide-gray-100">
            {grantablePages.map(([page, def]) => (
              <div key={page} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="text-sm text-gray-700">{def.label}</span>
                <select
                  value={grants[page] || ''}
                  onChange={e => setGrant(page, e.target.value)}
                  className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="">No access</option>
                  {def.modes.map(m => (
                    <option key={m} value={m}>{def.modeLabels?.[m] || MODE_LABELS[m] || m}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {grants.products === 'inventory' && (
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">
            Limit them to certain product categories <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <p className="text-xs text-gray-500 mb-2">
            Tick categories to confine them to that section only. Leave all unticked
            and they can add products anywhere. Either way they never see cost
            prices, selling prices or margins, and selling at the POS is unaffected.
          </p>
          {categories.length === 0 ? (
            <p className="text-xs text-gray-400">No categories exist yet — create one first.</p>
          ) : (
            <div className="max-h-44 overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-100">
              {categories.map(c => (
                <label key={c._id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-orange-50">
                  <input
                    type="checkbox"
                    checked={assigned.includes(String(c._id))}
                    onChange={() => toggleCategory(String(c._id))}
                    className="accent-orange-500"
                  />
                  <span>{c.name}</span>
                </label>
              ))}
            </div>
          )}
          {assigned.length === 0 && (
            <p className="mt-1 text-xs text-gray-500">
              None ticked — they can add products in any category.
            </p>
          )}
        </div>
      )}

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


/**
 * Issuing a badge, and what to do with the number once it exists.
 *
 * The number is shown once, plainly, because it has to be written onto a card
 * — and printed as a barcode from the Products page's sheet, which draws the
 * same kind of code.
 */
function BadgeModal({ user, onClose }) {
  const queryClient = useQueryClient()
  const [pin, setPin] = useState('')
  const [issued, setIssued] = useState(null)

  const needsPin = user.role === 'Field Agent'
  const blocked = ['CEO', 'Super Admin'].includes(user.role)

  const issue = useMutation({
    mutationFn: () => issueBadge(user._id, { pin: pin || undefined }),
    onSuccess: (res) => {
      setIssued(res.data)
      toast.success(`Badge issued to ${user.username}.`, { duration: 8000 })
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not issue it', { duration: 9000 }),
  })

  const revoke = useMutation({
    mutationFn: () => revokeBadge(user._id),
    onSuccess: () => {
      toast.success(`${user.username}'s badge no longer works.`)
      queryClient.invalidateQueries({ queryKey: ['users'] })
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not revoke it'),
  })

  const field = 'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500'

  return (
    <div className="p-5 space-y-4">
      <div>
        <p className="font-black text-gray-900">{user.username}</p>
        <p className="text-xs text-gray-500">{user.role}</p>
      </div>

      {blocked && (
        <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3">
          A {user.role} signs in with a password, never by card — this account can
          delete records and read every customer's details, and a card can be
          photographed and copied. They can still carry one: it says who they are
          and opens nothing.
        </p>
      )}

      {issued ? (
        <>
          <div className="bg-green-50 border border-green-200 rounded-xl p-3">
            <p className="text-xs font-bold text-green-900 uppercase tracking-wide">Badge number</p>
            <p className="text-2xl font-black font-mono text-gray-900 mt-1 tracking-wider">
              {issued.badge_code}
            </p>
          </div>
          <ul className="text-xs text-gray-600 space-y-1">
            <li>• Write this number on {user.username}'s card and print it as a barcode.</li>
            <li>• They scan it at the login screen{needsPin ? ' and enter their 4-digit code' : ' and they are in'}.</li>
            <li>• One card per person. A shared badge signs the wrong person in, and the
              records will name them for it.</li>
          </ul>
          <div className="flex gap-2">
            <button onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 rounded-xl font-semibold text-sm">
              Done
            </button>
            <button
              onClick={async () => {
                try {
                  await openPdfInNewTab(() => getBadgeCards(user._id), 'badge.pdf')
                } catch {
                  toast.error('Could not build the card')
                }
              }}
              className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold text-sm"
            >
              <FiPrinter className="inline mr-1" size={14} /> Print the card
            </button>
          </div>
        </>
      ) : (
        <>
          {user.badge_code && (
            <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-xl p-3">
              {user.username} already has a badge. Issuing a new one stops the old card
              working straight away.
            </p>
          )}

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              4-digit code {needsPin ? '*' : <span className="font-normal text-gray-400">— optional</span>}
            </label>
            <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              inputMode="numeric" placeholder="0000" className={field} />
            <p className="mt-1 text-xs text-gray-500">
              {needsPin
                ? 'A field agent works away from the shop, so their badge needs a code behind it.'
                : `A ${user.role} scans and is signed in. Add a code only if you want one.`}
            </p>
          </div>

          <div className="flex gap-2">
            {user.badge_code && (
              <button onClick={() => revoke.mutate()} disabled={revoke.isPending}
                className="flex-1 py-2.5 border border-red-200 text-red-600 rounded-xl font-bold text-sm disabled:opacity-50">
                {revoke.isPending ? 'Revoking…' : 'Revoke the badge'}
              </button>
            )}
            <button onClick={() => issue.mutate()}
              disabled={issue.isPending || (needsPin && pin.length !== 4)}
              className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold text-sm disabled:opacity-50">
              {issue.isPending ? 'Issuing…' : user.badge_code ? 'Issue a new one' : 'Issue a badge'}
            </button>
          </div>
        </>
      )}
    </div>
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



/**
 * The scan box that sits on a person's row.
 *
 * A shop that printed its own cards before this screen existed has a stack of
 * barcodes and no way to say which belongs to whom. Minting fresh numbers
 * would mean throwing that stack away, so this does the opposite: scan the
 * card you already hold, onto the person in front of you.
 *
 * Marked data-scan-input, so the page-wide listener leaves these keystrokes
 * alone — the box is already focused and the browser puts the digits straight
 * in, which is exactly what is wanted here and nowhere else on the page.
 */
function BadgeScanBox({ row, onSaved, onNeedsPin }) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)

  const save = async () => {
    const code = value.trim()
    if (!code || busy) return
    setBusy(true)
    try {
      await issueBadge(row._id, { badge_code: code })
      toast.success(`${code} is now ${row.username}'s card.`)
      setValue('')
      setOpen(false)
      onSaved()
    } catch (err) {
      const body = err.response?.data
      if (body?.code === 'pin_required') {
        // A field agent cannot be given a card without a code behind it, and
        // that is set in the badge panel, not here.
        toast.error(body.message)
        onNeedsPin()
      } else {
        toast.error(body?.message || 'Could not save that card.')
      }
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={`mt-1 inline-flex items-center gap-1 text-[11px] font-bold ${
          row.badge_code
            ? 'font-mono text-blue-700 hover:underline'
            : 'px-2 py-0.5 rounded-full text-orange-700 bg-orange-50 border border-orange-200 hover:bg-orange-100'
        }`}
      >
        <FiCrosshair size={11} />
        {row.badge_code || 'Scan their card'}
      </button>
    )
  }

  return (
    <div className="mt-1.5 flex items-center gap-1.5">
      <input
        // Focused the moment it opens, so the card can be scanned without
        // another tap — on a phone this is the difference between one action
        // and three.
        autoFocus
        data-scan-input=""
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); save() }
          if (e.key === 'Escape') { setValue(''); setOpen(false) }
        }}
        placeholder={row.badge_code ? 'Scan the new card' : 'Scan their card'}
        className="w-36 px-2 py-1 border border-orange-300 rounded-lg text-[11px] font-mono focus:outline-none focus:ring-2 focus:ring-orange-500"
      />
      <button
        onClick={save}
        disabled={busy || !value.trim()}
        className="px-2 py-1 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-[11px] font-bold"
      >
        {busy ? '…' : 'Save'}
      </button>
      <button
        onClick={() => { setValue(''); setOpen(false) }}
        className="p-1 text-gray-400 hover:text-gray-600"
      >
        <FiX size={13} />
      </button>
    </div>
  )
}

/**
 * The badge checking station.
 *
 * A printed stack of cards is only useful once somebody has confirmed each
 * one scans and belongs to the person whose name is on it. Doing that by
 * signing in as each member of staff is not possible for the owners, who
 * cannot sign in by badge at all — so the check happens here instead, as a
 * plain lookup by whoever is already signed in.
 *
 * Every card is answered, including the owners': a card that opens nothing
 * still has to be the right card.
 */
function BadgeScanStation({ enabled }) {
  const [last, setLast] = useState(null)
  const [seen, setSeen] = useState([])
  const [busy, setBusy] = useState(false)

  const onScan = async (raw) => {
    const code = String(raw || '').trim()
    if (!code) return
    setBusy(true)
    try {
      const res = await identifyBadge(code)
      const who = res.data
      setLast({ ok: true, ...who })
      setSeen(prev => [
        { code, username: who.username, role: who.role, at: Date.now() },
        ...prev.filter(r => r.code !== code),
      ].slice(0, 12))
    } catch (err) {
      setLast({ ok: false, code, message: err.response?.data?.message || 'That card did not match anybody.' })
    } finally {
      setBusy(false)
    }
  }

  useBarcodeScanner(onScan, { enabled })

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <FiCrosshair size={16} className="text-orange-500 flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-900">Check a badge</p>
          <p className="text-xs text-gray-500">
            Scan any staff card — including a CEO or Super Admin card — to see whose it is.
          </p>
        </div>
      </div>

      <div className="px-4 py-3">
        {busy && <p className="text-xs text-gray-400">Looking it up…</p>}

        {!busy && !last && (
          <p className="text-xs text-gray-400">
            Nothing scanned yet. Point the scanner at a card — there is no box to click first.
          </p>
        )}

        {!busy && last?.ok === false && (
          <div className="flex items-start gap-2.5 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
            <FiAlertTriangle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-red-700">Not recognised</p>
              <p className="text-xs text-red-600 break-all">{last.message}</p>
              <p className="text-[11px] text-red-400 font-mono mt-0.5">{last.code}</p>
            </div>
          </div>
        )}

        {!busy && last?.ok && (
          <div className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${
            last.badge_active && last.account_active
              ? 'bg-green-50 border-green-200'
              : 'bg-amber-50 border-amber-200'
          }`}>
            {last.avatar_url
              ? <img src={last.avatar_url} alt="" className="w-11 h-11 rounded-full object-cover flex-shrink-0" />
              : (
                <div className="w-11 h-11 rounded-full bg-white border border-gray-200 flex items-center justify-center flex-shrink-0">
                  <FiUser size={18} className="text-gray-400" />
                </div>
              )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                {last.badge_active && last.account_active
                  ? <FiCheckCircle size={14} className="text-green-600 flex-shrink-0" />
                  : <FiAlertTriangle size={14} className="text-amber-600 flex-shrink-0" />}
                <p className="text-sm font-black text-gray-900 truncate">{last.username}</p>
              </div>
              <p className="text-xs text-gray-600">{getRoleLabel(last.role)}</p>
              <p className="text-[11px] text-gray-400 font-mono break-all">{last.badge_code}</p>

              {/* Why a card might not work, said plainly rather than left to
                  be discovered at the sign-in screen. */}
              {!last.account_active && (
                <p className="text-xs font-semibold text-amber-700 mt-1">This account is switched off.</p>
              )}
              {last.account_active && !last.badge_active && (
                <p className="text-xs font-semibold text-amber-700 mt-1">This badge was revoked.</p>
              )}
              {last.account_active && last.badge_active && !last.login_allowed && (
                <p className="text-xs text-gray-500 mt-1">
                  Identification only — a {getRoleLabel(last.role)} signs in with a password.
                </p>
              )}
              {last.account_active && last.badge_active && last.login_allowed && last.needs_pin && (
                <p className="text-xs text-gray-500 mt-1">Signs in by scan, then a 4-digit code.</p>
              )}
              {last.badge_issued_at && (
                <p className="text-[11px] text-gray-400 mt-0.5">Issued {formatDate(last.badge_issued_at)}</p>
              )}
            </div>
          </div>
        )}

        {/* Working through a printed stack, this is how you know which cards
            you have already done. */}
        {seen.length > 0 && (
          <div className="mt-3">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">
                Checked this session ({seen.length})
              </p>
              <button
                onClick={() => { setSeen([]); setLast(null) }}
                className="text-[11px] text-gray-400 hover:text-gray-600"
              >
                Clear
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {seen.map(r => (
                <span key={r.code} className="px-2 py-1 rounded-lg bg-gray-100 text-[11px] text-gray-600">
                  {r.username}
                </span>
              ))}
            </div>
          </div>
        )}
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
  const [badgeTarget, setBadgeTarget] = useState(null)
  const [cardsBusy, setCardsBusy] = useState(false)
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
    ? users.filter(u => ['Manager', 'Sales', 'Field Agent'].includes(u.role))
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
        <div className="flex items-center gap-2">
          {/* Everybody's cards on one sheet, to print and cut up. */}
          <button
            onClick={async () => {
              setCardsBusy(true)
              try {
                await openPdfInNewTab(() => getBadgeCards(), 'staff-badges.pdf')
              } catch {
                toast.error('Could not build the badges')
              } finally {
                setCardsBusy(false)
              }
            }}
            disabled={cardsBusy}
            title="Print a card for everyone who has a badge"
            className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl font-bold text-sm transition-colors disabled:opacity-50"
          >
            {/* Labelled on a phone too. An unlabelled printer icon in a row
                of icons is a button nobody presses. */}
            <FiPrinter size={16} />
            <span>{cardsBusy ? 'Building…' : 'Print badges'}</span>
          </button>
          <button
            onClick={() => { setEditUser(null); setShowModal(true) }}
            className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold text-sm transition-colors shadow-sm"
          >
            <FiPlus size={18} /> Add New User
          </button>
        </div>
      </div>

      {/* The scanner stands down while a modal is open — those have their own
          fields to type into. */}
      <BadgeScanStation enabled={!showModal && !resetTarget && !badgeTarget && !deleteTarget} />

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
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-800 text-sm">{row.username}</p>
                        <p className="text-xs text-gray-500 truncate">{row.email || '—'}</p>
                        {/* The badge lives in the first column, not out in the
                            actions where a phone hides it behind a sideways
                            scroll nobody knows is there. */}
                        {/* Owners carry a card too now — it identifies them
                            and opens nothing — so the box is on every row. */}
                        {canActOn(row) && (
                          <BadgeScanBox
                            row={row}
                            onSaved={() => queryClient.invalidateQueries({ queryKey: ['users'] })}
                            onNeedsPin={() => setBadgeTarget(row)}
                          />
                        )}
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
                        {/* Staff badge — open to every role, since an owner's
                            card identifies them without opening anything. */}
                        {(
                          <button
                            onClick={() => setBadgeTarget(row)}
                            className={`p-1.5 rounded-lg transition-colors ${
                              row.badge_code ? 'text-blue-600 hover:bg-blue-50' : 'text-gray-400 hover:bg-gray-50'
                            }`}
                            title={row.badge_code ? 'Badge issued — manage it' : 'Issue a staff badge'}
                          >
                            <FiCreditCard size={15} />
                          </button>
                        )}
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
          /* Remount per user: the form reads its defaults once, and the
             assigned-category ticks are component state. */
          key={editUser?._id || 'new'}
          user={editUser}
          myRole={me?.role}
          loading={createMutation.isPending || updateMutation.isPending}
          onSubmit={(formData) => {
            // Built field by field rather than passed straight through, so
            // anything the form gains has to be added here too. The staff
            // photo was not, which is why choosing one appeared to work and
            // then never showed: it was dropped on this line, before the
            // request was made.
            const payload = {
              username: formData.username,
              email: formData.email || undefined,
              role: formData.role,
              avatar_url: formData.avatar_url,
              assigned_categories: formData.assigned_categories,
              page_access: formData.page_access,
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

      <Modal
        isOpen={!!badgeTarget}
        onClose={() => setBadgeTarget(null)}
        title="Staff badge"
        size="sm"
      >
        {badgeTarget && (
          <BadgeModal user={badgeTarget} onClose={() => setBadgeTarget(null)} />
        )}
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
