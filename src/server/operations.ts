import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { prisma } from './db'
import type { Prisma } from '@prisma/client'

const documentPrefixes = {
  sales_invoice: 'FAC',
  purchase_invoice: 'ACH',
  pos_ticket: 'POS',
} as const

// Numerotation continue par entreprise, type de document et annee
// (FAC-2026-00001...). L'upsert SQL est atomique : deux ventes simultanees ne
// peuvent pas obtenir le meme numero. A appeler dans la transaction qui cree le
// document, pour qu'un echec n'en consomme pas un (pas de trou).
async function nextDocumentReference(tx: Prisma.TransactionClient, companyId: string, kind: keyof typeof documentPrefixes) {
  const year = new Date().getFullYear()
  const key = `${kind}:${year}`
  const rows = await tx.$queryRaw<Array<{ value: number }>>`
    INSERT INTO "DocumentSequence" ("companyId", "key", "nextNumber") VALUES (${companyId}, ${key}, 2)
    ON CONFLICT ("companyId", "key") DO UPDATE SET "nextNumber" = "DocumentSequence"."nextNumber" + 1
    RETURNING "nextNumber" - 1 AS value`
  return `${documentPrefixes[kind]}-${year}-${String(rows[0].value).padStart(5, '0')}`
}

async function getCompany(companySlug: string, permission: string) {
  const { requireCompanyAccess } = await import('./access')
  const { company } = await requireCompanyAccess(companySlug, permission)
  return company
}

async function getCompanyContext(companySlug: string, permission: string) {
  const { requireCompanyAccess } = await import('./access')
  const { company, user } = await requireCompanyAccess(companySlug, permission)
  return { company, user }
}

async function ensureAccount(companyId: string, type: string, name: string) {
  const existing = await prisma.bankAccount.findFirst({ where: { companyId, type, name } })
  if (existing) return existing
  return prisma.bankAccount.create({
    data: {
      companyId,
      name,
      type,
      currency: 'FCFA',
      balance: 0,
      status: 'Active',
    },
  })
}

async function ensureWarehouse(companyId: string) {
  const existing = await prisma.warehouse.findFirst({ where: { companyId } })
  if (existing) return existing
  return prisma.warehouse.create({
    data: {
      companyId,
      name: 'Depot principal',
      location: 'Boutique',
      capacity: 1000,
      usedCapacity: 0,
      status: 'Active',
    },
  })
}

async function ensureQuoteSettings(companyId: string, companyName: string) {
  const existing = await prisma.quoteSettings.findUnique({ where: { companyId } })
  if (existing) return existing
  return prisma.quoteSettings.create({
    data: {
      companyId,
      legalName: companyName,
      footerNote: 'Merci pour votre confiance.',
      paymentTerms: 'Validite 30 jours. Paiement selon accord commercial.',
      accentColor: '#0f172a',
      nextNumber: 1,
    },
  })
}

// Tout identifiant fourni par le client doit appartenir a l'entreprise active :
// sans ce controle, une cle etrangere valide d'une autre entreprise serait
// acceptee par la base et ses donnees renvoyees via les `include`.
async function assertCompanyCustomer(companyId: string, customerId?: string | null) {
  if (!customerId) return
  const customer = await prisma.customer.findFirst({ where: { id: customerId, companyId }, select: { id: true } })
  if (!customer) throw new Error('Client introuvable.')
}

async function assertCompanyItems(companyId: string, itemIds: Array<string | null | undefined>) {
  const ids = Array.from(new Set(itemIds.filter((id): id is string => Boolean(id))))
  if (!ids.length) return
  const count = await prisma.catalogItem.count({ where: { companyId, id: { in: ids } } })
  if (count !== ids.length) throw new Error('Article introuvable.')
}

const quoteLineInput = z.object({
  itemId: z.string().optional(),
  description: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: z.number().min(0),
})

const optionalUrlInput = z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.string().url().optional(),
)

const optionalHexColorInput = z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
)

export const createCatalogCategory = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    companySlug: z.string(),
    name: z.string().min(1),
    type: z.enum(['Product', 'Service']),
    color: z.string().default('slate'),
  }))
  .handler(async ({ data }) => {
    const company = await getCompany(data.companySlug, 'inventory.manage')
    return prisma.category.upsert({
      where: { companyId_name: { companyId: company.id, name: data.name.trim() } },
      update: { type: data.type, color: data.color },
      create: {
        companyId: company.id,
        name: data.name.trim(),
        type: data.type,
        color: data.color,
      },
    })
  })

export const createCatalogItem = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    companySlug: z.string(),
    name: z.string().min(1),
    sku: z.string().min(1),
    type: z.enum(['Product', 'Service']),
    description: z.string().optional(),
    supplier: z.string().optional(),
    categoryId: z.string().optional(),
    price: z.number().min(0),
    wholesalePrice: z.number().min(0).default(0),
    cost: z.number().min(0).default(0),
    stock: z.number().min(0).optional(),
    minStockLevel: z.number().min(0).optional(),
    imageUrl: z.string().optional(),
    status: z.enum(['Active', 'Draft', 'Archived']).default('Active'),
  }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'inventory.manage')
    if (data.categoryId) {
      const category = await prisma.category.findFirst({
        where: { id: data.categoryId, companyId: company.id, type: data.type },
      })
      if (!category) throw new Error('Categorie invalide pour ce type.')
    }

    const item = await prisma.catalogItem.create({
      data: {
        companyId: company.id,
        name: data.name.trim(),
        sku: data.sku.trim(),
        type: data.type,
        description: data.description?.trim() || null,
        supplier: data.supplier?.trim() || null,
        categoryId: data.categoryId || null,
        price: Math.round(data.price),
        wholesalePrice: Math.round(data.wholesalePrice),
        cost: Math.round(data.cost),
        stock: data.type === 'Product' ? Math.round(data.stock ?? 0) : null,
        minStockLevel: data.type === 'Product' ? Math.round(data.minStockLevel ?? 0) : null,
        imageUrl: data.imageUrl?.trim() || null,
        status: data.status,
      },
      include: { category: true },
    })

    if (item.type === 'Product' && (item.stock ?? 0) > 0) {
      const warehouse = await ensureWarehouse(company.id)
      await prisma.stockMovement.create({
        data: {
          companyId: company.id,
          warehouseId: warehouse.id,
          itemId: item.id,
          type: 'In',
          quantity: item.stock ?? 0,
          reference: `INIT-${item.sku}`,
          reason: 'Stock initial',
          status: 'Completed',
        },
      })
    }

    await prisma.auditLog.create({
      data: {
        companyId: company.id,
        actorId: user.id,
        action: 'catalog.created',
        entity: 'CatalogItem',
        entityId: item.id,
        metadata: JSON.stringify({ type: item.type, sku: item.sku, status: item.status }),
      },
    })

    return item
  })

export const updateCatalogItemStatus = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    companySlug: z.string(),
    itemId: z.string(),
    status: z.enum(['Active', 'Draft', 'Archived']),
  }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'inventory.manage')
    const item = await prisma.catalogItem.update({
      where: { id: data.itemId, companyId: company.id },
      data: { status: data.status },
      include: { category: true },
    })
    await prisma.auditLog.create({
      data: {
        companyId: company.id,
        actorId: user.id,
        action: 'catalog.status_updated',
        entity: 'CatalogItem',
        entityId: item.id,
        metadata: JSON.stringify({ status: item.status, sku: item.sku }),
      },
    })
    return item
  })

export const updateCatalogItem = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    companySlug: z.string(), itemId: z.string(), name: z.string().min(1), sku: z.string().min(1),
    type: z.enum(['Product', 'Service']), description: z.string().optional(), supplier: z.string().optional(),
    categoryId: z.string().optional(), price: z.number().min(0), wholesalePrice: z.number().min(0),
    cost: z.number().min(0), stock: z.number().min(0).optional(), minStockLevel: z.number().min(0).optional(),
    imageUrl: z.string().optional(), status: z.enum(['Active', 'Draft', 'Archived']),
  }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'inventory.manage')
    const existing = await prisma.catalogItem.findFirst({ where: { id: data.itemId, companyId: company.id } })
    if (!existing) throw new Error('Article introuvable.')
    if (data.categoryId) {
      const category = await prisma.category.findFirst({ where: { id: data.categoryId, companyId: company.id, type: data.type } })
      if (!category) throw new Error('Categorie invalide pour ce type.')
    }
    const nextStock = data.type === 'Product' ? Math.round(data.stock ?? 0) : null
    const stockDelta = (nextStock ?? 0) - (existing.stock ?? 0)
    const warehouse = stockDelta !== 0 ? await ensureWarehouse(company.id) : null
    return prisma.$transaction(async (tx) => {
      const item = await tx.catalogItem.update({
        where: { id: existing.id },
        data: {
          name: data.name.trim(), sku: data.sku.trim(), type: data.type,
          description: data.description?.trim() || null, supplier: data.type === 'Product' ? data.supplier?.trim() || null : null,
          categoryId: data.categoryId || null, price: Math.round(data.price), wholesalePrice: data.type === 'Product' ? Math.round(data.wholesalePrice) : 0,
          cost: Math.round(data.cost), stock: nextStock, minStockLevel: data.type === 'Product' ? Math.round(data.minStockLevel ?? 0) : null,
          imageUrl: data.imageUrl?.trim() || null, status: data.status,
        },
        include: { category: true },
      })
      if (warehouse && stockDelta !== 0) {
        await tx.stockMovement.create({
          data: {
            companyId: company.id, warehouseId: warehouse.id, itemId: item.id,
            type: 'Adjustment', quantity: Math.abs(stockDelta), reference: `ADJ-${Date.now().toString().slice(-6)}`,
            reason: stockDelta > 0 ? 'Correction positive depuis la fiche article' : 'Correction negative depuis la fiche article', status: 'Completed',
          },
        })
      }
      await tx.auditLog.create({ data: { companyId: company.id, actorId: user.id, action: 'catalog.updated', entity: 'CatalogItem', entityId: item.id, metadata: JSON.stringify({ sku: item.sku, previousStock: existing.stock, stock: nextStock }) } })
      return item
    })
  })

