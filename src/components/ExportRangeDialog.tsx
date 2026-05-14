import { useEffect, useState } from 'react'
import { Button } from './Button'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Modale de choix de plage de dates pour un export Excel ou PDF.
 * Pré-remplie avec la plage courante (semaine affichée par défaut).
 */
export function ExportRangeDialog({
  open,
  defaultFrom,
  defaultTo,
  format,
  onClose,
  onConfirm
}: {
  open: boolean
  defaultFrom: string
  defaultTo: string
  format: 'excel' | 'pdf'
  onClose: () => void
  onConfirm: (from: string, to: string) => void
}) {
  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(defaultTo)

  // Re-synchronise les champs chaque fois que la modale s'ouvre (plage courante peut avoir changé)
  useEffect(() => {
    if (!open) return
    setFrom(defaultFrom)
    setTo(defaultTo)
  }, [open, defaultFrom, defaultTo])

  if (!open) return null

  const fromValid = DATE_RE.test(from)
  const toValid = DATE_RE.test(to)
  const rangeValid = fromValid && toValid && from <= to
  const title = format === 'excel' ? 'Exporter en Excel' : 'Exporter en PDF'

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100]"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl p-6 w-[420px] shadow-2xl border border-zinc-200"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-zinc-900 mb-1">{title}</h3>
        <p className="text-sm text-zinc-500 mb-4">
          Choisis la plage de dates à inclure dans l&apos;export.
        </p>

        <div className="flex gap-3 mb-5">
          <div className="flex-1">
            <label className="block text-sm text-zinc-600 mb-1.5">Du</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 bg-white text-zinc-800 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm text-zinc-600 mb-1.5">Au</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 bg-white text-zinc-800 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
            />
          </div>
        </div>

        {!rangeValid && fromValid && toValid && (
          <p className="text-xs text-red-500 mb-3">
            La date de début doit être antérieure ou égale à la date de fin.
          </p>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="primary"
            onClick={() => onConfirm(from, to)}
            disabled={!rangeValid}
          >
            Exporter
          </Button>
        </div>
      </div>
    </div>
  )
}
