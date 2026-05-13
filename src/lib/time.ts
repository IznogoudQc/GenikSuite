/**
 * Utilitaires de manipulation de dates/heures pour la feuille de temps.
 * Pas de dépendance externe : tout en Date natif.
 */

/** Retourne la date du lundi de la semaine contenant `d` (en local time). */
export function mondayOf(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  const day = out.getDay() // 0=dim, 1=lun, ..., 6=sam
  const diff = day === 0 ? -6 : 1 - day
  out.setDate(out.getDate() + diff)
  return out
}

/** Format YYYY-MM-DD en local. */
export function fmtDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Format HH:MM en local. */
export function fmtTime(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

/** Arrondi inférieur à l'intervalle (en minutes). */
export function floorToInterval(d: Date, intervalMin: number): Date {
  const out = new Date(d)
  out.setSeconds(0, 0)
  const m = Math.floor(out.getMinutes() / intervalMin) * intervalMin
  out.setMinutes(m)
  return out
}

/** Arrondi supérieur à l'intervalle. */
export function ceilToInterval(d: Date, intervalMin: number): Date {
  const floored = floorToInterval(d, intervalMin)
  if (floored.getTime() === d.getTime()) return floored
  return new Date(floored.getTime() + intervalMin * 60_000)
}

/** Ajoute n jours à une date (retourne une nouvelle Date). */
export function addDays(d: Date, n: number): Date {
  const out = new Date(d)
  out.setDate(out.getDate() + n)
  return out
}

/** Convertit "HH:MM" + date → Date. */
export function parseTime(date: string, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number)
  const [yy, mm, dd] = date.split('-').map(Number)
  return new Date(yy, mm - 1, dd, h, m, 0, 0)
}
