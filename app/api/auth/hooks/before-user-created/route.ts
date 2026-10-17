import { NextResponse, type NextRequest } from "next/server"
import { createHmac, timingSafeEqual } from "node:crypto"

import { createAdminClient } from "@/lib/supabase/admin"
import { domainVelocityCounts, emailDomain, isDisposableEmail, scoreSignup } from "@/lib/security/spam-signals"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  THE GUARD THAT CANNOT BE SKIPPED
 * ===========================================================================
 * /api/auth/signup-guard is enforced by the SIGNUP PAGE: the browser asks it,
 * and if the answer is no the browser stops. Then the browser calls
 * `supabase.auth.signUp()` directly.
 *
 * Which means the guard only ever applied to people who used the form. A
 * script that never loads the page — POST to Supabase's auth endpoint with the
 * anon key, which is public by design — never asks and is never refused. Every
 * lexicon, every velocity limit and every disposable-domain list was, against
 * an actual bot, decoration.
 *
 * Supabase calls THIS before it creates a user, whatever made the request. It
 * is the same judgement in the one place that cannot be routed around.
 *
 * ---------------------------------------------------------------------------
 *  WIRING IT UP (once, in the dashboard)
 * ---------------------------------------------------------------------------
 *   Authentication → Hooks → Before User Created → HTTP
 *   URL:    https://storelib.com/api/auth/hooks/before-user-created
 *   Secret: generate one, and put the same value in SUPABASE_AUTH_HOOK_SECRET
 *
 * Until both exist this route refuses everything it cannot verify — see below
 * for why that is the safe direction here and the wrong one in the page guard.
 */

/**
 * Standard Webhooks: the signature covers `id.timestamp.payload`, and the
 * secret is base64 after its `whsec_` prefix.
 */
function verified(request: NextRequest, raw: string): boolean {
  const secret = process.env.SUPABASE_AUTH_HOOK_SECRET
  if (!secret) return false

  const id = request.headers.get("webhook-id")
  const timestamp = request.headers.get("webhook-timestamp")
  const signatureHeader = request.headers.get("webhook-signature")
  if (!id || !timestamp || !signatureHeader) return false

  /**
   * A replay window. Without it a captured request works forever, which turns
   * one intercepted signup into an unlimited supply of them.
   */
  const age = Math.abs(Date.now() / 1000 - Number(timestamp))
  if (!Number.isFinite(age) || age > 300) return false

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64")
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${raw}`).digest("base64")

  // The header carries one or more space-separated `v1,<signature>` pairs.
  return signatureHeader.split(" ").some((entry) => {
    const value = entry.split(",")[1] ?? ""
    const a = Buffer.from(value)
    const b = Buffer.from(expected)
    return a.length === b.length && timingSafeEqual(a, b)
  })
}

/** Supabase's shape for this hook. Only the parts that are acted on. */
interface HookPayload {
  user?: { email?: string; raw_user_meta_data?: Record<string, unknown> }
}

function reject(message: string) {
  /**
   * 200 with an `error` body is how this hook says no — Supabase reads the
   * body, and a non-200 reads as the hook being broken rather than as a
   * verdict.
   */
  return NextResponse.json({ error: { http_code: 400, message } })
}

export async function POST(request: NextRequest) {
  const raw = await request.text()

  if (!verified(request, raw)) {
    /**
     * FAILS CLOSED, and that is the opposite of the page guard on purpose.
     *
     * The page guard fails open because a broken fetch must not stop a real
     * person signing up — there, the cost of a false refusal is a lost
     * customer and the cost of a miss is one spam account. Here, an
     * unverifiable request is one that did not come from Supabase, and the
     * only thing that produces is somebody probing the endpoint.
     */
    return NextResponse.json({ error: { http_code: 401, message: "Unauthorized" } }, { status: 401 })
  }

  let payload: HookPayload
  try {
    payload = JSON.parse(raw)
  } catch {
    return reject("Malformed request.")
  }

  const email = (payload.user?.email ?? "").trim().toLowerCase()
  if (!email) return reject("An email address is required.")

  const meta = payload.user?.raw_user_meta_data ?? {}
  const handle =
    typeof meta.username === "string"
      ? meta.username
      : typeof meta.display_name === "string"
        ? meta.display_name
        : null

  if (isDisposableEmail(email)) {
    await record({ email, handle, score: 99, reasons: ["disposable_email"] })
    return reject("That email provider is not accepted.")
  }

  const verdict = scoreSignup({ email, handle })
  if (verdict.blocked) {
    await record({ email, handle, score: verdict.score, reasons: verdict.signals.map((s) => s.code) })
    return reject("This signup could not be completed.")
  }

  /**
   * Velocity by domain, which is the signal that survives a rename.
   *
   * The page guard counts by IP hash, and it can: it sees the request. Here
   * the request is Supabase's, so its address says nothing about who is
   * signing up. What is left is the address they used, and a hundred accounts
   * on one domain in an hour is the shape of a farm whatever the handles say.
   *
   * EXCEPT ON THE DOMAINS EVERYBODY SHARES (lib/security/spam-signals
   * SHARED_EMAIL_DOMAINS). This counted gmail.com with the rest, so on a busy
   * hour the twenty sixth person signing up with a Gmail address, and every
   * one after them, was told "This signup could not be completed" and could
   * not make an account at all. Twenty five accounts an hour on one small
   * domain is a farm; twenty five on Gmail is a Tuesday. The scoring, the
   * disposable list and the page guard's per address counting are unchanged:
   * only this one rule skips those providers.
   */
  const domain = emailDomain(email)
  if (domain && domainVelocityCounts(email)) {
    const admin = createAdminClient()
    const { count } = await admin
      .from("signup_attempts")
      .select("id", { count: "exact", head: true })
      .eq("email_domain", domain)
      .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())

    if ((count ?? 0) >= 25) {
      await record({ email, handle, score: 90, reasons: ["domain_velocity"] })
      return reject("This signup could not be completed.")
    }
  }

  await record({ email, handle, score: verdict.score, reasons: [], allowed: true })
  return NextResponse.json({})
}

async function record(input: {
  email: string
  handle: string | null
  score: number
  reasons: string[]
  allowed?: boolean
}): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin.from("signup_attempts").insert({
      /**
       * A sentinel, not a hash. Supabase makes this request, so its address
       * says nothing about who is signing up — and the page guard counts by
       * real hashes, which this can never collide with.
       *
       * The column list is the one signup-guard already writes. An invented
       * column would have failed inside the catch below and every one of these
       * rows would have been silently missing.
       */
      ip_hash: "auth_hook",
      email_domain: emailDomain(input.email) || null,
      handle: input.handle,
      score: input.score,
      verdict: input.allowed ? "allowed" : "blocked",
      reasons: input.reasons,
    })
  } catch {
    /**
     * Recording is evidence, not enforcement. A logging failure must never be
     * the reason a signup is refused, or an outage in one table becomes an
     * outage of the front door.
     */
  }
}
