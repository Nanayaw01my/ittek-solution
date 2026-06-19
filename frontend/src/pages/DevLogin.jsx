import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

// Passphrase is NOT stored here — only its PBKDF2 hash is.
// To change the passphrase, run in Node:
//   crypto.pbkdf2('NEW_PASS', 'ittek_dev_salt_x9k2', 100000, 32, 'sha256', (e,k) => console.log(k.toString('hex')))
// Then replace PASS_HASH below with the output.
const PASS_HASH = '6c0e1434ef37ea387b120f791ac07253e507d50417bf2dfe77a6c8f91aac824a'
const SALT      = 'ittek_dev_salt_x9k2'
const ITERATIONS = 100_000

const LOCKOUT_KEY    = 'dev_lockout_until'
const ATTEMPTS_KEY   = 'dev_attempts'
const MAX_ATTEMPTS   = 3
const LOCKOUT_MS     = 10 * 60 * 1000  // 10 minutes

async function hashInput(input) {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(input), 'PBKDF2', false, ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(SALT), iterations: ITERATIONS, hash: 'SHA-256' },
    keyMaterial, 256
  )
  return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function getRemainingLockout() {
  const until = parseInt(localStorage.getItem(LOCKOUT_KEY) || '0', 10)
  const remaining = until - Date.now()
  return remaining > 0 ? remaining : 0
}

export default function DevLogin() {
  const navigate = useNavigate()
  const [lines, setLines]         = useState([])
  const [input, setInput]         = useState('')
  const [phase, setPhase]         = useState('boot')  // boot | prompt | checking | authed | denied | locked
  const [masked, setMasked]       = useState(true)
  const [countdown, setCountdown] = useState(0)
  const inputRef  = useRef(null)
  const bottomRef = useRef(null)
  const timerRef  = useRef(null)

  const push = (text, color = '#a3e635', delay = 0) =>
    new Promise(res =>
      setTimeout(() => {
        setLines(l => [...l, { text, color }])
        res()
      }, delay)
    )

  const startLockoutTimer = (ms) => {
    setCountdown(Math.ceil(ms / 1000))
    setPhase('locked')
    timerRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current)
          localStorage.setItem(ATTEMPTS_KEY, '0')
          setPhase('prompt')
          push('Lockout expired. You may try again.', '#fbbf24')
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  useEffect(() => {
    return () => clearInterval(timerRef.current)
  }, [])

  useEffect(() => {
    if (sessionStorage.getItem('dev_auth') === 'true') {
      navigate('/dev/dashboard', { replace: true })
      return
    }

    const remaining = getRemainingLockout()

    const boot = async () => {
      await push('ITTEK SOLUTION — Developer Interface', '#f97316', 0)
      await push('─'.repeat(48), '#374151', 120)
      await push('Initializing secure channel...', '#6b7280', 250)
      await push('PBKDF2 verification module... loaded', '#6b7280', 550)
      await push('Brute-force protection... active', '#6b7280', 800)
      await push('─'.repeat(48), '#374151', 1000)

      if (remaining > 0) {
        await push('', '#fff', 1100)
        await push(`✗ Too many failed attempts.`, '#ef4444', 1200)
        await push(`  Locked for ${Math.ceil(remaining / 60000)} more minute(s).`, '#ef4444', 1400)
        startLockoutTimer(remaining)
      } else {
        await push('Access restricted to authorized developers.', '#fbbf24', 1200)
        await push('', '#fff', 1400)
        await push('Enter passphrase to continue:', '#e5e7eb', 1600)
        setPhase('prompt')
      }
    }

    boot()
  }, [navigate])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines, countdown])

  useEffect(() => {
    if (phase === 'prompt') inputRef.current?.focus()
  }, [phase])

  const handleSubmit = async e => {
    e.preventDefault()
    if (phase !== 'prompt') return

    const attempt = input.trim()
    setInput('')
    setPhase('checking')
    setLines(l => [...l, { text: `> ${'●'.repeat(Math.min(attempt.length, 16))}`, color: '#6b7280' }])
    await push('Verifying...', '#6b7280', 0)

    let hash
    try {
      hash = await hashInput(attempt)
    } catch {
      await push('✗ Crypto error. Please reload.', '#ef4444', 0)
      setPhase('prompt')
      return
    }

    if (hash === PASS_HASH) {
      localStorage.setItem(ATTEMPTS_KEY, '0')
      localStorage.removeItem(LOCKOUT_KEY)
      sessionStorage.setItem('dev_auth', 'true')
      await push('', '#fff', 100)
      await push('✓ Passphrase accepted.', '#4ade80', 200)
      await push('✓ Developer session started.', '#4ade80', 450)
      await push('Loading dashboard...', '#6b7280', 700)
      setPhase('authed')
      setTimeout(() => navigate('/dev/dashboard', { replace: true }), 1300)
    } else {
      const prev = parseInt(localStorage.getItem(ATTEMPTS_KEY) || '0', 10)
      const attempts = prev + 1
      localStorage.setItem(ATTEMPTS_KEY, String(attempts))

      const remaining_attempts = MAX_ATTEMPTS - attempts

      await push('', '#fff', 100)
      await push('✗ Access denied. Invalid passphrase.', '#ef4444', 200)

      if (attempts >= MAX_ATTEMPTS) {
        const lockUntil = Date.now() + LOCKOUT_MS
        localStorage.setItem(LOCKOUT_KEY, String(lockUntil))
        await push(`✗ Too many failed attempts. Locked for 10 minutes.`, '#ef4444', 450)
        startLockoutTimer(LOCKOUT_MS)
      } else {
        await push(`  ${remaining_attempts} attempt(s) remaining before lockout.`, '#fbbf24', 450)
        await push('', '#fff', 700)
        await push('Enter passphrase to continue:', '#e5e7eb', 900)
        setPhase('prompt')
        inputRef.current?.focus()
      }
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
            <span style={{ marginLeft: 'auto', color: '#1f2937', fontSize: 11 }}>
              PBKDF2 · {ITERATIONS.toLocaleString()} iter
            </span>
          </div>

          {/* Output */}
          <div style={{
            padding: '20px 20px 4px',
            minHeight: 240,
            maxHeight: '60svh',
            overflowY: 'auto',
          }}>
            {lines.map((l, i) => (
              <div key={i} style={{ color: l.color, fontSize: 13, lineHeight: '22px', whiteSpace: 'pre-wrap' }}>
                {l.text}
              </div>
            ))}

            {/* Countdown display */}
            {phase === 'locked' && countdown > 0 && (
              <div style={{
                margin: '12px 0',
                padding: '10px 14px',
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 8,
              }}>
                <span style={{ color: '#ef4444', fontSize: 13 }}>
                  ⏳ Locked — retry in {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, '0')}
                </span>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} style={{ padding: '8px 20px 20px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: phase === 'locked' ? '#374151' : '#f97316', fontSize: 13, flexShrink: 0 }}>{'>'}</span>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              type={masked ? 'password' : 'text'}
              disabled={!canType}
              autoComplete="off"
              spellCheck={false}
              placeholder={phase === 'locked' ? 'locked...' : phase === 'checking' ? 'verifying...' : ''}
              style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: '#e5e7eb',
                fontSize: 13,
                fontFamily: 'inherit',
                flex: 1,
                caretColor: '#f97316',
              }}
            />
            <button
              type="button"
              onClick={() => setMasked(m => !m)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#374151', fontSize: 11, padding: '2px 6px', fontFamily: 'inherit',
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
        input::placeholder { color: #374151; }
      `}</style>
    </div>
  )
}
