import React, { useState, useEffect } from 'react'

export default function SplashScreen({ onDone }) {
  const [fading, setFading] = useState(false)

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFading(true), 2200)
    const doneTimer = setTimeout(() => onDone(), 2800)
    return () => { clearTimeout(fadeTimer); clearTimeout(doneTimer) }
  }, [onDone])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'linear-gradient(160deg, #0d0d0d 0%, #1a1a1a 60%, #0d0d0d 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      transition: 'opacity 0.6s ease',
      opacity: fading ? 0 : 1,
      pointerEvents: fading ? 'none' : 'all',
    }}>

      {/* Ambient glow */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at 50% 35%, rgba(249,115,22,0.18) 0%, transparent 65%)',
        pointerEvents: 'none',
      }} />

      {/* Content */}
      <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', padding: '0 24px' }}>

        {/* Animated logo */}
        <div style={{
          width: 120, height: 120, borderRadius: 28,
          background: 'linear-gradient(135deg, #f97316, #ea580c)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 28px',
          animation: 'splashPulse 1.8s ease-in-out infinite',
        }}>
          <svg viewBox="0 0 40 40" width="70" height="70" fill="none">
            <circle cx="20" cy="20" r="7.5" fill="white" opacity="0.95" />
            {[0, 45, 90, 135, 180, 225, 270, 315].map(deg => (
              <line
                key={deg}
                x1={20 + 11 * Math.cos((deg * Math.PI) / 180)}
                y1={20 + 11 * Math.sin((deg * Math.PI) / 180)}
                x2={20 + 17 * Math.cos((deg * Math.PI) / 180)}
                y2={20 + 17 * Math.sin((deg * Math.PI) / 180)}
                stroke="white" strokeWidth="2.5" strokeLinecap="round"
              />
            ))}
          </svg>
        </div>

        <p style={{ color: '#f97316', fontSize: 11, fontWeight: 700, letterSpacing: '0.32em', textTransform: 'uppercase', margin: '0 0 8px' }}>
          Powered by
        </p>
        <h1 style={{ color: 'white', fontWeight: 900, fontSize: 52, letterSpacing: '-0.03em', lineHeight: 1, margin: 0 }}>
          ITTEK
        </h1>
        <h2 style={{ color: '#fb923c', fontWeight: 800, fontSize: 15, letterSpacing: '0.28em', margin: '4px 0 18px' }}>
          SOLUTION
        </h2>

        <div style={{ height: 1, background: 'linear-gradient(to right, transparent, rgba(249,115,22,0.55), transparent)', margin: '0 auto 16px', maxWidth: 220 }} />

        <p style={{ color: '#e5e7eb', fontWeight: 700, fontSize: 14, margin: '0 0 4px' }}>
          DAN &amp; DOR SOLAR COMPANY LIMITED
        </p>
        <p style={{ color: '#6b7280', fontSize: 12, margin: '0 0 36px' }}>
          Bogoso · Western Region · Ghana
        </p>

        {/* Loading progress bar */}
        <div style={{ width: 220, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 99, margin: '0 auto', overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 99,
            background: 'linear-gradient(90deg, #f97316, #fbbf24)',
            animation: 'splashProgress 2.2s cubic-bezier(0.4,0,0.2,1) forwards',
          }} />
        </div>

        <p style={{ color: '#374151', fontSize: 11, marginTop: 14, letterSpacing: '0.05em' }}>
          Loading…
        </p>
      </div>

      {/* Ghana flag bottom strip */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', height: 5 }}>
        <div style={{ flex: 1, background: '#ef4444' }} />
        <div style={{ flex: 1, background: '#facc15' }} />
        <div style={{ flex: 1, background: '#16a34a' }} />
      </div>

      <style>{`
        @keyframes splashPulse {
          0%, 100% { box-shadow: 0 0 40px rgba(249,115,22,0.4), 0 8px 32px rgba(0,0,0,0.5); }
          50% { box-shadow: 0 0 90px rgba(249,115,22,0.75), 0 8px 48px rgba(0,0,0,0.5); }
        }
        @keyframes splashProgress {
          0%   { width: 0%; }
          30%  { width: 40%; }
          70%  { width: 75%; }
          100% { width: 100%; }
        }
      `}</style>
    </div>
  )
}
