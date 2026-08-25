import api from './axios'

export const getBlankReceiptForm = (params) =>
  api.get('/forms/blank-receipt', { params, responseType: 'blob' })

export const getFilledReceiptForm = (data) =>
  api.post('/forms/receipt', data, { responseType: 'blob' })

export const getFreezerPlanSheet = (params) =>
  api.get('/forms/freezer-plan', { params, responseType: 'blob' })
