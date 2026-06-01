import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { FiEye, FiEyeOff, FiUser, FiLock, FiArrowRight } from 'react-icons/fi'
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
    <div className="min-h-screen w-full flex" style={{ background: 'linear-gradient(135deg, #0f0f0f 0%, #1a1a1a 50%, #0f0f0f 100%)' }}>

      {/* ── Ghana flag vertical strip (left edge on desktop) ── */}
      <div className="hidden lg:flex flex-col w-1.5 flex-shrink-0">
        <div className="flex-1 bg-red-500" />
        <div className="flex-1 bg-yellow-400" />
        <div className="flex-1 bg-green-600" />
      </div>

      {/* ── Left branding panel ── */}
      <div className="hidden lg:flex lg:flex-1 flex-col items-center justify-center relative overflow-hidden px-16">

        {/* Large ambient glow */}
        <div style={{ position:'absolute', top:'10%', left:'10%', width:500, height:500, background:'radial-gradient(circle, rgba(249,115,22,0.18) 0%, transparent 70%)', pointerEvents:'none' }} />

        {/* Animated solar rings */}
        <div className="relative flex items-center justify-center mb-10">
          {/* Outer ring */}
          <div style={{
            position:'absolute', width:220, height:220,
            border:'1px solid rgba(249,115,22,0.25)',
            borderRadius:'50%',
            animation:'spin 20s linear infinite',
          }} />
          {/* Mid ring */}
          <div style={{
            position:'absolute', width:170, height:170,
            border:'1px dashed rgba(249,115,22,0.35)',
            borderRadius:'50%',
            animation:'spin 12s linear infinite reverse',
          }} />
          {/* Inner ring */}
          <div style={{
            position:'absolute', width:120, height:120,
            border:'2px solid rgba(249,115,22,0.5)',
            borderRadius:'50%',
          }} />
          {/* Sun core */}
          <div style={{
            width:80, height:80, borderRadius:'50%',
            background:'linear-gradient(135deg, #f97316, #ea580c)',
            boxShadow:'0 0 40px rgba(249,115,22,0.6), 0 0 80px rgba(249,115,22,0.3)',
            display:'flex', alignItems:'center', justifyContent:'center',
            zIndex:1,
          }}>
            <svg viewBox="0 0 40 40" width="44" height="44" fill="none">
              <circle cx="20" cy="20" r="8" fill="white" opacity="0.95"/>
              {[0,45,90,135,180,225,270,315].map(deg => (
                <line key={deg}
                  x1={20 + 11 * Math.cos((deg*Math.PI)/180)}
                  y1={20 + 11 * Math.sin((deg*Math.PI)/180)}
                  x2={20 + 16 * Math.cos((deg*Math.PI)/180)}
                  y2={20 + 16 * Math.sin((deg*Math.PI)/180)}
                  stroke="white" strokeWidth="2" strokeLinecap="round"
                />
              ))}
            </svg>
          </div>
        </div>

        {/* Company name */}
        <div className="text-center">
          <p className="text-orange-500 text-xs font-bold tracking-[0.3em] uppercase mb-2">Powered by</p>
          <h1 className="text-white font-black tracking-tight leading-none" style={{ fontSize: 56 }}>ITTEK</h1>
          <h2 className="text-orange-400 font-black tracking-widest text-xl mt-1">SOLUTION</h2>
          <div className="w-20 h-0.5 mx-auto my-5" style={{ background:'linear-gradient(to right, transparent, #f97316, transparent)' }} />
          <p className="text-gray-200 font-bold text-lg leading-snug">DAN & DOR SOLAR</p>
          <p className="text-gray-200 font-bold text-lg leading-snug">COMPANY LIMITED</p>
          <p className="text-gray-500 text-sm mt-2">Bogoso, Western Region, Ghana</p>
        </div>

        {/* Feature list */}
        <div className="mt-12 space-y-3 w-full max-w-xs">
          {[
            ['⚡', 'Point of Sale & Inventory'],
            ['📊', 'Financial Management'],
            ['💳', 'Debt & Credit Tracking'],
            ['📈', 'Reports & Analytics'],
          ].map(([icon, label]) => (
            <div key={label} className="flex items-center gap-3 group">
              <div style={{ width:36, height:36, borderRadius:10, background:'rgba(249,115,22,0.12)', border:'1px solid rgba(249,115,22,0.25)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <span style={{ fontSize:16 }}>{icon}</span>
              </div>
              <span className="text-gray-400 text-sm group-hover:text-gray-200 transition-colors">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="w-full lg:w-auto lg:min-w-[480px] flex flex-col justify-center" style={{ background:'#111111' }}>

        {/* Ghana flag top strip on mobile */}
        <div className="flex lg:hidden h-1 flex-shrink-0">
          <div className="flex-1 bg-red-500" />
          <div className="flex-1 bg-yellow-400" />
          <div className="flex-1 bg-green-600" />
        </div>

        <div className="flex-1 flex flex-col justify-center px-8 sm:px-12 py-12">

          {/* Mobile branding */}
          <div className="lg:hidden text-center mb-10">
            <div style={{ width:64, height:64, borderRadius:16, background:'linear-gradient(135deg,#f97316,#ea580c)', boxShadow:'0 0 30px rgba(249,115,22,0.5)', margin:'0 auto 16px', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <svg viewBox="0 0 40 40" width="36" height="36" fill="none">
                <circle cx="20" cy="20" r="8" fill="white" opacity="0.95"/>
                {[0,60,120,180,240,300].map(deg => (
                  <line key={deg}
                    x1={20 + 11 * Math.cos((deg*Math.PI)/180)}
                    y1={20 + 11 * Math.sin((deg*Math.PI)/180)}
                    x2={20 + 16 * Math.cos((deg*Math.PI)/180)}
                    y2={20 + 16 * Math.sin((deg*Math.PI)/180)}
                    stroke="white" strokeWidth="2.5" strokeLinecap="round"
                  />
                ))}
              </svg>
            </div>
            <h1 className="text-white font-black text-2xl tracking-tight">ITTEK SOLUTION</h1>
            <p className="text-gray-400 text-xs mt-1">DAN & DOR SOLAR COMPANY LIMITED</p>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h2 className="font-black text-white leading-tight" style={{ fontSize:32 }}>Welcome back</h2>
            <p className="text-gray-500 text-sm mt-1">Sign in to your account to continue</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

            {/* Username */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Username</label>
              <div className="relative">
                <FiUser size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 pointer-events-none" />
                <input
                  type="text"
                  autoComplete="username"
                  autoFocus
                  placeholder="Enter your username"
                  {...register('username', { required: 'Username is required' })}
                  style={{
                    background: errors.username ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${errors.username ? '#ef4444' : 'rgba(255,255,255,0.08)'}`,
                    borderRadius: 12,
                    color: 'white',
                    width: '100%',
                    padding: '14px 16px 14px 44px',
                    fontSize: 14,
                    outline: 'none',
                    transition: 'all 0.2s',
                  }}
                  onFocus={e => { e.target.style.border = '1px solid rgba(249,115,22,0.7)'; e.target.style.background = 'rgba(249,115,22,0.05)' }}
                  onBlur={e => { e.target.style.border = `1px solid ${errors.username ? '#ef4444' : 'rgba(255,255,255,0.08)'}` ; e.target.style.background = errors.username ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.04)' }}
                />
              </div>
              {errors.username && <p className="mt-1.5 text-xs text-red-400">{errors.username.message}</p>}
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Password</label>
              <div className="relative">
                <FiLock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 pointer-events-none" />
                <input
                  type={showPwd ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  {...register('password', { required: 'Password is required' })}
                  style={{
                    background: errors.password ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${errors.password ? '#ef4444' : 'rgba(255,255,255,0.08)'}`,
                    borderRadius: 12,
                    color: 'white',
                    width: '100%',
                    padding: '14px 48px 14px 44px',
                    fontSize: 14,
                    outline: 'none',
                    transition: 'all 0.2s',
                  }}
                  onFocus={e => { e.target.style.border = '1px solid rgba(249,115,22,0.7)'; e.target.style.background = 'rgba(249,115,22,0.05)' }}
                  onBlur={e => { e.target.style.border = `1px solid ${errors.password ? '#ef4444' : 'rgba(255,255,255,0.08)'}` ; e.target.style.background = errors.password ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.04)' }}
                />
                <button type="button" onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-300 transition-colors">
                  {showPwd ? <FiEyeOff size={17} /> : <FiEye size={17} />}
                </button>
              </div>
              {errors.password && <p className="mt-1.5 text-xs text-red-400">{errors.password.message}</p>}
            </div>

            {/* Error */}
            {errors.root && (
              <div style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:12, padding:'12px 16px' }}>
                <p className="text-red-400 text-sm">{errors.root.message}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '15px 24px',
                borderRadius: 12,
                background: loading ? '#7c3b13' : 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                color: 'white',
                fontWeight: 800,
                fontSize: 15,
                border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                marginTop: 8,
                boxShadow: loading ? 'none' : '0 8px 32px rgba(249,115,22,0.35)',
                transition: 'all 0.2s',
                letterSpacing: '0.02em',
              }}
            >
              {loading ? (
                <>
                  <div style={{ width:16, height:16, border:'2.5px solid rgba(255,255,255,0.3)', borderTopColor:'white', borderRadius:'50%', animation:'spin 0.7s linear infinite' }} />
                  Signing in...
                </>
              ) : (
                <>Sign In <FiArrowRight size={16} /></>
              )}
            </button>
          </form>

          <p className="mt-10 text-xs text-gray-700 text-center">
            © {new Date().getFullYear()} <span className="text-orange-600 font-semibold">ITTEK Solution</span> — DAN & DOR SOLAR
          </p>
        </div>

        {/* Ghana flag bottom strip on mobile */}
        <div className="flex lg:hidden h-1 flex-shrink-0">
          <div className="flex-1 bg-red-500" />
          <div className="flex-1 bg-yellow-400" />
          <div className="flex-1 bg-green-600" />
        </div>
      </div>

      {/* Ghana flag right strip on desktop */}
      <div className="hidden lg:flex flex-col w-1.5 flex-shrink-0">
        <div className="flex-1 bg-red-500" />
        <div className="flex-1 bg-yellow-400" />
        <div className="flex-1 bg-green-600" />
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        input::placeholder { color: #4b5563; }
      `}</style>
    </div>
  )
}
