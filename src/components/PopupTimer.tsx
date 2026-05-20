import { useEffect, useRef, useState } from 'react'
import type { ProjectDTO, NewTimeEntryDTO } from '../shared/types'
import { ceilToInterval, floorToInterval, fmtDate, fmtTime } from '../lib/time'
import { invoke, IPC, CONFIG_CHANGED_EVENT } from '../lib/ipc'
import { playPopupBeep } from '../lib/sound'
import { Button } from './Button'

const HHMM_RE = /^([01]?\d|2[0-3]):[0-5]\d$/

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/**
 * Fin proposée par défaut : l'heure ronde actuelle (le bloc qui vient juste
 * de se terminer). Doit être au moins `start + intervalMin` si pendingStart
 * date d'un report et qu'on accumule plusieurs intervalles.
 */
function defaultEnd(start: Date, intervalMin: number): Date {
  const minEnd = new Date(start.getTime() + intervalMin * 60_000)
  const nowFloor = floorToInterval(new Date(), intervalMin)
  return nowFloor.getTime() > minEnd.getTime() ? nowFloor : minEnd
}

/**
 * Début proposé par défaut : un intervalle AVANT l'heure ronde actuelle.
 * À 10h05, on demande pour la plage 10h00 → 10h05 (ce qui vient d'être travaillé).
 */
function defaultStart(intervalMin: number): Date {
  const nowFloor = floorToInterval(new Date(), intervalMin)
  return new Date(nowFloor.getTime() - intervalMin * 60_000)
}

/**
 * Composant invisible qui déclenche une modale toutes les `intervalMin` minutes,
 * alignée sur l'heure ronde (ex: 08:00, 08:30, 09:00).
 *
 * Les heures de début/fin proposées sont éditables. Si la modale est ignorée
 * (bouton « Ignorer » ou croix), l'heure de début est reportée via `onSkip`
 * et réutilisée au prochain affichage (`pendingStart`).
 */
export function PopupTimer({
  intervalMin,
  projects,
  pendingStart,
  onSubmit,
  onSkip,
  onSchedule
}: {
  intervalMin: number
  projects: ProjectDTO[]
  /** Heure de début reportée d'un popup précédemment ignoré (null = pas de report). */
  pendingStart: Date | null
  onSubmit: (entry: NewTimeEntryDTO) => void
  onSkip: (start: Date) => void
  /** Appelé chaque fois qu'un prochain popup est planifié (sert au compte à rebours du StatusBar). */
  onSchedule?: (nextPopupAt: Date) => void
}) {
  const [open, setOpen] = useState(false)
  const [blockStart, setBlockStart] = useState<Date>(
    () => pendingStart ?? defaultStart(intervalMin)
  )
  const [startStr, setStartStr] = useState('')
  const [endStr, setEndStr] = useState('')
  const [projectNumber, setProjectNumber] = useState('')
  const [comment, setComment] = useState('')
  const timerRef = useRef<number | null>(null)

  // Permet à la closure du setTimeout de toujours lire la dernière valeur du report.
  const pendingStartRef = useRef(pendingStart)
  useEffect(() => {
    pendingStartRef.current = pendingStart
  }, [pendingStart])

  // Préférence "son du popup" (config.soundEnabled), gardée dans un ref pour que la
  // closure du setTimeout en ait toujours la dernière valeur. Relue au montage et à
  // chaque enregistrement des paramètres (événement CONFIG_CHANGED_EVENT) — pas de remontage requis.
  const soundEnabledRef = useRef(true)
  useEffect(() => {
    function refreshSoundPref() {
      void invoke<string>(IPC.ConfigGet, 'soundEnabled').then((v) => {
        soundEnabledRef.current = v !== 'false'
      })
    }
    refreshSoundPref()
    window.addEventListener(CONFIG_CHANGED_EVENT, refreshSoundPref)
    return () => window.removeEventListener(CONFIG_CHANGED_EVENT, refreshSoundPref)
  }, [])

  // Garde la dernière référence du callback onSchedule sans re-déclencher l'effet
  const onScheduleRef = useRef(onSchedule)
  useEffect(() => {
    onScheduleRef.current = onSchedule
  }, [onSchedule])

  useEffect(() => {
    function schedule() {
      const next = ceilToInterval(new Date(), intervalMin)
      onScheduleRef.current?.(next)
      const delay = Math.max(0, next.getTime() - Date.now())
      timerRef.current = window.setTimeout(() => {
        // Le popup arrive à la fin du bloc : on demande pour le bloc qui vient
        // juste de se terminer (ex: à 10h05, on qualifie la plage 10h00→10h05).
        const start = pendingStartRef.current ?? defaultStart(intervalMin)
        const end = defaultEnd(start, intervalMin)
        setBlockStart(start)
        setStartStr(fmtTime(start))
        setEndStr(fmtTime(end))
        setOpen(true)
        if (soundEnabledRef.current) playPopupBeep()
        schedule()
      }, delay)
    }
    schedule()
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [intervalMin])

  function handleSave() {
    const start = HHMM_RE.test(startStr) ? startStr : fmtTime(blockStart)
    const end = HHMM_RE.test(endStr) ? endStr : fmtTime(defaultEnd(blockStart, intervalMin))
    const durationMin = Math.max(0, hhmmToMinutes(end) - hhmmToMinutes(start))
    onSubmit({
      projectNumber: projectNumber.trim(),
      date: fmtDate(blockStart),
      startTime: start,
      endTime: end,
      durationMin,
      comment: comment.trim()
    })
    setComment('')
    setOpen(false)
  }

  function handleSkip() {
    onSkip(blockStart)
    setComment('')
    setOpen(false)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="relative bg-white rounded-2xl p-6 w-[460px] shadow-2xl border border-zinc-200">
        <button
          onClick={handleSkip}
          className="absolute top-3 right-3 text-zinc-400 hover:text-zinc-600 text-xl leading-none"
          aria-label="Fermer"
          title="Ignorer ce bloc"
        >
          ×
        </button>

        <h3 className="text-lg font-semibold text-zinc-900 mb-1">Sur quoi tu travailles ?</h3>
        <p className="text-sm text-zinc-500 mb-5">Ajuste la plage horaire si besoin.</p>

        <div className="flex gap-3 mb-4">
          <div className="flex-1">
            <label className="block text-sm text-zinc-600 mb-1.5">Heure début</label>
            <input
              type="time"
              value={startStr}
              onChange={(e) => setStartStr(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 bg-white text-zinc-800 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm text-zinc-600 mb-1.5">Heure fin</label>
            <input
              type="time"
              value={endStr}
              onChange={(e) => setEndStr(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 bg-white text-zinc-800 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
            />
          </div>
        </div>

        <label className="block text-sm text-zinc-600 mb-1.5">Projet</label>
        <input
          type="text"
          list="popup-projects-list"
          value={projectNumber}
          onChange={(e) => setProjectNumber(e.target.value)}
          placeholder="Numéro de projet (ex: 17528) ou choisir..."
          className="w-full px-3 py-2 rounded-lg border border-zinc-300 bg-white text-zinc-800 mb-4 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
        />
        <datalist id="popup-projects-list">
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
          autoFocus
        />

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={handleSkip}>
            Ignorer
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={!projectNumber}>
            Enregistrer
          </Button>
        </div>
      </div>
    </div>
  )
}
