import { useEffect, useState } from 'react'

/**
 * Bandeau fixé en bas de l'app (style statusbar VS Code).
 * Affiche le compte à rebours jusqu'au prochain popup, et le projet courant si fourni.
 * Invisible quand le timer est arrêté.
 */
export function StatusBar({
  timerOn,
  nextPopupAt
}: {
  timerOn: boolean
  nextPopupAt: Date | null
}) {
  const [now, setNow] = useState(() => new Date())

  // Tick chaque seconde pour le compte à rebours
  useEffect(() => {
    if (!timerOn) return
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [timerOn])

  if (!timerOn) return null

  let label = '⏳ Timer démarré — planification…'
  if (nextPopupAt) {
    const diffSec = Math.max(0, Math.floor((nextPopupAt.getTime() - now.getTime()) / 1000))
    const m = Math.floor(diffSec / 60)
    const s = diffSec % 60
    const hhmm = nextPopupAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    if (diffSec <= 0) {
      label = '📋 Popup imminent…'
    } else {
      label = `⏳ Prochain popup à ${hhmm} — dans ${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    }
  }

  return (
    <footer
      className="shrink-0 px-4 py-1.5 text-xs flex items-center gap-3 border-t"
      style={{
        backgroundColor: 'var(--color-sidebar)',
        color: 'var(--color-sidebar-fg)',
        borderColor: 'rgba(255,255,255,0.05)'
      }}
    >
      <span className="text-orange-400 tabular-nums">{label}</span>
    </footer>
  )
}
