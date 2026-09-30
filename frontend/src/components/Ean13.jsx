import React from 'react'
import { modules, bars, isGuard } from '../utils/ean13'

/**
 * An EAN-13 barcode, drawn as an SVG.
 *
 * SVG rather than an image so it prints at the thermal head's own resolution
 * instead of being scaled from a bitmap — a barcode resampled by a printer
 * driver is a barcode that scans intermittently, which is worse than one that
 * never scans because nobody knows to stop trusting it.
 *
 * Renders nothing at all when the code is not a valid EAN-13. There is no
 * placeholder and no error: a receipt without a barcode is still a receipt,
 * and the invoice number printed above it is still the way in.
 */
export default function Ean13({ code, height = 38, unit = 2, showText = true, className = '' }) {
  const bits = modules(code)
  if (!bits) return null

  const guardExtra = Math.round(height * 0.12)
  const textH = showText ? 11 : 0
  const width = bits.length * unit
  const totalH = height + guardExtra + textH

  return (
    <svg
      className={className}
      width={width}
      height={totalH}
      viewBox={`0 0 ${width} ${totalH}`}
      role="img"
      aria-label={`Barcode ${code}`}
      // shapeRendering keeps the bar edges on whole pixels; anti-aliased edges
      // are what turn a crisp code into a smudge at 203dpi.
      shapeRendering="crispEdges"
    >
      <rect width={width} height={totalH} fill="#ffffff" />
      {bars(bits).map((b, i) => (
        <rect
          key={i}
          x={b.start * unit}
          y={0}
          width={b.width * unit}
          height={height + (isGuard(b.start, b.width) ? guardExtra : 0)}
          fill="#000000"
        />
      ))}
      {showText && (
        <text
          x={width / 2}
          y={totalH - 1}
          textAnchor="middle"
          fontFamily="monospace"
          fontSize="10"
          letterSpacing="1"
          fill="#000000"
        >
          {code}
        </text>
      )}
    </svg>
  )
}
