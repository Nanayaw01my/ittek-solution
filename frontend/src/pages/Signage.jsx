import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getSignageBoard } from '../api/signage'
import { FiMaximize, FiMinimize } from 'react-icons/fi'
import ProductArt from '../components/ProductArt'
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

/** Four prices a page, each one on its own photograph. */
const PER_PAGE = 4
const PAGE_SECONDS = 12
/** How many pages of prices run between one piece of the shop's work. */
const PAGES_BETWEEN_WORK = 2
/**
 * The longest a film may hold the board.
 *
 * A video that stalls halfway — a dropped connection, a file the device
 * will not decode — would otherwise freeze the board on one frame until
 * somebody noticed. Capped, the worst case is three-quarters of a minute
 * of a still picture rather than a screen stuck until closing.
 */
const MAX_VIDEO_SECONDS = 45

/**
 * The running order: pages of prices, with the shop's work between them.
 *
 * Built so one full cycle shows every photograph and every film exactly
 * once, however many prices there are. The alternative — picking the
 * next piece of work with a counter — looks the same on a screen with
 * four pages and quietly stops showing half the shop's work on a screen
 * with twenty.
 */
export const buildSlides = (products, showcase) => {
  const pages = []
  for (let i = 0; i < products.length; i += PER_PAGE) {
    pages.push({ key: `p${i}`, type: 'products', items: products.slice(i, i + PER_PAGE) })
  }
  if (!showcase.length) return pages
  if (!pages.length) return showcase.map((item) => ({ key: `w${item.id}`, type: 'work', item }))

  const out = []
  let w = 0
  pages.forEach((page, i) => {
    out.push(page)
    if ((i + 1) % PAGES_BETWEEN_WORK === 0 && w < showcase.length) {
      out.push({ key: `w${showcase[w].id}`, type: 'work', item: showcase[w] })
      w += 1
    }
  })
  // Work the interleaving did not reach — a shop with twelve photographs
  // and four pages of prices — goes on the end rather than being left
  // off the board entirely.
  while (w < showcase.length) {
    out.push({ key: `w${showcase[w].id}`, type: 'work', item: showcase[w] })
    w += 1
  }
  return out
}


/**
 * One piece of the shop's work, filling the screen.
 *
 * A photograph or a short film of a job done — a roof of panels, an
 * inverter wired in. Between pages of prices this is what people
 * actually watch: a price is read in a second, a job somebody
 * recognises holds the eye.
 *
 * Films play muted, because no browser will autoplay sound and a shop
 * does not want its board talking over the counter anyway. They play
 * once and hand the board on.
 */
