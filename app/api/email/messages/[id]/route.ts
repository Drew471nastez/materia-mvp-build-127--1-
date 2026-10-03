/**
 * ===========================================================================
 *  ONE CONTACT FORM MESSAGE, MARKED READ OR DELETED BY ITS CREATOR
 * ===========================================================================
 * PATCH  `{ read: boolean }`: opened, or back to new.
 * DELETE the message, gone from Messages. The email the creator got stays in
 *        their inbox, and the sender stays a contact.
 *
 * site_contact_messages is written by the server only (supabase/sql/run-now
 * 30 and 92): creators read their own under row level security and change
 * nothing directly. So the change is made here, with the service key, and
 * the scoping is the WHERE: the message id AND the signed in user's own
 * creator id, never one from the request. Another creator's message id
 * matches no row and answers 404, the same as an id that does not exist.
 */
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Params = { params: Promise<{ id: string }> }

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } })
}

async function ownCreatorId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return null
  const { data } = await supabase.from("creators").select("id").eq("user_id", auth.user.id).maybeSingle()
  return (data as { id?: string } | null)?.id ?? null
}

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params
  if (!UUID.test(id)) return json({ error: "Not found" }, 404)
  const creatorId = await ownCreatorId()
  if (!creatorId) return json({ error: "Sign in again." }, 401)
  let body: { read?: unknown } = {}
  try {
    body = (await req.json()) as typeof body
  } catch {
    return json({ error: "Bad request" }, 400)
  }
  if (typeof body.read !== "boolean") return json({ error: "Bad request" }, 400)

  const { data, error } = await createAdminClient()
    .from("site_contact_messages")
    .update({ read_at: body.read ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("creator_id", creatorId)
    .select("id, read_at")
  if (error) {
    /* Before part 92 there is no read_at: the message reads as read, and saying so is not a failure. */
    if (/read_at|42703|PGRST204/i.test(`${error.code} ${error.message}`)) return json({ ok: true, unavailable: true })
    return json({ error: "That did not save. Try again." }, 500)
  }
  if (!Array.isArray(data) || data.length !== 1) return json({ error: "Not found" }, 404)
  return json({ ok: true, read_at: (data[0] as { read_at: string | null }).read_at })
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params
  if (!UUID.test(id)) return json({ error: "Not found" }, 404)
  const creatorId = await ownCreatorId()
  if (!creatorId) return json({ error: "Sign in again." }, 401)
  const { data, error } = await createAdminClient().from("site_contact_messages").delete().eq("id", id).eq("creator_id", creatorId).select("id")
  if (error) return json({ error: "Not deleted. Try again." }, 500)
  if (!Array.isArray(data) || data.length !== 1) return json({ error: "Not found" }, 404)
  return json({ ok: true })
}
