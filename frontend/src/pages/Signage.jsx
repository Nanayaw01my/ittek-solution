import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getSignageBoard } from '../api/signage'
import { FiMaximize, FiMinimize } from 'react-icons/fi'
import { formatCurrency } from '../utils/helpers'

/**
 * The price board on the shop wall.
 *
 * Not a page somebody reads — a thing on a wall that a customer glances
 * at from four metres away while waiting to be served. That one fact
 * decides nearly everything here:
 *
 *   - the type is enormous, because the viewing distance is the room,
 *     not arm's length;
 *   - it is dark, because a bright screen in a shop is a lamp, and
 *     because black costs a television nothing to display;
 *   - there is no chrome at all. No sidebar, no header, no back button.
 *     A customer must not be one stray tap from the till, and staff
 *     walking past must not be able to wander into it by accident;
 *   - nothing moves quickly. Pages turn every twelve seconds, which is
 *     long enough to read eight prices and short enough that nobody
 *     waits for their item to come round again.
 *
 * It is built to be switched on in the morning and left until closing,
 * so everything that could drift over fourteen hours is handled: the
 * data refreshes itself, the clock ticks, the page keeps turning after
 * the screen has been asleep, and the device is asked to stay awake.
 */

/** The shop's three sides, so a glance tells you which aisle to walk to. */
const ASPECTS = {
  solar: { label: 'SOLAR', colour: '#F97316' },
  networking: { label: 'IT', colour: '#2563eb' },
  electrical: { label: 'ELECTRICALS', colour: '#16a34a' },
  other: { label: '', colour: '#64748b' },
}

const PER_PAGE = 8
const PAGE_SECONDS = 12

