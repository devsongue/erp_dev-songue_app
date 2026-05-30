import { Link, createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { LockKeyhole, Mail } from 'lucide-react'
import * as React from 'react'
import { getInstallationState, login } from '~/server/auth'

export const Route = createFileRoute('/login')({
  validateSearch: (search) => ({
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
  }),
  beforeLoad: async () => {
    const installation = await getInstallationState()
    if (installation.needsSetup) {
      throw redirect({ to: '/register' })
    }
  },
  component: LoginPage,
})

function LoginPage() {
  const navigate = useNavigate()
  const search = Route.useSearch()
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)

    const result = await login({ data: { email, password } })
    setIsSubmitting(false)

    if (result.needsSetup) {
      await navigate({ to: '/register' })
      return
    }

    if (!result.ok) {
      setError(result.message)
      return
    }

    window.location.href = search.redirect ?? result.redirectTo
  }

  return (
    <AuthFrame>
      <form onSubmit={handleSubmit} className="w-full">
        <BrandMark />

        <div className="mt-8">
          <h1 className="text-2xl font-bold text-slate-950 dark:text-slate-50">Connexion</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Entrez dans votre espace de travail.</p>
        </div>

        <div className="mt-7 grid gap-4">
          <Field icon={Mail} label="Email" value={email} onChange={setEmail} type="email" autoComplete="email" placeholder="nom@entreprise.com" />
          <Field icon={LockKeyhole} label="Mot de passe" value={password} onChange={setPassword} type="password" autoComplete="current-password" placeholder="Votre mot de passe" />

          {error ? (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-1 inline-flex h-11 items-center justify-center rounded bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-emerald-400 dark:text-slate-950 dark:hover:bg-emerald-300"
          >
            {isSubmitting ? 'Connexion...' : 'Se connecter'}
          </button>
        </div>

        <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
          Premiere utilisation ?{' '}
          <Link to="/register" className="font-semibold text-slate-950 hover:underline dark:text-emerald-300">
            Creer l'espace entreprise
          </Link>
        </p>
      </form>
    </AuthFrame>
  )
}

function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4 py-8 text-slate-950 dark:bg-slate-950 dark:text-slate-50">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
        {children}
      </section>
    </main>
  )
}

function BrandMark() {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-10 place-items-center rounded bg-slate-950 text-sm font-bold text-white dark:bg-emerald-400 dark:text-slate-950">
        GP
      </span>
      <div>
        <p className="text-sm font-bold text-slate-950 dark:text-slate-50">Gestion PME</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">Application de gestion</p>
      </div>
    </div>
  )
}

function Field({
  icon: Icon,
  label,
  value,
  onChange,
  type,
  autoComplete,
  placeholder,
}: {
  icon: typeof Mail
  label: string
  value: string
  onChange: (value: string) => void
  type: string
  autoComplete: string
  placeholder: string
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</span>
      <span className="flex h-11 items-center gap-2 rounded border border-slate-300 bg-white px-3 focus-within:border-slate-950 dark:border-slate-700 dark:bg-slate-950 dark:focus-within:border-emerald-300">
        <Icon className="size-4 text-slate-500 dark:text-slate-400" />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full bg-transparent text-sm text-slate-950 outline-none placeholder:text-slate-400 dark:text-slate-50 dark:placeholder:text-slate-500"
          autoComplete={autoComplete}
          placeholder={placeholder}
          type={type}
          required
        />
      </span>
    </label>
  )
}
