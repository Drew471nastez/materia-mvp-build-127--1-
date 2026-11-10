/**
 * AI_NATIVE_ENGINE: whether a classic Start with AI job plans with the native
 * engine (./engine.ts). On unless the platform sets it to 0, off, false or
 * no, so it can be switched off without a deploy of code. Agent jobs are not
 * affected. Spend is the same one plan call (plus at most two repairs, each
 * started only when it fits before the job's hand-over) and replaces the
 * per-section writer calls for the sections it fills.
 */
export function nativeEngineEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = (env.AI_NATIVE_ENGINE ?? "").trim().toLowerCase()
  return !["0", "off", "false", "no"].includes(v)
}
