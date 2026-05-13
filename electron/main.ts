import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'
import { autoUpdater } from 'electron-updater'
import { getDb, closeDb } from '../db/client'
import { registerAccessHandlers } from './ipc/access'
import { registerTimesheetHandlers } from './ipc/timesheet'
import { registerConfigHandlers } from './ipc/config'
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

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // DB initialisée une seule fois, partagée par tous les handlers.
  const db = getDb(getDbPath())

  registerAccessHandlers(ipcMain, db)
  registerTimesheetHandlers(ipcMain, db)
  registerConfigHandlers(ipcMain, db)

  // Version de l'app (lue depuis package.json à la compilation/install).
  // Le renderer s'en sert pour afficher le numéro dans la sidebar.
  ipcMain.handle(IPC.AppVersion, () => app.getVersion())

  createWindow()

  // Auto-update en production seulement
  if (!isDev) {
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.error('autoUpdater error:', err)
    })
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  closeDb()
  if (process.platform !== 'darwin') app.quit()
})
