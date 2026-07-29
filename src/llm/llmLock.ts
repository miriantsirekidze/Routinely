/**
 * Serializes access to the on-device LLM. The ~880MB model must never be loaded by two
 * features at once, so every consumer acquires this lock before loading and releases it
 * after. Interactive callers (a tracker's relapse message) take priority; the background
 * milestone worker only runs when the lock is free and yields via `onLlmFree`.
 */
let held = false;
const waiters = new Set<() => void>();

/** Try to take the lock. Returns true if acquired, false if already held. */
export function acquireLlm(): boolean {
  if (held) return false;
  held = true;
  return true;
}

/** Release the lock and notify anyone waiting. */
export function releaseLlm(): void {
  held = false;
  const cbs = Array.from(waiters);
  waiters.clear();
  cbs.forEach((cb) => cb());
}

/** Subscribe to be notified when the lock becomes free. Returns an unsubscribe fn. */
export function onLlmFree(cb: () => void): () => void {
  waiters.add(cb);
  return () => waiters.delete(cb);
}
