import 'dotenv/config'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DATABASE_POOL_MAX ?? '10'),
  connectionTimeoutMillis: 10_000,
  // Par defaut pg ferme une connexion inactive apres 10 s : la navigation
  // suivante rouvrait une connexion (TLS + auth, ~0,5 s vers une base distante).
  idleTimeoutMillis: 5 * 60_000,
  keepAlive: true,
})
const adapter = new PrismaPg(pool)

// Diagnostic des lenteurs : PRISMA_LOG_QUERIES=1 affiche chaque requete SQL et
// sa duree dans la console du serveur.
const logQueries = process.env.PRISMA_LOG_QUERIES === '1'

function createClient() {
  const client = new PrismaClient({ adapter, ...(logQueries ? { log: [{ emit: 'event' as const, level: 'query' as const }] } : {}) })
  if (logQueries) {
    ;(client as any).$on('query', (event: { query: string; duration: number }) => {
      console.log(`[sql ${event.duration}ms] ${event.query.slice(0, 160)}`)
    })
  }
  return client
}

export const prisma = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
