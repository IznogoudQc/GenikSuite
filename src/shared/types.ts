// Types partagés entre main (Electron) et renderer (React).
// Ne pas importer ici de modules Node ou Electron.

export interface ProjectDTO {
  id: number
  number: string
  comment: string
  path: string
  color?: string       // couleur hex (#rrggbb) ; absente = auto par hash
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

// Profil IP statique (Manage_ip) — appliqué via netsh quand on clique « Appliquer ».
export interface NetworkProfileDTO {
  id: number
  name: string
  interfaceName: string
  ip: string
  subnet: string
  gateway: string
  position: number
}

// Interface réseau Windows telle que vue par `netsh interface show interface`.
export interface NetworkInterfaceDTO {
  name: string                 // ex: "Ethernet", "Ethernet2"
  state: string                // "Connected" / "Disconnected"
  type: string                 // "Dedicated"
  currentIp?: string           // IP actuellement assignée (peut être vide)
  mode?: 'dhcp' | 'static' | 'unknown'
}

// Résultat d'une action netsh (apply / dhcp).
export interface NetshResult {
  ok: boolean
  message?: string
  newIp?: string               // IP relue après application
}

// Canal IPC : noms centralisés pour éviter les fautes de frappe.
export const IPC = {
  // Access
  ProjectsList: 'projects:list',
  ProjectResolve: 'projects:resolve',
  ProjectUpsert: 'projects:upsert',
  ProjectDelete: 'projects:delete',
  ProjectOpen: 'projects:open',
  ProjectSetColor: 'projects:setColor',
  ProjectsImportLegacy: 'projects:importLegacy',
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
  // Network (gestion IP statique cartes réseau Windows — ex Manage_ip)
  NetworkProfilesList: 'network:profiles-list',
  NetworkProfileUpsert: 'network:profile-upsert',
  NetworkProfileDelete: 'network:profile-delete',
  NetworkInterfacesList: 'network:interfaces-list',
  NetworkApplyProfile: 'network:apply-profile',
  NetworkSetDhcp: 'network:set-dhcp',
  NetworkImportLegacyIni: 'network:import-legacy-ini',
  // Config
  ConfigGet: 'config:get',
  ConfigSet: 'config:set',
  // App
  AppVersion: 'app:version',
  AppRefocus: 'app:refocus',
  ShellOpenPath: 'shell:open-path',
  AppBringToFront: 'app:bring-to-front',
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

// Résultat d'un import de projets.json (legacy GenikAccess).
// `cancelled` si l'utilisateur a fermé la dialog ; `error` si parse impossible ;
// sinon `inserted` / `updated` / `total` reflètent ce qui a été appliqué.
export interface ImportLegacyResult {
  ok: boolean
  cancelled?: boolean
  error?: string
  path?: string
  inserted?: number
  updated?: number
  total?: number
}

// Événements émis par electron-updater vers le renderer.
export type UpdaterEvent =
  | { type: 'checking' }
  | { type: 'available'; version: string }
  | { type: 'not-available' }
  | { type: 'progress'; percent: number }
  | { type: 'downloaded'; version: string }
  | { type: 'error'; message: string }
