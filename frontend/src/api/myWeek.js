import api from './axios'

/** The signed-in person's own week. `week` is any date inside it. */
export const getMyWeek = (week) => api.get('/my-week', { params: week ? { week } : {} })
