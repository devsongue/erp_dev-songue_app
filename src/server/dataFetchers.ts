import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { prisma } from './db'
import type { Customer, CatalogItem, Transaction, Quote, Vendor, PurchaseInvoice } from '@prisma/client'

async function getCompany(companySlug: string, permission?: string) {
  const { requireCompanyAccess } = await import('./access')
  const { company } = await requireCompanyAccess(companySlug, permission)
  return company
}

export const getFinanceData = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ companySlug: z.string() }))
  .handler(async ({ data }) => {
    const { requireCompanyAccess } = await import('./access')
    const { company, user } = await requireCompanyAccess(data.companySlug, 'finance.read')

    const [accounts, transactions] = await Promise.all([
      prisma.bankAccount.findMany({
        where: { companyId: company.id },
        include: { _count: { select: { payments: true, transactions: { where: { type: { not: 'Opening' } } } } } },
        orderBy: [{ status: 'asc' }, { name: 'asc' }],
      }),
      prisma.transaction.findMany({
        where: { companyId: company.id },
        include: {
          account: { select: { id: true, name: true } },
          _count: { select: { payments: true } },
          posTicket: { select: { id: true } },
        },
        orderBy: { date: 'desc' },
        take: 500,
      }),
    ])

    return {
      accounts: accounts.map(({ _count, ...account }) => ({ ...account, used: _count.payments + _count.transactions > 0 })),
      // `editable` : operation saisie a la main (ni facture, ni achat, ni caisse,
      // ni virement), la seule qui se corrige depuis les ecrans Finance.
      transactions: transactions.map(({ _count, posTicket, ...transaction }) => ({
        ...transaction,
        editable: !_count.payments && !posTicket && ['Income', 'Expense'].includes(transaction.type),
      })),
    }
  })

export const getHrData = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ companySlug: z.string() }))
  .handler(async ({ data }) => {
    const company = await getCompany(data.companySlug, 'employee.read')

    const employees = await prisma.employee.findMany({ where: { companyId: company.id } })

    // Build department counts from actual data
    const deptMap = new Map<string, number>()
    for (const emp of employees) {
      deptMap.set(emp.department, (deptMap.get(emp.department) ?? 0) + 1)
    }
    const departments = Array.from(deptMap.entries()).map(([id, count]) => ({ id, count }))

    return { employees, departments }
  })

export const getCrmData = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ companySlug: z.string() }))
  .handler(async ({ data }) => {
    const company = await getCompany(data.companySlug, 'customer.read')

    const [deals, leads, customers] = await Promise.all([
      prisma.deal.findMany({
        where: { companyId: company.id },
        include: { customer: true },
      }),
      prisma.lead.findMany({
        where: { companyId: company.id },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.customer.findMany({ where: { companyId: company.id } }),
    ])

    return { deals, leads, customers }
  })

export const getCatalogData = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ companySlug: z.string() }))
  .handler(async ({ data }) => {
    const company = await getCompany(data.companySlug, 'inventory.read')

    const [items, categories] = await Promise.all([
      prisma.catalogItem.findMany({
        where: { companyId: company.id },
        include: { category: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.category.findMany({ where: { companyId: company.id }, orderBy: { name: 'asc' } }),
    ])

    return { items, categories }
  })

export const getQuoteData = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ companySlug: z.string() }))
  .handler(async ({ data }) => {
    const companyAccess = await getCompany(data.companySlug, 'invoice.read')
    const company = await prisma.company.findUnique({
      where: { id: companyAccess.id },
      include: { quoteSettings: true },
    })
    if (!company) throw new Error('Company not found')

    const [quotes, customers, items] = await Promise.all([
      prisma.quote.findMany({
        where: { companyId: company.id },
        include: {
          customer: true,
          lines: {
            include: { item: true },
            orderBy: { sortOrder: 'asc' },
          },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.customer.findMany({ where: { companyId: company.id }, orderBy: { name: 'asc' } }),
      prisma.catalogItem.findMany({
        where: { companyId: company.id, status: 'Active' },
        orderBy: { name: 'asc' },
      }),
    ])

    const settings = company.quoteSettings ?? {
      id: '',
      companyId: company.id,
      logoUrl: null,
      legalName: company.name,
      address: null,
      phone: null,
      email: null,
      taxId: null,
      footerNote: 'Merci pour votre confiance.',
      paymentTerms: 'Validite 30 jours. Paiement selon accord commercial.',
      accentColor: '#0f172a',
      nextNumber: 1,
      createdAt: company.createdAt,
      updatedAt: company.updatedAt,
    }

    return { company: { id: company.id, name: company.name, slug: company.slug }, settings, quotes, customers, items }
  })

export const getInventoryData = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ companySlug: z.string() }))
  .handler(async ({ data }) => {
    const company = await getCompany(data.companySlug, 'inventory.read')

    const [warehouses, movements, items] = await Promise.all([
      prisma.warehouse.findMany({ where: { companyId: company.id } }),
      prisma.stockMovement.findMany({
        where: { companyId: company.id },
        orderBy: { date: 'desc' },
        take: 20,
      }),
      prisma.catalogItem.findMany({
        where: { companyId: company.id, type: 'Product' },
        orderBy: { name: 'asc' },
      }),
    ])

    return { warehouses, movements, items }
  })

