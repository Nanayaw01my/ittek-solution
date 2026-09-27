import api from './axios'

export const getDamagedGoods = (params) => api.get('/damaged-goods', { params })
export const createDamagedGood = (data) => api.post('/damaged-goods', data)
/** What became of it — a replacement puts the goods back on the shelf. */
export const updateDamagedGood = (id, data) => api.put(`/damaged-goods/${id}`, data)
export const deleteDamagedGood = (id) => api.delete(`/damaged-goods/${id}`)
