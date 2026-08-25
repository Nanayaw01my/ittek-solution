// Moved: every installment package now lives in installmentPlans.js so the
// freezers and the power stations stay side by side. Re-exported here because
// this path was the original one.
const { FREEZER_PACKAGES } = require('./installmentPlans');

module.exports = { FREEZER_PACKAGES };
