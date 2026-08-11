import React, { createContext, useContext, useMemo, useCallback } from 'react'
import en from './en'

const I18nContext = createContext(null)

/**
 * Central UI string table.
 *
 * t('pos.checkout') looks up a dotted path and returns the key itself when a
 * string is missing, so a gap is visible rather than rendering blank.
 * Single-language (English) — the lookup layer stays so strings live in one
 * place instead of being scattered through JSX.
 */
const resolve = (path) =>
  path.split('.').reduce((node, key) => (node && node[key] !== undefined ? node[key] : undefined), en)

export function translate(key, vars) {
  let str = resolve(key)
  if (str === undefined) return key

  // {name}-style interpolation
  if (vars) {
    Object.entries(vars).forEach(([k, v]) => {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), v)
    })
  }
  return str
}

export function I18nProvider({ children }) {
  const t = useCallback((key, vars) => translate(key, vars), [])
  const value = useMemo(() => ({ t }), [t])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useTranslation() {
  const ctx = useContext(I18nContext)
  // Standalone pages render without the provider — never crash for a string.
  if (!ctx) return { t: translate }
  return ctx
}
