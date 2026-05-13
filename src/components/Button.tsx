import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  icon?: ReactNode
}

/**
 * Bouton stylé façon Kinésio-tool : arrondi, ombre légère, icône optionnelle.
 */
export function Button({
  variant = 'primary',
  icon,
  children,
  className = '',
  ...rest
}: Props) {
  const base =
    'inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed'

  const variants: Record<Variant, string> = {
    primary: 'bg-orange-500 hover:bg-orange-600 text-white shadow-sm',
    secondary: 'bg-white hover:bg-zinc-50 text-zinc-800 border border-zinc-200 shadow-sm',
    ghost: 'bg-transparent hover:bg-zinc-100 text-zinc-700',
    danger: 'bg-white hover:bg-red-50 text-red-600 border border-zinc-200'
  }

  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...rest}>
      {icon && <span className="text-base">{icon}</span>}
      {children}
    </button>
  )
}
