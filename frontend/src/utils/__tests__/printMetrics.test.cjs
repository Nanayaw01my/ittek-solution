const test = require('node:test'), assert = require('node:assert')
const src = require('fs').readFileSync(require('path').join(__dirname, '../printReceipt.js'), 'utf8')
const body = src.slice(src.indexOf('const metricsFor'), src.indexOf('// The printer accepts rolls'))
const metricsFor = eval(`const BASELINE_MM=80, SIDE_MARGIN_MM=1.5; ${body}; metricsFor`)

test('the receipt uses nearly all the paper', () => {
  // 4mm a side wasted a strip the head could reach; 1.5mm is a hair.
  assert.strictEqual(metricsFor(78).contentMm, 75)
  assert.strictEqual(metricsFor(80).contentMm, 77)
})

test('text scale moves every size together', () => {
  const at100 = metricsFor(78, 0, 100), at130 = metricsFor(78, 0, 130)
  for (const k of ['fontSize', 'headline', 'small', 'moneyCol', 'qtyCol']) {
    assert.ok(at130[k] > at100[k], k)
    // Within a pixel: these are rounded to whole pixels, and a 25px column
    // cannot be scaled by exactly 1.3 and stay an integer.
    assert.ok(Math.abs(at130[k] - at100[k] * 1.3) <= 1, `${k}: ${at100[k]} -> ${at130[k]}`)
  }
})

test('the columns still fit inside the paper at every allowed size', () => {
  // qty + price + total must leave room for the spacer; the product name
  // has a line of its own, so it is not in this sum.
  for (const width of [58, 76, 78, 80, 82]) {
    for (const scale of [80, 100, 110, 130, 160]) {
      const m = metricsFor(width, 0, scale)
      const columns = m.qtyCol + m.moneyCol * 2
      const paper = (m.contentMm / 25.4) * 96
      assert.ok(columns <= paper, `${width}mm at ${scale}%: ${Math.round(columns)}px of columns in ${Math.round(paper)}px`)
    }
  }
})

test('the scale is clamped, and rubbish is 100%', () => {
  assert.deepStrictEqual(metricsFor(78, 0, 500).fontSize, metricsFor(78, 0, 160).fontSize)
  assert.deepStrictEqual(metricsFor(78, 0, 10).fontSize, metricsFor(78, 0, 80).fontSize)
  for (const bad of [undefined, null, '', 'x', NaN]) {
    assert.strictEqual(metricsFor(78, 0, bad).fontSize, metricsFor(78, 0, 100).fontSize, String(bad))
  }
})
