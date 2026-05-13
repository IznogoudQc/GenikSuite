import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type IpcChannel } from '../src/shared/types'

// Whitelist des canaux IPC autorisés : sécurité (pas d'invoke arbitraire).
const ALLOWED: Set<string> = new Set(Object.values(IPC))

const api = {
  invoke: <T = unknown>(channel: IpcChannel, ...args: unknown[]): Promise<T> => {
    if (!ALLOWED.has(channel)) {
      return Promise.reject(new Error(`Canal IPC non autorisé : ${channel}`))
    }
    return ipcRenderer.invoke(channel, ...args)
  }
}

contextBridge.exposeInMainWorld('genik', api)

export type GenikAPI = typeof api
