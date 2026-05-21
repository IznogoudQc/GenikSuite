// Couleurs de projet, partagées entre BlockCounter et WeekCalendar.
// Un projet a la même couleur partout : soit sa couleur custom (DB),
// soit une couleur déterministe issue du hash de son numéro.

/** Palette de 12 couleurs (Tailwind ~400) attribuées par défaut. */
export const PROJECT_PALETTE = [
  '#fb923c', // orange-400
  '#60a5fa', // blue-400
  '#34d399', // emerald-400
  '#a78bfa', // violet-400
  '#f472b6', // pink-400
  '#facc15', // yellow-400
  '#fb7185', // rose-400
  '#22d3ee', // cyan-400
  '#a3e635', // lime-400
  '#fbbf24', // amber-400
  '#e879f9', // fuchsia-400
  '#94a3b8'  // slate-400
] as const

/** Hash déterministe d'une chaîne (même algo que le reste du projet). */
function hashString(s: string): number {
  let hash = 0
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

/**
 * Couleur d'un projet : sa couleur custom si définie, sinon une couleur
 * déterministe de la palette basée sur le hash du numéro.
 */
export function colorForProject(p: { number: string; color?: string | null }): string {
  if (p.color) return p.color
  return PROJECT_PALETTE[hashString(p.number) % PROJECT_PALETTE.length]
}

/**
 * Couleur de texte lisible sur un fond donné (#rrggbb) : sombre sur fond
 * clair, blanc sur fond foncé — utile avec une palette pastel/saturée.
 */
export function textColorOn(bg: string): string {
  const hex = bg.replace('#', '')
  if (hex.length !== 6) return '#ffffff'
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.62 ? '#1f2937' : '#ffffff'
}
