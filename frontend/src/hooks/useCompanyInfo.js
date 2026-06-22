import { useQuery } from '@tanstack/react-query'
import api from '../api/axios'

export function useCompanyInfo() {
  return useQuery({
    queryKey: ['company-info'],
    queryFn: () => api.get('/settings/public').then(r => r.data),
    staleTime: 10 * 60 * 1000,
    retry: 1,
  })
}
