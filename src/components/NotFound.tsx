import { Link } from '@tanstack/react-router'

export function NotFound({ children }: { children?: any }) {
  return (
    <main className="grid min-h-[60vh] place-items-center px-4 py-12">
      <div className="neon-surface w-full max-w-md rounded p-6 text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Erreur 404</p>
        <h1 className="mt-2 text-xl font-bold text-slate-950">Page introuvable</h1>
        <div className="mt-2 text-sm leading-6 text-slate-500">
          {children || <p>Cette page n'existe pas ou a ete deplacee.</p>}
        </div>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => window.history.back()}
            className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            Retour
          </button>
          <Link
            to="/"
            className="rounded bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
          >
            Accueil
          </Link>
        </div>
      </div>
    </main>
  )
}
