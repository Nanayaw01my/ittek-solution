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
  // Stored as 'networking' because that is what is already written against
  // categories and products; the shop calls it IT, which covers the
  // networking gear, the phones and the cameras alike.
  { key: 'networking', label: 'IT' },
  { key: 'electrical', label: 'Electricals' },
  { key: 'other', label: 'Unsorted' },
];

const ASPECT_KEYS = ASPECTS.map((a) => a.key);

/**
 * Brands and product codes, which beat any generic word in the name.
 *
 * A shop knows its own ranges, and that knowledge outranks guessing from
 * English. "Night Angel Flood Light" is an electrical fitting whatever the
 * word "flood light" suggests, and every NV- code is solar whatever else
 * is printed on the box.
 *
 * Checked before the word lists below, so adding a brand can never be
 * undone by an unlucky word somewhere else in the name.
 */
const BRANDS = {
  solar: [
    // The shop's own solar range: NV-K52, NV-E954, NV-T226 and the rest.
    // The hyphen is deliberate — "NVR" is a recorder, not a panel.
    'nv-',
  ],
  networking: [
    'hikvision', 'hik ', 'dahua', 'ds-2', 'ds2',
    'tecno', 'infinix', 'itel', 'redmi', 'xiaomi', 'samsung', 'iphone',
    'ipad', 'nokia', 'huawei', 'oppo', 'vivo', 'airpod',
  ],
  electrical: [
    // Fittings brands. Spelt both ways on the shelf and on the invoice.
    'night angel', 'night engel', 'nightangel', 'nite angel',
    'schneider', 'clipsal', 'legrand', 'abb ',
  ],
};

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
    /**
     * The shop's own code for its solar range.
     *
     * NV-K52, NV-E954, NV-T226 and the rest are all solar, and no word in
     * them says so — they were the largest group the list could not read.
     * First in the list because the shop's own naming beats any guess from
     * an English word elsewhere in the name.
     */
    'solar', 'panel', 'inverter', 'mppt', 'pwm', 'charge controller', 'controller',
    'battery', 'batteries', 'lithium', 'tubular', 'photovoltaic', 'pv ',
    'mounting rail', 'solar cable', 'street light', 'floodlight', 'flood light',
  ],
  networking: [
    // Networking
    'starlink', 'router', 'modem', 'access point', 'repeater', 'extender',
    'antenna', 'cat6', 'cat 6', 'cat5', 'cat 5', 'rj45', 'rj 45', 'poe', 'network',
    'wifi', 'wi-fi', 'hotspot', 'fibre', 'fiber', 'patch', 'lan ', 'ethernet',
    // Cameras and recorders. Hikvision's own codes carry no English word at
    // all, so the brand and its DS- prefix are listed outright.
    'cctv', 'camera', 'dvr', 'nvr', 'network switch', 'poe switch',
    /**
     * What goes on the wall beside a camera.
     *
     * A camera is never sold on its own: it goes out with the coax, the
     * baluns, the connectors, the bracket and a drive for the recorder. All
     * of it is IT, and most of it carries no word that says "camera" —
     * which is how a GHC900 install ended up split across three
     * departments.
     */
    'ptz', 'dome', 'turret', 'bullet camera', 'ip camera', 'surveillance',
    'bnc', 'rg59', 'rg 59', 'rg6', 'rg 6', 'coaxial', 'siamese', 'balun',
    'poe injector', 'patch cord', 'camera bracket', 'camera mount',
    'hard disk', 'hdd', 'intercom', 'doorbell', 'access control', 'monitor',
    // Phones and the things sold beside them.
    'phone', 'android', 'smartphone', 'tablet',
    'power bank', 'powerbank', 'earbud', 'earphone', 'headset',
    'memory card', 'sd card', 'flash drive', 'pendrive', 'usb ',
    /**
     * Phone chargers and their leads.
     *
     * "charger" is safe to list here even though solar has a charge
     * controller: the solar words are read first, and "charge controller"
     * is not "charger" in any case. A solar charger still says solar, and
     * that word wins before this list is reached.
     */
    'charger', 'charging', 'type c', 'type-c', 'usb-c', 'usb c',
    'micro usb', 'lightning cable', 'fast charge', 'car charger',
    'laptop', 'desktop', 'printer', 'toner', 'cartridge', 'keyboard', 'mouse',
    'ups ', 'projector', 'scanner',
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

  // A brand the shop stocks beats any word in the rest of the name.
  for (const key of ['solar', 'networking', 'electrical']) {
    if (BRANDS[key].some((word) => text.includes(word))) return key;
  }

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

module.exports = { ASPECTS, ASPECT_KEYS, BRANDS, KEYWORDS, classify, guessFromName };
