import type React from 'react'
import type { TimeEntryDTO } from '../shared/types'
import { addDays, fmtDate } from '../lib/time'
import { Card } from './Card'

const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

/**
 * Vue calendaire de la semaine : 7 colonnes (lun-dim).
 * Chaque entrée est affichée comme une bande colorée selon le numéro de projet,
 * triée chronologiquement dans sa colonne.
 */
export function WeekCalendar({
  weekStart,
  entries,
  onClickEntry,
  onClickGap
}: {
  weekStart: Date
  entries: TimeEntryDTO[]
  onClickEntry?: (entry: TimeEntryDTO) => void
  /** Clic sur un trou entre deux entrées : ouvre la création sur [startTime → endTime]. */
  onClickGap?: (date: string, startTime: string, endTime: string) => void
}) {
  // Regroupe les entrées par date (YYYY-MM-DD)
  const byDate = new Map<string, TimeEntryDTO[]>()
  for (const e of entries) {
    if (!byDate.has(e.date)) byDate.set(e.date, [])
    byDate.get(e.date)!.push(e)
  }
  // Tri chrono dans chaque jour
  for (const arr of byDate.values()) {
    arr.sort((a, b) => a.startTime.localeCompare(b.startTime))
  }

  const today = fmtDate(new Date())

  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold text-zinc-900 mb-3">Semaine en cours</h3>
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 7 }).map((_, i) => {
          const day = addDays(weekStart, i)
          const dateStr = fmtDate(day)
          const dayEntries = byDate.get(dateStr) ?? []
          const isToday = dateStr === today
          const totalMin = dayEntries.reduce((acc, e) => acc + e.durationMin, 0)

          return (
            <div
              key={dateStr}
              className={`rounded-lg border ${
                isToday
                  ? 'border-orange-300 bg-orange-50/40'
                  : 'border-zinc-200 bg-zinc-50/40'
              } p-2 flex flex-col min-h-[180px]`}
            >
              <div className="flex items-baseline justify-between mb-2">
                <div>
                  <div
                    className={`text-xs font-semibold ${
                      isToday ? 'text-orange-600' : 'text-zinc-600'
                    }`}
                  >
                    {JOURS[i]}
                  </div>
                  <div className="text-xs text-zinc-400">
                    {day.getDate()}/{day.getMonth() + 1}
                  </div>
                </div>
                {totalMin > 0 && (
                  <span className="text-[10px] text-zinc-500 tabular-nums">
                    {formatDuration(totalMin)}
                  </span>
                )}
              </div>

              <div className="space-y-1 flex-1 overflow-hidden">
                {dayEntries.length === 0 && (
                  <div className="text-[10px] text-zinc-300 italic">—</div>
                )}
                {dayEntries.length > 0 && (() => {
                  // Index de la première entrée à 12h00 ou plus tard.
                  // -1 si toutes avant midi, 0 si toutes après, sinon position d'insertion.
                  const noonIdx = dayEntries.findIndex((e) => e.startTime >= '12:00')
                  const items: React.ReactNode[] = []
                  dayEntries.forEach((e, idx) => {
                    if (noonIdx !== -1 && idx === noonIdx) {
                      items.push(<NoonDivider key={`noon-${dateStr}`} />)
                    }
                    items.push(
                      <div
                        key={e.id}
                        onClick={onClickEntry ? () => onClickEntry(e) : undefined}
                        className={`rounded px-1.5 py-1 text-[10px] leading-tight ${
                          onClickEntry ? 'cursor-pointer hover:opacity-90' : ''
                        }`}
                        style={{
                          backgroundColor: projectColor(e.projectNumber),
                          color: '#fff'
                        }}
                        title={`${e.startTime}–${e.endTime} • ${e.projectNumber}${
                          e.comment ? ` • ${e.comment}` : ''
                        }`}
                      >
                        <div className="font-semibold tabular-nums">
                          {e.startTime}–{e.endTime}
                        </div>
                        <div className="truncate">{e.projectNumber || '—'}</div>
                        {e.comment && (
                          <div className="truncate opacity-80">{e.comment}</div>
                        )}
                      </div>
                    )
                    // Trou entre cette entrée et la suivante (même jour) :
                    // endTime de l'entrée courante < startTime de la suivante.
                    const next = dayEntries[idx + 1]
                    if (next && e.endTime < next.startTime) {
                      const gapStart = e.endTime
                      const gapEnd = next.startTime
                      items.push(
                        <div
                          key={`gap-${e.id}`}
                          onClick={
                            onClickGap
                              ? () => onClickGap(dateStr, gapStart, gapEnd)
                              : undefined
                          }
                          className={`rounded px-1.5 py-1 text-center border border-dashed border-zinc-300 bg-zinc-100 ${
                            onClickGap ? 'cursor-pointer hover:bg-zinc-200' : ''
                          }`}
                          title={`Trou ${gapStart}–${gapEnd}`}
                        >
                          <div className="text-xs text-zinc-500 leading-tight">
                            + Ajouter
                          </div>
                          <div className="text-[10px] text-zinc-400 tabular-nums leading-tight">
                            {gapStart}–{gapEnd}
                          </div>
                        </div>
                      )
                    }
                  })
                  // Toutes avant midi → séparateur en bas
                  if (noonIdx === -1) {
                    items.push(<NoonDivider key={`noon-${dateStr}`} />)
                  }
                  return items
                })()}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

/**
 * Séparateur visuel "12h" entre les entrées du matin et de l'après-midi.
 */
function NoonDivider() {
  return (
    <div className="flex items-center gap-1.5 py-0.5">
      <div className="flex-1 h-px bg-orange-200" />
      <span className="text-[9px] text-zinc-400 tabular-nums">12h</span>
      <div className="flex-1 h-px bg-orange-200" />
    </div>
  )
}

/**
 * Couleur déterministe à partir d'un numéro de projet (hash → palette).
 * Le même projet a toujours la même couleur dans toute la grille.
 */
function projectColor(projectNumber: string): string {
  if (!projectNumber) return '#a1a1aa' // zinc-400 pour les blocs sans projet
  const palette = [
    '#f97316', // orange-500
    '#0ea5e9', // sky-500
    '#10b981', // emerald-500
    '#8b5cf6', // violet-500
    '#ec4899', // pink-500
    '#eab308', // yellow-500
    '#14b8a6', // teal-500
    '#f43f5e'  // rose-500
  ]
  let hash = 0
  for (let i = 0; i < projectNumber.length; i++) {
    hash = (hash * 31 + projectNumber.charCodeAt(i)) | 0
  }
  return palette[Math.abs(hash) % palette.length]
}

function formatDuration(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h${String(m).padStart(2, '0')}`
}
