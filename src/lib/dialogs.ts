import { invoke, IPC } from './ipc'

/**
 * Wrapper autour de `window.confirm()` qui restaure le focus de la fenêtre
 * Electron après que la dialog native est fermée.
 *
 * Bug Electron/Windows : `window.confirm()` ouvre une dialog modale native,
 * et quand elle se ferme, le focus clavier reste capté par l'OS au lieu de
 * revenir au webContents. Résultat : l'utilisateur ne peut plus taper dans
 * les inputs tant qu'il n'a pas cliqué hors puis dans l'app.
 *
 * Ce wrapper appelle un handler IPC qui force `mainWindow.focus()` côté main.
 */
export function safeConfirm(message: string): boolean {
  const ok = window.confirm(message)
  // Force le re-focus de la fenêtre principale (asynchrone, non bloquant)
  void invoke(IPC.AppRefocus).catch(() => {})
  return ok
}
