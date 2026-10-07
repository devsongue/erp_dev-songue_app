import { useRouter } from '@tanstack/react-router'
import { ArrowDownRight, ArrowLeftRight, ArrowUpRight, Download, Lock, Pencil, Plus, ReceiptText, Search, Trash2 } from 'lucide-react'
import * as React from 'react'
import { useMoney } from '~/context/CompanyContext'
import { DateRangeFilter, matchesDatePreset, todayInputValue, type DatePreset } from '~/components/DateRangeFilter'
import { EmptyState, Field, FormActions, Modal, PageHeader, StatCard, buttonClass, formatDate, inputClass, toDateInput, useAction, useFeedback } from '~/components/ui'
import { downloadCsv } from '~/utils/csvExport'
import type { getFinanceData } from '~/server/dataFetchers'
import { createFinanceTransaction, deleteFinanceTransaction, updateFinanceTransaction } from '~/server/operations'

export type FinanceData = Awaited<ReturnType<typeof getFinanceData>>
export type FinanceTransaction = FinanceData['transactions'][number]
export type FinanceAccount = FinanceData['accounts'][number]

export const incomeCategories = ['Ventes', 'Prestations', 'Apport', 'Remboursement', 'Autre recette']
export const expenseCategories = ['Achat stock', 'Loyer', 'Salaires', 'Transport', 'Électricité & eau', 'Internet & téléphone', 'Marketing', 'Impôts & taxes', 'Charges', 'Autre dépense']

const inflowTypes = new Set(['Income', 'TransferIn', 'Opening'])

export const accountTypeLabels: Record<string, string> = {
  Cash: 'Caisse (espèces)',
  MobileMoney: 'Mobile money',
  Checking: 'Compte bancaire',
  Savings: 'Épargne',
  CreditCard: 'Carte / TPE',
}

