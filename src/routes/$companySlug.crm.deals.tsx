import { createFileRoute, useRouter } from '@tanstack/react-router'
import { Handshake, Pencil, Plus, Trash2 } from 'lucide-react'
import * as React from 'react'
import { useMoney } from '~/context/CompanyContext'
import { Badge, EmptyState, Field, FormActions, Modal, PageHeader, StatCard, buttonClass, formatDate, inputClass, toDateInput, useAction, useFeedback, MoneyInput } from '~/components/ui'
import { getCrmData } from '~/server/dataFetchers'
import { createCrmDeal, deleteCrmDeal, updateCrmDeal } from '~/server/operations'

export const Route = createFileRoute('/$companySlug/crm/deals')({
  loader: ({ params }) => getCrmData({ data: { companySlug: params.companySlug } }),
  component: DealsPage,
})

type CrmData = Awaited<ReturnType<typeof getCrmData>>
type Deal = CrmData['deals'][number]
type Stage = 'new' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost'
type Priority = 'Low' | 'Medium' | 'High'

const stages: Array<{ key: Stage; label: string }> = [
  { key: 'new', label: 'Nouveau' },
  { key: 'qualified', label: 'Qualifié' },
  { key: 'proposal', label: 'Proposition' },
  { key: 'negotiation', label: 'Négociation' },
  { key: 'won', label: 'Gagné' },
  { key: 'lost', label: 'Perdu' },
]

const priorityLabels: Record<Priority, string> = { Low: 'Basse', Medium: 'Moyenne', High: 'Haute' }
const priorityTones: Record<Priority, 'slate' | 'amber' | 'red'> = { Low: 'slate', Medium: 'amber', High: 'red' }

function DealsPage() {
  const { companySlug } = Route.useParams()
  const data = Route.useLoaderData()
  const router = useRouter()
  const { formatMoney } = useMoney()
  const { confirm } = useFeedback()
  const { run, pending } = useAction()
  const [editing, setEditing] = React.useState<Deal | 'new' | null>(null)

  const open = data.deals.filter((deal) => !['won', 'lost'].includes(deal.stageId))
  const won = data.deals.filter((deal) => deal.stageId === 'won')
  const pipeline = open.reduce((sum, deal) => sum + deal.value, 0)

  function payloadFrom(deal: Deal) {
    return {
      companySlug,
      contactId: deal.contactId,
      title: deal.title,
      value: deal.value,
      stageId: deal.stageId as Stage,
      priority: deal.priority as Priority,
      expectedCloseDate: toDateInput(deal.expectedCloseDate),
    }
  }

  async function moveTo(deal: Deal, stageId: Stage) {
    if (stageId === deal.stageId) return
    const result = await run(() => updateCrmDeal({ data: { ...payloadFrom(deal), stageId, dealId: deal.id } }), `Déplacée vers « ${stages.find((stage) => stage.key === stageId)?.label} ».`)
    if (result) await router.invalidate()
  }

  async function remove(deal: Deal) {
    const ok = await confirm({ title: 'Supprimer cette opportunité ?', message: `« ${deal.title} » sera supprimée définitivement.`, confirmLabel: 'Supprimer', danger: true })
    if (!ok) return
    const result = await run(() => deleteCrmDeal({ data: { companySlug, dealId: deal.id } }), 'Opportunité supprimée.')
    if (result) await router.invalidate()
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Clients"
        title="Opportunités"
        description="Suis tes affaires en cours, de la première prise de contact à la signature."
        actions={(
          <button type="button" onClick={() => setEditing('new')} disabled={!data.customers.length} className={buttonClass.primary} title={data.customers.length ? undefined : "Ajoute d'abord un client"}>
            <Plus className="size-4" />Nouvelle opportunité
          </button>
        )}
      />

      <section className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard title="En cours" value={formatMoney(pipeline)} icon={Handshake} detail={`${open.length} affaire${open.length > 1 ? 's' : ''}`} />
        <StatCard title="Gagnées" value={formatMoney(won.reduce((sum, deal) => sum + deal.value, 0))} tone="success" detail={`${won.length} affaire${won.length > 1 ? 's' : ''}`} />
        <StatCard title="Taux de réussite" value={`${won.length + data.deals.filter((deal) => deal.stageId === 'lost').length ? Math.round((won.length / (won.length + data.deals.filter((deal) => deal.stageId === 'lost').length)) * 100) : 0} %`} detail="Gagnées / affaires conclues" />
      </section>

      {data.deals.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {stages.map((stage) => {
            const deals = data.deals.filter((deal) => deal.stageId === stage.key)
            const total = deals.reduce((sum, deal) => sum + deal.value, 0)
            return (
              <section key={stage.key} className="neon-surface rounded p-3">
                <header className="mb-3 flex items-center justify-between gap-2 px-1">
                  <h2 className="text-sm font-bold text-slate-950">{stage.label} <span className="font-semibold text-slate-400">{deals.length}</span></h2>
                  <span className="text-xs font-bold text-slate-500">{formatMoney(total)}</span>
                </header>
                <div className="space-y-2">
                  {deals.length ? deals.map((deal) => (
                    <article key={deal.id} className="rounded border border-slate-200 bg-white p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-bold text-slate-950">{deal.title}</h3>
                          <p className="truncate text-xs text-slate-500">{deal.customer?.name}</p>
                        </div>
                        <p className="shrink-0 text-sm font-bold text-slate-950">{formatMoney(deal.value)}</p>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <Badge tone={priorityTones[deal.priority as Priority] ?? 'slate'}>{priorityLabels[deal.priority as Priority] ?? deal.priority}</Badge>
                        <span>Clôture prévue {formatDate(deal.expectedCloseDate)}</span>
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <select
                          value={deal.stageId}
                          onChange={(event) => void moveTo(deal, event.target.value as Stage)}
                          disabled={pending}
                          aria-label={`Étape de ${deal.title}`}
                          className={`${inputClass} h-8 py-1 text-xs`}
                        >
                          {stages.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                        </select>
                        <button type="button" onClick={() => setEditing(deal)} className={buttonClass.icon} aria-label={`Modifier ${deal.title}`}><Pencil className="size-3.5" /></button>
                        <button type="button" onClick={() => void remove(deal)} disabled={pending} className={buttonClass.iconDanger} aria-label={`Supprimer ${deal.title}`}><Trash2 className="size-3.5" /></button>
                      </div>
                    </article>
                  )) : <p className="px-1 py-4 text-center text-xs text-slate-400">Aucune affaire</p>}
                </div>
              </section>
            )
          })}
        </div>
      ) : (
        <section className="neon-surface rounded">
          <EmptyState
            icon={Handshake}
            title="Aucune opportunité"
            text={data.customers.length ? 'Note les affaires en discussion pour ne rien oublier.' : "Ajoute d'abord un client dans Clients > Clients."}
            action={data.customers.length ? <button type="button" onClick={() => setEditing('new')} className={buttonClass.primary}><Plus className="size-4" />Nouvelle opportunité</button> : null}
          />
        </section>
      )}

      {editing ? <DealModal companySlug={companySlug} deal={editing === 'new' ? null : editing} customers={data.customers} onClose={() => setEditing(null)} /> : null}
    </main>
  )
}

