import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";

/**
 * Tiny in-memory query cache with stale-while-revalidate semantics.
 *
 * Screens read via `useCachedQuery(key, fetcher)`: the cached value paints instantly (no
 * empty flash on revisit), and a refetch runs on focus only when the entry is missing,
 * stale, or was invalidated. Writes call `invalidate("<domain>")` so the next focus refetches
 * fresh data. This keeps the existing "requery on focus" model but makes navigation feel
 * instant and skips redundant N+1 queries between visits.
 */

type Entry = { data: unknown; ts: number };
const cache = new Map<string, Entry>();

/** Drop cached entries whose key equals `prefix` or starts with `prefix:` (namespaced keys). */
export function invalidate(prefix: string): void {
  for (const key of Array.from(cache.keys())) {
    if (key === prefix || key.startsWith(prefix + ":")) cache.delete(key);
  }
}

/** Invalidate everything derived from completed sessions/days (history, Today widgets). */
export function invalidateSessionData(): void {
  invalidate("history");
  invalidate("heatmap");
  invalidate("streak");
  invalidate("suggestions");
}

type Options = { staleTime?: number };

type Result<T> = {
  data: T | undefined;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
};

export function useCachedQuery<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: Options = {}
): Result<T> {
  const { staleTime = 30_000 } = options;

  const initial = cache.get(key);
  const [data, setData] = useState<T | undefined>(initial?.data as T | undefined);
  const [loading, setLoading] = useState(initial === undefined);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(
    async (force: boolean) => {
      const entry = cache.get(key);
      // Fresh enough and not forced → reuse cached value, no fetch.
      if (!force && entry && Date.now() - entry.ts < staleTime) {
        setData(entry.data as T);
        setLoading(false);
        return;
      }
      if (!entry) setLoading(true); // only show a spinner when we have nothing to show
      try {
        const result = await fetcher();
        cache.set(key, { data: result, ts: Date.now() });
        setData(result);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        setLoading(false);
      }
    },
    // `fetcher` intentionally omitted: callers pass an inline closure that changes every
    // render. `key` is the identity that matters; encode any deps (e.g. month) into it.
    [key, staleTime] // eslint-disable-line react-hooks/exhaustive-deps
  );

  useFocusEffect(
    useCallback(() => {
      const entry = cache.get(key);
      if (entry) {
        setData(entry.data as T);
        setLoading(false);
      }
      load(false);
    }, [key, load])
  );

  const refresh = useCallback(() => load(true), [load]);

  return { data, loading, error, refresh };
}
