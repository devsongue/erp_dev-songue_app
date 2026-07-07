import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt) as (password: string, salt: string, keyLength: number) => Promise<Buffer>

const keyLength = 64

// Version asynchrone de scrypt : la version sync bloque l'event loop du seul
// processus Node pendant ~50-100 ms par tentative, ce qui gele toutes les
// requetes concurrentes en production.
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  const hash = (await scryptAsync(password, salt, keyLength)).toString('hex')
  return `scrypt:${salt}:${hash}`
}

export async function verifyPassword(password: string, passwordHash: string) {
  const [algorithm, salt, storedHash] = passwordHash.split(':')
  if (algorithm !== 'scrypt' || !salt || !storedHash) return false

  const actual = await scryptAsync(password, salt, keyLength)
  const expected = Buffer.from(storedHash, 'hex')

  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
