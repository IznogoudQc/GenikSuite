import type { IpcMain } from 'electron'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { eq } from 'drizzle-orm'
import { config } from '../../db/schema'
import { IPC } from '../../src/shared/types'

const DEFAULTS: Record<string, string> = {
  rootProjects: 'P:\\',
  intervalMinutes: '30',
  startHour: '8',
  startMinute: '0',
  soundEnabled: 'true'
}

export async function getConfigValue(
  db: BetterSQLite3Database<Record<string, unknown>>,
  key: string
): Promise<string> {
  const rows = await db.select().from(config).where(eq(config.key, key)).limit(1)
  return rows[0]?.value ?? DEFAULTS[key] ?? ''
}

export async function getRootProjects(
  db: BetterSQLite3Database<Record<string, unknown>>
): Promise<string> {
  return getConfigValue(db, 'rootProjects')
}

export function registerConfigHandlers(
  ipcMain: IpcMain,
  db: BetterSQLite3Database<Record<string, unknown>>
) {
  ipcMain.handle(IPC.ConfigGet, async (_e, key: string): Promise<string> => {
    return getConfigValue(db, key)
  })

  ipcMain.handle(
    IPC.ConfigSet,
    async (_e, payload: { key: string; value: string }): Promise<boolean> => {
      const existing = await db
        .select()
        .from(config)
        .where(eq(config.key, payload.key))
        .limit(1)

      if (existing[0]) {
        await db.update(config).set({ value: payload.value }).where(eq(config.key, payload.key))
      } else {
        await db.insert(config).values({ key: payload.key, value: payload.value })
      }
      return true
    }
  )
}
