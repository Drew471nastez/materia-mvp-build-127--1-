/**
 * STOP A SEND. Addresses already reached stay reached; every one still
 * waiting is skipped, and the worker stops at its next batch. A scheduled
 * email goes back to being a draft.
 */
import { NextResponse } from "next/server"
import { cancelSend } from "@/lib/email-campaigns/queue"
import { isResponse, noStore, requireCreator, UUID } from "@/lib/email-campaigns/route-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const ctx = await requireCreator()
  if (isResponse(ctx)) return ctx
  const r = await cancelSend(ctx.admin, ctx.creatorId, id)
  if (!r.ok) return NextResponse.json({ error: "This email is not sending or scheduled any more.", status: r.status }, { status: 409 })
  return NextResponse.json({ status: r.status }, { headers: noStore })
}
