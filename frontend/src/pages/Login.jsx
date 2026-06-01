import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { FiEye, FiEyeOff, FiUser, FiLock, FiZap } from 'react-icons/fi'
import { login } from '../api/auth'
import useAuthStore from '../store/authStore'

export default function Login() {
  const navigate = useNavigate()
  const { login: storeLogin } = useAuthStore()
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, formState: { errors }, setError } = useForm()

  const onSubmit = async (data) => {
    setLoading(true)
    try {
      const res = await login({ username: data.username, password: data.password })
      const { token, user } = res.data
      storeLogin(user, token)
      toast.success(`Welcome back, ${user.username}!`)
      navigate('/dashboard')
    } catch (err) {
      const msg = err.response?.data?.message || 'Invalid credentials. Please try again.'
      setError('root', { message: msg })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4 relative overflow-hidden">

      {/* Background decorative blobs */}
      <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-orange-500 rounded-full opacity-10 blur-[120px] -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-orange-600 rounded-full opacity-10 blur-[100px] translate-x-1/2 translate-y-1/2 pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 w-[300px] h-[300px] bg-yellow-500 rounded-full opacity-5 blur-[80px] -translate-x-1/2 -translate-y-1/2 pointer-events-none" />

      {/* Ghana flag strip top */}
      <div className="absolute top-0 left-0 right-0 flex h-1.5 z-10">
        <div className="flex-1 bg-red-500" />
        <div className="flex-1 bg-yellow-400" />
        <div className="flex-1 bg-green-600" />
      </div>

      {/* Main card */}
      <div className="relative w-full max-w-4xl bg-gray-900 rounded-3xl shadow-2xl overflow-hidden border border-gray-800 flex flex-col lg:flex-row">

        {/* ── Left panel (branding) ── */}
        <div className="lg:w-5/12 bg-gradient-to-br from-orange-500 via-orange-600 to-orange-700 p-8 lg:p-12 flex flex-col items-center justify-center relative overflow-hidden">

          {/* Decorative circles */}
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-white rounded-full opacity-10" />
          <div className="absolute -bottom-12 -left-12 w-52 h-52 bg-orange-400 rounded-full opacity-20" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-yellow-400 rounded-full opacity-5 blur-2xl" />

          <div className="relative z-10 text-center">
            {/* Logo circle */}
            <div className="w-20 h-20 lg:w-24 lg:h-24 bg-white rounded-2xl shadow-xl flex items-center justify-center mx-auto mb-6">
              <svg viewBox="0 0 48 48" className="w-12 h-12 lg:w-14 lg:h-14" fill="none">
                <circle cx="24" cy="24" r="10" fill="#f97316" />
                {[0,45,90,135,180,225,270,315].map(deg => (
                  <line key={deg}
                    x1="24" y1="24"
                    x2={24 + 18 * Math.cos((deg * Math.PI) / 180)}
                    y2={24 + 18 * Math.sin((deg * Math.PI) / 180)}
                    stroke="#f97316" strokeWidth="2.5" strokeLinecap="round"
                  />
                ))}
              </svg>
            </div>

            <h1 className="text-3xl lg:text-4xl font-black text-white tracking-tight leading-none">ITTEK</h1>
            <p className="text-orange-100 font-bold text-lg tracking-widest mt-1">SOLUTION</p>

            <div className="w-12 h-0.5 bg-yellow-300 rounded-full mx-auto my-4" />

            <p className="text-white font-bold text-base leading-tight">DAN & DOR SOLAR</p>
            <p className="text-white font-bold text-base">COMPANY LIMITED</p>
            <p className="text-orange-200 text-xs mt-1">Bogoso, Western Region</p>

            {/* Features */}
            <div className="mt-8 space-y-2.5 text-left hidden lg:block">
              {[
                'Point of Sale & Inventory',
                'Debt & Credit Tracking',
                'Financial Management',
                'Reports & Analytics',
              ].map(f => (
                <div key={f} className="flex items-center gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-white bg-opacity-25 flex items-center justify-center flex-shrink-0">
                    <FiZap size={10} className="text-yellow-300" />
                  </div>
                  <span className="text-orange-100 text-sm">{f}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Right panel (form) ── */}
        <div className="flex-1 flex flex-col justify-center p-8 lg:p-12">

          <div className="mb-8">
            <h2 className="text-2xl lg:text-3xl font-black text-white">Welcome Back</h2>
            <p className="text-gray-400 text-sm mt-1">Sign in to your account to continue</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

            {/* Username */}
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-1.5">Username</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">
                  <FiUser size={17} />
                </span>
                <input
                  type="text"
                  autoComplete="username"
                  autoFocus
                  placeholder="Enter your username"
                  {...register('username', { required: 'Username is required' })}
                  className={`w-full pl-11 pr-4 py-3.5 rounded-xl text-sm text-white placeholder-gray-500 outline-none transition-all
                    bg-gray-800 border focus:ring-2 focus:ring-orange-500 focus:border-transparent
                    ${errors.username ? 'border-red-500 bg-red-900 bg-opacity-20' : 'border-gray-700 hover:border-gray-600'}`}
                />
              </div>
              {errors.username && (
                <p className="mt-1.5 text-xs text-red-400 font-medium">{errors.username.message}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-1.5">Password</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">
                  <FiLock size={17} />
                </span>
                <input
                  type={showPwd ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  {...register('password', { required: 'Password is required' })}
                  className={`w-full pl-11 pr-12 py-3.5 rounded-xl text-sm text-white placeholder-gray-500 outline-none transition-all
                    bg-gray-800 border focus:ring-2 focus:ring-orange-500 focus:border-transparent
                    ${errors.password ? 'border-red-500 bg-red-900 bg-opacity-20' : 'border-gray-700 hover:border-gray-600'}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                >
                  {showPwd ? <FiEyeOff size={17} /> : <FiEye size={17} />}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1.5 text-xs text-red-400 font-medium">{errors.password.message}</p>
              )}
            </div>

            {/* Error banner */}
            {errors.root && (
              <div className="bg-red-900 bg-opacity-40 border border-red-700 rounded-xl px-4 py-3">
                <p className="text-sm text-red-300 font-medium">{errors.root.message}</p>
              </div>
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700
                disabled:from-orange-800 disabled:to-orange-800 disabled:cursor-not-allowed
                text-white font-bold rounded-xl text-sm transition-all shadow-lg shadow-orange-900
                hover:shadow-orange-800 active:scale-[0.98]"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Signing in...
                </span>
              ) : 'Sign In'}
            </button>
          </form>

          <p className="mt-10 text-xs text-gray-600 text-center">
            Powered by <span className="font-bold text-orange-500">ITTEK Solution</span> &copy; {new Date().getFullYear()}
          </p>
        </div>
      </div>

      {/* Ghana flag strip bottom */}
      <div className="absolute bottom-0 left-0 right-0 flex h-1.5 z-10">
        <div className="flex-1 bg-red-500" />
        <div className="flex-1 bg-yellow-400" />
        <div className="flex-1 bg-green-600" />
      </div>
    </div>
  )
}
