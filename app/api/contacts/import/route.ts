import { NextResponse } from "next/server"
import { NO_STORE, requireContacts } from "@/lib/contacts/gate"
import { IMPORT_MAX_BYTES, readImport } from "@/lib/contacts/csv"
import { CONTACTS_MISSING, ContactsMissing, importPeople } from "@/lib/contacts/write-server"
import { syncPlatformsSoon } from "@/lib/contacts/checkout-contact"
import { rateLimit } from "@/lib/api/rate-limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * POST /api/contacts/import (round 51): a CSV of people, as the request's
 * text body (at most 2 MB and 5,000 rows).
 *
 *   ?subscribe=1   the creator confirms these people agreed to get their
 *                  emails: addresses the list does not have yet become
 *                  subscribers (needs Marketing). Without it nobody is added
 *                  to the marketing list; they are kept as contacts only.
 *   ?tag=<tag>     a tag given to everyone in the file
 *
 * Nobody who unsubscribed, bounced or complained is put back on the list,
 * and no welcome email is sent (lib/contacts/write-server importPeople).
 */
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })

export async function POST(request: Request) {
  const sp = new URL(request.url).searchParams
  const subscribe = sp.get("subscribe") === "1"
  const gate = await requireContacts({ marketing: subscribe })
  if (gate instanceof NextResponse) return gate
  const limited = await rateLimit({ bucket: "contacts_import", subjects: [`user:${gate.userId}`], windows: [{ limit: 10, seconds: 60 }, { limit: 60, seconds: 3600 }], message: "That is a lot of imports at once. Try again in a minute." }).catch(() => null)
  if (limited) return limited
  const size = Number(request.headers.get("content-length") || 0)
  if (size > IMPORT_MAX_BYTES) return json({ error: "That file is too large. Split it into files under 2 MB.", code: "too_large" }, 413)
  const text = await request.text().catch(() => "")
  if (text.length > IMPORT_MAX_BYTES) return json({ error: "That file is too large. Split it into files under 2 MB.", code: "too_large" }, 413)
  const parsed = readImport(text)
  if (parsed.noEmailColumn) return json({ error: "No column of email addresses was found. Name one column Email.", code: "no_email_column" }, 400)
  if (parsed.rows.length === 0) return json({ error: "No valid email addresses were found in the file.", code: "no_rows", invalid: parsed.invalid }, 400)
  try {
    const res = await importPeople(gate.db, gate, parsed.rows, { subscribe, tags: [sp.get("tag") ?? ""], source: "import", by: gate.userId })
    if (res.contactsMissing && !subscribe) return json({ error: new ContactsMissing().message, code: CONTACTS_MISSING }, 503)
    if (res.subscribed) await syncPlatformsSoon(gate.db, gate.creatorId).catch(() => undefined)
    return json({ ok: true, read: parsed.rows.length, invalid: parsed.invalid, repeated: parsed.repeated, truncated: parsed.truncated, ...res })
  } catch (error) {
    if (error instanceof ContactsMissing) return json({ error: error.message, code: CONTACTS_MISSING }, 503)
    console.error("[contacts] import failed:", (error as Error)?.message)
    return json({ error: "The import did not finish. Try again.", code: "save_failed" }, 500)
  }
}
