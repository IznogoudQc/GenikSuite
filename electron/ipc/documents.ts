import { shell, dialog, BrowserWindow, type IpcMain } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { eq, asc } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { documents, documentGroups } from '../../db/schema'
import {
  IPC,
  type DocumentDTO,
  type DocumentGroupDTO,
  type ResolvedDocumentDTO
} from '../../src/shared/types'
import { getRootProjects } from './config'

function toDTO(d: {
  id: number
  name: string
  filePath: string
  comment: string | null
  isProjectRelative: boolean | null
  groupId: number | null
  position: number | null
}): DocumentDTO {
  return {
    id: d.id,
    name: d.name,
    filePath: d.filePath,
    comment: d.comment ?? '',
    isProjectRelative: !!d.isProjectRelative,
    groupId: d.groupId,
    position: d.position ?? 0
  }
}

/**
 * Calcule le chemin Windows d'un projet (tranche 500).
 * Ex: 17528 → "<root>\\17500-17999\\17528"
 * Dupliqué de access.ts (helper privé). Garder synchronisé si la logique change.
 */
function tranche500(num: number): string {
  const start = Math.floor(num / 500) * 500
  return `${start}-${start + 499}`
}

function resolveProjectDir(root: string, projectNumber: string): string | null {
  const n = parseInt(projectNumber, 10)
  if (Number.isNaN(n)) return null
  const dir = path.join(root, tranche500(n), projectNumber)
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return null
  return dir
}

/**
 * Construit un pattern de fichier projet à partir d'un sous-chemin et du numéro
 * projet détecté. Substitue :
 *   - le numéro projet → {PROJECT}
 *   - les dates ISO (YYYY-MM-DD ou YYYY_MM_DD) → *
 *   - les versions vN ou _vN → *
 * Préserve la structure de dossiers d'origine pour cibler le scan.
 */
function makePattern(subPath: string, projectNumber: string): string {
  let out = subPath
  // Remplace toutes les occurrences du numéro projet par {PROJECT}.
  out = out.replace(new RegExp(`\\b${projectNumber}\\b`, 'g'), '{PROJECT}')
  // Dates ISO : 2026-02-24, 2026_02_24
  out = out.replace(/\d{4}[-_]\d{2}[-_]\d{2}/g, '*')
  // Versions v1, v12, _v3
  out = out.replace(/v\d+/gi, '*')
  return out
}

/**
 * Convertit un pattern de chemin en regex :
 *   `{PROJECT}` → numéro de projet (substitué AVANT cette fonction)
 *   `*`         → tout sauf séparateur (any name part)
 *   `**`        → tout, séparateurs inclus (any depth)
 *   `?`         → un caractère sauf séparateur
 * Les autres caractères regex sont échappés. Comparaison insensible à la casse.
 */
