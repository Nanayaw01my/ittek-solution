import React, { useState, useRef, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { FiHelpCircle, FiX, FiSearch, FiChevronLeft, FiLock } from 'react-icons/fi'
import { searchTopics, topicsFor } from '../config/helpTopics'
import { getRoleLevel } from '../utils/helpers'
import useAuthStore from '../store/authStore'

/**
 * Ask the system how to do something.
 *
 * Answers come from a handbook written into the app, not from an AI. That
 * means no running cost, no account to pay for, it works when the internet
 * does not, and it can never describe a button that is not there. The price
 * of that is honesty: when nothing matches, it says so instead of guessing.
 *
 * What somebody may read follows their role. Money — cost prices, margins,
 * profit, takings, debts, wages — is kept to owners, because the rest of the
 * system already keeps it from Managers and Sales, and a helper that answered
 * "what did this cost us" would be the hole in that.
 */
export default function HelpAssistant() {
  const { user } = useAuthStore()
  const { pathname } = useLocation()
  const level = getRoleLevel(user?.role)

  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [reading, setReading] = useState(null)
  const boxRef = useRef(null)

  // Opened fresh each time: the last question is rarely this question.
  useEffect(() => {
    if (!open) return
    setQuestion('')
    setReading(null)
    const t = setTimeout(() => boxRef.current?.focus(), 150)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const result = searchTopics(question, level, pathname)
  const mine = topicsFor(level)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="How do I…?"
        aria-label="Help"
        className="p-2 rounded-lg text-gray-600 hover:bg-orange-50 hover:text-orange-600 transition-colors"
      >
        <FiHelpCircle size={18} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          <div className="relative w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[88vh] flex flex-col">
            <div className="flex items-center gap-3 px-5 py-4 bg-orange-500 rounded-t-2xl">
              {reading && (
                <button onClick={() => setReading(null)} className="text-white/90 hover:text-white">
                  <FiChevronLeft size={20} />
                </button>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-black text-white">How do I…?</p>
                <p className="text-[11px] text-orange-100">
                  Ask about the system — answers for {user?.role || 'your role'}
                </p>
              </div>
              <button onClick={() => setOpen(false)} className="text-white/90 hover:text-white">
                <FiX size={20} />
              </button>
            </div>

            {!reading && (
              <div className="px-5 pt-4">
                <div className="relative">
                  <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <input
                    ref={boxRef}
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="e.g. how do I make a refund?"
                    className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {reading ? (
                <article>
                  <h3 className="font-black text-gray-900 mb-3">{reading.title}</h3>
                  <ol className="space-y-2.5">
                    {(reading.steps || []).map((s, i) => (
                      <li key={i} className="flex gap-3">
                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-orange-100 text-orange-700 text-[11px] font-black flex items-center justify-center">
                          {i + 1}
                        </span>
                        <span className="text-sm text-gray-700 leading-relaxed">{s}</span>
                      </li>
                    ))}
                  </ol>
                  {reading.note && (
                    <p className="mt-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                      {reading.note}
                    </p>
                  )}
                </article>
              ) : (
                <>
                  {result.kind === 'suggestions' && (
                    <p className="text-xs text-gray-400 mb-2">
                      {question ? '' : 'Things you can do from here'}
                    </p>
                  )}

                  {/* Asked about money by somebody the system keeps it from.
                      Being told why is more use than "no answer". */}
                  {result.kind === 'not-for-you' && (
                    <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 text-center">
                      <FiLock className="mx-auto text-gray-400 mb-2" size={20} />
                      <p className="text-sm font-semibold text-gray-700">
                        That is not something I can answer for your role.
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Cost prices, profit and takings are kept to the CEO, COO and Super Admin.
                        Ask one of them.
                      </p>
                    </div>
                  )}

                  {result.kind === 'none' && (
                    <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 text-center">
                      <p className="text-sm font-semibold text-gray-700">
                        I do not have an answer for that one.
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Try different words, or pick from the list below. If it is something the
                        system should explain, tell the office so it can be written down.
                      </p>
                    </div>
                  )}

                  <div className="space-y-2 mt-3">
                    {(result.topics.length ? result.topics : (result.kind === 'answers' ? [] : mine))
                      .map((t) => (
                        <button
                          key={t.id}
                          onClick={() => setReading(t)}
                          className="w-full text-left px-4 py-3 rounded-xl border border-gray-200 hover:border-orange-300 hover:bg-orange-50 transition-colors"
                        >
                          <p className="text-sm font-semibold text-gray-800">{t.title}</p>
                          <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-1">
                            {(t.steps || [])[0]}
                          </p>
                        </button>
                      ))}
                  </div>
                </>
              )}
            </div>

            <div className="px-5 py-3 border-t border-gray-100">
              <p className="text-[11px] text-gray-400">
                Written answers about this system. It works without internet, and it will say
                when it does not know rather than guess.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
