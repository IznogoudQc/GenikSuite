import { useState } from 'react'
import { AccessPage } from './pages/AccessPage'
import { TimesheetPage } from './pages/TimesheetPage'
import { SettingsPage } from './pages/SettingsPage'

type Tab = 'access' | 'timesheet' | 'settings'

export function App() {
  const [tab, setTab] = useState<Tab>('access')

  return (
    <div className="flex h-full" style={{ backgroundColor: 'var(--color-canvas)' }}>
      {/* Sidebar étroite avec icônes uniquement */}
      <aside
        className="w-16 flex flex-col items-center py-3"
        style={{ backgroundColor: 'var(--color-sidebar)', color: 'var(--color-sidebar-fg)' }}
      >
        {/* Logo / brand */}
        <div className="mb-6 w-10 h-10 rounded-lg bg-orange-500 flex items-center justify-center text-white font-bold text-sm shadow-md">
          v2
        </div>

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
        </nav>

        <SideIcon
          active={tab === 'settings'}
          onClick={() => setTab('settings')}
          label="Paramètres"
          icon="⚙"
        />
        <span className="text-[10px] text-zinc-500 mt-3 select-none">v0.1.0</span>
      </aside>

      {/* Contenu principal */}
      <main className="flex-1 overflow-auto">
        {tab === 'access' && <AccessPage />}
        {tab === 'timesheet' && <TimesheetPage />}
        {tab === 'settings' && <SettingsPage />}
      </main>
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
