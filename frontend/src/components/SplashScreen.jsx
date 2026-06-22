import React, { useState, useEffect } from 'react'
import { useCompanyInfo } from '../hooks/useCompanyInfo'

export default function SplashScreen({ onDone }) {
  const [phase, setPhase] = useState('enter') // enter → hold → exit
  const { data: company } = useCompanyInfo()

  useEffect(() => {
    const holdTimer = setTimeout(() => setPhase('exit'), 2800)
    const doneTimer = setTimeout(() => onDone(), 3400)
    return () => { clearTimeout(holdTimer); clearTimeout(doneTimer) }
  }, [onDone])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'radial-gradient(ellipse at 50% 40%, #1c0a00 0%, #0a0a0a 60%, #000000 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden',
      opacity: phase === 'exit' ? 0 : 1,
      transform: phase === 'exit' ? 'scale(1.04)' : 'scale(1)',
      transition: 'opacity 0.6s ease, transform 0.6s ease',
    }}>

      {/* Particle field */}
      {Array.from({ length: 30 }).map((_, i) => (
        <div key={i} style={{
          position: 'absolute',
          width: i % 3 === 0 ? 3 : 2,
          height: i % 3 === 0 ? 3 : 2,
          borderRadius: '50%',
          background: i % 4 === 0 ? '#f97316' : 'rgba(255,255,255,0.4)',
          left: `${(i * 37 + 11) % 100}%`,
          top: `${(i * 53 + 7) % 100}%`,
          animation: `particle${i % 5} ${3 + (i % 4)}s ease-in-out infinite`,
          animationDelay: `${(i * 0.3) % 2}s`,
        }} />
      ))}

      {/* Outer slow-spinning ring */}
      <div style={{
        position: 'absolute',
        width: 340, height: 340,
        borderRadius: '50%',
        border: '1px solid rgba(249,115,22,0.15)',
        animation: 'spinSlow 12s linear infinite',
      }}>
        {/* Ring dot */}
        <div style={{
          position: 'absolute', top: -4, left: '50%', marginLeft: -4,
          width: 8, height: 8, borderRadius: '50%',
          background: '#f97316',
          boxShadow: '0 0 12px #f97316',
        }} />
      </div>

      {/* Middle counter-spin ring */}
      <div style={{
        position: 'absolute',
        width: 270, height: 270,
        borderRadius: '50%',
        border: '1px dashed rgba(249,115,22,0.25)',
        animation: 'spinReverse 8s linear infinite',
      }}>
        <div style={{
          position: 'absolute', bottom: -3, left: '50%', marginLeft: -3,
          width: 6, height: 6, borderRadius: '50%',
          background: '#fb923c',
          boxShadow: '0 0 8px #fb923c',
        }} />
      </div>

      {/* Inner ring */}
      <div style={{
        position: 'absolute',
        width: 200, height: 200,
        borderRadius: '50%',
        border: '1px solid rgba(249,115,22,0.35)',
        animation: 'spinSlow 6s linear infinite',
      }} />

      {/* Center logo container — 3D flip-in */}
      <div style={{
        position: 'relative', zIndex: 2,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        animation: 'logoReveal 0.9s cubic-bezier(0.175,0.885,0.32,1.275) forwards',
        opacity: 0,
      }}>

        {/* Logo hexagon */}
        <div style={{
          width: 110, height: 110,
          background: 'linear-gradient(145deg, #ff8c00, #c45000)',
          borderRadius: 24,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 0 1px rgba(249,115,22,0.4), 0 0 40px rgba(249,115,22,0.5), 0 20px 60px rgba(0,0,0,0.7)',
          marginBottom: 28,
          animation: 'logoPulse 2.5s ease-in-out infinite',
          transform: 'perspective(400px) rotateX(0deg)',
          position: 'relative',
        }}>
          {/* Gloss overlay */}
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 24,
            background: 'linear-gradient(145deg, rgba(255,255,255,0.18) 0%, transparent 60%)',
            pointerEvents: 'none', zIndex: 1,
          }} />
          {company?.logo_url ? (
            <img
              src={company.logo_url}
              alt="Logo"
              style={{ width: 78, height: 78, objectFit: 'contain', borderRadius: 8 }}
            />
          ) : (
            <svg viewBox="0 0 40 40" width="64" height="64" fill="none">
              <circle cx="20" cy="20" r="7.5" fill="white" opacity="0.95" />
              {[0,45,90,135,180,225,270,315].map(deg => (
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
          )}
        </div>

        {/* Brand text — staggered reveal */}
        <div style={{ animation: 'slideUp 0.7s 0.3s cubic-bezier(0.23,1,0.32,1) both', textAlign: 'center' }}>
          <p style={{ color: '#f97316', fontSize: 10, fontWeight: 700, letterSpacing: '0.4em', textTransform: 'uppercase', margin: '0 0 6px' }}>
            Powered by
          </p>
          <h1 style={{
            color: 'white', fontWeight: 900, fontSize: 54,
            letterSpacing: '-0.04em', lineHeight: 1, margin: 0,
            textShadow: '0 0 40px rgba(249,115,22,0.4)',
          }}>
            ITTEK
          </h1>
          <h2 style={{
            color: '#fb923c', fontWeight: 800, fontSize: 14,
            letterSpacing: '0.35em', margin: '4px 0 0',
            textShadow: '0 0 20px rgba(249,115,22,0.5)',
          }}>
            SOLUTION
          </h2>
        </div>

        {/* Divider */}
        <div style={{ animation: 'dividerExpand 0.6s 0.6s ease both', width: 0, overflow: 'hidden', textAlign: 'center' }}>
          <div style={{ height: 1, width: 240, background: 'linear-gradient(90deg, transparent, rgba(249,115,22,0.7), transparent)', margin: '18px auto 16px' }} />
        </div>

        {/* Company name */}
        <div style={{ animation: 'slideUp 0.7s 0.7s cubic-bezier(0.23,1,0.32,1) both', textAlign: 'center' }}>
          <p style={{ color: '#e5e7eb', fontWeight: 700, fontSize: 13, margin: '0 0 3px', letterSpacing: '0.01em' }}>
            DAN &amp; DOR SOLAR COMPANY LIMITED
          </p>
          <p style={{ color: '#4b5563', fontSize: 11, margin: 0 }}>
            Bogoso · Western Region · Ghana
          </p>
        </div>

        {/* Progress bar */}
        <div style={{ animation: 'slideUp 0.7s 0.9s cubic-bezier(0.23,1,0.32,1) both', marginTop: 36, width: 240 }}>
          <div style={{ width: '100%', height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 99,
              background: 'linear-gradient(90deg, #c45000, #f97316, #fbbf24)',
              backgroundSize: '200% 100%',
              animation: 'progressFill 2.8s cubic-bezier(0.4,0,0.2,1) forwards, shimmer 1.5s linear infinite',
            }} />
          </div>
          <p style={{ color: '#374151', fontSize: 10, textAlign: 'center', marginTop: 10, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
            Initializing System…
          </p>
        </div>
      </div>

      {/* Bottom Ghana flag strip */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', height: 4 }}>
        <div style={{ flex: 1, background: '#ef4444' }} />
        <div style={{ flex: 1, background: '#facc15' }} />
        <div style={{ flex: 1, background: '#16a34a' }} />
      </div>

      <style>{`
        @keyframes spinSlow {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes spinReverse {
          from { transform: rotate(0deg); }
          to   { transform: rotate(-360deg); }
        }
        @keyframes logoPulse {
          0%,100% { box-shadow: 0 0 0 1px rgba(249,115,22,0.4), 0 0 40px rgba(249,115,22,0.45), 0 20px 60px rgba(0,0,0,0.7); }
          50%     { box-shadow: 0 0 0 1px rgba(249,115,22,0.6), 0 0 80px rgba(249,115,22,0.8), 0 20px 60px rgba(0,0,0,0.7); }
        }
        @keyframes logoReveal {
          from { opacity: 0; transform: perspective(600px) rotateX(40deg) translateY(30px) scale(0.85); }
          to   { opacity: 1; transform: perspective(600px) rotateX(0deg)  translateY(0px)  scale(1); }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes dividerExpand {
          from { width: 0; opacity: 0; }
          to   { width: 240px; opacity: 1; }
        }
        @keyframes progressFill {
          0%   { width: 0%; }
          40%  { width: 45%; }
          75%  { width: 78%; }
          100% { width: 100%; }
        }
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes particle0 { 0%,100%{transform:translateY(0) scale(1);opacity:.6} 50%{transform:translateY(-18px) scale(1.3);opacity:1} }
        @keyframes particle1 { 0%,100%{transform:translateY(0) scale(1);opacity:.4} 50%{transform:translateY(14px) scale(0.8);opacity:.8} }
        @keyframes particle2 { 0%,100%{transform:translate(0,0) scale(1);opacity:.5} 50%{transform:translate(10px,-10px) scale(1.2);opacity:.9} }
        @keyframes particle3 { 0%,100%{transform:translate(0,0);opacity:.3} 50%{transform:translate(-12px,8px);opacity:.7} }
        @keyframes particle4 { 0%,100%{transform:translateX(0) scale(1);opacity:.4} 50%{transform:translateX(16px) scale(1.1);opacity:.8} }
      `}</style>
    </div>
  )
}
