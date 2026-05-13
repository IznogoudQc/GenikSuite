import type { ReactNode } from 'react'

/**
 * En-tête de page standard : titre à gauche, actions à droite, séparateur en bas.
 * Reproduit le style de Kinésio-tool.
 */
export function PageHeader({
  title,
  subtitle,
  actions
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
}) {
  return (
    <header className="bg-white border-b border-zinc-200 px-8 py-5 flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">{title}</h1>
        {subtitle && <p className="text-sm text-zinc-500 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  )
}
