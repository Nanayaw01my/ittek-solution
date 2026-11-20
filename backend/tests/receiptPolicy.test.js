/**
 * The terms printed on a receipt.
 *
 * Three surfaces carry them — the thermal slip, the PDF, and the link
 * the customer opens on their phone — and the customer most likely
 * still has the link three weeks later, when the question actually
 * comes up. They must not quote three different policies.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const B = path.join(__dirname, '..');
const { DEFAULT_RETURNS_POLICY } = require('../config/receiptPolicy');

test('the shop does not promise returns it does not accept', () => {
  /**
   * Every slip since the till was built carried "Returns are accepted
   * subject to our terms and conditions", and the PDF said goods
   * returned are accepted. That is a promise the shop never made, in
   * writing, in the customer's hand.
   */
  assert.match(DEFAULT_RETURNS_POLICY, /NOT RETURNABLE/,
    'the policy must say goods sold are not returnable');
  assert.match(DEFAULT_RETURNS_POLICY, /may be refunded/,
    'and that a refund is something the shop may grant');

  /**
   * Read what is printed, not what is explained. Both files carry a
   * comment quoting the old promise to say why it went, and a check
   * that cannot tell those apart would fail on its own documentation.
   */
  const code = (file) => fs.readFileSync(path.join(B, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  assert.ok(!code('../frontend/src/pages/POS.jsx').includes('Returns are accepted subject to'),
    'the old promise must be gone from the till');
  assert.ok(!code('utils/pdfGenerator.js').includes('Goods returned are accepted subject to'),
    'and from the PDF');
});

test('the browser and the server keep the same wording', () => {
  const browser = fs.readFileSync(
    path.join(B, '..', 'frontend/src/utils/receiptPolicy.js'), 'utf8');
  const quoted = browser
    .slice(browser.indexOf('DEFAULT_RETURNS_POLICY ='), browser.indexOf('/** The shop'))
    .replace(/[\s\S]*?=/, '')
    .split('+')
    .map((part) => part.trim().replace(/^'|'$/g, ''))
    .join('');
  assert.equal(quoted.trim(), DEFAULT_RETURNS_POLICY,
    'the two copies of the standard wording have drifted apart');
});

test('all three surfaces print the shop’s own wording when it has set one', () => {
  const pos = fs.readFileSync(path.join(B, '..', 'frontend/src/pages/POS.jsx'), 'utf8');
  assert.ok(pos.includes('policy={returnsPolicy(settings)}'), 'the till reads the setting');

  const pub = fs.readFileSync(path.join(B, 'controllers/publicReceiptController.js'), 'utf8');
  assert.ok(pub.includes('settings.receipt_policy'), 'the public link reads the setting');

  const forms = fs.readFileSync(path.join(B, 'routes/forms.js'), 'utf8');
  assert.ok(forms.includes('settings.receipt_policy'), 'the PDF reads the setting');
});

test('clearing the box restores the standard wording rather than removing it', () => {
  /**
   * A receipt with no terms on it is worse than one with the default,
   * and an empty box is the easiest thing in the world to leave behind
   * by accident.
   */
  const controller = fs.readFileSync(path.join(B, 'controllers/settingsController.js'), 'utf8');
  const bit = controller.slice(controller.indexOf('receipt_policy !== undefined'));
  assert.ok(bit.includes('DEFAULT_RETURNS_POLICY'),
    'an empty policy must fall back to the standard, not be saved as nothing');

  assert.ok(require('../models/Settings').schema.path('receipt_policy').defaultValue,
    'and a shop that never touches the setting still gets terms on its receipts');
});
