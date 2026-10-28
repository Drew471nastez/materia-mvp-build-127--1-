import { NextResponse } from "next/server"
import { physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { rateLimit } from "@/lib/api/rate-limit"
import { loadPageIntegrations, savePageIntegration } from "@/lib/onepage/integrations/connect-server"
import { OWNER_KEEPS_KEYS, memberMayStep } from "@/lib/onepage/integrations/team-steps"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Mailchimp, Kit, beehiiv, MailerLite, Brevo, Flodesk, Zapier, Make, Google
 * Sheets and a webhook of the
 * creator's own, connected to their OnePage's signups
 * (lib/onepage/integrations). The owner's own store only. Keys go in and come
 * back as their last four characters; webhook addresses come back as their
 * host. GET reads them; POST is one step of the card
 * (lib/onepage/integrations/connect-server savePageIntegration).
 */
export async function GET() {
  /* Round 41: the store's OnePage integrations, for its owner and a team member with OnePage. Keys come back as their last four characters only. */
  const c = await shopCaller("onepage")
  if (c instanceof NextResponse) return c
  return physicalJson(await loadPageIntegrations(c.db, c.creatorId))
}

export async function POST(request: Request) {
  const c = await shopCaller("onepage")
  if (c instanceof NextResponse) return c
  /* Each step asks the provider: a few a minute is plenty, and keeps their limits (and a stolen key checker) away. */
  const limited = await rateLimit({ bucket: "onepage-integration", subjects: [`creator:${c.creatorId}`], windows: [{ limit: 20, seconds: 60 }, { limit: 300, seconds: 86400 }] })
  if (limited) return limited
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  /* A team member tests a connection and picks its list or tag, with the key the owner saved; adding, replacing or removing a key (or a webhook address) stays the owner's (lib/onepage/integrations/team-steps). */
  if (c.isOwner === false && !memberMayStep(body)) return physicalJson({ error: OWNER_KEEPS_KEYS }, 403)
  const saved = await savePageIntegration(c.db, c.creatorId, body)
  if (saved.ok === false) return physicalJson({ error: saved.error }, saved.status ?? 400)
  return physicalJson({ ...(await loadPageIntegrations(c.db, c.creatorId)), lists: saved.lists ?? null, tags: saved.tags ?? null, signingSecret: saved.signingSecret ?? null })
}
