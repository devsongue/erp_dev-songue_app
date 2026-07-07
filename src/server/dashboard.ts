import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { prisma } from './db'
import type { Prisma } from '@prisma/client'

export const getDashboardData = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({ companySlug: z.string() }),
  )
  .handler(async ({ data }) => {
    const { companySlug } = data

    const { requireCompanyAccess } = await import('./access')
    // Le dashboard agrege comptes, transactions et ventes : on exige au minimum la lecture finance.
    const { company } = await requireCompanyAccess(companySlug, 'finance.read')

    // Stock bas = stock <= seuil (seuil absent traite comme 0), calcule en SQL
    // plutot qu'en chargeant tout le catalogue cote Node.
    const lowStockWhere: Prisma.CatalogItemWhereInput = {
      companyId: company.id,
      type: 'Product',
      stock: { not: null },
      OR: [
        { minStockLevel: { not: null }, stock: { lte: prisma.catalogItem.fields.minStockLevel } },
        { minStockLevel: null, stock: { lte: 0 } },
      ],
    }

    const [accounts, transactions, lowStock, lowStockCount, openDealsCount] = await Promise.all([
      prisma.bankAccount.findMany({ where: { companyId: company.id } }),
      prisma.transaction.findMany({
        where: { companyId: company.id },
        orderBy: { date: 'desc' },
        take: 50,
      }),
      prisma.catalogItem.findMany({
        where: lowStockWhere,
        orderBy: { stock: 'asc' },
        take: 4,
      }),
      prisma.catalogItem.count({ where: lowStockWhere }),
      prisma.deal.count({
        where: { companyId: company.id, stageId: { notIn: ['Won', 'Lost'] } },
      }),
    ])

    return {
      accounts,
      transactions,
      lowStock,
      lowStockCount,
      openDealsCount,
    }
  })
