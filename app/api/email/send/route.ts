/**
 * ===========================================================================
 *  SEND A CAMPAIGN
 * ===========================================================================
 * POST { campaign_id, idempotency_key?, expected_updated_at?, dry_run?, retry_failed? }
 *
 *   dry_run        checks everything and answers with how many it would go
 *                  to after unsubscribes and bounces, and who it is from.
 *                  The compose page's confirm step. Sends nothing.
 *   (default)      moves the campaign to queued with one conditional update
 *                  and answers 202 straight away; the sending happens after
 *                  the response, in batches, inside this function's time.
 *                  A second request for the same campaign is answered with
 *                  where the first one is, and sends nothing.
 *   retry_failed   sends again to the addresses that failed, only those.
 *
 * What is left when the time runs out, the hourly cron finishes
 * (lib/email-campaigns/queue.ts explains the whole pipeline).
 */
import { NextResponse, after } from "next/server"
import { isSmtpConfigured } from "@/lib/mail"
import { rateLimit } from "@/lib/api/rate-limit"
import { processCampaign, retryFailed, startSend } from "@/lib/email-campaigns/queue"
import { STATUS_LABEL } from "@/lib/email-campaigns/state"
import { isResponse, noStore, readJson, requireCreator, UUID } from "@/lib/email-campaigns/route-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

/** Stop starting batches this long before the platform stops the function. */
const MARGIN_MS = 25_000

export async function POST(request: Request) {
  const began = Date.now()
  const ctx = await requireCreator()
  if (isResponse(ctx)) return ctx

  const body = await readJson(request)
  const campaignId = typeof body.campaign_id === "string" ? body.campaign_id : ""
  if (!UUID.test(campaignId)) return NextResponse.json({ error: "Save the email before sending it." }, { status: 400 })
  const key = typeof body.idempotency_key === "string" && body.idempotency_key.length <= 100 ? body.idempotency_key : null
  const expected = typeof body.expected_updated_at === "string" ? body.expected_updated_at : null
  const dryRun = body.dry_run === true

  if (!isSmtpConfigured()) {
    return NextResponse.json({ error: "Email sending is not set up on Storelib right now. Nothing was sent. Try again later." }, { status: 503 })
  }

  if (!dryRun) {
    const limited = await rateLimit({
      bucket: "campaign-send",
      subjects: [`creator:${ctx.creatorId}`],
      windows: [
        { limit: 6, seconds: 600 },
        { limit: 30, seconds: 86_400 },
      ],
      message: "That is a lot of sends in a short time. Wait a few minutes and try again.",
    })
    if (limited) return limited
  }

  const work = (leaseFrom: string | null | undefined) =>
    after(async () => {
      try {
        const r = await processCampaign(ctx.admin, campaignId, { deadline: began + maxDuration * 1000 - MARGIN_MS, leaseFrom })
        console.log(`[email/send] ${campaignId}: ${r.outcome}, ${r.sent} sent, ${r.failed} failed, ${r.skipped} skipped`)
      } catch (err) {
        console.error(`[email/send] ${campaignId} worker stopped:`, err instanceof Error ? err.message : "unknown error")
      }
    })

  try {
    if (body.retry_failed === true) {
      const r = await retryFailed(ctx.admin, ctx.creatorId, campaignId)
      if (!r.ok) return NextResponse.json({ error: "There is nothing to send again for this email." }, { status: 409 })
      if (r.retried > 0) work(r.leaseFrom)
      return NextResponse.json({ status: "sending", retried: r.retried }, { status: 202, headers: noStore })
    }

    const r = await startSend(ctx.admin, {
      creatorId: ctx.creatorId,
      campaignId,
      from: ["draft", "scheduled"],
      idempotencyKey: key,
      expectedUpdatedAt: expected,
      dryRun,
    })

    switch (r.kind) {
      case "not_found":
        return NextResponse.json({ error: "This email was not found. It may have been deleted." }, { status: 404 })
      case "conflict":
        return NextResponse.json({ error: "This email was changed in another tab. Reload it to see the latest version before sending." }, { status: 409 })
      case "invalid":
        return NextResponse.json({ error: r.errors[0]?.message ?? "This email cannot be sent yet.", errors: r.errors }, { status: r.status ?? 422 })
      case "already":
        return NextResponse.json({ status: r.status, already: true, message: `This email is already ${STATUS_LABEL[r.status].toLowerCase()}.` }, { status: 200, headers: noStore })
      case "dry_run":
        return NextResponse.json({ recipients: r.recipients, excluded: r.excluded, warnings: r.warnings, sender: r.sender }, { headers: noStore })
      case "started":
        work(r.leaseFrom)
        return NextResponse.json({ status: r.status, recipients: r.recipients, excluded: r.excluded }, { status: 202, headers: noStore })
    }
  } catch (err) {
    console.error(`[email/send] ${campaignId} could not start:`, err instanceof Error ? err.message : "unknown error")
    return NextResponse.json({ error: "Something went wrong on our side and nothing was sent. Try again in a moment." }, { status: 500 })
  }
}
