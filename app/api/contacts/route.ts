import { NextResponse } from "next/server"
import { NO_STORE, requireContacts } from "@/lib/contacts/gate"
import { readPeopleQuery, normalizeEmail } from "@/lib/contacts/identity"
import { listPeople } from "@/lib/contacts/people-server"
import { CONTACTS_MISSING, ContactsMissing, addDetails, cleanTags, importPeople } from "@/lib/contacts/write-server"
import { syncPlatformsSoon } from "@/lib/contacts/checkout-contact"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * /api/contacts (round 51): the store's people.
 *
 *   GET  ?filter=&q=&sort=&page=&<advanced>   one page of people, the counts of the five filters
 *   POST { email, name?, tags?, notes?, phone?, subscribe? }   a person added by hand;
 *        answers { ok, added, updated, ..., contactId } (wave 9: notes and a phone are kept,
 *        and contactId opens the person at once)
 *
 * Customers or Marketing (lib/contacts/gate); adding someone as a subscriber
 * needs Marketing and the creator's word that they agreed to emails.
 */
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })

export async function GET(request: Request) {
  const gate = await requireContacts({ read: true })
  if (gate instanceof NextResponse) return gate
  const sp = new URL(request.url).searchParams
  const page = await listPeople(gate.db, gate, readPeopleQuery((k) => sp.get(k)))
  return json(page)
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { email?: unknown; name?: unknown; tags?: unknown; notes?: unknown; phone?: unknown; subscribe?: unknown } | null
  const subscribe = body?.subscribe === true
  const gate = await requireContacts({ marketing: subscribe })
  if (gate instanceof NextResponse) return gate
  const email = normalizeEmail(body?.email)
  if (!email) return json({ error: "Enter a valid email address.", code: "invalid_email" }, 400)
  const name = typeof body?.name === "string" ? body.name.replace(/\s+/g, " ").trim().slice(0, 120) || null : null
  try {
    const res = await importPeople(gate.db, gate, [{ email, name, tags: cleanTags(body?.tags) }], { subscribe, tags: [], source: "manual", by: gate.userId })
    if (res.contactsMissing && res.subscribed === 0 && res.alreadySubscribed === 0) return json({ error: new ContactsMissing().message, code: CONTACTS_MISSING }, 503)
    if (res.subscribed) await syncPlatformsSoon(gate.db, gate.creatorId).catch(() => undefined)
    /* Wave 9: the notes and phone typed in Add contact, kept on the row just made (or the one already there). */
    const notes = typeof body?.notes === "string" ? body.notes.slice(0, 5000) : null
    const contactId = res.contactsMissing ? null : await addDetails(gate.db, gate, email, { notes, phone: typeof body?.phone === "string" ? body.phone : null }).catch(() => null)
    return json({ ok: true, ...res, contactId })
  } catch (error) {
    if (error instanceof ContactsMissing) return json({ error: error.message, code: CONTACTS_MISSING }, 503)
    console.error("[contacts] add failed:", (error as Error)?.message)
    return json({ error: "The person was not added. Try again.", code: "save_failed" }, 500)
  }
}