export const getPosData = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ companySlug: z.string() }))
  .handler(async ({ data }) => {
    const { requireCompanyAccess } = await import('./access')
    const { company, user } = await requireCompanyAccess(data.companySlug, 'pos.read')

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const [items, categories, customers, tickets, todayAgg, currentSession] = await Promise.all([
      prisma.catalogItem.findMany({
        where: { companyId: company.id, status: 'Active' },
        include: { category: true },
        orderBy: { name: 'asc' },
      }),
      prisma.category.findMany({ where: { companyId: company.id }, orderBy: { name: 'asc' } }),
      prisma.customer.findMany({ where: { companyId: company.id }, orderBy: { createdAt: 'desc' } }),
      prisma.posTicket.findMany({
        where: { companyId: company.id },
        include: { lines: true, customer: true, cashier: { select: { id: true, name: true } }, transaction: { include: { account: true } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      // Total du jour en SQL : la liste `tickets` est tronquee a 50 et ne peut
      // pas servir de base a un total fiable.
      prisma.posTicket.aggregate({
        where: { companyId: company.id, status: 'Completed', createdAt: { gte: todayStart } },
        _sum: { totalCents: true },
        _count: { _all: true },
      }),
      prisma.posSession.findFirst({ where: { companyId: company.id, cashierId: user.id, status: 'Open' }, include: { register: true }, orderBy: { openedAt: 'desc' } }),
    ])

    return {
      items,
      categories,
      customers,
      tickets: tickets.map((ticket) => ({ ...ticket, date: ticket.createdAt, amount: ticket.totalCents, description: ticket.customer?.name ?? 'Client comptoir', account: ticket.transaction?.account ?? null })),
      currentSession,
      today: { total: todayAgg._sum.totalCents ?? 0, count: todayAgg._count._all },
    }
  })

export const getVendorData = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ companySlug: z.string() }))
  .handler(async ({ data }) => {
    const company = await getCompany(data.companySlug, 'finance.read')

    const vendors = await prisma.vendor.findMany({
      where: { companyId: company.id },
      orderBy: { name: 'asc' },
    })

    return { vendors }
  })

export const searchCompanyData = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ companySlug: z.string(), query: z.string() }))
  .handler(async ({ data }) => {
    const query = data.query.trim()
    if (query.length < 2) return []

    const { requireCompanyAccess } = await import('./access')
    const { user, company, permissions } = await requireCompanyAccess(data.companySlug)
    // La recherche croise plusieurs modules : chaque section respecte la permission de son module.
    const can = (permission: string) => user.isOwner || permissions.has(permission)

    const [customers, items, transactions, quotes, vendors] = await Promise.all([
      can('customer.read') ? prisma.customer.findMany({
        where: {
          companyId: company.id,
          OR: [
            { name: { contains: query } },
            { email: { contains: query } },
          ],
        },
        orderBy: { updatedAt: 'desc' },
        take: 5,
      }) : Promise.resolve([] as Customer[]),
      can('inventory.read') ? prisma.catalogItem.findMany({
        where: {
          companyId: company.id,
          OR: [
            { name: { contains: query } },
            { sku: { contains: query } },
            { description: { contains: query } },
            { supplier: { contains: query } },
          ],
        },
        orderBy: { updatedAt: 'desc' },
        take: 5,
      }) : Promise.resolve([] as CatalogItem[]),
      can('finance.read') ? prisma.transaction.findMany({
        where: {
          companyId: company.id,
          OR: [
            { description: { contains: query } },
            { reference: { contains: query } },
            { category: { contains: query } },
          ],
        },
        orderBy: { date: 'desc' },
        take: 5,
      }) : Promise.resolve([] as Transaction[]),
      can('invoice.read') ? prisma.quote.findMany({
        where: {
          companyId: company.id,
          OR: [
            { reference: { contains: query } },
            { title: { contains: query } },
          ],
        },
        include: { customer: true },
        orderBy: { updatedAt: 'desc' },
        take: 5,
      }) : Promise.resolve([] as (Quote & { customer: Customer | null })[]),
      can('finance.read') ? prisma.vendor.findMany({
        where: {
          companyId: company.id,
          OR: [
            { name: { contains: query } },
            { category: { contains: query } },
            { owner: { contains: query } },
            { city: { contains: query } },
          ],
        },
        orderBy: { updatedAt: 'desc' },
        take: 5,
      }) : Promise.resolve([] as Vendor[]),
    ])

    return [
      ...customers.map((customer: Customer) => ({
        id: customer.id,
        type: 'Client',
        title: customer.name,
        subtitle: customer.email ?? 'Fiche client',
        to: `/${data.companySlug}/crm`,
      })),
      ...items.map((item: CatalogItem) => ({
        id: item.id,
        type: item.type === 'Service' ? 'Service' : 'Produit',
        title: item.name,
        subtitle: `${item.sku} - ${item.status}`,
        to: `/${data.companySlug}/products-services`,
      })),
      ...transactions.map((transaction: Transaction) => ({
        id: transaction.id,
        type: transaction.type === 'Expense' ? 'Depense' : transaction.category === 'POS' ? 'Ticket' : 'Facture',
        title: transaction.description,
        subtitle: `${transaction.reference ?? transaction.category} - ${transaction.status}`,
        to: transaction.category === 'POS'
          ? `/${data.companySlug}/pos/history`
          : transaction.type === 'Expense'
            ? `/${data.companySlug}/finance/expenses`
            : `/${data.companySlug}/invoices`,
      })),
      ...quotes.map((quote: Quote & { customer: Customer | null }) => ({
        id: quote.id,
        type: 'Devis',
        title: quote.reference,
        subtitle: `${quote.title} - ${quote.customer?.name ?? 'Client libre'}`,
        to: `/${data.companySlug}/quotes`,
      })),
      ...vendors.map((vendor: Vendor) => ({
        id: vendor.id,
        type: 'Fournisseur',
        title: vendor.name,
        subtitle: `${vendor.category} - ${vendor.status}`,
        to: `/${data.companySlug}/purchases/vendors`,
      })),
    ].slice(0, 12)
  })

