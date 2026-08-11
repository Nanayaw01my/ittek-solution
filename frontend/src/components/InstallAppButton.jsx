import React, { useEffect, useState } from 'react'
import { FiDownload, FiCheck } from 'react-icons/fi'
import toast from 'react-hot-toast'

/**
 * "Install app" button for the desktop/mobile PWA.
 *
 * Browsers only allow the install prompt to be shown from a user gesture, and
 * only after they have fired `beforeinstallprompt` — so we stash the event and
 * replay it on click. The button hides itself when the app is already running
 * installed, or when the browser never offers the prompt (Safari, Firefox),
 * because a button that can do nothing is worse than no button.
 */
export default function InstallAppButton({ compact = false }) {
  const [promptEvent, setPromptEvent] = useState(null)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    // Already running as an installed app?
    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      window.matchMedia?.('(display-mode: window-controls-overlay)').matches ||
      window.navigator.standalone === true
    if (standalone) setInstalled(true)

    const onPrompt = (e) => {
      e.preventDefault() // stop Chrome's own mini-infobar
      setPromptEvent(e)
    }
    const onInstalled = () => {
      setInstalled(true)
      setPromptEvent(null)
      toast.success('ITTEK Solution installed')
    }

    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const handleInstall = async () => {
    if (!promptEvent) return
    promptEvent.prompt()
    const { outcome } = await promptEvent.userChoice
    // The event is single-use — a dismissed prompt can't be replayed.
    setPromptEvent(null)
    if (outcome === 'dismissed') {
      toast('Install cancelled — you can install later from the browser menu')
    }
  }

  if (installed) {
    return compact ? null : (
      <span className="hidden lg:flex items-center gap-1 text-xs text-green-600 font-semibold">
        <FiCheck size={13} /> Installed
      </span>
    )
  }

  if (!promptEvent) return null

  return (
    <button
      onClick={handleInstall}
      title="Install ITTEK Solution as a desktop app"
      className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-xs font-bold transition-colors"
    >
      <FiDownload size={13} />
      <span className={compact ? 'hidden sm:inline' : ''}>Install App</span>
    </button>
  )
}
