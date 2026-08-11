import React, { createContext, useContext, useState, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getSettings } from '../api/settings'

const CurrencyContext = createContext(null)
const STORAGE_KEY = 'ittek_display_currency'

const FALLBACK = [{ code: 'GHS', symbol: 'GH₵', rate: 1, is_active: true }]

/**
 * Display-currency layer.
 *
 * All values in the app are base currency (GHS) — this only changes what the
 * user sees. Anything sent back to the server stays in base, so conversion
 * drift can never corrupt stored totals.
 */
export function CurrencyProvider({ children }) {
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => getSettings().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  })

  const [displayCode, setDisplayCode] = useState(() => localStorage.getItem(STORAGE_KEY) || '')

  const currencies = settings?.currencies?.length ? settings.currencies.filter((c) => c.is_active !== false) : FALLBACK
  const baseCode = settings?.base_currency || 'GHS'
  const active = currencies.find((c) => c.code === (displayCode || baseCode)) || currencies[0] || FALLBACK[0]

  const setCurrency = useCallback((code) => {
    localStorage.setItem(STORAGE_KEY, code)
    setDisplayCode(code)
  }, [])

  /** Convert a base-currency amount into the display currency. */
  const convert = useCallback((amount) => (Number(amount) || 0) * (active?.rate || 1), [active])

  /** Format a base-currency amount for display. */
  const format = useCallback(
    (amount) => {
      const value = convert(amount)
      return `${active?.symbol || 'GH₵'}${value.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`
    },
    [convert, active]
  )

  const value = useMemo(
    () => ({
      currencies, baseCode, currency: active, code: active?.code || baseCode,
      symbol: active?.symbol || 'GH₵', rate: active?.rate || 1,
      isBase: (active?.code || baseCode) === baseCode,
      setCurrency, convert, format,
    }),
    [currencies, baseCode, active, setCurrency, convert, format]
  )

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext)
  if (!ctx) {
    // Standalone pages (e.g. the public receipt) render without the provider.
    return {
      currencies: FALLBACK, baseCode: 'GHS', code: 'GHS', symbol: 'GH₵', rate: 1, isBase: true,
      setCurrency: () => {},
      convert: (a) => Number(a) || 0,
      format: (a) => `GH₵${(Number(a) || 0).toFixed(2)}`,
    }
  }
  return ctx
}
