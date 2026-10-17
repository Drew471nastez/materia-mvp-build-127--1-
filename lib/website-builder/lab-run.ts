/**
 * ===========================================================================
 *  WHICH LAB TEST RUNS
 * ===========================================================================
 * Website settings › Performance › Lab test, for the route
 * app/api/website-builder/themes/[installId]/performance/lab:
 *
 *   • with a key (PAGESPEED_API_KEY, server only), Google PageSpeed
 *     Insights; when Google answers that its quota is used up, or does not
 *     finish, Storelib's quick check (lib/website-builder/quick-check.ts)
 *     instead, so the creator gets a result and never Google's quota line;
 *   • without a key, the quick check straight away: the keyless quota is
 *     shared by everyone who calls Google without one and is used up most
 *     days;
 *   • Google saying it could not load the page is an answer about the
 *     page, and it is said as it is.
 *
 * The fetch is an argument, so tests/performance-tab-w.test.ts runs every
 * path with a fake.
 */

import { PSI_TIMEOUT_MS, parsePsi, psiRequestUrl, type AnyLabResult, type LabError, type LabResult, type LabStrategy } from "./pagespeed"
import { runQuickCheck, type QuickFetch } from "./quick-check"

export const LAB_MESSAGES = {
  unreachable: "Your website did not answer. Check that the page opens in a browser, then try again.",
  failed: "The test did not finish. Try again in a minute.",
} as const

export type LabFailure = keyof typeof LAB_MESSAGES
/** Why the quick check ran: no key, or what Google answered. Null when Google's test is the result. */
export type LabFallback = LabError | "no-key" | null

export type LabRun = { ok: true; result: AnyLabResult; fellBack: LabFallback } | { ok: false; error: LabFailure }

export async function runLab(input: {
  target: string
  strategy: LabStrategy
  key: string | null
  locale?: string | null
  fetch?: QuickFetch
  /** For the tests: how many times the quick check asks for the page. */
  samples?: number
}): Promise<LabRun> {
  const doFetch: QuickFetch = input.fetch ?? ((u, i) => fetch(u, i))
  let fellBack: LabFallback = input.key ? null : "no-key"
  if (input.key) {
    let status = 0
    let json: unknown = null
    try {
      const res = await doFetch(psiRequestUrl(input.target, input.strategy, { key: input.key, locale: input.locale ?? null }), {
        signal: AbortSignal.timeout(PSI_TIMEOUT_MS),
        cache: "no-store",
      })
      status = res.status
      json = await res.json().catch(() => null)
    } catch (e) {
      console.warn("[lab test] PageSpeed Insights did not answer:", e instanceof Error ? e.message : e)
    }
    const parsed = status ? parsePsi(json, status) : null
    if (parsed && parsed.ok) return { ok: true, result: (parsed as { result: LabResult }).result, fellBack: null }
    fellBack = parsed ? (parsed as { error: LabError }).error : "failed"
    if (fellBack === "unreachable") return { ok: false, error: "unreachable" }
  }
  const quick = await runQuickCheck(input.target, input.strategy, { fetch: doFetch, samples: input.samples })
  if (quick.ok === false) return { ok: false, error: (quick as { error: LabFailure }).error }
  return { ok: true, result: (quick as { result: AnyLabResult }).result, fellBack }
}
