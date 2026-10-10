import { NextResponse } from "next/server"
import { physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { isMissingTable } from "@/lib/store/settings-server"
import { isIntegrationSlug } from "@/lib/integrations/overrides"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "")

/**
 * Request integration, and Tell me when it's ready on a Coming soon page:
 * the service a store wishes it could connect, kept in integration_requests
 * (SQL part 112, `integration_id` from part 115) for Storelib to read and
 * answer in /admin › Integrations. Five a day a store, so it can't be used
 * to fill the table; asking twice for the same listed integration is one
 * request, not two.
 *
 * Success is said only once the row is in the table. A database that is
 * missing the table says so to Storelib's logs and asks the store to try
 * later; it never says sent.
 */
export async function POST(request: Request) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  const name = clean(body?.name, 80)
  const note = clean(body?.note, 600) || null
  const asked = body?.integrationId
  const integrationId = isIntegrationSlug(asked) ? asked : null
  if (!name) return physicalJson({ error: "Say which service you'd like to connect." }, 400)

  const since = new Date(Date.now() - 86_400_000).toISOString()
  const { count, error: countError } = await c.db.from("integration_requests").select("id", { count: "exact", head: true }).eq("creator_id", c.creatorId).gte("created_at", since)
  if (countError) {
    if (isMissingTable(countError)) {
      console.error("[integrations/request] integration_requests is missing: run SQL part 112")
      return physicalJson({ error: "Requests can't be sent right now. Try again in a little while." }, 503)
    }
    return physicalJson({ error: "It could not be sent. Try again." }, 500)
  }

  if (integrationId) {
    const { data: asked, error: askedError } = await c.db.from("integration_requests").select("id").eq("creator_id", c.creatorId).eq("integration_id", integrationId).limit(1)
    if (!askedError && (asked ?? []).length > 0) return physicalJson({ ok: true, already: true })
  }
  if ((count ?? 0) >= 5) return physicalJson({ error: "That's five requests today. Thank you: we read every one." }, 429)

  const row: Record<string, unknown> = { creator_id: c.creatorId, name, note }
  if (integrationId) row.integration_id = integrationId
  let { error } = await c.db.from("integration_requests").insert(row)
  /* Part 115 not run yet: the request is kept without the integration it came from. */
  if (error && integrationId && isMissingTable(error)) ({ error } = await c.db.from("integration_requests").insert({ creator_id: c.creatorId, name, note }))
  if (error) {
    console.error("[integrations/request] insert failed:", error.code ?? "unknown")
    return physicalJson({ error: "It could not be sent. Try again." }, 500)
  }
  return physicalJson({ ok: true })
}
