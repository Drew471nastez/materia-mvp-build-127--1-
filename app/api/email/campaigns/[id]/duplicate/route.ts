/**
 * DUPLICATE: a new draft with this email's subject, preview text, body,
 * audience and settings, to change and send again. Never sends anything by
 * itself: the copy goes through the composer and its confirm step like any
 * email. (The old "Send again" sent a copy straight away, with no check of
 * who it would reach.)
 *
 * POST { id? }: the page picks the new draft's id, so a double tap or a
 * retried request finds the copy it already made instead of making two.
 */
import { NextResponse } from "next/server"
import { isModernSchema } from "@/lib/email-campaigns/queue"
import { DRAFT_COLUMNS } from "@/lib/email-campaigns/drafts"
import { isResponse, noStore, readJson, requireCreator, UUID } from "@/lib/email-campaigns/route-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const ctx = await requireCreator()
  if (isResponse(ctx)) return ctx
  const body = await readJson(request)
  const newId = typeof body.id === "string" && UUID.test(body.id) ? body.id : null
  const modern = await isModernSchema(ctx.admin)

  const { data: c } = await ctx.admin
    .from("email_campaigns")
    .select(modern ? "subject, preview_text, body, audience_type, segment_id, from_name, track_opens" : "subject, preview_text, body, audience_type, segment_id, from_name")
    .eq("id", id)
    .eq("creator_id", ctx.creatorId)
    .maybeSingle()
  if (!c) return NextResponse.json({ error: "This email was not found. It may have been deleted." }, { status: 404 })

  const row: Record<string, unknown> = {
    ...(newId ? { id: newId } : {}),
    creator_id: ctx.creatorId,
    subject: String(c.subject ?? "").replace(/\s*\(Resend\)\s*$/, ""),
    preview_text: c.preview_text ?? null,
    body: c.body ?? "",
    audience_type: c.audience_type ?? "all",
    segment_id: c.segment_id ?? null,
    from_name: c.from_name ?? null,
    status: "draft",
  }
  if (modern) row.track_opens = c.track_opens !== false

  const { data, error } = await ctx.admin.from("email_campaigns").insert(row).select(DRAFT_COLUMNS).maybeSingle()
  if (error?.code === "23505" && newId) {
    const { data: existing } = await ctx.admin.from("email_campaigns").select(DRAFT_COLUMNS).eq("id", newId).eq("creator_id", ctx.creatorId).maybeSingle()
    if (existing) return NextResponse.json({ campaign: existing }, { headers: noStore })
  }
  if (error || !data) {
    console.error("[campaigns] duplicate failed:", error?.code)
    return NextResponse.json({ error: "Could not make a copy. Try again." }, { status: 500 })
  }
  return NextResponse.json({ campaign: data }, { status: 201, headers: noStore })
}
