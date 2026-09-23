// Применяет db/schema.sql к Neon. DATABASE_URL берётся из env или из .env.local / .env.
// Neon HTTP не принимает несколько statement'ов в одном запросе — выполняем по одному.
import { readFileSync, existsSync } from 'node:fs'
import { neon } from '@neondatabase/serverless'

function loadEnvFile(file) {
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const i = line.indexOf('=')
    if (i < 1 || line.trim().startsWith('#')) continue
    const k = line.slice(0, i).trim()
    const v = line.slice(i + 1).trim().replace(/^"(.*)"$/, '$1')
    if (!(k in process.env)) process.env[k] = v
  }
}
loadEnvFile('.env.local')
loadEnvFile('.env')

const url = process.env.DATABASE_URL
if (!url) { console.error('DATABASE_URL не задан (vercel env pull или .env)'); process.exit(1) }

const sql = neon(url)
const statements = readFileSync('db/schema.sql', 'utf8')
  .split(/;\s*\n/)
  .map(s => s.replace(/^\s*--.*$/gm, '').trim())
  .filter(Boolean)
let n = 0
for (const st of statements) { await sql.query(st); n++ }
console.log(`OK: ${n} statements applied`)