export const deleteCatalogItem = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ companySlug: z.string(), itemId: z.string() }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'inventory.manage')
    const item = await prisma.catalogItem.findFirst({ where: { id: data.itemId, companyId: company.id } })
    if (!item) throw new Error('Article introuvable.')
    await prisma.$transaction(async (tx) => {
      await tx.auditLog.create({ data: { companyId: company.id, actorId: user.id, action: 'catalog.deleted', entity: 'CatalogItem', entityId: item.id, metadata: JSON.stringify({ name: item.name, sku: item.sku }) } })
      await tx.catalogItem.delete({ where: { id: item.id } })
    })
    return { ok: true }
  })

export const restockCatalogItem = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    companySlug: z.string(),
    itemId: z.string(),
    quantity: z.number().int().positive(),
    reason: z.string().optional(),
  }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'inventory.manage')
    const existing = await prisma.catalogItem.findFirst({
      where: { id: data.itemId, companyId: company.id, type: 'Product' },
    })
    if (!existing) throw new Error('Produit introuvable.')

    const warehouse = await ensureWarehouse(company.id)
    const reference = `RESTOCK-${Date.now().toString().slice(-6)}`
    const item = await prisma.$transaction(async (tx) => {
      const updated = await tx.catalogItem.update({
        where: { id: existing.id },
        data: {
          stock: { increment: data.quantity },
          status: existing.status === 'Archived' ? existing.status : 'Active',
        },
        include: { category: true },
      })
      await tx.stockMovement.create({
        data: {
          companyId: company.id,
          warehouseId: warehouse.id,
          itemId: existing.id,
          type: 'In',
          quantity: data.quantity,
          reference,
          reason: data.reason?.trim() || 'Reapprovisionnement',
          status: 'Completed',
        },
      })
      await tx.auditLog.create({
        data: {
          companyId: company.id,
          actorId: user.id,
          action: 'catalog.restocked',
          entity: 'CatalogItem',
          entityId: existing.id,
          metadata: JSON.stringify({ quantity: data.quantity, reference, sku: existing.sku }),
        },
      })
      return updated
    })

    return item
  })

export const createQuote = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    companySlug: z.string(),
    customerId: z.string().optional(),
    customerName: z.string().optional(),
    customerEmail: z.string().optional(),
    title: z.string().min(1),
    validUntil: z.string().min(1),
    discountRate: z.number().min(0).max(100).default(0),
    taxRate: z.number().min(0).max(100).default(0),
    notes: z.string().optional(),
    terms: z.string().optional(),
    lines: z.array(quoteLineInput).min(1),
  }))
  .handler(async ({ data }) => {
    const company = await getCompany(data.companySlug, 'invoice.create')
    const settings = await ensureQuoteSettings(company.id, company.name)
    await assertCompanyCustomer(company.id, data.customerId)
    await assertCompanyItems(company.id, data.lines.map((line) => line.itemId))

    let customerId = data.customerId || undefined
    if (!customerId && data.customerName?.trim()) {
      const customer = await prisma.customer.create({
        data: {
          companyId: company.id,
          name: data.customerName.trim(),
          email: data.customerEmail?.trim() || null,
        },
      })
      customerId = customer.id
    }

    const subtotal = data.lines.reduce((sum, line) => sum + Math.round(line.quantity * line.unitPrice), 0)
    const discount = Math.round(subtotal * (data.discountRate / 100))
    const taxable = Math.max(0, subtotal - discount)
    const tax = Math.round(taxable * (data.taxRate / 100))
    const total = taxable + tax

    return prisma.$transaction(async (tx) => {
      // Increment atomique : deux devis simultanes ne peuvent pas recevoir la
      // meme reference (contrainte unique companyId+reference sinon violee).
      const numbering = await tx.quoteSettings.update({
        where: { companyId: company.id },
        data: { nextNumber: { increment: 1 } },
      })
      const reference = `DEV-${String(numbering.nextNumber - 1).padStart(5, '0')}`

      return tx.quote.create({
        data: {
          companyId: company.id,
          customerId: customerId ?? null,
          reference,
          title: data.title.trim(),
          validUntil: new Date(data.validUntil),
          discountRate: Math.round(data.discountRate),
          taxRate: Math.round(data.taxRate),
          subtotalCents: subtotal,
          totalCents: total,
          notes: data.notes?.trim() || null,
          terms: data.terms?.trim() || settings.paymentTerms,
          lines: {
            create: data.lines.map((line, index) => ({
              itemId: line.itemId || null,
              description: line.description.trim(),
              quantity: line.quantity,
              unitPrice: Math.round(line.unitPrice),
              totalCents: Math.round(line.quantity * line.unitPrice),
              sortOrder: index,
            })),
          },
        },
        include: { customer: true, lines: { include: { item: true }, orderBy: { sortOrder: 'asc' } } },
      })
    })
  })

export const updateQuoteStatus = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    companySlug: z.string(),
    quoteId: z.string(),
    status: z.enum(['Draft', 'Sent', 'Accepted', 'Rejected', 'Expired']),
  }))
  .handler(async ({ data }) => {
    const company = await getCompany(data.companySlug, 'invoice.update')
    return prisma.quote.update({
      where: { id: data.quoteId, companyId: company.id },
      data: {
        status: data.status,
        acceptedAt: data.status === 'Accepted' ? new Date() : null,
      },
      include: { customer: true, lines: { include: { item: true }, orderBy: { sortOrder: 'asc' } } },
    })
  })

export const saveQuoteSettings = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    companySlug: z.string(),
    logoUrl: optionalUrlInput,
    legalName: z.string().optional(),
    address: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    taxId: z.string().optional(),
    footerNote: z.string().optional(),
    paymentTerms: z.string().optional(),
    accentColor: optionalHexColorInput,
  }))
  .handler(async ({ data }) => {
    const company = await getCompany(data.companySlug, 'company.manage')
    await ensureQuoteSettings(company.id, company.name)

    return prisma.quoteSettings.update({
      where: { companyId: company.id },
      data: {
        logoUrl: data.logoUrl?.trim() || null,
        legalName: data.legalName?.trim() || company.name,
        address: data.address?.trim() || null,
        phone: data.phone?.trim() || null,
        email: data.email?.trim() || null,
        taxId: data.taxId?.trim() || null,
        footerNote: data.footerNote?.trim() || 'Merci pour votre confiance.',
        paymentTerms: data.paymentTerms?.trim() || 'Validite 30 jours. Paiement selon accord commercial.',
        accentColor: data.accentColor?.trim() || '#0f172a',
      },
    })
  })

export const createCrmLead = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    companySlug: z.string(),
    name: z.string().min(1),
    company: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    source: z.string().default('POS'),
  }))
  .handler(async ({ data }) => {
    const company = await getCompany(data.companySlug, 'customer.create')
    return prisma.$transaction(async (tx) => {
      const customer = await tx.customer.create({
        data: {
          companyId: company.id,
          name: data.name.trim(),
          email: data.email?.trim() || null,
        },
      })
      const lead = await tx.lead.create({
        data: {
          companyId: company.id,
          name: data.name.trim(),
          company: data.company?.trim() || null,
          email: data.email?.trim() || null,
          phone: data.phone?.trim() || null,
          source: data.source,
          status: 'New',
          score: 0,
        },
      })
      return { lead, customer }
    })
  })

export const updateQuote = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    companySlug: z.string(), quoteId: z.string(), customerId: z.string().optional(), title: z.string().min(1),
    validUntil: z.string().min(1), discountRate: z.number().min(0).max(100), taxRate: z.number().min(0).max(100),
    notes: z.string().optional(), terms: z.string().optional(), lines: z.array(quoteLineInput).min(1),
  }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'invoice.update')
    const existing = await prisma.quote.findFirst({ where: { id: data.quoteId, companyId: company.id } })
    if (!existing) throw new Error('Devis introuvable.')
    if (existing.status === 'Accepted') throw new Error('Un devis accepte doit etre duplique ou annule, pas modifie.')
    await assertCompanyCustomer(company.id, data.customerId)
    await assertCompanyItems(company.id, data.lines.map((line) => line.itemId))
    const subtotal = data.lines.reduce((sum, line) => sum + Math.round(line.quantity * line.unitPrice), 0)
    const taxable = Math.max(0, subtotal - Math.round(subtotal * data.discountRate / 100))
    const total = taxable + Math.round(taxable * data.taxRate / 100)
    return prisma.$transaction(async (tx) => {
      await tx.quoteLine.deleteMany({ where: { quoteId: existing.id } })
      const quote = await tx.quote.update({ where: { id: existing.id }, data: {
        customerId: data.customerId || null, title: data.title.trim(), validUntil: new Date(data.validUntil),
        discountRate: Math.round(data.discountRate), taxRate: Math.round(data.taxRate), subtotalCents: subtotal, totalCents: total,
        notes: data.notes?.trim() || null, terms: data.terms?.trim() || null,
        lines: { create: data.lines.map((line, index) => ({ itemId: line.itemId || null, description: line.description.trim(), quantity: line.quantity, unitPrice: Math.round(line.unitPrice), totalCents: Math.round(line.quantity * line.unitPrice), sortOrder: index })) },
      }, include: { customer: true, lines: { include: { item: true }, orderBy: { sortOrder: 'asc' } } } })
      await tx.auditLog.create({ data: { companyId: company.id, actorId: user.id, action: 'quote.updated', entity: 'Quote', entityId: quote.id, metadata: JSON.stringify({ reference: quote.reference, total: quote.totalCents }) } })
      return quote
    })
  })

