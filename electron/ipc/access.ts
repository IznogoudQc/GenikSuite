import { shell, dialog, BrowserWindow, type IpcMain } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { eq, asc } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { projects, subfolders, type Project } from '../../db/schema'
import { IPC, type ProjectDTO, type SubfolderDTO, type ImportLegacyResult } from '../../src/shared/types'
import { GENIK_DEFAULT_SUBFOLDERS } from '../../src/shared/genikDefaults'
import { colorForProject } from '../../src/lib/projectColors'
import { getRootProjects } from './config'

/**
 * Calcule le libellé de tranche 500 pour un numéro de projet.
 * Ex: 17528 → "17500-17999"
 */
function tranche500(num: number): string {
  const start = Math.floor(num / 500) * 500
  return `${start}-${start + 499}`
}

/**
 * Résout le chemin Windows d'un projet à partir de son numéro.
 * Retourne null si la tranche ou le dossier projet n'existe pas.
 */
function resolveProjectPath(rootProjects: string, projectNumber: string): string | null {
  const n = parseInt(projectNumber, 10)
  if (Number.isNaN(n)) return null

  const trancheDir = path.join(rootProjects, tranche500(n))
  if (!fs.existsSync(trancheDir) || !fs.statSync(trancheDir).isDirectory()) return null

  const projectDir = path.join(trancheDir, projectNumber)
  if (!fs.existsSync(projectDir) || !fs.statSync(projectDir).isDirectory()) return null

  return projectDir
}

function toDTO(p: Project): ProjectDTO {
  return {
    id: p.id,
    number: p.number,
    comment: p.comment ?? '',
    path: p.path ?? '',
    // color est toujours résolu : couleur custom si définie, sinon couleur
    // déterministe par hash du numéro — pour avoir la même couleur partout.
    color: colorForProject({ number: p.number, color: p.color }),
    isPinned: !!p.isPinned
  }
}

