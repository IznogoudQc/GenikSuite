import { IPC, type IpcChannel } from '../shared/types'

/**
 * Wrapper typé autour de window.genik.invoke.
 * Toute la com renderer→main passe par ici.
 */
export async function invoke<T = unknown>(channel: IpcChannel, ...args: unknown[]): Promise<T> {
  return window.genik.invoke<T>(channel, ...args)
}

export { IPC }

/**
 * Événement DOM émis après l'enregistrement des préférences.
 * Les composants déjà montés (ex: PopupTimer) l'écoutent pour relire la config
 * sans avoir besoin d'être remontés.
 */
export const CONFIG_CHANGED_EVENT = 'geniksuite:config-changed'