export default function Signage() {
  const [page, setPage] = useState(0)
  const [now, setNow] = useState(new Date())

  const { data, isLoading, isError, dataUpdatedAt } = useQuery({
    queryKey: ['signage-board'],
    queryFn: () => getSignageBoard().then((r) => r.data),
    // Prices change when somebody edits a product, which is rare; a
    // minute is quick enough and costs the shop's connection almost
    // nothing over a whole day.
    refetchInterval: 60000,
    // A board that blanks because the wifi hiccuped is worse than a
    // board showing prices from a minute ago.
    staleTime: 5 * 60 * 1000,
    retry: 3,
  })

  const products = data?.products || []
  const pages = Math.max(1, Math.ceil(products.length / PER_PAGE))

  /**
   * Turn the page, on a timer that cannot drift out of step.
   *
   * Keyed on the number of pages so that a product added or sold out
   * mid-afternoon does not leave the board cycling past a page that is
   * no longer there.
   */
  useEffect(() => {
    const id = setInterval(() => setPage((p) => (p + 1) % pages), PAGE_SECONDS * 1000)
    return () => clearInterval(id)
  }, [pages])

  useEffect(() => { if (page >= pages) setPage(0) }, [page, pages])

  // The clock. A board with yesterday's time on it reads as a board with
  // yesterday's prices on it.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 10000)
    return () => clearInterval(id)
  }, [])

  /**
   * Ask the device not to fall asleep.
   *
   * Best effort and nothing more: most televisions ignore it, some
   * tablets honour it, and the browser drops the lock whenever the tab
   * is hidden — so it is taken again when the tab comes back. A shop
   * that finds the screen dark at eleven should turn sleep off in the
   * device's own settings; no web page can do that for them.
   */
  const lock = useRef(null)
  useEffect(() => {
    let cancelled = false
    const take = async () => {
      try {
        if (document.visibilityState !== 'visible') return
        if (!navigator.wakeLock?.request) return
        lock.current = await navigator.wakeLock.request('screen')
      } catch { /* refused, or unsupported — the board still works */ }
    }
    take()
    const onVisible = () => { if (!cancelled) take() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      lock.current?.release?.().catch(() => {})
    }
  }, [])


  /**
   * Getting rid of the browser.
   *
   * A board with an address bar across the top is a laptop someone left
   * open, not a sign. The browser will only go away when a person asks
   * it to — no page may put itself full screen unprompted — so there has
   * to be a button, and a customer-facing board is the last place for a
   * button to sit permanently.
   *
   * So it hides. Touch the screen or move a mouse and it fades in for
   * four seconds, long enough to aim at; then the board is a board
   * again, cursor and all. Staff learn it in one go: tap the screen,
   * press the icon.
   */
  const [full, setFull] = useState(false)
  const [showControls, setShowControls] = useState(false)
  const hideTimer = useRef(null)

  const wake = useCallback(() => {
    setShowControls(true)
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setShowControls(false), 4000)
  }, [])

  useEffect(() => () => clearTimeout(hideTimer.current), [])

  // Tracked rather than assumed: the viewer can leave full screen with
  // Escape at any moment, and a button still offering to do what has
  // already been undone is how people end up pressing it twice.
  useEffect(() => {
    const sync = () => setFull(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', sync)
    sync()
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])

  const toggleFull = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen()
    } catch {
      // Some television browsers refuse it outright. Nothing to say to a
      // room of customers about it; the board carries on as it was.
    }
  }

  const shop = data?.shop || {}
  const promo = data?.promo || null
  const shown = products.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE)
  // Older than five minutes means the board has lost the shop, not that
  // the shop has no prices. Said quietly, in the corner, rather than
  // across a screen customers are reading.
  const stale = dataUpdatedAt && Date.now() - dataUpdatedAt > 5 * 60 * 1000

  return (
    /*
      Exactly one screen, never more.

      min-h-screen let the grid grow past the bottom of a 1920×1080
      television, which pushed the shop's phone number off the screen —
      on the one display whose whole job is to be read from across the
      room, with nobody standing there to scroll it. h-screen with the
      grid as the only thing allowed to shrink keeps the header, the
      promotion and the phone number fixed and divides whatever is left
      between the prices.

      Sizes are in vh rather than vw because height is what runs out
      first: the same board on a 4:3 office monitor and a wide television
      should show eight prices either way.
    */
    <div className="h-screen bg-gray-950 text-white flex flex-col overflow-hidden select-none relative"
         onMouseMove={wake}
         onTouchStart={wake}
         style={{ cursor: showControls ? 'default' : 'none' }}>

      {/* Header: who you are standing in front of */}
      <div className="shrink-0 flex items-center justify-between gap-6 px-[2.5vw] py-[1.8vh] border-b-4 border-orange-500">
        <div className="min-w-0">
          <h1 className="text-[4.4vh] font-black leading-none tracking-tight truncate">
            {shop.name || 'ITTEK Solution'}
          </h1>
          {shop.address && (
            <p className="text-[2vh] text-gray-400 font-bold mt-[0.6vh] truncate">{shop.address}</p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-[4.4vh] font-black leading-none tabular-nums">
            {now.toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit', hour12: false })}
          </p>
          <p className="text-[1.8vh] text-gray-400 font-bold mt-[0.6vh]">
            {now.toLocaleDateString('en-GH', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
      </div>

      {/* The prices */}
      <div className="flex-1 min-h-0 px-[2.5vw] py-[1.6vh]">
        {isLoading ? (
          <p className="text-[3vh] text-gray-500 font-black">Loading prices…</p>
        ) : isError && products.length === 0 ? (
          // Never a stack trace and never an empty grid pretending to be
          // a price list. A customer reading this should learn nothing
          // except that the board is not currently worth reading.
          <div className="h-full grid place-items-center text-center">
            <div>
              <p className="text-[5vh] font-black">{shop.name || 'ITTEK Solution'}</p>
              <p className="text-[2.6vh] text-gray-400 font-bold mt-[2vh]">
                Please ask at the counter for today's prices.
              </p>
            </div>
          </div>
        ) : (
          <div className="h-full grid grid-cols-2 grid-rows-4 gap-[1.4vh]">
            {shown.map((p) => {
              const a = ASPECTS[p.aspect] || ASPECTS.other
              return (
                <div key={p.id}
                     className="min-h-0 overflow-hidden rounded-2xl bg-gray-900 border-l-[0.9vh] px-[1.6vw] py-[1.2vh] flex items-center gap-[1.2vw]"
                     style={{ borderLeftColor: a.colour }}>
                  <div className="flex-1 min-w-0">
                    {a.label && (
                      <p className="text-[1.5vh] font-black tracking-[0.12em]" style={{ color: a.colour }}>
                        {a.label}
                      </p>
                    )}
                    <p className="text-[2.9vh] font-black leading-tight mt-[0.3vh] line-clamp-2">
                      {p.name}
                    </p>
                    {/* Said only when it is nearly gone, because that is
                        the only time it is information rather than noise. */}
                    {p.left !== null && (
                      <p className="text-[1.7vh] font-black text-amber-400 mt-[0.5vh]">
                        ONLY {p.left} LEFT
                      </p>
                    )}
                  </div>
                  <p className="text-[4vh] font-black tabular-nums whitespace-nowrap shrink-0">
                    {formatCurrency(p.price)}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer: the promotion if one is running, then how to reach the shop */}
      <div className="shrink-0">
        {promo && (
          <div className="bg-orange-500 px-[2.5vw] py-[1.3vh] text-center">
            <p className="text-[2.9vh] font-black leading-tight">
              Spend {formatCurrency(promo.threshold)} today and take home a {promo.gift}
            </p>
          </div>
        )}
        <div className="flex items-center justify-between gap-4 px-[2.5vw] py-[1.4vh] border-t border-gray-800">
          <p className="text-[2.4vh] font-black text-gray-300 truncate">
            {shop.phone ? `Call us on ${shop.phone}` : 'Ask at the counter'}
          </p>
          <div className="flex items-center gap-[1.2vw] shrink-0">
            {/* Which page of how many, so a customer waiting for an item
                knows whether it is worth standing there. */}
            {pages > 1 && (
              <div className="flex gap-[0.5vw]">
                {Array.from({ length: pages }).map((_, i) => (
                  <span key={i}
                        className={`rounded-full ${i === page ? 'bg-orange-500' : 'bg-gray-700'}`}
                        style={{ width: '1.2vh', height: '1.2vh' }} />
                ))}
              </div>
            )}
            {stale && (
              <span className="text-[1.5vh] font-black text-gray-600">OFFLINE</span>
            )}

            {/*
              The only control on the board, and it is invisible until
              asked for. In the footer rather than the top corner: up
              there it sat squarely on the clock, which is one of the two
              things on this screen a customer actually reads. Down here
              it has the strip to itself.
            */}
            <button
              onClick={toggleFull}
              aria-label={full ? 'Leave full screen' : 'Full screen'}
              className={`rounded-lg bg-white/10 hover:bg-white/20 p-[1vh] transition-opacity duration-300
                          ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
            >
              {full
                ? <FiMinimize style={{ width: '2.4vh', height: '2.4vh' }} />
                : <FiMaximize style={{ width: '2.4vh', height: '2.4vh' }} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
