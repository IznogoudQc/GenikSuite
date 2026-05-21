import { useEffect, useState } from 'react'
import type { ProjectDTO, TimeEntryDTO } from '../shared/types'
import { Button } from './Button'

const HHMM_RE = /^([01]?\d|2[0-3]):[0-5]\d$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** Valeurs partielles pour pré-remplir le mode création (depuis un trou du calendrier). */
export interface NewEntryDraft {
  date: string
  startTime: string
  endTime: string
}

interface EntrySubmit {
  date: string
  startTime: string
  endTime: string
  durationMin: number
  projectNumber: string
  comment: string
}

/**
 * Modale d'édition / création d'une entrée de temps. En mode 'edit' on modifie
 * une entrée existante (et on peut la supprimer) ; en mode 'create' on en crée
 * une nouvelle pré-remplie à partir d'un trou du calendrier.
 */
export function EditEntryDialog({
  entry,
  mode = 'edit',
  initialEntry,
  projects,
  onClose,
  onSave,
  onCreate,
  onDelete
}: {
  entry: TimeEntryDTO | null
  mode?: 'create' | 'edit'
  initialEntry?: NewEntryDraft | null
  projects: ProjectDTO[]
  onClose: () => void
  onSave: (updated: EntrySubmit & { id: number }) => void
  onCreate?: (created: EntrySubmit) => void
  onDelete: (id: number) => void
}) {
  const [date, setDate] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [projectNumber, setProjectNumber] = useState('')
  const [comment, setComment] = useState('')

  const isCreate = mode === 'create'
  const isOpen = isCreate ? !!initialEntry : !!entry

  // Pré-remplit quand on ouvre le dialog (entrée existante ou brouillon de création).
  useEffect(() => {
    if (isCreate) {
      if (!initialEntry) return
      setDate(initialEntry.date)
      setStart(initialEntry.startTime)
      setEnd(initialEntry.endTime)
      setProjectNumber('')
      setComment('')
    } else {
      if (!entry) return
      setDate(entry.date)
      setStart(entry.startTime)
      setEnd(entry.endTime)
      setProjectNumber(entry.projectNumber)
      setComment(entry.comment)
    }
  }, [entry, initialEntry, isCreate])

  if (!isOpen) return null

  const startValid = HHMM_RE.test(start)
  const endValid = HHMM_RE.test(end)
  const dateValid = DATE_RE.test(date)
  const duration =
    startValid && endValid ? Math.max(0, hhmmToMinutes(end) - hhmmToMinutes(start)) : 0
  const canSave = startValid && endValid && dateValid && duration > 0

  function handleSubmit() {
    if (!canSave) return
    const payload: EntrySubmit = {
      date,
      startTime: start,
      endTime: end,
      durationMin: duration,
      projectNumber: projectNumber.trim(),
      comment: comment.trim()
    }
    if (isCreate) {
      onCreate?.(payload)
    } else if (entry) {
      onSave({ id: entry.id, ...payload })
    }
  }

  // Suggestion rapide « Pause » : pré-remplit projet + commentaire,
  // l'utilisateur peut ensuite ajuster ou enregistrer directement.
  function markAsPause() {
    setProjectNumber('PAUSE')
    setComment('Pause')
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100]"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl p-6 w-[480px] shadow-2xl border border-zinc-200"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-zinc-900 mb-1">
          {isCreate ? 'Nouvelle entrée' : "Modifier l'entrée"}
        </h3>
        <p className="text-sm text-zinc-500 mb-4">
          {isCreate
            ? 'Renseigne le projet puis enregistre cette nouvelle entrée.'
            : 'Ajuste les champs puis enregistre. Tu peux aussi supprimer cette entrée.'}
        </p>

        <label className="block text-sm text-zinc-600 mb-1.5">Date</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-zinc-300 bg-white text-zinc-800 mb-3 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
        />

        <div className="flex gap-3 mb-3">
          <div className="flex-1">
            <label className="block text-sm text-zinc-600 mb-1.5">Heure début</label>
            <input
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 bg-white text-zinc-800 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm text-zinc-600 mb-1.5">Heure fin</label>
            <input
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 bg-white text-zinc-800 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
            />
          </div>
        </div>

        <label className="block text-sm text-zinc-600 mb-1.5">Projet</label>
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            list="edit-entry-projects-list"
            value={projectNumber}
            onChange={(e) => setProjectNumber(e.target.value)}
            placeholder="Numéro de projet (ex: 17528) ou laisser vide"
            className="flex-1 px-3 py-2 rounded-lg border border-zinc-300 bg-white text-zinc-800 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
          />
          <Button variant="secondary" onClick={markAsPause}>
            Marquer comme Pause
          </Button>
        </div>
        <datalist id="edit-entry-projects-list">
          {projects.map((p) => (
            <option
              key={p.id}
              value={p.number}
              label={p.comment ? `${p.number} — ${p.comment}` : p.number}
            />
          ))}
        </datalist>

        <label className="block text-sm text-zinc-600 mb-1.5">Commentaire</label>
        <input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="ex: revue plans mécaniques"
          className="w-full px-3 py-2 rounded-lg border border-zinc-300 bg-white text-zinc-800 mb-5 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
        />

        <div className="flex items-center justify-between">
          {!isCreate && entry ? (
            <Button variant="danger" icon="🗑" onClick={() => onDelete(entry.id)}>
              Supprimer
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Annuler
            </Button>
            <Button variant="primary" onClick={handleSubmit} disabled={!canSave}>
              Enregistrer
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