export const deleteQuote = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ companySlug: z.string(), quoteId: z.string() }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'invoice.delete')
    const quote = await prisma.quote.findFirst({ where: { id: data.quoteId, companyId: company.id } })
    if (!quote) throw new Error('Devis introuvable.')
    if (quote.status === 'Accepted') throw new Error('Un devis accepte ne peut pas etre supprime.')
    await prisma.$transaction(async (tx) => {
      await tx.auditLog.create({ data: { companyId: company.id, actorId: user.id, action: 'quote.deleted', entity: 'Quote', entityId: quote.id, metadata: JSON.stringify({ reference: quote.reference }) } })
      await tx.quote.delete({ where: { id: quote.id } })
    })
    return { ok: true }
  })

export const updateCrmLead = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    companySlug: z.string(), leadId: z.string(), name: z.string().min(1), company: z.string().optional(),
    email: z.string().optional(), phone: z.string().optional(), source: z.string(),
    status: z.enum(['New', 'Contacted', 'Qualified', 'Lost']),
  }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'customer.update')
    const lead = await prisma.lead.update({
      where: { id: data.leadId, companyId: company.id },
      data: { name: data.name.trim(), company: data.company?.trim() || null, email: data.email?.trim() || null, phone: data.phone?.trim() || null, source: data.source, status: data.status },
    })
    await prisma.auditLog.create({ data: { companyId: company.id, actorId: user.id, action: 'lead.updated', entity: 'Lead', entityId: lead.id, metadata: JSON.stringify({ name: lead.name, status: lead.status }) } })
    return lead
  })

export const deleteCrmLead = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ companySlug: z.string(), leadId: z.string() }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'customer.delete')
    const lead = await prisma.lead.findFirst({ where: { id: data.leadId, companyId: company.id } })
    if (!lead) throw new Error('Prospect introuvable.')
    await prisma.$transaction(async (tx) => {
      await tx.auditLog.create({ data: { companyId: company.id, actorId: user.id, action: 'lead.deleted', entity: 'Lead', entityId: lead.id, metadata: JSON.stringify({ name: lead.name }) } })
      await tx.lead.delete({ where: { id: lead.id } })
    })
    return { ok: true }
  })

const dealInput = z.object({
  companySlug: z.string(), contactId: z.string(), title: z.string().min(1), value: z.number().min(0),
  stageId: z.enum(['new', 'qualified', 'proposal', 'negotiation', 'won', 'lost']),
  priority: z.enum(['Low', 'Medium', 'High']), expectedCloseDate: z.string().min(1),
})

export const createCrmDeal = createServerFn({ method: 'POST' })
  .inputValidator(dealInput)
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'customer.create')
    const customer = await prisma.customer.findFirst({ where: { id: data.contactId, companyId: company.id } })
    if (!customer) throw new Error('Client introuvable.')
    const deal = await prisma.deal.create({ data: { companyId: company.id, contactId: customer.id, title: data.title.trim(), value: Math.round(data.value), stageId: data.stageId, priority: data.priority, expectedCloseDate: new Date(data.expectedCloseDate), status: data.stageId === 'won' ? 'Won' : data.stageId === 'lost' ? 'Lost' : 'Open' }, include: { customer: true } })
    await prisma.auditLog.create({ data: { companyId: company.id, actorId: user.id, action: 'deal.created', entity: 'Deal', entityId: deal.id } })
    return deal
  })

export const updateCrmDeal = createServerFn({ method: 'POST' })
  .inputValidator(dealInput.extend({ dealId: z.string() }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'customer.update')
    await assertCompanyCustomer(company.id, data.contactId)
    const deal = await prisma.deal.update({ where: { id: data.dealId, companyId: company.id }, data: { contactId: data.contactId, title: data.title.trim(), value: Math.round(data.value), stageId: data.stageId, priority: data.priority, expectedCloseDate: new Date(data.expectedCloseDate), status: data.stageId === 'won' ? 'Won' : data.stageId === 'lost' ? 'Lost' : 'Open' }, include: { customer: true } })
    await prisma.auditLog.create({ data: { companyId: company.id, actorId: user.id, action: 'deal.updated', entity: 'Deal', entityId: deal.id, metadata: JSON.stringify({ stage: deal.stageId, value: deal.value }) } })
    return deal
  })

export const deleteCrmDeal = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ companySlug: z.string(), dealId: z.string() }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'customer.delete')
    const deal = await prisma.deal.findFirst({ where: { id: data.dealId, companyId: company.id } })
    if (!deal) throw new Error('Opportunite introuvable.')
    await prisma.$transaction(async (tx) => { await tx.auditLog.create({ data: { companyId: company.id, actorId: user.id, action: 'deal.deleted', entity: 'Deal', entityId: deal.id, metadata: JSON.stringify({ title: deal.title }) } }); await tx.deal.delete({ where: { id: deal.id } }) })
    return { ok: true }
  })

export const createFinanceTransaction = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    companySlug: z.string(),
    accountId: z.string().optional(),
    description: z.string().min(1),
    amount: z.number().positive(),
    type: z.enum(['Income', 'Expense']),
    category: z.string().min(1),
    reference: z.string().optional(),
    date: z.string().optional(),
  }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'finance.manage')
    const account = data.accountId
      ? await prisma.bankAccount.findFirst({ where: { id: data.accountId, companyId: company.id } })
      : await ensureAccount(company.id, 'Cash', 'Caisse boutique')
    if (!account) throw new Error('Compte introuvable.')
    const accountId = account.id
    const amount = Math.round(data.amount)
    return prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          companyId: company.id,
          accountId,
          date: data.date ? new Date(data.date) : new Date(),
          description: data.description.trim(),
          amount,
          type: data.type,
          category: data.category.trim(),
          reference: data.reference?.trim() || null,
          status: 'Completed',
        },
      })
      await tx.bankAccount.update({
        where: { id: accountId, companyId: company.id },
        data: { balance: { increment: data.type === 'Income' ? amount : -amount } },
      })
      await tx.auditLog.create({ data: { companyId: company.id, actorId: user.id, action: 'transaction.created', entity: 'Transaction', entityId: transaction.id, metadata: JSON.stringify({ type: data.type, amount }) } })
      return transaction
    })
  })

export const createPurchaseInvoice = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    companySlug: z.string(),
    accountId: z.string().optional(),
    vendorName: z.string().min(1),
    reference: z.string().optional(),
    category: z.string().min(1),
    amount: z.number().positive(),
    status: z.enum(['Pending', 'Paid']).default('Paid'),
    notes: z.string().optional(),
    issueDate: z.string().optional(),
    dueDate: z.string().optional(),
  }))
  .handler(async ({ data }) => {
    const company = await getCompany(data.companySlug, 'finance.manage')
    const issueDate = data.issueDate ? new Date(data.issueDate) : new Date()
    const account = data.accountId
      ? await prisma.bankAccount.findFirst({ where: { id: data.accountId, companyId: company.id } })
      : await ensureAccount(company.id, 'Cash', 'Caisse boutique')
    if (!account) throw new Error('Compte introuvable.')

    const amount = Math.round(data.amount)
    const vendor = await prisma.vendor.findFirst({
      where: { companyId: company.id, name: data.vendorName.trim() },
    })

    return prisma.$transaction(async (tx) => {
      // La reference fournisseur saisie est conservee ; sinon numero interne.
      const reference = data.reference?.trim() || await nextDocumentReference(tx, company.id, 'purchase_invoice')
      const invoice = await tx.purchaseInvoice.create({
        data: {
          companyId: company.id,
          vendorId: vendor?.id ?? null,
          vendorName: data.vendorName.trim(),
          reference,
          category: data.category.trim(),
          totalCents: amount,
          paidCents: data.status === 'Paid' ? amount : 0,
          status: data.status,
          notes: data.notes?.trim() || null,
          issueDate,
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
        },
        include: { vendor: true },
      })

      if (data.status === 'Paid') {
        const transaction = await tx.transaction.create({
          data: {
            companyId: company.id,
            accountId: account.id,
            date: issueDate,
            description: `${invoice.vendorName} - ${invoice.reference}`,
            amount,
            type: 'Expense',
            category: invoice.category,
            reference,
            status: 'Completed',
          },
        })
        await tx.payment.create({
          data: {
            companyId: company.id,
            accountId: account.id,
            transactionId: transaction.id,
            purchaseInvoiceId: invoice.id,
            amount,
            direction: 'Out',
            method: account.type,
            reference,
          },
        })
        await tx.bankAccount.update({
          where: { id: account.id },
          data: { balance: { decrement: amount } },
        })
      }

      return invoice
    })
  })

