import { createFileRoute, useRouter } from '@tanstack/react-router'
import { Mail, Pencil, Phone, Search, Trash2, UserPlus, Users, Wallet } from 'lucide-react'
import * as React from 'react'
import { Badge, EmptyState, Field, FormActions, Modal, PageHeader, StatCard, buttonClass, formatDate, inputClass, toDateInput, useAction, useFeedback } from '~/components/ui'
import { useMoney } from '~/context/CompanyContext'
import { getHrData } from '~/server/dataFetchers'
import { createEmployee, deleteEmployee, updateEmployee } from '~/server/operations'
import { downloadCsv } from '~/utils/csvExport'

export const Route = createFileRoute('/$companySlug/hr/employees')({
  loader: async ({ params }) => getHrData({ data: { companySlug: params.companySlug } }),
  component: HrEmployees,
})

type Employee = Awaited<ReturnType<typeof getHrData>>['employees'][number]
type Status = 'Active' | 'OnLeave' | 'Onboarding' | 'Terminated'

const statusLabels: Record<Status, string> = { Active: 'Actif', OnLeave: 'En congé', Onboarding: 'En intégration', Terminated: 'Parti' }
const statusTones: Record<Status, 'green' | 'amber' | 'blue' | 'slate'> = { Active: 'green', OnLeave: 'amber', Onboarding: 'blue', Terminated: 'slate' }
const contractLabels: Record<string, string> = { 'Full-time': 'Temps plein', 'Part-time': 'Temps partiel', Contract: 'CDD / prestataire' }

