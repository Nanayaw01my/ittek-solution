import api from './axios'

/** What to order, from how fast each product actually sells. */
export const getReorderSuggestions = (params) => api.get('/reorder', { params })
