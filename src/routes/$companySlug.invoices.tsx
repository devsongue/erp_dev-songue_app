import { createFileRoute, useRouter } from '@tanstack/react-router'
import { AlertTriangle, Building2, CheckCircle2, FileCheck2, FilePlus2, Pencil, Plus, Printer, ReceiptText, Search, Send, Trash2, Wallet, X, XCircle } from 'lucide-react'
import * as React from 'react'
import { useMoney } from '~/context/CompanyContext'
import { Badge, EmptyState, Field, Modal, PageHeader, StatCard, buttonClass, formatDate, inputClass, toDateInput, useAction, useFeedback, MoneyInput } from '~/components/ui'
import { getSalesInvoicesData } from '~/server/dataFetchers'
import {
  cancelSalesInvoice,
  createInvoiceFromQuote,
  createSalesInvoice,
  deleteSalesInvoice,
  issueSalesInvoice,
  recordSalesInvoicePayment,
  updateSalesInvoice,
} from '~/server/operations'

export const Route = createFileRoute('/$companySlug/invoices')({
  loader: ({ params }) => getSalesInvoicesData({ data: { companySlug: params.companySlug } }),
  component: InvoicesPage,
})

type PageData = Awaited<ReturnType<typeof getSalesInvoicesData>>
type Invoice = PageData['invoices'][number]
type DisplayStatus = 'Draft' | 'Sent' | 'PartiallyPaid' | 'Paid' | 'Overdue' | 'Cancelled'
type Filter = 'all' | 'Draft' | 'open' | 'Overdue' | 'Paid' | 'Cancelled'

const statusLabels: Record<DisplayStatus, string> = {
  Draft: 'Brouillon',
  Sent: 'À encaisser',
  PartiallyPaid: 'Paiement partiel',
  Paid: 'Payée',
  Overdue: 'En retard',
  Cancelled: 'Annulée',
}

const statusTones: Record<DisplayStatus, 'slate' | 'blue' | 'amber' | 'green' | 'red'> = {
  Draft: 'slate',
  Sent: 'blue',
  PartiallyPaid: 'amber',
  Paid: 'green',
  Overdue: 'red',
  Cancelled: 'slate',
}

const methodLabels: Record<string, string> = {
  Cash: 'Espèces',
  MobileMoney: 'Mobile money',
  Card: 'Carte',
  BankTransfer: 'Virement',
  Cheque: 'Chèque',
}

const filters: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: 'Toutes' },
  { key: 'Draft', label: 'Brouillons' },
  { key: 'open', label: 'À encaisser' },
  { key: 'Overdue', label: 'En retard' },
  { key: 'Paid', label: 'Payées' },
  { key: 'Cancelled', label: 'Annulées' },
]

function displayStatus(invoice: Pick<Invoice, 'status' | 'dueDate'>): DisplayStatus {
  const open = invoice.status === 'Sent' || invoice.status === 'PartiallyPaid' || invoice.status === 'Overdue'
  if (open && invoice.dueDate && new Date(invoice.dueDate) < startOfToday()) return 'Overdue'
  return (invoice.status === 'Overdue' ? 'Sent' : invoice.status) as DisplayStatus
}

function startOfToday() {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  return date
}

function remaining(invoice: Pick<Invoice, 'totalCents' | 'paidCents' | 'status'>) {
  if (invoice.status === 'Draft' || invoice.status === 'Cancelled') return 0
  return Math.max(0, invoice.totalCents - invoice.paidCents)
}

