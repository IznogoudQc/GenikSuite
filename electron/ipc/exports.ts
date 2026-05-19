import { BrowserWindow, dialog, shell, type IpcMain } from 'electron'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import ExcelJS from 'exceljs'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
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

  await wb.xlsx.writeFile(filePath)
  void from
  void to
}

// Tronque une chaîne pour qu'elle tienne dans maxWidth (en points) avec la police donnée.
function fitText(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (!text) return ''
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text
  const ellipsis = '…'
  let lo = 0
  let hi = text.length
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2)
    const candidate = text.slice(0, mid) + ellipsis
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      lo = mid
    } else {
      hi = mid - 1
    }
  }
  return lo === 0 ? ellipsis : text.slice(0, lo) + ellipsis
}

async function generatePdf(
  filePath: string,
  from: string,
  to: string,
  rows: EntryRow[]
): Promise<void> {
  const pdf = await PDFDocument.create()
  const helv = await pdf.embedFont(StandardFonts.Helvetica)
  const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const helvOblique = await pdf.embedFont(StandardFonts.HelveticaOblique)

  // A4 portrait en points (1pt = 1/72")
  const PAGE_W = 595.28
  const PAGE_H = 841.89
  const MARGIN = 40
  const left = MARGIN
  const right = PAGE_W - MARGIN
  const pageWidth = right - left

  type Col = { key: keyof EntryRow | 'durationLabel'; label: string; width: number }
  const cols: Col[] = [
    { key: 'date', label: 'Date', width: 60 },
    { key: 'startTime', label: 'Début', width: 45 },
    { key: 'endTime', label: 'Fin', width: 45 },
    { key: 'projectNumber', label: '# Projet', width: 50 },
    { key: 'projectComment', label: 'Description', width: 110 },
    { key: 'comment', label: 'Commentaire', width: 145 },
    { key: 'durationLabel', label: 'Durée', width: 60 }
  ]
  // Ajuste la dernière colonne pour combler la largeur dispo exactement
  const sumCols = cols.reduce((a, c) => a + c.width, 0)
  if (sumCols !== pageWidth) {
    cols[cols.length - 1].width += pageWidth - sumCols
  }

  const ROW_H = 14
  const FOOTER_RESERVE = 40

  let page: PDFPage = pdf.addPage([PAGE_W, PAGE_H])
  // y descend depuis le haut de la page (pdf-lib utilise un repère bas-gauche)
  let y = PAGE_H - MARGIN

  function drawTitle() {
    page.drawText('Feuille de temps GenikSuite', {
      x: left,
      y: y - 14,
      size: 16,
      font: helvBold,
      color: rgb(0, 0, 0)
    })
    y -= 22
    page.drawText(`Période : du ${from} au ${to}`, {
      x: left,
      y: y - 10,
      size: 10,
      font: helv,
      color: rgb(0.27, 0.27, 0.27)
    })
    y -= 22
  }

  function drawTableHeader() {
    let x = left
    for (const c of cols) {
      page.drawText(c.label, {
        x: x + 2,
        y: y - 10,
        size: 9,
        font: helvBold,
        color: rgb(0, 0, 0)
      })
      x += c.width
    }
    y -= ROW_H
    page.drawLine({
      start: { x: left, y },
      end: { x: right, y },
      thickness: 0.5,
      color: rgb(0.53, 0.53, 0.53)
    })
    y -= 2
  }

  function ensureSpaceForRow() {
    // Garde de la place pour la ligne courante + un peu pour le bas
    if (y - ROW_H < MARGIN + FOOTER_RESERVE) {
      page = pdf.addPage([PAGE_W, PAGE_H])
      y = PAGE_H - MARGIN
      drawTableHeader()
    }
  }

  function drawRow(r: EntryRow) {
    ensureSpaceForRow()
    const values: Record<string, string> = {
      date: r.date,
      startTime: r.startTime,
      endTime: r.endTime,
      projectNumber: r.projectNumber || '—',
      projectComment: r.projectComment,
      comment: r.comment,
      durationLabel: String(r.durationMin)
    }
    let x = left
    for (const c of cols) {
      const raw = values[c.key as string] ?? ''
      const text = fitText(raw, helv, 9, c.width - 4)
      page.drawText(text, {
        x: x + 2,
        y: y - 10,
        size: 9,
        font: helv,
        color: rgb(0, 0, 0)
      })
      x += c.width
    }
    y -= ROW_H
    page.drawLine({
      start: { x: left, y },
      end: { x: right, y },
      thickness: 0.25,
      color: rgb(0.87, 0.87, 0.87)
    })
  }

  drawTitle()
  drawTableHeader()
  for (const r of rows) {
    drawRow(r)
  }

  // Totaux par projet
  y -= 14
  if (y - 60 < MARGIN + FOOTER_RESERVE) {
    page = pdf.addPage([PAGE_W, PAGE_H])
    y = PAGE_H - MARGIN
  }
  page.drawText('Totaux par projet', {
    x: left,
    y: y - 11,
    size: 11,
    font: helvBold,
    color: rgb(0, 0, 0)
  })
  y -= 18

  const totals = totalsByProject(rows)
  const numbers = Array.from(totals.keys()).sort()
  for (const pn of numbers) {
    if (y - ROW_H < MARGIN + FOOTER_RESERVE) {
      page = pdf.addPage([PAGE_W, PAGE_H])
      y = PAGE_H - MARGIN
    }
    const min = totals.get(pn)!
    const projectComment = rows.find((r) => r.projectNumber === pn)?.projectComment ?? ''
    const label = projectComment ? ` - ${projectComment}` : ''
    page.drawText(`[${pn}]${label} : ${formatHmin(min)}`, {
      x: left,
      y: y - 10,
      size: 10,
      font: helv,
      color: rgb(0.13, 0.13, 0.13)
    })
    y -= ROW_H
  }

  // Footer : date d'export en bas-droite de la page courante
  const footerText = `Exporté le ${new Date().toLocaleString('fr-CA')}`
  const footerSize = 8
  const footerWidth = helvOblique.widthOfTextAtSize(footerText, footerSize)
  page.drawText(footerText, {
    x: right - footerWidth,
    y: MARGIN / 2,
    size: footerSize,
    font: helvOblique,
    color: rgb(0.53, 0.53, 0.53)
  })

  const bytes = await pdf.save()
  await fsp.writeFile(filePath, bytes)
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
