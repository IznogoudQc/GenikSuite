/**
 * Migration des données depuis les anciennes apps Python.
 *
 * Lit :
 *   - ../GenikAccess/projets.json   (dict { "17528": { path, comment } })
 *   - ../GenikAccess/feuilles_de_temps.csv  (Date;Heure début;Heure fin;Projet;Commentaire)
 *   - ../GenikAccess/config.json    (ROOT_PROJECTS, SUBFOLDERS)
 *
 * Écrit dans ./data/geniksuite.db (chemin local de dev).
 *
 * Usage : npm run db:import-legacy
 */

import path from 'node:path'
import fs from 'node:fs'
import { getDb } from '../db/client'
import { projects, subfolders, timeEntries, config } from '../db/schema'

const ROOT = path.resolve(__dirname, '..')
const DB_PATH = path.join(ROOT, 'data', 'geniksuite.db')
const LEGACY_DIR = path.resolve(ROOT, '..', 'GenikAccess')

interface LegacyProject {
  path?: string
  comment?: string
}

interface LegacyConfig {
  ROOT_PROJECTS?: string
  SUBFOLDERS?: Array<{ name: string; path: string }>
}

async function main() {
  console.info(`📦 Import depuis : ${LEGACY_DIR}`)
  console.info(`📦 Vers          : ${DB_PATH}`)

  if (!fs.existsSync(LEGACY_DIR)) {
    console.error(`❌ Dossier introuvable : ${LEGACY_DIR}`)
    process.exit(1)
  }

  const db = getDb(DB_PATH)

  // --- 1. Config -----------------------------------------------------------
  const configPath = path.join(LEGACY_DIR, 'config.json')
  if (fs.existsSync(configPath)) {
    const cfg: LegacyConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    if (cfg.ROOT_PROJECTS) {
      await upsertConfig(db, 'rootProjects', cfg.ROOT_PROJECTS)
      console.info(`  ✅ rootProjects = ${cfg.ROOT_PROJECTS}`)
    }
    if (Array.isArray(cfg.SUBFOLDERS)) {
      let i = 0
      for (const sub of cfg.SUBFOLDERS) {
        await db
          .insert(subfolders)
          .values({
            name: sub.name,
            relativePath: sub.path,
            position: i++,
            enabled: true
          })
          .onConflictDoNothing()
      }
      console.info(`  ✅ ${cfg.SUBFOLDERS.length} sous-dossier(s) importé(s)`)
    }
  } else {
    console.warn(`  ⚠️ config.json absent — défauts utilisés`)
  }

  // --- 2. Projets ----------------------------------------------------------
  const projetsPath = path.join(LEGACY_DIR, 'projets.json')
  if (fs.existsSync(projetsPath)) {
    const raw = JSON.parse(fs.readFileSync(projetsPath, 'utf-8'))
    if (Array.isArray(raw)) {
      // Format ancien (ChronoTrack) : juste une liste de strings
      for (const item of raw) {
        const num = String(item).trim()
        if (!num) continue
        await db.insert(projects).values({ number: num }).onConflictDoNothing()
      }
      console.info(`  ✅ ${raw.length} projet(s) importé(s) (format liste)`)
    } else if (typeof raw === 'object') {
      // Format GenikAccess : dict { "17528": { path, comment } }
      const entries = Object.entries(raw as Record<string, LegacyProject>)
      for (const [num, info] of entries) {
        await db
          .insert(projects)
          .values({
            number: num,
            comment: info.comment ?? '',
            path: info.path ?? ''
          })
          .onConflictDoNothing()
      }
      console.info(`  ✅ ${entries.length} projet(s) importé(s)`)
    }
  } else {
    console.warn(`  ⚠️ projets.json absent`)
  }

  // --- 3. Feuille de temps -------------------------------------------------
  const csvPath = path.join(LEGACY_DIR, 'feuilles_de_temps.csv')
  if (fs.existsSync(csvPath)) {
    const raw = fs.readFileSync(csvPath, 'utf-8')
    const lines = raw.split(/\r?\n/).filter((l) => l.trim())
    if (lines.length > 1) {
      // CSV : Date,Heure début,Heure fin,Projet,Commentaire (séparateur ,)
      let imported = 0
      for (const line of lines.slice(1)) {
        const cols = parseCsvLine(line)
        if (cols.length < 5) continue
        const [date, start, end, projectNumber, comment] = cols
        const durationMin = computeDurationMin(start, end)
        if (durationMin <= 0) continue
        await db.insert(timeEntries).values({
          projectNumber,
          date,
          startTime: start,
          endTime: end,
          durationMin,
          comment: comment ?? ''
        })
        imported++
      }
      console.info(`  ✅ ${imported} entrée(s) de temps importée(s)`)
    }
  } else {
    console.warn(`  ⚠️ feuilles_de_temps.csv absent`)
  }

  console.info('\n🎉 Import terminé.')
}

/** Parse une ligne CSV (séparateur , ou ; avec quotes optionnels). */
function parseCsvLine(line: string): string[] {
  const sep = line.includes(';') && !line.includes('","') ? ';' : ','
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      inQuotes = !inQuotes
      continue
    }
    if (c === sep && !inQuotes) {
      out.push(cur.trim())
      cur = ''
      continue
    }
    cur += c
  }
  out.push(cur.trim())
  return out
}

function computeDurationMin(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return 0
  return eh * 60 + em - (sh * 60 + sm)
}

async function upsertConfig(
  db: ReturnType<typeof getDb>,
  key: string,
  value: string
) {
  const { eq } = await import('drizzle-orm')
  const existing = await db.select().from(config).where(eq(config.key, key)).limit(1)
  if (existing[0]) {
    await db.update(config).set({ value }).where(eq(config.key, key))
  } else {
    await db.insert(config).values({ key, value })
  }
}

main().catch((err) => {
  console.error('❌ Erreur :', err)
  process.exit(1)
})
