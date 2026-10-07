import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { prisma } from './db'
import type { Prisma } from '@prisma/client'

export type DashboardTodo = {
  id: string
  kind: 'overdue_invoice' | 'supplier_due' | 'low_stock' | 'stale_pos_session' | 'expiring_quote' | 'draft_invoices'
  title: string
  detail: string
  amount?: number
  to: string
  tone: 'red' | 'amber' | 'blue'
}

export const getDashboardData = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({ companySlug: z.string() }),
  )
  .handler(async ({ data }) => {
    const { companySlug } = data

    const { requireCompanyAccess } = await import('./access')
    // Ouvert a tout membre : chaque bloc n'est calcule que si l'utilisateur a
    // la permission du module concerne (un vendeur voit ses ventes, pas la
    // tresorerie).
    const { user, company, permissions } = await requireCompanyAccess(companySlug)
    const can = (permission: string, moduleKey: string) =>
      (user.isOwner || permissions.has(permission)) && company.enabledModules.includes(moduleKey)
    const canFinance = can('finance.read', 'finance')
    const canInvoices = can('invoice.read', 'sales')
    const canStock = can('inventory.read', 'inventory')
    const canPos = can('pos.read', 'pos')
    const canCrm = can('customer.read', 'crm')

    const now = new Date()
    const today = new Date(now)
    today.setHours(0, 0, 0, 0)
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    const inSevenDays = new Date(today)
    inSevenDays.setDate(inSevenDays.getDate() + 7)
    const inThreeDays = new Date(today)
    inThreeDays.setDate(inThreeDays.getDate() + 3)

    // Stock bas = stock <= seuil (seuil absent traite comme 0), calcule en SQL
    // plutot qu'en chargeant tout le catalogue cote Node.
    const lowStockWhere: Prisma.CatalogItemWhereInput = {
      companyId: company.id,
      type: 'Product',
      status: 'Active',
      stock: { not: null },
      OR: [
        { minStockLevel: { not: null }, stock: { lte: prisma.catalogItem.fields.minStockLevel } },
        { minStockLevel: null, stock: { lte: 0 } },
      ],
    }

    const none = Promise.resolve(null)
    const [
      accounts, monthIncome, monthExpense, todaySales,
      overdueInvoices, draftInvoices, dueSupplierInvoices,
      lowStock, lowStockCount, staleSession, expiringQuotes, openDealsCount,
      setup,
    ] = await Promise.all([
      canFinance ? prisma.bankAccount.findMany({ where: { companyId: company.id, status: 'Active' }, select: { balance: true } }) : none,
      canFinance ? prisma.transaction.aggregate({ where: { companyId: company.id, type: 'Income', date: { gte: monthStart } }, _sum: { amount: true } }) : none,
      canFinance ? prisma.transaction.aggregate({ where: { companyId: company.id, type: 'Expense', date: { gte: monthStart } }, _sum: { amount: true } }) : none,
      canPos ? prisma.posTicket.aggregate({ where: { companyId: company.id, status: 'Completed', createdAt: { gte: today } }, _sum: { totalCents: true }, _count: { _all: true } }) : none,
      canInvoices ? prisma.salesInvoice.findMany({
        where: { companyId: company.id, status: { in: ['Sent', 'PartiallyPaid', 'Overdue'] }, dueDate: { lt: today } },
        include: { customer: { select: { name: true } } },
        orderBy: { dueDate: 'asc' },
        take: 5,
      }) : none,
      canInvoices ? prisma.salesInvoice.count({ where: { companyId: company.id, status: 'Draft' } }) : none,
      canFinance ? prisma.purchaseInvoice.findMany({
        where: { companyId: company.id, status: { in: ['Pending', 'PartiallyPaid', 'Overdue'] }, dueDate: { lte: inSevenDays } },
        orderBy: { dueDate: 'asc' },
        take: 5,
      }) : none,
      canStock ? prisma.catalogItem.findMany({ where: lowStockWhere, orderBy: { stock: 'asc' }, take: 4 }) : none,
      canStock ? prisma.catalogItem.count({ where: lowStockWhere }) : none,
      canPos ? prisma.posSession.findFirst({ where: { companyId: company.id, cashierId: user.id, status: 'Open', openedAt: { lt: today } }, orderBy: { openedAt: 'asc' } }) : none,
      canInvoices ? prisma.quote.findMany({
        where: { companyId: company.id, status: 'Sent', validUntil: { gte: today, lte: inThreeDays } },
        include: { customer: { select: { name: true } } },
        orderBy: { validUntil: 'asc' },
        take: 3,
      }) : none,
      canCrm ? prisma.deal.count({ where: { companyId: company.id, status: 'Open' } }) : none,
      // Premiers pas : de quoi guider une boutique qui demarre.
      Promise.all([
        prisma.catalogItem.count({ where: { companyId: company.id } }),
        prisma.customer.count({ where: { companyId: company.id } }),
        prisma.posTicket.count({ where: { companyId: company.id } }),
        prisma.salesInvoice.count({ where: { companyId: company.id } }),
        prisma.companyMembership.count({ where: { companyId: company.id } }),
      ]),
    ])

    const todo: DashboardTodo[] = []
    const base = `/${companySlug}`
    for (const invoice of overdueInvoices ?? []) {
      const days = Math.max(1, Math.round((today.getTime() - new Date(invoice.dueDate!).getTime()) / 86_400_000))
      todo.push({
        id: `inv-${invoice.id}`, kind: 'overdue_invoice', tone: 'red', to: `${base}/invoices`,
        title: `${invoice.number} · ${invoice.customer?.name ?? 'Client comptoir'}`,
        detail: `En retard de ${days} jour${days > 1 ? 's' : ''}`,
        amount: invoice.totalCents - invoice.paidCents,
      })
    }
    for (const invoice of dueSupplierInvoices ?? []) {
      const overdue = invoice.dueDate! < today
      todo.push({
        id: `pur-${invoice.id}`, kind: 'supplier_due', tone: overdue ? 'red' : 'amber', to: `${base}/purchases/invoices`,
        title: `Payer ${invoice.vendorName}`,
        detail: `${invoice.reference} · ${overdue ? 'échéance dépassée' : `échéance le ${invoice.dueDate!.toLocaleDateString('fr-FR')}`}`,
        amount: invoice.totalCents - invoice.paidCents,
      })
    }
    if (staleSession) {
      todo.push({
        id: `pos-${staleSession.id}`, kind: 'stale_pos_session', tone: 'amber', to: `${base}/pos`,
        title: 'Caisse restée ouverte',
        detail: `Ouverte depuis le ${staleSession.openedAt.toLocaleDateString('fr-FR')} : pense à la clôturer.`,
      })
    }
    for (const product of lowStock ?? []) {
      todo.push({
        id: `stk-${product.id}`, kind: 'low_stock', tone: (product.stock ?? 0) <= 0 ? 'red' : 'amber', to: `${base}/inventory`,
        title: (product.stock ?? 0) <= 0 ? `Rupture : ${product.name}` : `Stock bas : ${product.name}`,
        detail: `${product.stock ?? 0} en stock, seuil ${product.minStockLevel ?? 0}`,
      })
    }
    for (const quote of expiringQuotes ?? []) {
      todo.push({
        id: `quo-${quote.id}`, kind: 'expiring_quote', tone: 'blue', to: `${base}/quotes`,
        title: `Devis ${quote.reference} bientôt expiré`,
        detail: `${quote.customer?.name ?? 'Client libre'} · valable jusqu'au ${quote.validUntil.toLocaleDateString('fr-FR')}`,
        amount: quote.totalCents,
      })
    }
    if (draftInvoices) {
      todo.push({
        id: 'drafts', kind: 'draft_invoices', tone: 'blue', to: `${base}/invoices`,
        title: `${draftInvoices} brouillon${draftInvoices > 1 ? 's' : ''} de facture`,
        detail: 'À vérifier puis émettre.',
      })
    }

    const [itemCount, customerCount, ticketCount, invoiceCount, memberCount] = setup
    return {
      can: { finance: canFinance, invoices: canInvoices, stock: canStock, pos: canPos, crm: canCrm },
      balance: accounts ? accounts.reduce((sum, account) => sum + account.balance, 0) : null,
      monthIncome: monthIncome?._sum.amount ?? 0,
      monthExpense: monthExpense?._sum.amount ?? 0,
      todaySales: { total: todaySales?._sum.totalCents ?? 0, count: todaySales?._count._all ?? 0 },
      lowStockCount: lowStockCount ?? 0,
      openDealsCount: openDealsCount ?? 0,
      todo,
      setup: {
        hasItems: itemCount > 0,
        hasCustomers: customerCount > 0,
        hasSale: ticketCount + invoiceCount > 0,
        hasTeam: memberCount > 1,
      },
    }
  })
