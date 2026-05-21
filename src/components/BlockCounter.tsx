import { useState } from 'react'
import type { ProjectBlockSummary, ProjectDTO } from '../shared/types'
import { invoke, IPC } from '../lib/ipc'
import { colorForProject, PROJECT_PALETTE } from '../lib/projectColors'
import { PROJECTS_CHANGED_EVENT } from '../App'
import { Card } from './Card'

/**
 * Affiche le nombre de blocs (typiquement 30min) par projet pour la période courante.
 * Chaque bloc est un carré coloré ; la couleur du projet est éditable en cliquant
 * sur son numéro.
 */
export function BlockCounter({
  summary,
  intervalMin,
  projects
}: {
  summary: ProjectBlockSummary[]
  intervalMin: number
  projects: ProjectDTO[]
}) {
  // Numéro de projet dont le popover de couleur est ouvert (null = aucun).
  const [openColorFor, setOpenColorFor] = useState<string | null>(null)

  async function applyColor(projectNumber: string, color: string, close = true) {
    await invoke(IPC.ProjectSetColor, { number: projectNumber, color })
    window.dispatchEvent(new Event(PROJECTS_CHANGED_EVENT))
    if (close) setOpenColorFor(null)
  }

  if (summary.length === 0) {
    return (
      <Card className="p-6 text-sm text-zinc-400">
        Aucun bloc enregistré cette semaine.
      </Card>
    )
  }

  const totalBlocks = summary.reduce((acc, s) => acc + s.blocks, 0)
  const totalMin = summary.reduce((acc, s) => acc + s.totalMinutes, 0)

  return (
    <Card className="p-6">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-sm font-semibold text-zinc-900">
          Blocs de {intervalMin} min par projet
        </h3>
        <span className="text-xs text-zinc-500">
          Total : {totalBlocks} blocs ({hoursFromMin(totalMin)})
        </span>
      </div>

      <div className="space-y-2">
        {summary
          .slice()
          .sort((a, b) => b.blocks - a.blocks)
          .map((s) => {
            const project = projects.find((p) => p.number === s.projectNumber)
            const color = colorForProject(project ?? { number: s.projectNumber })
            return (
              <div
                key={s.projectNumber}
                className="flex items-center gap-3 bg-zinc-50 rounded-lg px-3 py-2.5"
              >
                <div className="relative w-24">
                  <button
                    onClick={() =>
                      setOpenColorFor((cur) =>
                        cur === s.projectNumber ? null : s.projectNumber
                      )
                    }
                    className="flex items-center gap-1.5 font-mono text-sm text-orange-600 font-semibold hover:underline"
                    title="Changer la couleur du projet"
                  >
                    <span
                      className="w-3 h-3 rounded-sm border border-black/10 shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    {s.projectNumber}
                  </button>

                  {openColorFor === s.projectNumber && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setOpenColorFor(null)}
                      />
                      <div className="absolute z-50 top-full left-0 mt-1 bg-white border border-zinc-200 rounded-lg shadow-xl p-3 w-44">
                        <div className="grid grid-cols-6 gap-1.5 mb-2">
                          {PROJECT_PALETTE.map((c) => (
                            <button
                              key={c}
                              onClick={() => void applyColor(s.projectNumber, c)}
                              className={`w-5 h-5 rounded border ${
                                c === color
                                  ? 'border-zinc-900'
                                  : 'border-black/10 hover:border-zinc-400'
                              }`}
                              style={{ backgroundColor: c }}
                              title={c}
                            />
                          ))}
                        </div>
                        <label className="flex items-center justify-between text-xs text-zinc-600">
                          Personnalisée
                          <input
                            type="color"
                            value={color}
                            onChange={(e) =>
                              void applyColor(s.projectNumber, e.target.value, false)
                            }
                            className="w-8 h-6 p-0 border border-zinc-300 rounded cursor-pointer"
                          />
                        </label>
                      </div>
                    </>
                  )}
                </div>

                <div className="flex-1 text-xs text-zinc-500 truncate">{s.comment || '—'}</div>
                <div className="flex gap-0.5">
                  {Array.from({ length: Math.min(s.blocks, 20) }).map((_, i) => (
                    <div
                      key={i}
                      className="w-2 h-4 rounded-sm"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                  {s.blocks > 20 && (
                    <span className="text-xs text-zinc-600 ml-1 font-medium">
                      +{s.blocks - 20}
                    </span>
                  )}
                </div>
                <div className="w-24 text-right tabular-nums">
                  <span className="font-bold text-zinc-900">{s.blocks}</span>
                  <span className="text-zinc-500 text-xs"> blocs</span>
                </div>
                <div className="w-20 text-right text-xs text-zinc-500 tabular-nums">
                  {hoursFromMin(s.totalMinutes)}
                </div>
              </div>
            )
          })}
      </div>
    </Card>
  )
}

function hoursFromMin(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} h`
  return `${h} h ${m}`
}
