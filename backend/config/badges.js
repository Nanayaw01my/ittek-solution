/**
 * Who may sign in with a staff badge, and who has to prove it afterwards.
 *
 * A badge is not a secret. It is printed on a card, it can be photographed
 * across a counter, and a photocopy scans exactly like the original. So it
 * identifies somebody rather than authenticating them, and the rules below
 * decide how much that is allowed to be worth.
 *
 * The owners are kept off badges entirely: their accounts can delete records,
 * restore backups and read every customer's details, and none of that should
 * ever hang on a card somebody could copy.
 */

/** Cannot use a badge at all — username and password only. */
const BADGE_BLOCKED_ROLES = ['CEO', 'Super Admin'];

/**
 * Must enter a PIN after scanning. A field agent works away from the shop
 * with the shop's goods, so their badge is the one most likely to be out of
 * anybody's sight.
 */
const BADGE_PIN_ROLES = ['Field Agent'];

const badgeAllowed = (role) => !BADGE_BLOCKED_ROLES.includes(role);
const badgeNeedsPin = (role) => BADGE_PIN_ROLES.includes(role);

module.exports = { BADGE_BLOCKED_ROLES, BADGE_PIN_ROLES, badgeAllowed, badgeNeedsPin };
