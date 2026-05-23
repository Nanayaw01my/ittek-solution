import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import LoadingSpinner from '../components/LoadingSpinner'

export default function Login() {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!identifier.trim()) {
      setError('Please enter your email, account number, or Staff ID')
      return
    }
    if (!password) {
      setError('Please enter your password')
      return
    }

    setLoading(true)
    try {
      const userData = await login({ identifier: identifier.trim(), password })

      toast.success(`Welcome back, ${userData.full_name || userData.name}!`)

      if (userData.role === 'admin') navigate('/admin/dashboard')
      else if (userData.role === 'staff') navigate('/staff/dashboard')
      else navigate('/customer/dashboard')
    } catch (err) {
      const msg = err?.response?.data?.error || err?.response?.data?.message || 'Invalid credentials. Please try again.'
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-green-800 flex flex-col">
      {/* Top decorative section */}
      <div className="flex-shrink-0 px-6 pt-16 pb-8 text-center">
        <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-xl">
          <svg className="w-12 h-12 text-green-800" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        </div>
        <h1 className="text-3xl font-black text-white tracking-tight">Tritech Hub iOS</h1>
        <p className="text-green-200 text-base mt-1">iPhone Installment Management</p>
      </div>

      {/* Login Card */}
      <div className="flex-1 bg-white rounded-t-3xl px-6 pt-8 pb-safe min-h-0">
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Sign In</h2>
        <p className="text-gray-500 text-sm mb-6">Enter your credentials to continue</p>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl text-sm flex items-start gap-2">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Email, Account Number, or Staff ID
            </label>
            <input
              type="text"
              value={identifier}
              onChange={(e) => { setIdentifier(e.target.value); setError('') }}
              placeholder="e.g. john@example.com or TH-001234"
              className="w-full px-4 py-3.5 text-base border-2 border-gray-200 rounded-2xl
                         focus:outline-none focus:border-green-600 bg-white placeholder-gray-400
                         transition-colors min-h-[52px]"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              inputMode="email"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError('') }}
                placeholder="Enter your password"
                className="w-full px-4 py-3.5 pr-12 text-base border-2 border-gray-200 rounded-2xl
                           focus:outline-none focus:border-green-600 bg-white placeholder-gray-400
                           transition-colors min-h-[52px]"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-gray-600"
                tabIndex={-1}
              >
                {showPassword ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-green-800 text-white font-bold text-base rounded-2xl
                       min-h-[52px] flex items-center justify-center gap-2
                       active:scale-95 transition-all duration-150
                       disabled:opacity-60 disabled:cursor-not-allowed
                       hover:bg-green-900 mt-2"
          >
            {loading ? (
              <>
                <LoadingSpinner size="sm" color="white" />
                Signing in...
              </>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        <div className="text-center mt-6">
          <Link
            to="/forgot-password"
            className="text-green-700 font-semibold text-sm hover:text-green-900 transition-colors"
          >
            Forgot Password?
          </Link>
        </div>

        <div className="mt-8 p-4 bg-gray-50 rounded-2xl">
          <p className="text-xs text-gray-500 text-center leading-relaxed">
            By signing in, you agree to Tritech Hub iOS's terms of service and privacy policy.
          </p>
        </div>
      </div>
    </div>
  )
}