export function TransactionList({ companySlug, transactions, accounts, empty }: {
  companySlug: string
  transactions: FinanceTransaction[]
  accounts: FinanceAccount[]
  empty: string
}) {
  const router = useRouter()
  const { formatSignedMoney } = useMoney()
  const { confirm } = useFeedback()
  const { run, pending } = useAction()
  const [editing, setEditing] = React.useState<FinanceTransaction | null>(null)

  async function remove(transaction: FinanceTransaction) {
    const ok = await confirm({
      title: 'Supprimer cette opération ?',
      message: `« ${transaction.description} » sera supprimée et le solde de ${transaction.account.name} sera corrigé.`,
      confirmLabel: 'Supprimer',
      danger: true,
    })
    if (!ok) return
    const result = await run(() => deleteFinanceTransaction({ data: { companySlug, transactionId: transaction.id } }), 'Opération supprimée.')
    if (result) await router.invalidate()
  }

  if (!transactions.length) {
    return <EmptyState icon={ReceiptText} title={empty} text="Change de période ou ajoute une opération." />
  }

  return (
    <>
      <div className="divide-y divide-slate-100">
        {transactions.map((transaction) => {
          const inflow = inflowTypes.has(transaction.type)
          const Icon = transaction.type.startsWith('Transfer') ? ArrowLeftRight : inflow ? ArrowUpRight : ArrowDownRight
          return (
            <div key={transaction.id} className="list-row flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
              <div className="flex min-w-0 items-center gap-3">
                <span className={`flex size-9 shrink-0 items-center justify-center rounded ${inflow ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-950">{transaction.description}</p>
                  <p className="truncate text-xs text-slate-500">
                    {formatDate(transaction.date)} · {transaction.category} · {transaction.account.name}
                    {transaction.reference ? ` · ${transaction.reference}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <p className={`text-sm font-bold ${inflow ? 'text-emerald-700' : 'text-slate-950'}`}>{formatSignedMoney(transaction.amount, inflow ? '+' : '-')}</p>
                {transaction.editable ? (
                  <div className="flex gap-1.5">
                    <button type="button" onClick={() => setEditing(transaction)} className={buttonClass.icon} aria-label="Modifier l'opération"><Pencil className="size-3.5" /></button>
                    <button type="button" onClick={() => void remove(transaction)} disabled={pending} className={buttonClass.iconDanger} aria-label="Supprimer l'opération"><Trash2 className="size-3.5" /></button>
                  </div>
                ) : (
                  <span className="inline-flex size-8 items-center justify-center text-slate-300" title="Opération liée à une facture, un achat, la caisse ou un virement">
                    <Lock className="size-3.5" />
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {editing ? (
        <TransactionFormModal
          companySlug={companySlug}
          type={editing.type as 'Income' | 'Expense'}
          accounts={accounts}
          transaction={editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  )
}

// Page commune "Entrees" / "Depenses" : filtre de periode, totaux, repartition
// par categorie, liste modifiable et export.
export function FinanceFlowPage({ companySlug, data, kind }: { companySlug: string; data: FinanceData; kind: 'Income' | 'Expense' }) {
  const { formatMoney } = useMoney()
  const [datePreset, setDatePreset] = React.useState<DatePreset>('month')
  const [startDate, setStartDate] = React.useState(todayInputValue())
  const [endDate, setEndDate] = React.useState(todayInputValue())
  const [query, setQuery] = React.useState('')
  const [adding, setAdding] = React.useState(false)
  const income = kind === 'Income'

  const rows = React.useMemo(() => {
    const needle = query.trim().toLowerCase()
    return data.transactions.filter((tx) =>
      tx.type === kind
      && matchesDatePreset(tx.date, datePreset, startDate, endDate)
      && (!needle || [tx.description, tx.category, tx.reference, tx.account.name].some((value) => value?.toLowerCase().includes(needle))),
    )
  }, [data.transactions, kind, datePreset, startDate, endDate, query])

  const total = rows.reduce((sum, tx) => sum + tx.amount, 0)
  const byCategory = React.useMemo(() => {
    const map = new Map<string, number>()
    for (const tx of rows) map.set(tx.category, (map.get(tx.category) ?? 0) + tx.amount)
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6)
  }, [rows])

  function exportCsv() {
    downloadCsv(income ? 'entrees.csv' : 'depenses.csv', rows, [
      { header: 'Date', value: (tx) => formatDate(tx.date) },
      { header: 'Libellé', value: (tx) => tx.description },
      { header: 'Catégorie', value: (tx) => tx.category },
      { header: 'Compte', value: (tx) => tx.account.name },
      { header: 'Référence', value: (tx) => tx.reference },
      { header: 'Montant', value: (tx) => tx.amount },
    ])
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Argent"
        title={income ? 'Entrées' : 'Dépenses'}
        description={income ? 'Paiements clients, ventes en caisse et autres recettes.' : 'Achats, charges, paiements fournisseurs et sorties de caisse.'}
        actions={(
          <>
            <button type="button" onClick={exportCsv} disabled={!rows.length} className={buttonClass.secondary}><Download className="size-4" />Exporter</button>
            <button type="button" onClick={() => setAdding(true)} className={buttonClass.primary}><Plus className="size-4" />{income ? 'Nouvelle entrée' : 'Nouvelle dépense'}</button>
          </>
        )}
      />
      <div className="mb-6">
        <DateRangeFilter preset={datePreset} startDate={startDate} endDate={endDate} onPresetChange={setDatePreset} onStartDateChange={setStartDate} onEndDateChange={setEndDate} />
      </div>
      <div className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <StatCard title={income ? 'Total des entrées' : 'Total des dépenses'} value={formatMoney(total)} icon={income ? ArrowUpRight : ArrowDownRight} tone={income ? 'success' : 'default'} />
          <StatCard title="Opérations" value={rows.length.toString()} detail={`${byCategory.length} catégorie${byCategory.length > 1 ? 's' : ''}`} />
        </div>
        <section className="neon-surface rounded p-5">
          <h2 className="mb-4 text-xs font-bold uppercase tracking-wide text-slate-400">Par catégorie</h2>
          {byCategory.length ? (
            <div className="space-y-3">
              {byCategory.map(([category, amount]) => (
                <div key={category}>
                  <div className="mb-1 flex justify-between gap-3 text-sm">
                    <span className="truncate font-semibold text-slate-700">{category}</span>
                    <span className="shrink-0 font-bold text-slate-950">{formatMoney(amount)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100">
                    <div className={`h-1.5 rounded-full ${income ? 'bg-emerald-500' : 'bg-orange-500'}`} style={{ width: `${total ? Math.max(2, (amount / total) * 100) : 0}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-slate-500">Rien sur cette période.</p>}
        </section>
      </div>
      <section className="neon-surface overflow-hidden rounded">
        <div className="border-b border-slate-200 p-3">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un libellé, une catégorie, un compte" className={`${inputClass} pl-9`} />
          </label>
        </div>
        <TransactionList companySlug={companySlug} transactions={rows} accounts={data.accounts} empty={income ? 'Aucune entrée sur cette période' : 'Aucune dépense sur cette période'} />
      </section>
      {adding ? <TransactionFormModal companySlug={companySlug} type={kind} accounts={data.accounts} onClose={() => setAdding(false)} /> : null}
    </main>
  )
}

export function TransactionFormModal({ companySlug, type, accounts, transaction, onClose }: {
  companySlug: string
  type: 'Income' | 'Expense'
  accounts: FinanceAccount[]
  transaction?: FinanceTransaction | null
  onClose: () => void
}) {
  const router = useRouter()
  const { run, pending } = useAction()
  const activeAccounts = accounts.filter((account) => account.status === 'Active' || account.id === transaction?.accountId)
  const categories = type === 'Income' ? incomeCategories : expenseCategories
  const listId = React.useId()

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const payload = {
      companySlug,
      accountId: String(form.get('accountId') || ''),
      description: String(form.get('description') ?? ''),
      amount: Number(form.get('amount')),
      category: String(form.get('category') ?? ''),
      date: String(form.get('date') || '') || undefined,
      reference: String(form.get('reference') ?? ''),
    }
    const result = await run(
      () => transaction
        ? updateFinanceTransaction({ data: { ...payload, transactionId: transaction.id } })
        : createFinanceTransaction({ data: { ...payload, accountId: payload.accountId || undefined, type } }),
      transaction ? 'Opération modifiée.' : type === 'Income' ? 'Entrée enregistrée.' : 'Dépense enregistrée.',
    )
    if (!result) return
    onClose()
    await router.invalidate()
  }

  return (
    <Modal
      title={transaction ? "Modifier l'opération" : type === 'Income' ? 'Nouvelle entrée' : 'Nouvelle dépense'}
      description={transaction ? 'Le solde du compte est recalculé automatiquement.' : undefined}
      onClose={onClose}
    >
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Libellé" className="sm:col-span-2">
          <input name="description" required autoFocus defaultValue={transaction?.description ?? ''} placeholder={type === 'Income' ? 'Ex. : apport du gérant' : 'Ex. : loyer d octobre'} className={inputClass} />
        </Field>
        <Field label="Montant">
          <input name="amount" type="number" min="1" required defaultValue={transaction?.amount ?? ''} className={inputClass} />
        </Field>
        <Field label="Date">
          <input name="date" type="date" defaultValue={toDateInput(transaction?.date ?? new Date())} className={inputClass} />
        </Field>
        <Field label="Catégorie">
          <input name="category" required list={listId} defaultValue={transaction?.category ?? categories[0]} className={inputClass} />
          <datalist id={listId}>{categories.map((category) => <option key={category} value={category} />)}</datalist>
        </Field>
        <Field label={type === 'Income' ? 'Encaissé sur' : 'Payé depuis'}>
          <select name="accountId" defaultValue={transaction?.accountId ?? activeAccounts[0]?.id ?? ''} className={inputClass}>
            {activeAccounts.length ? null : <option value="">Caisse boutique (créée automatiquement)</option>}
            {activeAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
          </select>
        </Field>
        <Field label="Référence (optionnel)" hint="N° de reçu, de facture fournisseur…" className="sm:col-span-2">
          <input name="reference" defaultValue={transaction?.reference ?? ''} className={inputClass} />
        </Field>
        <div className="sm:col-span-2">
          <FormActions onCancel={onClose} pending={pending} submitLabel={transaction ? 'Enregistrer' : 'Ajouter'} />
        </div>
      </form>
    </Modal>
  )
}
