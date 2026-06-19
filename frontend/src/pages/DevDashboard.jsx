import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'

const INACTIVITY_MS = 30 * 60 * 1000  // 30 minutes auto-logout

const API_BASE = import.meta.env.VITE_API_URL || '/api'

const ROUTES = [
  { path: '/dashboard', label: 'Dashboard', level: 'Sales+' },
  { path: '/pos', label: 'POS', level: 'Sales+' },
  { path: '/expenses', label: 'Expenses', level: 'Sales+' },
  { path: '/notifications', label: 'Notifications', level: 'Sales+' },
  { path: '/refunds', label: 'Refunds', level: 'Sales+' },
  { path: '/debts', label: 'Debts', level: 'Manager+' },
  { path: '/stock-requests', label: 'Stock Requests', level: 'Manager+' },
  { path: '/credit-agreements', label: 'Credit Agreements', level: 'Manager+' },
  { path: '/products', label: 'Products', level: 'CEO+' },
  { path: '/categories', label: 'Categories', level: 'CEO+' },
  { path: '/suppliers', label: 'Suppliers', level: 'CEO+' },
  { path: '/purchases', label: 'Purchases', level: 'CEO+' },
  { path: '/workers', label: 'Workers', level: 'CEO+' },
  { path: '/financial', label: 'Financial', level: 'CEO+' },
  { path: '/reports', label: 'Reports', level: 'CEO+' },
  { path: '/users', label: 'Users', level: 'CEO+' },
  { path: '/sales-history', label: 'Sales History', level: 'CEO+' },
  { path: '/audit-logs', label: 'Audit Logs', level: 'CEO+' },
  { path: '/backup', label: 'Backup', level: 'CEO+' },
  { path: '/settings', label: 'Settings', level: 'CEO+' },
  { path: '/search', label: 'Search', level: 'CEO+' },
]

