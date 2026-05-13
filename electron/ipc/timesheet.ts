import type { IpcMain } from 'electron'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { and, between, desc, eq, sql } from 'drizzle-orm'
import { timeEntries, projects } from '../../db/schema'
import {
  IPC,
  type TimeEntryDTO,
  type NewTimeEntryDTO,
  type ProjectBlockSummary
} from '../../src/shared/types'

function toDTO(e: typeof timeEntries.$inferSelect): TimeEntryDTO {
  return {
    id: e.id,
    projectNumber: e.projectNumber ?? '',
    date: e.date,
    startTime: e.startTime,
    endTime: e.endTime,
    durationMin: e.durationMin,
    comment: e.comment ?? ''
  }
}

export function registerTimesheetHandlers(
  ipcMain: IpcMain,
  db: BetterSQLite3Database<Record<string, unknown>>
) {
  /**
   * Liste les entrées de temps sur une plage de dates (inclusive).
   * Si pas de plage, retourne les 100 dernières entrées.
   */
  ipcMain.handle(
    IPC.TimeEntriesList,
    async (_e, payload?: { from?: string; to?: string }): Promise<TimeEntryDTO[]> => {
      if (payload?.from && payload?.to) {
        const rows = await db
          .select()
          .from(timeEntries)
          .where(between(timeEntries.date, payload.from, payload.to))
          .orderBy(timeEntries.date, timeEntries.startTime)
        return rows.map(toDTO)
      }
      const rows = await db
        .select()
        .from(timeEntries)
        .orderBy(desc(timeEntries.date), desc(timeEntries.startTime))
        .limit(100)
      return rows.map(toDTO)
    }
  )

  ipcMain.handle(IPC.TimeEntryAdd, async (_e, payload: NewTimeEntryDTO): Promise<TimeEntryDTO> => {
    // Tentative de liaison projet_id si le numéro existe en base
    let projectId: number | null = null
    if (payload.projectNumber) {
      const p = await db
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.number, payload.projectNumber))
        .limit(1)
      projectId = p[0]?.id ?? null
    }

    const inserted = await db
      .insert(timeEntries)
      .values({
        projectId,
        projectNumber: payload.projectNumber,
        date: payload.date,
        startTime: payload.startTime,
        endTime: payload.endTime,
        durationMin: payload.durationMin,
        comment: payload.comment ?? ''
      })
      .returning()

    return toDTO(inserted[0])
  })

  ipcMain.handle(
    IPC.TimeEntryUpdate,
    async (_e, payload: { id: number } & Partial<NewTimeEntryDTO>): Promise<TimeEntryDTO> => {
      const { id, ...rest } = payload
      const updated = await db
        .update(timeEntries)
        .set(rest)
        .where(eq(timeEntries.id, id))
        .returning()
      return toDTO(updated[0])
    }
  )

  ipcMain.handle(IPC.TimeEntryDelete, async (_e, id: number): Promise<boolean> => {
    await db.delete(timeEntries).where(eq(timeEntries.id, id))
    return true
  })

  /**
   * Efface TOUTES les entrées de temps (le « compte-rendu »).
   * Action irréversible : la confirmation est demandée côté renderer.
   */
  ipcMain.handle(IPC.TimeEntriesClear, async (): Promise<boolean> => {
    await db.delete(timeEntries)
    return true
  })

  /**
   * Agrégation : nombre de blocs et total minutes par projet sur une plage.
   * C'est LA requête qui répond à "combien de 30min sur le projet 17528 cette semaine".
   */
  ipcMain.handle(
    IPC.TimeSummaryByProject,
    async (_e, payload: { from: string; to: string }): Promise<ProjectBlockSummary[]> => {
      const rows = await db
        .select({
          projectNumber: timeEntries.projectNumber,
          blocks: sql<number>`COUNT(*)`,
          totalMinutes: sql<number>`COALESCE(SUM(${timeEntries.durationMin}), 0)`
        })
        .from(timeEntries)
        .where(
          and(
            between(timeEntries.date, payload.from, payload.to),
            sql`${timeEntries.projectNumber} != ''`
          )
        )
        .groupBy(timeEntries.projectNumber)

      // Récupère les commentaires de projet en une passe
      const allProjects = await db
        .select({ number: projects.number, comment: projects.comment })
        .from(projects)
      const commentByNumber = new Map(allProjects.map((p) => [p.number, p.comment ?? '']))

      return rows.map((r) => ({
        projectNumber: r.projectNumber ?? '',
        comment: commentByNumber.get(r.projectNumber ?? '') ?? '',
        blocks: Number(r.blocks),
        totalMinutes: Number(r.totalMinutes)
      }))
    }
  )
}
