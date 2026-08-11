import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
})

// Request interceptor - attach Bearer token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('ittek_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor - unwrap { success, data, message } envelope + handle 401
api.interceptors.response.use(
  (response) => {
    // Backend always returns { success: true, data: ..., message: '...' }
    // Unwrap so callers get the actual data directly via response.data
    if (
      response.data &&
      typeof response.data === 'object' &&
      'success' in response.data &&
      'data' in response.data
    ) {
      response.data = response.data.data
    }
    return response
  },
  (error) => {
    // Pages that are meant to work without a login. A 401 from a background
    // request must never bounce a customer reading their receipt to the login
    // form — they have no account and nothing to log in with.
    const PUBLIC_PATHS = [/^\/r\//, /^\/login$/]
    const onPublicPage = PUBLIC_PATHS.some((re) => re.test(window.location.pathname))

    if (error.response?.status === 401 && !onPublicPage) {
      localStorage.removeItem('ittek_token')
      localStorage.removeItem('ittek_auth')
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export default api
