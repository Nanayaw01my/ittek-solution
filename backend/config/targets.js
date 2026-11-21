/**
 * Who may see the departments' targets.
 *
 * The shop named three: the CEO, the Managing Director and the Super
 * Admin. Deliberately a list rather than a level — level 3 would quietly
 * include the COO, and the shop did not say the COO. A rule that reaches
 * one person more than was asked for is the kind nobody notices until
 * the figures turn up somewhere they were not meant to.
 */
const TARGET_ROLES = ['CEO', 'Managing Director', 'Super Admin'];
const maySeeTargets = (role) => TARGET_ROLES.includes(role);

module.exports = { TARGET_ROLES, maySeeTargets };
