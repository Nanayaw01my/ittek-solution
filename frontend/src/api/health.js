import api from './axios'

/** Whether the things that run on their own are actually running. */
export const getSystemHealth = () => api.get('/health/system')
/** Run whatever is outstanding now, rather than waiting for tomorrow. */
export const runJobsNow = () => api.post('/health/run-jobs')

/**
 * Credit agreement money that never reached the sales book.
 *
 * Payments recorded before the fix wrote no sale row, and the day's
 * takings are the sum of that day's rows — so they are missing from the
 * figures for the day they were taken. Reading is separate from
 * repairing on purpose: the shop sees which payments and how much before
 * anything is written.
 */
export const getCreditSalesGap = () => api.get('/health/credit-sales-gap')
/** @param {{today?: boolean, all?: boolean, keys?: string[]}} body */
export const repairCreditSales = (body) => api.post('/health/credit-sales-gap/repair', body)
