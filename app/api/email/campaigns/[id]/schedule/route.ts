/**
 * SCHEDULE, OR UNSCHEDULE.
 *
 * POST { scheduled_at: ISO string | null, expected_updated_at }
 *
 * Everything a send checks is checked now (content, audience, the plan's
 * monthly limit), so a problem is shown while the creator is still looking
 * at the email rather than found by the cron at three in the morning. The
 * cron runs on the hour, which is why the page offers whole hours.
 */
import { NextResponse } from "next/server"
import { startSend } from "@/lib/email-campaigns/queue"
import { readStatus } from "@/lib/email-campaigns/state"
import { isResponse, noStore, readJson, requireCreator, UUID } from "@/lib/email-campaigns/route-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const YEAR = 365 * 86_400_000

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const ctx = await requireCreator()
  if (isResponse(ctx)) return ctx
  const body = await readJson(request)
  const expected = typeof body.expected_updated_at === "string" ? body.expected_updated_at : null

  if (body.scheduled_at === null) {
    const { data } = await ctx.admin
      .from("email_campaigns")
      .update({ status: "draft", scheduled_at: null, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("creator_id", ctx.creatorId)
      .eq("status", "scheduled")
      .select("id, status, updated_at, scheduled_at")
    if (!data?.length) return NextResponse.json({ error: "This email is not scheduled any more." }, { status: 409 })
    return NextResponse.json({ campaign: data[0] }, { headers: noStore })
  }

  const at = Date.parse(typeof body.scheduled_at === "string" ? body.scheduled_at : "")
  if (!Number.isFinite(at)) return NextResponse.json({ error: "Choose a day and time." }, { status: 400 })
  if (at < Date.now() + 5 * 60_000) return NextResponse.json({ error: "Choose a time at least a few minutes from now." }, { status: 400 })
  if (at > Date.now() + YEAR) return NextResponse.json({ error: "Choose a time within the next year." }, { status: 400 })

  const check = await startSend(ctx.admin, { creatorId: ctx.creatorId, campaignId: id, from: ["draft", "scheduled"], expectedUpdatedAt: expected, dryRun: true })
  if (check.kind === "not_found") return NextResponse.json({ error: "This email was not found." }, { status: 404 })
  if (check.kind === "conflict") return NextResponse.json({ error: "This email was changed in another tab. Reload it first." }, { status: 409 })
  if (check.kind === "already") return NextResponse.json({ error: "This email has already been sent." }, { status: 409 })
  if (check.kind === "invalid") return NextResponse.json({ error: check.errors[0]?.message, errors: check.errors }, { status: check.status ?? 422 })

  let move = ctx.admin
    .from("email_campaigns")
    .update({ status: "scheduled", scheduled_at: new Date(at).toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("creator_id", ctx.creatorId)
    .in("status", ["draft", "scheduled"])
  if (expected) move = move.eq("updated_at", expected)
  const { data, error } = await move.select("id, status, updated_at, scheduled_at")
  if (error) {
    console.error("[campaigns] schedule failed:", error.code)
    return NextResponse.json({ error: "Could not schedule. Try again." }, { status: 500 })
  }
  if (!data?.length) return NextResponse.json({ error: "This email changed while you were scheduling it. Reload and try again." }, { status: 409 })
  return NextResponse.json({ campaign: { ...data[0], status: readStatus(data[0].status) }, recipients: check.kind === "dry_run" ? check.recipients : null }, { headers: noStore })
}
