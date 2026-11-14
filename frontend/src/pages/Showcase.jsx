import React, { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  FiUploadCloud, FiTrash2, FiEye, FiEyeOff, FiArrowUp, FiArrowDown,
  FiPlayCircle, FiMonitor,
} from 'react-icons/fi'
import PageHeader from '../components/PageHeader'
import LoadingSpinner from '../components/LoadingSpinner'
import RefreshButton from '../components/RefreshButton'
import {
  getShowcase, addShowcase, updateShowcase, removeShowcase, uploadShowcaseFile,
} from '../api/showcase'

/**
 * What the shop shows of its own work, on the board in the window.
 *
 * The price board sells what is on the shelf; these are the slides
 * between the prices — a roof of panels in Prestea, an inverter wired
 * into a shop, a crew on a ladder. Photographs and short films.
 *
 * Deliberately a plain list rather than a gallery: the questions a
 * manager has here are "what is on the board", "in what order" and "take
 * that one off", and all three are answered faster by a row than by a
 * grid of thumbnails somebody has to hover over.
 */
export default function Showcase() {
  const queryClient = useQueryClient()
  const fileRef = useRef(null)
  const [progress, setProgress] = useState(null)
  const [draft, setDraft] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['showcase'],
    queryFn: () => getShowcase().then((r) => r.data),
  })
  const items = Array.isArray(data) ? data : []
  const live = items.filter((i) => i.is_active).length

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['showcase'] })

  const save = useMutation({
    mutationFn: addShowcase,
    onSuccess: () => { toast.success('Added to the board.'); setDraft(null); refresh() },
    onError: (e) => toast.error(e.response?.data?.message || 'Could not add that'),
  })
  const edit = useMutation({
    mutationFn: ({ id, ...body }) => updateShowcase(id, body),
    onSuccess: refresh,
    onError: (e) => toast.error(e.response?.data?.message || 'Could not save'),
  })
  const drop = useMutation({
    mutationFn: removeShowcase,
    onSuccess: () => { toast.success('Removed.'); refresh() },
    onError: (e) => toast.error(e.response?.data?.message || 'Could not remove'),
  })

  const pick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    // Said before the upload rather than after it fails: a minute of
    // uploading a file the server will refuse is a minute wasted on a
    // connection the shop pays for.
    const isVideo = file.type.startsWith('video/')
    if (isVideo && file.size > 60 * 1024 * 1024) {
      toast.error(`That film is ${(file.size / 1024 / 1024).toFixed(0)}MB. The limit is 60MB — trim it first.`)
      return
    }

    setProgress(0)
    try {
      const r = await uploadShowcaseFile(file, setProgress)
      const d = r.data || {}
      // Not saved yet: the caption is worth asking for while the person
      // still remembers which job this was.
      setDraft({
        kind: d.kind || (isVideo ? 'video' : 'image'),
        url: d.url,
        poster_url: d.poster_url,
        public_id: d.public_id,
        bytes: d.bytes,
        caption: '',
        location: '',
        seconds: 12,
      })
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed')
    } finally {
      setProgress(null)
    }
  }

  const move = (item, by) => {
    const sorted = [...items].sort((a, b) => a.sort_order - b.sort_order)
    const i = sorted.findIndex((x) => x._id === item._id)
    const j = i + by
    if (i < 0 || j < 0 || j >= sorted.length) return
    // Swap the two orders, so moving one slide never renumbers the rest.
    edit.mutate({ id: sorted[i]._id, sort_order: sorted[j].sort_order })
    edit.mutate({ id: sorted[j]._id, sort_order: sorted[i].sort_order })
  }

  if (isLoading) return <div className="p-6"><LoadingSpinner text="Loading…" /></div>

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <PageHeader
        title="Our Work"
        subtitle="Photos and videos shown between the prices on the shop board"
        action={<RefreshButton keys={[['showcase']]} />}
      />

      <div className="bg-white border-2 border-gray-900 rounded-2xl p-4 mb-5">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={progress !== null}
            className="inline-flex items-center gap-2 px-4 py-3 bg-orange-500 hover:bg-orange-600
                       disabled:opacity-50 text-white rounded-xl font-black"
          >
            <FiUploadCloud size={17} />
            {progress !== null ? `Uploading ${progress}%` : 'Add a photo or video'}
          </button>
          <input ref={fileRef} type="file" className="hidden" onChange={pick}
                 accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm" />
          <p className="text-xs text-gray-600 font-semibold">
            Photos up to 5MB, videos up to 60MB. {live} showing on the board now.
          </p>
        </div>

        {progress !== null && (
          <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-orange-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}

        <p className="text-[11px] text-gray-500 mt-3 leading-relaxed">
          Films play without sound — no browser allows a page to start audio by itself,
          and a board talking over the counter is not what anybody wants. Keep them
          short: the board gives each one up to 45 seconds before moving on.
        </p>
      </div>

      {/* What was just uploaded, waiting to be described. */}
      {draft && (
        <div className="bg-orange-50 border-2 border-orange-400 rounded-2xl p-4 mb-5">
          <p className="font-black text-gray-900 mb-3">What is this a picture of?</p>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="w-full sm:w-56 h-36 rounded-xl overflow-hidden bg-gray-900 shrink-0">
              {draft.kind === 'video'
                ? <video src={draft.url} poster={draft.poster_url} muted className="w-full h-full object-cover" />
                : <img src={draft.url} alt="" className="w-full h-full object-cover" />}
            </div>
            <div className="flex-1 space-y-3">
              <input
                autoFocus
                value={draft.caption}
                onChange={(e) => setDraft({ ...draft, caption: e.target.value })}
                placeholder="e.g. 5kVA solar installation"
                aria-label="Caption"
                maxLength={120}
                className="w-full px-3 py-2.5 border-2 border-gray-900 rounded-xl font-bold
                           focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
              <div className="flex flex-wrap gap-3">
                <input
                  value={draft.location}
                  onChange={(e) => setDraft({ ...draft, location: e.target.value })}
                  placeholder="Town — e.g. Prestea"
                  aria-label="Location"
                  maxLength={80}
                  className="flex-1 min-w-[10rem] px-3 py-2.5 border border-gray-300 rounded-xl text-sm
                             focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                {draft.kind === 'image' && (
                  <label className="flex items-center gap-2 text-sm font-bold text-gray-700">
                    Hold for
                    <input
                      type="number" min={4} max={60}
                      value={draft.seconds}
                      onChange={(e) => setDraft({ ...draft, seconds: Number(e.target.value) })}
                      aria-label="Seconds on screen"
                      className="w-20 px-2 py-2 border border-gray-300 rounded-xl text-sm"
                    />
                    secs
                  </label>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => save.mutate(draft)}
                  disabled={save.isPending}
                  className="px-4 py-2.5 bg-gray-900 text-white rounded-xl font-black disabled:opacity-50"
                >
                  {save.isPending ? 'Saving…' : 'Put it on the board'}
                </button>
                {/* The file is already on Cloudinary at this point, so
                    discarding it here leaves it behind. Said plainly
                    rather than pretending the upload can be taken back. */}
                <button
                  onClick={() => setDraft(null)}
                  className="px-4 py-2.5 border-2 border-gray-300 text-gray-700 rounded-xl font-bold"
                >
                  Discard
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <div className="bg-white border-2 border-gray-900 rounded-2xl p-10 text-center">
          <FiMonitor size={28} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm font-black text-gray-800">Nothing on the board yet.</p>
          <p className="text-xs text-gray-500 mt-1">
            Add a photo of a job you have finished. It will show between the prices.
          </p>
        </div>
      ) : (
        <div className="bg-white border-2 border-gray-900 rounded-2xl overflow-hidden divide-y divide-gray-100">
          {[...items].sort((a, b) => a.sort_order - b.sort_order).map((it) => (
            <div key={it._id} className={`flex items-center gap-3 p-3 ${it.is_active ? '' : 'opacity-50'}`}>
              <div className="w-24 h-16 rounded-lg overflow-hidden bg-gray-900 shrink-0 relative">
                {it.kind === 'video'
                  ? <>
                      <video src={it.url} poster={it.poster_url} muted className="w-full h-full object-cover" />
                      <FiPlayCircle className="absolute inset-0 m-auto text-white/90" size={22} />
                    </>
                  : <img src={it.url} alt="" className="w-full h-full object-cover" />}
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-black text-gray-900 truncate">{it.caption || '(no caption)'}</p>
                <p className="text-[11px] text-gray-500 font-semibold">
                  {it.kind === 'video' ? 'Video' : `Photo · ${it.seconds}s`}
                  {it.location ? ` · ${it.location}` : ''}
                  {it.bytes ? ` · ${(it.bytes / 1024 / 1024).toFixed(1)}MB` : ''}
                </p>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => move(it, -1)} aria-label="Move up"
                        className="p-2 text-gray-500 hover:text-gray-900 rounded-lg hover:bg-gray-50">
                  <FiArrowUp size={15} />
                </button>
                <button onClick={() => move(it, 1)} aria-label="Move down"
                        className="p-2 text-gray-500 hover:text-gray-900 rounded-lg hover:bg-gray-50">
                  <FiArrowDown size={15} />
                </button>
                <button
                  onClick={() => edit.mutate({ id: it._id, is_active: !it.is_active })}
                  aria-label={it.is_active ? 'Take off the board' : 'Put back on the board'}
                  title={it.is_active ? 'Showing — click to hide' : 'Hidden — click to show'}
                  className={`p-2 rounded-lg hover:bg-gray-50 ${it.is_active ? 'text-green-600' : 'text-gray-400'}`}
                >
                  {it.is_active ? <FiEye size={15} /> : <FiEyeOff size={15} />}
                </button>
                <button
                  onClick={() => {
                    // Deleting takes the file off Cloudinary with it, so
                    // it is the one action here that cannot be undone.
                    if (window.confirm('Remove this from the board? The file is deleted too.')) {
                      drop.mutate(it._id)
                    }
                  }}
                  aria-label="Remove"
                  className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                >
                  <FiTrash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
