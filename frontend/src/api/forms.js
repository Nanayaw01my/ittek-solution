import api from './axios'

export const getBlankReceiptForm = (params) =>
  api.get('/forms/blank-receipt', { params, responseType: 'blob' })

export const getFilledReceiptForm = (data) =>
  api.post('/forms/receipt', data, { responseType: 'blob' })

export const getInstallmentPlanSheet = (params) =>
  api.get('/forms/installment-plan', { params, responseType: 'blob' })

export const getPriceSheet = (params) =>
  api.get('/forms/price-sheet', { params, responseType: 'blob' })
