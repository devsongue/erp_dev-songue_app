import { createFileRoute, Link } from '@tanstack/react-router'
import { Activity, ArrowDownRight, ArrowUpRight, Banknote, Plus, Wallet } from 'lucide-react'
import { useState } from 'react'
import { DateRangeFilter, matchesDatePreset, todayInputValue, type DatePreset } from '~/components/DateRangeFilter'
import { TransactionFormModal, TransactionList, accountTypeLabels } from '~/components/finance'
import { EmptyState, PageHeader, StatCard, buttonClass } from '~/components/ui'
import { useMoney } from '~/context/CompanyContext'
import { getFinanceData } from '~/server/dataFetchers'

export const Route = createFileRoute('/$companySlug/finance/')({
  loader: async ({ params }) => getFinanceData({ data: { companySlug: params.companySlug } }),
  component: FinanceDashboard,
})

function FinanceDashboard() {
  const { formatMoney, formatSignedMoney } = useMoney()
  const { companySlug } = Route.useParams()
  const data = Route.useLoaderData()
  const [adding, setAdding] = useState<'Income' | 'Expense' | null>(null)
  const [datePreset, setDatePreset] = useState<DatePreset>('month')
  const [startDate, setStartDate] = useState(todayInputValue())
  const [endDate, setEndDate] = useState(todayInputValue())

  const accounts = data.accounts.filter((account) => account.status !== 'Archived')
  const totalBalance = accounts.reduce((sum, account) => sum + account.balance, 0)
  const periodTransactions = data.transactions.filter((tx) => matchesDatePreset(tx.date, datePreset, startDate, endDate))
  const totalIncome = periodTransactions.filter((tx) => tx.type === 'Income').reduce((sum, tx) => sum + tx.amount, 0)
  const totalExpense = periodTransactions.filter((tx) => tx.type === 'Expense').reduce((sum, tx) => sum + tx.amount, 0)
  const profit = totalIncome - totalExpense

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Argent"
        title="Résumé de la trésorerie"
        description="Caisse, mobile money, banque, entrées, dépenses et résultat de la période."
        actions={(
          <>
            <button type="button" onClick={() => setAdding('Income')} className={buttonClass.secondary}><ArrowUpRight className="size-4" />Entrée</button>
            <button type="button" onClick={() => setAdding('Expense')} className={buttonClass.primary}><Plus className="size-4" />Dépense</button>
          </>
        )}
      />

      <div className="mb-6">
        <DateRangeFilter preset={datePreset} startDate={startDate} endDate={endDate} onPresetChange={setDatePreset} onStartDateChange={setStartDate} onEndDateChange={setEndDate} />
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Solde disponible" value={formatMoney(totalBalance)} icon={Banknote} detail={`${accounts.length} compte${accounts.length > 1 ? 's' : ''} actif${accounts.length > 1 ? 's' : ''}`} />
        <StatCard title="Entrées" value={formatMoney(totalIncome)} icon={ArrowUpRight} tone="success" detail="Sur la période" />
        <StatCard title="Dépenses" value={formatMoney(totalExpense)} icon={ArrowDownRight} tone={totalExpense > totalIncome ? 'alert' : 'default'} detail="Sur la période" />
        <StatCard title="Résultat" value={formatSignedMoney(Math.abs(profit), profit >= 0 ? '+' : '-')} icon={Activity} tone={profit < 0 ? 'alert' : 'success'} detail="Entrées − dépenses" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <section className="neon-surface overflow-hidden rounded">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="font-bold text-slate-950">Comptes & caisse</h2>
              <p className="text-xs text-slate-500">Où se trouve l'argent disponible.</p>
            </div>
            <Link to="/$companySlug/finance/bank-accounts" params={{ companySlug }} className="text-xs font-bold text-slate-500 hover:text-slate-950">Gérer</Link>
          </div>
          {accounts.length ? (
            <div className="divide-y divide-slate-100">
              {accounts.map((account) => (
                <div key={account.id} className="list-row flex items-center justify-between gap-4 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate font-bold text-slate-950">{account.name}</p>
                    <p className="truncate text-xs text-slate-500">{accountTypeLabels[account.type] ?? account.type}</p>
                  </div>
                  <p className={`shrink-0 text-sm font-bold ${account.balance < 0 ? 'text-rose-600' : 'text-slate-950'}`}>{formatMoney(account.balance)}</p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Wallet}
              title="Aucun compte"
              text="Crée ta caisse et tes comptes pour suivre ton argent."
              action={<Link to="/$companySlug/finance/bank-accounts" params={{ companySlug }} className={buttonClass.primary}>Créer un compte</Link>}
            />
          )}
        </section>

        <section className="neon-surface overflow-hidden rounded">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="font-bold text-slate-950">Derniers mouvements</h2>
              <p className="text-xs text-slate-500">Les opérations saisies à la main sont modifiables.</p>
            </div>
            <div className="flex gap-3">
              <Link to="/$companySlug/finance/revenues" params={{ companySlug }} className="text-xs font-bold text-slate-500 hover:text-slate-950">Entrées</Link>
              <Link to="/$companySlug/finance/expenses" params={{ companySlug }} className="text-xs font-bold text-slate-500 hover:text-slate-950">Dépenses</Link>
            </div>
          </div>
          <TransactionList companySlug={companySlug} transactions={periodTransactions.slice(0, 8)} accounts={data.accounts} empty="Aucun mouvement sur cette période" />
        </section>
      </div>

      {adding ? <TransactionFormModal companySlug={companySlug} type={adding} accounts={data.accounts} onClose={() => setAdding(null)} /> : null}
    </main>
  )
}
