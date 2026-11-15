import React from 'react'
import { FiArrowUp, FiArrowDown } from 'react-icons/fi'

/**
 * One of the six figures across the top of the owner's dashboard.
 *
 * A block of colour with the figure in it, how it compares with the
 * period before, and the shape of the last fortnight drawn faintly
 * behind. The comparison is the part that earns its place: GH₵8,450 on
 * its own is a number, and "GH₵8,450, up 12% on yesterday" is a fact
 * about the shop.
 *
 * The sparkline is drawn by hand rather than with the charting library.
 * Six charts that each render an SVG, measure their container and
 * re-render on every resize is a measurable cost on a shop laptop, and
 * what is wanted here is not a chart — it is a shape. No axes, no
 * tooltip, nothing to read: just whether the fortnight has been rising
 * or falling.
 */

const TONES = {
  indigo: 'from-indigo-500 to-violet-600',
  green: 'from-emerald-500 to-green-600',
  amber: 'from-orange-400 to-amber-500',
  blue: 'from-blue-500 to-indigo-600',
  pink: 'from-pink-500 to-rose-500',
  teal: 'from-teal-500 to-cyan-600',
}

/** The series as a path, scaled to the box and flat when it is flat. */
const spark = (values, w = 220, h = 42) => {
  const nums = (values || []).map((v) => Number(v) || 0)
  if (nums.length < 2) return null
  const lo = Math.min(...nums)
  const hi = Math.max(...nums)
  // A fortnight of identical days has no range to scale against, and
  // dividing by it would put every point at the top of the box.
  const span = hi - lo || 1
  const step = w / (nums.length - 1)
  const pts = nums.map((v, i) => [i * step, h - ((v - lo) / span) * (h - 6) - 3])
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  return { line, fill: `${line} L${w} ${h} L0 ${h} Z` }
}

export default function HeadlineCard({
  label, value, delta, note, icon: Icon, tone = 'indigo', series,
}) {
  const s = spark(series)
  const up = Number(delta) >= 0

  return (
    <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${TONES[tone] || TONES.indigo}
                     text-white p-4 shadow-lg`}>
      <div className="relative z-10">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[12px] font-bold text-white/90 leading-tight">{label}</p>
          {Icon && <Icon size={20} className="text-white/50 shrink-0" />}
        </div>

        {/* Sized to the narrowest the card gets — six across a laptop —
            and never truncated: half a figure is worse than a small one,
            because "GH₵ 184…" reads as a number rather than as a
            number that did not fit. */}
        <p className="text-[21px] xl:text-[22px] font-black leading-none mt-2 tabular-nums
                      tracking-tight whitespace-nowrap overflow-hidden">{value}</p>

        {delta !== undefined && delta !== null && (
          <p className="flex items-center gap-1 text-[11px] font-bold text-white/85 mt-2">
            {up ? <FiArrowUp size={12} /> : <FiArrowDown size={12} />}
            {Math.abs(Number(delta)).toFixed(1)}%
            {note ? <span className="font-semibold text-white/70">{note}</span> : null}
          </p>
        )}
        {delta == null && note && (
          <p className="text-[11px] font-semibold text-white/70 mt-2">{note}</p>
        )}
      </div>

      {/* The fortnight, behind the figures and deliberately quiet. */}
      {s && (
        <svg viewBox="0 0 220 42" preserveAspectRatio="none" aria-hidden="true"
             className="absolute inset-x-0 bottom-0 w-full h-[42px] opacity-60">
          <path d={s.fill} fill="rgba(255,255,255,.18)" />
          <path d={s.line} fill="none" stroke="rgba(255,255,255,.85)" strokeWidth="2"
                strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
    </div>
  )
}
