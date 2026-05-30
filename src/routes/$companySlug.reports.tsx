import { createFileRoute } from '@tanstack/react-router'
import { BarChart3, Boxes, CircleDollarSign, Users } from 'lucide-react'
import { getCatalogData, getCrmData, getFinanceData } from '~/server/dataFetchers'
import { formatMoney } from '~/utils/currency'

export const Route = createFileRoute('/$companySlug/reports')({
  loader: async ({ params }) => {
    const [finance, crm, catalog] = await Promise.all([
      getFinanceData({ data: { companySlug: params.companySlug } }),
      getCrmData({ data: { companySlug: params.companySlug } }),
      getCatalogData({ data: { companySlug: params.companySlug } }),
    ])
    return { finance, crm, catalog }
  },
  component: ReportsPage,
})

function ReportsPage() {
  const { finance, crm, catalog } = Route.useLoaderData()
  const income = finance.transactions.filter((tx: any) => tx.type === 'Income').reduce((sum: number, tx: any) => sum + tx.amount, 0)
  const expenses = finance.transactions.filter((tx: any) => tx.type === 'Expense').reduce((sum: number, tx: any) => sum + tx.amount, 0)
  const stockValue = catalog.items.reduce((sum: number, item: any) => sum + (item.stock ?? 0) * item.price, 0)
  const openDeals = crm.deals.filter((deal: any) => deal.status === 'Open').length

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-950">Rapports</h1>
        <p className="mt-1 text-sm text-slate-500">Synthese dynamique finance, clients et catalogue.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <ReportCard title="Revenus" value={formatMoney(income)} icon={CircleDollarSign} />
        <ReportCard title="Depenses" value={formatMoney(expenses)} icon={BarChart3} />
        <ReportCard title="Valeur stock" value={formatMoney(stockValue)} icon={Boxes} />
        <ReportCard title="Dossiers ouverts" value={openDeals.toString()} icon={Users} />
      </div>
    </main>
  )
}

function ReportCard({ title, value, icon: Icon }: { title: string; value: string; icon: any }) {
  return (
    <div className="neon-surface rounded p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{title}</p>
        <Icon className="size-4 text-slate-400" />
      </div>
      <p className="text-2xl font-bold text-slate-950">{value}</p>
    </div>
  )
}
