import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { FiEye, FiEyeOff, FiUser, FiLock, FiArrowRight, FiAlertCircle, FiWifiOff } from 'react-icons/fi'
import { login } from '../api/auth'
import useAuthStore from '../store/authStore'
import { describeApiError } from '../utils/apiError'

const REMEMBER_KEY = 'ittek_remembered_user'

export default function Login() {
  const navigate = useNavigate()
  const { login: storeLogin } = useAuthStore()
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  // 'connection' | 'server' errors get a softer treatment than a wrong password
  const [errorKind, setErrorKind] = useState('client')
  const usernameRef = useRef(null)

  // Only the username is remembered — never the password.
  const remembered = localStorage.getItem(REMEMBER_KEY) || ''
  const [remember, setRemember] = useState(!!remembered)

  const { register, handleSubmit, formState: { errors }, setError, setFocus } = useForm({
    defaultValues: { username: remembered },
  })

  useEffect(() => {
    // Straight to typing at the start of a shift; if the username is already
    // filled in, skip ahead to the password.
    setFocus(remembered ? 'password' : 'username')
  }, [setFocus, remembered])

  const onSubmit = async (data) => {
    setLoading(true)
    try {
      // The host can idle down, so a cold start needs longer than the 30s
      // default before we give up and call it a network problem.
      const res = await login(
        { username: data.username, password: data.password },
        { timeout: 60000 }
      )
      const { token, user } = res.data

      if (remember) {
        localStorage.setItem(REMEMBER_KEY, data.username)
      } else {
        localStorage.removeItem(REMEMBER_KEY)
      }

      storeLogin(user, token)
      toast.success(`Welcome back, ${user.username}!`)
      navigate('/dashboard')
    } catch (err) {
      // Never blame the password for a network or server fault — that sends
      // staff off resetting a password that was never wrong.
      const { message, kind } = describeApiError(err, 'Invalid credentials. Please try again.')
      setErrorKind(kind)
      setError('root', { message })
    } finally {
      setLoading(false)
    }
  }

  // Caps Lock is the usual cause of a "wrong password" that isn't.
  const handleKeyEvent = (e) => {
    if (typeof e.getModifierState === 'function') {
      setCapsLock(e.getModifierState('CapsLock'))
    }
  }

  const inputClass =
    'w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 ' +
    'placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-400 transition-shadow'

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center px-4 py-10 bg-gradient-to-b from-orange-50 via-white to-white">

      {/* Ghana flag strip along the top */}
      <div className="fixed top-0 left-0 right-0 h-1 flex">
        <div className="flex-1 bg-red-500" />
        <div className="flex-1 bg-yellow-400" />
        <div className="flex-1 bg-green-600" />
      </div>

      <div className="w-full max-w-sm">

        {/* Brand */}
        <div className="text-center mb-8">
          <img
            src="/icons/icon-192.png"
            alt=""
            className="w-16 h-16 mx-auto mb-4 rounded-2xl shadow-lg shadow-orange-200"
            onError={(e) => { e.currentTarget.style.display = 'none' }}
          />
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">ITTEK Solution</h1>
          <p className="text-sm text-gray-500 mt-1">DAN &amp; DOR SOLAR COMPANY LIMITED</p>
        </div>

        {/* Card */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-xl shadow-gray-200/60 p-6">
          <h2 className="text-lg font-bold text-gray-900">Welcome back</h2>
          <p className="text-xs text-gray-500 mb-5">Sign in to continue</p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

            <div>
              <label htmlFor="username" className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5">
                Username or Email
              </label>
              <div className="relative">
                <FiUser size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  id="username"
                  type="text"
                  autoComplete="username"
                  placeholder="superadmin"
                  className={inputClass}
                  {...register('username', { required: 'Username is required' })}
                />
              </div>
              {errors.username && (
                <p className="text-xs text-red-600 mt-1">{errors.username.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5">
                Password
              </label>
              <div className="relative">
                <FiLock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  id="password"
                  type={showPwd ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  onKeyUp={handleKeyEvent}
                  onKeyDown={handleKeyEvent}
                  className={`${inputClass} pr-12`}
                  {...register('password', { required: 'Password is required' })}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  aria-label={showPwd ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPwd ? <FiEyeOff size={16} /> : <FiEye size={16} />}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-red-600 mt-1">{errors.password.message}</p>
              )}
              {capsLock && (
                <p className="flex items-center gap-1 text-xs text-amber-600 font-semibold mt-1.5">
                  <FiAlertCircle size={12} /> Caps Lock is on
                </p>
              )}
            </div>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500 cursor-pointer"
              />
              <span className="text-xs text-gray-600">Remember my username</span>
            </label>

            {errors.root && (
              <div className={`flex items-start gap-2 rounded-xl px-3 py-2.5 border ${
                errorKind === 'client'
                  ? 'bg-red-50 border-red-200'
                  : 'bg-amber-50 border-amber-200'
              }`}>
                {errorKind === 'client'
                  ? <FiAlertCircle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
                  : <FiWifiOff size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />}
                <div>
                  <p className={`text-xs font-medium ${errorKind === 'client' ? 'text-red-700' : 'text-amber-800'}`}>
                    {errors.root.message}
                  </p>
                  {errorKind !== 'client' && (
                    <p className="text-[11px] text-amber-600 mt-0.5">
                      Your username and password are fine — this is a connection problem.
                    </p>
                  )}
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Signing in…
                </>
              ) : (
                <>{errorKind !== 'client' && errors.root ? 'Try Again' : 'Sign In'} <FiArrowRight size={16} /></>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          © {new Date().getFullYear()} <span className="font-bold text-orange-500">ITTEK Solution</span> — DAN &amp; DOR SOLAR
        </p>
      </div>
    </div>
  )
}
