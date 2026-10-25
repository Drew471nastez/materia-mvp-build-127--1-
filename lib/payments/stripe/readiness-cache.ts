import "server-only"

/**
 * "CONNECT PAYMENTS" CLEARS AS SOON AS STRIPE SAYS SO. The store readiness
 * the checklist, banners and editor read is cached for a minute per store
 * (lib/physical/readiness-server, tag physical-readiness:<creator>), and
 * whether payments are set up is part of it. Nothing cleared that cache when
 * Stripe connected or disconnected, so "Connect payments" stayed up to a
 * minute after the creator had finished. This is called where the account's
 * state is written: account.updated and capability.updated (connect-webhook
 * tellIfNowReady), the return from Stripe's setup (the status route and the
 * overview's sync), and every disconnect (releaseConnectedAccount).
 *
 * Loaded lazily: the readiness module reads lib/payments/service, which
 * reads this folder.
 */
export async function forgetPaymentsReadiness(creatorId: string | null | undefined): Promise<void> {
  if (!creatorId) return
  try {
    const { clearReadiness } = await import("@/lib/physical/readiness-server")
    clearReadiness(creatorId)
  } catch {
    /* Outside a request there is no cache to clear; the minute runs out on its own. */
  }
}
