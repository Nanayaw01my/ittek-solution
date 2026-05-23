const axios = require('axios');

const PAYSTACK_BASE_URL = 'https://api.paystack.co';

const getHeaders = () => ({
  Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
  'Content-Type': 'application/json',
});

/**
 * Initialize a Paystack payment transaction.
 * @param {Object} params
 * @param {string} params.email - Customer email
 * @param {number} params.amount - Amount in GHS (will be converted to kobo)
 * @param {string} params.reference - Unique transaction reference
 * @param {string} params.callback_url - URL to redirect after payment
 * @param {Object} params.metadata - Additional metadata
 * @returns {Object} Paystack initialization response
 */
const initializePayment = async ({ email, amount, reference, callback_url, metadata = {} }) => {
  // Convert GHS to kobo (multiply by 100)
  const amountInKobo = Math.round(amount * 100);

  const payload = {
    email,
    amount: amountInKobo,
    reference,
    callback_url,
    metadata,
    currency: 'GHS',
  };

  const response = await axios.post(`${PAYSTACK_BASE_URL}/transaction/initialize`, payload, {
    headers: getHeaders(),
  });

  return response.data;
};

/**
 * Verify a Paystack payment by reference.
 * @param {string} reference - Transaction reference
 * @returns {Object} Paystack verification response
 */
const verifyPayment = async (reference) => {
  const response = await axios.get(
    `${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`,
    { headers: getHeaders() }
  );

  return response.data;
};

/**
 * Get a list of transactions from Paystack.
 * @param {Object} params - Query parameters (page, perPage, etc.)
 * @returns {Object} Paystack transactions list
 */
const listTransactions = async (params = {}) => {
  const response = await axios.get(`${PAYSTACK_BASE_URL}/transaction`, {
    headers: getHeaders(),
    params,
  });

  return response.data;
};

module.exports = { initializePayment, verifyPayment, listTransactions };
