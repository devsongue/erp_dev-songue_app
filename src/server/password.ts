import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const keyLength = 64

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, keyLength).toString('hex')
  return `scrypt:${salt}:${hash}`
}

export function verifyPassword(password: string, passwordHash: string) {
  const [algorithm, salt, storedHash] = passwordHash.split(':')
  if (algorithm !== 'scrypt' || !salt || !storedHash) return false

  const actual = Buffer.from(scryptSync(password, salt, keyLength).toString('hex'), 'hex')
  const expected = Buffer.from(storedHash, 'hex')

  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
