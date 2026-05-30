import { createFileRoute } from '@tanstack/react-router'
import { Clock, ReceiptText, RotateCcw, Search } from 'lucide-react'
import { useState } from 'react'
import { getPosData } from '~/server/dataFetchers'
import { formatMoney } from '~/utils/currency'

export const Route = createFileRoute('/$companySlug/pos/history')({
  loader: async ({ params }) => getPosData({ data: { companySlug: params.companySlug } }),
  component: PosHistory,
})

function PosHistory() {
  const { tickets } = Route.useLoaderData()
  const [query, setQuery] = useState('')
  const visibleTickets = tickets.filter((ticket: any) => `${ticket.reference} ${ticket.description}`.toLowerCase().includes(query.toLowerCase()))
  const paidTickets = tickets.filter((ticket: any) => ticket.status === 'Completed')
  const issueTickets = tickets.filter((ticket: any) => ticket.status !== 'Completed')
  const total = paidTickets.reduce((sum: number, ticket: any) => sum + ticket.amount, 0)

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-cyan-500">Caisse</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950 dark:text-white">Tickets</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Un historique lisible pour retrouver un ticket, verifier un statut ou preparer un retour.</p>
        </div>
        <div className="neon-surface grid grid-cols-3 rounded text-center">
          <TicketStat label="Tickets" value={tickets.length.toString()} />
          <TicketStat label="Valides" value={paidTickets.length.toString()} />
          <TicketStat label="Total" value={formatMoney(total)} />
        </div>
      </div>

      <div className="neon-surface mb-5 rounded p-3">
        <label className="relative block">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher un ticket ou un client"
            className="h-11 w-full rounded border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm font-semibold text-slate-950 outline-none focus:border-slate-950 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-cyan-400"
          />
        </label>
      </div>

      {visibleTickets.length > 0 ? (
        <section className="neon-surface overflow-hidden rounded">
          <div className="hidden grid-cols-[1.2fr_1fr_.8fr_.8fr_auto] gap-4 border-b border-slate-200 px-5 py-3 text-xs font-bold uppercase tracking-wide text-slate-400 dark:border-slate-800 lg:grid">
            <span>Ticket</span>
            <span>Client</span>
            <span>Statut</span>
            <span className="text-right">Total</span>
            <span className="text-right">Action</span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {visibleTickets.map((ticket) => (
              <article key={ticket.id} className="grid gap-3 px-5 py-4 transition hover:bg-slate-50/70 dark:hover:bg-slate-900/60 lg:grid-cols-[1.2fr_1fr_.8fr_.8fr_auto] lg:items-center">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-bold text-slate-950 dark:text-white">
                    <ReceiptText className="size-4 text-slate-400" />
                    {ticket.reference}
                  </div>
                  <div className="mt-1 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                    <Clock className="size-3" />
                    {new Date(ticket.date).toLocaleString('fr-FR')}
                  </div>
                </div>
                <div className="truncate text-sm font-semibold text-slate-700 dark:text-slate-200">{ticket.description}</div>
                <div>
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${ticketStatusClass(ticket.status)}`}>{ticketStatus(ticket.status)}</span>
                </div>
                <div className="font-bold text-slate-950 dark:text-white lg:text-right">{formatMoney(ticket.amount)}</div>
                <div className="flex justify-start lg:justify-end">
                  <button className="inline-flex h-9 items-center justify-center gap-2 rounded border border-slate-200 px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900">
                    <RotateCcw className="size-3.5" />
                    Gerer
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : (
        <section className="neon-surface rounded p-10 text-center">
          <ReceiptText className="mx-auto size-10 text-slate-300 dark:text-slate-700" />
          <h2 className="mt-3 text-base font-bold text-slate-950 dark:text-white">{tickets.length === 0 ? 'Aucun ticket pour le moment' : 'Aucun resultat'}</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{tickets.length === 0 ? 'Les ventes encaissees apparaitront ici.' : 'Modifie la recherche pour retrouver un ticket.'}</p>
        </section>
      )}

      {issueTickets.length > 0 ? (
        <p className="mt-4 text-xs font-semibold text-slate-500 dark:text-slate-400">{issueTickets.length} ticket(s) avec annulation, remboursement ou avoir.</p>
      ) : null}
    </main>
  )
}

function TicketStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</p>
      <p className="truncate text-sm font-bold text-slate-950 dark:text-white">{value}</p>
    </div>
  )
}

function ticketStatus(status: string) {
  if (status === 'Completed') return 'Paye'
  if (status === 'Pending') return 'A verifier'
  if (status === 'Failed') return 'Echec'
  return status
}

function ticketStatusClass(status: string) {
  if (status === 'Completed') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
  if (status === 'Pending') return 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
  if (status === 'Failed') return 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
  return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300'
}
