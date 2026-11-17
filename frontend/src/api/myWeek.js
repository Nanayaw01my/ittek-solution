import api from './axios'

/** The signed-in person's own week. `week` is any date inside it. */
export const getMyWeek = (week) => api.get('/my-week', { params: week ? { week } : {} })

/**
 * The attendant's own dashboard: their day, their week, what they sold.
 * Scoped on the server to the person asking — see myWeekController.
 */
export const getMyToday = () => api.get('/my-week/today')