export function registerAccessHandlers(
  ipcMain: IpcMain,
  db: BetterSQLite3Database<Record<string, unknown>>
) {
  // ---------------- Projects ----------------
  ipcMain.handle(IPC.ProjectsList, async (): Promise<ProjectDTO[]> => {
    const rows = await db.select().from(projects).orderBy(asc(projects.number))
    return rows.map(toDTO)
  })

  /**
   * Résout un projet : vérifie son existence sur le disque, le persiste
   * en base si trouvé. Ne crée JAMAIS de dossier.
   */
  ipcMain.handle(
    IPC.ProjectResolve,
    async (_e, payload: { number: string; comment?: string }): Promise<ProjectDTO | null> => {
      const root = await getRootProjects(db)
      const resolved = resolveProjectPath(root, payload.number)
      if (!resolved) return null

      const existing = await db
        .select()
        .from(projects)
        .where(eq(projects.number, payload.number))
        .limit(1)

      if (existing[0]) {
        await db
          .update(projects)
          .set({
            path: resolved,
            comment: payload.comment ?? existing[0].comment,
            updatedAt: new Date()
          })
          .where(eq(projects.id, existing[0].id))
        return toDTO({ ...existing[0], path: resolved, comment: payload.comment ?? existing[0].comment })
      }

      const inserted = await db
        .insert(projects)
        .values({ number: payload.number, comment: payload.comment ?? '', path: resolved })
        .returning()
      return toDTO(inserted[0])
    }
  )

  ipcMain.handle(
    IPC.ProjectUpsert,
    async (_e, payload: { number: string; comment?: string; isPinned?: boolean }): Promise<ProjectDTO> => {
      const existing = await db
        .select()
        .from(projects)
        .where(eq(projects.number, payload.number))
        .limit(1)

      if (existing[0]) {
        const updated = await db
          .update(projects)
          .set({
            comment: payload.comment ?? existing[0].comment,
            isPinned: payload.isPinned ?? existing[0].isPinned,
            updatedAt: new Date()
          })
          .where(eq(projects.id, existing[0].id))
          .returning()
        return toDTO(updated[0])
      }

      const inserted = await db
        .insert(projects)
        .values({
          number: payload.number,
          comment: payload.comment ?? '',
          isPinned: payload.isPinned ?? false
        })
        .returning()
      return toDTO(inserted[0])
    }
  )

  ipcMain.handle(IPC.ProjectDelete, async (_e, projectNumber: string): Promise<boolean> => {
    await db.delete(projects).where(eq(projects.number, projectNumber))
    return true
  })

  /**
   * Définit la couleur custom d'un projet. `color` est une chaîne hex (#rrggbb).
   * ProjectUpsert ne touche jamais à `color` : la couleur survit aux mises à jour.
   */
  ipcMain.handle(
    IPC.ProjectSetColor,
    async (_e, payload: { number: string; color: string }): Promise<boolean> => {
      await db
        .update(projects)
        .set({ color: payload.color, updatedAt: new Date() })
        .where(eq(projects.number, payload.number))
      return true
    }
  )

  /**
   * Ouvre le dossier projet (ou un sous-dossier) dans l'Explorateur Windows.
   * Retourne false si le chemin n'existe pas — ne crée rien.
   */
  ipcMain.handle(
    IPC.ProjectOpen,
    async (_e, payload: { projectNumber: string; subfolderRelative?: string }): Promise<{ ok: boolean; reason?: string; opened?: string }> => {
      const root = await getRootProjects(db)
      const projectDir = resolveProjectPath(root, payload.projectNumber)
      if (!projectDir) return { ok: false, reason: 'project_not_found' }

      const target = payload.subfolderRelative
        ? path.join(projectDir, payload.subfolderRelative)
        : projectDir

      if (!fs.existsSync(target)) return { ok: false, reason: 'subfolder_missing', opened: target }

      const error = await shell.openPath(target)
      if (error) return { ok: false, reason: error, opened: target }
      return { ok: true, opened: target }
    }
  )

  // ---------------- Subfolders ----------------
  ipcMain.handle(IPC.SubfoldersList, async (): Promise<SubfolderDTO[]> => {
    const rows = await db.select().from(subfolders).orderBy(asc(subfolders.position))
    return rows.map((s) => ({
      id: s.id,
      name: s.name,
      relativePath: s.relativePath,
      position: s.position ?? 0,
      enabled: !!s.enabled
    }))
  })

  ipcMain.handle(
    IPC.SubfolderUpsert,
    async (_e, payload: { id?: number; name: string; relativePath: string; position?: number; enabled?: boolean }): Promise<SubfolderDTO> => {
      if (payload.id) {
        const updated = await db
          .update(subfolders)
          .set({
            name: payload.name,
            relativePath: payload.relativePath,
            position: payload.position ?? 0,
            enabled: payload.enabled ?? true
          })
          .where(eq(subfolders.id, payload.id))
          .returning()
        const r = updated[0]
        return { id: r.id, name: r.name, relativePath: r.relativePath, position: r.position ?? 0, enabled: !!r.enabled }
      }
      const inserted = await db
        .insert(subfolders)
        .values({
          name: payload.name,
          relativePath: payload.relativePath,
          position: payload.position ?? 0,
          enabled: payload.enabled ?? true
        })
        .returning()
      const r = inserted[0]
      return { id: r.id, name: r.name, relativePath: r.relativePath, position: r.position ?? 0, enabled: !!r.enabled }
    }
  )

  ipcMain.handle(IPC.SubfolderDelete, async (_e, id: number): Promise<boolean> => {
    await db.delete(subfolders).where(eq(subfolders.id, id))
    return true
  })

  /**
   * Active / désactive un sous-dossier (champ `enabled`).
   * La AccessPage filtre sur `enabled` : un sous-dossier décoché disparaît
   * de ses checkboxes sans être supprimé.
   */
  ipcMain.handle(
    IPC.SubfoldersToggle,
    async (_e, payload: { id: number; enabled: boolean }): Promise<boolean> => {
      await db
        .update(subfolders)
        .set({ enabled: payload.enabled })
        .where(eq(subfolders.id, payload.id))
      return true
    }
  )

  /**
   * Importe un fichier `projets.json` legacy (format GenikAccess Python) :
   * `{ "17528": { "path": "...", "comment": "..." }, ... }`.
   * Ouvre un dialog si `filePath` n'est pas fourni.
   * Insère les nouveaux projets, met à jour `comment`/`path` des existants
   * (laisse `color` et `isPinned` intacts).
   */
  ipcMain.handle(
    IPC.ProjectsImportLegacy,
    async (_e, payload?: { filePath?: string }): Promise<ImportLegacyResult> => {
      let filePath = payload?.filePath
      if (!filePath) {
        const parent = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
        const result = parent
          ? await dialog.showOpenDialog(parent, {
              title: 'Sélectionne projets.json (GenikAccess)',
              properties: ['openFile'],
              filters: [{ name: 'JSON', extensions: ['json'] }]
            })
          : await dialog.showOpenDialog({
              title: 'Sélectionne projets.json (GenikAccess)',
              properties: ['openFile'],
              filters: [{ name: 'JSON', extensions: ['json'] }]
            })
        if (result.canceled || !result.filePaths[0]) return { ok: false, cancelled: true }
        filePath = result.filePaths[0]
      }

      let raw: unknown
      try {
        raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      } catch (err) {
        return { ok: false, path: filePath, error: `Lecture/parse JSON: ${(err as Error).message}` }
      }

      // Format attendu : objet { "<number>": { path, comment } }.
      // On accepte aussi un tableau de strings (vieux ChronoTrack).
      const entries: Array<{ number: string; comment: string; path: string }> = []
      if (Array.isArray(raw)) {
        for (const item of raw) {
          const num = String(item).trim()
          if (num) entries.push({ number: num, comment: '', path: '' })
        }
      } else if (raw && typeof raw === 'object') {
        for (const [num, info] of Object.entries(raw as Record<string, { path?: string; comment?: string }>)) {
          const n = String(num).trim()
          if (!n) continue
          entries.push({
            number: n,
            comment: info?.comment ?? '',
            path: info?.path ?? ''
          })
        }
      } else {
        return { ok: false, path: filePath, error: 'Format JSON inattendu.' }
      }

      let inserted = 0
      let updated = 0
      for (const e of entries) {
        const existing = await db
          .select()
          .from(projects)
          .where(eq(projects.number, e.number))
          .limit(1)

        if (existing[0]) {
          await db
            .update(projects)
            .set({
              comment: e.comment || existing[0].comment,
              path: e.path || existing[0].path,
              updatedAt: new Date()
            })
            .where(eq(projects.id, existing[0].id))
          updated++
        } else {
          await db.insert(projects).values({
            number: e.number,
            comment: e.comment,
            path: e.path
          })
          inserted++
        }
      }

      return { ok: true, path: filePath, inserted, updated, total: entries.length }
    }
  )

  /**
   * Injecte les sous-dossiers standards Genik (GENIK_DEFAULT_SUBFOLDERS).
   * INSERT OR IGNORE basé sur `relativePath` : les sous-dossiers déjà présents
   * (peu importe leur état `enabled`) ne sont pas touchés. Les nouveaux sont
   * insérés désactivés (enabled=false) — l'utilisateur les active à la carte.
   */
  ipcMain.handle(IPC.SubfoldersSeedDefaults, async (): Promise<{ inserted: number }> => {
    const existing = await db.select().from(subfolders)
    const known = new Set(existing.map((s) => s.relativePath))
    let position = existing.reduce((max, s) => Math.max(max, s.position ?? 0), -1)

    let inserted = 0
    for (const def of GENIK_DEFAULT_SUBFOLDERS) {
      if (known.has(def.relativePath)) continue
      position += 1
      await db.insert(subfolders).values({
        name: def.name,
        relativePath: def.relativePath,
        position,
        enabled: false
      })
      inserted++
    }
    return { inserted }
  })
}
