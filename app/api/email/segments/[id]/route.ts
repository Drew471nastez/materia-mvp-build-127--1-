/**
 * One saved segment, the creator's own.
 *
 *   PATCH  { name?, rules? }   change it
 *   DELETE                     delete it (an email already sent to it is kept)
 */
import { NextResponse } from "next/server"
import { isResponse, noStore, readJson, requireCreator } from "@/lib/email-campaigns/route-auth"
import { readRules } from "@/lib/email-campaigns/segments"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCreator()
  if (isResponse(ctx)) return ctx
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found." }, { status: 404, headers: noStore })
  const body = await readJson(request)
  const patch: Record<string, unknown> = {}
  if (typeof body.name === "string") {
    const name = body.name.replace(/\s+/g, " ").trim().slice(0, 80)
    if (!name) return NextResponse.json({ error: "Give the segment a name." }, { status: 400, headers: noStore })
    patch.name = name
  }
  if (body.rules !== undefined) patch.filters = { rules: readRules(body.rules) }
  const { data, error } = await ctx.admin.from("email_segments").update(patch).eq("id", id).eq("creator_id", ctx.creatorId).select("id").maybeSingle()
  if (error) return NextResponse.json({ error: "That did not save. Try again." }, { status: 500, headers: noStore })
  if (!data) return NextResponse.json({ error: "Not found." }, { status: 404, headers: noStore })
  return NextResponse.json({ ok: true }, { headers: noStore })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCreator()
  if (isResponse(ctx)) return ctx
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found." }, { status: 404, headers: noStore })
  const { error } = await ctx.admin.from("email_segments").delete().eq("id", id).eq("creator_id", ctx.creatorId)
  if (error) return NextResponse.json({ error: "That could not be deleted. Try again." }, { status: 500, headers: noStore })
  return NextResponse.json({ ok: true }, { headers: noStore })
}
