import { useEffect, useState } from 'react'
import { IPC, type UpdaterEvent } from '../shared/types'

/**
 * Bannière fixée en bas qui affiche l'état de l'auto-updater.
 * Reproduit le comportement de Kinésio-tool : check → download → "Redémarrer".
 */
export function UpdateBanner() {
  const [event, setEvent] = useState<UpdaterEvent | null>(null)

  useEffect(() => {
    const unsubscribe = window.genik.on(IPC.UpdaterEvent, (data) => {
      setEvent(data as UpdaterEvent)
    })
    return () => unsubscribe()
  }, [])

  if (!event) return null

  // Pas d'update dispo ou erreur → on cache la bannière après quelques secondes
  if (event.type === 'not-available' || event.type === 'error') return null

  // Aspect commun
  const baseClass =
    'fixed bottom-4 right-4 z-50 max-w-md rounded-xl shadow-lg border bg-white px-4 py-3 flex items-center gap-3'

  if (event.type === 'checking') {
    return (
      <div className={`${baseClass} border-zinc-200`}>
        <Spinner />
        <span className="text-sm text-zinc-700">Vérification d'une mise à jour…</span>
      </div>
    )
  }

  if (event.type === 'available') {
    return (
      <div className={`${baseClass} border-orange-200`}>
        <Spinner />
        <span className="text-sm text-zinc-700">
          Téléchargement de la v{event.version}…
        </span>
      </div>
    )
  }

  if (event.type === 'progress') {
    return (
      <div className={`${baseClass} border-orange-200 flex-col items-stretch`}>
        <span className="text-sm text-zinc-700 mb-1.5">
          Téléchargement de la mise à jour ({event.percent}%)
        </span>
        <div className="h-1.5 bg-zinc-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-orange-500 transition-all"
            style={{ width: `${event.percent}%` }}
          />
        </div>
      </div>
    )
  }

  if (event.type === 'downloaded') {
    return (
      <div className={`${baseClass} border-orange-300`}>
        <div className="w-2 h-2 rounded-full bg-orange-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-zinc-900">
            Mise à jour v{event.version} prête
          </div>
          <div className="text-xs text-zinc-500">Redémarrez pour l'appliquer.</div>
        </div>
        <button
          onClick={() => window.genik.invoke(IPC.UpdaterInstallNow)}
          className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg"
        >
          Redémarrer
        </button>
      </div>
    )
  }

  return null
}

function Spinner() {
  return (
    <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin shrink-0" />
  )
}
