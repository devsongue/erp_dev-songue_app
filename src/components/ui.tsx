import * as React from 'react'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// Briques d'interface partagees par les pages metier : memes modales, memes
// confirmations, memes notifications partout, au lieu d'une copie par page.

export const buttonClass = {
  primary: 'inline-flex h-10 items-center justify-center gap-2 rounded bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50',
  secondary: 'inline-flex h-10 items-center justify-center gap-2 rounded border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50',
  danger: 'inline-flex h-10 items-center justify-center gap-2 rounded bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50',
  icon: 'inline-flex size-8 items-center justify-center rounded border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-950 disabled:opacity-40',
  iconDanger: 'inline-flex size-8 items-center justify-center rounded border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-40',
}

export const inputClass = 'w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-950'

// Les erreurs metier levees par le serveur ("Client introuvable.") sont
// courtes et lisibles ; une erreur technique (Prisma, reseau, validation zod)
// ne doit pas etre montree telle quelle a l'utilisateur.
export function errorMessage(error: unknown, fallback = 'Une erreur est survenue. Réessaie dans un instant.') {
  const message = error instanceof Error ? error.message : ''
  if (!message || message.length > 240 || /prisma|invocation|\n|^\[|ZodError|Unexpected/i.test(message)) {
    if (message) console.error(error)
    return fallback
  }
  return message
}

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return '—'
  const date = typeof value === 'string' ? new Date(value) : value
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('fr-FR')
}

export function toDateInput(value: string | Date | null | undefined) {
  if (!value) return ''
  const date = typeof value === 'string' ? new Date(value) : value
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
}

