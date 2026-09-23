import { NextResponse } from "next/server"

import { purgeExpiredAttachments } from "@/lib/website-builder/agent/attachment-store"
import { requireBearerSecret } from "@/lib/api/require-secret"

/**
 * GET /api/cron/purge-chat-attachments
 *
 * A picture attached to Ask Storelib is kept for thirty days and then it
 * goes. This is the part that makes that sentence true: without a collector,
 * "expires_at" is a column nobody reads and the bucket only grows.
 *
 * Bounded on purpose. Five hundred a run, once a day, is far more than a
 * day's worth of attachments and small enough that a backlog drains over
 * several runs instead of one request timing out and collecting nothing at
 * all. Nothing here is urgent: a picture that lives to thirty-one days has
 * harmed nobody.
 *
 * Protected by CRON_SECRET, like every other job here.
 * Schedule: daily at 03:20 UTC (vercel.json).
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  /* Was compared against `Bearer ${process.env.CRON_SECRET}`, which with the
     variable unset is the literal password "Bearer undefined". */
  const denied = requireBearerSecret(request, "CRON_SECRET")
  if (denied) return denied
  try {
    const { removed, failed } = await purgeExpiredAttachments()
    return NextResponse.json({ removed, failed })
  } catch (error) {
    console.error("[purge-chat-attachments]", error)
    return NextResponse.json({ error: "Purge failed" }, { status: 500 })
  }
}
