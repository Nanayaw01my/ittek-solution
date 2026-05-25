import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { FiEye, FiEyeOff, FiSun, FiZap } from 'react-icons/fi'
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
      const { token, user } = res.data.data
      storeLogin(user, token)
      toast.success(`Welcome back, ${user.username}!`)
      navigate('/dashboard')
    } catch (err) {
      const msg = err.response?.data?.message || 'Invalid credentials. Please try again.'
      setError('root', { message: msg })
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-orange-500 via-orange-600 to-orange-700 flex-col items-center justify-center relative overflow-hidden p-12">
        {/* Ghana flag stripes accent */}
        <div className="absolute top-0 left-0 right-0 h-2 flex">
          <div className="flex-1 bg-red-600" />
          <div className="flex-1 bg-yellow-400" />
          <div className="flex-1 bg-green-600" />
        </div>

        {/* Background decoration */}
        <div className="absolute top-20 right-20 w-64 h-64 bg-orange-400 rounded-full opacity-20 blur-3xl" />
        <div className="absolute bottom-20 left-20 w-48 h-48 bg-yellow-400 rounded-full opacity-15 blur-3xl" />

        <div className="relative z-10 text-center">
          <div className="w-24 h-24 bg-white rounded-2xl shadow-2xl flex items-center justify-center mx-auto mb-8">
            <FiSun size={48} className="text-orange-500" />
          </div>

          <h1 className="text-5xl font-black text-white mb-3 tracking-tight">ITTEK</h1>
          <h2 className="text-2xl font-bold text-orange-100 mb-2">SOLUTION</h2>
          <div className="w-16 h-1 bg-yellow-300 rounded-full mx-auto mb-6" />
          <p className="text-orange-100 text-lg font-semibold mb-1">DAN & DOR SOLAR</p>
          <p className="text-orange-200 text-base">COMPANY LIMITED</p>
          <p className="text-orange-300 text-sm mt-1">Accra, Ghana</p>

          <div className="mt-12 space-y-3 text-left">
            {['Point of Sale & Inventory', 'Financial Management', 'Debt & Credit Tracking', 'Reports & Analytics'].map(f => (
              <div key={f} className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-white bg-opacity-20 flex items-center justify-center">
                  <FiZap size={12} className="text-yellow-300" />
                </div>
                <span className="text-orange-100 text-sm font-medium">{f}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-2 flex">
          <div className="flex-1 bg-red-600" />
          <div className="flex-1 bg-yellow-400" />
          <div className="flex-1 bg-green-600" />
        </div>
      </div>

      {/* Right - Login Form */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12 bg-white">
        {/* Mobile header */}
        <div className="lg:hidden text-center mb-10">
          <div className="w-16 h-16 bg-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <FiSun size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-black text-orange-500">ITTEK SOLUTION</h1>
          <p className="text-gray-500 text-sm">DAN & DOR SOLAR COMPANY LIMITED</p>
        </div>

        <div className="w-full max-w-md">
          <div className="mb-8">
            <h2 className="text-2xl font-black text-gray-900">Welcome Back</h2>
            <p className="text-gray-500 text-sm mt-1">Sign in to your account to continue</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Username</label>
              <input
                type="text"
                autoComplete="username"
                autoFocus
                placeholder="Enter your username"
                {...register('username', { required: 'Username is required' })}
                className={`w-full px-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all
                  ${errors.username ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-gray-50 hover:bg-white'}`}
              />
              {errors.username && (
                <p className="mt-1.5 text-xs text-red-500 font-medium">{errors.username.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  {...register('password', { required: 'Password is required' })}
                  className={`w-full px-4 py-3 pr-11 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all
                    ${errors.password ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-gray-50 hover:bg-white'}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                >
                  {showPwd ? <FiEyeOff size={18} /> : <FiEye size={18} />}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1.5 text-xs text-red-500 font-medium">{errors.password.message}</p>
              )}
            </div>

            {errors.root && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <p className="text-sm text-red-600 font-medium">{errors.root.message}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white font-bold rounded-xl text-sm transition-all shadow-lg shadow-orange-200 hover:shadow-orange-300 disabled:shadow-none"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Signing in...
                </span>
              ) : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="mt-12 text-xs text-gray-400 text-center">
          Powered by <span className="font-bold text-orange-400">ITTEK</span> &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
