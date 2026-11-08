import { NextResponse } from "next/server"
import { NO_STORE, requireContacts } from "@/lib/contacts/gate"
import { cleanTag } from "@/lib/contacts/identity"
import { CONTACTS_MISSING, ContactsMissing, deleteContactRows, resolveKeys, tagPeople } from "@/lib/contacts/write-server"
import { contactIdsFrom } from "@/lib/contacts/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/contacts/bulk { action, ids, tag? } (round 51), for the people
 * picked in the list (at most 200):
 *
 *   tag      the tag given to each one (a contact row made where there is none)
 *   untag    the tag taken off each one
 *   delete   each one's contact row removed: notes, tags, a person added by
 *            hand or imported. Orders, memberships, community members, form
 *            answers and subscribers are never deleted; a person made of
 *            those stays in the list.
 */
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })

export async function POST(request: Request) {
  const gate = await requireContacts()
  if (gate instanceof NextResponse) return gate
  const body = (await request.json().catch(() => null)) as { action?: unknown; ids?: unknown; tag?: unknown } | null
  const ids = contactIdsFrom(Array.isArray(body?.ids) ? (body!.ids as unknown[]).filter((x): x is string => typeof x === "string") : [])
  if (!ids.length) return json({ error: "Pick people first.", code: "nothing_chosen" }, 400)
  try {
    if (body?.action === "tag" || body?.action === "untag") {
      const tag = cleanTag(body.tag)
      if (!tag) return json({ error: "Type a tag.", code: "no_tag" }, 400)
      const changed = await tagPeople(gate.db, gate, ids, tag, body.action === "tag", gate.userId)
      return json({ ok: true, changed })
    }
    if (body?.action === "delete") {
      const who = await resolveKeys(gate.db, gate, ids)
      const rows = [...who.values()].flatMap((w) => ("contactId" in w ? [w.contactId] : []))
      const deleted = await deleteContactRows(gate.db, gate, rows)
      return json({ ok: true, deleted, kept: ids.length - deleted })
    }
    return json({ error: "Not found", code: "unknown_action" }, 404)
  } catch (error) {
    if (error instanceof ContactsMissing) return json({ error: error.message, code: CONTACTS_MISSING }, 503)
    console.error("[contacts] bulk failed:", (error as Error)?.message)
    return json({ error: "That did not finish. Try again.", code: "save_failed" }, 500)
  }
}
