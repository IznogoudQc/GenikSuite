import type { ReactNode } from 'react'

/**
 * Carte blanche avec ombre douce. Brique de base du look Kinésio.
 */
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`bg-white rounded-xl border border-zinc-200 shadow-sm ${className}`}
    >
      {children}
    </div>
  )
}