function DealModal({ companySlug, deal, customers, onClose }: { companySlug: string; deal: Deal | null; customers: CrmData['customers']; onClose: () => void }) {
  const router = useRouter()
  const { run, pending } = useAction()

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const payload = {
      companySlug,
      contactId: String(form.get('contactId')),
      title: String(form.get('title') ?? ''),
      value: Number(form.get('value') || 0),
      stageId: String(form.get('stageId')) as Stage,
      priority: String(form.get('priority')) as Priority,
      expectedCloseDate: String(form.get('expectedCloseDate') ?? ''),
    }
    const result = await run(
      () => deal ? updateCrmDeal({ data: { ...payload, dealId: deal.id } }) : createCrmDeal({ data: payload }),
      deal ? 'Opportunité modifiée.' : 'Opportunité créée.',
    )
    if (!result) return
    onClose()
    await router.invalidate()
  }

  return (
    <Modal title={deal ? 'Modifier l’opportunité' : 'Nouvelle opportunité'} onClose={onClose}>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Objet" className="sm:col-span-2"><input name="title" required autoFocus defaultValue={deal?.title ?? ''} placeholder="Ex. : Équipement du nouveau magasin" className={inputClass} /></Field>
        <Field label="Client">
          <select name="contactId" required defaultValue={deal?.contactId ?? ''} className={inputClass}>
            <option value="" disabled>Choisir un client</option>
            {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
          </select>
        </Field>
        <Field label="Montant estimé"><MoneyInput name="value" required defaultValue={deal?.value ?? 0} /></Field>
        <Field label="Étape">
          <select name="stageId" defaultValue={deal?.stageId ?? 'new'} className={inputClass}>
            {stages.map((stage) => <option key={stage.key} value={stage.key}>{stage.label}</option>)}
          </select>
        </Field>
        <Field label="Priorité">
          <select name="priority" defaultValue={deal?.priority ?? 'Medium'} className={inputClass}>
            {Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </Field>
        <Field label="Clôture prévue" className="sm:col-span-2"><input name="expectedCloseDate" type="date" required defaultValue={toDateInput(deal?.expectedCloseDate ?? new Date())} className={inputClass} /></Field>
        <div className="sm:col-span-2"><FormActions onCancel={onClose} pending={pending} submitLabel={deal ? 'Enregistrer' : 'Créer'} /></div>
      </form>
    </Modal>
  )
}
