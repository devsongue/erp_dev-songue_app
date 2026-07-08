import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { LockKeyhole } from 'lucide-react'
import * as React from 'react'
import { getResetInfo, resetPassword } from '~/server/security'

export const Route = createFileRoute('/reset/$token')({
  loader: async ({ params }) => getResetInfo({ data: { token: params.token } }),
  component: ResetPage,
})

function ResetPage() {
  const { token } = Route.useParams()
  const info = Route.useLoaderData()
  const navigate = useNavigate()
  const [password, setPassword] = React.useState('')
  const [confirm, setConfirm] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [done, setDone] = React.useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (password.length < 10) {
      setError('Mot de passe de 10 caracteres minimum.')
      return
    }
    if (password !== confirm) {
      setError('Les deux mots de passe ne correspondent pas.')
      return
    }
    if (isSubmitting) return
    setIsSubmitting(true)
    setError(null)
    try {
      const result = await resetPassword({ data: { token, password } })
      if (!result.ok) {
        setError(result.message ?? 'Impossible de reinitialiser le mot de passe.')
        return
      }
      setDone(true)
      window.setTimeout(() => {
        void navigate({ to: '/login', search: { redirect: undefined } })
      }, 1500)
    } catch (submitError: any) {
      setError(submitError?.message ?? 'Impossible de reinitialiser le mot de passe.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4 py-8 text-slate-950 dark:bg-slate-950 dark:text-slate-50">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
        {!info.ok ? (
          <div>
            <h1 className="text-xl font-bold">Lien non valide</h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{info.message}</p>
            <Link to="/login" search={{ redirect: undefined }} className="mt-5 inline-flex h-10 items-center rounded bg-slate-950 px-4 text-sm font-semibold text-white dark:bg-emerald-400 dark:text-slate-950">
              Aller a la connexion
            </Link>
          </div>
        ) : done ? (
          <div>
            <h1 className="text-xl font-bold">Mot de passe modifie</h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Toutes les sessions ont ete deconnectees. Redirection vers la connexion...
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <h1 className="text-xl font-bold">Nouveau mot de passe</h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Pour le compte <span className="font-semibold text-slate-800 dark:text-slate-200">{info.maskedEmail}</span>. Ce lien est a usage unique.
            </p>

            <div className="mt-5 grid gap-4">
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Mot de passe (10 caracteres min.)</span>
                <span className="flex h-11 items-center gap-2 rounded border border-slate-300 bg-white px-3 focus-within:border-slate-950 dark:border-slate-700 dark:bg-slate-950">
                  <LockKeyhole className="size-4 text-slate-500" />
                  <input value={password} onChange={(event) => setPassword(event.target.value)} required minLength={10} type="password" autoComplete="new-password" className="w-full bg-transparent text-sm outline-none" />
                </span>
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Confirmer le mot de passe</span>
                <span className="flex h-11 items-center gap-2 rounded border border-slate-300 bg-white px-3 focus-within:border-slate-950 dark:border-slate-700 dark:bg-slate-950">
                  <LockKeyhole className="size-4 text-slate-500" />
                  <input value={confirm} onChange={(event) => setConfirm(event.target.value)} required type="password" autoComplete="new-password" className="w-full bg-transparent text-sm outline-none" />
                </span>
              </label>
            </div>

            {error ? (
              <div className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-5 inline-flex h-11 w-full items-center justify-center rounded bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-emerald-400 dark:text-slate-950 dark:hover:bg-emerald-300"
            >
              {isSubmitting ? 'Enregistrement...' : 'Definir le mot de passe'}
            </button>
          </form>
        )}
      </section>
    </main>
  )
}
