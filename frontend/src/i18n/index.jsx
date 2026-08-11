import React, { createContext, useContext, useState, useCallback, useMemo } from 'react'
import en from './en'
import fr from './fr'

const DICTIONARIES = { en, fr }

export const LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
]

const I18nContext = createContext(null)

const STORAGE_KEY = 'ittek_language'

/**
 * Minimal i18n — no dependency, no build step.
 *
 * t('pos.checkout') looks up a dotted path, falls back to English when a
 * French string is missing, and finally returns the key itself so a missing
 * translation is visible rather than rendering blank.
 */
const resolve = (dict, path) =>
  path.split('.').reduce((node, key) => (node && node[key] !== undefined ? node[key] : undefined), dict)

export function I18nProvider({ children }) {
  const [language, setLanguageState] = useState(() => localStorage.getItem(STORAGE_KEY) || 'en')

  const setLanguage = useCallback((code) => {
    if (!DICTIONARIES[code]) return
    localStorage.setItem(STORAGE_KEY, code)
    setLanguageState(code)
  }, [])

  const t = useCallback(
    (key, vars) => {
      let str = resolve(DICTIONARIES[language], key)
      if (str === undefined) str = resolve(DICTIONARIES.en, key)
      if (str === undefined) return key

      // {name}-style interpolation
      if (vars) {
        Object.entries(vars).forEach(([k, v]) => {
          str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), v)
        })
      }
      return str
    },
    [language]
  )

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useTranslation() {
  const ctx = useContext(I18nContext)
  // Never crash a page for a missing provider — fall back to English keys.
  if (!ctx) {
    return { language: 'en', setLanguage: () => {}, t: (key) => resolve(DICTIONARIES.en, key) ?? key }
  }
  return ctx
}
