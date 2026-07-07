// Limiteur de tentatives en memoire (par processus). Suffisant pour une instance
// self-hosted unique ; a remplacer par un stockage partage (Redis) en multi-instance.
type AttemptBucket = {
  failures: number
  windowStartAt: number
  blockedUntil: number
}

const buckets = new Map<string, AttemptBucket>()

const maxBuckets = 10_000
const windowMs = 15 * 60 * 1000
const maxFailures = 5
const blockDurationMs = 15 * 60 * 1000

function pruneExpired(now: number) {
  if (buckets.size < maxBuckets) return
  for (const [key, bucket] of buckets) {
    if (bucket.blockedUntil <= now && now - bucket.windowStartAt > windowMs) {
      buckets.delete(key)
    }
  }
}

export function isBlocked(key: string): { blocked: boolean; retryAfterSeconds: number } {
  const bucket = buckets.get(key)
  const now = Date.now()
  if (!bucket || bucket.blockedUntil <= now) return { blocked: false, retryAfterSeconds: 0 }
  return { blocked: true, retryAfterSeconds: Math.ceil((bucket.blockedUntil - now) / 1000) }
}

export function recordFailure(key: string) {
  const now = Date.now()
  pruneExpired(now)
  const bucket = buckets.get(key)
  if (!bucket || now - bucket.windowStartAt > windowMs) {
    buckets.set(key, { failures: 1, windowStartAt: now, blockedUntil: 0 })
    return
  }
  bucket.failures += 1
  if (bucket.failures >= maxFailures) {
    bucket.blockedUntil = now + blockDurationMs
  }
}

export function recordSuccess(key: string) {
  buckets.delete(key)
}
