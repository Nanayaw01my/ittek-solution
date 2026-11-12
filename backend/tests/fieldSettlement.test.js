/**
 * Who may take the money for goods sold on the field.
 *
 * Two things are worth pinning down, and only one of them is the rule
 * itself.
 *
 * The rule: field duty is a duty, not a rank. A head of department out
 * for the day, or a sales attendant sent on a run, is holding the shop's
 * goods exactly as a Field Agent is, and settles for them where they are
 * rather than carrying the money back for somebody senior to enter.
 *
 * The drift: the screen has to ask the same question to decide whether to
 * draw the Pay button, and it used to answer it with its own list of
 * three role names. The list fell behind, so the server accepted a head
 * of department's payment while the screen gave them no way to make it —
 * a permission that existed and could not be used, which is the quietest
 * kind of broken. So this reads the client's rule off disk and runs it
 * against the server's, case for case.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const B = path.join(__dirname, '..');

const { maySettleFieldSheet, ROLE_LEVELS } = require(path.join(B, 'middleware/rbac.js'));

const ALL_ROLES = Object.keys(ROLE_LEVELS);

test('whoever carries the sheet settles it, whatever their role', () => {
  for (const role of ALL_ROLES) {
    assert.strictEqual(maySettleFieldSheet({ role, field_duty: true }), true,
      `${role} on field duty is holding the goods`);
  }
  assert.strictEqual(maySettleFieldSheet({ role: 'Field Agent' }), true,
    'and the role carries a sheet without needing the flag');
});

test('a counter hand carrying nothing does not settle a field sale', () => {
  // They issue sheets and take goods back. Recording the sale is the
  // seller's to do: see maySettleFieldSheet in middleware/rbac.js.
  assert.strictEqual(maySettleFieldSheet({ role: 'Sales' }), false);
  assert.strictEqual(maySettleFieldSheet({ role: 'Engineer' }), false);
});

test('Manager and above settle anybody\'s sheet', () => {
  for (const role of ['Manager', 'Head of Department', 'COO', 'CEO',
    'Managing Director', 'Super Admin']) {
    assert.strictEqual(maySettleFieldSheet({ role }), true, role);
  }
});

test('nothing leaks in from a missing or odd user', () => {
  for (const bad of [null, undefined, {}, { role: '' }, { role: 'Intern' },
    { field_duty: 'yes' }, { role: 'Sales', field_duty: 1 }]) {
    assert.strictEqual(maySettleFieldSheet(bad), false, JSON.stringify(bad));
  }
});

/**
 * The screen's copy of the rule, read off disk.
 *
 * The client is ESM and this suite is CommonJS, so the two functions are
 * lifted out of the file as text and evaluated here. Crude, but it fails
 * the moment somebody edits one side and not the other, which is the
 * whole point — and it fails loudly if the shape of the file changes
 * under it rather than quietly passing on nothing.
 */
const clientRule = () => {
  const src = fs.readFileSync(
    path.join(B, '../frontend/src/config/pageAccess.js'), 'utf8');

  const grab = (name) => {
    const m = src.match(new RegExp(`export const ${name} = ([\\s\\S]*?)\\n\\n`));
    assert.ok(m, `${name} not found in pageAccess.js — has it been renamed?`);
    return m[1];
  };
  const levels = src.match(/export const ROLE_LEVELS = (\{[\s\S]*?\})\n/);
  assert.ok(levels, 'ROLE_LEVELS not found in pageAccess.js');

  // eslint-disable-next-line no-new-func
  return new Function(`
    const ROLE_LEVELS = ${levels[1]};
    const roleLevel = (role) => ROLE_LEVELS[role] || 0;
    const carriesFieldSheets = ${grab('carriesFieldSheets')};
    const maySettleFieldSheet = ${grab('maySettleFieldSheet')};
    return maySettleFieldSheet;
  `)();
};

test('the screen draws the button for exactly the people the server lets in', () => {
  const onScreen = clientRule();

  const everybody = [];
  for (const role of ALL_ROLES) {
    everybody.push({ role }, { role, field_duty: true }, { role, field_duty: false });
  }
  everybody.push({}, { role: 'Intern' }, { role: 'Intern', field_duty: true });

  for (const user of everybody) {
    assert.strictEqual(
      onScreen(user), maySettleFieldSheet(user),
      `${JSON.stringify(user)}: the screen and the server disagree. A button `
      + 'the server refuses is a dead end; a payment the server accepts with '
      + 'no button is a permission nobody can use.');
  }
});

test('the client\'s role levels have not drifted from the server\'s', () => {
  // maySettleFieldSheet leans on them, so the two tables agreeing is part
  // of the same promise.
  const src = fs.readFileSync(
    path.join(B, '../frontend/src/config/pageAccess.js'), 'utf8');
  const m = src.match(/export const ROLE_LEVELS = (\{[\s\S]*?\})\n/);
  assert.ok(m, 'ROLE_LEVELS not found in pageAccess.js');
  // eslint-disable-next-line no-new-func
  const clientLevels = new Function(`return ${m[1]}`)();
  assert.deepStrictEqual(clientLevels, ROLE_LEVELS);
});
