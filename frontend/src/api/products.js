import api from './axios'

export const getProducts = (params) => api.get('/products', { params })
export const getProduct = (id) => api.get(`/products/${id}`)
export const createProduct = (data) => api.post('/products', data)
export const updateProduct = (id, data) => api.put(`/products/${id}`, data)
export const deleteProduct = (id) => api.delete(`/products/${id}`)
export const searchProducts = (query) => api.post('/products/search', { query })
export const getProductByBarcode = (barcode) => api.get(`/products/barcode/${barcode}`)
export const getLowStockProducts = () => api.get('/products/low-stock')

export const getCategories = () => api.get('/categories')
export const createCategory = (data) => api.post('/categories', data)
export const updateCategory = (id, data) => api.put(`/categories/${id}`, data)
export const deleteCategory = (id) => api.delete(`/categories/${id}`)

export const getSuppliers = () => api.get('/suppliers')
export const createSupplier = (data) => api.post('/suppliers', data)
export const updateSupplier = (id, data) => api.put(`/suppliers/${id}`, data)
export const deleteSupplier = (id) => api.delete(`/suppliers/${id}`)

export const previewProductImport = (file) => {
  const form = new FormData()
  form.append('file', file)
  return api.post('/products/import/preview', form)
}

export const commitProductImport = (rows) => api.post('/products/import/commit', { rows })
