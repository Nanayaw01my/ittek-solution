import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FiUser, FiArrowRight } from 'react-icons/fi'
import useAuthStore from '../store/authStore'
import { FIELD_AGENT_HOME } from '../components/Layout'
import { getMe } from '../api/auth'
import { getRoleLabel } from '../utils/helpers'

/** Morning, afternoon or evening, by the clock on the device. */
const greeting = () => {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

/**
 * The first screen after signing in: the person's own photo, their name, and
 * the day.
 *
 * It moves on by itself after a few seconds so nobody has to click through it
 * every morning, and the button is there for anyone who would rather not wait.
 * Someone who reloads or navigates here later is sent straight on — this is a
 * greeting on arrival, not a screen to get stuck behind.
 */
export default function Welcome() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const updateUser = useAuthStore(s => s.updateUser)
  const [leaving, setLeaving] = useState(false)

  /**
   * Ask the server for the photo rather than trusting what the sign-in
   * response happened to include.
   *
   * This screen sits outside the layout that normally refreshes the stored
   * user, and the sign-in payload once omitted the photo entirely — which
   * showed here as a name over an empty circle. Asking directly means the
   * greeting is right whatever the sign-in response carried.
   */
  useEffect(() => {
    if (user?.avatar_url) return
    let cancelled = false
    getMe()
      .then(r => {
        const fresh = r.data?.data || r.data
        if (!cancelled && fresh?.avatar_url) updateUser({ avatar_url: fresh.avatar_url })
      })
      .catch(() => {})
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A field agent has no dashboard — their one screen is where they land.
  const home = user?.role === 'Field Agent' ? FIELD_AGENT_HOME : '/dashboard'

  const go = () => {
    setLeaving(true)
    navigate(home, { replace: true })
  }

  useEffect(() => {
    const t = setTimeout(() => navigate(home, { replace: true }), 3500)
    return () => clearTimeout(t)
  }, [navigate, home])

  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-gradient-to-b from-orange-50 via-white to-white">
      <div className="fixed top-0 left-0 right-0 h-1 flex">
        <div className="flex-1 bg-red-500" />
        <div className="flex-1 bg-yellow-400" />
        <div className="flex-1 bg-green-600" />
      </div>

      <div className={`text-center transition-opacity duration-300 ${leaving ? 'opacity-0' : 'opacity-100'}`}>
        <div className="w-32 h-32 sm:w-40 sm:h-40 mx-auto mb-6 rounded-full overflow-hidden bg-orange-100 border-4 border-white shadow-xl shadow-orange-200/60 flex items-center justify-center">
          {user?.avatar_url
            ? <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
            : <FiUser className="text-orange-300" size={64} />}
        </div>

        <p className="text-sm font-semibold text-orange-600 mb-1">{greeting()},</p>
        <h1 className="text-3xl sm:text-4xl font-black text-gray-900 mb-2 capitalize">
          {user?.username || 'there'}
        </h1>
        {user?.role && (
          <p className="text-sm text-gray-500 mb-1">{getRoleLabel(user.role)}</p>
        )}
        <p className="text-xs text-gray-400 mb-8">{today}</p>

        <button
          onClick={go}
          className="inline-flex items-center gap-2 px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold text-sm transition-colors shadow-lg shadow-orange-200"
        >
          Continue <FiArrowRight size={16} />
        </button>
      </div>

      <p className="fixed bottom-6 text-xs text-gray-400">
        ITTEK Solution — DAN &amp; DOR SOLAR
      </p>
    </div>
  )
}
