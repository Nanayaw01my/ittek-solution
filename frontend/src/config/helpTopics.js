/**
 * The shop's own handbook, written into the app.
 *
 * Deliberately not an AI. Every answer here is a fixed piece of text about
 * how this system actually behaves, so it costs nothing to run, works with
 * no internet, and cannot invent a step that does not exist. An assistant
 * that confidently describes a button nobody can find is worse than no
 * assistant at all.
 *
 * `level` is the lowest role level that may see a topic, using the same
 * numbers as the rest of the system: Sales and Field Agent 1, Manager 2,
 * CEO / COO / Super Admin 3, Super Admin 4.
 *
 * Money is the line that matters. Cost prices, margins, takings, profit,
 * debts and wages sit at level 3, because the rest of the system already
 * keeps them from Managers and Sales and this must not become the hole in
 * that. Selling prices are not secret — staff read them off the till all
 * day — so those stay at level 1.
 */

export const HELP_TOPICS = [
  // ── Selling ───────────────────────────────────────────────────────────
  {
    id: 'make-a-sale',
    title: 'Make a sale',
    level: 1,
    pages: ['/pos'],
    keywords: ['sell', 'sale', 'pos', 'point of sale', 'checkout', 'cart', 'invoice', 'customer'],
    steps: [
      'Open Point of Sale.',
      'Scan the product barcode, or search for it by name and tap it. Scanning the same item twice adds two.',
      'Type the customer’s phone number if you have it — it saves them to the Contact Book on its own, so you can reach them later.',
      'Choose how they paid, then complete the sale.',
      'The receipt prints with its own barcode. Keep that barcode: it is how a refund is found later.',
    ],
    note: 'If the internet drops, the till keeps working. Sales are held on the device and sent up when the connection comes back.',
  },
  {
    id: 'refund',
    title: 'Refund a sale',
    level: 1,
    pages: ['/refunds'],
    keywords: ['refund', 'return', 'money back', 'give back', 'reverse', 'cancel sale', 'returned'],
    steps: [
      'Open Refunds.',
      'Scan the barcode on the customer’s receipt. That is the quickest way — it finds the exact sale.',
      'No receipt? Search by invoice number, customer name or phone number instead.',
      'Pick the items being returned and say how many of each.',
      'Give the reason, then record the refund.',
    ],
    note: 'A refund is dated the day you give the money back, not the day of the original sale. That is why today’s takings drop by the refund even when the sale was last week.',
  },
  {
    id: 'receipt-barcode',
    title: 'The barcode on a receipt',
    level: 1,
    pages: ['/refunds', '/pos'],
    keywords: ['receipt barcode', 'scan receipt', 'barcode not working', 'scanner', 'scan'],
    steps: [
      'Every receipt carries a barcode for that sale, printed whether the till was online or offline.',
      'Scanning it on the Refunds screen pulls up that exact sale.',
      'If the scanner does not seem to work, click into the scan box first, then scan.',
      'Scanners type very fast and then press Enter. If nothing happens at all, the scanner may be set to a different keyboard mode — try it in any text box to see if it types.',
    ],
  },

  // ── Stock ─────────────────────────────────────────────────────────────
  {
    id: 'print-barcode',
    title: 'Print barcode labels for a product',
    level: 1,
    pages: ['/products'],
    keywords: ['barcode', 'label', 'print barcode', 'sticker', 'tag', 'print labels'],
    steps: [
      'Open Products and find the item.',
      'Press the printer button on its row.',
      'Say how many labels you need — there is a one-tap option for one label per item in stock.',
      'Press Print. The sheet opens ready to print, three labels across.',
    ],
    note: 'If it says the product has no barcode, give it one from the product itself first. A product with no barcode cannot be scanned at the till.',
  },
  {
    id: 'receive-stock',
    title: 'Record stock that has arrived',
    level: 1,
    pages: ['/purchases'],
    keywords: ['receive', 'delivery', 'arrived', 'purchase', 'new stock', 'goods', 'lorry', 'supplier'],
    steps: [
      'Open Purchases and press Add Purchase.',
      'Choose the supplier.',
      'Scan each item as it comes off the lorry, or pick it from the list and type how many.',
      'Record it. The stock goes onto the shelf straight away.',
    ],
    note: 'Managers and staff do not enter what the goods cost — the office does that afterwards. Just say what came in.',
  },
  {
    id: 'price-a-delivery',
    title: 'Enter what a delivery cost',
    level: 3,
    pages: ['/purchases'],
    keywords: ['cost', 'cost price', 'price a delivery', 'not priced', 'costing', 'unpriced'],
    steps: [
      'Open Purchases. A delivery a manager received is marked NOT PRICED YET.',
      'Open it with the eye button.',
      'Type what one of each item cost you, then save.',
      'Only now does the product’s cost price change — which is why profit figures stay honest until an owner has confirmed the cost.',
    ],
    note: 'You must price every line at once. A half-priced delivery would carry an old cost into profit with nothing flagging it.',
  },
  {
    id: 'stock-request',
    title: 'Ask for stock to be bought',
    level: 2,
    pages: ['/stock-requests'],
    keywords: ['stock request', 'order', 'request', 'buy', 'reorder', 'new product', 'ask for'],
    steps: [
      'Open Stock Requests and press New Request.',
      'Pick each product and say how many you need.',
      'For something the shop has never stocked, tick “New item — not in the list yet”, type its name, and give its cost and selling price.',
      'Submit it. The owners are told, and are shown which lines are new.',
    ],
    note: 'Approving a new item is what creates the product, at zero stock. The quantity lands when the goods are actually received.',
  },
  {
    id: 'approve-stock-request',
    title: 'Approve a stock request, and change the quantity',
    level: 3,
    pages: ['/stock-requests'],
    keywords: ['approve', 'stock request', 'quantity', 'reject', 'approve request'],
    steps: [
      'Open Stock Requests and press the tick on a pending request.',
      'Each line shows what was asked for, beside a box for what you are actually buying.',
      'Change any quantity — ten asked, six bought. The total updates before you commit.',
      'Set a line to 0 to leave it out entirely.',
      'Press Approve. The person who asked is told what changed.',
    ],
    note: 'Approving everything at zero is refused. That is a rejection, and it should be recorded as one with a reason.',
  },
  {
    id: 'stock-count',
    title: 'Correct what the system thinks is on the shelf',
    level: 1,
    pages: ['/products'],
    keywords: ['stock count', 'count', 'adjust', 'wrong quantity', 'stock take', 'shelf'],
    steps: [
      'Open Products.',
      'Use Scan stock to scan the shelf, or press Adjust on a product to set its count directly.',
      'Choose whether what you scanned has arrived (added to the count) or is everything there is (replaces the count).',
      'Commit the session in one go, so a half-finished count never leaves the shelf half-corrected.',
    ],
  },

  // ── Money ─────────────────────────────────────────────────────────────
  {
    id: 'expenses',
    title: 'Record an expense',
    level: 1,
    pages: ['/expenses'],
    keywords: ['expense', 'spend', 'paid out', 'fuel', 'transport', 'buy', 'cost of running'],
    steps: [
      'Open Expenses and press Add Expense.',
      'Choose the category, type what it was for and how much.',
      'Save it.',
    ],
    note: 'Unless you are an owner, your expense waits for the CEO to approve it. Until then it does not count against the shop, and it shows as Waiting.',
  },
  {
    id: 'approve-expense',
    title: 'Approve or turn down an expense',
    level: 3,
    pages: ['/expenses'],
    keywords: ['approve expense', 'reject expense', 'waiting', 'pending expense'],
    steps: [
      'Open Expenses. Anything waiting is marked and its amount is greyed out.',
      'Press Approve on the row, and it starts counting.',
      'Press Reject to turn it down — you are asked why, and the person who entered it is told.',
    ],
    note: 'A rejected expense is kept with its reason rather than disappearing, so there is a record of the decision.',
  },
  {
    id: 'cash-up',
    title: 'Cash up at the end of the day',
    level: 2,
    pages: ['/cash-up'],
    keywords: ['cash up', 'close', 'end of day', 'drawer', 'count money', 'till'],
    steps: [
      'Open Cash Up.',
      'The screen shows what the system believes came in, split by how it was paid.',
      'Count the drawer and type what is actually there.',
      'Save it. Any difference is recorded rather than quietly absorbed.',
    ],
  },
  {
    id: 'todays-sales-figure',
    title: 'Why Today’s Sales shows what it shows',
    level: 3,
    pages: ['/'],
    keywords: ['today sales', 'dashboard', 'zero', 'figure wrong', 'takings', 'why is it zero'],
    steps: [
      'Today’s Sales is what was taken today, less anything refunded today.',
      'The line underneath always says how it was worked out — how many sales, and how much was refunded.',
      'A refund is dated the day the money went back, so refunding an old sale lowers today’s figure. It can go below zero, and it will show the minus rather than hiding it.',
      'Goods leaving on a Pay & Pick Later plan add nothing here, because that money was counted as the instalments came in. The line underneath says so.',
    ],
    note: 'If the figure did not load at all, the card says so in red. A red warning is not the same as a real zero.',
  },

  // ── Customers ─────────────────────────────────────────────────────────
  {
    id: 'contact-book',
    title: 'Save a customer’s number',
    level: 2,
    pages: ['/contacts'],
    keywords: ['customer', 'contact', 'phone number', 'save number', 'contact book', 'add customer'],
    steps: [
      'Numbers typed at the till save themselves — you do not have to do anything.',
      'For somebody the till never saw, open Contact Book and press Add customer.',
      'Type their number and name. A birthday and notes are optional.',
      'If the number is already there, it updates that person instead of making a second row.',
    ],
  },
  {
    id: 'message-customers',
    title: 'Send one message to all your customers',
    level: 2,
    pages: ['/contacts', '/reminders'],
    keywords: ['message', 'sms', 'text', 'bulk', 'wish', 'christmas', 'send to all', 'broadcast'],
    steps: [
      'Open Contact Book and press Message customers.',
      'Write the message once. Each person is greeted by their first name where you have it.',
      'Leave it on “Everyone in the book”, or tick just the ones you want.',
      'Press Send. You are shown how many messages and how many credits it will use before anything goes.',
    ],
    note: 'Anyone who asked not to be messaged is left out. A message over 160 characters costs two credits per person, which doubles the cost of a big send.',
  },
  {
    id: 'credit-agreement',
    title: 'Sell on credit, and swap the product later',
    level: 2,
    pages: ['/credit-agreements'],
    keywords: ['credit', 'installment', 'instalment', 'agreement', 'swap', 'exchange', 'change product', 'guarantor'],
    steps: [
      'Open Credit Agreements and press New Agreement for a new one.',
      'To change the product on an existing agreement, press the swap button on its row — or open it and scroll to “Change the product”.',
      'Say what is coming back and what they are taking, and what you are crediting the returned item at.',
      'Choose how they pay the new balance: every day, week or month, and the dates they start and finish.',
      'Press Swap and print the note. Both of you sign it, one copy each.',
    ],
    note: 'The agreement is not restarted. Same customer, same guarantor, everything already paid still counts — only the item and the balance change.',
  },

  // ── Running the system ────────────────────────────────────────────────
  {
    id: 'backups',
    title: 'Backups — are they working?',
    level: 3,
    pages: ['/system-health', '/backup'],
    keywords: ['backup', 'restore', 'lost data', 'safe', 'copy', 'email backup'],
    steps: [
      'The system backs itself up every night and emails the file to you.',
      'Open System Health to see whether it is working. Green means last night’s backup went.',
      'Red means it failed, and the panel says what to do about that particular fault.',
      'You can always take one by hand from Backup & Restore.',
    ],
    note: 'A backup you have never restored is not yet proven. Try restoring one on a quiet day, before you ever need it.',
  },
  {
    id: 'email-setup',
    title: 'Set up email so backups can be sent',
    level: 4,
    pages: ['/settings', '/system-health'],
    keywords: ['email', 'smtp', 'gmail', 'mail', 'backup email', 'app password', 'send email'],
    steps: [
      'Open Settings → Email Config.',
      'Host smtp.gmail.com, port 587, your Gmail address as the user.',
      'For the password you need a Gmail app password, not your normal one — Google Account → Security → 2-Step Verification → App passwords.',
      'Save, then press the test button. It tells you exactly what the mail server said.',
      'If port 587 times out, try 465 and test again.',
    ],
    note: 'Leaving the password box empty keeps the one already saved. You only retype it when it changes.',
  },
  {
    id: 'system-health',
    title: 'Check whether everything is running',
    level: 3,
    pages: ['/system-health'],
    keywords: ['system health', 'broken', 'working', 'jobs', 'credits', 'version', 'deployed'],
    steps: [
      'Open System Health. It shows the things that run on their own: backups, texts, debt chasing, phone alerts.',
      'It also shows which version of the system is deployed. If a change you were told about is missing, check that first.',
      'Press “Run what is due” to make the overnight jobs run now rather than waiting.',
    ],
  },
  {
    id: 'sms-credits',
    title: 'Text message credits',
    level: 3,
    pages: ['/settings', '/system-health'],
    keywords: ['credits', 'arkesel', 'sms', 'balance', 'top up', 'running out'],
    steps: [
      'Your remaining credits show on System Health and in Settings → Text messages.',
      'Buy more from Arkesel, then they appear here on their own — nothing to type in.',
      'One message up to 160 characters is one credit per person. Longer messages cost more per person.',
    ],
  },
  {
    id: 'staff-access',
    title: 'What each role can see',
    level: 2,
    pages: ['/users'],
    keywords: ['role', 'permission', 'access', 'staff', 'user', 'cannot see', 'denied'],
    steps: [
      'Sales and Field Agent handle selling and stock, and do not see cost prices or profit.',
      'Managers run the shop floor: stock, requests, customers and cashing up.',
      'CEO, COO and Super Admin see the money — costs, margins, profit, debts and wages.',
      'Super Admin alone changes system settings and users.',
    ],
    note: 'If somebody cannot see a screen they need, an owner changes it on the Users page.',
  },
  {
    id: 'offline',
    title: 'When the internet goes',
    level: 1,
    pages: ['/pos'],
    keywords: ['offline', 'internet', 'no network', 'data', 'sync', 'not loading'],
    steps: [
      'The till keeps selling with no internet. Sales are saved on the device.',
      'When the connection comes back they are sent up on their own.',
      'Receipts still print, with their barcode, so refunds still work afterwards.',
      'Screens that need the server — reports, settings — will say they could not load rather than showing wrong figures.',
    ],
  },
];

