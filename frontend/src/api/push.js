import api from './axios'

export const getPushKey = () => api.get('/push/public-key')
export const subscribePush = (subscription) => api.post('/push/subscribe', subscription)
export const unsubscribePush = (endpoint) =>
  api.delete('/push/subscribe', { data: { endpoint } })
export const getPushDevices = () => api.get('/push/devices')
/** Sends one to this account's devices and reports exactly what happened. */
export const testPush = () => api.post('/push/test')
