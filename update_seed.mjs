import fs from 'fs'

const seedPath = './src/server/seed.ts'
let content = fs.readFileSync(seedPath, 'utf8')

const imports = `
import { catalogCategories, catalogInitialItems } from '../domain/catalogData'
import { financeAccounts, financeTransactions } from '../domain/financeData'
import { hrEmployees } from '../domain/hrData'
import { inventoryWarehouses, inventoryMovements } from '../domain/inventoryData'
import { crmInitialDeals, crmInitialLeads } from '../domain/crmData'
`

// Add imports
content = content.replace("import { hashPassword } from './password'", "import { hashPassword } from './password'\n" + imports)

// Add deleteMany
const deletes = `
  await prisma.lead.deleteMany()
  await prisma.deal.deleteMany()
  await prisma.customer.deleteMany()
  await prisma.stockMovement.deleteMany()
  await prisma.warehouse.deleteMany()
  await prisma.employee.deleteMany()
  await prisma.transaction.deleteMany()
  await prisma.bankAccount.deleteMany()
  await prisma.catalogItem.deleteMany()
  await prisma.category.deleteMany()
`
content = content.replace('await prisma.session.deleteMany()', deletes + '\n  await prisma.session.deleteMany()')

// Add company seed data
const companySeed = `
    // Catalog
    for (const cat of catalogCategories) {
      await prisma.category.create({
        data: {
          id: \`\${company.slug}-\${cat.id}\`,
          companyId: company.id,
          name: cat.name,
          type: 'Product',
          color: cat.color,
        }
      })
    }
    for (const item of catalogInitialItems) {
      await prisma.catalogItem.create({
        data: {
          id: \`\${company.slug}-\${item.id}\`,
          companyId: company.id,
          name: item.name,
          sku: \`\${company.slug.toUpperCase()}-\${item.sku}\`,
          type: item.type,
          categoryId: item.categoryId ? \`\${company.slug}-\${item.categoryId}\` : null,
          price: item.price,
          stock: item.stock,
          minStockLevel: item.minStockLevel,
          status: item.status,
          createdAt: new Date(item.createdAt),
        }
      })
    }

    // Finance
    for (const acc of financeAccounts) {
      await prisma.bankAccount.create({
        data: {
          id: \`\${company.slug}-\${acc.id}\`,
          companyId: company.id,
          name: acc.name,
          accountNumber: acc.accountNumber,
          type: acc.type,
          currency: acc.currency,
          balance: acc.balance,
          status: acc.status,
        }
      })
    }
    for (const tx of financeTransactions) {
      await prisma.transaction.create({
        data: {
          id: \`\${company.slug}-\${tx.id}\`,
          companyId: company.id,
          accountId: \`\${company.slug}-\${tx.accountId}\`,
          date: new Date(tx.date),
          description: tx.description,
          amount: tx.amount,
          type: tx.type,
          category: tx.category,
          reference: tx.reference,
          status: tx.status,
        }
      })
    }

    // HR
    for (const emp of hrEmployees) {
      await prisma.employee.create({
        data: {
          id: \`\${company.slug}-\${emp.id}\`,
          companyId: company.id,
          firstName: emp.firstName,
          lastName: emp.lastName,
          email: emp.email,
          phone: emp.phone,
          department: emp.department,
          position: emp.position,
          status: emp.status,
          hireDate: new Date(emp.hireDate),
          salary: emp.salary,
          type: emp.type,
        }
      })
    }

    // Inventory
    for (const wh of inventoryWarehouses) {
      await prisma.warehouse.create({
        data: {
          id: \`\${company.slug}-\${wh.id}\`,
          companyId: company.id,
          name: wh.name,
          location: wh.location,
          manager: wh.manager,
          capacity: wh.capacity,
          usedCapacity: wh.usedCapacity,
          status: wh.status,
        }
      })
    }
    for (const mov of inventoryMovements) {
      await prisma.stockMovement.create({
        data: {
          id: \`\${company.slug}-\${mov.id}\`,
          companyId: company.id,
          warehouseId: \`\${company.slug}-\${mov.warehouseId}\`,
          itemId: \`\${company.slug}-\${mov.itemId}\`,
          type: mov.type,
          quantity: mov.quantity,
          reference: mov.reference,
          date: new Date(mov.date),
          reason: mov.reason,
          status: mov.status,
        }
      })
    }

    // CRM
    // First create customers to link them
    const allCustomers = new Map()
    for (const lead of crmInitialLeads) {
      if (!allCustomers.has(lead.contact.id)) {
        allCustomers.set(lead.contact.id, lead.contact)
      }
    }
    for (const deal of crmInitialDeals) {
      if (!allCustomers.has(deal.contact.id)) {
        allCustomers.set(deal.contact.id, deal.contact)
      }
    }
    
    for (const contact of allCustomers.values()) {
      await prisma.customer.create({
        data: {
          id: \`\${company.slug}-\${contact.id}\`,
          companyId: company.id,
          name: contact.name,
          email: contact.email,
        }
      })
    }

    for (const lead of crmInitialLeads) {
      await prisma.lead.create({
        data: {
          id: \`\${company.slug}-\${lead.id}\`,
          companyId: company.id,
          name: lead.contact.name,
          company: lead.contact.company,
          email: lead.contact.email,
          phone: lead.contact.phone,
          source: lead.source,
          status: lead.status,
          createdAt: new Date(lead.createdAt),
        }
      })
    }

    for (const deal of crmInitialDeals) {
      await prisma.deal.create({
        data: {
          id: \`\${company.slug}-\${deal.id}\`,
          companyId: company.id,
          contactId: \`\${company.slug}-\${deal.contact.id}\`,
          title: deal.title,
          value: deal.value,
          stageId: deal.stage,
          priority: deal.priority,
          expectedCloseDate: new Date(deal.expectedCloseDate),
          createdAt: new Date(),
        }
      })
    }
`

content = content.replace('console.log(`Created company: ${company.name}`)', companySeed + '\n    console.log(`Created company: ${company.name}`)')

fs.writeFileSync(seedPath, content)
console.log('Seed updated')
