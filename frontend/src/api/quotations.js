import api from './axios'

export const getQuotations = (params) => api.get('/quotations', { params })
export const getQuotation = (id) => api.get(`/quotations/${id}`)
export const createQuotation = (data) => api.post('/quotations', data)
export const updateQuotation = (id, data) => api.put(`/quotations/${id}`, data)
/** The customer said yes: writes the sale and moves the stock. */
export const acceptQuotation = (id, data) => api.post(`/quotations/${id}/accept`, data)
export const deleteQuotation = (id) => api.delete(`/quotations/${id}`)

/**
 * The estimate as a sheet to hand the customer.
 *
 * A quotation that lives only in the system is half a quotation — the figure
 * still ends up written on paper, and then nothing knows what was promised.
 */
export const getQuotationPdf = (id) =>
  api.get(`/quotations/${id}/pdf`, { responseType: 'blob' })
