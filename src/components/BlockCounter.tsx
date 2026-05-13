import type { ProjectBlockSummary } from '../shared/types'
import { Card } from './Card'

/**
 * Affiche le nombre de blocs (typiquement 30min) par projet pour la période courante.
 */
export function BlockCounter({
  summary,
  intervalMin
}: {
  summary: ProjectBlockSummary[]
  intervalMin: number
}) {
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
          .map((s) => (
            <div
              key={s.projectNumber}
              className="flex items-center gap-3 bg-zinc-50 rounded-lg px-3 py-2.5"
            >
              <div className="w-24 font-mono text-sm text-orange-600 font-semibold">
                {s.projectNumber}
              </div>
              <div className="flex-1 text-xs text-zinc-500 truncate">{s.comment || '—'}</div>
              <div className="flex gap-0.5">
                {Array.from({ length: Math.min(s.blocks, 20) }).map((_, i) => (
                  <div key={i} className="w-2 h-4 bg-orange-500 rounded-sm" />
                ))}
                {s.blocks > 20 && (
                  <span className="text-xs text-orange-600 ml-1 font-medium">
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
          ))}
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
