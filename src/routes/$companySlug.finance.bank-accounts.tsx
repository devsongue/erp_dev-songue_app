import { createFileRoute, useRouter } from '@tanstack/react-router'
import { ArrowLeftRight, Banknote, CreditCard, Landmark, Pencil, PiggyBank, Plus, Smartphone, Trash2, Wallet } from 'lucide-react'
import * as React from 'react'
import { useMoney } from '~/context/CompanyContext'
import { accountTypeLabels, type FinanceAccount } from '~/components/finance'
import { Badge, EmptyState, Field, FormActions, Modal, PageHeader, StatCard, buttonClass, inputClass, toDateInput, useAction, useFeedback, MoneyInput } from '~/components/ui'
import { getFinanceData } from '~/server/dataFetchers'
import { createBankAccount, deleteBankAccount, transferBetweenAccounts, updateBankAccount } from '~/server/operations'

export const Route = createFileRoute('/$companySlug/finance/bank-accounts')({
  loader: async ({ params }) => getFinanceData({ data: { companySlug: params.companySlug } }),
  component: BankAccountsPage,
})

const accountIcons: Record<string, typeof Landmark> = {
  Cash: Banknote,
  MobileMoney: Smartphone,
  Checking: Landmark,
  Savings: PiggyBank,
  CreditCard: CreditCard,
}

