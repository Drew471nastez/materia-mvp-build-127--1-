import { NextResponse } from "next/server"
import { physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { rateLimit } from "@/lib/api/rate-limit"
import { platformOrigin } from "@/lib/onepage/return-address"
import { connectExternal, disconnectExternal, loadConnections } from "@/lib/bookings/external/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Calendly and Cal.com, connected so their bookings show in Bookings
 * (lib/bookings/external). Read from Settings › Integrations and from the
 * OnePage editor's integrations, by the owner and a team member with either;
 * connecting and disconnecting are the owner's, because the token or key is
 * theirs. A token or key goes in and never comes back; a pasted Cal.com
 * webhook's secret is shown once, on the answer that made it.
 *
 *   GET                                       { connections, ready }
 *   POST { provider: "calendly", token }      the subscription made with the token
 *   POST { provider: "calcom", apiKey }       the webhook made with the key
 *   POST { provider: "calcom", manual: true } { webhookUrl, secret } to paste in Cal.com
 *   POST { provider, disconnect: true }       the webhook removed, then the connection
 */
export async function GET() {
  const c = await shopCaller(["store", "onepage"], { read: true })
  if (c instanceof NextResponse) return c
  return physicalJson(await loadConnections(c.db, c.creatorId, platformOrigin()))
}

export async function POST(request: Request) {
  const c = await shopCaller(["store", "onepage"])
  if (c instanceof NextResponse) return c
  if (c.isOwner === false) return physicalJson({ error: "Only the store's owner can connect or disconnect a booking tool." }, 403)
  /* Each step asks Calendly or Cal.com: a few a minute is plenty, and keeps a stolen token checker away. */
  const limited = await rateLimit({ bucket: "external-bookings-connect", subjects: [`creator:${c.creatorId}`], windows: [{ limit: 10, seconds: 60 }, { limit: 100, seconds: 86400 }] })
  if (limited) return limited
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  const origin = platformOrigin()
  if (body.disconnect === true) {
    const out = await disconnectExternal(c.db, c.creatorId, body.provider)
    if (out.ok === false) return physicalJson({ error: out.error }, out.status)
    return physicalJson({ ...(await loadConnections(c.db, c.creatorId, origin)), remoteRemoved: out.remoteRemoved, manual: out.manual })
  }
  /* The owner's own account: the bookings are read by it (external_bookings_owner_read). */
  const out = await connectExternal(c.db, { creatorId: c.creatorId, ownerId: c.ownerUserId || c.userId }, body, origin)
  if (out.ok === false) return physicalJson({ error: out.error }, out.status)
  return physicalJson({ ...(await loadConnections(c.db, c.creatorId, origin)), webhookUrl: out.webhookUrl ?? null, secret: out.secret ?? null })
}
