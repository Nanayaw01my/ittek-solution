import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * The saved session, read straight from localStorage as the store is built.
 *
 * persist() restores the session too, but it does so *after* the first render.
 * For one render the store therefore said "not logged in" — and the route
 * guard, which runs on that render, redirected to /login and replaced the
 * history entry. Every full page load of the app bounced a signed-in user to
 * the login screen.
 *
 * That is merely annoying online. Offline it makes the whole till unusable:
 * the shop signs in while there is a connection and expects to keep working
 * without one, but reopening the app asks them to sign in again — and signing
 * in needs the server they do not have.
 *
 * Reading it here removes the window entirely: the very first render already
 * knows who is signed in. persist still owns writing it back.
 */
const savedSession = () => {
  try {
    const raw = localStorage.getItem('ittek_auth');
    if (!raw) return { user: null, token: null };
    const parsed = JSON.parse(raw);
    const state = parsed?.state || {};
    return { user: state.user ?? null, token: state.token ?? null };
  } catch {
    // Corrupt or unavailable storage means signed out, not a broken app.
    return { user: null, token: null };
  }
}

const useAuthStore = create(
  persist(
    (set, get) => ({
      ...savedSession(),

      login: (userData, token) => {
        set({ user: userData, token })
        if (token) localStorage.setItem('ittek_token', token)
      },

      logout: () => {
        set({ user: null, token: null })
        localStorage.removeItem('ittek_token')
        localStorage.removeItem('ittek_auth')
      },

      updateUser: (userData) => {
        set((state) => ({ user: { ...state.user, ...userData } }))
      },

      get isAuthenticated() {
        return !!get().token && !!get().user
      },

      hasRole: (roles) => {
        const { user } = get()
        if (!user) return false
        if (typeof roles === 'string') return user.role === roles
        return roles.includes(user.role)
      },

      canAccess: (minLevel) => {
        const { user } = get()
        if (!user) return false
        const levels = { 'Sales': 1, 'Manager': 2, 'CEO': 3, 'Super Admin': 4 }
        return (levels[user.role] || 0) >= minLevel
      },
    }),
    {
      name: 'ittek_auth',
      partialize: (state) => ({ user: state.user, token: state.token }),
    }
  )
)

export default useAuthStore
