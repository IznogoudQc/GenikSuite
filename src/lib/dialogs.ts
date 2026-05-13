/**
 * Système de confirmation 100% React (pas de dialog native).
 *
 * Pourquoi : `window.confirm()` natif ouvre une boîte de dialogue Windows qui
 * vole le focus clavier de la fenêtre Electron. Après fermeture, le focus
 * n'est pas restauré au webContents et l'utilisateur ne peut plus taper.
 *
 * Solution : on remplace par une modale React rendue dans le DOM. Pas de
 * dialogue OS → pas de vol de focus possible.
 */

type Resolver = (ok: boolean) => void
type Handler = (message: string, resolve: Resolver) => void

let currentHandler: Handler | null = null

/**
 * Appelé une seule fois par <ConfirmHost> au montage pour s'enregistrer
 * comme gestionnaire des appels safeConfirm().
 */
export function registerConfirmHandler(handler: Handler | null): void {
  currentHandler = handler
}

/**
 * Affiche une modale React de confirmation et retourne une Promise<boolean>.
 *
 * Usage : `if (!(await safeConfirm('Supprimer ?'))) return`
 *
 * Fallback sur `window.confirm()` natif si le ConfirmHost n'est pas monté.
 */
export function safeConfirm(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!currentHandler) {
      // Fallback (ne devrait jamais arriver si ConfirmHost est dans App.tsx)
      resolve(window.confirm(message))
      return
    }
    currentHandler(message, resolve)
  })
}
