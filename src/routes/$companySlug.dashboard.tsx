import { createFileRoute, Link } from '@tanstack/react-router'
import { AlertTriangle, ArrowRight, Banknote, Boxes, Check, CheckCircle2, Clock, Contact, FileText, Package, ReceiptText, ShoppingCart, TrendingDown, TrendingUp, Truck, UserPlus, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { StatCard } from '~/components/ui'
import { getDashboardData, type DashboardTodo } from '~/server/dashboard'
import { useCompany, useMoney } from '~/context/CompanyContext'

export const Route = createFileRoute('/$companySlug/dashboard')({
  loader: async ({ params }) => getDashboardData({ data: { companySlug: params.companySlug } }),
  component: DashboardPage,
})

const todoIcons: Record<DashboardTodo['kind'], LucideIcon> = {
  overdue_invoice: ReceiptText,
  supplier_due: Truck,
  low_stock: Package,
  stale_pos_session: Clock,
  expiring_quote: FileText,
  draft_invoices: FileText,
}

const toneClasses: Record<DashboardTodo['tone'], string> = {
  red: 'bg-rose-50 text-rose-600',
  amber: 'bg-amber-50 text-amber-600',
  blue: 'bg-sky-50 text-sky-600',
}

function greeting() {
  const hour = new Date().getHours()
  return hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir'
}

function DashboardPage() {
  const { formatMoney } = useMoney()
  const { companySlug } = Route.useParams()
  const { activeCompany } = useCompany()
  const data = Route.useLoaderData()

  const steps = [
    { done: data.setup.hasItems, title: 'Ajouter tes produits ou services', to: `/${companySlug}/products-services`, icon: Package },
    { done: data.setup.hasCustomers, title: 'Enregistrer tes premiers clients', to: `/${companySlug}/crm/customers`, icon: Contact },
    { done: data.setup.hasSale, title: 'Faire une vente ou une facture', to: `/${companySlug}/pos/register`, icon: ShoppingCart },
    { done: data.setup.hasTeam, title: 'Inviter ton équipe', to: `/${companySlug}/settings`, icon: UserPlus },
  ]
  const remainingSteps = steps.filter((step) => !step.done).length

  const actions = [
    { title: 'Nouvelle vente', text: 'Encaisser au comptoir.', icon: ShoppingCart, to: `/${companySlug}/pos/register`, show: data.can.pos },
    { title: 'Nouvelle facture', text: 'Facturer un client.', icon: ReceiptText, to: `/${companySlug}/invoices`, show: data.can.invoices },
    { title: 'Ajouter une dépense', text: 'Loyer, achat, transport…', icon: TrendingDown, to: `/${companySlug}/finance/expenses`, show: data.can.finance },
    { title: 'Ajouter un produit', text: 'Prix, stock, image.', icon: Boxes, to: `/${companySlug}/products-services`, show: data.can.stock },
  ].filter((action) => action.show)

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6">
        <p className="text-sm font-semibold text-slate-500">{activeCompany.name}</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-950">{greeting()}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {data.todo.length ? `${data.todo.length} point${data.todo.length > 1 ? 's' : ''} demande${data.todo.length > 1 ? 'nt' : ''} ton attention.` : 'Tout est à jour. Bonne journée !'}
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {data.balance !== null ? <StatCard icon={Banknote} title="Argent disponible" value={formatMoney(data.balance)} detail="Caisse et comptes actifs" /> : null}
        {data.can.pos ? <StatCard icon={ShoppingCart} title="Caisse du jour" value={formatMoney(data.todaySales.total)} detail={`${data.todaySales.count} ticket${data.todaySales.count > 1 ? 's' : ''}`} /> : null}
        {data.can.finance ? <StatCard icon={TrendingUp} title="Entrées du mois" value={formatMoney(data.monthIncome)} tone="success" detail={`Dépenses : ${formatMoney(data.monthExpense)}`} /> : null}
        {data.can.stock ? <StatCard icon={Boxes} title="Stock bas" value={data.lowStockCount.toString()} tone={data.lowStockCount ? 'alert' : 'default'} detail="Articles sous le seuil" /> : null}
        {data.can.crm && !data.can.stock ? <StatCard icon={Users} title="Affaires en cours" value={data.openDealsCount.toString()} /> : null}
      </section>

      {remainingSteps ? (
        <section className="neon-surface mt-6 rounded p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-slate-950">Premiers pas</h2>
              <p className="text-xs text-slate-500">{steps.length - remainingSteps} sur {steps.length} terminés</p>
            </div>
            <div className="h-1.5 w-32 rounded-full bg-slate-100">
              <div className="h-1.5 rounded-full bg-orange-500" style={{ width: `${((steps.length - remainingSteps) / steps.length) * 100}%` }} />
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {steps.map((step) => {
              const Icon = step.icon
              return step.done ? (
                <div key={step.title} className="flex items-center gap-3 rounded px-3 py-2.5 text-sm text-slate-400 line-through">
                  <span className="grid size-7 place-items-center rounded-full bg-emerald-50 text-emerald-600"><Check className="size-3.5" /></span>
                  {step.title}
                </div>
              ) : (
                <Link key={step.title} to={step.to as any} className="list-row flex items-center gap-3 rounded border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-800">
                  <span className="grid size-7 place-items-center rounded-full bg-slate-100 text-slate-600"><Icon className="size-3.5" /></span>
                  <span className="flex-1">{step.title}</span>
                  <ArrowRight className="size-4 text-slate-400" />
                </Link>
              )
            })}
          </div>
        </section>
      ) : null}

      <section className="mt-6 grid gap-5 lg:grid-cols-[1fr_0.75fr]">
        <div className="neon-surface overflow-hidden rounded">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="font-bold text-slate-950">À traiter</h2>
            {data.todo.length ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">{data.todo.length}</span> : null}
          </div>
          {data.todo.length ? (
            <div className="divide-y divide-slate-100">
              {data.todo.map((item) => {
                const Icon = todoIcons[item.kind] ?? AlertTriangle
                return (
                  <Link key={item.id} to={item.to as any} className="list-row flex items-center gap-3 px-5 py-3.5">
                    <span className={`grid size-9 shrink-0 place-items-center rounded ${toneClasses[item.tone]}`}><Icon className="size-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-slate-950">{item.title}</span>
                      <span className="block truncate text-xs text-slate-500">{item.detail}</span>
                    </span>
                    {item.amount ? <span className="shrink-0 text-sm font-bold text-slate-950">{formatMoney(item.amount)}</span> : null}
                    <ArrowRight className="size-4 shrink-0 text-slate-300" />
                  </Link>
                )
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center px-5 py-10 text-center">
              <span className="mb-3 grid size-11 place-items-center rounded-full bg-emerald-50 text-emerald-600"><CheckCircle2 className="size-5" /></span>
              <p className="font-bold text-slate-950">Rien d’urgent</p>
              <p className="mt-1 text-sm text-slate-500">Pas de facture en retard, de fournisseur à payer ni de rupture.</p>
            </div>
          )}
        </div>

        <div className="neon-surface rounded">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="font-bold text-slate-950">Actions rapides</h2>
          </div>
          <div className="grid gap-1 p-2">
            {actions.map((action) => {
              const Icon = action.icon
              return (
                <Link key={action.title} to={action.to as any} className="list-row flex items-center gap-3 rounded px-3 py-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded bg-slate-100 text-slate-700"><Icon className="size-4" /></span>
                  <span className="flex-1">
                    <span className="block text-sm font-bold text-slate-950">{action.title}</span>
                    <span className="block text-xs text-slate-500">{action.text}</span>
                  </span>
                  <ArrowRight className="size-4 text-slate-300" />
                </Link>
              )
            })}
          </div>
        </div>
      </section>
    </main>
  )
}
