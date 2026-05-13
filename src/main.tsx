import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'

/**
 * Workaround pour un bug Electron/Windows : la fenêtre s'affiche mais ne
 * reçoit pas le focus clavier, donc les inputs ne peuvent pas être édités
 * tant que l'utilisateur n'a pas cliqué hors de l'app puis re-cliqué dedans.
 *
 * On force le focus sur l'élément ciblé à chaque mousedown. Le setTimeout(0)
 * laisse le DOM faire son traitement par défaut puis re-applique le focus.
 */
function installFocusFix() {
  document.addEventListener('mousedown', (e) => {
    const target = e.target as HTMLElement | null
    if (!target) return
    const tag = target.tagName
    if (
      tag === 'INPUT' ||
      tag === 'TEXTAREA' ||
      tag === 'SELECT' ||
      target.isContentEditable
    ) {
      // Re-focus après le cycle d'event natif pour battre le vol de focus système.
      setTimeout(() => target.focus(), 0)
    }
  })
}

installFocusFix()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
