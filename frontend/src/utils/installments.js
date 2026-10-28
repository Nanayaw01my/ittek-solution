/**
 * A balance broken into daily, weekly and monthly payments.
 *
 * The browser's copy of backend/utils/installments.js, so the figures a
 * customer is quoted at the counter are the figures that print on the
 * sheet. If one of these changes the other has to, and the backend is the
 * authority — it is the one with the tests.
 */

const PERIODS = {
  daily: (months) => Math.max(1, Math.round(months * 30)),
  weekly: (months) => Math.max(1, Math.round((months * 30) / 7)),
  monthly: (months) => Math.max(1, Math.round(months)),
}

const LABELS = {
  daily: { unit: 'a day', each: 'daily' },
  weekly: { unit: 'a week', each: 'weekly' },
  monthly: { unit: 'a month', each: 'monthly' },
}

export function breakdown({ total, downPayment = 0, months = 3 } = {}) {
  const goods = Math.max(0, Number(total) || 0)
  // A deposit larger than the goods is a typo, not a gift — capped, or the
  // instalments print as negative figures.
  const down = Math.min(goods, Math.max(0, Number(downPayment) || 0))
  const balance = Number((goods - down).toFixed(2))
  const term = Math.max(1, Math.min(60, Math.round(Number(months) || 0) || 1))

  const options = Object.keys(PERIODS).map((key) => {
    const periods = PERIODS[key](term)
    const amount = Number((balance / periods).toFixed(2))
    return {
      key,
      ...LABELS[key],
      periods,
      amount,
      approx: Math.abs(amount * periods - balance) > 0.005,
    }
  })

  return { down, balance, months: term, options }
}