/**
 * The topics a given role may see.
 *
 * Filtered here rather than hidden on screen, so a topic that is not for
 * somebody is never searched, never matched and never shown — the same rule
 * the rest of the system uses for money.
 */
export const topicsFor = (level) => HELP_TOPICS.filter((t) => (t.level || 1) <= (level || 1));

/** CEO, COO and Super Admin. The level at which money may be discussed. */
const OWNER_LEVEL = 3;

/**
 * Questions about money, which only an owner may be answered.
 *
 * Matched on the question itself rather than on what any topic happens to
 * say, so the refusal does not depend on how the handbook is worded. A
 * selling price is deliberately absent: staff read those off the till all
 * day, and refusing them would make the helper useless at the counter.
 */
const MONEY_WORDS = [
  'profit', 'margin', 'cost price', 'cost us', 'cost of', 'what it cost', 'takings',
  'revenue', 'turnover', 'income', 'earned', 'earning', 'owed', 'owes', 'owe us',
  'debt', 'debtor', 'salary', 'wages', 'wage', 'payroll', 'bonus',
  'how much did we', 'how much have we', 'how much do we', 'bought it for',
  'buying price', 'purchase price', 'supplier price', 'banked', 'cash up total',
];

/** Words that appear in every question and so match nothing useful. */
const FILLER = new Set([
  'how', 'what', 'where', 'when', 'why', 'who', 'does', 'did', 'the', 'and', 'for',
  'our', 'your', 'you', 'can', 'get', 'got', 'this', 'that', 'with', 'from', 'are',
  'was', 'has', 'have', 'about', 'much', 'many', 'need', 'want', 'see', 'show',
  'tell', 'please', 'there', 'their', 'them', 'they', 'its', 'but', 'not', 'all',
  'any', 'use', 'using', 'make', 'made', 'doing', 'now', 'today',
]);