export const getPosReportData = createServerFn({ method: 'GET' })
  .inputValidator(z.object({
    companySlug: z.string(),
    start: z.string(),
    end: z.string(),
  }))
  .handler(async ({ data }) => {
    const company = await getCompany(data.companySlug, 'pos.read')

    const start = new Date(data.start)
    const end = new Date(data.end)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      throw new Error('Periode invalide.')
    }

    const where = {
      companyId: company.id,
      category: 'POS',
      date: { gte: start, lte: end },
    }

    // Totaux par compte en SQL sur toute la periode : la liste des tickets est
    // plafonnee pour l'affichage mais les montants restent exacts.
    const [tickets, groups] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: { account: true },
        orderBy: { date: 'desc' },
        take: 200,
      }),
      prisma.transaction.groupBy({
        by: ['accountId'],
        where,
        _sum: { amount: true },
        _count: { _all: true },
      }),
    ])

    const accounts = await prisma.bankAccount.findMany({
      where: { companyId: company.id, id: { in: groups.map((group) => group.accountId) } },
      select: { id: true, name: true },
    })

    return {
      tickets,
      totals: groups.map((group) => ({
        accountName: accounts.find((account) => account.id === group.accountId)?.name ?? 'Caisse',
        amount: group._sum.amount ?? 0,
      })),
      totalAmount: groups.reduce((sum, group) => sum + (group._sum.amount ?? 0), 0),
      ticketCount: groups.reduce((sum, group) => sum + group._count._all, 0),
    }
  })

