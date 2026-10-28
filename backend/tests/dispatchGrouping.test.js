const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const B = path.join(__dirname, '..');
const { stillOut, sheetTotals, daysOpen, groupByAgent } = require(path.join(B, 'utils/dispatchGrouping.js'));

/**
 * A field agent's sheets, added up into one picture of what they hold.
 *
 * The figure a DSR is settled against when they walk into the shop. It has
 * to count every sheet they have open — the list is paginated, and an agent
 * whose fourth sheet fell onto page two reading as carrying less than they
 * are is the one mistake on this screen that costs the shop goods.
 */

const sheet = (over = {}) => ({
  _id: over._id || 'd1',
  dispatch_no: over.dispatch_no || 'DSR-1',
  agent_name: over.agent_name || 'daniel',
  agent_user_id: over.agent_user_id || 'u1',
  issued_at: over.issued_at || '2026-10-02T00:00:00Z',
  status: over.status || 'issued',
  items: over.items || [],
  sales: over.sales || [],
});

test('what is still out on one sheet', async (t) => {
  await t.test('issued, less sold, less brought back', () => {
    assert.strictEqual(stillOut({ quantity_issued: 10, quantity_sold: 3, quantity_returned: 2 }), 5);
  });

  await t.test('never negative, whatever the record says', () => {
    // A miscount somewhere must not hand an agent credit for goods.
    assert.strictEqual(stillOut({ quantity_issued: 1, quantity_sold: 5 }), 0);
  });

  await t.test('missing figures count as nothing, not as NaN', () => {
    assert.strictEqual(stillOut({ quantity_issued: 4 }), 4);
    assert.strictEqual(stillOut({}), 0);
  });
});

test('one sheet, totalled', async (t) => {
  await t.test('value is what is still out, not what was issued', () => {
    // The old card valued everything ever issued, so a sheet the agent had
    // nearly finished with still read as thousands of cedis.
    const t1 = sheetTotals(sheet({
      items: [{ quantity_issued: 10, quantity_sold: 8, unit_price: 100 }],
    }));
    assert.strictEqual(t1.pieces_out, 2);
    assert.strictEqual(t1.value_out, 200);
  });

  await t.test('paid in adds up every payment against the sheet', () => {
    const t1 = sheetTotals(sheet({ sales: [{ amount: 250 }, { amount: 200 }] }));
    assert.strictEqual(t1.paid_in, 450);
  });

  await t.test('an empty sheet totals to nothing', () => {
    const t1 = sheetTotals(sheet());
    assert.deepStrictEqual(t1, { pieces_out: 0, value_out: 0, paid_in: 0 });
  });
});

test("one card per agent, across all their sheets", async (t) => {
  // The three sheets from the real screen that prompted this.
  const danielsSheets = [
    sheet({
      _id: 'a', dispatch_no: 'DSR-20261002-0001', issued_at: '2026-10-02T00:00:00Z',
      items: [
        { quantity_issued: 1, unit_price: 250 }, { quantity_issued: 1, unit_price: 250 },
        { quantity_issued: 1, unit_price: 250 }, { quantity_issued: 3, unit_price: 400 },
        { quantity_issued: 3, unit_price: 300 }, { quantity_issued: 2, unit_price: 190 },
      ],
    }),
    sheet({
      _id: 'b', dispatch_no: 'DSR-20260921-0001', issued_at: '2026-09-21T00:00:00Z',
      status: 'partly_returned',
      items: [{ quantity_issued: 12, quantity_sold: 1, unit_price: 700 }],
      sales: [{ amount: 450 }],
    }),
  ];

  await t.test('his sheets arrive as one row, not three', async () => {
    const rows = groupByAgent(danielsSheets, {});
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].agent_name, 'daniel');
    assert.strictEqual(rows[0].sheets.length, 2);
  });

  await t.test('the pieces he holds are added across both', () => {
    // 11 on one sheet and 11 on the other: the number nobody could see.
    const rows = groupByAgent(danielsSheets, {});
    assert.strictEqual(rows[0].pieces_out, 22);
  });

  await t.test('so is the value, and the money paid in', () => {
    const rows = groupByAgent(danielsSheets, {});
    assert.strictEqual(rows[0].value_out, 250 + 250 + 250 + 1200 + 900 + 380 + 7700);
    assert.strictEqual(rows[0].paid_in, 450);
  });

  await t.test('the oldest open sheet is the one aged', () => {
    // "Has somebody been sitting on our stock?" is asked of the oldest
    // sheet, not the newest.
    const rows = groupByAgent(danielsSheets, {}, new Date('2026-10-28T00:00:00Z'));
    assert.strictEqual(rows[0].days_open, 37);
    assert.strictEqual(new Date(rows[0].oldest_open_at).getUTCMonth(), 8); // September
  });

  await t.test('his newest sheet is listed first', () => {
    const rows = groupByAgent(danielsSheets, {});
    assert.strictEqual(rows[0].sheets[0].dispatch_no, 'DSR-20261002-0001');
  });

  await t.test('closed sheets are counted, not carried', () => {
    // A rep with eight months of history would otherwise arrive as a
    // hundred sheets nobody is going to read.
    const rows = groupByAgent(danielsSheets, { u1: { count: 1, agent_name: 'daniel' } });
    assert.strictEqual(rows[0].closed_count, 1);
    assert.strictEqual(rows[0].sheets.length, 2);
  });

  await t.test('an agent who has settled everything still appears', () => {
    const rows = groupByAgent([], { u9: { count: 3, agent_name: 'yaw' } });
    const yaw = rows.find((r) => r.agent_name === 'yaw');
    assert.ok(yaw);
    assert.strictEqual(yaw.pieces_out, 0);
    assert.strictEqual(yaw.closed_count, 3);
  });

  await t.test('whoever holds the most is at the top', () => {
    const rows = groupByAgent([
      ...danielsSheets,
      sheet({ _id: 'c', agent_user_id: 'u2', agent_name: 'kofi', items: [{ quantity_issued: 4, unit_price: 300 }] }),
    ], { u9: { count: 3, agent_name: 'yaw' } });
    assert.deepStrictEqual(rows.map((r) => r.agent_name), ['daniel', 'kofi', 'yaw']);
  });

  await t.test('two agents are never merged by a shared name field', () => {
    const rows = groupByAgent([
      sheet({ _id: 'x', agent_user_id: 'u1', agent_name: 'kofi', items: [{ quantity_issued: 2 }] }),
      sheet({ _id: 'y', agent_user_id: 'u2', agent_name: 'kofi', items: [{ quantity_issued: 5 }] }),
    ], {});
    assert.strictEqual(rows.length, 2, 'two accounts are two people, whatever they are called');
  });
});

test('how long a sheet has been open', async (t) => {
  await t.test('counted in whole days', () => {
    assert.strictEqual(daysOpen('2026-10-01T00:00:00Z', new Date('2026-10-15T00:00:00Z')), 14);
  });

  await t.test('today is nothing, not a day', () => {
    assert.strictEqual(daysOpen('2026-10-15T08:00:00Z', new Date('2026-10-15T20:00:00Z')), 0);
  });

  await t.test('nonsense is nothing rather than NaN on the screen', () => {
    assert.strictEqual(daysOpen(null), 0);
    assert.strictEqual(daysOpen('not a date'), 0);
  });
});
