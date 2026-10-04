import api from './axios'

/** Whether the things that run on their own are actually running. */
export const getSystemHealth = () => api.get('/health/system')
/** Run whatever is outstanding now, rather than waiting for tomorrow. */
export const runJobsNow = () => api.post('/health/run-jobs')
