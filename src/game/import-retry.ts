const retryableErrors = new WeakSet<object>();
class StaleArtImportError extends Error {}
// The Vite hook emits this as a native import after its preload instrumentation, so a
// download error reaches our classifier before the global preload-error event is raised.
declare function __crownNativeArtImport__(url: string): Promise<unknown>;

/** Preserve the existing reload path when a deploy removed a chunk or serves its HTML fallback. */
export function requiresArtReload(response: Pick<Response, 'status' | 'ok' | 'headers'>) {
  return (
    response.status === 404 ||
    response.status === 410 ||
    (response.ok && /\btext\/html(?:;|$)/i.test(response.headers.get('content-type') ?? ''))
  );
}

/** The optional status check must not hold recovery when the network stops responding. */
export async function probeArtReload(url: string) {
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 1500);
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      cache: 'no-store',
      signal: abort.signal,
    }).catch(() => undefined);
    return !!response && requiresArtReload(response);
  } finally {
    clearTimeout(timeout);
  }
}

/** Vite's global preload handler must let these errors reach the art loader's retry policy. */
export const isRetryableArtImportError = (error: unknown) =>
  typeof error === 'object' && error !== null && retryableErrors.has(error);
export const isStaleArtImportError = (error: unknown): boolean =>
  error instanceof StaleArtImportError;

/** Reuse successful modules and concurrent requests; a failed URL gets a fresh module identity. */
export function createRetryingImporter<T>(load: (url: string) => Promise<T>) {
  const entries = new Map<string, { attempt: number; loading?: Promise<T> }>();
  return (specifier: string, parent: string): Promise<T> => {
    const original = new URL(specifier, parent).href;
    const known = entries.get(original);
    if (known?.loading) return known.loading;
    const attempt = known?.attempt ?? 0;
    const url = new URL(original);
    if (attempt) url.searchParams.set('art-retry', String(attempt));
    const loading = Promise.resolve()
      .then(() => load(url.href))
      .catch((error: unknown) => {
        if (typeof error === 'object' && error !== null && !(error instanceof StaleArtImportError))
          retryableErrors.add(error);
        entries.set(original, { attempt: attempt + 1 });
        throw error;
      });
    entries.set(original, { attempt, loading });
    return loading;
  };
}

// The Vite hook wraps lazy art imports without turning their chunks into startup
// dependencies. A shared symbol lets the generated import call retain the bundler's URL.
const key = Symbol.for('crown-clan.import-retry');
const target = globalThis as typeof globalThis & {
  [key]?: ReturnType<typeof createRetryingImporter<unknown>>;
};
if (typeof window !== 'undefined')
  target[key] ??= createRetryingImporter(async (url) => {
    try {
      return await __crownNativeArtImport__(url);
    } catch (error) {
      // Native import errors omit HTTP status. Check only failures, keeping deleted release
      // chunks on the ordinary reload path while temporary server/network errors can recover.
      if (await probeArtReload(url))
        throw new StaleArtImportError('The art chunk belongs to an unavailable release.', {
          cause: error,
        });
      throw error;
    }
  });