export const getReportsData = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ companySlug: z.string() }))
  .handler(async ({ data }) => {
    const company = await getCompany(data.companySlug, 'finance.read')

    // Agregats SQL sur l'ensemble des donnees : les listes tronquees (take: 50)
    // des autres fetchers donneraient des totaux faux des que l'historique grossit.
    const [incomeAgg, expenseAgg, stockItems, openDeals] = await Promise.all([
      prisma.transaction.aggregate({
        where: { companyId: company.id, type: 'Income' },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: { companyId: company.id, type: 'Expense' },
        _sum: { amount: true },
      }),
      prisma.catalogItem.findMany({
        where: { companyId: company.id, type: 'Product', stock: { not: null } },
        select: { stock: true, cost: true },
      }),
      prisma.deal.count({ where: { companyId: company.id, status: 'Open' } }),
    ])

    return {
      income: incomeAgg._sum.amount ?? 0,
      expenses: expenseAgg._sum.amount ?? 0,
      // Valorisation au cout d'achat, comme les pages Stock et Produits.
      stockValue: stockItems.reduce((sum, item) => sum + (item.stock ?? 0) * item.cost, 0),
      openDeals,
    }
  })

export const getPurchasesData = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ companySlug: z.string() }))
  .handler(async ({ data }) => {
    const company = await getCompany(data.companySlug, 'finance.read')

    const [vendors, accounts, transactions, invoices, items] = await Promise.all([
      prisma.vendor.findMany({ where: { companyId: company.id }, orderBy: { updatedAt: 'desc' } }),
      prisma.bankAccount.findMany({ where: { companyId: company.id }, orderBy: { name: 'asc' } }),
      prisma.transaction.findMany({
        where: {
          companyId: company.id,
          type: 'Expense',
        },
        orderBy: { date: 'desc' },
        take: 100,
      }),
      prisma.purchaseInvoice.findMany({
        where: { companyId: company.id },
        include: { vendor: true },
        orderBy: { issueDate: 'desc' },
        take: 100,
      }),
      prisma.catalogItem.findMany({
        where: { companyId: company.id, type: 'Product' },
        orderBy: { name: 'asc' },
      }),
    ])

    const legacyInvoices = transactions.filter((transaction: Transaction) =>
      ['Achat stock', 'Achats', 'Fournisseur', 'Charges', 'Loyer', 'Transport'].includes(transaction.category),
    ).map((transaction: Transaction) => ({
      id: transaction.id,
      description: transaction.description,
      reference: transaction.reference,
      category: transaction.category,
      status: transaction.status,
      amount: transaction.amount,
      date: transaction.date,
      vendorName: transaction.description.split(' - ')[0] ?? '',
      source: 'transaction',
    }))
    const purchaseInvoices = [
      ...invoices.map((invoice: PurchaseInvoice & { vendor: Vendor | null }) => ({
        id: invoice.id,
        description: invoice.vendorName ? `${invoice.vendorName} - ${invoice.reference}` : invoice.reference,
        reference: invoice.reference,
        category: invoice.category,
        status: invoice.status,
        amount: invoice.totalCents,
        date: invoice.issueDate,
        vendorName: invoice.vendor?.name ?? invoice.vendorName,
        source: 'purchaseInvoice',
      })),
      ...legacyInvoices,
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 100)
    const stockAlerts = items.filter((item: CatalogItem) =>
      item.stock !== null && item.minStockLevel !== null && item.stock <= item.minStockLevel,
    )

    return { vendors, accounts, purchaseInvoices, stockAlerts }
  })

