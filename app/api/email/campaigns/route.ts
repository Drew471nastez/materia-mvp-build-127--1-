import { type NextRequest, NextResponse } from "next/server"
import { audienceRefusal, cleanDraft, DRAFT_COLUMNS } from "@/lib/email-campaigns/drafts"
import { isResponse, noStore, readJson, requireCreator, UUID } from "@/lib/email-campaigns/route-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

/** What a row in the Drafts or Scheduled list shows. The body stays behind: it can be large and the list never draws it. */
const LIST_COLUMNS = "id, subject, preview_text, status, audience_type, audience_count, scheduled_at, sent_at, created_at, updated_at"

/**
 * GET ?status=draft|scheduled: the creator's drafts, newest edit first, or
 * what is scheduled, soonest first. The Sent list, with its numbers, is
 * /api/email/stats.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireCreator()
  if (isResponse(ctx)) return ctx
  const status = request.nextUrl.searchParams.get("status")
  if (status !== "draft" && status !== "scheduled") return NextResponse.json({ error: "Choose drafts or scheduled." }, { status: 400 })
  const { data, error } = await ctx.admin
    .from("email_campaigns")
    .select(LIST_COLUMNS)
    .eq("creator_id", ctx.creatorId)
    .eq("status", status)
    .order(status === "draft" ? "updated_at" : "scheduled_at", { ascending: status === "scheduled", nullsFirst: false })
    .limit(500)
  if (error) {
    console.error("[campaigns] list failed:", error.code)
    return NextResponse.json({ error: "Could not load your emails. Try again." }, { status: 500 })
  }
  return NextResponse.json({ campaigns: data ?? [] }, { headers: noStore })
}

/**
 * POST: start a draft. The page picks the id, so a retried request (a slow
 * network, a double tap) finds the draft it already made instead of making
 * a second one.
 */
export async function POST(request: NextRequest) {
  const ctx = await requireCreator()
  if (isResponse(ctx)) return ctx
  const body = await readJson(request)
  const id = typeof body.id === "string" && UUID.test(body.id) ? body.id : null
  const cleaned = await cleanDraft(ctx.admin, ctx.creatorId, body)
  if (!cleaned.ok) return NextResponse.json({ error: cleaned.error, field: cleaned.field }, { status: cleaned.status })

  const row = {
    ...(id ? { id } : {}),
    creator_id: ctx.creatorId,
    subject: cleaned.patch.subject ?? "",
    preview_text: cleaned.patch.preview_text ?? null,
    body: cleaned.patch.body ?? "",
    audience_type: cleaned.patch.audience_type ?? "all",
    segment_id: cleaned.patch.segment_id ?? null,
    status: "draft",
    ...(cleaned.patch.track_opens !== undefined ? { track_opens: cleaned.patch.track_opens } : {}),
  }
  const { data, error } = await ctx.admin.from("email_campaigns").insert(row).select(DRAFT_COLUMNS).maybeSingle()
  if (error?.code === "23505" && id) {
    const { data: existing } = await ctx.admin.from("email_campaigns").select(DRAFT_COLUMNS).eq("id", id).eq("creator_id", ctx.creatorId).maybeSingle()
    if (existing) return NextResponse.json({ campaign: existing })
    return NextResponse.json({ error: "Could not start this draft. Reload and try again." }, { status: 409 })
  }
  if (error || !data) {
    const refusal = await audienceRefusal(ctx.admin, error, row.audience_type)
    if (refusal) return NextResponse.json({ error: refusal, field: "audience" }, { status: 422 })
    console.error("[campaigns] draft insert failed:", error?.code)
    return NextResponse.json({ error: "Could not save this draft. Check your connection and try again." }, { status: 500 })
  }
  return NextResponse.json({ campaign: data }, { status: 201 })
}
