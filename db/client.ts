import path from 'node:path'
import fs from 'node:fs'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'

let _db: BetterSQLite3Database<typeof schema> | null = null
let _sqlite: Database.Database | null = null

/**
 * Retourne le client Drizzle. Crée le fichier SQLite s'il n'existe pas
 * et applique le bootstrap minimal (CREATE TABLE IF NOT EXISTS).
 *
 * @param dbPath - Chemin absolu vers le fichier .db
 */
export function getDb(dbPath: string) {
  if (_db) return _db

  // Crée le dossier parent si nécessaire
  const dir = path.dirname(dbPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  _sqlite = new Database(dbPath)
  _sqlite.pragma('journal_mode = WAL')
  _sqlite.pragma('foreign_keys = ON')

  _db = drizzle(_sqlite, { schema })
  bootstrap(_sqlite)
  return _db
}

export function closeDb() {
  _sqlite?.close()
  _sqlite = null
  _db = null
}

/**
 * Bootstrap minimal : crée les tables si absentes.
 * Pour les migrations propres, utiliser drizzle-kit.
 */
function bootstrap(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number TEXT NOT NULL,
      comment TEXT DEFAULT '',
      path TEXT DEFAULT '',
      color TEXT,
      is_pinned INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );
    CREATE UNIQUE INDEX IF NOT EXISTS projects_number_idx ON projects(number);

    CREATE TABLE IF NOT EXISTS subfolders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      position INTEGER DEFAULT 0,
      enabled INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS time_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
      project_number TEXT DEFAULT '',
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      duration_min INTEGER NOT NULL,
      comment TEXT DEFAULT '',
      created_at INTEGER DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS time_entries_date_idx ON time_entries(date);
    CREATE INDEX IF NOT EXISTS time_entries_project_idx ON time_entries(project_number, date);

    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)

  // Migrations légères pour les bases déjà créées avant l'ajout d'une colonne.
  ensureColumn(sqlite, 'projects', 'color', 'TEXT')
}

/**
 * Ajoute une colonne à une table existante si elle n'y est pas déjà.
 * SQLite ne supporte pas `ADD COLUMN IF NOT EXISTS` — on vérifie via PRAGMA.
 */
function ensureColumn(
  sqlite: Database.Database,
  table: string,
  column: string,
  type: string
) {
  const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  if (!cols.some((c) => c.name === column)) {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`)
  }
}

export { schema }
