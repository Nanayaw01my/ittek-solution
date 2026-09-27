import api from './axios'

/** People the shop knows, gathered from wherever their name was written down. */
export const lookupCustomers = (q) => api.get('/customer-lookup/lookup', { params: { q } })
export const getCustomerProfile = (phone) =>
  api.get(`/customer-lookup/profile/${encodeURIComponent(phone)}`)