// --- Factures de vente ------------------------------------------------------
//
// Cycle : brouillon (modifiable, supprimable, sans numero definitif) -> emise
// (numero continu FAC-AAAA-NNNNN, plus modifiable) -> partiellement payee ->
// payee. Une facture emise sans paiement peut etre annulee ; elle n'est jamais
// supprimee, pour ne pas creer de trou dans la numerotation.

const paymentMethods = ['Cash', 'MobileMoney', 'Card', 'BankTransfer', 'Cheque'] as const

const salesInvoiceInput = z.object({
  companySlug: z.string(),
  customerId: z.string().optional(),
  customerName: z.string().trim().max(200).optional(),
  dueDate: z.string().optional(),
  discountRate: z.number().min(0).max(100).default(0),
  taxRate: z.number().min(0).max(100).default(0),
  notes: z.string().trim().max(2000).optional(),
  lines: z.array(quoteLineInput).min(1),
  issue: z.boolean().default(false),
})

function computeDocumentTotals(lines: Array<{ quantity: number; unitPrice: number }>, discountRate: number, taxRate: number) {
  const subtotal = lines.reduce((sum, line) => sum + Math.round(line.quantity * line.unitPrice), 0)
  const discount = Math.round(subtotal * (discountRate / 100))
  const taxable = Math.max(0, subtotal - discount)
  const tax = Math.round(taxable * (taxRate / 100))
  return { subtotal, discount, tax, total: taxable + tax }
}

function invoiceLinesCreate(lines: Array<z.infer<typeof quoteLineInput>>) {
  return lines.map((line, index) => ({
    itemId: line.itemId || null,
    description: line.description.trim(),
    quantity: line.quantity,
    unitPrice: Math.round(line.unitPrice),
    totalCents: Math.round(line.quantity * line.unitPrice),
    sortOrder: index,
  }))
}