export function PageHeader({ eyebrow, title, description, actions }: {
  eyebrow?: string
  title: string
  description?: string
  actions?: React.ReactNode
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{eyebrow}</p> : null}
        <h1 className="mt-1 text-2xl font-bold text-slate-950">{title}</h1>
        {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function StatCard({ title, value, detail, icon: Icon, tone = 'default' }: {
  title: string
  value: string
  detail?: string
  icon?: LucideIcon
  tone?: 'default' | 'alert' | 'success'
}) {
  const iconTone = tone === 'alert' ? 'text-rose-500' : tone === 'success' ? 'text-emerald-500' : 'text-slate-300'
  return (
    <div className="neon-surface rounded p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{title}</p>
        {Icon ? <Icon className={`size-4 ${iconTone}`} /> : null}
      </div>
      <p className="text-2xl font-bold text-slate-950">{value}</p>
      {detail ? <p className="mt-1 text-xs font-medium text-slate-500">{detail}</p> : null}
    </div>
  )
}

export function EmptyState({ icon: Icon, title, text, action }: {
  icon?: LucideIcon
  title: string
  text?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center px-5 py-12 text-center">
      {Icon ? (
        <span className="mb-3 grid size-11 place-items-center rounded-full bg-slate-100 text-slate-400">
          <Icon className="size-5" />
        </span>
      ) : null}
      <p className="font-bold text-slate-950">{title}</p>
      {text ? <p className="mt-1 max-w-sm text-sm text-slate-500">{text}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

const badgeTones = {
  slate: 'bg-slate-100 text-slate-700',
  green: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-rose-50 text-rose-700',
  blue: 'bg-sky-50 text-sky-700',
}

export function Badge({ tone = 'slate', children }: { tone?: keyof typeof badgeTones; children: React.ReactNode }) {
  return <span className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-bold ${badgeTones[tone]}`}>{children}</span>
}

const openModals: string[] = []

export function Modal({ title, description, onClose, children, size = 'md' }: {
  title: string
  description?: string
  onClose: () => void
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  const id = React.useId()
  const onCloseRef = React.useRef(onClose)
  onCloseRef.current = onClose

  React.useEffect(() => {
    // Pile des modales ouvertes : Echap ne ferme que celle du dessus (une
    // confirmation ouverte par-dessus une fiche, par exemple).
    openModals.push(id)
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && openModals[openModals.length - 1] === id) onCloseRef.current()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      openModals.splice(openModals.indexOf(id), 1)
      if (!openModals.length) document.body.style.overflow = ''
    }
  }, [id])

  const width = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-6xl' }[size]
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/40 px-3 py-6 sm:items-center sm:px-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <div className={`w-full ${width} rounded border border-slate-200 bg-white shadow-xl`}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-4 py-4 sm:px-5">
          <div>
            <h2 className="text-lg font-bold text-slate-950">{title}</h2>
            {description ? <p className="mt-0.5 text-sm text-slate-500">{description}</p> : null}
          </div>
          <button type="button" onClick={onClose} className={buttonClass.icon} aria-label="Fermer">
            <X className="size-4" />
          </button>
        </div>
        <div className="p-4 sm:p-5">{children}</div>
      </div>
    </div>
  )
}

export function Field({ label, hint, children, className = '' }: {
  label: string
  hint?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  )
}

export function FormActions({ onCancel, submitLabel = 'Enregistrer', pending = false }: {
  onCancel: () => void
  submitLabel?: string
  pending?: boolean
}) {
  return (
    <div className="mt-5 flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
      <button type="button" onClick={onCancel} className={buttonClass.secondary}>Annuler</button>
      <button type="submit" disabled={pending} className={buttonClass.primary}>{pending ? 'Enregistrement…' : submitLabel}</button>
    </div>
  )
}

// --- Confirmation -----------------------------------------------------------

type ConfirmOptions = {
  title: string
  message?: string
  confirmLabel?: string
  danger?: boolean
}

type ToastTone = 'success' | 'error' | 'info'
type Toast = { id: number; tone: ToastTone; message: string }

type FeedbackContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>
  notify: (message: string, tone?: ToastTone) => void
}

const FeedbackContext = React.createContext<FeedbackContextValue | null>(null)

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = React.useState<(ConfirmOptions & { resolve: (value: boolean) => void }) | null>(null)
  const [toasts, setToasts] = React.useState<Toast[]>([])
  const nextId = React.useRef(1)

  const confirm = React.useCallback((options: ConfirmOptions) => (
    new Promise<boolean>((resolve) => setPending({ ...options, resolve }))
  ), [])

  const notify = React.useCallback((message: string, tone: ToastTone = 'success') => {
    const id = nextId.current++
    setToasts((current) => [...current, { id, tone, message }])
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), tone === 'error' ? 6000 : 3500)
  }, [])

  function settle(value: boolean) {
    pending?.resolve(value)
    setPending(null)
  }

  const value = React.useMemo(() => ({ confirm, notify }), [confirm, notify])

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      {pending ? (
        <Modal title={pending.title} onClose={() => settle(false)} size="sm">
          <div className="flex gap-3">
            {pending.danger ? (
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-rose-50 text-rose-600">
                <AlertTriangle className="size-4" />
              </span>
            ) : null}
            <p className="text-sm text-slate-600">{pending.message ?? 'Confirmer cette action ?'}</p>
          </div>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => settle(false)} className={buttonClass.secondary}>Annuler</button>
            <button type="button" autoFocus onClick={() => settle(true)} className={pending.danger ? buttonClass.danger : buttonClass.primary}>
              {pending.confirmLabel ?? 'Confirmer'}
            </button>
          </div>
        </Modal>
      ) : null}
      <div className="pointer-events-none fixed inset-x-3 bottom-20 z-[60] flex flex-col items-center gap-2 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:items-end" aria-live="polite">
        {toasts.map((toast) => {
          const Icon = toast.tone === 'error' ? AlertTriangle : toast.tone === 'info' ? Info : CheckCircle2
          const tone = toast.tone === 'error' ? 'border-rose-200 text-rose-700' : toast.tone === 'info' ? 'border-slate-200 text-slate-700' : 'border-emerald-200 text-emerald-700'
          return (
            <div key={toast.id} role="status" className={`pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded border bg-white px-4 py-3 text-sm font-semibold shadow-lg ${tone}`}>
              <Icon className="mt-0.5 size-4 shrink-0" />
              <span>{toast.message}</span>
            </div>
          )
        })}
      </div>
    </FeedbackContext.Provider>
  )
}

export function useFeedback() {
  const context = React.useContext(FeedbackContext)
  if (!context) throw new Error('useFeedback doit etre utilise sous <FeedbackProvider>.')
  return context
}

// Execute une action serveur avec etat "en cours" et notification d'erreur.
export function useAction() {
  const { notify } = useFeedback()
  const [pending, setPending] = React.useState(false)
  const run = React.useCallback(async <T,>(action: () => Promise<T>, success?: string): Promise<T | undefined> => {
    setPending(true)
    try {
      const result = await action()
      if (success) notify(success)
      return result
    } catch (error) {
      notify(errorMessage(error), 'error')
      return undefined
    } finally {
      setPending(false)
    }
  }, [notify])
  return { run, pending }
}
