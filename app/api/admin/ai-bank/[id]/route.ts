import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import { requireAdmin } from "@/lib/admin/gate"
import { createAdminClient } from "@/lib/supabase/admin"
import { bankRowView } from "@/lib/storelib-ai/bank/admin"
import { removeBankEntry, updateBankEntry } from "@/lib/storelib-ai/bank/store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const db = () => createAdminClient() as unknown as Parameters<typeof updateBankEntry>[0]

/**
 * PATCH  /api/admin/ai-bank/:id   { enabled?, industries?: string[], keywords?: string[] }
 * DELETE /api/admin/ai-bank/:id   out of the bank (the website itself is not touched)
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin()
  if (denied) return denied
  const { id } = await ctx.params
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found." }, { status: 404 })
  const body = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>
  const r = await updateBankEntry(db(), id, body)
  if (r.ok === false) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json({ entry: bankRowView(r.row) })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin()
  if (denied) return denied
  const { id } = await ctx.params
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found." }, { status: 404 })
  const r = await removeBankEntry(db(), id)
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "It could not be removed just now." }, { status: 500 })
}
