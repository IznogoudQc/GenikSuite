import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'
import { autoUpdater } from 'electron-updater'
import { getDb, closeDb } from '../db/client'
import { registerAccessHandlers } from './ipc/access'
import { registerTimesheetHandlers } from './ipc/timesheet'
import { registerConfigHandlers } from './ipc/config'
import { registerExportHandlers } from './ipc/exports'
import { registerNetworkHandlers } from './ipc/network'
import { IPC } from '../src/shared/types'

const isDev = !app.isPackaged

// Emplacement de la DB : userData (jamais dans node_modules ni dans le bundle)
function getDbPath(): string {
  const userData = app.getPath('userData')
  return path.join(userData, 'geniksuite.db')
}

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#18181b',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Sur Windows, show() seul ne donne pas toujours le focus clavier à la fenêtre :
  // l'utilisateur voit l'app mais ne peut pas taper tant qu'il n'a pas cliqué hors
  // puis re-cliqué dessus. Workaround connu : setAlwaysOnTop bref force le focus
  // au niveau système, puis on focus le webContents pour activer la saisie clavier.
  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    if (process.platform === 'win32') {
      mainWindow?.setAlwaysOnTop(true)
      setTimeout(() => {
        mainWindow?.setAlwaysOnTop(false)
        mainWindow?.focus()
        mainWindow?.webContents.focus()
      }, 50)
    } else {
      mainWindow?.focus()
      mainWindow?.webContents.focus()
    }
  })

  // Sur Windows certaines actions (notif système, popup auto-updater) volent le
  // focus pendant l'exécution. Quand l'utilisateur reclique sur la fenêtre,
  // on s'assure que le webContents reprend bien le focus clavier.
  mainWindow.on('focus', () => {
    mainWindow?.webContents.focus()
  })

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    // DevTools en fenêtre séparée pour ne pas voler le focus clavier de la window.
    // Bug Windows connu : openDevTools() par défaut capture le focus → on ne peut
    // pas taper dans les inputs tant qu'on n'a pas cliqué hors de l'app.
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

/**
 * Configure l'auto-updater : forwarde tous les événements vers le renderer
 * pour qu'une bannière puisse afficher l'état (checking, downloading, etc.).
 */
function setupAutoUpdater(): void {
  // autoUpdater ne fonctionne pas en dev (pas de version installée).
  if (isDev) return

  const push = (data: unknown) => mainWindow?.webContents.send(IPC.UpdaterEvent, data)

  autoUpdater.on('checking-for-update', () => push({ type: 'checking' }))
  autoUpdater.on('update-available', (info) =>
    push({ type: 'available', version: info.version })
  )
  autoUpdater.on('update-not-available', () => push({ type: 'not-available' }))
  autoUpdater.on('download-progress', (p) =>
    push({ type: 'progress', percent: Math.round(p.percent) })
  )
  autoUpdater.on('update-downloaded', (info) =>
    push({ type: 'downloaded', version: info.version })
  )
  autoUpdater.on('error', (err) => push({ type: 'error', message: err.message }))

  // Bouton "Redémarrer maintenant" depuis la bannière.
  ipcMain.handle(IPC.UpdaterInstallNow, () => {
    autoUpdater.quitAndInstall()
  })

  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    console.error('autoUpdater error:', err)
  })
}

app.whenReady().then(() => {
  // DB initialisée une seule fois, partagée par tous les handlers.
  const db = getDb(getDbPath())

  registerAccessHandlers(ipcMain, db)
  registerTimesheetHandlers(ipcMain, db)
  registerConfigHandlers(ipcMain, db)
  registerExportHandlers(ipcMain, db)
  registerNetworkHandlers(ipcMain, db)

  // Version de l'app (lue depuis package.json à la compilation/install).
  // Le renderer s'en sert pour afficher le numéro dans la sidebar.
  ipcMain.handle(IPC.AppVersion, () => app.getVersion())

  // Force le re-focus de la fenêtre + clavier après une dialog native
  // (confirm/alert) qui vole le focus sur Windows.
  ipcMain.handle(IPC.AppRefocus, () => {
    if (!mainWindow) return
    mainWindow.focus()
    mainWindow.webContents.focus()
  })

  // Place la fenêtre par-dessus TOUTES les apps (SolidWorks, Excel, etc.)
  // puis relâche le flag après un court délai. Utilisé par le PopupTimer
  // pour interrompre l'utilisateur à chaque bloc de temps.
  ipcMain.handle(IPC.AppBringToFront, () => {
    if (!mainWindow) return
    // Restaurer si minimisée
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.setAlwaysOnTop(true)
    mainWindow.show()
    mainWindow.focus()
    mainWindow.webContents.focus()
    // Relâche après 500ms : la fenêtre reste visible mais ne bloque plus
    // le passage en arrière-plan si l'utilisateur bascule vers une autre app.
    setTimeout(() => {
      mainWindow?.setAlwaysOnTop(false)
    }, 500)
  })

  createWindow()
  setupAutoUpdater()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  closeDb()
  if (process.platform !== 'darwin') app.quit()
})
