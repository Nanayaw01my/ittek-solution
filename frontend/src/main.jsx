import React from 'react'
import ReactDOM from 'react-dom/client'
import { Toaster } from 'react-hot-toast'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    <Toaster
      position="top-center"
      reverseOrder={false}
      gutter={8}
      containerClassName=""
      containerStyle={{
        top: 60,
      }}
      toastOptions={{
        duration: 4000,
        style: {
          background: '#fff',
          color: '#1a1a1a',
          borderRadius: '12px',
          padding: '12px 16px',
          fontSize: '14px',
          fontWeight: '500',
          boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
          maxWidth: '340px',
        },
        success: {
          iconTheme: {
            primary: '#2E7D32',
            secondary: '#fff',
          },
        },
        error: {
          iconTheme: {
            primary: '#D32F2F',
            secondary: '#fff',
          },
        },
      }}
    />
  </React.StrictMode>,
)
