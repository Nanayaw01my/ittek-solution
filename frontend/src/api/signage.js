import api from './axios'

/**
 * Everything the shop-wall board draws, in one call.
 *
 * The server decides what may appear on a screen customers stand in
 * front of — see backend/controllers/signageController.js. Nothing here
 * filters anything out, because nothing sensitive is ever sent.
 */
export const getSignageBoard = () => api.get('/signage/board')
