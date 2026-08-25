/**
 * src/cache.ts
 *
 * Minimal in-memory response cache with lazy expiration.
 *
 * Gate 2 deliverable. Used by POST /api/generate to skip repeat LLM calls
 * for identical request bodies (same product/audience/count).
 *
 * Design:
 *   - Lazy expiration: we check `expiresAt` on `get()` and drop stale entries
 *     when accessed. We do NOT run a background sweeper timer — keeps the
 *     process simple and avoids leaking intervals across hot-reloads.
 *   - Single-process Map. Not shared across instances. For Railway deploy
 *     with multiple replicas this means cache misses are per-replica — that's
 *     acceptable for Gate 2's single-replica demo deploy.
 *   - Values are typed as `unknown`; callers must narrow before use.
 */

export class ResponseCache {
  private store = new Map<string, { expiresAt: number; value: unknown }>()

  get(key: string): unknown | null {
    const entry = this.store.get(key)
    if (!entry) {
      return null
    }
    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key)
      return null
    }
    return entry.value
  }

  set(key: string, value: unknown, ttlSeconds: number): void {
    const expiresAt = Date.now() + Math.max(0, ttlSeconds) * 1000
    this.store.set(key, { expiresAt, value })
  }

  /**
   * Drop all entries. Exposed for tests; not used by the runtime path.
   */
  clear(): void {
    this.store.clear()
  }

  /**
   * Number of live (non-expired) entries. Exposed for /health and tests.
   * Walks the map to drop stale entries as a side effect.
   */
  size(): number {
    const now = Date.now()
    let n = 0
    for (const [key, entry] of this.store.entries()) {
      if (now >= entry.expiresAt) {
        this.store.delete(key)
      } else {
        n++
      }
    }
    return n
  }
}
