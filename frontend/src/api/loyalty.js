import api from './axios'

export const lookupLoyalty = (phone, cart_total = 0) =>
  api.get('/loyalty/lookup', { params: { phone, cart_total } })
export const getLoyaltyAccounts = (params) => api.get('/loyalty/accounts', { params })
export const getLoyaltyAccount = (id) => api.get(`/loyalty/accounts/${id}`)
export const adjustLoyaltyPoints = (id, data) => api.post(`/loyalty/accounts/${id}/adjust`, data)
