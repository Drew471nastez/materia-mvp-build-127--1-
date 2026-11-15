import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import { requireAdmin } from "@/lib/admin/gate"
import { createAdminClient } from "@/lib/supabase/admin"
import { bankRowView } from "@/lib/storelib-ai/bank/admin"
import { accountSites, listBank, snapshotIntoBank } from "@/lib/storelib-ai/bank/store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
/* A snapshot reads one website's pages, files and settings: seconds, not minutes. */
export const maxDuration = 60

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const db = () => createAdminClient() as unknown as Parameters<typeof listBank>[0]

/**
 * GET  /api/admin/ai-bank?email=<account>   the bank, and that account's library websites
 * POST /api/admin/ai-bank  { installId }    put a library website in the bank, or take a fresh snapshot of it
 *
 * The AI source bank (lib/storelib-ai/bank). Admin cookie only.
 */
export async function GET(req: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied
  const email = req.nextUrl.searchParams.get("email") ?? ""
  const d = db()
  const [bank, library] = await Promise.all([listBank(d), email ? accountSites(d, email) : Promise.resolve(null)])
  return NextResponse.json({ bank: bank.rows.map(bankRowView), missing: bank.missing, ...(library ? { library } : {}) }, { headers: { "Cache-Control": "no-store" } })
}

export async function POST(req: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied
  const body = (await req.json().catch(() => null)) as { installId?: unknown } | null
  const installId = typeof body?.installId === "string" ? body.installId : ""
  if (!UUID.test(installId)) return NextResponse.json({ error: "Pick a website." }, { status: 400 })
  const r = await snapshotIntoBank(db(), installId)
  if (r.ok === false) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json({ entry: bankRowView(r.row) })
}
