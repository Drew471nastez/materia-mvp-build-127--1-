import { NextResponse } from "next/server"
import { physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { isMissingTable } from "@/lib/store/settings-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "")

/**
 * Request integration: the service a store wishes it could connect, kept in
 * integration_requests (SQL part 112) for Storelib to read in /admin. Five a
 * day a store, so it can't be used to fill the table.
 */
export async function POST(request: Request) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  const name = clean(body?.name, 80)
  const note = clean(body?.note, 600) || null
  if (!name) return physicalJson({ error: "Say which service you'd like to connect." }, 400)
  const since = new Date(Date.now() - 86_400_000).toISOString()
  const { count, error: countError } = await c.db.from("integration_requests").select("id", { count: "exact", head: true }).eq("creator_id", c.creatorId).gte("created_at", since)
  if (countError) return physicalJson({ error: isMissingTable(countError) ? "Requests need their database update. Run SQL part 112 in Supabase, then try again." : "It could not be sent. Try again." }, isMissingTable(countError) ? 409 : 500)
  if ((count ?? 0) >= 5) return physicalJson({ error: "That's five requests today. Thank you: we read every one." }, 429)
  const { error } = await c.db.from("integration_requests").insert({ creator_id: c.creatorId, name, note })
  if (error) return physicalJson({ error: "It could not be sent. Try again." }, 500)
  return physicalJson({ ok: true })
}
