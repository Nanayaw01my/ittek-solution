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

/** Cannot *sign in* with a badge — username and password only. */
const BADGE_BLOCKED_ROLES = ['CEO', 'COO', 'Super Admin'];

/**
 * Must enter a PIN after scanning. A field agent works away from the shop
 * with the shop's goods, so their badge is the one most likely to be out of
 * anybody's sight.
 */
const BADGE_PIN_ROLES = ['Field Agent'];

/**
 * Carrying a card and signing in with one are two different things.
 *
 * The owners are still kept off badge *sign-in*, for the reasons above. But a
 * card that only says who somebody is costs nothing and is worth having for
 * everyone: it is how a printed card is checked against the person it was
 * made for, and how a card found on the floor is identified. Refusing the
 * owners a card at all meant those two could not be checked like anybody
 * else, which is backwards — they are the accounts worth being sure about.
 *
 * Nothing hangs on the owners' card: the sign-in path refuses their role
 * whatever is scanned, so the card opens nothing.
 */
const badgeLoginAllowed = (role) => !BADGE_BLOCKED_ROLES.includes(role);

/** Anyone may be given a card. What it is worth is decided above. */
const badgeIssueAllowed = () => true;

const badgeNeedsPin = (role) => BADGE_PIN_ROLES.includes(role);

module.exports = {
  BADGE_BLOCKED_ROLES, BADGE_PIN_ROLES,
  badgeLoginAllowed, badgeIssueAllowed, badgeNeedsPin,
};
