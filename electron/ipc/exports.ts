import { BrowserWindow, dialog, shell, type IpcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import ExcelJS from 'exceljs'
import PDFDocument from 'pdfkit'
import { between, asc } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { timeEntries, projects } from '../../db/schema'
import { IPC, type ExportResult } from '../../src/shared/types'

interface ExportPayload {
  from: string
  to: string
}

interface EntryRow {
  date: string
  startTime: string
  endTime: string
  projectNumber: string
  projectComment: string
  comment: string
  durationMin: number
}

const ORANGE_HEX = 'F7931E'

async function loadEntries(
  db: BetterSQLite3Database<Record<string, unknown>>,
  from: string,
  to: string
): Promise<{ rows: EntryRow[]; commentByNumber: Map<string, string> }> {
  const [entryRows, projectRows] = await Promise.all([
    db
      .select()
      .from(timeEntries)
      .where(between(timeEntries.date, from, to))
      .orderBy(asc(timeEntries.date), asc(timeEntries.startTime)),
    db.select({ number: projects.number, comment: projects.comment }).from(projects)
  ])

  const commentByNumber = new Map<string, string>(
    projectRows.map((p) => [p.number, p.comment ?? ''])
  )

  const rows: EntryRow[] = entryRows.map((e) => ({
    date: e.date,
    startTime: e.startTime,
    endTime: e.endTime,
    projectNumber: e.projectNumber ?? '',
    projectComment: commentByNumber.get(e.projectNumber ?? '') ?? '',
    comment: e.comment ?? '',
    durationMin: e.durationMin
  }))

  return { rows, commentByNumber }
}

function totalsByProject(rows: EntryRow[]): Map<string, number> {
  const totals = new Map<string, number>()
  for (const r of rows) {
    const key = r.projectNumber || '—'
    totals.set(key, (totals.get(key) ?? 0) + r.durationMin)
  }
  return totals
}

function formatHmin(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${h}h ${String(m).padStart(2, '0')}m`
}

async function askSavePath(
  defaultName: string,
  filterName: string,
  ext: string
): Promise<string | null> {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  const result = await dialog.showSaveDialog(win ?? undefined!, {
    defaultPath: defaultName,
    filters: [{ name: filterName, extensions: [ext] }]
  })
  if (result.canceled || !result.filePath) return null
  return result.filePath
}

async function generateExcel(
  filePath: string,
  from: string,
  to: string,
  rows: EntryRow[]
): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'GenikSuite'
  wb.created = new Date()

  const sheet = wb.addWorksheet('Feuille de temps')

  sheet.columns = [
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Début', key: 'start', width: 8 },
    { header: 'Fin', key: 'end', width: 8 },
    { header: '# Projet', key: 'projectNumber', width: 12 },
    { header: 'Description projet', key: 'projectComment', width: 32 },
    { header: 'Commentaire', key: 'comment', width: 40 },
    { header: 'Durée (min)', key: 'durationMin', width: 12 }
  ]

  const headerRow = sheet.getRow(1)
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: `FF${ORANGE_HEX}` }
  }
  headerRow.alignment = { vertical: 'middle' }
  headerRow.height = 20

  for (const r of rows) {
    sheet.addRow({
      date: r.date,
      start: r.startTime,
      end: r.endTime,
      projectNumber: r.projectNumber,
      projectComment: r.projectComment,
      comment: r.comment,
      durationMin: r.durationMin
    })
  }

  // Lignes finales : totaux par projet
  sheet.addRow([])
  const totalsHeader = sheet.addRow(['Total par projet'])
  totalsHeader.font = { bold: true }

  const totals = totalsByProject(rows)
  const totalProjectNumbers = Array.from(totals.keys()).sort()
  for (const pn of totalProjectNumbers) {
    const min = totals.get(pn)!
    sheet.addRow([
      pn,
      '',
      '',
      '',
      pn !== '—' ? rows.find((r) => r.projectNumber === pn)?.projectComment ?? '' : '',
      '',
      min
    ])
  }

  // Période en haut, mais via le nom du fichier — sheet header optionnel
  await wb.xlsx.writeFile(filePath)
  // Le paramètre to/from est implicite dans le nom du fichier, pas besoin de l'écrire dans la feuille.
  void from
  void to
}

function generatePdf(
  filePath: string,
  from: string,
  to: string,
  rows: EntryRow[]
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 })
    const stream = fs.createWriteStream(filePath)
    stream.on('finish', () => resolve())
    stream.on('error', (err) => reject(err))
    doc.pipe(stream)

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right
    const left = doc.page.margins.left

    // Colonnes en points (total ≈ pageWidth)
    const cols = [
      { key: 'date', label: 'Date', width: 60 },
      { key: 'start', label: 'Début', width: 45 },
      { key: 'end', label: 'Fin', width: 45 },
      { key: 'projectNumber', label: '# Projet', width: 50 },
      { key: 'projectComment', label: 'Description', width: 110 },
      { key: 'comment', label: 'Commentaire', width: 145 },
      { key: 'durationMin', label: 'Durée', width: 60 }
    ] as const

    // Ajuste la dernière colonne pour combler la largeur dispo exactement
    const sumCols = cols.reduce((a, c) => a + c.width, 0)
    if (sumCols !== pageWidth) {
      const delta = pageWidth - sumCols
      ;(cols[cols.length - 1] as { width: number }).width += delta
    }

    // Titre + sous-titre
    doc.font('Helvetica-Bold').fontSize(16).fillColor('#000000')
    doc.text('Feuille de temps GenikSuite', { align: 'left' })
    doc.moveDown(0.2)
    doc.font('Helvetica').fontSize(10).fillColor('#444444')
    doc.text(`Période : du ${from} au ${to}`)
    doc.moveDown(0.6)

    function drawHeader() {
      const y = doc.y
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#000000')
      let x = left
      for (const c of cols) {
        doc.text(c.label, x + 2, y + 2, { width: c.width - 4 })
        x += c.width
      }
      const rowH = 14
      // Ligne séparation
      doc
        .moveTo(left, y + rowH)
        .lineTo(left + pageWidth, y + rowH)
        .lineWidth(0.5)
        .strokeColor('#888888')
        .stroke()
      doc.y = y + rowH + 2
    }

    function drawRow(r: EntryRow) {
      const rowH = 14
      // Si plus de place, nouvelle page + redessine header
      if (doc.y + rowH > doc.page.height - doc.page.margins.bottom - 40) {
        doc.addPage()
        drawHeader()
      }
      const y = doc.y
      doc.font('Helvetica').fontSize(9).fillColor('#000000')
      let x = left
      const values: Record<string, string> = {
        date: r.date,
        start: r.startTime,
        end: r.endTime,
        projectNumber: r.projectNumber || '—',
        projectComment: r.projectComment,
        comment: r.comment,
        durationMin: String(r.durationMin)
      }
      for (const c of cols) {
        doc.text(values[c.key] ?? '', x + 2, y + 2, {
          width: c.width - 4,
          height: rowH,
          ellipsis: true
        })
        x += c.width
      }
      // Ligne fine sous chaque ligne
      doc
        .moveTo(left, y + rowH)
        .lineTo(left + pageWidth, y + rowH)
        .lineWidth(0.25)
        .strokeColor('#dddddd')
        .stroke()
      doc.y = y + rowH
    }

    drawHeader()
    for (const r of rows) {
      drawRow(r)
    }

    // Totaux par projet
    doc.moveDown(1)
    if (doc.y + 60 > doc.page.height - doc.page.margins.bottom) {
      doc.addPage()
    }
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#000000')
    doc.text('Totaux par projet')
    doc.moveDown(0.3)
    doc.font('Helvetica').fontSize(10).fillColor('#222222')
    const totals = totalsByProject(rows)
    const numbers = Array.from(totals.keys()).sort()
    for (const pn of numbers) {
      const min = totals.get(pn)!
      const projectComment = rows.find((r) => r.projectNumber === pn)?.projectComment ?? ''
      const label = projectComment ? ` - ${projectComment}` : ''
      doc.text(`[${pn}]${label} : ${formatHmin(min)}`)
    }

    // Footer : date d'export en bas de la page courante
    const footerY = doc.page.height - doc.page.margins.bottom - 12
    doc
      .font('Helvetica-Oblique')
      .fontSize(8)
      .fillColor('#888888')
      .text(`Exporté le ${new Date().toLocaleString('fr-CA')}`, left, footerY, {
        width: pageWidth,
        align: 'right'
      })

    doc.end()
  })
}

export function registerExportHandlers(
  ipcMain: IpcMain,
  db: BetterSQLite3Database<Record<string, unknown>>
) {
  ipcMain.handle(
    IPC.TimesheetExportExcel,
    async (_e, payload: ExportPayload): Promise<ExportResult> => {
      try {
        const { rows } = await loadEntries(db, payload.from, payload.to)
        const defaultName = `GenikSuite_FeuilleDeTemps_${payload.from}_au_${payload.to}.xlsx`
        const filePath = await askSavePath(defaultName, 'Classeur Excel', 'xlsx')
        if (!filePath) return { ok: false, cancelled: true }
        await generateExcel(filePath, payload.from, payload.to, rows)
        return { ok: true, path: filePath }
      } catch (err) {
        console.error('Export Excel a échoué :', err)
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  ipcMain.handle(
    IPC.TimesheetExportPdf,
    async (_e, payload: ExportPayload): Promise<ExportResult> => {
      try {
        const { rows } = await loadEntries(db, payload.from, payload.to)
        const defaultName = `GenikSuite_FeuilleDeTemps_${payload.from}_au_${payload.to}.pdf`
        const filePath = await askSavePath(defaultName, 'Document PDF', 'pdf')
        if (!filePath) return { ok: false, cancelled: true }
        await generatePdf(filePath, payload.from, payload.to, rows)
        return { ok: true, path: filePath }
      } catch (err) {
        console.error('Export PDF a échoué :', err)
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  // Ouvre un fichier (ou un dossier) avec l'app par défaut du système.
  // Utilisé par le renderer après un export pour ouvrir le fichier généré.
  ipcMain.handle(
    IPC.ShellOpenPath,
    async (_e, targetPath: string): Promise<{ ok: boolean; error?: string }> => {
      if (!targetPath) return { ok: false, error: 'empty_path' }
      const resolved = path.normalize(targetPath)
      if (!fs.existsSync(resolved)) return { ok: false, error: 'not_found' }
      const error = await shell.openPath(resolved)
      if (error) return { ok: false, error }
      return { ok: true }
    }
  )
}
