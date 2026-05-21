import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

// ---------------------------------------------------------------------------
// Table `projects` — projets numérotés (ex: 17528) avec commentaire optionnel
// ---------------------------------------------------------------------------
export const projects = sqliteTable(
  'projects',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    number: text('number').notNull(),            // ex: "17528"
    comment: text('comment').default(''),        // libellé court
    path: text('path').default(''),              // chemin résolu (cache)
    color: text('color'),                        // couleur hex éditable (null = auto par hash)
    isPinned: integer('is_pinned', { mode: 'boolean' }).default(false),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`)
  },
  (t) => ({
    numberIdx: uniqueIndex('projects_number_idx').on(t.number)
  })
)

// ---------------------------------------------------------------------------
// Table `subfolders` — sous-dossiers ouvrables sous un projet (ex: "01-Plans")
// Partagé entre tous les projets, configurable depuis l'UI.
// ---------------------------------------------------------------------------
export const subfolders = sqliteTable('subfolders', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),                  // affiché à l'utilisateur
  relativePath: text('relative_path').notNull(), // ex: "01-Plans\\Mécanique"
  position: integer('position').default(0),      // ordre d'affichage
  enabled: integer('enabled', { mode: 'boolean' }).default(true)
})

// ---------------------------------------------------------------------------
// Table `time_entries` — blocs de temps (typiquement 30min) sur un projet
// ---------------------------------------------------------------------------
export const timeEntries = sqliteTable(
  'time_entries',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id').references(() => projects.id, { onDelete: 'set null' }),
    projectNumber: text('project_number').default(''), // copie pour requêtes rapides + entrées orphelines
    date: text('date').notNull(),                       // YYYY-MM-DD
    startTime: text('start_time').notNull(),            // HH:MM
    endTime: text('end_time').notNull(),                // HH:MM
    durationMin: integer('duration_min').notNull(),     // en minutes (ex: 30)
    comment: text('comment').default(''),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`)
  },
  (t) => ({
    dateIdx: index('time_entries_date_idx').on(t.date),
    projectIdx: index('time_entries_project_idx').on(t.projectNumber, t.date)
  })
)

// ---------------------------------------------------------------------------
// Table `config` — clé/valeur générique pour préférences utilisateur
// ---------------------------------------------------------------------------
export const config = sqliteTable('config', {
  key: text('key').primaryKey(),
  value: text('value').notNull()
})

// Types inférés pour TypeScript
export type Project = typeof projects.$inferSelect
export type NewProject = typeof projects.$inferInsert
export type Subfolder = typeof subfolders.$inferSelect
export type NewSubfolder = typeof subfolders.$inferInsert
export type TimeEntry = typeof timeEntries.$inferSelect
export type NewTimeEntry = typeof timeEntries.$inferInsert
