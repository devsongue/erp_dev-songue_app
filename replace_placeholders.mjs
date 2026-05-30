import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const routesDir = path.join(__dirname, 'src', 'routes')

const files = fs.readdirSync(routesDir)

let updated = 0

for (const file of files) {
  if (!file.endsWith('.tsx')) continue
  
  const filePath = path.join(routesDir, file)
  let content = fs.readFileSync(filePath, 'utf8')
  
  const match = content.match(/<div className="p-4"><h1 className="text-2xl font-bold[^>]*>([^<]+)<\/h1><\/div>/)
  
  if (match) {
    const title = match[1]
    
    if (!content.includes('GenericScreen')) {
      content = content.replace(
        /import \{ createFileRoute \} from '@tanstack\/react-router'/,
        `import { createFileRoute } from '@tanstack/react-router'\nimport { GenericScreen } from '~/components/GenericScreen'`
      )
    }
    
    const replacement = `<GenericScreen title="${title}" description="Tableau de bord de gestion pour ${title.toLowerCase()}" />`
    content = content.replace(/<div className="p-4">.*?<\/div>/, replacement)
    
    fs.writeFileSync(filePath, content)
    updated++
  }
}

console.log(`Updated ${updated} files with GenericScreen!`)
