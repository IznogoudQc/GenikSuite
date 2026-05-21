import { useCallback, useEffect, useMemo, useState } from 'react'
import { invoke, IPC } from '../lib/ipc'
import type {
  ProjectDTO,
  TimeEntryDTO,
  ProjectBlockSummary
} from '../shared/types'
import { addDays, fmtDate, mondayOf } from '../lib/time'
import { BlockCounter } from '../components/BlockCounter'
import { WeekCalendar } from '../components/WeekCalendar'
import { PageHeader } from '../components/PageHeader'
import { Card } from '../components/Card'
import { Button } from '../components/Button'
import { EditEntryDialog, type NewEntryDraft } from '../components/EditEntryDialog'
import { ExportRangeDialog } from '../components/ExportRangeDialog'
import { safeConfirm } from '../lib/dialogs'
import { TIME_ENTRIES_CHANGED_EVENT } from '../App'

/**
 * Page Feuille de temps. Le state du timer (timerOn, pendingStart, intervalMin,
 * PopupTimer) vit dans App.tsx pour que le timer reste actif quand on navigue
 * sur d'autres onglets.
 */
export function TimesheetPage({
  timerOn,
  onToggleTimer,
  intervalMin,
  projects
}: {
  timerOn: boolean
  onToggleTimer: () => void
  intervalMin: number
  projects: ProjectDTO[]
}) {
  const [entries, setEntries] = useState<TimeEntryDTO[]>([])
  const [summary, setSummary] = useState<ProjectBlockSummary[]>([])
  const [weekStart, setWeekStart] = useState<Date>(() => mondayOf(new Date()))
  const [editingEntry, setEditingEntry] = useState<TimeEntryDTO | null>(null)
  const [creatingEntry, setCreatingEntry] = useState<NewEntryDraft | null>(null)
  const [exportFormat, setExportFormat] = useState<'excel' | 'pdf' | null>(null)

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

  // Recharge quand la semaine change OU quand une entrée est ajoutée (event global).
  useEffect(() => {
    void refreshWeek()
    const handler = () => void refreshWeek()
    window.addEventListener(TIME_ENTRIES_CHANGED_EVENT, handler)
    return () => window.removeEventListener(TIME_ENTRIES_CHANGED_EVENT, handler)
  }, [refreshWeek])

  async function deleteEntry(id: number) {
    if (!(await safeConfirm('Supprimer cette entrée ?'))) return
    await invoke(IPC.TimeEntryDelete, id)
    setEditingEntry(null)
    void refreshWeek()
  }

  async function updateEntry(updated: {
    id: number
    date: string
    startTime: string
    endTime: string
    durationMin: number
    projectNumber: string
    comment: string
  }) {
    const num = updated.projectNumber.trim()
    if (num && !projects.some((p) => p.number === num)) {
      await invoke(IPC.ProjectUpsert, { number: num })
    }
    await invoke(IPC.TimeEntryUpdate, updated)
    setEditingEntry(null)
    void refreshWeek()
  }

  // Ouvre le dialog en mode édition (clic sur une entrée existante).
  function openEdit(entry: TimeEntryDTO) {
    setCreatingEntry(null)
    setEditingEntry(entry)
  }

  // Clic sur un trou du calendrier → ouvre le dialog en mode création,
  // pré-rempli sur la plage [startTime → endTime] du trou.
  function handleClickGap(date: string, startTime: string, endTime: string) {
    setEditingEntry(null)
    setCreatingEntry({ date, startTime, endTime })
  }

  async function createEntry(created: {
    date: string
    startTime: string
    endTime: string
    durationMin: number
    projectNumber: string
    comment: string
  }) {
    const num = created.projectNumber.trim()
    if (num && num !== 'PAUSE' && !projects.some((p) => p.number === num)) {
      await invoke(IPC.ProjectUpsert, { number: num })
    }
    await invoke(IPC.TimeEntryAdd, created)
    setCreatingEntry(null)
    void refreshWeek()
  }

  async function clearReport() {
    if (!(await safeConfirm('Effacer TOUTES les entrées de la feuille de temps ?\nCette action est irréversible.'))) return
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
            <Button variant="secondary" icon="📊" onClick={() => setExportFormat('excel')}>
              Excel
            </Button>
            <Button variant="secondary" icon="📄" onClick={() => setExportFormat('pdf')}>
              PDF
            </Button>
            <Button variant="danger" icon="🗑" onClick={clearReport}>
              Effacer le compte-rendu
            </Button>
            <Button
              variant={timerOn ? 'danger' : 'primary'}
              icon={timerOn ? '⏹' : '▶'}
              onClick={onToggleTimer}
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

        {/* Vue calendaire de la semaine */}
        <WeekCalendar
          weekStart={weekStart}
          entries={entries}
          projects={projects}
          onClickEntry={openEdit}
          onClickGap={handleClickGap}
        />

        {/* Compteur de blocs par projet */}
        <BlockCounter summary={summary} intervalMin={intervalMin} projects={projects} />

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
                <tr
                  key={e.id}
                  onClick={() => openEdit(e)}
                  className="border-t border-zinc-100 cursor-pointer hover:bg-zinc-50"
                >
                  <td className="px-4 py-2.5 text-zinc-700">{e.date}</td>
                  <td className="px-4 py-2.5 text-zinc-700">{e.startTime}</td>
                  <td className="px-4 py-2.5 text-zinc-700">{e.endTime}</td>
                  <td className="px-4 py-2.5 font-medium text-orange-600">{e.projectNumber || '—'}</td>
                  <td className="px-4 py-2.5 text-zinc-500">{e.comment}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={(ev) => {
                        ev.stopPropagation()
                        void deleteEntry(e.id)
                      }}
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

      <EditEntryDialog
        entry={editingEntry}
        mode={creatingEntry ? 'create' : 'edit'}
        initialEntry={creatingEntry}
        projects={projects}
        onClose={() => {
          setEditingEntry(null)
          setCreatingEntry(null)
        }}
        onSave={updateEntry}
        onCreate={createEntry}
        onDelete={(id) => {
          void invoke(IPC.TimeEntryDelete, id)
          setEditingEntry(null)
          void refreshWeek()
        }}
      />

      <ExportRangeDialog
        open={exportFormat !== null}
        defaultFrom={fmtDate(weekStart)}
        defaultTo={fmtDate(weekEnd)}
        format={exportFormat ?? 'excel'}
        onClose={() => setExportFormat(null)}
        onConfirm={async (from, to) => {
          const channel =
            exportFormat === 'excel' ? IPC.TimesheetExportExcel : IPC.TimesheetExportPdf
          await invoke(channel, { from, to })
          setExportFormat(null)
        }}
      />
    </div>
  )
}
