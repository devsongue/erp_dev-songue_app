import { createFileRoute, useRouter } from '@tanstack/react-router'
import { AlertTriangle, Download, FilePlus, Pencil, ReceiptText, Search, Trash2, Wallet, XCircle } from 'lucide-react'
import * as React from 'react'
import { DateRangeFilter, matchesDatePreset, todayInputValue, type DatePreset } from '~/components/DateRangeFilter'
import { Badge, EmptyState, Field, FormActions, Modal, PageHeader, StatCard, buttonClass, formatDate, inputClass, toDateInput, useAction, useFeedback, MoneyInput } from '~/components/ui'
import { useMoney } from '~/context/CompanyContext'
import { getPurchasesData } from '~/server/dataFetchers'
import { cancelPurchaseInvoice, createPurchaseInvoice, deletePurchaseInvoice, recordPurchaseInvoicePayment, updatePurchaseInvoice } from '~/server/operations'
import { downloadCsv } from '~/utils/csvExport'

export const Route = createFileRoute('/$companySlug/purchases/invoices')({
  loader: async ({ params }) => getPurchasesData({ data: { companySlug: params.companySlug } }),
  component: PurchaseInvoicesPage,
})

type PageData = Awaited<ReturnType<typeof getPurchasesData>>
type PurchaseRow = PageData['purchaseInvoices'][number]
type DisplayStatus = 'Pending' | 'PartiallyPaid' | 'Paid' | 'Overdue' | 'Cancelled' | 'Direct'

const purchaseCategories = ['Achat stock', 'Fournisseur', 'Charges', 'Loyer', 'Transport', 'Marketing', 'Services', 'Autre']

const statusLabels: Record<DisplayStatus, string> = {
  Pending: 'À payer',
  PartiallyPaid: 'Paiement partiel',
  Paid: 'Payée',
  Overdue: 'En retard',
  Cancelled: 'Annulée',
  Direct: 'Dépense directe',
}

const statusTones: Record<DisplayStatus, 'slate' | 'blue' | 'amber' | 'green' | 'red'> = {
  Pending: 'blue',
  PartiallyPaid: 'amber',
  Paid: 'green',
  Overdue: 'red',
  Cancelled: 'slate',
  Direct: 'slate',
}

const methodLabels: Record<string, string> = {
  Cash: 'Espèces',
  MobileMoney: 'Mobile money',
  Card: 'Carte',
  BankTransfer: 'Virement',
  Cheque: 'Chèque',
}

function displayStatus(row: PurchaseRow): DisplayStatus {
  if (row.source === 'transaction') return 'Direct'
  const open = ['Pending', 'PartiallyPaid', 'Overdue'].includes(row.status)
  if (open && row.dueDate) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (new Date(row.dueDate) < today) return 'Overdue'
  }
  return (row.status === 'Overdue' ? 'Pending' : row.status) as DisplayStatus
}

function remaining(row: PurchaseRow) {
  if (row.source === 'transaction' || row.status === 'Cancelled') return 0
  return Math.max(0, row.amount - row.paidCents)
}

