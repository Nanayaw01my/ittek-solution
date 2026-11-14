import api from './axios'

/** The shop's own work, as managed. The board gets its copy inside /signage/board. */
export const getShowcase = () => api.get('/showcase')
export const addShowcase = (data) => api.post('/showcase', data)
export const updateShowcase = (id, data) => api.put(`/showcase/${id}`, data)
export const removeShowcase = (id) => api.delete(`/showcase/${id}`)

/**
 * Send the file itself.
 *
 * The same endpoint product photographs use, with folder=showcase —
 * which is what allows a video through and raises the size limit. It
 * returns the url, the Cloudinary id (kept so deleting the slide deletes
 * the file) and, for a film, a still from its first frame.
 */
export const uploadShowcaseFile = (file, onProgress) => {
  const body = new FormData()
  body.append('image', file)
  return api.post('/upload?folder=showcase', body, {
    // A 40MB video over shop wifi is a minute of nothing happening
    // otherwise, which everybody reads as a broken button.
    timeout: 5 * 60 * 1000,
    onUploadProgress: (e) => {
      if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100))
    },
  })
}
