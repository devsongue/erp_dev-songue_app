import fs from 'fs'

const path = './src/routes/$companySlug.dashboard.tsx'
let content = fs.readFileSync(path, 'utf8')

// Add getDashboardData import
content = content.replace(
  "import { useCompany, getCompanyFactor, filterForCompany } from '~/context/CompanyContext'",
  "import { getDashboardData } from '~/server/dashboard'\nimport { useCompany, getCompanyFactor, filterForCompany } from '~/context/CompanyContext'"
)

// Add loader
content = content.replace(
  "export const Route = createFileRoute('/$companySlug/dashboard')({\n  component: BusinessDashboard,\n})",
  "export const Route = createFileRoute('/$companySlug/dashboard')({\n  loader: async ({ params }) => getDashboardData({ data: { companySlug: params.companySlug } }),\n  component: BusinessDashboard,\n})"
)

// Replace variable assignments
const oldVars = `  const accounts = buildCompanyAccounts(financeAccounts, activeCompany.name, activeCompanyId, factor)
  const warehouses = buildCompanyWarehouses(filterForCompany(inventoryWarehouses, activeCompanyId), activeCompany.name, activeCompanyId)
  const transactions = filterForCompany(financeTransactions, activeCompanyId)
  const crmDeals = filterForCompany(crmInitialDeals, activeCompanyId)
  const products = filterForCompany(catalogInitialItems, activeCompanyId)
  const movements = filterForCompany(inventoryMovements, activeCompanyId)
  const employees = filterForCompany(hrEmployees, activeCompanyId)`

const newVars = `  const loaderData = Route.useLoaderData()
  const { accounts, warehouses, transactions, crmDeals, products, movements, employees } = loaderData`

content = content.replace(oldVars, newVars)

// Remove factor multiplication
content = content.replace(/ \* factor/g, '')

// Fix mapping deals.stage because now it's stageId from DB
content = content.replace(/deal\.stage !== 'Won' && deal\.stage !== 'Lost'/g, "deal.stageId !== 'Won' && deal.stageId !== 'Lost'")
content = content.replace(/stage: crmStages\.find\(\(item\) => item\.id === deal\.stage\)/g, "stage: crmStages.find((item) => item.id === deal.stageId)")
content = content.replace(/deal\.stage === 'Won'/g, "deal.stageId === 'Won'")
content = content.replace(/\$\{stage\?\.label \?\? deal\.stage\}/g, "${stage?.label ?? deal.stageId}")

// Fix customer relation in deals (now it's customer instead of contact)
content = content.replace(/deal\.contact\.company \?\? deal\.contact\.name/g, "deal.customer?.name")
content = content.replace(/deal\.contact\.id/g, "deal.contactId")

fs.writeFileSync(path, content)
console.log('Dashboard updated')