function BankAccountsPage() {
  const { companySlug } = Route.useParams()
  const { accounts } = Route.useLoaderData()
  const router = useRouter()
  const { formatMoney } = useMoney()
  const { confirm } = useFeedback()
  const { run, pending } = useAction()
  const [editing, setEditing] = React.useState<FinanceAccount | 'new' | null>(null)
  const [transferring, setTransferring] = React.useState(false)

  const active = accounts.filter((account) => account.status !== 'Archived')
  const archived = accounts.filter((account) => account.status === 'Archived')
  const total = active.reduce((sum, account) => sum + account.balance, 0)

  async function remove(account: FinanceAccount) {
    const ok = await confirm({ title: 'Supprimer ce compte ?', message: `« ${account.name} » sera supprimé définitivement.`, confirmLabel: 'Supprimer', danger: true })
    if (!ok) return
    const result = await run(() => deleteBankAccount({ data: { companySlug, accountId: account.id } }), 'Compte supprimé.')
    if (result) await router.invalidate()
  }

  async function toggleArchive(account: FinanceAccount) {
    const archiving = account.status !== 'Archived'
    if (archiving && account.balance !== 0) {
      const ok = await confirm({
        title: 'Archiver un compte non vide ?',
        message: `${account.name} contient encore ${formatMoney(account.balance)}. Pense à virer ce solde vers un autre compte.`,
        confirmLabel: 'Archiver quand même',
      })
      if (!ok) return
    }
    const result = await run(() => updateBankAccount({
      data: { companySlug, accountId: account.id, name: account.name, type: account.type as 'Cash', accountNumber: account.accountNumber ?? '', status: archiving ? 'Archived' : 'Active' },
    }), archiving ? 'Compte archivé.' : 'Compte réactivé.')
    if (result) await router.invalidate()
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Argent"
        title="Comptes & caisse"
        description="Caisse, mobile money, comptes bancaires : où se trouve ton argent."
        actions={(
          <>
            <button type="button" onClick={() => setTransferring(true)} disabled={active.length < 2} className={buttonClass.secondary} title={active.length < 2 ? 'Il faut au moins deux comptes actifs' : undefined}>
              <ArrowLeftRight className="size-4" />Virement
            </button>
            <button type="button" onClick={() => setEditing('new')} className={buttonClass.primary}><Plus className="size-4" />Nouveau compte</button>
          </>
        )}
      />

      <section className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard title="Solde total" value={formatMoney(total)} icon={Wallet} />
        <StatCard title="Comptes actifs" value={active.length.toString()} />
        <StatCard title="Archivés" value={archived.length.toString()} detail="Masqués dans les formulaires" />
      </section>

      {accounts.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[...active, ...archived].map((account) => {
            const Icon = accountIcons[account.type] ?? Landmark
            const isArchived = account.status === 'Archived'
            return (
              <article key={account.id} className={`neon-surface flex flex-col rounded p-5 ${isArchived ? 'opacity-60' : ''}`}>
                <div className="mb-4 flex items-start justify-between gap-3">
                  <span className="flex size-10 items-center justify-center rounded bg-slate-100 text-slate-600"><Icon className="size-5" /></span>
                  {isArchived ? <Badge>Archivé</Badge> : <Badge tone="green">Actif</Badge>}
                </div>
                <h2 className="font-bold text-slate-950">{account.name}</h2>
                <p className="mt-0.5 text-xs text-slate-500">{accountTypeLabels[account.type] ?? account.type}{account.accountNumber ? ` · ${account.accountNumber}` : ''}</p>
                <p className={`mt-4 text-2xl font-bold ${account.balance < 0 ? 'text-rose-600' : 'text-slate-950'}`}>{formatMoney(account.balance)}</p>
                <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                  <button type="button" onClick={() => setEditing(account)} className={buttonClass.icon} aria-label={`Modifier ${account.name}`}><Pencil className="size-3.5" /></button>
                  <button type="button" onClick={() => void toggleArchive(account)} disabled={pending} className="rounded border border-slate-200 px-3 text-xs font-bold text-slate-600 hover:bg-slate-50">
                    {isArchived ? 'Réactiver' : 'Archiver'}
                  </button>
                  {!account.used ? (
                    <button type="button" onClick={() => void remove(account)} disabled={pending} className={buttonClass.iconDanger} aria-label={`Supprimer ${account.name}`}><Trash2 className="size-3.5" /></button>
                  ) : null}
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <section className="neon-surface rounded">
          <EmptyState
            icon={Wallet}
            title="Aucun compte"
            text="Commence par ta caisse (espèces), puis ajoute ton compte mobile money ou bancaire."
            action={<button type="button" onClick={() => setEditing('new')} className={buttonClass.primary}><Plus className="size-4" />Créer un compte</button>}
          />
        </section>
      )}

      {editing ? <AccountModal companySlug={companySlug} account={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
      {transferring ? <TransferModal companySlug={companySlug} accounts={active} onClose={() => setTransferring(false)} /> : null}
    </main>
  )
}

function AccountModal({ companySlug, account, onClose }: { companySlug: string; account: FinanceAccount | null; onClose: () => void }) {
  const router = useRouter()
  const { run, pending } = useAction()

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const base = {
      companySlug,
      name: String(form.get('name') ?? ''),
      type: String(form.get('type')) as 'Cash',
      accountNumber: String(form.get('accountNumber') ?? ''),
    }
    const result = await run(
      () => account
        ? updateBankAccount({ data: { ...base, accountId: account.id, status: account.status === 'Archived' ? 'Archived' : 'Active' } })
        : createBankAccount({ data: { ...base, openingBalance: Number(form.get('openingBalance') || 0) } }),
      account ? 'Compte modifié.' : 'Compte créé.',
    )
    if (!result) return
    onClose()
    await router.invalidate()
  }

  return (
    <Modal title={account ? `Modifier ${account.name}` : 'Nouveau compte'} onClose={onClose} size="sm">
      <form onSubmit={submit} className="grid gap-4">
        <Field label="Nom"><input name="name" required autoFocus defaultValue={account?.name ?? ''} placeholder="Ex. : Caisse boutique, Orange Money, SGBCI" className={inputClass} /></Field>
        <Field label="Type">
          <select name="type" defaultValue={account?.type ?? 'Cash'} className={inputClass}>
            {Object.entries(accountTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </Field>
        <Field label="Numéro (optionnel)" hint="Numéro de compte, de téléphone mobile money…"><input name="accountNumber" defaultValue={account?.accountNumber ?? ''} className={inputClass} /></Field>
        {account ? null : (
          <Field label="Solde de départ" hint="L'argent déjà présent sur ce compte aujourd'hui."><MoneyInput name="openingBalance" defaultValue={0} /></Field>
        )}
        <FormActions onCancel={onClose} pending={pending} submitLabel={account ? 'Enregistrer' : 'Créer le compte'} />
      </form>
    </Modal>
  )
}

function TransferModal({ companySlug, accounts, onClose }: { companySlug: string; accounts: FinanceAccount[]; onClose: () => void }) {
  const router = useRouter()
  const { formatMoney } = useMoney()
  const { run, pending } = useAction()
  const [fromId, setFromId] = React.useState(accounts[0]?.id ?? '')
  const from = accounts.find((account) => account.id === fromId)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const result = await run(() => transferBetweenAccounts({
      data: {
        companySlug,
        fromAccountId: fromId,
        toAccountId: String(form.get('toAccountId')),
        amount: Number(form.get('amount')),
        date: String(form.get('date') || '') || undefined,
        note: String(form.get('note') ?? ''),
      },
    }), 'Virement effectué.')
    if (!result) return
    onClose()
    await router.invalidate()
  }

  return (
    <Modal title="Virement entre comptes" description="Ex. : dépôt de la caisse à la banque, retrait mobile money." onClose={onClose} size="sm">
      <form onSubmit={submit} className="grid gap-4">
        <Field label="Depuis" hint={from ? `Disponible : ${formatMoney(from.balance)}` : undefined}>
          <select value={fromId} onChange={(event) => setFromId(event.target.value)} className={inputClass}>
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
          </select>
        </Field>
        <Field label="Vers">
          <select name="toAccountId" required defaultValue={accounts.find((account) => account.id !== fromId)?.id} key={fromId} className={inputClass}>
            {accounts.filter((account) => account.id !== fromId).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
          </select>
        </Field>
        <Field label="Montant"><MoneyInput name="amount" required /></Field>
        <Field label="Date"><input name="date" type="date" defaultValue={toDateInput(new Date())} className={inputClass} /></Field>
        <Field label="Note (optionnel)"><input name="note" className={inputClass} /></Field>
        <FormActions onCancel={onClose} pending={pending} submitLabel="Effectuer le virement" />
      </form>
    </Modal>
  )
}
