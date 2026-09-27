import api from './axios'

/** What the drawer should hold for a day, plus its cash-up if already closed. */
export const getDayReckoning = (date) => api.get('/cash-up/today', { params: { date } })
export const getCashUps = (params) => api.get('/cash-up', { params })
export const closeDay = (data) => api.post('/cash-up', data)
/** CEO only — erases a signed-off count. */
export const reopenDay = (id) => api.delete(`/cash-up/${id}`)
