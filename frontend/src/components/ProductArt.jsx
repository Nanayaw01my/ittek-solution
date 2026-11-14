import React from 'react'

/**
 * A drawing of what a product is, for when there is no photograph.
 *
 * The price board puts every product on a picture. Most shops have
 * photographs for a handful of lines and nothing for the rest, which
 * leaves a wall of blank tiles between the good ones — and the obvious
 * fix, generating a picture of the actual product, is the wrong one: an
 * invented 200Ah battery with invented terminals is not the battery in
 * the shop, and a customer reads a picture on a price board as a
 * photograph of what they are buying.
 *
 * So these are deliberately drawings. Flat, two-colour, clearly a
 * symbol — a panel, a battery, an inverter — carrying no brand and
 * claiming to be nothing but the kind of thing. Nobody mistakes one for
 * a photograph, and the board stops looking half-finished.
 *
 * Drawn rather than fetched: no key, no bill, no waiting on anybody's
 * service, and they render at any size on a screen that may be showing
 * them for fourteen hours.
 */

/**
 * Which drawing a product gets, by what it is called.
 *
 * Ordered, because the first match wins and the specific has to come
 * before the general: "solar charge controller" must not be caught by
 * the rule for "solar", and "cable tie" is not cable.
 */
const RULES = [
  [/\b(mc4|connector|lug|terminal)\b/, 'connector'],
  [/\b(charge )?controller|mppt|pwm\b/, 'controller'],
  [/\binverter|ups\b/, 'inverter'],
  [/\b(solar )?panel|pv\b/, 'panel'],
  [/\bbatter(y|ies)|agm|lithium|tubular\b/, 'battery'],
  [/\brouter|modem|access point|mikrotik|tp-?link\b/, 'router'],
  [/\bswitch\b(?!.*\bwall\b)|hub|poe\b/, 'switch'],
  [/\b(cat ?6|cat ?5|utp|network cable|lan)\b/, 'netcable'],
  [/\bcable|wire|flex|armoured\b/, 'cable'],
  [/\b(bulb|lamp|led|flood ?light|downlight)\b/, 'bulb'],
  [/\bsocket|outlet|plug\b/, 'socket'],
  [/\bbreaker|mcb|fuse|isolator|distribution\b/, 'breaker'],
  [/\bfan|extractor\b/, 'fan'],
  [/\bmeter|tester|multimeter\b/, 'meter'],
  [/\bcctv|camera\b/, 'camera'],
]

/** Nothing matched by name, so the side of the business decides. */
const BY_ASPECT = { solar: 'panel', networking: 'router', electrical: 'bulb' }

export const artFor = (name = '', aspect = null) => {
  const n = String(name).toLowerCase()
  for (const [re, key] of RULES) if (re.test(n)) return key
  return BY_ASPECT[aspect] || 'carton'
}

/**
 * The drawings.
 *
 * Each one fills a 400×300 box and is built from a handful of shapes:
 * at a quarter of a television they are read in a glance, and anything
 * finer than this turns to mush at that distance anyway. `c` is the
 * department's colour, so a tile still belongs to its side of the shop
 * now that the coloured bars are gone.
 */
