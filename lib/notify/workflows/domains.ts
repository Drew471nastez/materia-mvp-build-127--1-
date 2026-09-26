/**
 * ===========================================================================
 *  CONNECTED DOMAINS
 * ===========================================================================
 * Raised by the trigger on custom_domains:
 *
 *   domain.connected           DOMAIN_CONNECTED
 *   domain.connection_failed   DOMAIN_CONNECTION_FAILED, fifteen minutes
 *                              later and only if the domain still reads
 *                              failed then. DNS and certificates settle on
 *                              their own often enough that an immediate
 *                              "failed" would mostly be wrong.
 */
import { job, plan, str, type Workflow } from "./common"

const SETTLE_MS = 15 * 60_000

export const domains: Workflow = (event, ctx) => {
  const domainId = event.entityType === "domain" ? event.entityId : str(event.payload.domainId)
  const on = { entityType: "domain" as const, entityId: domainId ?? null, data: { domain: str(event.payload.domain) } }
  switch (event.name) {
    case "domain.connected":
      return plan([job("DOMAIN_CONNECTED", event, ctx, on)])
    case "domain.connection_failed":
      return plan([job("DOMAIN_CONNECTION_FAILED", event, ctx, { ...on, delayMs: SETTLE_MS })])
    default:
      return null
  }
}
