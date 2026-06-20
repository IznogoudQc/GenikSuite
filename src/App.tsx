import { useEffect, useState } from 'react'
import logoUrl from './assets/logo.png'
import { AccessPage } from './pages/AccessPage'
import { TimesheetPage } from './pages/TimesheetPage'
import { SettingsPage } from './pages/SettingsPage'
import { NetworkPage } from './pages/NetworkPage'
import { DocumentsPage } from './pages/DocumentsPage'
import { UpdateBanner } from './components/UpdateBanner'
import { StatusBar } from './components/StatusBar'
import { PopupTimer } from './components/PopupTimer'
import { ConfirmHost } from './components/ConfirmHost'
import { invoke, IPC, CONFIG_CHANGED_EVENT } from './lib/ipc'
import type { ProjectDTO, NewTimeEntryDTO } from './shared/types'

type Tab = 'access' | 'timesheet' | 'network' | 'documents' | 'settings'

// Événement DOM émis quand une entrée de temps change : la page Timesheet l'écoute pour refresh.
export const TIME_ENTRIES_CHANGED_EVENT = 'geniksuite:time-entries-changed'

// Événement DOM émis quand la liste des projets change : App recharge `projects`.
export const PROJECTS_CHANGED_EVENT = 'geniksuite:projects-changed'

export function App() {
  const [tab, setTab] = useState<Tab>('access')
  const [version, setVersion] = useState<string>('')

  // État du timer remonté ici pour rester actif quel que soit l'onglet affiché.
  const [timerOn, setTimerOn] = useState(false)
  const [pendingStart, setPendingStart] = useState<Date | null>(null)
  const [intervalMin, setIntervalMin] = useState(30)
  const [nextPopupAt, setNextPopupAt] = useState<Date | null>(null)
  const [projects, setProjects] = useState<ProjectDTO[]>([])

  // Version + intervalMin + projets chargés au démarrage.
  useEffect(() => {
    invoke<string>(IPC.AppVersion)
      .then(setVersion)
      .catch(() => setVersion(''))
  }, [])

  useEffect(() => {
    async function loadIntervalMin() {
      const v = await invoke<string>(IPC.ConfigGet, 'intervalMinutes')
      setIntervalMin(parseInt(v, 10) || 30)
    }
    void loadIntervalMin()
    window.addEventListener(CONFIG_CHANGED_EVENT, loadIntervalMin)
    return () => window.removeEventListener(CONFIG_CHANGED_EVENT, loadIntervalMin)
  }, [])

  useEffect(() => {
    async function loadProjects() {
      setProjects(await invoke<ProjectDTO[]>(IPC.ProjectsList))
    }
    void loadProjects()
    window.addEventListener(PROJECTS_CHANGED_EVENT, loadProjects)
    return () => window.removeEventListener(PROJECTS_CHANGED_EVENT, loadProjects)
  }, [])

  // Enregistre une entrée de temps depuis le PopupTimer global.
  async function handleAddEntry(entry: NewTimeEntryDTO) {
    const num = entry.projectNumber.trim()
    if (num && !projects.some((p) => p.number === num)) {
      await invoke(IPC.ProjectUpsert, { number: num })
      // recharge la liste (couleurs du calendrier, datalist du popup) via l'event global
      window.dispatchEvent(new Event(PROJECTS_CHANGED_EVENT))
    }
    await invoke(IPC.TimeEntryAdd, entry)
    setPendingStart(null)
    window.dispatchEvent(new Event(TIME_ENTRIES_CHANGED_EVENT))
  }

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--color-canvas)' }}>
      {/* Row principale : sidebar + main */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar étroite avec icônes uniquement */}
        <aside
          className="w-16 flex flex-col items-center py-3"
          style={{ backgroundColor: 'var(--color-sidebar)', color: 'var(--color-sidebar-fg)' }}
        >
          {/* Logo / brand */}
          <img
            src={logoUrl}
            alt="GenikSuite"
            className="mb-6 w-10 h-10 rounded-lg shadow-md object-cover"
          />

          <nav className="flex flex-col gap-2 flex-1">
            <SideIcon
              active={tab === 'access'}
              onClick={() => setTab('access')}
              label="Accès projets"
              icon="📁"
            />
            <SideIcon
              active={tab === 'timesheet'}
              onClick={() => setTab('timesheet')}
              label="Feuille de temps"
              icon="⏱"
            />
            <SideIcon
              active={tab === 'documents'}
              onClick={() => setTab('documents')}
              label="Documents"
              icon="📚"
            />
          </nav>

          <SideIcon
            active={tab === 'network'}
            onClick={() => setTab('network')}
            label="Réseau"
            icon="🌐"
          />
          <SideIcon
            active={tab === 'settings'}
            onClick={() => setTab('settings')}
            label="Paramètres"
            icon="⚙"
          />
          <span className="text-[10px] text-zinc-500 mt-3 select-none">
            {version ? `v${version}` : ''}
          </span>
        </aside>

        {/* Contenu principal */}
        <main className="flex-1 overflow-auto">
          {tab === 'access' && <AccessPage />}
          {tab === 'timesheet' && (
            <TimesheetPage
              timerOn={timerOn}
              onToggleTimer={() => setTimerOn((v) => !v)}
              intervalMin={intervalMin}
              projects={projects}
            />
          )}
          {tab === 'network' && <NetworkPage />}
          {tab === 'documents' && <DocumentsPage />}
          {tab === 'settings' && <SettingsPage />}
        </main>
      </div>

      {/* StatusBar : compte à rebours du prochain popup (visible quand timer actif) */}
      <StatusBar timerOn={timerOn} nextPopupAt={nextPopupAt} />

      {/* Bannière auto-updater (en bas à droite, flottante) */}
      <UpdateBanner />

      {/* Hôte pour les confirmations React (remplace window.confirm) */}
      <ConfirmHost />

      {/* PopupTimer global : reste monté même si on quitte la page Timesheet */}
      {timerOn && (
        <PopupTimer
          intervalMin={intervalMin}
          projects={projects}
          pendingStart={pendingStart}
          onSubmit={handleAddEntry}
          onSkip={(start) => setPendingStart(start)}
          onSchedule={setNextPopupAt}
        />
      )}
    </div>
  )
}

function SideIcon({
  active,
  onClick,
  label,
  icon
}: {
  active: boolean
  onClick: () => void
  label: string
  icon: string
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`relative w-11 h-11 flex items-center justify-center rounded-lg text-xl transition-colors ${
        active
          ? 'bg-orange-500/15 text-orange-400'
          : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
      }`}
    >
      {icon}
      {active && (
        <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r bg-orange-500" />
      )}
    </button>
  )
}
