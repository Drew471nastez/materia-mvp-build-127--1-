/**
 * ONE CAMPAIGN: read it with where its send is, or save a change to it.
 *
 * GET    the campaign, and when it has been sent or is sending, how many
 *        addresses are in each state and the last reason one failed. The
 *        compose page polls this while a send is running.
 *
 * PATCH  { subject?, preview_text?, body?, audience_type?, segment_id?, expected_updated_at }
 *        Saved only if nobody else saved it since (expected_updated_at is
 *        the version the page last saw) and only while it can still change:
 *        a draft, a scheduled email, or one that failed before anything went
 *        out, which goes back to being a draft. Otherwise 409 with where it
 *        is now, so the page can say so instead of overwriting.
 */
import { NextResponse } from "next/server"
import { audienceRefusal, cleanDraft, DRAFT_COLUMNS, DRAFT_COLUMNS_MODERN } from "@/lib/email-campaigns/drafts"
import { countRecipients, isModernSchema, lastFailure } from "@/lib/email-campaigns/queue"
import { readStatus, wentOut } from "@/lib/email-campaigns/state"
import { isResponse, noStore, readJson, requireCreator, UUID } from "@/lib/email-campaigns/route-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const ctx = await requireCreator()
  if (isResponse(ctx)) return ctx
  const modern = await isModernSchema(ctx.admin)
  const { data: campaign } = await ctx.admin
    .from("email_campaigns")
    .select(modern ? DRAFT_COLUMNS_MODERN : DRAFT_COLUMNS)
    .eq("id", id)
    .eq("creator_id", ctx.creatorId)
    .maybeSingle()
  if (!campaign) return NextResponse.json({ error: "This email was not found. It may have been deleted." }, { status: 404 })

  const status = readStatus(campaign.status)
  let counts = null
  let reason: string | null = modern ? campaign.last_error ?? null : null
  if (status !== "draft" && status !== "scheduled") {
    counts = await countRecipients(ctx.admin, id)
    if (!reason && counts.failed > 0) reason = await lastFailure(ctx.admin, id)
  }
  return NextResponse.json({ campaign: { ...campaign, status, last_error: reason }, counts, upgraded: modern }, { headers: noStore })
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const ctx = await requireCreator()
  if (isResponse(ctx)) return ctx
  const body = await readJson(request)
  const expected = typeof body.expected_updated_at === "string" ? body.expected_updated_at : null
  if (!expected) return NextResponse.json({ error: "Reload the email and try again." }, { status: 400 })

  const cleaned = await cleanDraft(ctx.admin, ctx.creatorId, body)
  if (!cleaned.ok) return NextResponse.json({ error: cleaned.error, field: cleaned.field }, { status: cleaned.status })

  const { data: current } = await ctx.admin.from("email_campaigns").select("status, updated_at").eq("id", id).eq("creator_id", ctx.creatorId).maybeSingle()
  if (!current) return NextResponse.json({ error: "This email was not found. It may have been deleted." }, { status: 404 })
  const status = readStatus(current.status)

  /* A send that failed before anything went out can be fixed and sent again. */
  let reopen = false
  if (status === "failed") {
    const counts = await countRecipients(ctx.admin, id)
    if (wentOut(counts) === 0) reopen = true
  }
  if (status !== "draft" && status !== "scheduled" && !reopen) {
    return NextResponse.json({ error: "This email has been sent, so it can no longer be changed.", status, updated_at: current.updated_at }, { status: 409 })
  }

  const patch: Record<string, unknown> = { ...cleaned.patch, updated_at: new Date().toISOString() }
  if (reopen) patch.status = "draft"
  const { data, error } = await ctx.admin
    .from("email_campaigns")
    .update(patch)
    .eq("id", id)
    .eq("creator_id", ctx.creatorId)
    .eq("updated_at", expected)
    .in("status", reopen ? ["failed"] : ["draft", "scheduled"])
    .select("id, status, updated_at")

  if (error) {
    const refusal = await audienceRefusal(ctx.admin, error, cleaned.patch.audience_type)
    if (refusal) return NextResponse.json({ error: refusal, field: "audience" }, { status: 422 })
    console.error("[campaigns] draft update failed:", error.code)
    return NextResponse.json({ error: "Could not save. Check your connection and try again." }, { status: 500 })
  }
  if (!data || data.length === 0) {
    const { data: now } = await ctx.admin.from("email_campaigns").select("status, updated_at").eq("id", id).maybeSingle()
    const s = readStatus(now?.status)
    const message =
      s === "draft" || s === "scheduled"
        ? "This email was changed in another tab or on another device. Reload to see that version."
        : "This email started sending, so it can no longer be changed."
    return NextResponse.json({ error: message, status: s, updated_at: now?.updated_at ?? null }, { status: 409 })
  }
  return NextResponse.json({ campaign: { ...data[0], status: readStatus(data[0].status) } }, { headers: noStore })
}
