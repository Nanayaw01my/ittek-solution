/**
 * Goods given to somebody outside the shop to sell.
 *
 * A trader, a stall holder, a shop in another town. The stock movement is
 * the same one a field agent's sheet already does — the goods leave the
 * shelf, what comes back goes on it again, what was sold is rung up — so
 * it is the same sheet, with a plain name on it instead of a login.
 *
 * What these guard is the seam between the two: that a sheet can exist
 * without an account, that adding more goods finds the right open sheet
 * when there is no id to look it up by, and that the staff picker's
 * response shape did not change underneath phones still running an older
 * bundle.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const B = path.join(__dirname, '..');
const controller = fs.readFileSync(path.join(B, 'controllers/dispatchesController.js'), 'utf8');

test('a sheet can be issued to a plain name, with no account', () => {
  const create = controller.slice(controller.indexOf('const createDispatch'));
  const head = create.slice(0, create.indexOf('const built'));

  // The id is optional; the name is what is required.
  assert.ok(head.includes('if (agent_user_id) {'),
    'looking the account up must be conditional, not assumed');
  assert.ok(/if \(!agent_name \|\| !String\(agent_name\)\.trim\(\)\)/.test(head),
    'the name is the field that must be present');
});

test('more goods for the same outside seller join the sheet they already hold', () => {
  /**
   * Without this the same trader shows three times on the screen, each
   * row with its own returns to chase and its own money owed, and none
   * of them the whole picture. A staff sheet is found by id; an outside
   * one has no id, so it is found by name.
   */
  const create = controller.slice(controller.indexOf('const createDispatch'));
  const openFilter = create.slice(create.indexOf('const openFilter'), create.indexOf('const existing'));
  assert.ok(openFilter.includes('agent_user_id'), 'staff sheets are found by account');
  assert.ok(openFilter.includes('agent_name'), 'outside sheets must be found by name');
  assert.ok(openFilter.includes('.trim()'),
    'a trailing space must not make a second sheet for the same person');
});

test('the staff picker still answers with a plain array', () => {
  /**
   * The app is a PWA: a phone can run last week's bundle for days. That
   * bundle calls .map() on this response, so wrapping it in an object to
   * make room for the outside sellers would have emptied the picker on
   * every phone that had not reloaded — and the only symptom would be a
   * screen that cannot issue goods to anybody.
   *
   * The outside names therefore went in their own endpoint.
   */
  const agents = controller.slice(controller.indexOf('const getFieldAgents'),
    controller.indexOf('const getOutsideSellers'));
  assert.ok(/data: agents/.test(agents),
    'getFieldAgents must keep returning the array itself');
  assert.ok(!/data: \{/.test(agents),
    'wrapping it in an object would break older bundles');

  assert.ok(controller.includes('const getOutsideSellers'),
    'outside sellers need their own endpoint');
});

test('outside sellers are the names never tied to an account', () => {
  const fn = controller.slice(controller.indexOf('const getOutsideSellers'),
    controller.indexOf('GET /api/dispatches/by-agent', controller.indexOf('const getOutsideSellers')));
  assert.ok(fn.includes("distinct('agent_name'"), 'it lists the names used before');
  assert.ok(fn.includes('agent_user_id: null'),
    'staff must not be offered as outside sellers — they are picked from the other list');
});

test('the endpoint is registered and behind the same guard as the rest', () => {
  const routes = fs.readFileSync(path.join(B, 'routes/dispatches.js'), 'utf8');
  const line = routes.split('\n').find((l) => l.includes('outside-sellers'));
  assert.ok(line, 'the route must exist, or the picker has nothing to suggest');
  assert.ok(line.includes('shopStaffOnly'),
    'who the shop lends goods to is not for a field agent to enumerate');
});

test('the screen sends one of the two, never both', () => {
  /**
   * The server reads the name off the account whenever an id is given,
   * so sending both would silently discard whatever was typed — and the
   * goods would go against the wrong person's name.
   */
  const page = fs.readFileSync(
    path.join(B, '..', 'frontend/src/pages/FieldDispatch.jsx'), 'utf8');
  assert.ok(page.includes("agent_user_id: who === 'staff' ? agentId : undefined"),
    'the account id must only be sent for staff');
  assert.ok(page.includes("agent_name: who === 'outside' ? outsideName.trim() : undefined"),
    'the typed name must only be sent for an outside seller');
});

test('the sheet cannot be issued until somebody is named', () => {
  const page = fs.readFileSync(
    path.join(B, '..', 'frontend/src/pages/FieldDispatch.jsx'), 'utf8');
  assert.ok(page.includes("const namedSomebody = who === 'staff' ? Boolean(agentId) : outsideName.trim().length > 1"),
    'an empty name would take stock off the shelf against nobody');
  assert.ok(page.includes('const canSubmit = namedSomebody'),
    'and that check must gate the button');
});
