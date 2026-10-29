import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { rateLimit } from "@/lib/api/rate-limit"
import { receiveMarketingWebhook } from "@/lib/integrations/marketing/sync-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** A platform's delivery is small: a subscriber, or a batch of a few hundred. */
const MAX_BYTES = 512 * 1024

/**
 * Brevo, MailerLite and Kit tell Storelib here that an address left,
 * bounced or complained (lib/integrations/marketing/sync-server.ts
 * receiveMarketingWebhook). Registered by Storelib when the store connects;
 * the address carries the store and a token only it has (its hash is kept),
 * and MailerLite signs each delivery too. Anything that does not match is a
 * 404, so the address says nothing to someone guessing. The body is never
 * logged: it is addresses.
 */
export async function POST(request: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params
  const url = new URL(request.url)
  const creatorId = url.searchParams.get("store") ?? ""
  const token = url.searchParams.get("token") ?? ""
  const limited = await rateLimit({ bucket: "marketing-webhook", subjects: [`store:${creatorId.slice(0, 64)}`], windows: [{ limit: 600, seconds: 60 }] })
  if (limited) return limited
  const length = Number(request.headers.get("content-length") ?? 0)
  if (length > MAX_BYTES) return NextResponse.json({ error: "Too large." }, { status: 413 })
  const raw = await request.text().catch(() => "")
  if (raw.length > MAX_BYTES) return NextResponse.json({ error: "Too large." }, { status: 413 })
  const r = await receiveMarketingWebhook(createAdminClient(), { provider, creatorId, token, raw, signature: request.headers.get("signature"), kind: url.searchParams.get("kind") })
  return NextResponse.json(r.status === 200 ? { ok: true, applied: r.applied } : { error: "Not found." }, { status: r.status })
}
