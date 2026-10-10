/**
 * New email › Send to › New segment: a name and rules (lib/email-campaigns/
 * segments.ts), saved in email_segments for this creator only.
 *
 *   POST { name, rules }   save one; answers with how many it holds today
 */
import { NextResponse } from "next/server"
import { isResponse, noStore, readJson, requireCreator } from "@/lib/email-campaigns/route-auth"
import { readRules } from "@/lib/email-campaigns/segments"
import { segmentMemberIds } from "@/lib/email-campaigns/segments-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_SEGMENTS = 50

export async function POST(request: Request) {
  const ctx = await requireCreator()
  if (isResponse(ctx)) return ctx
  const body = await readJson(request)
  const name = typeof body.name === "string" ? body.name.replace(/\s+/g, " ").trim().slice(0, 80) : ""
  if (!name) return NextResponse.json({ error: "Give the segment a name." }, { status: 400, headers: noStore })
  const rules = readRules(body.rules)
  const { count } = await ctx.admin.from("email_segments").select("id", { count: "exact", head: true }).eq("creator_id", ctx.creatorId)
  if ((count ?? 0) >= MAX_SEGMENTS) return NextResponse.json({ error: `That's ${MAX_SEGMENTS} segments. Delete one you no longer use first.` }, { status: 400, headers: noStore })
  const { data, error } = await ctx.admin.from("email_segments").insert({ creator_id: ctx.creatorId, name, filters: { rules } }).select("id, name").single()
  if (error || !data) return NextResponse.json({ error: "The segment could not be saved. Try again." }, { status: 500, headers: noStore })
  let size: number | null = null
  try {
    size = (await segmentMemberIds(ctx.admin, ctx.creatorId, rules)).length
  } catch {
    size = null
  }
  return NextResponse.json({ segment: { id: data.id, name: data.name, count: size, rules } }, { headers: noStore })
}