function WorkSlide({ item, onDone }) {
  const [failed, setFailed] = useState(false)

  // A new slide is a new chance for the file to work. Without this, one
  // dropped connection would leave every later slide showing the fallback.
  useEffect(() => { setFailed(false) }, [item.id])

  return (
    <div className="relative h-full w-full overflow-hidden bg-gray-900">
      {failed ? (
        // The file would not load. The board says the shop's own name
        // rather than showing a broken picture to a room of customers.
        <div className="h-full grid place-items-center text-center px-[4vw]">
          <p className="text-[3.4vh] font-black text-gray-500">
            {item.caption || 'Our work'}
          </p>
        </div>
      ) : item.kind === 'video' ? (
        <video
          key={item.id}
          src={item.url}
          poster={item.poster_url || undefined}
          autoPlay
          muted
          playsInline
          // Not looped: it ends, and the board moves on. A looping film
          // with a twelve-second cut would hold the screen for as long
          // as the cap allows and show the same thing four times.
          onEnded={onDone}
          onError={() => setFailed(true)}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <img
          src={item.url}
          alt=""
          onError={() => setFailed(true)}
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}

      {(item.caption || item.location) && !failed && (
        <>
          <div className="absolute inset-x-0 bottom-0 h-[26vh]"
               style={{ background: 'linear-gradient(to top, rgba(3,7,18,.95), rgba(3,7,18,0))' }} />
          <div className="absolute left-0 right-0 bottom-0 px-[3vw] py-[3vh]">
            <p className="text-[1.6vh] font-black tracking-[0.18em] text-orange-500">OUR WORK</p>
            {item.caption && (
              <p className="text-[4.4vh] font-black leading-tight mt-[0.8vh]"
                 style={{ textShadow: '0 2px 14px rgba(0,0,0,.9)' }}>
                {item.caption}
              </p>
            )}
            {item.location && (
              <p className="text-[2.4vh] font-black text-gray-300 mt-[0.6vh]">{item.location}</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default function Signage() {
  const [index, setIndex] = useState(0)
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
  const showcase = data?.showcase || []

  // Rebuilt only when the content actually changes, so the board does not
  // jump back to the first slide every time the minute's refetch lands.
  const slides = React.useMemo(
    () => buildSlides(products, showcase),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [products.map((p) => p.id + ':' + p.price + ':' + p.left).join('|'),
      showcase.map((w) => w.id).join('|')]
  )
  const slide = slides[index] || null
  const next = useCallback(() => setIndex((i) => (slides.length ? (i + 1) % slides.length : 0)), [slides.length])

  /**
   * Hold each slide for as long as it is worth holding.
   *
   * A timeout per slide rather than one interval for all of them,
   * because they no longer last the same time: a page of prices gets its
   * twelve seconds, a photograph gets however long the shop set, and a
   * film runs until it ends. An interval would cut the film off
   * mid-sentence or leave the prices up for a minute.
   */
  useEffect(() => {
    if (!slide) return undefined
    const isVideo = slide.type === 'work' && slide.item.kind === 'video'
    const ms = isVideo
      ? MAX_VIDEO_SECONDS * 1000
      : (slide.type === 'work' ? slide.item.seconds : PAGE_SECONDS) * 1000
    const t = setTimeout(next, ms)
    return () => clearTimeout(t)
  }, [index, slide, next])

  // A sold-out product or a slide switched off can shorten the running
  // order under the board's feet.
  useEffect(() => {
    if (slides.length && index >= slides.length) setIndex(0)
  }, [index, slides.length])

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
  const onWork = slide?.type === 'work'
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
      {/*
        No coloured rule under the header, and no coloured bars down the
        tiles. Those stripes were decoration standing in for information
        — the department is already written on every tile in its own
        colour — and a screen edged in bars reads as a template somebody
        filled in rather than as this shop's board. What is left is the
        photographs, the names and the prices.
      */}
      <div className="shrink-0 flex items-center justify-between gap-6 px-[2.5vw] py-[1.8vh] border-b border-gray-800">
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
      {/* Edge to edge. The gutter around the grid made eight separate
          cards floating on a background; the photographs now meet, and
          the thin seam between them is the only line left. */}
      <div className="flex-1 min-h-0">
        {isLoading ? (
          <p className="text-[3vh] text-gray-500 font-black px-[2.5vw] py-[2vh]">Loading prices…</p>
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
        ) : onWork ? (
          <WorkSlide item={slide.item} onDone={next} />
        ) : slide ? (
          <div className="h-full grid grid-cols-2 grid-rows-2 gap-[2px] bg-gray-800">
            {slide.items.map((p) => {
              const a = ASPECTS[p.aspect] || ASPECTS.other
              return (
                <div key={p.id}
                     className="relative min-h-0 overflow-hidden bg-gray-900">
                  {/*
                    The photograph, filling the tile.

                    object-cover rather than contain: a tile with bars
                    down the sides looks like a mistake from across a
                    room, and a product photograph cropped a little is
                    still obviously the product. A product with no
                    photograph keeps the plain dark tile, which is the
                    old board's look and perfectly readable — this is
                    why the price never sits on the picture alone.
                  */}
                  {p.image_url ? (
                    <img src={p.image_url} alt=""
                         className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    /*
                      No photograph, so a drawing of the kind of thing it
                      is. Not a generated photograph of the product: an
                      invented battery with invented terminals is not the
                      battery on the shelf, and on a price board a
                      customer reads a picture as the thing they are
                      buying. Flat, unbranded, obviously a symbol — and
                      it costs nothing and waits on nobody.
                    */
                    <div className="absolute inset-0 grid place-items-center opacity-90">
                      {/* Sized against the tile and lifted clear of the
                          words: the drawing is what the tile is for, and
                          at a quarter of a television a small one reads
                          as a logo rather than as the goods. */}
                      <ProductArt name={p.name} aspect={p.aspect} colour={a.colour}
                                  className="w-[62%] h-[62%] -translate-y-[8%]" />
                    </div>
                  )}
                  {/*
                    The dark wash under the words.

                    Without it the price sits on whatever the photograph
                    happens to be — white text on a white panel, read
                    from four metres. The gradient is heavy at the foot
                    where the words are and clears towards the top so the
                    goods still show.
                  */}
                  <div className="absolute inset-0"
                       style={{ background: p.image_url
                         ? 'linear-gradient(to top, rgba(3,7,18,.95) 34%, rgba(3,7,18,.55) 62%, rgba(3,7,18,.15) 100%)'
                         : 'linear-gradient(to top, rgba(3,7,18,.92) 26%, rgba(3,7,18,0) 62%)' }} />
                  <div className="absolute left-0 right-0 bottom-0 px-[1.6vw] py-[1.6vh]
                                  flex items-end justify-between gap-[1.2vw]">
                    <div className="min-w-0">
                      {a.label && (
                        <p className="text-[1.5vh] font-black tracking-[0.12em]" style={{ color: a.colour }}>
                          {a.label}
                        </p>
                      )}
                      <p className="text-[3.1vh] font-black leading-tight mt-[0.3vh] line-clamp-2"
                         style={{ textShadow: '0 2px 10px rgba(0,0,0,.9)' }}>
                        {p.name}
                      </p>
                      {p.left !== null && (
                        <p className="text-[1.8vh] font-black text-amber-400 mt-[0.5vh]">
                          ONLY {p.left} LEFT
                        </p>
                      )}
                    </div>
                    <p className="text-[4.4vh] font-black tabular-nums whitespace-nowrap shrink-0"
                       style={{ textShadow: '0 2px 10px rgba(0,0,0,.9)' }}>
                      {formatCurrency(p.price)}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        ) : null}
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
            {slides.length > 1 && slides.length <= 14 && (
              <div className="flex gap-[0.5vw]">
                {slides.map((sl, i) => (
                  <span key={sl.key}
                        className={`rounded-full ${i === index ? 'bg-orange-500' : 'bg-gray-700'}`}
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