function HrEmployees() {
  const { companySlug } = Route.useParams()
  const { employees, departments } = Route.useLoaderData()
  const router = useRouter()
  const { formatMoney } = useMoney()
  const { confirm } = useFeedback()
  const { run, pending } = useAction()
  const [query, setQuery] = React.useState('')
  const [status, setStatus] = React.useState<Status | 'current'>('current')
  const [editing, setEditing] = React.useState<Employee | 'new' | null>(null)

  const visible = React.useMemo(() => {
    const needle = query.trim().toLowerCase()
    return employees
      .filter((employee) => status === 'current' ? employee.status !== 'Terminated' : employee.status === status)
      .filter((employee) => !needle || [employee.firstName, employee.lastName, employee.position, employee.department, employee.email, employee.phone].some((value) => value?.toLowerCase().includes(needle)))
      .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`))
  }, [employees, query, status])

  const current = employees.filter((employee) => employee.status !== 'Terminated')
  const payroll = current.reduce((sum, employee) => sum + employee.salary, 0)

  async function remove(employee: Employee) {
    const ok = await confirm({
      title: 'Supprimer cet employé ?',
      message: `${employee.firstName} ${employee.lastName} sera supprimé définitivement. Pour garder l'historique d'un départ, passe plutôt son statut à « Parti ».`,
      confirmLabel: 'Supprimer',
      danger: true,
    })
    if (!ok) return
    const result = await run(() => deleteEmployee({ data: { companySlug, employeeId: employee.id } }), 'Employé supprimé.')
    if (result) await router.invalidate()
  }

  function exportCsv() {
    downloadCsv('employes.csv', visible, [
      { header: 'Nom', value: (e) => e.lastName },
      { header: 'Prénom', value: (e) => e.firstName },
      { header: 'Poste', value: (e) => e.position },
      { header: 'Service', value: (e) => e.department },
      { header: 'Statut', value: (e) => statusLabels[e.status as Status] ?? e.status },
      { header: 'Contrat', value: (e) => contractLabels[e.type] ?? e.type },
      { header: 'Embauche', value: (e) => formatDate(e.hireDate) },
      { header: 'Salaire mensuel', value: (e) => e.salary },
      { header: 'Email', value: (e) => e.email },
      { header: 'Téléphone', value: (e) => e.phone },
    ])
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="RH"
        title="Employés"
        description="Annuaire du personnel, contrats et salaires."
        actions={(
          <>
            <button type="button" onClick={exportCsv} disabled={!visible.length} className={buttonClass.secondary}>Exporter</button>
            <button type="button" onClick={() => setEditing('new')} className={buttonClass.primary}><UserPlus className="size-4" />Nouvel employé</button>
          </>
        )}
      />

      <section className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard title="Effectif" value={current.length.toString()} icon={Users} detail={`${departments.length} service${departments.length > 1 ? 's' : ''}`} />
        <StatCard title="Masse salariale mensuelle" value={formatMoney(payroll)} icon={Wallet} detail="Salaires bruts de l'effectif actuel" />
        <StatCard title="En congé" value={employees.filter((employee) => employee.status === 'OnLeave').length.toString()} />
      </section>

      <section className="neon-surface overflow-hidden rounded">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-3 sm:flex-row">
          <label className="relative block flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nom, poste, service, téléphone" className={`${inputClass} pl-9`} />
          </label>
          <select value={status} onChange={(event) => setStatus(event.target.value as Status | 'current')} aria-label="Filtrer par statut" className={`${inputClass} sm:w-56`}>
            <option value="current">Effectif actuel</option>
            {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>

        {visible.length ? (
          <div className="divide-y divide-slate-100">
            {visible.map((employee) => (
              <article key={employee.id} className="list-row grid gap-3 px-4 py-4 sm:px-5 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto] md:items-center">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                    {employee.firstName.charAt(0)}{employee.lastName.charAt(0)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-bold text-slate-950">{employee.firstName} {employee.lastName}</p>
                    <p className="truncate text-xs text-slate-500">{employee.position} · {employee.department}</p>
                  </div>
                </div>
                <div className="min-w-0 space-y-0.5 text-xs text-slate-500">
                  {employee.phone ? <p className="flex items-center gap-1.5"><Phone className="size-3" />{employee.phone}</p> : null}
                  {employee.email ? <p className="flex items-center gap-1.5 truncate"><Mail className="size-3" />{employee.email}</p> : null}
                  <p>Depuis le {formatDate(employee.hireDate)} · {contractLabels[employee.type] ?? employee.type}</p>
                </div>
                <div className="flex items-center gap-3 md:block md:text-right">
                  <p className="text-sm font-bold text-slate-950">{formatMoney(employee.salary)}<span className="text-xs font-normal text-slate-500"> /mois</span></p>
                  <Badge tone={statusTones[employee.status as Status] ?? 'slate'}>{statusLabels[employee.status as Status] ?? employee.status}</Badge>
                </div>
                <div className="flex gap-2 md:justify-end">
                  <button type="button" onClick={() => setEditing(employee)} className={buttonClass.icon} aria-label={`Modifier ${employee.firstName} ${employee.lastName}`}><Pencil className="size-3.5" /></button>
                  <button type="button" onClick={() => void remove(employee)} disabled={pending} className={buttonClass.iconDanger} aria-label={`Supprimer ${employee.firstName} ${employee.lastName}`}><Trash2 className="size-3.5" /></button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Users}
            title={employees.length ? 'Aucun employé ne correspond' : 'Aucun employé enregistré'}
            text={employees.length ? 'Change la recherche ou le filtre.' : 'Ajoute ton équipe pour suivre contrats, congés et salaires.'}
            action={employees.length ? null : <button type="button" onClick={() => setEditing('new')} className={buttonClass.primary}><UserPlus className="size-4" />Ajouter un employé</button>}
          />
        )}
      </section>

      {editing ? (
        <EmployeeModal companySlug={companySlug} employee={editing === 'new' ? null : editing} departments={departments.map((department) => department.id)} onClose={() => setEditing(null)} />
      ) : null}
    </main>
  )
}

function EmployeeModal({ companySlug, employee, departments, onClose }: { companySlug: string; employee: Employee | null; departments: string[]; onClose: () => void }) {
  const router = useRouter()
  const { run, pending } = useAction()
  const departmentListId = React.useId()

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const payload = {
      companySlug,
      firstName: String(form.get('firstName') ?? ''),
      lastName: String(form.get('lastName') ?? ''),
      email: String(form.get('email') ?? ''),
      phone: String(form.get('phone') ?? ''),
      department: String(form.get('department') ?? ''),
      position: String(form.get('position') ?? ''),
      status: String(form.get('status')) as Status,
      type: String(form.get('type')) as 'Full-time',
      hireDate: String(form.get('hireDate') ?? ''),
      salary: Number(form.get('salary') || 0),
    }
    const result = await run(
      () => employee ? updateEmployee({ data: { ...payload, employeeId: employee.id } }) : createEmployee({ data: payload }),
      employee ? 'Employé modifié.' : 'Employé ajouté.',
    )
    if (!result) return
    onClose()
    await router.invalidate()
  }

  return (
    <Modal title={employee ? `Modifier ${employee.firstName} ${employee.lastName}` : 'Nouvel employé'} onClose={onClose}>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Prénom"><input name="firstName" required autoFocus defaultValue={employee?.firstName ?? ''} className={inputClass} /></Field>
        <Field label="Nom"><input name="lastName" required defaultValue={employee?.lastName ?? ''} className={inputClass} /></Field>
        <Field label="Poste"><input name="position" required defaultValue={employee?.position ?? ''} placeholder="Ex. : Vendeur, Comptable" className={inputClass} /></Field>
        <Field label="Service">
          <input name="department" required list={departmentListId} defaultValue={employee?.department ?? ''} placeholder="Ex. : Boutique, Administration" className={inputClass} />
          <datalist id={departmentListId}>{departments.map((department) => <option key={department} value={department} />)}</datalist>
        </Field>
        <Field label="Téléphone"><input name="phone" type="tel" defaultValue={employee?.phone ?? ''} className={inputClass} /></Field>
        <Field label="Email"><input name="email" type="email" defaultValue={employee?.email ?? ''} className={inputClass} /></Field>
        <Field label="Date d'embauche"><input name="hireDate" type="date" required defaultValue={toDateInput(employee?.hireDate ?? new Date())} className={inputClass} /></Field>
        <Field label="Salaire mensuel brut"><input name="salary" type="number" min="0" required defaultValue={employee?.salary ?? 0} className={inputClass} /></Field>
        <Field label="Contrat">
          <select name="type" defaultValue={employee?.type ?? 'Full-time'} className={inputClass}>
            {Object.entries(contractLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </Field>
        <Field label="Statut">
          <select name="status" defaultValue={employee?.status ?? 'Active'} className={inputClass}>
            {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </Field>
        <div className="sm:col-span-2"><FormActions onCancel={onClose} pending={pending} submitLabel={employee ? 'Enregistrer' : "Ajouter l'employé"} /></div>
      </form>
    </Modal>
  )
}