/** Everything a topic can be matched on, as one lowercase haystack. */
const haystack = (t) => [
  t.title, ...(t.keywords || []), ...(t.steps || []), t.note || '',
].join(' ').toLowerCase();

/**
 * Find the topics that answer a question.
 *
 * Plain word matching, on purpose. It cannot answer something nobody wrote
 * down — and when it cannot, saying so is the correct answer rather than the
 * nearest-looking guess.
 */
export const searchTopics = (question, level, currentPath) => {
  const allowed = topicsFor(level);
  const q = String(question || '').toLowerCase().trim();

  if (!q) {
    // Nothing asked yet: offer what belongs to the screen they are on.
    const here = allowed.filter((t) => (t.pages || []).includes(currentPath));
    return { kind: 'suggestions', topics: here.length ? here : allowed.slice(0, 6) };
  }

  /**
   * Money is checked before anything is searched, not after.
   *
   * Asking it last meant a Manager's "what is the cost price?" could match
   * some unrelated topic that merely used the word, and quietly return that
   * instead of refusing. The rule has to come first to be a rule.
   */
  if ((level || 1) < OWNER_LEVEL && MONEY_WORDS.some((w) => q.includes(w))) {
    return { kind: 'not-for-you', topics: [] };
  }

  // Words worth matching on. Filler is dropped: "what", "how" and the rest
  // appear in every question and in every answer, so matching on them makes
  // everything match everything.
  const words = q.split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !FILLER.has(w));

  if (words.length === 0) return { kind: 'none', topics: [] };

  const scored = allowed.map((t) => {
    const hay = haystack(t);
    let score = 0;
    for (const w of words) {
      if (!hay.includes(w)) continue;
      score += 1;
      // A word in the title, or in what the topic is filed under, is worth
      // more than the same word buried in a step.
      if (t.title.toLowerCase().includes(w)) score += 3;
      if ((t.keywords || []).some((k) => k.includes(w))) score += 2;
    }
    // A tie is broken by what the person is looking at.
    if (score > 0 && (t.pages || []).includes(currentPath)) score += 1;
    return { topic: t, score };
  }).filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return { kind: 'none', topics: [] };

  return { kind: 'answers', topics: scored.slice(0, 5).map((s) => s.topic) };
};
