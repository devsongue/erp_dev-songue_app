import { createFileRoute, useRouter } from '@tanstack/react-router'
import { Mail, MapPin, Pencil, Phone, Plus, Search, Trash2, Users, Wallet } from 'lucide-react'
import * as React from 'react'
import { useMoney } from '~/context/CompanyContext'
import { Badge, EmptyState, Field, FormActions, Modal, PageHeader, StatCard, buttonClass, inputClass, useAction, useFeedback } from '~/components/ui'
import { getCustomersData } from '~/server/dataFetchers'
import { createCustomer, deleteCustomer, updateCustomer } from '~/server/operations'
import { downloadCsv } from '~/utils/csvExport'

export const Route = createFileRoute('/$companySlug/crm/customers')({
  loader: ({ params }) => getCustomersData({ data: { companySlug: params.companySlug } }),
  component: CustomersPage,
})

type Customer = Awaited<ReturnType<typeof getCustomersData>>['customers'][number]

function CustomersPage() {
  const { companySlug } = Route.useParams()
  const { customers } = Route.useLoaderData()
  const router = useRouter()
  const { formatMoney } = useMoney()
  const { confirm } = useFeedback()
  const { run, pending } = useAction()
  const [query, setQuery] = React.useState('')
  const [editing, setEditing] = React.useState<Customer | 'new' | null>(null)

  const visible = React.useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return customers
    return customers.filter((customer) =>
      [customer.name, customer.email, customer.phone, customer.city].some((value) => value?.toLowerCase().includes(needle)),
    )
  }, [customers, query])

  const totalDue = customers.reduce((sum, customer) => sum + customer.balanceDue, 0)
  const withDebt = customers.filter((customer) => customer.balanceDue > 0).length

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const payload = {
      companySlug,
      name: String(form.get('name') ?? ''),
      email: String(form.get('email') ?? ''),
      phone: String(form.get('phone') ?? ''),
      address: String(form.get('address') ?? ''),
      city: String(form.get('city') ?? ''),
      taxId: String(form.get('taxId') ?? ''),
      notes: String(form.get('notes') ?? ''),
    }
    const current = editing
    const result = await run(
      () => current && current !== 'new'
        ? updateCustomer({ data: { ...payload, customerId: current.id } })
        : createCustomer({ data: payload }),
      current && current !== 'new' ? 'Client modifié.' : 'Client ajouté.',
    )
    if (!result) return
    setEditing(null)
    await router.invalidate()
  }

  async function remove(customer: Customer) {
    const ok = await confirm({
      title: 'Supprimer ce client ?',
      message: `« ${customer.name} » sera supprimé définitivement.`,
      confirmLabel: 'Supprimer',
      danger: true,
    })
    if (!ok) return
    const result = await run(() => deleteCustomer({ data: { companySlug, customerId: customer.id } }), 'Client supprimé.')
    if (result) await router.invalidate()
  }

  function exportCsv() {
    downloadCsv('clients.csv', visible, [
      { header: 'Nom', value: (c) => c.name },
      { header: 'Email', value: (c) => c.email },
      { header: 'Téléphone', value: (c) => c.phone },
      { header: 'Ville', value: (c) => c.city },
      { header: 'Adresse', value: (c) => c.address },
      { header: 'NIF', value: (c) => c.taxId },
      { header: "Chiffre d'affaires", value: (c) => c.revenue },
      { header: 'Solde dû', value: (c) => c.balanceDue },
    ])
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Clients"
        title="Fichier clients"
        description="Coordonnées, historique d'achat et montants restant à encaisser."
        actions={(
          <>
            <button type="button" onClick={exportCsv} disabled={!visible.length} className={buttonClass.secondary}>Exporter</button>
            <button type="button" onClick={() => setEditing('new')} className={buttonClass.primary}>
              <Plus className="size-4" />Nouveau client
            </button>
          </>
        )}
      />

      <section className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard title="Clients" value={customers.length.toString()} icon={Users} />
        <StatCard title="Reste à encaisser" value={formatMoney(totalDue)} icon={Wallet} tone={totalDue > 0 ? 'alert' : 'default'} />
        <StatCard title="Clients avec impayés" value={withDebt.toString()} detail="Factures émises non soldées" />
      </section>

      <section className="neon-surface overflow-hidden rounded">
        <div className="border-b border-slate-200 p-3">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher par nom, email, téléphone ou ville"
              className={`${inputClass} pl-9`}
            />
          </label>
        </div>

        {visible.length ? (
          <div className="divide-y divide-slate-100">
            {visible.map((customer) => (
              <article key={customer.id} className="list-row grid gap-3 px-4 py-4 sm:px-5 md:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_auto_auto] md:items-center">
                <div className="min-w-0">
                  <p className="truncate font-bold text-slate-950">{customer.name}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {customer.invoiceCount} facture{customer.invoiceCount > 1 ? 's' : ''} · {customer.ticketCount} ticket{customer.ticketCount > 1 ? 's' : ''}
                    {customer.taxId ? ` · NIF ${customer.taxId}` : ''}
                  </p>
                </div>
                <div className="min-w-0 space-y-0.5 text-xs text-slate-500">
                  {customer.phone ? <p className="flex items-center gap-1.5"><Phone className="size-3" />{customer.phone}</p> : null}
                  {customer.email ? <p className="flex items-center gap-1.5 truncate"><Mail className="size-3" />{customer.email}</p> : null}
                  {customer.city || customer.address ? <p className="flex items-center gap-1.5 truncate"><MapPin className="size-3" />{[customer.address, customer.city].filter(Boolean).join(', ')}</p> : null}
                  {!customer.phone && !customer.email && !customer.city && !customer.address ? <p>Aucune coordonnée</p> : null}
                </div>
                <div className="text-left md:text-right">
                  <p className="text-sm font-bold text-slate-950">{formatMoney(customer.revenue)}</p>
                  {customer.balanceDue > 0
                    ? <Badge tone="amber">Doit {formatMoney(customer.balanceDue)}</Badge>
                    : <p className="text-[11px] font-semibold text-slate-400">À jour</p>}
                </div>
                <div className="flex gap-2 md:justify-end">
                  <button type="button" onClick={() => setEditing(customer)} className={buttonClass.icon} aria-label={`Modifier ${customer.name}`}>
                    <Pencil className="size-3.5" />
                  </button>
                  <button type="button" onClick={() => void remove(customer)} disabled={pending} className={buttonClass.iconDanger} aria-label={`Supprimer ${customer.name}`}>
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Users}
            title={customers.length ? 'Aucun client ne correspond' : 'Aucun client pour le moment'}
            text={customers.length ? 'Essaie un autre mot-clé.' : 'Ajoute tes clients pour les retrouver en caisse, sur les devis et les factures.'}
            action={customers.length ? null : <button type="button" onClick={() => setEditing('new')} className={buttonClass.primary}><Plus className="size-4" />Ajouter un client</button>}
          />
        )}
      </section>

      {editing ? (
        <Modal title={editing === 'new' ? 'Nouveau client' : `Modifier ${editing.name}`} onClose={() => setEditing(null)}>
          <CustomerForm customer={editing === 'new' ? null : editing} onSubmit={save} onCancel={() => setEditing(null)} pending={pending} />
        </Modal>
      ) : null}
    </main>
  )
}

function CustomerForm({ customer, onSubmit, onCancel, pending }: {
  customer: Customer | null
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  onCancel: () => void
  pending: boolean
}) {
  return (
    <form onSubmit={onSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nom ou raison sociale" className="sm:col-span-2">
          <input name="name" required autoFocus defaultValue={customer?.name ?? ''} className={inputClass} />
        </Field>
        <Field label="Téléphone">
          <input name="phone" type="tel" defaultValue={customer?.phone ?? ''} className={inputClass} />
        </Field>
        <Field label="Email">
          <input name="email" type="email" defaultValue={customer?.email ?? ''} className={inputClass} />
        </Field>
        <Field label="Adresse">
          <input name="address" defaultValue={customer?.address ?? ''} className={inputClass} />
        </Field>
        <Field label="Ville">
          <input name="city" defaultValue={customer?.city ?? ''} className={inputClass} />
        </Field>
        <Field label="NIF / RCCM" hint="Affiché sur les factures pour les clients professionnels.">
          <input name="taxId" defaultValue={customer?.taxId ?? ''} className={inputClass} />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <textarea name="notes" rows={3} defaultValue={customer?.notes ?? ''} className={inputClass} />
        </Field>
      </div>
      <FormActions onCancel={onCancel} pending={pending} submitLabel={customer ? 'Enregistrer' : 'Ajouter le client'} />
    </form>
  )
}
