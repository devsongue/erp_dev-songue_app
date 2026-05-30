import fs from 'fs'

const path = './src/routes/$companySlug.dashboard.tsx'
let content = fs.readFileSync(path, 'utf8')

// Fix TS errors for reduce parameters
content = content.replace(/\(sum, account\) =>/g, '(sum: number, account: any) =>')
content = content.replace(/\(sum, transaction\) =>/g, '(sum: number, transaction: any) =>')
content = content.replace(/\(sum, deal\) =>/g, '(sum: number, deal: any) =>')
content = content.replace(/\(sum, item\) =>/g, '(sum: number, item: any) =>')
content = content.replace(/\(sum, warehouse\) =>/g, '(sum: number, warehouse: any) =>')
content = content.replace(/\(sum, employee\) =>/g, '(sum: number, employee: any) =>')

// Fix TS errors for map/filter parameters
content = content.replace(/\(transaction\) =>/g, '(transaction: any) =>')
content = content.replace(/\(deal\) =>/g, '(deal: any) =>')
content = content.replace(/\(item\) =>/g, '(item: any) =>')
content = content.replace(/\(warehouse\) =>/g, '(warehouse: any) =>')
content = content.replace(/\(employee\) =>/g, '(employee: any) =>')
content = content.replace(/\(account\) =>/g, '(account: any) =>')
content = content.replace(/\(movement\) =>/g, '(movement: any) =>')

// Fix itemName -> item.name
content = content.replace(/movement\.itemName/g, 'movement.item?.name ?? "Article"')

fs.writeFileSync(path, content)
console.log('Fixed TS in dashboard')