function draftNumber() {
  return `BROUILLON-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
}

async function resolveInvoiceCustomer(companyId: string, customerId?: string, customerName?: string) {
  await assertCompanyCustomer(companyId, customerId)
  if (customerId) return customerId
  if (customerName?.trim()) {
    const customer = await prisma.customer.create({ data: { companyId, name: customerName.trim() } })
    return customer.id
  }
  return null
}

const invoiceInclude = {
  customer: true,
  lines: { orderBy: { sortOrder: 'asc' as const } },
  payments: { include: { account: { select: { id: true, name: true } } }, orderBy: { date: 'desc' as const } },
}

export const createSalesInvoice = createServerFn({ method: 'POST' })
  .inputValidator(salesInvoiceInput)
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'invoice.create')
    await assertCompanyItems(company.id, data.lines.map((line) => line.itemId))
    const customerId = await resolveInvoiceCustomer(company.id, data.customerId, data.customerName)
    const totals = computeDocumentTotals(data.lines, data.discountRate, data.taxRate)
    if (data.issue && totals.total <= 0) throw new Error('Une facture emise doit avoir un montant positif.')

    return prisma.$transaction(async (tx) => {
      const number = data.issue ? await nextDocumentReference(tx, company.id, 'sales_invoice') : draftNumber()
      const now = new Date()
      const invoice = await tx.salesInvoice.create({
        data: {
          companyId: company.id,
          customerId,
          number,
          status: data.issue ? 'Sent' : 'Draft',
          issueDate: now,
          issuedAt: data.issue ? now : null,
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
          subtotalCents: totals.subtotal,
          discountRate: Math.round(data.discountRate),
          discountCents: totals.discount,
          taxRate: Math.round(data.taxRate),
          taxCents: totals.tax,
          totalCents: totals.total,
          notes: data.notes || null,
          lines: { create: invoiceLinesCreate(data.lines) },
        },
        include: invoiceInclude,
      })
      await tx.auditLog.create({ data: { companyId: company.id, actorId: user.id, action: data.issue ? 'invoice.issued' : 'invoice.created', entity: 'SalesInvoice', entityId: invoice.id, metadata: JSON.stringify({ number, total: totals.total }) } })
      return invoice
    })
  })

export const updateSalesInvoice = createServerFn({ method: 'POST' })
  .inputValidator(salesInvoiceInput.extend({ invoiceId: z.string() }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'invoice.update')
    const existing = await prisma.salesInvoice.findFirst({ where: { id: data.invoiceId, companyId: company.id } })
    if (!existing) throw new Error('Facture introuvable.')
    if (existing.status !== 'Draft') throw new Error('Seul un brouillon peut etre modifie. Annule la facture pour en refaire une.')
    await assertCompanyItems(company.id, data.lines.map((line) => line.itemId))
    const customerId = await resolveInvoiceCustomer(company.id, data.customerId, data.customerName)
    const totals = computeDocumentTotals(data.lines, data.discountRate, data.taxRate)
    if (data.issue && totals.total <= 0) throw new Error('Une facture emise doit avoir un montant positif.')

    return prisma.$transaction(async (tx) => {
      await tx.salesInvoiceLine.deleteMany({ where: { invoiceId: existing.id } })
      const now = new Date()
      const invoice = await tx.salesInvoice.update({
        where: { id: existing.id },
        data: {
          customerId,
          number: data.issue ? await nextDocumentReference(tx, company.id, 'sales_invoice') : existing.number,
          status: data.issue ? 'Sent' : 'Draft',
          issueDate: data.issue ? now : existing.issueDate,
          issuedAt: data.issue ? now : null,
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
          subtotalCents: totals.subtotal,
          discountRate: Math.round(data.discountRate),
          discountCents: totals.discount,
          taxRate: Math.round(data.taxRate),
          taxCents: totals.tax,
          totalCents: totals.total,
          notes: data.notes || null,
          lines: { create: invoiceLinesCreate(data.lines) },
        },
        include: invoiceInclude,
      })
      await tx.auditLog.create({ data: { companyId: company.id, actorId: user.id, action: data.issue ? 'invoice.issued' : 'invoice.updated', entity: 'SalesInvoice', entityId: invoice.id, metadata: JSON.stringify({ number: invoice.number, total: totals.total }) } })
      return invoice
    })
  })

export const issueSalesInvoice = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ companySlug: z.string(), invoiceId: z.string() }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'invoice.update')
    const existing = await prisma.salesInvoice.findFirst({ where: { id: data.invoiceId, companyId: company.id } })
    if (!existing) throw new Error('Facture introuvable.')
    if (existing.status !== 'Draft') throw new Error('Cette facture est deja emise.')
    if (existing.totalCents <= 0) throw new Error('Une facture emise doit avoir un montant positif.')
    return prisma.$transaction(async (tx) => {
      const now = new Date()
      const number = await nextDocumentReference(tx, company.id, 'sales_invoice')
      const invoice = await tx.salesInvoice.update({ where: { id: existing.id }, data: { number, status: 'Sent', issueDate: now, issuedAt: now }, include: invoiceInclude })
      await tx.auditLog.create({ data: { companyId: company.id, actorId: user.id, action: 'invoice.issued', entity: 'SalesInvoice', entityId: invoice.id, metadata: JSON.stringify({ number, total: invoice.totalCents }) } })
      return invoice
    })
  })

export const recordSalesInvoicePayment = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    companySlug: z.string(),
    invoiceId: z.string(),
    accountId: z.string(),
    amount: z.number().positive(),
    method: z.enum(paymentMethods),
    date: z.string().optional(),
    reference: z.string().trim().max(200).optional(),
  }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'invoice.update')
    const invoice = await prisma.salesInvoice.findFirst({ where: { id: data.invoiceId, companyId: company.id }, include: { customer: true } })
    if (!invoice) throw new Error('Facture introuvable.')
    if (!['Sent', 'PartiallyPaid', 'Overdue'].includes(invoice.status)) throw new Error('Seule une facture emise et non soldee peut recevoir un paiement.')
    const account = await prisma.bankAccount.findFirst({ where: { id: data.accountId, companyId: company.id } })
    if (!account) throw new Error('Compte introuvable.')
    const amount = Math.round(data.amount)
    const remaining = invoice.totalCents - invoice.paidCents
    if (amount > remaining) throw new Error('Le montant depasse le reste a payer.')
    const date = data.date ? new Date(data.date) : new Date()

    return prisma.$transaction(async (tx) => {
      // Garde concurrente : le paiement n'est accepte que si le deja-paye n'a
      // pas change entre la lecture et l'ecriture.
      const paid = await tx.salesInvoice.updateMany({
        where: { id: invoice.id, paidCents: invoice.paidCents },
        data: { paidCents: { increment: amount }, status: amount === remaining ? 'Paid' : 'PartiallyPaid' },
      })
      if (!paid.count) throw new Error('La facture a ete modifiee entre-temps. Recharge la page.')
      const transaction = await tx.transaction.create({
        data: {
          companyId: company.id, accountId: account.id, date,
          description: invoice.customer ? `${invoice.customer.name} - ${invoice.number}` : `Facture ${invoice.number}`,
          amount, type: 'Income', category: 'Ventes', reference: invoice.number, status: 'Completed',
        },
      })
      await tx.payment.create({
        data: {
          companyId: company.id, accountId: account.id, transactionId: transaction.id, salesInvoiceId: invoice.id,
          date, amount, direction: 'In', method: data.method, reference: data.reference || invoice.number,
        },
      })
      await tx.bankAccount.update({ where: { id: account.id }, data: { balance: { increment: amount } } })
      await tx.auditLog.create({ data: { companyId: company.id, actorId: user.id, action: 'invoice.payment_recorded', entity: 'SalesInvoice', entityId: invoice.id, metadata: JSON.stringify({ number: invoice.number, amount, method: data.method }) } })
      return tx.salesInvoice.findUniqueOrThrow({ where: { id: invoice.id }, include: invoiceInclude })
    })
  })

export const cancelSalesInvoice = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ companySlug: z.string(), invoiceId: z.string() }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'invoice.update')
    const invoice = await prisma.salesInvoice.findFirst({ where: { id: data.invoiceId, companyId: company.id } })
    if (!invoice) throw new Error('Facture introuvable.')
    if (invoice.status === 'Draft') throw new Error('Un brouillon se supprime, il ne s annule pas.')
    if (invoice.status === 'Cancelled') throw new Error('Cette facture est deja annulee.')
    if (invoice.paidCents > 0) throw new Error('Cette facture a deja recu des paiements : elle ne peut pas etre annulee.')
    return prisma.$transaction(async (tx) => {
      const result = await tx.salesInvoice.update({ where: { id: invoice.id }, data: { status: 'Cancelled', cancelledAt: new Date() }, include: invoiceInclude })
      await tx.auditLog.create({ data: { companyId: company.id, actorId: user.id, action: 'invoice.cancelled', entity: 'SalesInvoice', entityId: invoice.id, metadata: JSON.stringify({ number: invoice.number }) } })
      return result
    })
  })

export const deleteSalesInvoice = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ companySlug: z.string(), invoiceId: z.string() }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'invoice.delete')
    const invoice = await prisma.salesInvoice.findFirst({ where: { id: data.invoiceId, companyId: company.id } })
    if (!invoice) throw new Error('Facture introuvable.')
    if (invoice.status !== 'Draft') throw new Error('Une facture emise ne peut pas etre supprimee : annule-la.')
    await prisma.$transaction(async (tx) => {
      await tx.auditLog.create({ data: { companyId: company.id, actorId: user.id, action: 'invoice.deleted', entity: 'SalesInvoice', entityId: invoice.id, metadata: JSON.stringify({ number: invoice.number }) } })
      await tx.salesInvoice.delete({ where: { id: invoice.id } })
    })
    return { ok: true }
  })

export const createInvoiceFromQuote = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ companySlug: z.string(), quoteId: z.string() }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'invoice.create')
    const quote = await prisma.quote.findFirst({
      where: { id: data.quoteId, companyId: company.id },
      include: { lines: { orderBy: { sortOrder: 'asc' } }, invoices: { where: { status: { not: 'Cancelled' } }, select: { id: true } } },
    })
    if (!quote) throw new Error('Devis introuvable.')
    if (['Rejected', 'Expired'].includes(quote.status)) throw new Error('Un devis refuse ou expire ne peut pas etre facture.')
    if (quote.invoices.length) throw new Error('Ce devis a deja ete facture.')
    const totals = computeDocumentTotals(quote.lines, quote.discountRate, quote.taxRate)

    return prisma.$transaction(async (tx) => {
      const invoice = await tx.salesInvoice.create({
        data: {
          companyId: company.id,
          customerId: quote.customerId,
          quoteId: quote.id,
          number: draftNumber(),
          status: 'Draft',
          subtotalCents: totals.subtotal,
          discountRate: quote.discountRate,
          discountCents: totals.discount,
          taxRate: quote.taxRate,
          taxCents: totals.tax,
          totalCents: totals.total,
          notes: quote.notes,
          lines: { create: quote.lines.map((line) => ({ itemId: line.itemId, description: line.description, quantity: line.quantity, unitPrice: line.unitPrice, totalCents: line.totalCents, sortOrder: line.sortOrder })) },
        },
        include: invoiceInclude,
      })
      if (quote.status !== 'Accepted') {
        await tx.quote.update({ where: { id: quote.id }, data: { status: 'Accepted', acceptedAt: new Date() } })
      }
      await tx.auditLog.create({ data: { companyId: company.id, actorId: user.id, action: 'invoice.created_from_quote', entity: 'SalesInvoice', entityId: invoice.id, metadata: JSON.stringify({ quote: quote.reference }) } })
      return invoice
    })
  })

export const createPosSale = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    companySlug: z.string(),
    customerId: z.string().optional(),
    paymentMethod: z.enum(['cash', 'mobile', 'card']),
    lines: z.array(z.object({
      itemId: z.string(),
      quantity: z.number().int().positive(),
    })).min(1),
  }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'pos.sell')
    await assertCompanyCustomer(company.id, data.customerId)
    const register = await prisma.posRegister.upsert({
      where: { companyId_name: { companyId: company.id, name: 'Caisse principale' } },
      update: {}, create: { companyId: company.id, name: 'Caisse principale' },
    })
    const session = (await prisma.posSession.findFirst({ where: { companyId: company.id, registerId: register.id, cashierId: user.id, status: 'Open' }, orderBy: { openedAt: 'desc' } }))
      ?? await prisma.posSession.create({ data: { companyId: company.id, registerId: register.id, cashierId: user.id, status: 'Open' } })
    const requestedQuantities = new Map<string, number>()
    for (const line of data.lines) {
      requestedQuantities.set(line.itemId, (requestedQuantities.get(line.itemId) ?? 0) + line.quantity)
    }
    const itemIds = Array.from(requestedQuantities.keys())
    const items = await prisma.catalogItem.findMany({ where: { companyId: company.id, id: { in: itemIds }, status: 'Active' } })
    if (items.length !== itemIds.length) throw new Error('Un produit du panier est introuvable ou inactif.')

    for (const item of items) {
      const requested = requestedQuantities.get(item.id) ?? 0
      if (item.stock !== null && requested > item.stock) {
        throw new Error(`Stock insuffisant pour ${item.name}. Disponible: ${item.stock}.`)
      }
    }

    const lineItems = itemIds.map((itemId) => {
      const item = items.find((candidate: { id: string }) => candidate.id === itemId)
      if (!item) throw new Error('Produit introuvable.')
      const quantity = requestedQuantities.get(itemId) ?? 0
      return { item, quantity, total: item.price * quantity }
    })
    const total = lineItems.reduce((sum, line) => sum + line.total, 0)
    const account = data.paymentMethod === 'mobile'
      ? await ensureAccount(company.id, 'Cash', 'Mobile money')
      : data.paymentMethod === 'card'
        ? await ensureAccount(company.id, 'CreditCard', 'Paiement carte')
        : await ensureAccount(company.id, 'Cash', 'Caisse boutique')
    const warehouse = lineItems.some((line) => line.item.stock !== null) ? await ensureWarehouse(company.id) : null

    const sale = await prisma.$transaction(async (tx) => {
      const reference = await nextDocumentReference(tx, company.id, 'pos_ticket')
      for (const line of lineItems) {
        if (line.item.stock !== null) {
          // Decrement conditionnel : deux ventes simultanees du meme article ne
          // peuvent pas faire passer le stock en negatif (la verification
          // au-dessus est hors transaction, donc non suffisante).
          const updated = await tx.catalogItem.updateMany({
            where: { id: line.item.id, companyId: company.id, stock: { gte: line.quantity } },
            data: { stock: { decrement: line.quantity } },
          })
          if (updated.count === 0) {
            throw new Error(`Stock insuffisant pour ${line.item.name}.`)
          }
          await tx.stockMovement.create({
            data: {
              companyId: company.id,
              warehouseId: warehouse!.id,
              itemId: line.item.id,
              type: 'Out',
              quantity: line.quantity,
              reference,
              reason: 'Vente POS',
              status: 'Completed',
            },
          })
        }
      }

      await tx.bankAccount.update({
        where: { id: account.id },
        data: { balance: { increment: total } },
      })

      const transaction = await tx.transaction.create({
        data: {
          companyId: company.id,
          accountId: account.id,
          description: `Vente caisse ${reference}`,
          amount: total,
          type: 'Income',
          category: 'POS',
          reference,
          status: 'Completed',
        },
      })
      const ticket = await tx.posTicket.create({
        data: {
          companyId: company.id, sessionId: session.id, cashierId: user.id, customerId: data.customerId || null,
          transactionId: transaction.id, reference, status: 'Completed', paymentMethod: data.paymentMethod,
          subtotalCents: total, totalCents: total,
          lines: { create: lineItems.map((line) => ({ itemId: line.item.id, sku: line.item.sku, name: line.item.name, quantity: line.quantity, unitPrice: line.item.price, totalCents: line.total })) },
        },
        include: { lines: true, customer: true },
      })
      await tx.auditLog.create({ data: { companyId: company.id, actorId: user.id, action: 'pos.sale_completed', entity: 'PosTicket', entityId: ticket.id, metadata: JSON.stringify({ reference, total, paymentMethod: data.paymentMethod }) } })
      return { transaction, ticket, reference }
    })

    const customer = data.customerId ? await prisma.customer.findFirst({ where: { id: data.customerId, companyId: company.id } }) : null
    return {
      reference: sale.reference,
      customer: customer?.name ?? 'Client comptoir',
      total,
      items: data.lines.reduce((sum, line) => sum + line.quantity, 0),
      paymentMethod: data.paymentMethod,
      createdAt: sale.ticket.createdAt.toISOString(),
      lines: sale.ticket.lines.map((line) => ({ name: line.name, sku: line.sku, quantity: line.quantity, unitPrice: line.unitPrice, total: line.totalCents })),
    }
  })

export const openPosSession = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ companySlug: z.string(), openingBalance: z.number().min(0).default(0) }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'pos.sell')
    const register = await prisma.posRegister.upsert({ where: { companyId_name: { companyId: company.id, name: 'Caisse principale' } }, update: {}, create: { companyId: company.id, name: 'Caisse principale' } })
    const existing = await prisma.posSession.findFirst({ where: { registerId: register.id, cashierId: user.id, status: 'Open' } })
    if (existing) return existing
    return prisma.posSession.create({ data: { companyId: company.id, registerId: register.id, cashierId: user.id, openingBalance: Math.round(data.openingBalance) } })
  })

export const closePosSession = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ companySlug: z.string(), closingBalance: z.number().min(0) }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'pos.sell')
    const session = await prisma.posSession.findFirst({ where: { companyId: company.id, cashierId: user.id, status: 'Open' }, orderBy: { openedAt: 'desc' } })
    if (!session) throw new Error('Aucune session de caisse ouverte.')
    const cash = await prisma.posTicket.aggregate({ where: { sessionId: session.id, status: 'Completed', paymentMethod: 'cash' }, _sum: { totalCents: true } })
    const expectedBalance = session.openingBalance + (cash._sum.totalCents ?? 0)
    return prisma.posSession.update({ where: { id: session.id }, data: { status: 'Closed', closingBalance: Math.round(data.closingBalance), expectedBalance, closedAt: new Date() } })
  })

export const updatePosTicket = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    companySlug: z.string(), ticketId: z.string(), customerId: z.string().optional(),
    paymentMethod: z.enum(['cash', 'mobile', 'card']),
    lines: z.array(z.object({ lineId: z.string(), quantity: z.number().int().positive() })).min(1),
  }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'pos.manage')
    const ticket = await prisma.posTicket.findFirst({
      where: { id: data.ticketId, companyId: company.id, status: 'Completed' },
      include: { lines: { include: { item: true } }, transaction: true },
    })
    if (!ticket?.transaction) throw new Error('Ticket modifiable introuvable.')
    const quantities = new Map(data.lines.map((line) => [line.lineId, line.quantity]))
    if (quantities.size !== data.lines.length || quantities.size !== ticket.lines.length || data.lines.some((line) => !ticket.lines.some((existing) => existing.id === line.lineId))) throw new Error('Toutes les lignes du ticket doivent etre conservees.')
    if (data.customerId && !await prisma.customer.findFirst({ where: { id: data.customerId, companyId: company.id } })) throw new Error('Client introuvable.')

    const updatedLines = ticket.lines.filter((line) => quantities.has(line.id)).map((line) => ({ ...line, nextQuantity: quantities.get(line.id)! }))
    const newTotal = updatedLines.reduce((sum, line) => sum + line.unitPrice * line.nextQuantity, 0)
    const newAccount = data.paymentMethod === 'mobile'
      ? await ensureAccount(company.id, 'Cash', 'Mobile money')
      : data.paymentMethod === 'card'
        ? await ensureAccount(company.id, 'CreditCard', 'Paiement carte')
        : await ensureAccount(company.id, 'Cash', 'Caisse boutique')
    const oldAccountId = ticket.transaction.accountId
    const warehouse = updatedLines.some((line) => line.item?.stock !== null && line.nextQuantity !== line.quantity) ? await ensureWarehouse(company.id) : null

    return prisma.$transaction(async (tx) => {
      for (const line of updatedLines) {
        if (!line.item || line.item.stock === null || line.nextQuantity === line.quantity) continue
        const additionalSold = line.nextQuantity - line.quantity
        if (additionalSold > 0) {
          const changed = await tx.catalogItem.updateMany({ where: { id: line.item.id, companyId: company.id, stock: { gte: additionalSold } }, data: { stock: { decrement: additionalSold } } })
          if (!changed.count) throw new Error(`Stock insuffisant pour ${line.name}.`)
        } else await tx.catalogItem.update({ where: { id: line.item.id }, data: { stock: { increment: Math.abs(additionalSold) } } })
        await tx.stockMovement.create({ data: { companyId: company.id, warehouseId: warehouse!.id, itemId: line.item.id, type: 'Adjustment', quantity: Math.abs(additionalSold), reference: ticket.reference, reason: 'Correction ticket de caisse', status: 'Completed' } })
      }
      if (oldAccountId === newAccount.id) {
        await tx.bankAccount.update({ where: { id: oldAccountId }, data: { balance: { increment: newTotal - ticket.totalCents } } })
      } else {
        await tx.bankAccount.update({ where: { id: oldAccountId }, data: { balance: { decrement: ticket.totalCents } } })
        await tx.bankAccount.update({ where: { id: newAccount.id }, data: { balance: { increment: newTotal } } })
      }
      await tx.posTicketLine.deleteMany({ where: { ticketId: ticket.id, id: { notIn: data.lines.map((line) => line.lineId) } } })
      for (const line of updatedLines) await tx.posTicketLine.update({ where: { id: line.id }, data: { quantity: line.nextQuantity, totalCents: line.unitPrice * line.nextQuantity } })
      await tx.transaction.update({ where: { id: ticket.transaction!.id }, data: { accountId: newAccount.id, amount: newTotal } })
      const result = await tx.posTicket.update({ where: { id: ticket.id }, data: { customerId: data.customerId || null, paymentMethod: data.paymentMethod, subtotalCents: newTotal, totalCents: newTotal }, include: { lines: true, customer: true, cashier: { select: { id: true, name: true } }, transaction: { include: { account: true } } } })
      await tx.auditLog.create({ data: { companyId: company.id, actorId: user.id, action: 'pos.ticket_corrected', entity: 'PosTicket', entityId: ticket.id, metadata: JSON.stringify({ previousTotal: ticket.totalCents, total: newTotal, paymentMethod: data.paymentMethod }) } })
      return result
    })
  })

export const createVendor = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    companySlug: z.string(),
    name: z.string().min(1),
    category: z.string().min(1),
    owner: z.string().min(1),
    city: z.string().min(1),
    email: z.string().min(1),
    phone: z.string().min(1),
    contract: z.string().min(1),
    paymentTerms: z.string().min(1),
  }))
  .handler(async ({ data }) => {
    const company = await getCompany(data.companySlug, 'finance.manage')
    return prisma.vendor.create({
      data: {
        companyId: company.id,
        name: data.name.trim(),
        category: data.category.trim(),
        owner: data.owner.trim(),
        city: data.city.trim(),
        email: data.email.trim(),
        phone: data.phone.trim(),
        contract: data.contract.trim(),
        paymentTerms: data.paymentTerms.trim(),
        spend: '0 FCFA',
        orders: 0,
        onTime: 100,
        quality: 100,
        risk: 'Faible',
        status: 'Actif',
        nextReview: new Date(new Date().setMonth(new Date().getMonth() + 6)).toLocaleDateString('fr-FR'),
      },
    })
  })

export const updateVendor = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    companySlug: z.string(),
    id: z.string(),
    status: z.enum(['Strategique', 'Actif', 'A surveiller', 'Suspendu']).optional(),
    risk: z.enum(['Faible', 'Moyen', 'Eleve']).optional(),
  }))
  .handler(async ({ data }) => {
    const company = await getCompany(data.companySlug, 'finance.manage')
    return prisma.vendor.update({
      where: { id: data.id, companyId: company.id },
      data: {
        ...(data.status ? { status: data.status } : {}),
        ...(data.risk ? { risk: data.risk } : {}),
      },
    })
  })

export const deleteVendor = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    companySlug: z.string(),
    id: z.string(),
  }))
  .handler(async ({ data }) => {
    const company = await getCompany(data.companySlug, 'finance.manage')
    return prisma.vendor.delete({
      where: { id: data.id, companyId: company.id },
    })
  })

// --- Clients ---------------------------------------------------------------

const optionalText = z.string().trim().max(500).optional()

const customerInput = z.object({
  companySlug: z.string(),
  name: z.string().trim().min(1).max(200),
  email: z.union([z.literal(''), z.string().trim().email()]).optional(),
  phone: optionalText,
  address: optionalText,
  city: optionalText,
  taxId: optionalText,
  notes: z.string().trim().max(2000).optional(),
})

function customerData(data: z.infer<typeof customerInput>) {
  return {
    name: data.name,
    email: data.email || null,
    phone: data.phone || null,
    address: data.address || null,
    city: data.city || null,
    taxId: data.taxId || null,
    notes: data.notes || null,
  }
}

export const createCustomer = createServerFn({ method: 'POST' })
  .inputValidator(customerInput)
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'customer.create')
    const customer = await prisma.customer.create({ data: { companyId: company.id, ...customerData(data) } })
    await prisma.auditLog.create({ data: { companyId: company.id, actorId: user.id, action: 'customer.created', entity: 'Customer', entityId: customer.id, metadata: JSON.stringify({ name: customer.name }) } })
    return customer
  })

export const updateCustomer = createServerFn({ method: 'POST' })
  .inputValidator(customerInput.extend({ customerId: z.string() }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'customer.update')
    const customer = await prisma.customer.update({ where: { id: data.customerId, companyId: company.id }, data: customerData(data) })
    await prisma.auditLog.create({ data: { companyId: company.id, actorId: user.id, action: 'customer.updated', entity: 'Customer', entityId: customer.id, metadata: JSON.stringify({ name: customer.name }) } })
    return customer
  })

export const deleteCustomer = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ companySlug: z.string(), customerId: z.string() }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'customer.delete')
    const customer = await prisma.customer.findFirst({
      where: { id: data.customerId, companyId: company.id },
      include: { _count: { select: { salesInvoices: true, quotes: true, posTickets: true, deals: true, orders: true } } },
    })
    if (!customer) throw new Error('Client introuvable.')
    const history = customer._count
    if (history.salesInvoices || history.quotes || history.posTickets || history.deals || history.orders) {
      // Supprimer ferait perdre le lien client sur des documents deja emis
      // (ou les opportunites, supprimees en cascade).
      throw new Error(`${customer.name} a deja des documents (factures, devis, tickets ou opportunites) : il ne peut pas etre supprime.`)
    }
    await prisma.$transaction(async (tx) => {
      await tx.auditLog.create({ data: { companyId: company.id, actorId: user.id, action: 'customer.deleted', entity: 'Customer', entityId: customer.id, metadata: JSON.stringify({ name: customer.name }) } })
      await tx.customer.delete({ where: { id: customer.id } })
    })
    return { ok: true }
  })

// --- Tresorerie : comptes, virements, operations manuelles ------------------

const accountTypes = ['Cash', 'MobileMoney', 'Checking', 'Savings', 'CreditCard'] as const

const bankAccountInput = z.object({
  companySlug: z.string(),
  name: z.string().trim().min(1).max(120),
  type: z.enum(accountTypes),
  accountNumber: z.string().trim().max(120).optional(),
})

export const createBankAccount = createServerFn({ method: 'POST' })
  .inputValidator(bankAccountInput.extend({ openingBalance: z.number().min(0).default(0) }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'finance.manage')
    const openingBalance = Math.round(data.openingBalance)
    return prisma.$transaction(async (tx) => {
      const account = await tx.bankAccount.create({
        data: { companyId: company.id, name: data.name, type: data.type, accountNumber: data.accountNumber || null, balance: openingBalance, status: 'Active' },
      })
      // Le solde d'ouverture est trace, mais avec un type a part : ce n'est ni
      // une recette ni une depense, il ne doit pas fausser les rapports.
      if (openingBalance > 0) {
        await tx.transaction.create({
          data: { companyId: company.id, accountId: account.id, description: `Solde d'ouverture - ${account.name}`, amount: openingBalance, type: 'Opening', category: 'Solde initial', status: 'Completed' },
        })
      }
      await tx.auditLog.create({ data: { companyId: company.id, actorId: user.id, action: 'bank_account.created', entity: 'BankAccount', entityId: account.id, metadata: JSON.stringify({ name: account.name, openingBalance }) } })
      return account
    })
  })