const SHAPES = {
  panel: (c) => (
    <g>
      <rect x="70" y="60" width="260" height="160" rx="6" fill="#16233a" stroke={c} strokeWidth="6" />
      <g stroke={c} strokeWidth="4" opacity=".65">
        <path d="M135 60v160M200 60v160M265 60v160M70 113h260M70 166h260" />
      </g>
      <path d="M200 220v34M160 254h80" stroke="#64748b" strokeWidth="9" strokeLinecap="round" />
    </g>
  ),
  battery: (c) => (
    <g>
      <rect x="110" y="95" width="180" height="150" rx="12" fill="#16233a" stroke="#64748b" strokeWidth="7" />
      <rect x="140" y="72" width="42" height="26" rx="6" fill="#ef4444" />
      <rect x="218" y="72" width="42" height="26" rx="6" fill="#475569" />
      <path d="M196 125l-32 62h36l-20 52 64-74h-36l24-40z" fill={c} />
    </g>
  ),
  inverter: (c) => (
    <g>
      <rect x="80" y="80" width="240" height="160" rx="14" fill="#16233a" stroke="#64748b" strokeWidth="7" />
      <rect x="108" y="108" width="118" height="58" rx="7" fill="#0b2a22" stroke={c} strokeWidth="4" />
      <path d="M124 146l18-22 14 16 16-24 12 30" stroke={c} strokeWidth="5" fill="none" strokeLinecap="round" />
      <circle cx="274" cy="137" r="22" fill="none" stroke={c} strokeWidth="6" />
      <path d="M274 122v16" stroke={c} strokeWidth="6" strokeLinecap="round" />
      <g fill="#475569">
        <rect x="108" y="188" width="150" height="14" rx="7" />
        <rect x="108" y="212" width="96" height="14" rx="7" />
      </g>
    </g>
  ),
  controller: (c) => (
    <g>
      <rect x="110" y="60" width="180" height="200" rx="14" fill="#16233a" stroke="#64748b" strokeWidth="7" />
      <rect x="136" y="88" width="128" height="52" rx="7" fill="#0b2a22" stroke={c} strokeWidth="4" />
      <g fill={c}>
        <circle cx="160" cy="172" r="9" /><circle cx="200" cy="172" r="9" opacity=".5" />
        <circle cx="240" cy="172" r="9" opacity=".3" />
      </g>
      <g fill="#475569">
        <rect x="136" y="202" width="52" height="34" rx="6" />
        <rect x="212" y="202" width="52" height="34" rx="6" />
      </g>
    </g>
  ),
  router: (c) => (
    <g>
      <rect x="90" y="170" width="220" height="74" rx="16" fill="#16233a" stroke="#64748b" strokeWidth="7" />
      <g stroke="#64748b" strokeWidth="10" strokeLinecap="round">
        <path d="M140 170V96M200 170V78M260 170V96" />
      </g>
      <g fill={c}>
        <circle cx="132" cy="207" r="9" /><circle cx="166" cy="207" r="9" />
        <circle cx="200" cy="207" r="9" opacity=".5" />
      </g>
    </g>
  ),
  switch: (c) => (
    <g>
      <rect x="70" y="120" width="260" height="80" rx="10" fill="#16233a" stroke="#64748b" strokeWidth="7" />
      <g fill="#0b2a22" stroke={c} strokeWidth="3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <rect key={i} x={94 + i * 36} y="142" width="26" height="22" rx="4" />
        ))}
      </g>
      <g fill={c}>
        {[0, 1, 2, 3, 4, 5].map((i) => <circle key={i} cx={107 + i * 36} cy="180" r="5" opacity={i % 2 ? '.4' : '1'} />)}
      </g>
    </g>
  ),
  netcable: (c) => (
    <g>
      <path d="M96 236c0-74 54-74 54-136" stroke={c} strokeWidth="18" fill="none" strokeLinecap="round" />
      <path d="M250 100c0 62 54 62 54 136" stroke={c} strokeWidth="18" fill="none" strokeLinecap="round" />
      <g fill="#64748b">
        <rect x="118" y="60" width="64" height="44" rx="6" /><rect x="138" y="46" width="24" height="16" rx="3" />
        <rect x="218" y="60" width="64" height="44" rx="6" /><rect x="238" y="46" width="24" height="16" rx="3" />
      </g>
    </g>
  ),
  cable: (c) => (
    <g>
      <g fill="none" stroke={c} strokeWidth="20" strokeLinecap="round">
        <circle cx="200" cy="155" r="78" />
        <circle cx="200" cy="155" r="40" />
      </g>
      <path d="M278 155c26 0 44 22 44 48" stroke="#64748b" strokeWidth="18" fill="none" strokeLinecap="round" />
    </g>
  ),
  // Drawn tall as well as wide. The first attempt was a pair of thin
  // barrels across the middle of the box, which left two-thirds of the
  // tile empty and read as a logo rather than as a part.
  connector: (c) => (
    <g>
      <g fill="#16233a" stroke="#64748b" strokeWidth="7">
        <rect x="58" y="96" width="150" height="84" rx="40" />
        <rect x="192" y="120" width="150" height="84" rx="40" />
      </g>
      <g fill={c}>
        <circle cx="104" cy="138" r="18" />
        <circle cx="296" cy="162" r="18" />
      </g>
      <path d="M196 150l12 0" stroke={c} strokeWidth="16" strokeLinecap="round" />
      <g stroke="#64748b" strokeWidth="14" strokeLinecap="round" fill="none">
        <path d="M58 138c-30 0-34 56-34 76" />
        <path d="M342 162c30 0 34-56 34-76" />
      </g>
    </g>
  ),
  bulb: (c) => (
    <g>
      <circle cx="200" cy="130" r="72" fill="#1d2a1a" stroke={c} strokeWidth="7" />
      <path d="M176 130a24 24 0 0 1 48 0" stroke={c} strokeWidth="6" fill="none" />
      <path d="M200 130v28" stroke={c} strokeWidth="6" />
      <g fill="#64748b">
        <rect x="168" y="204" width="64" height="18" rx="5" />
        <rect x="172" y="228" width="56" height="16" rx="5" />
        <rect x="178" y="250" width="44" height="14" rx="5" />
      </g>
      <g stroke={c} strokeWidth="6" strokeLinecap="round" opacity=".55">
        <path d="M86 130H58M314 130h28M118 48l-20-20M282 48l20-20" />
      </g>
    </g>
  ),
  socket: (c) => (
    <g>
      <rect x="110" y="60" width="180" height="180" rx="18" fill="#16233a" stroke="#64748b" strokeWidth="7" />
      <g fill="#0b1220" stroke={c} strokeWidth="5">
        <rect x="186" y="98" width="20" height="40" rx="4" />
        <rect x="146" y="150" width="40" height="20" rx="4" />
        <rect x="212" y="150" width="40" height="20" rx="4" />
      </g>
      <rect x="146" y="196" width="46" height="26" rx="6" fill={c} />
    </g>
  ),
  breaker: (c) => (
    <g>
      <rect x="120" y="60" width="160" height="200" rx="10" fill="#16233a" stroke="#64748b" strokeWidth="7" />
      <rect x="152" y="96" width="96" height="60" rx="8" fill={c} />
      <rect x="168" y="106" width="64" height="18" rx="5" fill="#0b1220" opacity=".5" />
      <g fill="#475569">
        <rect x="152" y="176" width="96" height="16" rx="6" />
        <rect x="152" y="204" width="96" height="16" rx="6" />
      </g>
    </g>
  ),
  fan: (c) => (
    <g>
      <circle cx="200" cy="150" r="96" fill="none" stroke="#64748b" strokeWidth="7" />
      {[0, 120, 240].map((d) => (
        <path key={d} d="M200 150c0-44 18-66 46-66 22 0 30 24 14 44z" fill={c} opacity=".9"
              transform={`rotate(${d} 200 150)`} />
      ))}
      <circle cx="200" cy="150" r="20" fill="#16233a" stroke="#64748b" strokeWidth="6" />
    </g>
  ),
  meter: (c) => (
    <g>
      <rect x="110" y="60" width="180" height="200" rx="16" fill="#16233a" stroke="#64748b" strokeWidth="7" />
      <rect x="136" y="88" width="128" height="62" rx="8" fill="#0b2a22" stroke={c} strokeWidth="4" />
      <circle cx="200" cy="196" r="34" fill="none" stroke="#64748b" strokeWidth="6" />
      <path d="M200 196l22-18" stroke={c} strokeWidth="6" strokeLinecap="round" />
    </g>
  ),
  camera: (c) => (
    <g>
      <rect x="96" y="112" width="170" height="86" rx="14" fill="#16233a" stroke="#64748b" strokeWidth="7" />
      <circle cx="152" cy="155" r="26" fill="#0b1220" stroke={c} strokeWidth="6" />
      <path d="M266 134l54-26v94l-54-26z" fill="#16233a" stroke="#64748b" strokeWidth="6" />
      <path d="M180 198v34M140 232h80" stroke="#64748b" strokeWidth="9" strokeLinecap="round" />
    </g>
  ),
  carton: (c) => (
    <g>
      <path d="M80 110l120-44 120 44-120 44z" fill="#16233a" stroke="#64748b" strokeWidth="6" strokeLinejoin="round" />
      <path d="M80 110v110l120 44V154z" fill="#121d2f" stroke="#64748b" strokeWidth="6" strokeLinejoin="round" />
      <path d="M320 110v110l-120 44V154z" fill="#0e1826" stroke="#64748b" strokeWidth="6" strokeLinejoin="round" />
      <path d="M200 154v110" stroke={c} strokeWidth="5" opacity=".7" />
    </g>
  ),
}

/**
 * @param {string} name - the product's name, which decides the drawing
 * @param {string} aspect - its side of the business, used when the name says nothing
 * @param {string} colour - the department colour, as the drawing's accent
 */
export default function ProductArt({ name, aspect, colour = '#F97316', className = '' }) {
  const shape = SHAPES[artFor(name, aspect)] || SHAPES.carton
  return (
    <svg viewBox="0 0 400 300" className={className} aria-hidden="true" preserveAspectRatio="xMidYMid meet">
      {shape(colour)}
    </svg>
  )
}
