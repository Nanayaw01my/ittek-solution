import api from './axios'

export const getFraudAlerts = (params) => api.get('/fraud/alerts', { params })
export const reviewFraudAlert = (id, data) => api.patch(`/fraud/alerts/${id}`, data)
export const runFraudScan = () => api.post('/fraud/scan')
