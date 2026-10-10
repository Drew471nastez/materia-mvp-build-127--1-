import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin/gate"
import { createAdminClient } from "@/lib/supabase/admin"
import { isUuid } from "@/lib/physical/auth"
import { adminGet } from "@/lib/support/tickets-server"
import { suggestReply } from "@/lib/support/suggest-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const NO_STORE = { "Cache-Control": "no-store" }

/** "Suggest a reply": a draft for Storelib to read and change. Nothing is sent from here. */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin()
  if (denied) return denied
  const { id } = await ctx.params
  if (!isUuid(id)) return NextResponse.json({ error: "Not found." }, { status: 404, headers: NO_STORE })
  const got = await adminGet(createAdminClient(), id)
  if (!got.ok) return NextResponse.json({ error: got.error }, { status: got.status, headers: NO_STORE })
  const out = await suggestReply(got.ticket, got.messages, got.ticket.store.name)
  if (!out.ok) return NextResponse.json({ error: out.error }, { status: out.status, headers: NO_STORE })
  return NextResponse.json({ draft: out.draft }, { headers: NO_STORE })
}
