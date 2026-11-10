import { NextResponse } from "next/server"
import { NO_STORE, requireContacts } from "@/lib/contacts/gate"
import { syncPlatformsSoon } from "@/lib/contacts/checkout-contact"
import { personByKey, readProfile } from "@/lib/contacts/profile-server"
import { CONTACTS_MISSING, ContactsMissing, cleanTags, deleteContactRows, ensureRow, unsubscribe, updateRow } from "@/lib/contacts/write-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * /api/contacts/<contactId> (round 51): one person of the store.
 *
 *   GET                                   their profile (lib/contacts/profile-server readProfile)
 *   PATCH  { name?, notes?, tags? }       what the creator keeps about them
 *   POST   { action: "unsubscribe" }      off the marketing list (Marketing), as Emails does it
 *   DELETE                                the creator's own row for them only
 *
 * A key of another store, or of nobody, is 404 and nothing of it is read.
 */
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })
const missing = (e: unknown) => (e instanceof ContactsMissing ? json({ error: e.message, code: CONTACTS_MISSING }, 503) : null)

type Ctx = { params: Promise<{ key: string }> }

export async function GET(_request: Request, { params }: Ctx) {
  const gate = await requireContacts({ read: true })
  if (gate instanceof NextResponse) return gate
  const { key } = await params
  const g = await personByKey(gate.db, gate, key)
  if (!g) return json({ error: "Not found", code: "not_found" }, 404)
  return json(await readProfile(gate.db, gate, g))
}

export async function PATCH(request: Request, { params }: Ctx) {
  const gate = await requireContacts()
  if (gate instanceof NextResponse) return gate
  const { key } = await params
  const body = (await request.json().catch(() => null)) as { name?: unknown; notes?: unknown; tags?: unknown } | null
  if (!body) return json({ error: "Nothing to save.", code: "empty" }, 400)
  const g = await personByKey(gate.db, gate, key)
  if (!g) return json({ error: "Not found", code: "not_found" }, 404)
  const who = g.rows.find((r) => r.kind === "contact")
  const identity = who ? { contactId: who.id } : g.person.userId ? { userId: g.person.userId } : g.person.email ? { email: g.person.email } : null
  if (!identity) return json({ error: "This person left no address or account, so nothing can be kept about them.", code: "no_identity" }, 400)
  try {
    const row = await ensureRow(gate.db, gate, identity, { by: gate.userId })
    await updateRow(gate.db, gate, row.id, {
      ...(body.name !== undefined ? { name: typeof body.name === "string" ? body.name : null } : {}),
      ...(body.notes !== undefined ? { notes: typeof body.notes === "string" ? body.notes : null } : {}),
      ...(body.tags !== undefined ? { tags: cleanTags(body.tags) } : {}),
    })
    return json({ ok: true, contactId: `c_${row.id}` })
  } catch (error) {
    return missing(error) ?? json({ error: "Not saved. Try again.", code: "save_failed" }, 500)
  }
}

export async function POST(request: Request, { params }: Ctx) {
  const body = (await request.json().catch(() => null)) as { action?: unknown } | null
  if (body?.action !== "unsubscribe") return json({ error: "Not found", code: "unknown_action" }, 404)
  const gate = await requireContacts({ marketing: true })
  if (gate instanceof NextResponse) return gate
  const { key } = await params
  const g = await personByKey(gate.db, gate, key)
  if (!g) return json({ error: "Not found", code: "not_found" }, 404)
  const subs = g.rows.filter((r) => r.kind === "subscriber")
  let done = 0
  for (const s of subs) if (await unsubscribe(gate.db, gate, s.id)) done++
  /* Unsubscribed on the store's connected email platforms too, within the minute. */
  if (done) await syncPlatformsSoon(gate.db, gate.creatorId).catch(() => undefined)
  return json({ ok: true, unsubscribed: done })
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const gate = await requireContacts()
  if (gate instanceof NextResponse) return gate
  const { key } = await params
  const g = await personByKey(gate.db, gate, key)
  if (!g) return json({ error: "Not found", code: "not_found" }, 404)
  const rows = g.rows.filter((r) => r.kind === "contact").map((r) => r.id)
  if (!rows.length) return json({ ok: true, deleted: 0, kept: true })
  try {
    const deleted = await deleteContactRows(gate.db, gate, rows)
    /* Still somebody when other rows are theirs (an order, a form answer, the list): those stay where they are. */
    return json({ ok: true, deleted, kept: g.rows.some((r) => r.kind !== "contact") })
  } catch (error) {
    return missing(error) ?? json({ error: "Not deleted. Try again.", code: "delete_failed" }, 500)
  }
}
