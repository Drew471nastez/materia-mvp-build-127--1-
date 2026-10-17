import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import { isEditableEmail, previewBroadcast, previewEmailWords, wordsInput } from "@/lib/communities/server/email-templates"
import { BROADCAST_LIMITS } from "@/lib/communities/server/broadcasts"
import { noStore, readJson } from "@/lib/email-campaigns/route-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ id: string }> }

/**
 * THE EMAIL AS A MEMBER GETS IT (round AG), drawn by the same templates that send it, with sample facts.
 *
 * POST /api/app/community/<id>/emails/preview
 *      { kind: "broadcast", subject, message }          the owner's own email
 *      { kind: <editable kind>, subject, heading, intro } one of the community's emails with their words
 *      -> { subject, preview, html }. Nothing is saved or sent.
 */
export async function POST(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "manage_settings")
  if (gate instanceof NextResponse) return gate
  const body = await readJson(request)
  const db = gate.ctx.admin
  let creatorName: string | null = null
  if (gate.community.creator_id) {
    const { data } = await db.from("creators").select("display_name, username").eq("id", gate.community.creator_id).maybeSingle()
    creatorName = (data?.display_name as string | null) || (data?.username as string | null) || null
  }
  const community = { name: gate.community.name, slug: gate.community.slug, creatorName }
  if (body.kind === "broadcast") {
    const subject = typeof body.subject === "string" ? body.subject.slice(0, BROADCAST_LIMITS.subject) : ""
    const message = typeof body.message === "string" ? body.message.slice(0, BROADCAST_LIMITS.message) : ""
    const { data: me } = await db.from("profiles").select("display_name, username").eq("id", gate.ctx.userId).maybeSingle()
    const authorName = ((me?.display_name as string | null) || (me?.username as string | null) || "").trim()
    return NextResponse.json(previewBroadcast({ subject, message, authorName }, community), { headers: noStore })
  }
  if (!isEditableEmail(body.kind)) return NextResponse.json({ error: "Pick one of the emails." }, { status: 400, headers: noStore })
  const words = wordsInput(body)
  if ("error" in words) return NextResponse.json(words, { status: 400, headers: noStore })
  return NextResponse.json(previewEmailWords(body.kind, words, community), { headers: noStore })
}
