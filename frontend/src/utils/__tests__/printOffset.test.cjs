const test=require('node:test'), assert=require('node:assert')
const src=require('fs').readFileSync(require('path').join(__dirname,'../printReceipt.js'),'utf8')
const body=src.slice(src.indexOf('const metricsFor'), src.indexOf('// The printer accepts rolls'))
const metricsFor=eval(`const BASELINE_MM=80, SIDE_MARGIN_MM=4; ${body}; metricsFor`)

test('centred when there is no nudge', () => {
  assert.strictEqual(metricsFor(78).marginLeftMm, 4)      // (78-70)/2
  assert.strictEqual(metricsFor(80).marginLeftMm, 4)
})
test('a nudge moves it, left and right', () => {
  assert.strictEqual(metricsFor(78, -2).marginLeftMm, 2)
  assert.strictEqual(metricsFor(78, 3).marginLeftMm, 7)
})
test('it never leaves the page, whichever way it is pushed', () => {
  // Outside the page box the browser clips, which is the fault this cures.
  assert.strictEqual(metricsFor(78, -20).marginLeftMm, 0)
  assert.strictEqual(metricsFor(78, 20).marginLeftMm, 8)  // the whole slack
  assert.strictEqual(metricsFor(78, 20).marginLeftMm + metricsFor(78).contentMm, 78)
})
test('rubbish reads as no nudge', () => {
  for (const bad of [undefined, null, '', 'x', NaN]) {
    assert.strictEqual(metricsFor(78, bad).marginLeftMm, 4, String(bad))
  }
})
