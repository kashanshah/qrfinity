import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'download' | 'secondary'

const styles: Record<Variant, string> = {
  primary: 'bg-evergreen text-on-evergreen hover:bg-evergreen-deep',
  download: 'bg-signal text-on-signal hover:brightness-95',
  secondary: 'bg-surface text-ink border-[1.5px] border-control-border hover:bg-surface-sunk',
}

export function Button({
  variant = 'secondary',
  icon,
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; icon?: ReactNode }) {
  return (
    <button
      type="button"
      {...props}
      className={`button inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-6 py-3 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
    >
      {icon}
      {children}
    </button>
  )
}
