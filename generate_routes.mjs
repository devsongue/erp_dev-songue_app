import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const routes = [
  '/dashboard',
  '/accounting',
  '/accounting/chart-of-accounts',
  '/accounting/ledger',
  '/accounting/trial-balance',
  '/accounting/profit-loss',
  '/finance',
  '/finance/bank-accounts',
  '/finance/customer-payments',
  '/finance/vendor-payments',
  '/finance/revenues',
  '/finance/expenses',
  '/sales',
  '/sales/quotations',
  '/sales/orders',
  '/sales/invoices',
  '/sales/returns',
  '/purchases',
  '/purchases/vendors',
  '/purchases/invoices',
  '/purchases/returns',
  '/pos',
  '/pos/register',
  '/pos/sales-report',
  '/inventory',
  '/inventory/products',
  '/inventory/categories',
  '/inventory/warehouses',
  '/inventory/transfers',
  '/inventory/barcodes',
  '/hr',
  '/hr/employees',
  '/hr/attendances',
  '/hr/payrolls',
  '/hr/leaves',
  '/hr/shifts',
  '/crm',
  '/crm/leads',
  '/crm/deals',
  '/crm/pipelines',
  '/projects',
  '/helpdesk',
  '/reports',
  '/settings',
  '/users',
  '/roles'
]

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const routesDir = path.join(__dirname, 'src', 'routes')

const parents = new Set()
const childrenMap = new Map()

for (const route of routes) {
  const parts = route.split('/').filter(Boolean)
  if (parts.length === 1) {
    parents.add(parts[0])
    if (!childrenMap.has(parts[0])) childrenMap.set(parts[0], [])
  } else if (parts.length === 2) {
    parents.add(parts[0])
    if (!childrenMap.has(parts[0])) childrenMap.set(parts[0], [])
    childrenMap.get(parts[0]).push(parts[1])
  }
}

for (const parent of parents) {
  const children = childrenMap.get(parent)
  const hasChildren = children.length > 0
  
  const parentFile = path.join(routesDir, `${parent}.tsx`)
  const indexFile = path.join(routesDir, `${parent}.index.tsx`)
  
  if (hasChildren) {
    // If parent already exists as a page, rename it to index.tsx
    if (fs.existsSync(parentFile) && !fs.existsSync(indexFile)) {
      const content = fs.readFileSync(parentFile, 'utf8')
      if (!content.includes('<Outlet />')) {
        fs.renameSync(parentFile, indexFile)
        let newContent = content.replace(`createFileRoute('/${parent}')`, `createFileRoute('/${parent}/')`)
        fs.writeFileSync(indexFile, newContent)
        
        const layoutContent = `import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/${parent}')({
  component: () => <Outlet />,
})
`
        fs.writeFileSync(parentFile, layoutContent)
      }
    } else if (!fs.existsSync(parentFile)) {
      // Create new layout
      const layoutContent = `import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/${parent}')({
  component: () => <Outlet />,
})
`
      fs.writeFileSync(parentFile, layoutContent)
      
      // Create index file
      const indexContent = `import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/${parent}/')({
  component: () => <div className="p-4"><h1 className="text-2xl font-bold capitalize">${parent}</h1></div>,
})
`
      fs.writeFileSync(indexFile, indexContent)
    }
  } else {
    // No children, just make sure parent.tsx exists
    if (!fs.existsSync(parentFile)) {
      const content = `import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/${parent}')({
  component: () => <div className="p-4"><h1 className="text-2xl font-bold capitalize">${parent}</h1></div>,
})
`
      fs.writeFileSync(parentFile, content)
    }
  }
  
  // Create children
  for (const child of children) {
    const childFile = path.join(routesDir, `${parent}.${child}.tsx`)
    if (!fs.existsSync(childFile)) {
      const title = child.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
      const content = `import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/${parent}/${child}')({
  component: () => <div className="p-4"><h1 className="text-2xl font-bold">${title}</h1></div>,
})
`
      fs.writeFileSync(childFile, content)
    }
  }
}

console.log("Routes generated successfully!")
