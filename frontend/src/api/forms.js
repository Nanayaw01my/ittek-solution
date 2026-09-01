import api from './axios'

export const getBlankReceiptForm = (params) =>
  api.get('/forms/blank-receipt', { params, responseType: 'blob' })

export const getFilledReceiptForm = (data) =>
  api.post('/forms/receipt', data, { responseType: 'blob' })

export const getInstallmentPlanSheet = (params) =>
  api.get('/forms/installment-plan', { params, responseType: 'blob' })

export const getPriceSheet = (params) =>
  api.get('/forms/price-sheet', { params, responseType: 'blob' })

// The standing iPhone offer, priced in config rather than typed in.
export const getIphonePlanSheet = () => api.get('/forms/iphone-plan', { responseType: 'blob' })

export const getPhonePlanSheet = (data) =>
  api.post('/forms/phone-plan', data, { responseType: 'blob' })

export const getAcceptanceLetter = (data) =>
  api.post('/forms/acceptance-letter', data, { responseType: 'blob' })