export const updateBankAccount = createServerFn({ method: 'POST' })
  .inputValidator(bankAccountInput.extend({ accountId: z.string(), status: z.enum(['Active', 'Archived']) }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'finance.manage')
    const account = await prisma.bankAccount.update({
      where: { id: data.accountId, companyId: company.id },
      data: { name: data.name, type: data.type, accountNumber: data.accountNumber || null, status: data.status },
    })
    await prisma.auditLog.create({ data: { companyId: company.id, actorId: user.id, action: 'bank_account.updated', entity: 'BankAccount', entityId: account.id, metadata: JSON.stringify({ name: account.name, status: account.status }) } })
    return account
  })

export const deleteBankAccount = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ companySlug: z.string(), accountId: z.string() }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'finance.manage')
    const account = await prisma.bankAccount.findFirst({
      where: { id: data.accountId, companyId: company.id },
      include: { _count: { select: { payments: true, transactions: { where: { type: { not: 'Opening' } } } } } },
    })
    if (!account) throw new Error('Compte introuvable.')
    // Les transactions et paiements sont supprimes en cascade avec le compte :
    // un compte qui a servi doit etre archive pour garder l'historique.
    if (account._count.payments || account._count.transactions) {
      throw new Error('Ce compte a deja des operations : archive-le plutot que de le supprimer.')
    }
    await prisma.$transaction(async (tx) => {
      await tx.auditLog.create({ data: { companyId: company.id, actorId: user.id, action: 'bank_account.deleted', entity: 'BankAccount', entityId: account.id, metadata: JSON.stringify({ name: account.name }) } })
      await tx.bankAccount.delete({ where: { id: account.id } })
    })
    return { ok: true }
  })

