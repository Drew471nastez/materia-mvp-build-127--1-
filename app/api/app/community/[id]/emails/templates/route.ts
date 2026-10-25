import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import { manageLimit } from "@/lib/communities/server/creator"
import { isEditableEmail, saveEmailWords, wordsInput } from "@/lib/communities/server/email-templates"
import { noStore, readJson } from "@/lib/email-campaigns/route-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ id: string }> }

/**
 * A COMMUNITY'S OWN WORDS IN ONE OF ITS EMAILS (lib/communities/server/email-templates.ts).
 *
 * PUT /api/app/community/<id>/emails/templates  { kind, subject, heading, intro, button }
 *     -> { ok: true, words }. Settings permission. All four empty puts Storelib's words back.
 *     A value the kind cannot fill in ({{evnt_title}}) is refused with the ones it can.
 */
export async function PUT(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "manage_settings")
  if (gate instanceof NextResponse) return gate
  const limited = await manageLimit(gate.ctx.userId)
  if (limited) return limited
  const body = await readJson(request)
  if (!isEditableEmail(body.kind)) return NextResponse.json({ error: "Pick one of the emails." }, { status: 400, headers: noStore })
  const words = wordsInput(body, body.kind)
  if ("error" in words) return NextResponse.json(words, { status: 400, headers: noStore })
  const saved = await saveEmailWords(gate.ctx.admin, gate.community.id, body.kind, words, gate.ctx.userId)
  if ("error" in saved) return NextResponse.json({ error: saved.error }, { status: saved.status, headers: noStore })
  return NextResponse.json({ ok: true, words }, { headers: noStore })
}
