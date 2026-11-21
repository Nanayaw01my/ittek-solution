import api from './axios'

/** What each department is aiming for in a given month. */
export const getTargets = (params) => api.get('/targets', { params })

/** An owner setting a target, or recording progress by hand. */
export const setTarget = (data) => api.put('/targets', data)