function patternToRegex(pattern: string): RegExp {
  // Normalise les séparateurs vers `\` (Windows).
  const norm = pattern.replace(/\//g, '\\')
  // Échappe les caractères regex spéciaux SAUF * et ?.
  let src = norm.replace(/[.+^${}()|[\]]/g, '\\$&')
  // Protège ** avant de traiter *.
  src = src.replace(/\*\*/g, '___DOUBLESTAR___')
  src = src.replace(/\*/g, '[^\\\\]*')
  src = src.replace(/___DOUBLESTAR___/g, '.*')
  src = src.replace(/\?/g, '[^\\\\]')
  // Échappe les backslashes restants (séparateurs Windows).
  src = src.replace(/\\(?!\[|\.|\*)/g, '\\\\')
  return new RegExp('^' + src + '$', 'i')
}

/**
 * Cherche dans un dossier précis (PAS récursif) les fichiers dont le NOM
 * matche le pattern de fichier. Le pattern complet a la forme :
 *   `<sous-dossier>\<nom-de-fichier>` (ex: `02_Planif\{PROJECT}_Addendas - *.xlsx`)
 * On extrait le sous-dossier (partie sans wildcard) et on scanne uniquement
 * son contenu direct. Si le sous-dossier n'existe pas, retourne tableau vide.
 */
function findMatchingFiles(projectDir: string, pattern: string): string[] {
  // Normalise les séparateurs vers `\`.
  const norm = pattern.replace(/\//g, '\\')
  const lastSep = norm.lastIndexOf('\\')
  const subDir = lastSep >= 0 ? norm.slice(0, lastSep) : ''
  const fileName = lastSep >= 0 ? norm.slice(lastSep + 1) : norm

  const scanDir = subDir ? path.join(projectDir, subDir) : projectDir
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(scanDir, { withFileTypes: true })
  } catch {
    return []
  }

  const regex = patternToRegex(fileName)
  const matches: string[] = []
  for (const entry of entries) {
    if (entry.isFile() && regex.test(entry.name)) {
      matches.push(path.join(scanDir, entry.name))
    }
  }
  return matches
}

function toGroupDTO(g: { id: number; name: string; position: number | null }): DocumentGroupDTO {
  return { id: g.id, name: g.name, position: g.position ?? 0 }
}

export function registerDocumentsHandlers(
  ipcMain: IpcMain,
  db: BetterSQLite3Database<Record<string, unknown>>
) {
  ipcMain.handle(IPC.DocumentsList, async (): Promise<DocumentDTO[]> => {
    const rows = await db
      .select()
      .from(documents)
      .orderBy(asc(documents.position), asc(documents.name))
    return rows.map((r) =>
      toDTO({
        id: r.id,
        name: r.name,
        filePath: r.filePath,
        comment: r.comment ?? '',
        isProjectRelative: r.isProjectRelative,
        groupId: r.groupId,
        position: r.position ?? 0
      })
    )
  })

  ipcMain.handle(
    IPC.DocumentUpsert,
    async (
      _e,
      payload: {
        id?: number
        name: string
        filePath: string
        comment?: string
        isProjectRelative?: boolean
        groupId?: number | null
        position?: number
      }
    ): Promise<DocumentDTO> => {
      if (payload.id) {
        const updated = await db
          .update(documents)
          .set({
            name: payload.name,
            filePath: payload.filePath,
            comment: payload.comment ?? '',
            isProjectRelative: payload.isProjectRelative ?? false,
            groupId: payload.groupId ?? null,
            position: payload.position ?? 0,
            updatedAt: new Date()
          })
          .where(eq(documents.id, payload.id))
          .returning()
        const r = updated[0]
        return toDTO({
          ...r,
          comment: r.comment ?? '',
          isProjectRelative: r.isProjectRelative,
          groupId: r.groupId,
          position: r.position ?? 0
        })
      }
      const inserted = await db
        .insert(documents)
        .values({
          name: payload.name,
          filePath: payload.filePath,
          comment: payload.comment ?? '',
          isProjectRelative: payload.isProjectRelative ?? false,
          groupId: payload.groupId ?? null,
          position: payload.position ?? 0
        })
        .returning()
      const r = inserted[0]
      return toDTO({
        ...r,
        comment: r.comment ?? '',
        isProjectRelative: r.isProjectRelative,
        groupId: r.groupId,
        position: r.position ?? 0
      })
    }
  )

  ipcMain.handle(IPC.DocumentDelete, async (_e, id: number): Promise<boolean> => {
    await db.delete(documents).where(eq(documents.id, id))
    return true
  })

  /**
   * Ouvre le document avec l'app Windows par défaut. Retourne false si le
   * chemin n'existe pas (réseau coupé, fichier supprimé, etc.).
   */
  ipcMain.handle(
    IPC.DocumentOpen,
    async (_e, id: number): Promise<{ ok: boolean; reason?: string }> => {
      const rows = await db.select().from(documents).where(eq(documents.id, id)).limit(1)
      const d = rows[0]
      if (!d) return { ok: false, reason: 'document_not_found' }
      if (!fs.existsSync(d.filePath)) return { ok: false, reason: 'file_missing' }
      const err = await shell.openPath(d.filePath)
      if (err) return { ok: false, reason: err }
      return { ok: true }
    }
  )

  /**
   * Ouvre un dialog Windows pour choisir un fichier. Retourne :
   *   - `filePath` : chemin absolu sélectionné
   *   - `suggestedName` : basename sans extension (pour le champ Nom)
   *   - `pattern` + `detectedProject` : si le fichier est sous le root projets
   *     ET son filename contient un numéro projet → bascule auto en mode pattern.
   */
  ipcMain.handle(
    IPC.DocumentPickFile,
    async (): Promise<{
      cancelled?: boolean
      filePath?: string
      suggestedName?: string
      pattern?: string
      detectedProject?: string
    }> => {
      const parent = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
      const opts = {
        title: 'Sélectionne un document',
        properties: ['openFile' as const],
        filters: [
          { name: 'Documents', extensions: ['pdf', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'txt'] },
          { name: 'Tous les fichiers', extensions: ['*'] }
        ]
      }
      const result = parent
        ? await dialog.showOpenDialog(parent, opts)
        : await dialog.showOpenDialog(opts)
      if (result.canceled || !result.filePaths[0]) return { cancelled: true }
      const filePath = result.filePaths[0]
      const base = path.basename(filePath)
      const suggestedNameRaw = base.replace(/\.[^.]+$/, '')

      // Tentative de détection pattern : le fichier est-il sous root projets
      // ET son filename contient-il un numéro projet ?
      const root = await getRootProjects(db)
      const rootNorm = path.normalize(root).replace(/[\\/]+$/, '')
      const absNorm = path.normalize(filePath)
      let pattern: string | undefined
      let detectedProject: string | undefined
      let suggestedName = suggestedNameRaw

      if (absNorm.toLowerCase().startsWith(rootNorm.toLowerCase())) {
        const relToRoot = absNorm.slice(rootNorm.length + 1)
        const parts = relToRoot.split(/[\\/]/)
        // Structure attendue : <tranche>\<projet>\<…>\<fichier>
        if (parts.length >= 3 && /^\d+$/.test(parts[1])) {
          const projNum = parts[1]
          // Le filename contient-il bien ce numéro ?
          if (base.includes(projNum)) {
            detectedProject = projNum
            const inProject = parts.slice(2).join('\\')
            pattern = makePattern(inProject, projNum)
            // Nettoie le nom suggéré : enlève numéro projet + dates + versions
            suggestedName = suggestedNameRaw
              .replace(new RegExp(`\\b${projNum}\\b[-_ ]?`, 'g'), '')
              .replace(/[-_ ]?\d{4}[-_]\d{2}[-_]\d{2}/g, '')
              .replace(/[-_ ]?v\d+\b/gi, '')
              .trim()
              .replace(/^[-_ ]+|[-_ ]+$/g, '') ||
              suggestedNameRaw
          }
        }
      }

      return { filePath, suggestedName, pattern, detectedProject }
    }
  )

  // ---------------- Groupes de documents ----------------
  ipcMain.handle(IPC.DocumentGroupsList, async (): Promise<DocumentGroupDTO[]> => {
    const rows = await db
      .select()
      .from(documentGroups)
      .orderBy(asc(documentGroups.position), asc(documentGroups.name))
    return rows.map((r) => toGroupDTO({ id: r.id, name: r.name, position: r.position ?? 0 }))
  })

  ipcMain.handle(
    IPC.DocumentGroupUpsert,
    async (
      _e,
      payload: { id?: number; name: string; position?: number }
    ): Promise<DocumentGroupDTO> => {
      if (payload.id) {
        const updated = await db
          .update(documentGroups)
          .set({ name: payload.name, position: payload.position ?? 0 })
          .where(eq(documentGroups.id, payload.id))
          .returning()
        const r = updated[0]
        return toGroupDTO({ id: r.id, name: r.name, position: r.position ?? 0 })
      }
      const inserted = await db
        .insert(documentGroups)
        .values({ name: payload.name, position: payload.position ?? 0 })
        .returning()
      const r = inserted[0]
      return toGroupDTO({ id: r.id, name: r.name, position: r.position ?? 0 })
    }
  )

  /**
   * Supprime un groupe. Les documents associés gardent leur entrée mais
   * passent en "Non classé" (group_id devient NULL via ON DELETE SET NULL).
   */
  ipcMain.handle(IPC.DocumentGroupDelete, async (_e, id: number): Promise<boolean> => {
    await db.delete(documentGroups).where(eq(documentGroups.id, id))
    return true
  })

  // ---------------- Résolution dans le contexte projet ----------------
  /**
   * Pour chaque doc `isProjectRelative`, traite `filePath` comme un pattern :
   *   - `{PROJECT}` est remplacé par le numéro de projet
   *   - `*` et `**` font office de wildcards
   * Scanne récursivement le dossier projet et retourne UNE entrée par fichier
   * trouvé (donc un doc défini peut produire plusieurs lignes — ex: 2 Addendas
   * avec des dates différentes).
   */
  ipcMain.handle(
    IPC.DocumentsListForProject,
    async (_e, projectNumber: string): Promise<ResolvedDocumentDTO[]> => {
      const root = await getRootProjects(db)
      const projectDir = resolveProjectDir(root, projectNumber)
      if (!projectDir) return []

      const rows = await db
        .select()
        .from(documents)
        .orderBy(asc(documents.position), asc(documents.name))

      const out: ResolvedDocumentDTO[] = []
      for (const r of rows) {
        if (!r.isProjectRelative) continue
        const pattern = r.filePath.replace(/\{PROJECT\}/g, projectNumber)
        const matches = findMatchingFiles(projectDir, pattern)
        for (const matched of matches) {
          out.push({
            ...toDTO({
              id: r.id,
              name: r.name,
              filePath: r.filePath,
              comment: r.comment ?? '',
              isProjectRelative: r.isProjectRelative,
              groupId: r.groupId,
              position: r.position ?? 0
            }),
            resolvedPath: matched
          })
        }
      }
      return out
    }
  )
}
