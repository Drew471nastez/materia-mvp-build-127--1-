/**
 * The errors already written to the log once, by identity, for this process.
 *
 * Next calls onRequestError (instrumentation.ts) for an uncaught error and
 * then prints the same Error object itself; the console guard
 * (lib/net/console-guard.ts) drops the second line. Kept on globalThis because
 * instrumentation and the routes are separate bundles, each with its own copy
 * of this module. Pure, no imports: safe at the edge.
 */
const KEY = Symbol.for("storelib.loggedErrors")

function store(): WeakSet<object> {
  const g = globalThis as unknown as Record<symbol, WeakSet<object> | undefined>
  return (g[KEY] ??= new WeakSet<object>())
}

/** True when this error was already logged. */
export function wasLogged(error: unknown): boolean {
  return !!error && typeof error === "object" && store().has(error)
}

/** Marks an error as logged. True when it already was. */
export function markLogged(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const s = store()
  if (s.has(error)) return true
  s.add(error)
  return false
}
