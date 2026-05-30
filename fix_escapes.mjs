import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const routesDir = path.join(__dirname, 'src', 'routes')

const files = fs.readdirSync(routesDir)

for (const file of files) {
  if (!file.endsWith('.tsx')) continue
  
  const filePath = path.join(routesDir, file)
  let content = fs.readFileSync(filePath, 'utf8')
  
  // Look for escaped backticks and escaped dollar signs inside JSX classNames and styles
  if (content.includes('\\`') || content.includes('\\${')) {
    content = content.replace(/\\`/g, '`')
    content = content.replace(/\\\${/g, '${')
    fs.writeFileSync(filePath, content)
    console.log(`Fixed escaped template literals in ${file}`)
  }
}
