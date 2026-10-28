/**
 * A field agent's sheets, added up into one picture of what they hold.
 *
 * The dispatch list is a list of sheets, newest first, so an agent with
 * three sheets appears three times with other people's sheets in between —
 * some of their goods up the page and some of it down. Worse, the number
 * anybody actually wants is never on the screen at all: how much is this
 * person carrying, and how much have they paid in. Today you work it out by
 * scrolling and adding.
 *
 * Kept out of the controller and kept pure, because the arithmetic is the
 * part worth being able to read back out of a test. A DSR standing at the
 * counter is settled against these figures.
 */

/** Pieces on one line that are neither sold nor brought back. */
const stillOut = (i) => Math.max(
  0,
  (Number(i.quantity_issued) || 0)
  - (Number(i.quantity_returned) || 0)
  - (Number(i.quantity_sold) || 0)
);

/** What one sheet still has out, in pieces and in cedis. */
const sheetTotals = (d) => {
  const items = d.items || [];
  return {
    pieces_out: items.reduce((n, i) => n + stillOut(i), 0),
    /**
     * Valued at what is still out, not at what was issued.
     *
     * The old card showed the value of everything ever issued on the sheet,
     * which stays high after the agent has brought half of it back — so a
     * sheet that is nearly settled still reads as thousands of cedis.
     */
    value_out: Number(items.reduce((n, i) => n + stillOut(i) * (Number(i.unit_price) || 0), 0).toFixed(2)),
    paid_in: Number((d.sales || []).reduce((n, s) => n + (Number(s.amount) || 0), 0).toFixed(2)),
  };
};

/**
 * How long a sheet has been open, in whole days.
 *
 * The question behind it is "has somebody been sitting on our stock?", and
 * the answer is only interesting for sheets that are still open.
 */
const daysOpen = (issuedAt, now = new Date()) => {
  if (!issuedAt) return 0;
  const start = new Date(issuedAt);
  if (Number.isNaN(start.getTime())) return 0;
  return Math.max(0, Math.floor((now - start) / 86400000));
};

/**
 * One row per agent, from their open sheets.
 *
 * Closed sheets are counted but not carried: they hold nothing and are worth
 * nothing, and a rep with eight months of history would otherwise arrive as
 * a hundred sheets nobody is going to read. They are fetched on demand.
 *
 * Ordered by what is at stake — most pieces still out first — so the agent
 * holding GHC10,000 of the shop's stock is at the top of the screen and the
 * one carrying nothing is at the bottom.
 */
const groupByAgent = (openSheets = [], closedCounts = {}, now = new Date()) => {
  const byAgent = new Map();

  for (const d of openSheets) {
    const key = String(d.agent_user_id?._id || d.agent_user_id || d.agent_name || 'unknown');
    if (!byAgent.has(key)) {
      byAgent.set(key, {
        agent_key: key,
        agent_user_id: d.agent_user_id?._id || d.agent_user_id || null,
        agent_name: d.agent_name || 'Unknown',
        agent_phone: d.agent_phone || '',
        pieces_out: 0,
        value_out: 0,
        paid_in: 0,
        sheets: [],
        closed_count: 0,
        oldest_open_at: null,
        days_open: 0,
      });
    }
    const row = byAgent.get(key);
    const t = sheetTotals(d);
    row.pieces_out += t.pieces_out;
    row.value_out = Number((row.value_out + t.value_out).toFixed(2));
    row.paid_in = Number((row.paid_in + t.paid_in).toFixed(2));
    row.sheets.push({ ...(d.toObject ? d.toObject() : d), ...t });
    if (!row.oldest_open_at || new Date(d.issued_at) < new Date(row.oldest_open_at)) {
      row.oldest_open_at = d.issued_at;
    }
  }

  // Agents whose every sheet is closed still belong on the screen — they are
  // the ones who have settled, and their history is reachable from there.
  for (const [key, count] of Object.entries(closedCounts)) {
    if (!byAgent.has(key)) {
      byAgent.set(key, {
        agent_key: key,
        agent_user_id: count.agent_user_id || null,
        agent_name: count.agent_name || 'Unknown',
        agent_phone: '',
        pieces_out: 0,
        value_out: 0,
        paid_in: 0,
        sheets: [],
        closed_count: 0,
        oldest_open_at: null,
        days_open: 0,
      });
    }
    byAgent.get(key).closed_count = count.count ?? count;
  }

  return [...byAgent.values()]
    .map((r) => ({
      ...r,
      days_open: r.oldest_open_at ? daysOpen(r.oldest_open_at, now) : 0,
      // Newest sheet first within an agent, which is the order somebody
      // reads them in.
      sheets: r.sheets.sort((a, b) => new Date(b.issued_at) - new Date(a.issued_at)),
    }))
    .sort((a, b) => b.pieces_out - a.pieces_out
      || b.value_out - a.value_out
      || a.agent_name.localeCompare(b.agent_name));
};

module.exports = { stillOut, sheetTotals, daysOpen, groupByAgent };
