/**
 * The three sides of the business, and how a product is put into one.
 *
 * The shop sells solar, networking and electricals out of one till, from one
 * catalogue, and that is right — a customer buying panels and a router pays
 * once. But at the end of the day the owners want to know which side of the
 * business the money came from, and nobody is going to tag five hundred
 * products by hand to find out.
 *
 * So it is worked out, in this order:
 *
 *   1. what the product itself says, if somebody has set it
 *   2. what its category says, if somebody has set that
 *   3. what the name looks like
 *   4. otherwise: unsorted, and said so rather than guessed
 *
 * The guess is deliberately the last resort and deliberately visible. A
 * figure on an owner's screen that came from a word match should be
 * correctable, and the screen says how many it had to guess at.
 */

const ASPECTS = [
  { key: 'solar', label: 'Solar' },
  { key: 'networking', label: 'Networking' },
  { key: 'electrical', label: 'Electricals' },
  { key: 'other', label: 'Unsorted' },
];

const ASPECT_KEYS = ASPECTS.map((a) => a.key);

/**
 * Words that place a product, most specific first.
 *
 * Order matters and the ambiguous words are why. "Switch" is a network
 * switch and a light switch; "cable" is solar cable, CAT6 and house wiring.
 * Those live at the bottom of their list, so a name carrying a word that
 * only means one thing — "inverter", "starlink", "breaker" — decides first.
 */
const KEYWORDS = {
  solar: [
    'solar', 'panel', 'inverter', 'mppt', 'pwm', 'charge controller', 'controller',
    'battery', 'batteries', 'lithium', 'tubular', 'photovoltaic', 'pv ',
    'mounting rail', 'solar cable', 'street light', 'floodlight', 'flood light',
  ],
  networking: [
    'starlink', 'router', 'modem', 'access point', 'repeater', 'extender',
    'antenna', 'cat6', 'cat 6', 'cat5', 'cat 5', 'rj45', 'poe', 'network',
    'wifi', 'wi-fi', 'hotspot', 'fibre', 'fiber', 'patch', 'lan ',
    'cctv', 'camera', 'dvr', 'nvr', 'network switch',
  ],
  electrical: [
    'breaker', 'mcb', 'fuse', 'distribution board', 'db box', 'conduit',
    'socket', 'plug ', 'bulb', 'lamp', 'holder', 'ceiling fan', 'trunking',
    'armoured', 'earth rod', 'junction box', 'contactor', 'change over',
    'wire', 'wiring', 'switch', 'cable',
  ],
};

/** Lower-cased, padded, so "lan " cannot match "Atlantic". */
const haystack = (...parts) => ` ${parts.filter(Boolean).join(' ').toLowerCase()} `;

/**
 * Which side of the business this name looks like.
 *
 * Returns null rather than a guess when nothing matches, because "unsorted"
 * is a useful answer and a wrong one is not.
 */
const guessFromName = (...parts) => {
  const text = haystack(...parts);
  for (const key of ['solar', 'networking', 'electrical']) {
    if (KEYWORDS[key].some((word) => text.includes(word))) return key;
  }
  return null;
};

/**
 * Where a product belongs, and how confidently.
 *
 * @param {Object} product  { name, aspect }
 * @param {Object} category { name, aspect }
 * @returns {{aspect: string, source: 'product'|'category'|'guess'|'none'}}
 */
const classify = (product = {}, category = null) => {
  const own = String(product.aspect || '').toLowerCase();
  if (ASPECT_KEYS.includes(own) && own !== 'other') return { aspect: own, source: 'product' };

  const cat = String(category?.aspect || '').toLowerCase();
  if (ASPECT_KEYS.includes(cat) && cat !== 'other') return { aspect: cat, source: 'category' };

  // The category's own name is worth reading even when nobody set its side —
  // a category called "Solar Panels" says what it is.
  const guess = guessFromName(product.name, product.product_name, category?.name);
  if (guess) return { aspect: guess, source: 'guess' };

  return { aspect: 'other', source: 'none' };
};

module.exports = { ASPECTS, ASPECT_KEYS, KEYWORDS, classify, guessFromName };
