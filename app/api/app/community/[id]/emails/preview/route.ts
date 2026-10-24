import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import { manageLimit } from "@/lib/communities/server/creator"
import { communityEmailFacts, isEditableEmail, previewBroadcast, previewEmailWords, wordsInput } from "@/lib/communities/server/email-templates"
import { readStoreCurrency } from "@/lib/store/selling-currency-read"
import { BROADCAST_LIMITS } from "@/lib/communities/server/broadcasts"
import { noStore, readJson } from "@/lib/email-campaigns/route-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ id: string }> }

/**
 * THE EMAIL AS A MEMBER GETS IT, drawn by the same templates that send it, with sample facts and the community's own
 * name, picture, reply address and domain (lib/communities/server/email-templates.ts communityBrand).
 *
 * POST /api/app/community/<id>/emails/preview
 *      { kind: "broadcast", subject, message }                     the owner's own email
 *      { kind: <editable kind>, subject, heading, intro, button }  one of the community's emails with their words,
 *                                                                  amounts in the store's currency
 *      -> { subject, preview, html, fromName, replyTo }. Nothing is saved or sent.
 */
export async function POST(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "manage_settings")
  if (gate instanceof NextResponse) return gate
  const limited = await manageLimit(gate.ctx.userId)
  if (limited) return limited
  const body = await readJson(request)
  const db = gate.ctx.admin
  const community = await communityEmailFacts(db, gate.community)
  if (body.kind === "broadcast") {
    const subject = typeof body.subject === "string" ? body.subject.slice(0, BROADCAST_LIMITS.subject) : ""
    const message = typeof body.message === "string" ? body.message.slice(0, BROADCAST_LIMITS.message) : ""
    const { data: me } = await db.from("profiles").select("display_name, username").eq("id", gate.ctx.userId).maybeSingle()
    const authorName = ((me?.display_name as string | null) || (me?.username as string | null) || "").trim()
    return NextResponse.json(previewBroadcast({ subject, message, authorName }, community), { headers: noStore })
  }
  if (!isEditableEmail(body.kind)) return NextResponse.json({ error: "Pick one of the emails." }, { status: 400, headers: noStore })
  const words = wordsInput(body, body.kind)
  if ("error" in words) return NextResponse.json(words, { status: 400, headers: noStore })
  /* A ticket's or a plan's amounts in the store's selling currency, as they are charged. */
  const currency = gate.community.creator_id ? (await readStoreCurrency(db, gate.community.creator_id).catch(() => null))?.currency : null
  const e = previewEmailWords(body.kind, words, { ...community, currency: currency || "USD" })
  return NextResponse.json({ subject: e.subject, preview: e.preview, html: e.html, fromName: e.fromName, replyTo: e.replyTo }, { headers: noStore })
}
