import { useEffect, useState } from 'react'
import { registerConfirmHandler } from '../lib/dialogs'
import { Button } from './Button'

interface PendingConfirm {
  message: string
  resolve: (ok: boolean) => void
}

/**
 * Hôte global pour les confirmations React. À monter une seule fois au niveau App.
 * Toute fonction qui appelle `safeConfirm(msg)` affiche cette modale.
 */
export function ConfirmHost() {
  const [pending, setPending] = useState<PendingConfirm | null>(null)

  useEffect(() => {
    registerConfirmHandler((message, resolve) => {
      setPending({ message, resolve })
    })
    return () => registerConfirmHandler(null)
  }, [])

  if (!pending) return null

  function close(ok: boolean) {
    pending?.resolve(ok)
    setPending(null)
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100]"
      onClick={() => close(false)}
    >
      <div
        className="bg-white rounded-xl p-6 w-[440px] shadow-2xl border border-zinc-200"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-zinc-800 text-sm mb-6 whitespace-pre-line">{pending.message}</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => close(false)}>
            Annuler
          </Button>
          <Button variant="primary" onClick={() => close(true)} autoFocus>
            Confirmer
          </Button>
        </div>
      </div>
    </div>
  )
}