export const getCustomersData = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ companySlug: z.string() }))
  .handler(async ({ data }) => {
    const company = await getCompany(data.companySlug, 'customer.read')
    const [customers, invoiceTotals, ticketTotals] = await Promise.all([
      prisma.customer.findMany({ where: { companyId: company.id }, orderBy: { name: 'asc' } }),
      prisma.salesInvoice.groupBy({
        by: ['customerId'],
        where: { companyId: company.id, status: { notIn: ['Draft', 'Cancelled'] }, customerId: { not: null } },
        _sum: { totalCents: true, paidCents: true },
        _count: { _all: true },
      }),
      prisma.posTicket.groupBy({
        by: ['customerId'],
        where: { companyId: company.id, status: 'Completed', customerId: { not: null } },
        _sum: { totalCents: true },
        _count: { _all: true },
      }),
    ])
    const invoices = new Map(invoiceTotals.map((row) => [row.customerId, row]))
    const tickets = new Map(ticketTotals.map((row) => [row.customerId, row]))
    return {
      customers: customers.map((customer) => {
        const invoice = invoices.get(customer.id)
        const ticket = tickets.get(customer.id)
        const invoiced = invoice?._sum.totalCents ?? 0
        const paid = invoice?._sum.paidCents ?? 0
        return {
          ...customer,
          invoiceCount: invoice?._count._all ?? 0,
          ticketCount: ticket?._count._all ?? 0,
          revenue: invoiced + (ticket?._sum.totalCents ?? 0),
          balanceDue: Math.max(0, invoiced - paid),
        }
      }),
    }
  })

export const getSalesInvoicesData = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ companySlug: z.string() }))
  .handler(async ({ data }) => {
    const company = await getCompany(data.companySlug, 'invoice.read')
    const [invoices, customers, items, accounts, settings, quotes] = await Promise.all([
      prisma.salesInvoice.findMany({
        where: { companyId: company.id },
        include: {
          customer: true,
          quote: { select: { id: true, reference: true } },
          lines: { orderBy: { sortOrder: 'asc' } },
          payments: { include: { account: { select: { id: true, name: true } } }, orderBy: { date: 'desc' } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.customer.findMany({ where: { companyId: company.id }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      prisma.catalogItem.findMany({ where: { companyId: company.id, status: 'Active' }, select: { id: true, name: true, sku: true, price: true }, orderBy: { name: 'asc' } }),
      prisma.bankAccount.findMany({ where: { companyId: company.id, status: 'Active' }, select: { id: true, name: true, type: true }, orderBy: { name: 'asc' } }),
      prisma.quoteSettings.findUnique({ where: { companyId: company.id } }),
      // Devis encore facturables : ni refuses/expires, ni deja factures.
      prisma.quote.findMany({
        where: { companyId: company.id, status: { in: ['Draft', 'Sent', 'Accepted'] }, invoices: { none: { status: { not: 'Cancelled' } } } },
        select: { id: true, reference: true, title: true, totalCents: true, customer: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ])
    return { companyName: company.name, invoices, customers, items, accounts, settings, quotes }
  })
