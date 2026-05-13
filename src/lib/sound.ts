/**
 * Génère un son de notification courte (2 notes montantes type "ding"),
 * sans dépendre d'un fichier audio externe.
 *
 * Pourquoi Web Audio plutôt qu'un MP3 : pas de fichier à bundler,
 * latence nulle, son net même si le PC est silencieux.
 */

let _ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!_ctx) {
    try {
      _ctx = new AudioContext()
    } catch {
      return null
    }
  }
  // Le contexte démarre parfois suspendu (politiques navigateur) — on tente de le réveiller.
  if (_ctx.state === 'suspended') void _ctx.resume()
  return _ctx
}

/**
 * Joue un "ding" (deux notes 880 Hz → 1175 Hz, ~250 ms total).
 * Pas d'erreur lancée si l'audio est indispo — log discret.
 */
export function playPopupBeep(): void {
  try {
    const ctx = getCtx()
    if (!ctx) return
    const t0 = ctx.currentTime
    playNote(ctx, 880, t0, 0.14, 0.18)
    playNote(ctx, 1175, t0 + 0.12, 0.16, 0.18)
  } catch (err) {
    console.warn('playPopupBeep:', err)
  }
}

function playNote(
  ctx: AudioContext,
  freq: number,
  start: number,
  duration: number,
  volume: number
) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq

  // Enveloppe ADSR simplifiée pour éviter les clics
  gain.gain.setValueAtTime(0, start)
  gain.gain.linearRampToValueAtTime(volume, start + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration)

  osc.connect(gain).connect(ctx.destination)
  osc.start(start)
  osc.stop(start + duration + 0.02)
}
