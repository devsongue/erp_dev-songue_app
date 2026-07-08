import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { LockKeyhole, UserRound } from 'lucide-react'
import * as React from 'react'
import { acceptInvitation, getInvitationInfo } from '~/server/security'

export const Route = createFileRoute('/invite/$token')({
  loader: async ({ params }) => getInvitationInfo({ data: { token: params.token } }),
  component: InvitePage,
})

function InvitePage() {
  const { token } = Route.useParams()
  const info = Route.useLoaderData()
  const navigate = useNavigate()
  const [name, setName] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [confirm, setConfirm] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!info.ok) return
    if (!info.hasAccount) {
      if (password.length < 10) {
        setError('Mot de passe de 10 caracteres minimum.')
        return
      }
      if (password !== confirm) {
        setError('Les deux mots de passe ne correspondent pas.')
        return
      }
    }
    if (isSubmitting) return
    setIsSubmitting(true)
    setError(null)
    try {
      const result = await acceptInvitation({
        data: info.hasAccount ? { token } : { token, name, password },
      })
      if (!result.ok) {
        setError(result.message ?? 'Impossible d accepter cette invitation.')
        return
      }
      if ('requiresLogin' in result && result.requiresLogin) {
        await navigate({ to: '/login', search: { redirect: undefined } })
        return
      }
      window.location.href = result.redirectTo ?? '/'
    } catch (submitError: any) {
      setError(submitError?.message ?? 'Impossible d accepter cette invitation.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4 py-8 text-slate-950 dark:bg-slate-950 dark:text-slate-50">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
        {!info.ok ? (
          <div>
            <h1 className="text-xl font-bold">Invitation non valide</h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{info.message}</p>
            <Link to="/login" search={{ redirect: undefined }} className="mt-5 inline-flex h-10 items-center rounded bg-slate-950 px-4 text-sm font-semibold text-white dark:bg-emerald-400 dark:text-slate-950">
              Aller a la connexion
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <h1 className="text-xl font-bold">Rejoindre {info.companyName}</h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              {info.inviterName} vous invite avec le role <span className="font-semibold text-slate-800 dark:text-slate-200">{info.roleName}</span> pour le compte <span className="font-semibold text-slate-800 dark:text-slate-200">{info.email}</span>.
            </p>

            {info.hasAccount ? (
              <p className="mt-4 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                Un compte existe deja pour cet email. L invitation sera rattachee a ce compte, connectez-vous ensuite normalement.
              </p>
            ) : (
              <div className="mt-5 grid gap-4">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Votre nom</span>
                  <span className="flex h-11 items-center gap-2 rounded border border-slate-300 bg-white px-3 focus-within:border-slate-950 dark:border-slate-700 dark:bg-slate-950">
                    <UserRound className="size-4 text-slate-500" />
                    <input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} className="w-full bg-transparent text-sm outline-none" placeholder="Nom et prenom" />
                  </span>
                </label>
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
            )}

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
              {isSubmitting ? 'Traitement...' : info.hasAccount ? "Accepter l'invitation" : 'Creer mon compte et rejoindre'}
            </button>
          </form>
        )}
      </section>
    </main>
  )
}
