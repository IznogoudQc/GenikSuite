/// <reference types="vite/client" />

import type { GenikAPI } from '../electron/preload'

declare global {
  interface Window {
    genik: GenikAPI
  }
}
