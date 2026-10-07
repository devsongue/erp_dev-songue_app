import { Check, Pencil, Tags, Trash2, X } from 'lucide-react'
import * as React from 'react'
import { EmptyState, Modal, buttonClass, inputClass, useAction, useFeedback } from '~/components/ui'
import { deleteCatalogCategory, updateCatalogCategory } from '~/server/operations'

type Category = { id: string; name: string; type: string; color: string }

const colorOptions = [
  { value: 'slate', label: 'Gris', swatch: 'bg-slate-400' },
  { value: 'emerald', label: 'Vert', swatch: 'bg-emerald-500' },
  { value: 'amber', label: 'Ambre', swatch: 'bg-amber-500' },
  { value: 'rose', label: 'Rose', swatch: 'bg-rose-500' },
]

export function CategoryManager({ companySlug, categories, itemCounts, onRenamed, onDeleted, onClose }: {
  companySlug: string
  categories: Category[]
  itemCounts: Record<string, number>
  onRenamed: (category: Category) => void
  onDeleted: (categoryId: string) => void
  onClose: () => void
}) {
  const { confirm } = useFeedback()
  const { run, pending } = useAction()
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [draft, setDraft] = React.useState({ name: '', color: 'slate' })

  function startEdit(category: Category) {
    setEditingId(category.id)
    setDraft({ name: category.name, color: category.color })
  }

  async function save(category: Category) {
    const result = await run(() => updateCatalogCategory({ data: { companySlug, categoryId: category.id, name: draft.name, color: draft.color } }), 'Catégorie modifiée.')
    if (!result) return
    onRenamed({ ...category, name: result.name, color: result.color })
    setEditingId(null)
  }

  async function remove(category: Category) {
    const count = itemCounts[category.id] ?? 0
    const ok = await confirm({
      title: 'Supprimer cette catégorie ?',
      message: count
        ? `« ${category.name} » contient ${count} article${count > 1 ? 's' : ''}. Ils seront conservés, sans catégorie.`
        : `« ${category.name} » sera supprimée.`,
      confirmLabel: 'Supprimer',
      danger: true,
    })
    if (!ok) return
    const result = await run(() => deleteCatalogCategory({ data: { companySlug, categoryId: category.id } }), 'Catégorie supprimée.')
    if (result) onDeleted(category.id)
  }

  const sorted = [...categories].sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name))

  return (
    <Modal title="Catégories" description="Renomme, change la couleur ou supprime une catégorie." onClose={onClose}>
      {sorted.length ? (
        <div className="divide-y divide-slate-100 rounded border border-slate-200">
          {sorted.map((category) => {
            const editing = editingId === category.id
            const swatch = colorOptions.find((option) => option.value === (editing ? draft.color : category.color))?.swatch ?? 'bg-slate-400'
            return (
              <div key={category.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                <span className={`hidden size-3 shrink-0 rounded-full sm:block ${swatch}`} />
                {editing ? (
                  <form onSubmit={(event) => { event.preventDefault(); void save(category) }} className="flex flex-1 flex-col gap-2 sm:flex-row">
                    <input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} required autoFocus aria-label="Nom de la catégorie" className={inputClass} />
                    <select value={draft.color} onChange={(event) => setDraft((current) => ({ ...current, color: event.target.value }))} aria-label="Couleur" className={`${inputClass} sm:w-32`}>
                      {colorOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                    <div className="flex gap-2">
                      <button type="submit" disabled={pending} className={buttonClass.icon} aria-label="Enregistrer"><Check className="size-3.5" /></button>
                      <button type="button" onClick={() => setEditingId(null)} className={buttonClass.icon} aria-label="Annuler"><X className="size-3.5" /></button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-slate-950">{category.name}</p>
                      <p className="text-xs text-slate-500">{category.type === 'Service' ? 'Services' : 'Produits'} · {itemCounts[category.id] ?? 0} article{(itemCounts[category.id] ?? 0) > 1 ? 's' : ''}</p>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => startEdit(category)} className={buttonClass.icon} aria-label={`Modifier ${category.name}`}><Pencil className="size-3.5" /></button>
                      <button type="button" onClick={() => void remove(category)} disabled={pending} className={buttonClass.iconDanger} aria-label={`Supprimer ${category.name}`}><Trash2 className="size-3.5" /></button>
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <EmptyState icon={Tags} title="Aucune catégorie" text="Crée une catégorie depuis le formulaire d'un produit." />
      )}
    </Modal>
  )
}