function PurchaseInvoicesPage() {
  const { formatMoney } = useMoney()
  const { companySlug } = Route.useParams()
  const router = useRouter()
  const data = Route.useLoaderData()
  const { confirm } = useFeedback()
  const { run, pending } = useAction()
  const [query, setQuery] = React.useState('')
  const [onlyOpen, setOnlyOpen] = React.useState(false)
  const [datePreset, setDatePreset] = React.useState<DatePreset>('month')
  const [startDate, setStartDate] = React.useState(todayInputValue())
  const [endDate, setEndDate] = React.useState(todayInputValue())
  const [editing, setEditing] = React.useState<PurchaseRow | 'new' | null>(null)
  const [paying, setPaying] = React.useState<PurchaseRow | null>(null)
  const [selectedId, setSelectedId] = React.useState<string | null>(null)

  const selected = data.purchaseInvoices.find((row) => row.id === selectedId) ?? null

  const rows = React.useMemo(() => {
    const needle = query.trim().toLowerCase()
    return data.purchaseInvoices.filter((row) => {
      // Les factures encore dues restent visibles quelle que soit la periode.
      if (onlyOpen) return remaining(row) > 0
      if (!matchesDatePreset(row.date, datePreset, startDate, endDate)) return false
      return !needle || [row.vendorName, row.reference, row.category, row.description].some((value) => value?.toLowerCase().includes(needle))
    })
  }, [data.purchaseInvoices, query, onlyOpen, datePreset, startDate, endDate])

  const allDue = data.purchaseInvoices.reduce((sum, row) => sum + remaining(row), 0)
  const overdue = data.purchaseInvoices.filter((row) => displayStatus(row) === 'Overdue')
  const periodTotal = rows.filter((row) => row.status !== 'Cancelled').reduce((sum, row) => sum + row.amount, 0)

  async function cancel(row: PurchaseRow) {
    const ok = await confirm({ title: 'Annuler cette facture ?', message: `La facture ${row.reference} de ${row.vendorName} restera visible avec le statut « Annulée ».`, confirmLabel: 'Annuler la facture', danger: true })
    if (!ok) return
    const result = await run(() => cancelPurchaseInvoice({ data: { companySlug, invoiceId: row.id } }), 'Facture annulée.')
    if (result) await router.invalidate()
  }

  async function remove(row: PurchaseRow) {
    const ok = await confirm({ title: 'Supprimer cette facture ?', message: `La facture ${row.reference} sera supprimée définitivement.`, confirmLabel: 'Supprimer', danger: true })
    if (!ok) return
    const result = await run(() => deletePurchaseInvoice({ data: { companySlug, invoiceId: row.id } }), 'Facture supprimée.')
    if (!result) return
    setSelectedId(null)
    await router.invalidate()
  }

  function exportCsv() {
    downloadCsv('factures-achats.csv', rows, [
      { header: 'Date', value: (row) => formatDate(row.date) },
      { header: 'Fournisseur', value: (row) => row.vendorName },
      { header: 'Référence', value: (row) => row.reference },
      { header: 'Catégorie', value: (row) => row.category },
      { header: 'Statut', value: (row) => statusLabels[displayStatus(row)] },
      { header: 'Montant', value: (row) => row.amount },
      { header: 'Reste à payer', value: (row) => remaining(row) },
    ])
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Achats"
        title="Factures fournisseurs"
        description="Factures reçues, échéances et paiements aux fournisseurs."
        actions={(
          <>
            <button type="button" onClick={exportCsv} disabled={!rows.length} className={buttonClass.secondary}><Download className="size-4" />Exporter</button>
            <button type="button" onClick={() => setEditing('new')} className={buttonClass.primary}><FilePlus className="size-4" />Nouvelle facture</button>
          </>
        )}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard title="Reste à payer" value={formatMoney(allDue)} icon={Wallet} detail="Toutes périodes confondues" />
        <StatCard title="En retard" value={overdue.length.toString()} icon={AlertTriangle} tone={overdue.length ? 'alert' : 'default'} detail={overdue.length ? formatMoney(overdue.reduce((sum, row) => sum + remaining(row), 0)) : 'Aucune échéance dépassée'} />
        <StatCard title="Achats de la période" value={formatMoney(periodTotal)} icon={ReceiptText} detail={`${rows.length} document${rows.length > 1 ? 's' : ''}`} />
      </div>

      <div className="mb-5 grid gap-3 xl:grid-cols-[1fr_auto] xl:items-start">
        <div className="neon-surface flex flex-col gap-3 rounded p-3 sm:flex-row sm:items-center">
          <label className="relative block flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Fournisseur, référence, catégorie" className={`${inputClass} pl-9`} />
          </label>
          <label className="flex shrink-0 items-center gap-2 text-sm font-semibold text-slate-600">
            <input type="checkbox" checked={onlyOpen} onChange={(event) => setOnlyOpen(event.target.checked)} />
            Seulement à payer
          </label>
        </div>
        {onlyOpen ? null : <DateRangeFilter preset={datePreset} startDate={startDate} endDate={endDate} onPresetChange={setDatePreset} onStartDateChange={setStartDate} onEndDateChange={setEndDate} />}
      </div>

      <section className="neon-surface overflow-hidden rounded">
        {rows.length ? (
          <div className="divide-y divide-slate-100">
            {rows.map((row) => {
              const status = displayStatus(row)
              const due = remaining(row)
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => row.source === 'purchaseInvoice' ? setSelectedId(row.id) : undefined}
                  className={`list-row grid w-full gap-2 px-4 py-4 text-left sm:px-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_auto] lg:items-center ${row.source === 'transaction' ? 'cursor-default' : ''}`}
                >
                  <div className="min-w-0">
                    <p className="truncate font-bold text-slate-950">{row.vendorName || row.description}</p>
                    <p className="truncate text-xs text-slate-500">{row.reference ?? 'Sans référence'} · {row.category}</p>
                  </div>
                  <p className="text-xs text-slate-500">{formatDate(row.date)}</p>
                  <p className={`text-xs ${status === 'Overdue' ? 'font-bold text-rose-600' : 'text-slate-500'}`}>{row.dueDate ? `Échéance ${formatDate(row.dueDate)}` : '—'}</p>
                  <div className="flex items-center justify-between gap-3 lg:justify-end">
                    <Badge tone={statusTones[status]}>{statusLabels[status]}</Badge>
                    <div className="text-right">
                      <p className="text-sm font-bold text-slate-950">{formatMoney(row.amount)}</p>
                      {due > 0 && due < row.amount ? <p className="text-[11px] font-semibold text-amber-700">Reste {formatMoney(due)}</p> : null}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        ) : (
          <EmptyState
            icon={ReceiptText}
            title={onlyOpen ? 'Aucune facture à payer' : 'Aucune facture sur cette période'}
            text={onlyOpen ? 'Toutes les factures fournisseurs sont réglées.' : 'Enregistre les factures reçues de tes fournisseurs pour suivre ce que tu dois.'}
          />
        )}
      </section>

      {selected ? (
        <Modal title={`Facture ${selected.reference}`} description={`${selected.vendorName} · ${selected.category}`} onClose={() => setSelectedId(null)}>
          <div className="mb-4 flex flex-wrap gap-2">
            {remaining(selected) > 0 ? <button type="button" onClick={() => setPaying(selected)} className={buttonClass.primary}><Wallet className="size-4" />Payer</button> : null}
            {selected.paidCents === 0 && selected.status !== 'Cancelled' ? (
              <>
                <button type="button" onClick={() => setEditing(selected)} className={buttonClass.secondary}><Pencil className="size-4" />Modifier</button>
                <button type="button" onClick={() => void cancel(selected)} disabled={pending} className={buttonClass.secondary}><XCircle className="size-4" />Annuler</button>
              </>
            ) : null}
            {selected.paidCents === 0 ? <button type="button" onClick={() => void remove(selected)} disabled={pending} className={buttonClass.secondary}><Trash2 className="size-4" />Supprimer</button> : null}
          </div>
          <dl className="grid gap-3 rounded border border-slate-200 p-4 text-sm sm:grid-cols-2">
            <Info label="Statut"><Badge tone={statusTones[displayStatus(selected)]}>{statusLabels[displayStatus(selected)]}</Badge></Info>
            <Info label="Montant">{formatMoney(selected.amount)}</Info>
            <Info label="Date de la facture">{formatDate(selected.date)}</Info>
            <Info label="Échéance">{formatDate(selected.dueDate)}</Info>
            <Info label="Déjà payé">{formatMoney(selected.paidCents)}</Info>
            <Info label="Reste à payer">{formatMoney(remaining(selected))}</Info>
            {selected.notes ? <Info label="Note" wide>{selected.notes}</Info> : null}
          </dl>
          {selected.payments.length ? (
            <section className="mt-4 rounded border border-slate-200">
              <h3 className="border-b border-slate-200 px-4 py-3 text-sm font-bold text-slate-950">Paiements</h3>
              <div className="divide-y divide-slate-100">
                {selected.payments.map((payment) => (
                  <div key={payment.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <div>
                      <p className="font-semibold text-slate-800">{methodLabels[payment.method] ?? payment.method} · {payment.account.name}</p>
                      <p className="text-xs text-slate-500">{formatDate(payment.date)}{payment.reference && payment.reference !== selected.reference ? ` · ${payment.reference}` : ''}</p>
                    </div>
                    <p className="font-bold text-slate-950">−{formatMoney(payment.amount)}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </Modal>
      ) : null}

      {editing ? (
        <PurchaseInvoiceModal companySlug={companySlug} invoice={editing === 'new' ? null : editing} data={data} onClose={() => setEditing(null)} />
      ) : null}
      {paying ? (
        <PayModal companySlug={companySlug} invoice={paying} accounts={data.accounts.filter((account) => account.status !== 'Archived')} onClose={() => setPaying(null)} />
      ) : null}
    </main>
  )
}

function Info({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1 font-semibold text-slate-800">{children}</dd>
    </div>
  )
}

function PurchaseInvoiceModal({ companySlug, invoice, data, onClose }: { companySlug: string; invoice: PurchaseRow | null; data: PageData; onClose: () => void }) {
  const router = useRouter()
  const { run, pending } = useAction()
  const [paidNow, setPaidNow] = React.useState(false)
  const accounts = data.accounts.filter((account) => account.status !== 'Archived')
  const listId = React.useId()
  const vendorListId = React.useId()

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const common = {
      companySlug,
      vendorName: String(form.get('vendorName') ?? '').trim(),
      category: String(form.get('category') ?? ''),
      amount: Number(form.get('amount')),
      issueDate: String(form.get('issueDate') || '') || undefined,
      dueDate: String(form.get('dueDate') || '') || undefined,
      notes: String(form.get('notes') ?? ''),
    }
    const reference = String(form.get('reference') ?? '').trim()
    const result = await run(
      () => invoice
        ? updatePurchaseInvoice({ data: { ...common, invoiceId: invoice.id, reference: reference || invoice.reference || '' } })
        : createPurchaseInvoice({ data: { ...common, reference: reference || undefined, status: paidNow ? 'Paid' : 'Pending', accountId: paidNow ? String(form.get('accountId') || '') || undefined : undefined } }),
      invoice ? 'Facture modifiée.' : 'Facture enregistrée.',
    )
    if (!result) return
    onClose()
    await router.invalidate()
  }

  return (
    <Modal title={invoice ? 'Modifier la facture' : 'Nouvelle facture fournisseur'} onClose={onClose}>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Fournisseur">
          <input name="vendorName" required list={vendorListId} defaultValue={invoice?.vendorName ?? ''} autoFocus className={inputClass} />
          <datalist id={vendorListId}>{data.vendors.map((vendor) => <option key={vendor.id} value={vendor.name} />)}</datalist>
        </Field>
        <Field label="N° de la facture fournisseur" hint={invoice ? undefined : 'Laisse vide pour un numéro automatique.'}>
          <input name="reference" defaultValue={invoice?.reference ?? ''} className={inputClass} />
        </Field>
        <Field label="Montant TTC"><MoneyInput name="amount" required defaultValue={invoice?.amount ?? null} /></Field>
        <Field label="Catégorie">
          <input name="category" required list={listId} defaultValue={invoice?.category ?? purchaseCategories[0]} className={inputClass} />
          <datalist id={listId}>{purchaseCategories.map((category) => <option key={category} value={category} />)}</datalist>
        </Field>
        <Field label="Date de la facture"><input name="issueDate" type="date" defaultValue={toDateInput(invoice?.date ?? new Date())} className={inputClass} /></Field>
        <Field label="Échéance"><input name="dueDate" type="date" defaultValue={toDateInput(invoice?.dueDate)} className={inputClass} /></Field>
        <Field label="Note" className="sm:col-span-2"><textarea name="notes" rows={2} defaultValue={invoice?.notes ?? ''} className={inputClass} /></Field>
        {invoice ? null : (
          <div className="rounded border border-slate-200 p-3 sm:col-span-2">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input type="checkbox" checked={paidNow} onChange={(event) => setPaidNow(event.target.checked)} />
              Déjà payée en totalité
            </label>
            {paidNow ? (
              <div className="mt-3">
                <Field label="Payée depuis">
                  <select name="accountId" className={inputClass}>
                    {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                  </select>
                </Field>
              </div>
            ) : null}
          </div>
        )}
        <div className="sm:col-span-2"><FormActions onCancel={onClose} pending={pending} submitLabel={invoice ? 'Enregistrer' : 'Enregistrer la facture'} /></div>
      </form>
    </Modal>
  )
}

function PayModal({ companySlug, invoice, accounts, onClose }: { companySlug: string; invoice: PurchaseRow; accounts: PageData['accounts']; onClose: () => void }) {
  const router = useRouter()
  const { formatMoney } = useMoney()
  const { run, pending } = useAction()
  const due = remaining(invoice)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const result = await run(() => recordPurchaseInvoicePayment({
      data: {
        companySlug,
        invoiceId: invoice.id,
        accountId: String(form.get('accountId')),
        amount: Number(form.get('amount')),
        method: String(form.get('method')) as 'Cash',
        date: String(form.get('date') || '') || undefined,
        reference: String(form.get('reference') ?? ''),
      },
    }), 'Paiement enregistré.')
    if (!result) return
    onClose()
    await router.invalidate()
  }

  return (
    <Modal title="Payer le fournisseur" description={`${invoice.vendorName} · ${invoice.reference} · reste ${formatMoney(due)}`} onClose={onClose} size="sm">
      {accounts.length ? (
        <form onSubmit={submit} className="grid gap-4">
          <Field label="Montant payé"><MoneyInput name="amount" defaultValue={due} required autoFocus /></Field>
          <Field label="Mode de paiement">
            <select name="method" defaultValue="Cash" className={inputClass}>
              {Object.entries(methodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
          <Field label="Payé depuis">
            <select name="accountId" required className={inputClass}>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
          </Field>
          <Field label="Date"><input name="date" type="date" defaultValue={toDateInput(new Date())} className={inputClass} /></Field>
          <Field label="Référence (optionnel)"><input name="reference" className={inputClass} /></Field>
          <FormActions onCancel={onClose} pending={pending} submitLabel="Enregistrer le paiement" />
        </form>
      ) : (
        <EmptyState icon={Wallet} title="Aucun compte de trésorerie" text="Crée d'abord un compte dans Finance > Comptes & caisse." />
      )}
    </Modal>
  )
}
