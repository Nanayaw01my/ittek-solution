import api from './axios'

export const getMyDepartments = () => api.get('/departments/mine')

/** Put a product into one of my departments. */
export const claimProduct = (id, aspect) => api.put(`/departments/product/${id}`, { aspect })