function InvoicesPage() {
  const { companySlug } = Route.useParams()
  const data = Route.useLoaderData()
  const router = useRouter()
  const { formatMoney } = useMoney()
  const { confirm } = useFeedback()
  const { run, pending } = useAction()
  const [filter, setFilter] = React.useState<Filter>('all')
  const [query, setQuery] = React.useState('')
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [editing, setEditing] = React.useState<Invoice | 'new' | null>(null)
  const [paying, setPaying] = React.useState<Invoice | null>(null)
  const [pickingQuote, setPickingQuote] = React.useState(false)

  const selected = data.invoices.find((invoice) => invoice.id === selectedId) ?? null

  const counts = React.useMemo(() => {
    const result: Record<Filter, number> = { all: data.invoices.length, Draft: 0, open: 0, Overdue: 0, Paid: 0, Cancelled: 0 }
    for (const invoice of data.invoices) {
      const status = displayStatus(invoice)
      if (status === 'Draft') result.Draft++
      if (status === 'Sent' || status === 'PartiallyPaid' || status === 'Overdue') result.open++
      if (status === 'Overdue') result.Overdue++
      if (status === 'Paid') result.Paid++
      if (status === 'Cancelled') result.Cancelled++
    }
    return result
  }, [data.invoices])

  const visible = React.useMemo(() => {
    const needle = query.trim().toLowerCase()
    return data.invoices.filter((invoice) => {
      const status = displayStatus(invoice)
      const matchesFilter = filter === 'all'
        || (filter === 'open' ? ['Sent', 'PartiallyPaid', 'Overdue'].includes(status) : status === filter)
      if (!matchesFilter) return false
      if (!needle) return true
      return [invoice.number, invoice.customer?.name, invoice.quote?.reference].some((value) => value?.toLowerCase().includes(needle))
    })
  }, [data.invoices, filter, query])

  const totals = React.useMemo(() => {
    let due = 0
    let overdue = 0
    let collectedThisMonth = 0
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)
    for (const invoice of data.invoices) {
      due += remaining(invoice)
      if (displayStatus(invoice) === 'Overdue') overdue += remaining(invoice)
      for (const payment of invoice.payments) {
        if (new Date(payment.date) >= monthStart) collectedThisMonth += payment.amount
      }
    }
    return { due, overdue, collectedThisMonth }
  }, [data.invoices])

  async function refresh() {
    await router.invalidate()
  }

  async function issue(invoice: Invoice) {
    const ok = await confirm({
      title: 'Émettre cette facture ?',
      message: 'Elle recevra un numéro définitif et ne pourra plus être modifiée.',
      confirmLabel: 'Émettre',
    })
    if (!ok) return
    const result = await run(() => issueSalesInvoice({ data: { companySlug, invoiceId: invoice.id } }), 'Facture émise.')
    if (result) await refresh()
  }

  async function cancel(invoice: Invoice) {
    const ok = await confirm({
      title: 'Annuler cette facture ?',
      message: `La facture ${invoice.number} restera dans l'historique avec le statut « Annulée ».`,
      confirmLabel: 'Annuler la facture',
      danger: true,
    })
    if (!ok) return
    const result = await run(() => cancelSalesInvoice({ data: { companySlug, invoiceId: invoice.id } }), 'Facture annulée.')
    if (result) await refresh()
  }

  async function remove(invoice: Invoice) {
    const ok = await confirm({ title: 'Supprimer ce brouillon ?', message: 'Cette action est définitive.', confirmLabel: 'Supprimer', danger: true })
    if (!ok) return
    const result = await run(() => deleteSalesInvoice({ data: { companySlug, invoiceId: invoice.id } }), 'Brouillon supprimé.')
    if (!result) return
    setSelectedId(null)
    await refresh()
  }

  async function fromQuote(quoteId: string) {
    const invoice = await run(() => createInvoiceFromQuote({ data: { companySlug, quoteId } }), 'Brouillon créé depuis le devis.')
    if (!invoice) return
    setPickingQuote(false)
    await refresh()
    setSelectedId(invoice.id)
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Ventes"
        title="Factures"
        description="Brouillons, factures émises, encaissements et relances."
        actions={(
          <>
            {data.quotes.length ? (
              <button type="button" onClick={() => setPickingQuote(true)} className={buttonClass.secondary}>
                <FileCheck2 className="size-4" />Depuis un devis
              </button>
            ) : null}
            <button type="button" onClick={() => setEditing('new')} className={buttonClass.primary}>
              <Plus className="size-4" />Nouvelle facture
            </button>
          </>
        )}
      />

      <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Reste à encaisser" value={formatMoney(totals.due)} icon={Wallet} detail={`${counts.open} facture${counts.open > 1 ? 's' : ''} ouverte${counts.open > 1 ? 's' : ''}`} />
        <StatCard title="En retard" value={formatMoney(totals.overdue)} icon={AlertTriangle} tone={totals.overdue > 0 ? 'alert' : 'default'} detail={`${counts.Overdue} échéance${counts.Overdue > 1 ? 's' : ''} dépassée${counts.Overdue > 1 ? 's' : ''}`} />
        <StatCard title="Encaissé ce mois" value={formatMoney(totals.collectedThisMonth)} icon={CheckCircle2} tone="success" />
        <StatCard title="Brouillons" value={counts.Draft.toString()} icon={FilePlus2} detail="À finaliser et émettre" />
      </section>

      <section className="neon-surface overflow-hidden rounded">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-1" role="tablist">
            {filters.map((item) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={filter === item.key}
                onClick={() => setFilter(item.key)}
                className={`shrink-0 rounded px-3 py-1.5 text-xs font-bold ${filter === item.key ? 'bg-slate-950 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
              >
                {item.label} <span className="opacity-60">{counts[item.key]}</span>
              </button>
            ))}
          </div>
          <label className="relative block lg:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Numéro, client, devis" className={`${inputClass} pl-9`} />
          </label>
        </div>

        {visible.length ? (
          <div className="divide-y divide-slate-100">
            {visible.map((invoice) => {
              const status = displayStatus(invoice)
              const due = remaining(invoice)
              return (
                <button
                  key={invoice.id}
                  type="button"
                  onClick={() => setSelectedId(invoice.id)}
                  className="list-row grid w-full gap-2 px-4 py-4 text-left sm:px-5 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.5fr)_minmax(0,1fr)_auto] md:items-center"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-bold text-slate-950">{invoice.status === 'Draft' ? 'Brouillon' : invoice.number}</p>
                    <p className="text-xs text-slate-500">
                      {invoice.status === 'Draft' ? `Créé le ${formatDate(invoice.createdAt)}` : `Émise le ${formatDate(invoice.issueDate)}`}
                      {invoice.quote ? ` · ${invoice.quote.reference}` : ''}
                    </p>
                  </div>
                  <p className="truncate text-sm font-semibold text-slate-700">{invoice.customer?.name ?? 'Client comptoir'}</p>
                  <p className={`text-xs ${status === 'Overdue' ? 'font-bold text-rose-600' : 'text-slate-500'}`}>
                    {invoice.dueDate ? `Échéance ${formatDate(invoice.dueDate)}` : 'Sans échéance'}
                  </p>
                  <div className="flex items-center justify-between gap-3 md:justify-end">
                    <Badge tone={statusTones[status]}>{statusLabels[status]}</Badge>
                    <div className="text-right">
                      <p className="text-sm font-bold text-slate-950">{formatMoney(invoice.totalCents)}</p>
                      {due > 0 && due < invoice.totalCents ? <p className="text-[11px] font-semibold text-amber-700">Reste {formatMoney(due)}</p> : null}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        ) : (
          <EmptyState
            icon={ReceiptText}
            title={data.invoices.length ? 'Aucune facture dans cette vue' : 'Aucune facture pour le moment'}
            text={data.invoices.length ? 'Change de filtre ou de recherche.' : 'Crée ta première facture, ou transforme un devis accepté en facture.'}
            action={data.invoices.length ? null : <button type="button" onClick={() => setEditing('new')} className={buttonClass.primary}><Plus className="size-4" />Nouvelle facture</button>}
          />
        )}
      </section>

      {selected ? (
        <Modal title={selected.status === 'Draft' ? 'Brouillon de facture' : `Facture ${selected.number}`} onClose={() => setSelectedId(null)} size="lg">
          <div className="no-print mb-4 flex flex-wrap gap-2">
            {selected.status === 'Draft' ? (
              <>
                <button type="button" onClick={() => setEditing(selected)} className={buttonClass.secondary}><Pencil className="size-4" />Modifier</button>
                <button type="button" onClick={() => void issue(selected)} disabled={pending} className={buttonClass.primary}><Send className="size-4" />Émettre</button>
                <button type="button" onClick={() => void remove(selected)} disabled={pending} className={buttonClass.secondary}><Trash2 className="size-4" />Supprimer</button>
              </>
            ) : null}
            {remaining(selected) > 0 ? (
              <button type="button" onClick={() => setPaying(selected)} className={buttonClass.primary}><Wallet className="size-4" />Enregistrer un paiement</button>
            ) : null}
            {selected.status !== 'Draft' && selected.status !== 'Cancelled' && selected.paidCents === 0 ? (
              <button type="button" onClick={() => void cancel(selected)} disabled={pending} className={buttonClass.secondary}><XCircle className="size-4" />Annuler</button>
            ) : null}
            <button type="button" onClick={() => window.print()} className={buttonClass.secondary}><Printer className="size-4" />Imprimer</button>
          </div>

          <InvoicePrint invoice={selected} settings={data.settings} companyName={data.companyName} />

          {selected.payments.length ? (
            <section className="no-print mt-5 rounded border border-slate-200">
              <h3 className="border-b border-slate-200 px-4 py-3 text-sm font-bold text-slate-950">Paiements reçus</h3>
              <div className="divide-y divide-slate-100">
                {selected.payments.map((payment) => (
                  <div key={payment.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <div>
                      <p className="font-semibold text-slate-800">{methodLabels[payment.method] ?? payment.method} · {payment.account.name}</p>
                      <p className="text-xs text-slate-500">{formatDate(payment.date)}{payment.reference && payment.reference !== selected.number ? ` · ${payment.reference}` : ''}</p>
                    </div>
                    <p className="font-bold text-emerald-700">+{formatMoney(payment.amount)}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </Modal>
      ) : null}

      {editing ? (
        <InvoiceEditor
          companySlug={companySlug}
          invoice={editing === 'new' ? null : editing}
          customers={data.customers}
          items={data.items}
          onClose={() => setEditing(null)}
          onSaved={async (invoice) => {
            setEditing(null)
            await refresh()
            setSelectedId(invoice.id)
          }}
        />
      ) : null}

      {paying ? (
        <PaymentModal
          companySlug={companySlug}
          invoice={paying}
          accounts={data.accounts}
          onClose={() => setPaying(null)}
          onSaved={async () => {
            setPaying(null)
            await refresh()
          }}
        />
      ) : null}

      {pickingQuote ? (
        <Modal title="Facturer un devis" description="Le devis est recopié dans un brouillon que tu pourras ajuster avant de l'émettre." onClose={() => setPickingQuote(false)}>
          <div className="divide-y divide-slate-100 rounded border border-slate-200">
            {data.quotes.map((quote) => (
              <div key={quote.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-950">{quote.reference} · {quote.title}</p>
                  <p className="truncate text-xs text-slate-500">{quote.customer?.name ?? 'Client libre'} · {formatMoney(quote.totalCents)}</p>
                </div>
                <button type="button" disabled={pending} onClick={() => void fromQuote(quote.id)} className={buttonClass.secondary}>Facturer</button>
              </div>
            ))}
          </div>
        </Modal>
      ) : null}
    </main>
  )
}

type EditorLine = { key: number; itemId: string; description: string; quantity: string; unitPrice: string }

function InvoiceEditor({ companySlug, invoice, customers, items, onClose, onSaved }: {
  companySlug: string
  invoice: Invoice | null
  customers: PageData['customers']
  items: PageData['items']
  onClose: () => void
  onSaved: (invoice: Invoice) => Promise<void>
}) {
  const { formatMoney } = useMoney()
  const { run, pending } = useAction()
  const nextKey = React.useRef(1)
  const newLine = (): EditorLine => ({ key: nextKey.current++, itemId: '', description: '', quantity: '1', unitPrice: '0' })
  const [customerId, setCustomerId] = React.useState(invoice?.customerId ?? '')
  const [customerName, setCustomerName] = React.useState('')
  const [dueDate, setDueDate] = React.useState(toDateInput(invoice?.dueDate) || defaultDueDate())
  const [discountRate, setDiscountRate] = React.useState(String(invoice?.discountRate ?? 0))
  const [taxRate, setTaxRate] = React.useState(String(invoice?.taxRate ?? 0))
  const [notes, setNotes] = React.useState(invoice?.notes ?? '')
  const [lines, setLines] = React.useState<EditorLine[]>(() => invoice?.lines.length
    ? invoice.lines.map((line) => ({ key: nextKey.current++, itemId: line.itemId ?? '', description: line.description, quantity: String(line.quantity), unitPrice: String(line.unitPrice) }))
    : [newLine()])

  const subtotal = lines.reduce((sum, line) => sum + Math.round((Number(line.quantity) || 0) * (Number(line.unitPrice) || 0)), 0)
  const discount = Math.round(subtotal * ((Number(discountRate) || 0) / 100))
  const taxable = Math.max(0, subtotal - discount)
  const tax = Math.round(taxable * ((Number(taxRate) || 0) / 100))
  const total = taxable + tax

  function updateLine(key: number, patch: Partial<EditorLine>) {
    setLines((current) => current.map((line) => line.key === key ? { ...line, ...patch } : line))
  }

  function pickItem(key: number, itemId: string) {
    const item = items.find((candidate) => candidate.id === itemId)
    updateLine(key, item ? { itemId, description: item.name, unitPrice: String(item.price) } : { itemId: '' })
  }

  async function save(issue: boolean) {
    const payloadLines = lines
      .filter((line) => line.description.trim())
      .map((line) => ({ itemId: line.itemId || undefined, description: line.description.trim(), quantity: Math.max(1, Math.round(Number(line.quantity) || 1)), unitPrice: Math.max(0, Number(line.unitPrice) || 0) }))
    if (!payloadLines.length) {
      await run(() => Promise.reject(new Error('Ajoute au moins une ligne avec une description.')))
      return
    }
    const payload = {
      companySlug,
      customerId: customerId && customerId !== '__new' ? customerId : undefined,
      customerName: customerId === '__new' ? customerName : undefined,
      dueDate: dueDate || undefined,
      discountRate: Number(discountRate) || 0,
      taxRate: Number(taxRate) || 0,
      notes,
      lines: payloadLines,
      issue,
    }
    const result = await run(
      () => invoice ? updateSalesInvoice({ data: { ...payload, invoiceId: invoice.id } }) : createSalesInvoice({ data: payload }),
      issue ? 'Facture émise.' : 'Brouillon enregistré.',
    )
    if (result) await onSaved(result as unknown as Invoice)
  }

  return (
    <Modal title={invoice ? 'Modifier le brouillon' : 'Nouvelle facture'} onClose={onClose} size="lg">
      <form onSubmit={(event) => { event.preventDefault(); void save(false) }}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Client">
            <select value={customerId} onChange={(event) => setCustomerId(event.target.value)} className={inputClass}>
              <option value="">Client comptoir (sans nom)</option>
              {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
              <option value="__new">+ Nouveau client…</option>
            </select>
          </Field>
          {customerId === '__new' ? (
            <Field label="Nom du nouveau client">
              <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} required className={inputClass} />
            </Field>
          ) : (
            <Field label="Échéance de paiement">
              <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className={inputClass} />
            </Field>
          )}
          {customerId === '__new' ? (
            <Field label="Échéance de paiement">
              <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className={inputClass} />
            </Field>
          ) : null}
        </div>

        <div className="mt-5">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Lignes</p>
          <div className="space-y-2">
            {lines.map((line) => (
              <div key={line.key} className="grid gap-2 rounded border border-slate-200 p-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_4.5rem_9rem_7rem_auto] sm:items-center">
                <select value={line.itemId} onChange={(event) => pickItem(line.key, event.target.value)} aria-label="Article du catalogue" className={inputClass}>
                  <option value="">Ligne libre</option>
                  {items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
                <input value={line.description} onChange={(event) => updateLine(line.key, { description: event.target.value })} placeholder="Description" aria-label="Description" className={inputClass} />
                <input type="number" min="1" value={line.quantity} onChange={(event) => updateLine(line.key, { quantity: event.target.value })} aria-label="Quantité" className={inputClass} />
                <MoneyInput value={line.unitPrice} onChange={(value) => updateLine(line.key, { unitPrice: value })} aria-label="Prix unitaire" />
                <p className="text-right text-sm font-bold text-slate-950">{formatMoney(Math.round((Number(line.quantity) || 0) * (Number(line.unitPrice) || 0)))}</p>
                <button type="button" onClick={() => setLines((current) => current.length > 1 ? current.filter((item) => item.key !== line.key) : current)} disabled={lines.length === 1} className={buttonClass.icon} aria-label="Retirer la ligne">
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setLines((current) => [...current, newLine()])} className={`${buttonClass.secondary} mt-2`}>
            <Plus className="size-4" />Ajouter une ligne
          </button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Remise (%)"><input type="number" min="0" max="100" value={discountRate} onChange={(event) => setDiscountRate(event.target.value)} className={inputClass} /></Field>
            <Field label="TVA (%)" hint="18 % en Côte d'Ivoire et au Sénégal."><input type="number" min="0" max="100" value={taxRate} onChange={(event) => setTaxRate(event.target.value)} className={inputClass} /></Field>
            <Field label="Note sur la facture" className="sm:col-span-2"><textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} className={inputClass} /></Field>
          </div>
          <div className="space-y-1.5 rounded border border-slate-200 bg-slate-50 p-4 text-sm">
            <AmountRow label="Sous-total" value={formatMoney(subtotal)} />
            {discount ? <AmountRow label="Remise" value={`− ${formatMoney(discount)}`} /> : null}
            {tax ? <AmountRow label="TVA" value={formatMoney(tax)} /> : null}
            <div className="border-t border-slate-200 pt-2"><AmountRow label="Total" value={formatMoney(total)} strong /></div>
          </div>
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className={buttonClass.secondary}>Annuler</button>
          <button type="submit" disabled={pending} className={buttonClass.secondary}>Enregistrer le brouillon</button>
          <button type="button" disabled={pending || total <= 0} onClick={() => void save(true)} className={buttonClass.primary}><Send className="size-4" />Émettre la facture</button>
        </div>
      </form>
    </Modal>
  )
}

function PaymentModal({ companySlug, invoice, accounts, onClose, onSaved }: {
  companySlug: string
  invoice: Invoice
  accounts: PageData['accounts']
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const { formatMoney } = useMoney()
  const { run, pending } = useAction()
  const due = remaining(invoice)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const result = await run(() => recordSalesInvoicePayment({
      data: {
        companySlug,
        invoiceId: invoice.id,
        accountId: String(form.get('accountId')),
        amount: Number(form.get('amount')),
        method: String(form.get('method')) as 'Cash',
        date: String(form.get('date') || '') || undefined,
        reference: String(form.get('reference') || ''),
      },
    }), 'Paiement enregistré.')
    if (result) await onSaved()
  }

  return (
    <Modal title="Enregistrer un paiement" description={`${invoice.number} · reste ${formatMoney(due)}`} onClose={onClose} size="sm">
      {accounts.length ? (
        <form onSubmit={submit} className="grid gap-4">
          <Field label="Montant reçu"><MoneyInput name="amount" defaultValue={due} required autoFocus /></Field>
          <Field label="Mode de paiement">
            <select name="method" defaultValue="Cash" className={inputClass}>
              {Object.entries(methodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
          <Field label="Encaissé sur">
            <select name="accountId" required className={inputClass}>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
          </Field>
          <Field label="Date"><input name="date" type="date" defaultValue={toDateInput(new Date())} className={inputClass} /></Field>
          <Field label="Référence (optionnel)" hint="N° de transaction mobile money, de chèque…"><input name="reference" className={inputClass} /></Field>
          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} className={buttonClass.secondary}>Annuler</button>
            <button type="submit" disabled={pending} className={buttonClass.primary}>{pending ? 'Enregistrement…' : 'Enregistrer'}</button>
          </div>
        </form>
      ) : (
        <EmptyState icon={Wallet} title="Aucun compte de trésorerie" text="Crée d'abord une caisse ou un compte bancaire dans Finance > Comptes & caisse." />
      )}
    </Modal>
  )
}

function InvoicePrint({ invoice, settings, companyName }: { invoice: Invoice; settings: PageData['settings']; companyName: string }) {
  const { formatMoney } = useMoney()
  const status = displayStatus(invoice)
  const due = remaining(invoice)
  return (
    <div className="quote-print-area overflow-hidden rounded border border-slate-200 bg-white text-slate-950">
      <div className="p-6" style={{ borderTop: `6px solid ${settings?.accentColor || '#0f172a'}` }}>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            {settings?.logoUrl ? <img src={settings.logoUrl} alt="" className="mb-3 h-12 max-w-36 object-contain" /> : <Building2 className="mb-3 size-10 text-slate-300" />}
            <h2 className="text-lg font-bold text-slate-950">{settings?.legalName || companyName}</h2>
            {settings?.address ? <p className="mt-1 whitespace-pre-line text-xs leading-5 text-slate-500">{settings.address}</p> : null}
            <p className="mt-2 text-xs text-slate-500">{[settings?.phone, settings?.email].filter(Boolean).join(' · ')}</p>
            {settings?.taxId ? <p className="mt-1 text-xs text-slate-500">{settings.taxId}</p> : null}
          </div>
          <div className="sm:text-right">
            <p className="text-2xl font-black uppercase text-slate-950">{invoice.status === 'Draft' ? 'Brouillon' : 'Facture'}</p>
            {invoice.status !== 'Draft' ? <p className="mt-1 font-mono text-sm font-bold text-slate-500">{invoice.number}</p> : null}
            <p className="mt-4 text-xs text-slate-500">Date : {formatDate(invoice.issueDate)}</p>
            {invoice.dueDate ? <p className="text-xs text-slate-500">Échéance : {formatDate(invoice.dueDate)}</p> : null}
            {invoice.quote ? <p className="text-xs text-slate-500">Devis : {invoice.quote.reference}</p> : null}
          </div>
        </div>

        <div className="mt-8 grid gap-4 border-y border-slate-200 py-4 sm:grid-cols-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Facturé à</p>
            <p className="mt-1 font-bold text-slate-950">{invoice.customer?.name ?? 'Client comptoir'}</p>
            {invoice.customer?.address || invoice.customer?.city ? <p className="text-xs text-slate-500">{[invoice.customer.address, invoice.customer.city].filter(Boolean).join(', ')}</p> : null}
            {invoice.customer?.phone ? <p className="text-xs text-slate-500">{invoice.customer.phone}</p> : null}
            {invoice.customer?.taxId ? <p className="text-xs text-slate-500">NIF : {invoice.customer.taxId}</p> : null}
          </div>
          <div className="sm:text-right">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Statut</p>
            <div className="mt-1"><Badge tone={statusTones[status]}>{statusLabels[status]}</Badge></div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="mt-6 w-full min-w-[28rem] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                <th className="py-2 font-bold">Description</th>
                <th className="py-2 text-right font-bold">Qté</th>
                <th className="py-2 text-right font-bold">PU</th>
                <th className="py-2 text-right font-bold">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoice.lines.length ? invoice.lines.map((line) => (
                <tr key={line.id}>
                  <td className="py-3 font-semibold text-slate-800">{line.description}</td>
                  <td className="py-3 text-right text-slate-600">{line.quantity}</td>
                  <td className="py-3 text-right text-slate-600">{formatMoney(line.unitPrice)}</td>
                  <td className="py-3 text-right font-bold text-slate-950">{formatMoney(line.totalCents)}</td>
                </tr>
              )) : (
                <tr><td colSpan={4} className="py-3 text-slate-500">Facture sans détail de lignes.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex justify-end">
          <div className="w-full max-w-xs space-y-2 text-sm">
            <AmountRow label="Sous-total" value={formatMoney(invoice.subtotalCents)} />
            {invoice.discountCents ? <AmountRow label={`Remise (${invoice.discountRate} %)`} value={`− ${formatMoney(invoice.discountCents)}`} /> : null}
            {invoice.taxCents ? <AmountRow label={`TVA (${invoice.taxRate} %)`} value={formatMoney(invoice.taxCents)} /> : null}
            <div className="border-t border-slate-200 pt-2"><AmountRow label="Total TTC" value={formatMoney(invoice.totalCents)} strong /></div>
            {invoice.paidCents ? <AmountRow label="Déjà payé" value={`− ${formatMoney(invoice.paidCents)}`} /> : null}
            {invoice.paidCents && due ? <AmountRow label="Reste à payer" value={formatMoney(due)} strong /> : null}
          </div>
        </div>

        {invoice.notes ? (
          <div className="mt-6 rounded border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Note</p>
            <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{invoice.notes}</p>
          </div>
        ) : null}

        <div className="mt-6 grid gap-4 text-xs leading-5 text-slate-500 sm:grid-cols-2">
          <div>
            <p className="font-bold uppercase tracking-widest text-slate-400">Conditions</p>
            <p className="mt-1">{invoice.dueDate ? `Paiement à régler avant le ${formatDate(invoice.dueDate)}.` : 'Paiement à réception de la facture.'}</p>
          </div>
          <div className="sm:text-right">
            <p className="mt-1 whitespace-pre-line">{settings?.footerNote ?? 'Merci pour votre confiance.'}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function AmountRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-4 ${strong ? 'text-base font-bold text-slate-950' : 'text-slate-600'}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}

function defaultDueDate() {
  const date = new Date()
  date.setDate(date.getDate() + 30)
  return toDateInput(date)
}
