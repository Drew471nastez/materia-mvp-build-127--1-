import { NextResponse } from "next/server"
import { physicalCaller, physicalJson } from "@/lib/physical/auth"
import { rateLimit } from "@/lib/api/rate-limit"
import { sendTestWebhook } from "@/lib/physical/jobs-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/physical/integrations/custom_webhook/test: a signed ping to the
 * store's own webhook address (lib/physical/jobs-server.ts sendTestWebhook),
 * and what it answered. The owner only, a few a minute.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const c = await physicalCaller()
  if (c instanceof NextResponse) return c
  const { provider } = await params
  if (provider !== "custom_webhook") return physicalJson({ error: "Only your own webhook can be sent a test." }, 404)
  const limited = await rateLimit({ bucket: "webhook-test", subjects: [`creator:${c.creatorId}`], windows: [{ limit: 6, seconds: 60 }, { limit: 60, seconds: 86400 }] })
  if (limited) return limited
  const out = await sendTestWebhook(c.db, c.creatorId)
  return out.ok ? physicalJson({ ok: true, status: out.status }) : physicalJson({ error: out.error }, 400)
}