export const transferBetweenAccounts = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    companySlug: z.string(),
    fromAccountId: z.string(),
    toAccountId: z.string(),
    amount: z.number().positive(),
    date: z.string().optional(),
    note: z.string().trim().max(200).optional(),
  }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'finance.manage')
    if (data.fromAccountId === data.toAccountId) throw new Error('Choisis deux comptes differents.')
    const accounts = await prisma.bankAccount.findMany({ where: { companyId: company.id, id: { in: [data.fromAccountId, data.toAccountId] } } })
    const from = accounts.find((account) => account.id === data.fromAccountId)
    const to = accounts.find((account) => account.id === data.toAccountId)
    if (!from || !to) throw new Error('Compte introuvable.')
    const amount = Math.round(data.amount)
    const date = data.date ? new Date(data.date) : new Date()
    const reference = `VIR-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
    const note = data.note ? ` (${data.note})` : ''

    return prisma.$transaction(async (tx) => {
      // Debit conditionnel : pas de virement qui mettrait le compte source a
      // decouvert, meme en cas d'operations simultanees.
      const debited = await tx.bankAccount.updateMany({ where: { id: from.id, balance: { gte: amount } }, data: { balance: { decrement: amount } } })
      if (!debited.count) throw new Error(`Solde insuffisant sur ${from.name}.`)
      await tx.bankAccount.update({ where: { id: to.id }, data: { balance: { increment: amount } } })
      await tx.transaction.create({ data: { companyId: company.id, accountId: from.id, date, description: `Virement vers ${to.name}${note}`, amount, type: 'TransferOut', category: 'Virement', reference, status: 'Completed' } })
      await tx.transaction.create({ data: { companyId: company.id, accountId: to.id, date, description: `Virement depuis ${from.name}${note}`, amount, type: 'TransferIn', category: 'Virement', reference, status: 'Completed' } })
      await tx.auditLog.create({ data: { companyId: company.id, actorId: user.id, action: 'bank_account.transfer', entity: 'BankAccount', entityId: from.id, metadata: JSON.stringify({ from: from.name, to: to.name, amount, reference }) } })
      return { reference }
    })
  })

// Une operation creee par une facture, un achat ou la caisse est liee a un
// paiement ou a un ticket : elle se corrige depuis ce document, pas ici.
async function findManualTransaction(companyId: string, transactionId: string) {
  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, companyId },
    include: { _count: { select: { payments: true } }, posTicket: { select: { id: true } } },
  })
  if (!transaction) throw new Error('Operation introuvable.')
  if (transaction._count.payments || transaction.posTicket) {
    throw new Error('Cette operation vient d une facture, d un achat ou de la caisse : corrige-la depuis le document d origine.')
  }
  if (!['Income', 'Expense'].includes(transaction.type)) {
    throw new Error('Les virements et soldes d ouverture ne se modifient pas.')
  }
  return transaction
}

function signedAmount(type: string, amount: number) {
  return type === 'Income' ? amount : -amount
}

export const updateFinanceTransaction = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    companySlug: z.string(),
    transactionId: z.string(),
    accountId: z.string(),
    description: z.string().trim().min(1).max(300),
    amount: z.number().positive(),
    category: z.string().trim().min(1).max(120),
    date: z.string().optional(),
    reference: z.string().trim().max(200).optional(),
  }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'finance.manage')
    const existing = await findManualTransaction(company.id, data.transactionId)
    const account = await prisma.bankAccount.findFirst({ where: { id: data.accountId, companyId: company.id } })
    if (!account) throw new Error('Compte introuvable.')
    const amount = Math.round(data.amount)

    return prisma.$transaction(async (tx) => {
      // Annule l'effet de l'ancienne operation puis applique la nouvelle.
      await tx.bankAccount.update({ where: { id: existing.accountId }, data: { balance: { increment: -signedAmount(existing.type, existing.amount) } } })
      await tx.bankAccount.update({ where: { id: account.id }, data: { balance: { increment: signedAmount(existing.type, amount) } } })
      const transaction = await tx.transaction.update({
        where: { id: existing.id },
        data: { accountId: account.id, description: data.description, amount, category: data.category, date: data.date ? new Date(data.date) : existing.date, reference: data.reference || null },
      })
      await tx.auditLog.create({ data: { companyId: company.id, actorId: user.id, action: 'transaction.updated', entity: 'Transaction', entityId: transaction.id, metadata: JSON.stringify({ previous: existing.amount, amount }) } })
      return transaction
    })
  })

export const deleteFinanceTransaction = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ companySlug: z.string(), transactionId: z.string() }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'finance.manage')
    const existing = await findManualTransaction(company.id, data.transactionId)
    await prisma.$transaction(async (tx) => {
      await tx.bankAccount.update({ where: { id: existing.accountId }, data: { balance: { increment: -signedAmount(existing.type, existing.amount) } } })
      await tx.auditLog.create({ data: { companyId: company.id, actorId: user.id, action: 'transaction.deleted', entity: 'Transaction', entityId: existing.id, metadata: JSON.stringify({ description: existing.description, amount: existing.amount, type: existing.type }) } })
      await tx.transaction.delete({ where: { id: existing.id } })
    })
    return { ok: true }
  })

// --- Factures d'achat : modification, paiement, annulation ------------------

async function findPurchaseInvoice(companyId: string, invoiceId: string) {
  const invoice = await prisma.purchaseInvoice.findFirst({ where: { id: invoiceId, companyId } })
  if (!invoice) throw new Error('Facture d achat introuvable.')
  return invoice
}

export const updatePurchaseInvoice = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    companySlug: z.string(),
    invoiceId: z.string(),
    vendorName: z.string().trim().min(1).max(200),
    reference: z.string().trim().min(1).max(120),
    category: z.string().trim().min(1).max(120),
    amount: z.number().positive(),
    issueDate: z.string().optional(),
    dueDate: z.string().optional(),
    notes: z.string().trim().max(2000).optional(),
  }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'finance.manage')
    const invoice = await findPurchaseInvoice(company.id, data.invoiceId)
    if (invoice.paidCents > 0) throw new Error('Cette facture a deja des paiements : elle ne peut plus etre modifiee.')
    if (invoice.status === 'Cancelled') throw new Error('Une facture annulee ne se modifie pas.')
    const vendor = await prisma.vendor.findFirst({ where: { companyId: company.id, name: data.vendorName } })
    const updated = await prisma.purchaseInvoice.update({
      where: { id: invoice.id },
      data: {
        vendorId: vendor?.id ?? null,
        vendorName: data.vendorName,
        reference: data.reference,
        category: data.category,
        totalCents: Math.round(data.amount),
        issueDate: data.issueDate ? new Date(data.issueDate) : invoice.issueDate,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        notes: data.notes || null,
      },
    })
    await prisma.auditLog.create({ data: { companyId: company.id, actorId: user.id, action: 'purchase_invoice.updated', entity: 'PurchaseInvoice', entityId: invoice.id, metadata: JSON.stringify({ reference: updated.reference, total: updated.totalCents }) } })
    return updated
  })

export const recordPurchaseInvoicePayment = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    companySlug: z.string(),
    invoiceId: z.string(),
    accountId: z.string(),
    amount: z.number().positive(),
    method: z.enum(paymentMethods),
    date: z.string().optional(),
    reference: z.string().trim().max(200).optional(),
  }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'finance.manage')
    const invoice = await findPurchaseInvoice(company.id, data.invoiceId)
    if (!['Pending', 'PartiallyPaid', 'Overdue'].includes(invoice.status)) throw new Error('Cette facture n a plus rien a payer.')
    const account = await prisma.bankAccount.findFirst({ where: { id: data.accountId, companyId: company.id } })
    if (!account) throw new Error('Compte introuvable.')
    const amount = Math.round(data.amount)
    const remaining = invoice.totalCents - invoice.paidCents
    if (amount > remaining) throw new Error('Le montant depasse le reste a payer.')
    const date = data.date ? new Date(data.date) : new Date()

    return prisma.$transaction(async (tx) => {
      const paid = await tx.purchaseInvoice.updateMany({
        where: { id: invoice.id, paidCents: invoice.paidCents },
        data: { paidCents: { increment: amount }, status: amount === remaining ? 'Paid' : 'PartiallyPaid' },
      })
      if (!paid.count) throw new Error('La facture a ete modifiee entre-temps. Recharge la page.')
      const transaction = await tx.transaction.create({
        data: { companyId: company.id, accountId: account.id, date, description: `${invoice.vendorName} - ${invoice.reference}`, amount, type: 'Expense', category: invoice.category, reference: invoice.reference, status: 'Completed' },
      })
      await tx.payment.create({
        data: { companyId: company.id, accountId: account.id, transactionId: transaction.id, purchaseInvoiceId: invoice.id, date, amount, direction: 'Out', method: data.method, reference: data.reference || invoice.reference },
      })
      await tx.bankAccount.update({ where: { id: account.id }, data: { balance: { decrement: amount } } })
      await tx.auditLog.create({ data: { companyId: company.id, actorId: user.id, action: 'purchase_invoice.payment_recorded', entity: 'PurchaseInvoice', entityId: invoice.id, metadata: JSON.stringify({ reference: invoice.reference, amount, method: data.method }) } })
      return { ok: true }
    })
  })

export const cancelPurchaseInvoice = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ companySlug: z.string(), invoiceId: z.string() }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'finance.manage')
    const invoice = await findPurchaseInvoice(company.id, data.invoiceId)
    if (invoice.paidCents > 0) throw new Error('Cette facture a deja des paiements : elle ne peut pas etre annulee.')
    await prisma.$transaction(async (tx) => {
      await tx.purchaseInvoice.update({ where: { id: invoice.id }, data: { status: 'Cancelled' } })
      await tx.auditLog.create({ data: { companyId: company.id, actorId: user.id, action: 'purchase_invoice.cancelled', entity: 'PurchaseInvoice', entityId: invoice.id, metadata: JSON.stringify({ reference: invoice.reference }) } })
    })
    return { ok: true }
  })

export const deletePurchaseInvoice = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ companySlug: z.string(), invoiceId: z.string() }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'finance.manage')
    const invoice = await findPurchaseInvoice(company.id, data.invoiceId)
    // Les paiements sont supprimes en cascade avec la facture, mais pas leurs
    // transactions ni l'effet sur le solde : interdit des qu'un paiement existe.
    if (invoice.paidCents > 0) throw new Error('Cette facture a deja des paiements : elle ne peut pas etre supprimee.')
    await prisma.$transaction(async (tx) => {
      await tx.auditLog.create({ data: { companyId: company.id, actorId: user.id, action: 'purchase_invoice.deleted', entity: 'PurchaseInvoice', entityId: invoice.id, metadata: JSON.stringify({ reference: invoice.reference, total: invoice.totalCents }) } })
      await tx.purchaseInvoice.delete({ where: { id: invoice.id } })
    })
    return { ok: true }
  })

// --- RH : employes ------------------------------------------------------------

const employeeInput = z.object({
  companySlug: z.string(),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.union([z.literal(''), z.string().trim().email()]).optional(),
  phone: z.string().trim().max(50).optional(),
  department: z.string().trim().min(1).max(100),
  position: z.string().trim().min(1).max(100),
  status: z.enum(['Active', 'OnLeave', 'Onboarding', 'Terminated']),
  type: z.enum(['Full-time', 'Part-time', 'Contract']),
  hireDate: z.string().min(1),
  salary: z.number().min(0),
})

function employeeData(data: z.infer<typeof employeeInput>) {
  return {
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email || null,
    phone: data.phone || null,
    department: data.department,
    position: data.position,
    status: data.status,
    type: data.type,
    hireDate: new Date(data.hireDate),
    salary: Math.round(data.salary),
  }
}

export const createEmployee = createServerFn({ method: 'POST' })
  .inputValidator(employeeInput)
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'employee.create')
    const employee = await prisma.employee.create({ data: { companyId: company.id, ...employeeData(data) } })
    await prisma.auditLog.create({ data: { companyId: company.id, actorId: user.id, action: 'employee.created', entity: 'Employee', entityId: employee.id, metadata: JSON.stringify({ name: `${employee.firstName} ${employee.lastName}` }) } })
    return employee
  })

export const updateEmployee = createServerFn({ method: 'POST' })
  .inputValidator(employeeInput.extend({ employeeId: z.string() }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'employee.update')
    const employee = await prisma.employee.update({ where: { id: data.employeeId, companyId: company.id }, data: employeeData(data) })
    await prisma.auditLog.create({ data: { companyId: company.id, actorId: user.id, action: 'employee.updated', entity: 'Employee', entityId: employee.id, metadata: JSON.stringify({ name: `${employee.firstName} ${employee.lastName}`, status: employee.status }) } })
    return employee
  })

export const deleteEmployee = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ companySlug: z.string(), employeeId: z.string() }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'employee.delete')
    const employee = await prisma.employee.findFirst({ where: { id: data.employeeId, companyId: company.id } })
    if (!employee) throw new Error('Employe introuvable.')
    await prisma.$transaction(async (tx) => {
      await tx.auditLog.create({ data: { companyId: company.id, actorId: user.id, action: 'employee.deleted', entity: 'Employee', entityId: employee.id, metadata: JSON.stringify({ name: `${employee.firstName} ${employee.lastName}` }) } })
      await tx.employee.delete({ where: { id: employee.id } })
    })
    return { ok: true }
  })

// --- Categories du catalogue --------------------------------------------------

export const updateCatalogCategory = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    companySlug: z.string(),
    categoryId: z.string(),
    name: z.string().trim().min(1).max(80),
    color: z.string().max(20).default('slate'),
  }))
  .handler(async ({ data }) => {
    const company = await getCompany(data.companySlug, 'inventory.manage')
    const duplicate = await prisma.category.findFirst({ where: { companyId: company.id, name: data.name, id: { not: data.categoryId } } })
    if (duplicate) throw new Error('Une autre categorie porte deja ce nom.')
    return prisma.category.update({ where: { id: data.categoryId, companyId: company.id }, data: { name: data.name, color: data.color } })
  })

export const deleteCatalogCategory = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ companySlug: z.string(), categoryId: z.string() }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'inventory.manage')
    const category = await prisma.category.findFirst({ where: { id: data.categoryId, companyId: company.id }, include: { _count: { select: { items: true } } } })
    if (!category) throw new Error('Categorie introuvable.')
    // Les articles ne sont pas supprimes : ils passent simplement "sans categorie".
    await prisma.$transaction(async (tx) => {
      await tx.auditLog.create({ data: { companyId: company.id, actorId: user.id, action: 'category.deleted', entity: 'Category', entityId: category.id, metadata: JSON.stringify({ name: category.name, items: category._count.items }) } })
      await tx.category.delete({ where: { id: category.id } })
    })
    return { ok: true, detachedItems: category._count.items }
  })
