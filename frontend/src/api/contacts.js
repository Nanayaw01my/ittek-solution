import api from './axios'

/**
 * The shop's contact book — everybody who ever left a number at the till.
 * It fills itself from sales; nothing here creates a contact by hand.
 */
export const getContacts = (params) => api.get('/contacts', { params })
export const getContactsSummary = () => api.get('/contacts/summary')
/** A birthday, a note, or "stop texting me". */
export const updateContact = (id, data) => api.put(`/contacts/${id}`, data)
/** Gather every number already sitting in a past sale into the book. */
export const backfillContacts = () => api.post('/contacts/backfill')
