import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type IpcChannel } from '../src/shared/types'

// Whitelist des canaux IPC autorisés : sécurité (pas d'invoke arbitraire).
const ALLOWED: Set<string> = new Set(Object.values(IPC))

// Whitelist des canaux que le main process peut PUSH vers le renderer.
const ALLOWED_PUSH = new Set<string>([IPC.UpdaterEvent])

const api = {
  invoke: <T = unknown>(channel: IpcChannel, ...args: unknown[]): Promise<T> => {
    if (!ALLOWED.has(channel)) {
      return Promise.reject(new Error(`Canal IPC non autorisé : ${channel}`))
    }
    return ipcRenderer.invoke(channel, ...args)
  },

  /**
   * S'abonne à un canal push depuis le main process.
   * Retourne une fonction d'unsubscribe à appeler dans le cleanup du useEffect.
   */
  on: (channel: IpcChannel, listener: (data: unknown) => void): (() => void) => {
    if (!ALLOWED_PUSH.has(channel)) {
      console.error(`Canal push non autorisé : ${channel}`)
      return () => {}
    }
    const wrapped = (_e: unknown, data: unknown) => listener(data)
    ipcRenderer.on(channel, wrapped)
    return () => ipcRenderer.removeListener(channel, wrapped)
  }
}

contextBridge.exposeInMainWorld('genik', api)

export type GenikAPI = typeof api
