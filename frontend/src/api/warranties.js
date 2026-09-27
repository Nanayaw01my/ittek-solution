import api from './axios'

export const getWarranties = (params) => api.get('/warranties', { params })
/** The counter question: somebody is holding a unit — is it covered? */
export const checkWarranty = (serial) => api.get(`/warranties/check/${encodeURIComponent(serial)}`)
/** The lines on a sale that carry a warranty period. */
export const linesFromSale = (invoice) =>
  api.get(`/warranties/from-sale/${encodeURIComponent(invoice)}`)
export const createWarranty = (data) => api.post('/warranties', data)
export const claimWarranty = (id, data) => api.post(`/warranties/${id}/claim`, data)
export const deleteWarranty = (id) => api.delete(`/warranties/${id}`)
