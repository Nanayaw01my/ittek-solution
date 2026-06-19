import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

// ─── Change this passphrase to anything you want ──────────────────────────────
const DEV_PASSPHRASE = 'ITTEK@DEV2025'
// ──────────────────────────────────────────────────────────────────────────────

export default function DevLogin() {
  const navigate = useNavigate()
  const [lines, setLines] = useState([])
  const [input, setInput] = useState('')
  const [phase, setPhase] = useState('boot') // boot | prompt | authed | denied
  const [masked, setMasked] = useState(true)
  const inputRef = useRef(null)
  const bottomRef = useRef(null)

  const push = (text, color = '#a3e635', delay = 0) =>
    new Promise(res =>
      setTimeout(() => {
        setLines(l => [...l, { text, color }])
        res()
      }, delay)
    )

  useEffect(() => {
    if (sessionStorage.getItem('dev_auth') === 'true') {
      navigate('/dev/dashboard', { replace: true })
      return
    }

    const boot = async () => {
      await push('ITTEK SOLUTION — Developer Interface', '#f97316', 0)
      await push('─'.repeat(48), '#374151', 120)
      await push('Initializing secure channel...', '#6b7280', 250)
      await push('Verifying environment... OK', '#6b7280', 600)
      await push('Loading dev module... OK', '#6b7280', 900)
      await push('─'.repeat(48), '#374151', 1100)
      await push('Access restricted to authorized developers.', '#fbbf24', 1300)
      await push('', '#fff', 1500)
      await push('Enter passphrase to continue:', '#e5e7eb', 1700)
      setPhase('prompt')
    }

    boot()
  }, [navigate])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines])

  useEffect(() => {
    if (phase === 'prompt') inputRef.current?.focus()
  }, [phase])

  const handleSubmit = async e => {
    e.preventDefault()
    if (phase !== 'prompt') return
    setPhase('checking')

    const attempt = input.trim()
    setInput('')
    setLines(l => [...l, { text: `> ${'●'.repeat(attempt.length)}`, color: '#6b7280' }])

    if (attempt === DEV_PASSPHRASE) {
      sessionStorage.setItem('dev_auth', 'true')
      await push('', '#fff', 200)
      await push('✓ Passphrase accepted.', '#4ade80', 300)
      await push('✓ Developer session started.', '#4ade80', 550)
      await push('Loading dashboard...', '#6b7280', 800)
      setPhase('authed')
      setTimeout(() => navigate('/dev/dashboard', { replace: true }), 1400)
    } else {
      await push('', '#fff', 200)
      await push('✗ Access denied. Invalid passphrase.', '#ef4444', 300)
      await push('', '#fff', 500)
      await push('Enter passphrase to continue:', '#e5e7eb', 700)
      setPhase('prompt')
      inputRef.current?.focus()
    }
  }

  const canType = phase === 'prompt'

  return (
    <div
      onClick={() => canType && inputRef.current?.focus()}
      style={{
        minHeight: '100svh',
        background: '#0a0a0a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        fontFamily: "'Courier New', Courier, monospace",
        cursor: canType ? 'text' : 'default',
      }}
    >
      <div style={{ width: '100%', maxWidth: 620 }}>

        {/* Terminal window */}
        <div style={{
          background: '#111',
          border: '1px solid #222',
          borderRadius: 12,
          overflow: 'hidden',
          boxShadow: '0 32px 80px rgba(0,0,0,0.8)',
        }}>
          {/* Title bar */}
          <div style={{
            background: '#1a1a1a',
            borderBottom: '1px solid #222',
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#ef4444' }} />
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#fbbf24' }} />
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#4ade80' }} />
            <span style={{ color: '#4b5563', fontSize: 12, marginLeft: 8 }}>
              dev@ittek — secure terminal
            </span>
          </div>

          {/* Output area */}
          <div style={{
            padding: '20px 20px 4px',
            minHeight: 240,
            maxHeight: '60svh',
            overflowY: 'auto',
          }}>
            {lines.map((l, i) => (
              <div key={i} style={{
                color: l.color,
                fontSize: 13,
                lineHeight: '22px',
                whiteSpace: 'pre-wrap',
              }}>
                {l.text}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input row */}
          <form onSubmit={handleSubmit} style={{ padding: '8px 20px 20px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#f97316', fontSize: 13, flexShrink: 0 }}>{'>'}</span>
            <div style={{ flex: 1, position: 'relative' }}>
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                type={masked ? 'password' : 'text'}
                disabled={!canType}
                autoComplete="off"
                spellCheck={false}
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: '#e5e7eb',
                  fontSize: 13,
                  fontFamily: 'inherit',
                  width: '100%',
                  caretColor: '#f97316',
                }}
              />
            </div>
            <button
              type="button"
              onClick={() => setMasked(m => !m)}
              title={masked ? 'Show passphrase' : 'Hide passphrase'}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#374151', fontSize: 11, padding: '2px 6px',
                fontFamily: 'inherit',
              }}
            >
              {masked ? '[show]' : '[hide]'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', color: '#1f2937', fontSize: 11, marginTop: 16, fontFamily: 'inherit' }}>
          This page is not publicly accessible. Developer access only.
        </p>
      </div>

      <style>{`
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1f2937; border-radius: 2px; }
      `}</style>
    </div>
  )
}
