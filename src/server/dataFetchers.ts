import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { prisma } from './db'

export const getFinanceData = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ companySlug: z.string() }))
  .handler(async ({ data }) => {
    const company = await prisma.company.findUnique({ where: { slug: data.companySlug } })
    if (!company) throw new Error('Company not found')

    const [accounts, transactions] = await Promise.all([
      prisma.bankAccount.findMany({ where: { companyId: company.id } }),
      prisma.transaction.findMany({
        where: { companyId: company.id },
        orderBy: { date: 'desc' },
        take: 50,
      }),
    ])

    return { accounts, transactions }
  })

export const getHrData = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ companySlug: z.string() }))
  .handler(async ({ data }) => {
    const company = await prisma.company.findUnique({ where: { slug: data.companySlug } })
    if (!company) throw new Error('Company not found')

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
    const company = await prisma.company.findUnique({ where: { slug: data.companySlug } })
    if (!company) throw new Error('Company not found')

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
    const company = await prisma.company.findUnique({ where: { slug: data.companySlug } })
    if (!company) throw new Error('Company not found')

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
    const company = await prisma.company.findUnique({
      where: { slug: data.companySlug },
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
    const company = await prisma.company.findUnique({ where: { slug: data.companySlug } })
    if (!company) throw new Error('Company not found')

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
    const company = await prisma.company.findUnique({ where: { slug: data.companySlug } })
    if (!company) throw new Error('Company not found')

    const [items, categories, customers, tickets] = await Promise.all([
      prisma.catalogItem.findMany({
        where: { companyId: company.id, status: 'Active' },
        include: { category: true },
        orderBy: { name: 'asc' },
      }),
      prisma.category.findMany({ where: { companyId: company.id }, orderBy: { name: 'asc' } }),
      prisma.customer.findMany({ where: { companyId: company.id }, orderBy: { createdAt: 'desc' } }),
      prisma.transaction.findMany({
        where: { companyId: company.id, category: 'POS' },
        include: { account: true },
        orderBy: { date: 'desc' },
        take: 50,
      }),
    ])

    return { items, categories, customers, tickets }
  })
