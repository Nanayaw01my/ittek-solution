import api from './axios'

/**
 * Which side of the business the money came from.
 *
 * Solar, networking and electricals are sold out of one till; this is the
 * only place they are told apart. Owners only — it carries cost and profit.
 */
export const getSalesByAspect = (params) => api.get('/aspects/sales', { params })

/** Correct a guess, from the screen that showed it. */
export const setProductAspect = (id, aspect) => api.put(`/aspects/product/${id}`, { aspect })

/** What the system makes of the whole catalogue, before anything is sold. */
export const getCatalogueAspects = () => api.get('/aspects/catalogue')

/** Write the guesses down, so they stop being guesses. */
export const autoSortAspects = () => api.post('/aspects/auto-sort', {}, { timeout: 0 })
