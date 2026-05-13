import { useCallback, useEffect, useMemo, useState } from 'react'
import { invoke, IPC } from '../lib/ipc'
import type {
  ProjectDTO,
  TimeEntryDTO,
  ProjectBlockSummary,
  NewTimeEntryDTO
} from '../shared/types'
import { addDays, fmtDate, mondayOf } from '../lib/time'
import { PopupTimer } from '../components/PopupTimer'
import { BlockCounter } from '../components/BlockCounter'
import { PageHeader } from '../components/PageHeader'
import { Card } from '../components/Card'
import { Button } from '../components/Button'

export function TimesheetPage() {
  const [projects, setProjects] = useState<ProjectDTO[]>([])
  const [entries, setEntries] = useState<TimeEntryDTO[]>([])
  const [summary, setSummary] = useState<ProjectBlockSummary[]>([])
  const [weekStart, setWeekStart] = useState<Date>(() => mondayOf(new Date()))
  const [intervalMin, setIntervalMin] = useState(30)
  const [timerOn, setTimerOn] = useState(false)
  // Heure de début reportée quand un popup est ignoré : le prochain popup la réutilise.
  const [pendingStart, setPendingStart] = useState<Date | null>(null)

  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart])

  const refreshWeek = useCallback(async () => {
    const from = fmtDate(weekStart)
    const to = fmtDate(weekEnd)
    const [es, sum] = await Promise.all([
      invoke<TimeEntryDTO[]>(IPC.TimeEntriesList, { from, to }),
      invoke<ProjectBlockSummary[]>(IPC.TimeSummaryByProject, { from, to })
    ])
    setEntries(es)
    setSummary(sum)
  }, [weekStart, weekEnd])

  useEffect(() => {
    async function loadConfig() {
      const v = await invoke<string>(IPC.ConfigGet, 'intervalMinutes')
      setIntervalMin(parseInt(v, 10) || 30)
    }
    async function loadProjects() {
      setProjects(await invoke<ProjectDTO[]>(IPC.ProjectsList))
    }
    void loadConfig()
    void loadProjects()
  }, [])

  useEffect(() => {
    void refreshWeek()
  }, [refreshWeek])

  async function addEntry(entry: NewTimeEntryDTO) {
    await invoke(IPC.TimeEntryAdd, entry)
    setPendingStart(null) // bloc enregistré : plus rien à reporter
    void refreshWeek()
  }

  async function deleteEntry(id: number) {
    if (!confirm('Supprimer cette entrée ?')) return
    await invoke(IPC.TimeEntryDelete, id)
    void refreshWeek()
  }

  async function clearReport() {
    if (!confirm('Effacer TOUTES les entrées de la feuille de temps ?\nCette action est irréversible.')) return
    await invoke(IPC.TimeEntriesClear)
    void refreshWeek()
  }

  return (
    <div>
      <PageHeader
        title="Feuille de temps"
        subtitle={`Blocs de ${intervalMin} minutes`}
        actions={
          <>
            <Button variant="danger" icon="🗑" onClick={clearReport}>
              Effacer le compte-rendu
            </Button>
            <Button
              variant={timerOn ? 'danger' : 'primary'}
              icon={timerOn ? '⏹' : '▶'}
              onClick={() => setTimerOn((v) => !v)}
            >
              {timerOn ? 'Arrêter' : 'Démarrer'}
            </Button>
          </>
        }
      />

      <div className="p-8 space-y-6">
        {/* Navigation semaine */}
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={() => setWeekStart(addDays(weekStart, -7))}>
            ⟵ Préc.
          </Button>
          <div className="text-sm text-zinc-700 font-medium">
            Semaine du {fmtDate(weekStart)} au {fmtDate(weekEnd)}
          </div>
          <Button variant="secondary" onClick={() => setWeekStart(addDays(weekStart, 7))}>
            Suiv. ⟶
          </Button>
          <Button variant="ghost" onClick={() => setWeekStart(mondayOf(new Date()))}>
            Cette semaine
          </Button>
        </div>

        {/* Compteur de blocs par projet */}
        <BlockCounter summary={summary} intervalMin={intervalMin} />

        {/* Tableau d'entrées */}
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-zinc-600 text-left border-b border-zinc-200">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Début</th>
                <th className="px-4 py-3 font-medium">Fin</th>
                <th className="px-4 py-3 font-medium">Projet</th>
                <th className="px-4 py-3 font-medium">Commentaire</th>
                <th className="px-4 py-3 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-zinc-400">
                    Aucune entrée cette semaine.
                  </td>
                </tr>
              )}
              {entries.map((e) => (
                <tr key={e.id} className="border-t border-zinc-100 hover:bg-zinc-50/60">
                  <td className="px-4 py-2.5 text-zinc-700">{e.date}</td>
                  <td className="px-4 py-2.5 text-zinc-700">{e.startTime}</td>
                  <td className="px-4 py-2.5 text-zinc-700">{e.endTime}</td>
                  <td className="px-4 py-2.5 font-medium text-orange-600">{e.projectNumber || '—'}</td>
                  <td className="px-4 py-2.5 text-zinc-500">{e.comment}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => deleteEntry(e.id)}
                      className="text-zinc-400 hover:text-red-500"
                      title="Supprimer"
                    >
                      🗑
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      {timerOn && (
        <PopupTimer
          intervalMin={intervalMin}
          projects={projects}
          pendingStart={pendingStart}
          onSubmit={addEntry}
          onSkip={(start) => setPendingStart(start)}
        />
      )}
    </div>
  )
}
