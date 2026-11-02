import { NextResponse } from "next/server"
import { physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { rateLimit } from "@/lib/api/rate-limit"
import { addSendingDomain, loadSendingDomain, removeSendingDomain, setSendingFrom, verifySendingDomain } from "@/lib/emails/sending-domain-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * The store's own sending domain (Emails › Platforms,
 * lib/emails/sending-domain-server.ts). Read by the owner and a team member
 * with Marketing; added, checked and removed by the owner only.
 */
export async function GET() {
  const c = await shopCaller(["store", "marketing"], { read: true })
  if (c instanceof NextResponse) return c
  return physicalJson(await loadSendingDomain(c.db, c.creatorId))
}

/** { action: "add", domain, fromLocal } | { action: "verify" } | { action: "from", fromLocal } | { action: "remove" } */
export async function POST(request: Request) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  /* Each asks Mailgun: a few a minute is plenty. */
  const limited = await rateLimit({ bucket: "sending-domain", subjects: [`creator:${c.creatorId}`], windows: [{ limit: 12, seconds: 60 }, { limit: 200, seconds: 86400 }] })
  if (limited) return limited
  const body = await readBody(request)
  const action = body?.action
  const r =
    action === "add"
      ? await addSendingDomain(c.db, c.creatorId, { domain: body?.domain, fromLocal: body?.fromLocal })
      : action === "verify"
        ? await verifySendingDomain(c.db, c.creatorId)
        : action === "from"
          ? await setSendingFrom(c.db, c.creatorId, body?.fromLocal)
          : action === "remove"
            ? await removeSendingDomain(c.db, c.creatorId)
            : ({ ok: false, error: "Bad request." } as const)
  if (!r.ok) return physicalJson({ error: r.error }, ("status" in r && r.status) || 400)
  return physicalJson(r.view)
}
