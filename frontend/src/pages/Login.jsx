import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { FiEye, FiEyeOff, FiUser, FiLock, FiArrowRight } from 'react-icons/fi'
import { login } from '../api/auth'
import useAuthStore from '../store/authStore'
import { useCompanyInfo } from '../hooks/useCompanyInfo'

export default function Login() {
  const navigate = useNavigate()
  const { login: storeLogin } = useAuthStore()
  const { data: company } = useCompanyInfo()
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
    <div style={{
      minHeight: '100svh',
      width: '100%',
      background: 'linear-gradient(160deg, #0d0d0d 0%, #1a1a1a 60%, #0d0d0d 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
      boxSizing: 'border-box',
      overflowX: 'hidden',
    }}>

      {/* Ambient glow background */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'radial-gradient(ellipse at 50% 0%, rgba(249,115,22,0.12) 0%, transparent 60%)',
        pointerEvents: 'none',
        zIndex: 0,
      }} />

      {/* Card */}
      <div style={{
        position: 'relative',
        zIndex: 1,
        width: '100%',
        maxWidth: 440,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 24,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        overflow: 'hidden',
        boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(249,115,22,0.06)',
      }}>

        {/* Ghana flag top strip */}
        <div style={{ display: 'flex', height: 4 }}>
          <div style={{ flex: 1, background: '#ef4444' }} />
          <div style={{ flex: 1, background: '#facc15' }} />
          <div style={{ flex: 1, background: '#16a34a' }} />
        </div>

        <div style={{ padding: '36px 32px 32px' }}>

          {/* Logo + brand */}
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            {/* Company logo */}
            <div style={{ margin: '0 auto 16px', width: 110, height: 110 }}>
              {company?.logo_url ? (
                <img
                  src={company.logo_url}
                  alt="DAN & DOR SOLAR"
                  style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 12 }}
                />
              ) : (
                <div style={{
                  width: 110, height: 110, borderRadius: 20,
                  background: 'linear-gradient(135deg, #f97316, #ea580c)',
                  boxShadow: '0 0 32px rgba(249,115,22,0.45)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg viewBox="0 0 40 40" width="56" height="56" fill="none">
                    <circle cx="20" cy="20" r="7.5" fill="white" opacity="0.95"/>
                    {[0,45,90,135,180,225,270,315].map(deg => (
                      <line key={deg}
                        x1={20 + 11 * Math.cos((deg * Math.PI) / 180)}
                        y1={20 + 11 * Math.sin((deg * Math.PI) / 180)}
                        x2={20 + 16 * Math.cos((deg * Math.PI) / 180)}
                        y2={20 + 16 * Math.sin((deg * Math.PI) / 180)}
                        stroke="white" strokeWidth="2" strokeLinecap="round"
                      />
                    ))}
                  </svg>
                </div>
              )}
            </div>

            <p style={{ color: '#f97316', fontSize: 11, fontWeight: 700, letterSpacing: '0.28em', textTransform: 'uppercase', marginBottom: 6 }}>
              Powered by
            </p>
            <h1 style={{ color: 'white', fontWeight: 900, fontSize: 34, letterSpacing: '-0.03em', lineHeight: 1, margin: 0 }}>
              ITTEK
            </h1>
            <h2 style={{ color: '#fb923c', fontWeight: 800, fontSize: 14, letterSpacing: '0.22em', marginTop: 4 }}>
              SOLUTION
            </h2>

            <div style={{ height: 1, background: 'linear-gradient(to right, transparent, rgba(249,115,22,0.4), transparent)', margin: '14px auto', maxWidth: 180 }} />

            <p style={{ color: '#e5e7eb', fontWeight: 700, fontSize: 13, lineHeight: 1.5, margin: 0 }}>
              DAN &amp; DOR SOLAR COMPANY LIMITED
            </p>
            <p style={{ color: '#6b7280', fontSize: 11, marginTop: 3 }}>Bogoso · Western Region · Ghana</p>
          </div>

          {/* Sign-in heading */}
          <div style={{ marginBottom: 20 }}>
            <h2 style={{ color: 'white', fontWeight: 800, fontSize: 22, margin: 0 }}>Welcome back</h2>
            <p style={{ color: '#6b7280', fontSize: 13, marginTop: 4 }}>Sign in to your account to continue</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Username */}
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
                Username
              </label>
              <div style={{ position: 'relative' }}>
                <FiUser size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#6b7280', pointerEvents: 'none' }} />
                <input
                  type="text"
                  autoComplete="username"
                  autoFocus
                  placeholder="Enter your username"
                  {...register('username', { required: 'Username is required' })}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '13px 16px 13px 42px',
                    fontSize: 14,
                    background: errors.username ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${errors.username ? '#ef4444' : 'rgba(255,255,255,0.1)'}`,
                    borderRadius: 12,
                    color: 'white',
                    outline: 'none',
                    transition: 'border-color 0.2s, background 0.2s',
                    fontFamily: 'inherit',
                  }}
                  onFocus={e => {
                    e.target.style.border = '1px solid rgba(249,115,22,0.7)'
                    e.target.style.background = 'rgba(249,115,22,0.06)'
                  }}
                  onBlur={e => {
                    e.target.style.border = `1px solid ${errors.username ? '#ef4444' : 'rgba(255,255,255,0.1)'}`
                    e.target.style.background = errors.username ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.05)'
                  }}
                />
              </div>
              {errors.username && <p style={{ marginTop: 6, fontSize: 12, color: '#f87171' }}>{errors.username.message}</p>}
            </div>

            {/* Password */}
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <FiLock size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#6b7280', pointerEvents: 'none' }} />
                <input
                  type={showPwd ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  {...register('password', { required: 'Password is required' })}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '13px 46px 13px 42px',
                    fontSize: 14,
                    background: errors.password ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${errors.password ? '#ef4444' : 'rgba(255,255,255,0.1)'}`,
                    borderRadius: 12,
                    color: 'white',
                    outline: 'none',
                    transition: 'border-color 0.2s, background 0.2s',
                    fontFamily: 'inherit',
                  }}
                  onFocus={e => {
                    e.target.style.border = '1px solid rgba(249,115,22,0.7)'
                    e.target.style.background = 'rgba(249,115,22,0.06)'
                  }}
                  onBlur={e => {
                    e.target.style.border = `1px solid ${errors.password ? '#ef4444' : 'rgba(255,255,255,0.1)'}`
                    e.target.style.background = errors.password ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.05)'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: 4, display: 'flex', alignItems: 'center' }}
                >
                  {showPwd ? <FiEyeOff size={16} /> : <FiEye size={16} />}
                </button>
              </div>
              {errors.password && <p style={{ marginTop: 6, fontSize: 12, color: '#f87171' }}>{errors.password.message}</p>}
            </div>

            {/* Root error */}
            {errors.root && (
              <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '11px 14px' }}>
                <p style={{ color: '#f87171', fontSize: 13, margin: 0 }}>{errors.root.message}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '14px 20px',
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
                marginTop: 4,
                boxShadow: loading ? 'none' : '0 6px 24px rgba(249,115,22,0.4)',
                transition: 'all 0.2s',
                letterSpacing: '0.02em',
                fontFamily: 'inherit',
              }}
            >
              {loading ? (
                <>
                  <div style={{ width: 16, height: 16, border: '2.5px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                  Signing in...
                </>
              ) : (
                <>Sign In <FiArrowRight size={16} /></>
              )}
            </button>
          </form>

          {/* Feature chips */}
          <div style={{ marginTop: 24, display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
            {['POS & Inventory', 'Finance', 'Debt Tracking', 'Analytics'].map(f => (
              <span key={f} style={{
                fontSize: 11, color: '#6b7280', background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: '4px 10px',
              }}>{f}</span>
            ))}
          </div>

          <p style={{ marginTop: 20, fontSize: 11, color: '#374151', textAlign: 'center' }}>
            &copy; {new Date().getFullYear()} <span style={{ color: '#ea580c', fontWeight: 600 }}>ITTEK Solution</span> — DAN &amp; DOR SOLAR
          </p>
        </div>

        {/* Ghana flag bottom strip */}
        <div style={{ display: 'flex', height: 4 }}>
          <div style={{ flex: 1, background: '#ef4444' }} />
          <div style={{ flex: 1, background: '#facc15' }} />
          <div style={{ flex: 1, background: '#16a34a' }} />
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        input::placeholder { color: #4b5563; }
        input::-webkit-input-placeholder { color: #4b5563; }
      `}</style>
    </div>
  )
}
