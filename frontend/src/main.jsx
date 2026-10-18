import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import App from './App.jsx'
import { I18nProvider } from './i18n'
import { CurrencyProvider } from './contexts/CurrencyContext'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30000,
    },
  },
})

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-orange-50 flex items-center justify-center p-8">
          <div className="bg-white rounded-xl shadow-lg p-8 max-w-lg w-full">
            <h2 className="text-xl font-bold text-orange-600 mb-4">Application Error</h2>
            <pre className="text-sm text-gray-700 bg-gray-50 p-4 rounded-lg overflow-auto border border-gray-200 mb-4">
              {this.state.error?.message}
            </pre>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 font-semibold"
            >
              Reload Page
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

/**
 * Reload once when a new service worker takes over.
 *
 * The PWA is set to autoUpdate, but that only installs the new build in the
 * background — the tab keeps running the old bundle until the *next* load.
 * That one-reload lag is why a fresh deploy looks like "nothing changed".
 * Reloading on controllerchange makes a deploy land immediately instead.
 */
if ('serviceWorker' in navigator) {
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return // guard against a reload loop
    reloading = true
    window.location.reload()
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <I18nProvider>
          <CurrencyProvider>
            <App />
          </CurrencyProvider>
        </I18nProvider>
        {/*
          Below the header, not on top of it.
          Pinned to the top of the window, a toast landed squarely over the
          sticky top bar — covering the menu, the avatar and the title of the
          page it was talking about. The offset clears the 56px bar and
          whatever the phone reserves above it for the notch.
        */}
        <Toaster
          position="top-right"
          gutter={8}
          containerStyle={{
            top: 'calc(env(safe-area-inset-top, 0px) + 4rem)',
            right: 'max(env(safe-area-inset-right, 0px), 0.75rem)',
            left: '0.75rem',
          }}
          toastOptions={{
            duration: 4000,
            style: {
              background: '#fff',
              color: '#1e293b',
              borderRadius: '14px',
              padding: '12px 16px',
              fontSize: '14px',
              fontWeight: '500',
              boxShadow: '0 10px 30px rgba(15,23,42,0.14)',
              // Room to be read on a phone; capped so it does not sprawl on
              // a desktop.
              maxWidth: 'min(420px, 100%)',
              width: 'fit-content',
              marginLeft: 'auto',
              border: '1px solid #e5e7eb',
            },
            success: { iconTheme: { primary: '#10b981', secondary: '#fff' } },
            error: { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
          }}
        />
      </BrowserRouter>
    </QueryClientProvider>
  </ErrorBoundary>
)
