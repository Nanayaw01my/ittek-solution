import api from './axios'

/** The whole portal in one request — see directorController for why. */
export const getDirectorOverview = () => api.get('/director/overview')
