import React, { useState, useEffect } from 'react'
import api from '../../api/axios'
import toast from 'react-hot-toast'
import LoadingSpinner from '../../components/LoadingSpinner'
import { useAuth } from '../../context/AuthContext'

export default function CustomerProfile() {
  const { user, logout } = useAuth()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [viewingPhoto, setViewingPhoto] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => { fetchProfile() }, [])

  const fetchProfile = async () => {
    setLoading(true)
    try {
      const res = await api.get('/customer/profile')
      setProfile(res.data.data)
    } catch {
      toast.error('Failed to load profile')
    } finally {
      setLoading(false)
    }
  }

  const copyAccountNumber = () => {
    const acct = user?.account_number || profile?.user?.account_number
    if (acct) {
      navigator.clipboard.writeText(acct).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
        toast.success('Account number copied!')
      })
    }
  }

  const handleLogout = async () => {
    await logout()
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><LoadingSpinner size="lg" /></div>

  const customer = profile?.customer
  const acct = user?.account_number || profile?.user?.account_number

  return (
    <div className="page-container">
      <h1 className="text-xl font-bold text-gray-900 mb-4">My Profile</h1>

      {/* Avatar & Name */}
      <div className="card text-center mb-4">
        <div className="flex justify-center mb-3">
          {customer?.photos?.customer_photo ? (
            <img
              src={`/uploads/${customer.photos.customer_photo}`}
              alt="Profile"
              className="w-20 h-20 rounded-full object-cover border-4 border-primary-200"
              onClick={() => setViewingPhoto(`/uploads/${customer.photos.customer_photo}`)}
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-primary-100 flex items-center justify-center text-primary-800 text-3xl font-bold">
              {customer?.full_name?.charAt(0)?.toUpperCase() || '?'}
            </div>
          )}
        </div>
        <h2 className="font-bold text-xl">{customer?.full_name}</h2>
        <p className="text-gray-500 text-sm">{customer?.email}</p>
        <p className="text-gray-500 text-sm">{customer?.phone}</p>

        {/* Account Number */}
        <div className="mt-3 bg-primary-50 rounded-xl p-3 flex items-center justify-between">
          <div className="text-left">
            <p className="text-xs text-gray-500">Account Number</p>
            <p className="font-bold text-primary-800 text-lg tracking-wider">{acct || 'N/A'}</p>
          </div>
          <button onClick={copyAccountNumber} className="bg-primary-800 text-white text-xs py-2 px-3 rounded-lg font-semibold">
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Personal Info */}
      {customer && (
        <div className="card mb-4">
          <h3 className="section-title">Personal Information</h3>
          <div className="space-y-2 text-sm">
            {customer.occupation && (
              <div className="flex justify-between py-1.5 border-b border-gray-100">
                <span className="text-gray-500">Occupation</span>
                <span className="font-semibold">{customer.occupation}</span>
              </div>
            )}
            {customer.ghana_card_id && (
              <div className="flex justify-between py-1.5 border-b border-gray-100">
                <span className="text-gray-500">Ghana Card ID</span>
                <span className="font-semibold font-mono text-xs">{customer.ghana_card_id}</span>
              </div>
            )}
            {customer.location?.region && (
              <div className="flex justify-between py-1.5 border-b border-gray-100">
                <span className="text-gray-500">Region</span>
                <span className="font-semibold">{customer.location.region}</span>
              </div>
            )}
            {customer.location?.district && (
              <div className="flex justify-between py-1.5 border-b border-gray-100">
                <span className="text-gray-500">District</span>
                <span className="font-semibold">{customer.location.district}</span>
              </div>
            )}
            {customer.location?.town && (
              <div className="flex justify-between py-1.5">
                <span className="text-gray-500">Town</span>
                <span className="font-semibold">{customer.location.town}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Ghana Card Photos */}
      {customer?.photos && (customer.photos.ghana_card_front || customer.photos.ghana_card_back) && (
        <div className="card mb-4">
          <h3 className="section-title">Ghana Card</h3>
          <div className="grid grid-cols-2 gap-3">
            {customer.photos.ghana_card_front && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Front</p>
                <img
                  src={`/uploads/${customer.photos.ghana_card_front}`}
                  alt="Ghana Card Front"
                  className="w-full rounded-xl object-cover cursor-pointer"
                  style={{ height: 100 }}
                  onClick={() => setViewingPhoto(`/uploads/${customer.photos.ghana_card_front}`)}
                />
              </div>
            )}
            {customer.photos.ghana_card_back && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Back</p>
                <img
                  src={`/uploads/${customer.photos.ghana_card_back}`}
                  alt="Ghana Card Back"
                  className="w-full rounded-xl object-cover cursor-pointer"
                  style={{ height: 100 }}
                  onClick={() => setViewingPhoto(`/uploads/${customer.photos.ghana_card_back}`)}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Support */}
      <div className="card mb-4">
        <h3 className="section-title">Support</h3>
        <a href="tel:+233000000000" className="flex items-center gap-3 py-2">
          <span className="text-2xl">📞</span>
          <div>
            <p className="font-semibold text-sm">Call Tritech Hub iOS</p>
            <p className="text-xs text-gray-500">Mon - Sat, 8am - 6pm</p>
          </div>
        </a>
      </div>

      {/* Logout */}
      <button onClick={handleLogout} className="btn-danger w-full">Logout</button>

      {/* Photo Viewer */}
      {viewingPhoto && (
        <div className="fixed inset-0 bg-black z-50 flex items-center justify-center" onClick={() => setViewingPhoto(null)}>
          <img src={viewingPhoto} alt="Full view" className="max-w-full max-h-full object-contain" />
          <button className="absolute top-4 right-4 text-white text-3xl">&times;</button>
        </div>
      )}
    </div>
  )
}
