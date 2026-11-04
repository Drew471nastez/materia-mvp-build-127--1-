/**
 * ===========================================================================
 *  STORELIB'S OWN NEWSLETTER: the footer's "Join Our Community" box
 * ===========================================================================
 * Not a creator's subscribers (that is /api/subscribe and the `subscribers`
 * table): these are people asking Storelib itself for news. The box used to
 * wait half a second and say thanks without keeping anything.
 *
 * Public, so careful in the same ways as the creator sign-up:
 *   - the address is validated and lowercased, and counted by lib/api/rate-limit
 *     against the caller's address and the email itself;
 *   - signing up twice is not an error and not a second row, and nothing says
 *     whether an address was already on the list;
 *   - the wording agreed to is stored with the time, which is what a consent
 *     record needs;
 *   - the address is never logged.
 *
 *   - two boxes post here, each named by `source` (anything else is the
 *     footer's): the footer's, and the blog's (app/(marketing)/blog
 *     _components/newsletter-card), each storing the words it showed;
 *   - `company` is a field people never see. A script that fills every
 *     field fills it; it gets the same answer and nothing is stored.
 *
 * Table: supabase/sql/RUN_STORELIB_NEWSLETTER.sql. Until that has been run
 * the route says so plainly (503) rather than pretending it worked.
 */
import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { rateLimit, addressSubject, emailSubject, LIMITS } from "@/lib/api/rate-limit"

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

const CONSENT_TEXT: Record<"footer" | "blog", string> = {
  footer: "Receive weekly assets and future templates for free by joining our community.",
  blog: "New guides for creators, by email.",
}

export async function POST(req: NextRequest) {
  let body: { email?: unknown; source?: unknown; company?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 })
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  if (!EMAIL.test(email) || email.length > 254) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 })
  }

  const source = body.source === "blog" ? "blog" : "footer"
  /* The hidden field: a person never sees it, so a value in it is a script. */
  if (typeof body.company === "string" && body.company.trim()) return NextResponse.json({ ok: true })

  const limited = await rateLimit({
    bucket: "newsletter",
    subjects: [addressSubject(req), emailSubject(email)],
    windows: LIMITS.subscribe,
    message: "That is a lot of sign-ups at once. Try again in a minute.",
  })
  if (limited) return limited

  let admin
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json({ error: "Sign-ups are not open yet. Try again later." }, { status: 503 })
  }

  const { error } = await admin
    .from("storelib_newsletter")
    .upsert({ email, source, consent_text: CONSENT_TEXT[source], unsubscribed_at: null }, { onConflict: "email" })

  if (error) {
    /* 23505: already on the list. Same answer as a new sign-up. */
    if (error.code === "23505") return NextResponse.json({ ok: true })
    console.error(`[newsletter] could not store a sign-up (${error.code ?? "unknown"})`)
    return NextResponse.json({ error: "Sign-ups are not open yet. Try again later." }, { status: 503 })
  }
  return NextResponse.json({ ok: true })
}
