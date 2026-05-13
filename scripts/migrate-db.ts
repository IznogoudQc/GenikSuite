/**
 * Applique les migrations Drizzle générées par `drizzle-kit generate`.
 *
 * Pour le moment, le bootstrap dans db/client.ts suffit pour le dev.
 * Ce script servira quand on aura des migrations versionnées.
 */

import path from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { getDb } from '../db/client'

const DB_PATH = path.resolve(__dirname, '..', 'data', 'geniksuite.db')
const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'db', 'migrations')

const db = getDb(DB_PATH)
migrate(db, { migrationsFolder: MIGRATIONS_DIR })

console.info('✅ Migrations appliquées')
