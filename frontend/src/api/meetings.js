import api from './axios'

export const getMeetings = (params) => api.get('/meetings', { params })

/** Owner only. audience is 'everyone' | 'roles' | 'people'. */
export const createMeeting = (data) => api.post('/meetings', data)
export const updateMeeting = (id, data) => api.put(`/meetings/${id}`, data)

/**
 * Asking to be let into the call.
 *
 * This is the only call that returns the room key, and it is the moment
 * the server decides whether this person may be in the meeting at all.
 * It also returns where the phones should look for each other and how
 * many cameras the room will carry.
 */
export const joinMeeting = (id) => api.post(`/meetings/${id}/join`)
export const leaveMeeting = (id) => api.post(`/meetings/${id}/leave`)
export const endMeeting = (id) => api.post(`/meetings/${id}/end`)

/**
 * Where the signalling socket lives.
 *
 * Built from the page's own address rather than configured, so it
 * follows the app wherever it is deployed and uses wss:// on https://
 * without anybody having to remember to change it. In development the
 * Vite dev server runs on a different port from the API, so VITE_API_URL
 * decides the host when it is set.
 */
export const signalUrl = (roomKey) => {
  const base = import.meta.env.VITE_API_URL
  const http = base ? new URL(base, window.location.origin) : window.location
  const proto = http.protocol === 'https:' ? 'wss:' : 'ws:'
  const token = localStorage.getItem('ittek_token') || ''
  return `${proto}//${http.host}/ws/meeting?room=${encodeURIComponent(roomKey)}&token=${encodeURIComponent(token)}`
}
