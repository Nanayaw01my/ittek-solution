import React, { useState, useRef, useEffect } from 'react'
import { FiGlobe, FiCheck } from 'react-icons/fi'
import { useTranslation, LANGUAGES } from '../i18n'
import { useCurrency } from '../contexts/CurrencyContext'

/**
 * Header control for display language and display currency.
 *
 * Currency here is presentation only — every amount is stored and sent in the
 * shop's base currency, so switching never alters the books.
 */
export default function LocaleSwitcher() {
  const { language, setLanguage, t } = useTranslation()
  const { currencies, code, setCurrency, baseCode } = useCurrency()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const onClickAway = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickAway)
    return () => document.removeEventListener('mousedown', onClickAway)
  }, [])

  const activeLang = LANGUAGES.find((l) => l.code === language) || LANGUAGES[0]

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="p-2 rounded-lg text-gray-600 hover:bg-orange-50 hover:text-orange-600 transition-colors flex items-center gap-1"
        aria-label="Language and currency"
      >
        <FiGlobe size={18} />
        <span className="text-xs font-bold hidden sm:inline">{code}</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{t('common.language')}</p>
          </div>
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              onClick={() => { setLanguage(lang.code); setOpen(false) }}
              className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-orange-50 transition-colors"
            >
              <span>{lang.flag} {lang.label}</span>
              {language === lang.code && <FiCheck size={14} className="text-orange-500" />}
            </button>
          ))}

          <div className="px-3 py-2 border-b border-t border-gray-100">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{t('common.currency')}</p>
          </div>
          {currencies.map((c) => (
            <button
              key={c.code}
              onClick={() => { setCurrency(c.code); setOpen(false) }}
              className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-orange-50 transition-colors"
            >
              <span>
                {c.symbol} {c.code}
                {c.code === baseCode && <span className="text-[10px] text-gray-400 ml-1">(base)</span>}
              </span>
              {code === c.code && <FiCheck size={14} className="text-orange-500" />}
            </button>
          ))}

          <p className="px-3 py-2 text-[10px] text-gray-400 border-t border-gray-100 leading-snug">
            Currency changes what you see. Amounts are always stored in {baseCode}.
          </p>
        </div>
      )}
    </div>
  )
}
