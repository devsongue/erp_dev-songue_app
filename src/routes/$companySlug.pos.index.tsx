import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowRight, BarChart3, Boxes, History, ReceiptText, ShoppingCart, Wallet } from 'lucide-react'
import { getPosData } from '~/server/dataFetchers'
import { useMoney } from '~/context/CompanyContext'

export const Route = createFileRoute('/$companySlug/pos/')({
  loader: async ({ params }) => getPosData({ data: { companySlug: params.companySlug } }),
  component: PosDashboard,
})

function PosDashboard() {
  const { formatMoney } = useMoney()
  const { companySlug } = Route.useParams()
  const { tickets, items, today } = Route.useLoaderData()
  const averageBasket = today.count > 0 ? today.total / today.count : 0
  const lowStock = items.filter((item: any) => item.type === 'Product' && item.stock !== null && item.minStockLevel !== null && item.stock <= item.minStockLevel)
  const recentTickets = tickets.slice(0, 5)

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-cyan-500">Point de vente</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">Résumé caisse</h1>
          <p className="mt-1 text-sm text-slate-500">Ventes encaissées, tickets recents et alertes utiles pour la caisse.</p>
        </div>
        <Link to="/$companySlug/pos/register" params={{ companySlug }} className="inline-flex h-11 items-center justify-center gap-2 rounded bg-slate-950 px-4 text-sm font-bold text-white hover:bg-slate-800">
          <ShoppingCart className="size-4" />
          Nouvelle vente
        </Link>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        <PosMetric title="Caisse du jour" value={formatMoney(today.total)} icon={Wallet} />
        <PosMetric title="Tickets du jour" value={today.count.toString()} icon={ReceiptText} />
        <PosMetric title="Panier moyen du jour" value={formatMoney(averageBasket)} icon={BarChart3} />
        <PosMetric title="Alertes stock" value={lowStock.length.toString()} icon={Boxes} />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <PosShortcut to={`/${companySlug}/pos/register`} title="Encaisser" text="Scanner les produits et imprimer le ticket." icon={ShoppingCart} />
        <PosShortcut to={`/${companySlug}/pos/history`} title="Tickets" text="Retrouver les ventes encaissées." icon={History} />
        <PosShortcut to={`/${companySlug}/pos/sales-report`} title="Rapport caisse" text="Voir les totaux par mode de paiement." icon={BarChart3} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_.9fr]">
        <section className="neon-surface rounded">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="font-bold text-slate-950">Derniers tickets</h2>
            <Link to="/$companySlug/pos/history" params={{ companySlug }} className="text-xs font-bold text-slate-500 hover:text-slate-950">Tout voir</Link>
          </div>
          <div className="divide-y divide-slate-100">
            {recentTickets.length > 0 ? recentTickets.map((ticket: any) => (
              <div key={ticket.id} className="list-row flex items-center justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-950">{ticket.reference}</p>
                  <p className="text-xs text-slate-500">{new Date(ticket.date).toLocaleString('fr-FR')} - {paymentLabel(ticket.account?.name)}</p>
                </div>
                <span className="text-sm font-bold text-slate-950">{formatMoney(ticket.amount)}</span>
              </div>
            )) : <EmptyLine text="Aucun ticket encaisse." />}
          </div>
        </section>

        <section className="neon-surface rounded">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="font-bold text-slate-950">Alertes caisse</h2>
            <Link to="/$companySlug/inventory" params={{ companySlug }} className="text-xs font-bold text-slate-500 hover:text-slate-950">Stock</Link>
          </div>
          <div className="space-y-3 p-5">
            {lowStock.length > 0 ? lowStock.slice(0, 5).map((item: any) => (
              <div key={item.id} className="list-row flex items-center justify-between gap-4 rounded border border-slate-200 px-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-950">{item.name}</p>
                  <p className="text-xs text-slate-500">{item.sku}</p>
                </div>
                <span className="text-sm font-bold text-amber-700">{item.stock ?? 0}</span>
              </div>
            )) : <EmptyLine text="Aucune alerte stock pour la caisse." />}
          </div>
        </section>
      </div>
    </main>
  )
}

function PosMetric({ title, value, icon: Icon }: { title: string; value: string; icon: any }) {
  return (
    <div className="neon-surface rounded p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</p>
        <Icon className="size-4 text-slate-300" />
      </div>
      <p className="text-2xl font-bold text-slate-950">{value}</p>
    </div>
  )
}

function PosShortcut({ to, title, text, icon: Icon }: { to: string; title: string; text: string; icon: any }) {
  return (
    <Link to={to as any} className="neon-surface group rounded p-5 transition hover:-translate-y-0.5 hover:border-slate-300">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex size-10 items-center justify-center rounded bg-slate-100 text-slate-600"><Icon className="size-5" /></div>
        <ArrowRight className="size-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-600" />
      </div>
      <h2 className="font-bold text-slate-950">{title}</h2>
      <p className="mt-2 text-sm text-slate-500">{text}</p>
    </Link>
  )
}

function EmptyLine({ text }: { text: string }) {
  return (
    <div className="rounded border border-dashed border-slate-200 px-3 py-4 text-sm font-semibold text-slate-500">
      {text}
    </div>
  )
}

function paymentLabel(accountName?: string) {
  if (!accountName) return 'Caisse'
  if (accountName.toLowerCase().includes('mobile')) return 'Mobile'
  if (accountName.toLowerCase().includes('carte')) return 'Carte'
  return 'Especes'
}
