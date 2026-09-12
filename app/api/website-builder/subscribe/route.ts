/**
 * ===========================================================================
 *  THE NEWSLETTER SECTION, ACTUALLY SUBSCRIBING SOMEBODY
 * ===========================================================================
 * The section's submit handler used to call `preventDefault()` and set a
 * success message. That is all it did. A visitor was told "you're in, check
 * your inbox" and nothing was recorded anywhere, on any site built with it.
 * Nobody could tell from looking, which is what made it worse than a button
 * that plainly did nothing.
 *
 * This writes to the same `subscribers` table the rest of the platform uses,
 * with the same shape and the same email flows, so a person captured by a
 * built site appears beside everybody else and the creator's existing
 * automations fire.
 *
 * PUBLIC BY DESIGN, and therefore careful:
 *   - the creator is named by id and checked to exist, so a bad id writes
 *     nothing rather than writing an orphan row;
 *   - the address is validated and lowercased;
 *   - subscribing twice is not an error and not a second row;
 *   - nothing about an existing subscriber is ever reported back, because
 *     "already subscribed" is an answer that tells a stranger who is on the
 *     list.
 */
import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { triggerEmailFlows } from "@/lib/email"
import { randomUUID } from "node:crypto"

/** Deliberately plain. A clever pattern refuses addresses that work. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

const MAX_NAME = 120

export async function POST(req: NextRequest) {
  let body: { creator_id?: unknown; email?: unknown; name?: unknown; source?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 })
  }

  const creatorId = typeof body.creator_id === "string" ? body.creator_id.trim() : ""
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  const name = typeof body.name === "string" ? body.name.trim().slice(0, MAX_NAME) : ""

  if (!creatorId || !EMAIL.test(email) || email.length > 254) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 })
  }

  const db = createAdminClient()

  // A creator that does not exist writes nothing. Without this, anybody
  // could fill the table with rows belonging to no account.
  const { data: creator } = await db.from("creators").select("id").eq("id", creatorId).maybeSingle()
  if (!creator) return NextResponse.json({ error: "Unknown site" }, { status: 404 })

  const { data: existing } = await db
    .from("subscribers")
    .select("id")
    .eq("creator_id", creatorId)
    .eq("email", email)
    .maybeSingle()

  // Already on the list: say the same thing as a fresh subscribe. The answer
  // must not differ, or it becomes a way to ask whether an address is known.
  if (existing) return NextResponse.json({ ok: true })

  const { error } = await db.from("subscribers").insert({
    email,
    name: name || null,
    source: "website_builder_newsletter",
    creator_id: creatorId,
    status: "subscribed",
    is_active: true,
    subscribed_at: new Date().toISOString(),
    consent_text: "Subscribed via the newsletter section of this creator's website",
    consent_timestamp: new Date().toISOString(),
    unsubscribe_token: randomUUID(),
  })

  if (error) {
    // A race with another submission of the same address lands here as a
    // unique violation, and that is a success from the visitor's side.
    if (error.code === "23505") return NextResponse.json({ ok: true })
    console.error("[subscribe] insert failed:", error.message)
    return NextResponse.json({ error: "Could not subscribe" }, { status: 500 })
  }

  /**
   * The creator's own welcome automation, the same one every other capture
   * path fires. A failure here is not the visitor's problem: they are
   * subscribed either way.
   */
  try {
    await triggerEmailFlows(db, {
      triggerType: "new_subscriber",
      creatorId,
      recipientEmail: email,
      recipientName: name || undefined,
    })
  } catch (err) {
    console.error("[subscribe] email flow failed:", err instanceof Error ? err.message : err)
  }

  return NextResponse.json({ ok: true })
}
