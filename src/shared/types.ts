// Types partagés entre main (Electron) et renderer (React).
// Ne pas importer ici de modules Node ou Electron.

export interface ProjectDTO {
  id: number
  number: string
  comment: string
  path: string
  isPinned: boolean
}

export interface SubfolderDTO {
  id: number
  name: string
  relativePath: string
  position: number
  enabled: boolean
}

export interface TimeEntryDTO {
  id: number
  projectNumber: string
  date: string         // YYYY-MM-DD
  startTime: string    // HH:MM
  endTime: string      // HH:MM
  durationMin: number
  comment: string
}

export interface NewTimeEntryDTO {
  projectNumber: string
  date: string
  startTime: string
  endTime: string
  durationMin: number
  comment?: string
}

export interface ProjectBlockSummary {
  projectNumber: string
  comment: string
  blocks: number       // nombre de blocs (ex: 30min)
  totalMinutes: number
}

export interface AppConfig {
  rootProjects: string         // ex: "P:\\"
  intervalMinutes: number      // 30 par défaut
  startHour: number            // 8 par défaut
  startMinute: number
}

// Canal IPC : noms centralisés pour éviter les fautes de frappe.
export const IPC = {
  // Access
  ProjectsList: 'projects:list',
  ProjectResolve: 'projects:resolve',
  ProjectUpsert: 'projects:upsert',
  ProjectDelete: 'projects:delete',
  ProjectOpen: 'projects:open',
  SubfoldersList: 'subfolders:list',
  SubfolderUpsert: 'subfolders:upsert',
  SubfolderDelete: 'subfolders:delete',
  SubfoldersToggle: 'subfolders:toggle',
  SubfoldersSeedDefaults: 'subfolders:seedDefaults',
  // Timesheet
  TimeEntriesList: 'time:list',
  TimeEntryAdd: 'time:add',
  TimeEntryUpdate: 'time:update',
  TimeEntryDelete: 'time:delete',
  TimeEntriesClear: 'time:clear',
  TimeSummaryByProject: 'time:summary-by-project',
  TimesheetExportExcel: 'timesheet:export-excel',
  TimesheetExportPdf: 'timesheet:export-pdf',
  // Config
  ConfigGet: 'config:get',
  ConfigSet: 'config:set',
  // App
  AppVersion: 'app:version',
  AppRefocus: 'app:refocus',
  ShellOpenPath: 'shell:open-path',
  // Auto-updater
  UpdaterEvent: 'updater:event',          // main → renderer (push)
  UpdaterInstallNow: 'updater:install-now' // renderer → main (action)
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]

// Résultat d'un export (Excel ou PDF) : ok+path si écrit, cancelled si l'utilisateur a annulé
// la dialog native, error si la génération a échoué.
export interface ExportResult {
  ok: boolean
  cancelled?: boolean
  path?: string
  error?: string
}

// Événements émis par electron-updater vers le renderer.
export type UpdaterEvent =
  | { type: 'checking' }
  | { type: 'available'; version: string }
  | { type: 'not-available' }
  | { type: 'progress'; percent: number }
  | { type: 'downloaded'; version: string }
  | { type: 'error'; message: string }