function Card({ title, children, accent = '#f97316' }) {
  return (
    <div style={{
      background: '#111',
      border: '1px solid #1f2937',
      borderRadius: 12,
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid #1f2937',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <div style={{ width: 3, height: 14, background: accent, borderRadius: 2, flexShrink: 0 }} />
        <span style={{ color: '#9ca3af', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          {title}
        </span>
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  )
}

function Row({ label, value, mono = false, valueColor = '#e5e7eb' }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, padding: '5px 0', borderBottom: '1px solid #1a1a1a' }}>
      <span style={{ color: '#6b7280', fontSize: 12, flexShrink: 0 }}>{label}</span>
      <span style={{
        color: valueColor, fontSize: 12, textAlign: 'right', wordBreak: 'break-all',
        fontFamily: mono ? "'Courier New', monospace" : 'inherit',
      }}>{value}</span>
    </div>
  )
}

export default function DevDashboard() {
  const navigate = useNavigate()
  const [apiHealth, setApiHealth] = useState('checking')
  const [apiLatency, setApiLatency] = useState(null)
  const [users, setUsers] = useState(null)
  const [auditLogs, setAuditLogs] = useState(null)
  const [authState, setAuthState] = useState({})
  const [now, setNow] = useState(new Date())
  const [idleSeconds, setIdleSeconds] = useState(0)
  const idleTimer = useRef(null)
  const idleCounter = useRef(null)

  useEffect(() => {
    if (sessionStorage.getItem('dev_auth') !== 'true') {
      navigate('/dev', { replace: true })
    }
  }, [navigate])

  // Inactivity auto-logout
  useEffect(() => {
    const resetIdle = () => {
      setIdleSeconds(0)
      clearTimeout(idleTimer.current)
      idleTimer.current = setTimeout(() => {
        sessionStorage.removeItem('dev_auth')
        navigate('/dev', { replace: true })
      }, INACTIVITY_MS)
    }

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll']
    events.forEach(e => window.addEventListener(e, resetIdle, { passive: true }))
    resetIdle()

    idleCounter.current = setInterval(() => setIdleSeconds(s => s + 1), 1000)

    return () => {
      events.forEach(e => window.removeEventListener(e, resetIdle))
      clearTimeout(idleTimer.current)
      clearInterval(idleCounter.current)
    }
  }, [navigate])

  const logout = () => {
    sessionStorage.removeItem('dev_auth')
    navigate('/dev', { replace: true })
  }

  const checkHealth = useCallback(async () => {
    setApiHealth('checking')
    const start = Date.now()
    try {
      await api.get('/health')
      setApiLatency(Date.now() - start)
      setApiHealth('ok')
    } catch (err) {
      const status = err.response?.status
      if (status && status !== 401 && status !== 404) {
        setApiLatency(Date.now() - start)
        setApiHealth('ok')
      } else if (status === 401 || status === 403) {
        setApiLatency(Date.now() - start)
        setApiHealth('ok')
      } else {
        setApiHealth('down')
        setApiLatency(null)
      }
    }
  }, [])

  const fetchUsers = useCallback(async () => {
    try {
      const res = await api.get('/users')
      setUsers(Array.isArray(res.data) ? res.data : null)
    } catch {
      setUsers(null)
    }
  }, [])

  const fetchLogs = useCallback(async () => {
    try {
      const res = await api.get('/audit-logs?limit=5')
      setAuditLogs(Array.isArray(res.data) ? res.data : res.data?.logs || null)
    } catch {
      setAuditLogs(null)
    }
  }, [])

  useEffect(() => {
    checkHealth()
    fetchUsers()
    fetchLogs()

    // Read auth store from localStorage
    try {
      const raw = localStorage.getItem('ittek_auth')
      const token = localStorage.getItem('ittek_token')
      const parsed = raw ? JSON.parse(raw) : null
      setAuthState({
        user: parsed?.state?.user || null,
        hasToken: !!token,
        tokenPreview: token ? token.slice(0, 20) + '...' : null,
      })
    } catch {
      setAuthState({ user: null, hasToken: false })
    }

    const tick = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(tick)
  }, [checkHealth, fetchUsers, fetchLogs])

  const healthColor = apiHealth === 'ok' ? '#4ade80' : apiHealth === 'down' ? '#ef4444' : '#fbbf24'
  const healthLabel = apiHealth === 'ok' ? `Online` : apiHealth === 'down' ? 'Unreachable' : 'Checking...'

  return (
    <div style={{
      minHeight: '100svh',
      background: '#0a0a0a',
      color: '#e5e7eb',
      fontFamily: "'Inter', -apple-system, sans-serif",
      overflowX: 'hidden',
    }}>

      {/* Header */}
      <div style={{
        background: '#111',
        borderBottom: '1px solid #1f2937',
        padding: '14px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Dot indicators */}
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444' }} />
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#fbbf24' }} />
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#4ade80' }} />
          </div>
          <div>
            <span style={{ color: '#f97316', fontWeight: 800, fontSize: 15 }}>ITTEK</span>
            <span style={{ color: '#6b7280', fontWeight: 600, fontSize: 15 }}> / dev</span>
          </div>
          <div style={{
            background: '#1a1a1a', border: '1px solid #374151',
            borderRadius: 6, padding: '2px 10px', fontSize: 11, color: '#fbbf24', fontWeight: 600,
          }}>
            DEVELOPER MODE
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ color: '#374151', fontSize: 11, fontFamily: 'monospace' }}>
            {now.toLocaleTimeString()}
          </span>
          {idleSeconds > 0 && (
            <span style={{
              fontSize: 11, fontFamily: 'monospace',
              color: idleSeconds > 1500 ? '#ef4444' : '#374151',
            }}>
              idle {Math.floor(idleSeconds / 60)}:{String(idleSeconds % 60).padStart(2, '0')}
            </span>
          )}
          <button
            onClick={checkHealth}
            style={{
              background: '#1f2937', border: '1px solid #374151', borderRadius: 8,
              color: '#9ca3af', fontSize: 12, fontWeight: 600, padding: '6px 14px',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Refresh
          </button>
          <button
            onClick={logout}
            style={{
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: 8, color: '#f87171', fontSize: 12, fontWeight: 600,
              padding: '6px 14px', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Logout
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '20px', maxWidth: 1200, margin: '0 auto' }}>

        {/* Top status bar */}
        <div style={{
          background: '#111',
          border: `1px solid ${apiHealth === 'ok' ? 'rgba(74,222,128,0.2)' : apiHealth === 'down' ? 'rgba(239,68,68,0.2)' : '#1f2937'}`,
          borderRadius: 12,
          padding: '12px 20px',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 24,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: healthColor, boxShadow: `0 0 8px ${healthColor}` }} />
            <span style={{ color: healthColor, fontWeight: 700, fontSize: 13 }}>API {healthLabel}</span>
            {apiLatency && <span style={{ color: '#6b7280', fontSize: 12 }}>{apiLatency}ms</span>}
          </div>
          <div style={{ color: '#4b5563', fontSize: 12, fontFamily: 'monospace' }}>
            {API_BASE}
          </div>
          <div style={{ color: '#4b5563', fontSize: 12 }}>
            ENV: <span style={{ color: '#6b7280' }}>{import.meta.env.MODE}</span>
          </div>
          {authState.hasToken && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80' }} />
              <span style={{ color: '#4ade80', fontSize: 12, fontWeight: 600 }}>
                Session: {authState.user?.username || 'unknown'}
                {authState.user?.role && <span style={{ color: '#6b7280' }}> ({authState.user.role})</span>}
              </span>
            </div>
          )}
        </div>

        {/* Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>

          {/* Environment */}
          <Card title="Environment">
            <Row label="API Base URL" value={API_BASE} mono />
            <Row label="Build Mode" value={import.meta.env.MODE} />
            <Row label="Dev Mode" value={import.meta.env.DEV ? 'true' : 'false'} valueColor={import.meta.env.DEV ? '#fbbf24' : '#6b7280'} />
            <Row label="Browser" value={navigator.userAgent.split(')')[0].split('(')[1] || navigator.userAgent} />
            <Row label="Screen" value={`${window.screen.width}×${window.screen.height}`} />
            <Row label="Viewport" value={`${window.innerWidth}×${window.innerHeight}`} />
            <Row label="Timestamp" value={now.toISOString()} mono />
          </Card>

          {/* Active Session */}
          <Card title="Active App Session" accent="#818cf8">
            {authState.hasToken ? (
              <>
                <Row label="Username" value={authState.user?.username || '—'} />
                <Row label="Role" value={authState.user?.role || '—'} valueColor="#f97316" />
                <Row label="User ID" value={authState.user?.id || '—'} mono />
                <Row label="Token" value={authState.tokenPreview} mono />
                <div style={{ marginTop: 10 }}>
                  <a
                    href="/dashboard"
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'inline-block', fontSize: 12, color: '#818cf8',
                      textDecoration: 'none', padding: '6px 12px',
                      background: 'rgba(129,140,248,0.1)', borderRadius: 8,
                      border: '1px solid rgba(129,140,248,0.2)',
                    }}
                  >
                    Open App →
                  </a>
                </div>
              </>
            ) : (
              <div style={{ color: '#6b7280', fontSize: 12 }}>
                No active user session in localStorage.
                <div style={{ marginTop: 10 }}>
                  <a href="/login" target="_blank" rel="noreferrer"
                    style={{ color: '#f97316', fontSize: 12 }}>Go to Login →</a>
                </div>
              </div>
            )}
          </Card>

          {/* Users */}
          <Card title="System Users" accent="#34d399">
            {users === null ? (
              <span style={{ color: '#4b5563', fontSize: 12 }}>
                {authState.hasToken ? 'Fetching...' : 'Requires active login session.'}
              </span>
            ) : users.length === 0 ? (
              <span style={{ color: '#4b5563', fontSize: 12 }}>No users found.</span>
            ) : (
              <>
                <div style={{ marginBottom: 8 }}>
                  <span style={{ color: '#34d399', fontSize: 22, fontWeight: 800 }}>{users.length}</span>
                  <span style={{ color: '#6b7280', fontSize: 12, marginLeft: 6 }}>total users</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
                  {users.map((u, i) => (
                    <div key={i} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '5px 8px', background: '#0d0d0d', borderRadius: 6,
                    }}>
                      <span style={{ color: '#e5e7eb', fontSize: 12 }}>{u.username}</span>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
                        background: u.role === 'Super Admin' ? 'rgba(249,115,22,0.2)' : u.role === 'CEO' ? 'rgba(129,140,248,0.15)' : 'rgba(107,114,128,0.15)',
                        color: u.role === 'Super Admin' ? '#f97316' : u.role === 'CEO' ? '#818cf8' : '#9ca3af',
                      }}>
                        {u.role}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>

          {/* Recent Audit Logs */}
          <Card title="Recent Audit Logs" accent="#fbbf24">
            {auditLogs === null ? (
              <span style={{ color: '#4b5563', fontSize: 12 }}>
                {authState.hasToken ? 'Fetching...' : 'Requires active login session.'}
              </span>
            ) : auditLogs.length === 0 ? (
              <span style={{ color: '#4b5563', fontSize: 12 }}>No logs found.</span>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {auditLogs.slice(0, 8).map((log, i) => (
                  <div key={i} style={{
                    padding: '7px 10px', background: '#0d0d0d', borderRadius: 8,
                    borderLeft: '3px solid #fbbf24',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ color: '#e5e7eb', fontSize: 11, fontWeight: 600 }}>
                        {log.action || log.event || log.type || 'Event'}
                      </span>
                      <span style={{ color: '#4b5563', fontSize: 10, flexShrink: 0 }}>
                        {log.created_at ? new Date(log.created_at).toLocaleTimeString() : ''}
                      </span>
                    </div>
                    <div style={{ color: '#6b7280', fontSize: 10, marginTop: 2 }}>
                      {log.user?.username || log.username || ''}{log.description ? ` — ${log.description}` : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* LocalStorage */}
          <Card title="LocalStorage Keys" accent="#a78bfa">
            {Object.keys(localStorage).length === 0 ? (
              <span style={{ color: '#4b5563', fontSize: 12 }}>Empty.</span>
            ) : (
              Object.keys(localStorage).map(key => (
                <Row
                  key={key}
                  label={key}
                  value={
                    localStorage.getItem(key)?.length > 60
                      ? localStorage.getItem(key).slice(0, 60) + '…'
                      : localStorage.getItem(key)
                  }
                  mono
                />
              ))
            )}
          </Card>

          {/* App Routes */}
          <Card title="App Route Map" accent="#38bdf8">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {ROUTES.map(r => (
                <a
                  key={r.path}
                  href={r.path}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '5px 8px', background: '#0d0d0d', borderRadius: 6,
                    textDecoration: 'none',
                  }}
                >
                  <span style={{ color: '#38bdf8', fontSize: 12, fontFamily: 'monospace' }}>{r.path}</span>
                  <span style={{
                    fontSize: 10, color: '#6b7280',
                    background: '#1f2937', borderRadius: 20, padding: '1px 7px',
                  }}>{r.level}</span>
                </a>
              ))}
            </div>
          </Card>

        </div>

        <p style={{ textAlign: 'center', color: '#1f2937', fontSize: 11, marginTop: 24, fontFamily: 'monospace' }}>
          dev session — not linked from the main app — session expires on tab close
        </p>
      </div>
    </div>
  )
}
