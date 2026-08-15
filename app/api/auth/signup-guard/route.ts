import { type NextRequest, NextResponse } from "next/server"
import crypto from "crypto"

import { createAdminClient } from "@/lib/supabase/admin"
import { scoreSignup, isDisposableEmail, emailDomain } from "@/lib/security/spam-signals"

/**
 * ===========================================================================
 *  POST /api/auth/signup-guard  →  { allow: boolean, reason?: string }
 * ===========================================================================
 *
 * Called by the signup form immediately before supabase.auth.signUp. It is the
 * friction layer of the three-part defence described in
 * lib/security/spam-signals.ts, and it is worth being precise about how much it
 * is and is not doing.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS CAN AND CANNOT ENFORCE
 * ---------------------------------------------------------------------------
 * Storelib signs up through the Supabase client SDK from the browser, with the
 * anon key — which is public by design. So a determined script can call
 * Supabase directly and never come past this route. That is a real limitation
 * and pretending otherwise would be worse than stating it.
 *
 * What it does buy:
 *
 *   · It stops every bot that drives the FORM, which is most of them. Farms are
 *     built on headless browsers and form-fillers because that is what works
 *     against every site at once; a bespoke Supabase integration is a per-target
 *     cost, and this is a small target.
 *   · It gives the abuse a written record — the ledger in signup_attempts — so
 *     the next batch is visible while it is happening rather than three hundred
 *     accounts later.
 *   · It makes throwaway domains and farm handles a dead end at the cheapest
 *     possible moment: before an auth user exists to have to clean up.
 *
 * What actually removes the incentive is the containment half — no sitemap
 * entry, no index, no structured data until an account publishes a product. See
 * app/sitemap.ts. This route raises the cost; that one removes the prize. Only
 * the second is not an arms race, so nothing here is load-bearing.
 *
 * ---------------------------------------------------------------------------
 * IT FAILS OPEN, ALWAYS
 * ---------------------------------------------------------------------------
 * Every error path returns allow. A signup form that refuses real customers
 * because a rate-limit table is missing, or Supabase blinked, is a far more
 * expensive failure than a spammer getting through — they publish nothing and
 * get nothing anyway. The one thing this must never do is stand between a real
 * person and an account.
 */

/** Per-IP ceiling. Generous: a household, an office or a university NAT can
 *  legitimately produce several accounts in an hour, and a shared mobile
 *  carrier gateway can produce more. This is set to catch a flood, not a
 *  family. */
const MAX_PER_IP_PER_HOUR = 8
const MAX_PER_IP_PER_DAY = 20

/** Hashing the IP rather than storing it. See the migration for why; in short,
 *  the limiter only needs identity, not the address, and an address is personal
 *  data. Salted with the service-role key so the table alone cannot be reversed
 *  by hashing the IPv4 space. */
function hashIp(ip: string): string {
  const salt = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_URL || "storelib"
  return crypto.createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32)
}

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for")
  if (fwd) return fwd.split(",")[0]!.trim()
  return req.headers.get("x-real-ip")?.trim() || "unknown"
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const email: string = typeof body?.email === "string" ? body.email.trim().toLowerCase() : ""
    const handle: string | null = typeof body?.handle === "string" ? body.handle : null

    /**
     * The honeypot.
     *
     * The form renders a field no human can see or tab into, named to look like
     * something worth filling — see app/(auth)/signup/page.tsx. A person leaves
     * it empty because they never knew it was there. A form-filler fills every
     * input it can find, which is the entire point of a form-filler.
     *
     * Refused silently: the response says "allow: false" with the same generic
     * reason as everything else, so the bot cannot tell which of its inputs was
     * the mistake and iterate.
     */
    if (typeof body?.website === "string" && body.website.trim() !== "") {
      await record(req, { email, handle, score: 99, verdict: "blocked", reasons: ["honeypot"] })
      return NextResponse.json({ allow: false, reason: "signup_unavailable" })
    }

    /**
     * Fill time.
     *
     * The form stamps the moment it mounted and sends the elapsed milliseconds.
     * Reading a page, deciding to sign up, typing an address and choosing a
     * password takes a human several seconds at an absolute minimum. Under one
     * and a half is not a fast typist, it is a script.
     *
     * Deliberately loose. A returning user with an autofilled address and a
     * password manager is genuinely quick, and the cost of being wrong here is a
     * real customer bounced off the signup form.
     */
    const elapsedMs = Number(body?.elapsedMs)
    if (Number.isFinite(elapsedMs) && elapsedMs >= 0 && elapsedMs < 1500) {
      await record(req, { email, handle, score: 99, verdict: "blocked", reasons: ["too_fast"] })
      return NextResponse.json({ allow: false, reason: "signup_unavailable" })
    }

    if (isDisposableEmail(email)) {
      await record(req, { email, handle, score: 99, verdict: "blocked", reasons: ["disposable_email"] })
      return NextResponse.json({ allow: false, reason: "email_not_accepted" })
    }

    const verdict = scoreSignup({ email, handle })
    if (verdict.blocked) {
      await record(req, {
        email,
        handle,
        score: verdict.score,
        verdict: "blocked",
        reasons: verdict.signals.map((s) => s.code),
      })
      return NextResponse.json({ allow: false, reason: "signup_unavailable" })
    }

    /**
     * Velocity, which is the signal that survives a rename.
     *
     * A blocklist knows the vocabulary it was written with. This knows that
     * whoever is behind one address opened forty accounts before lunch, and it
     * keeps knowing it when the handles become innocuous.
     */
    const ipHash = hashIp(clientIp(req))
    const admin = createAdminClient()
    const now = Date.now()

    const [{ count: lastHour }, { count: lastDay }] = await Promise.all([
      admin
        .from("signup_attempts")
        .select("id", { count: "exact", head: true })
        .eq("ip_hash", ipHash)
        .gte("created_at", new Date(now - 60 * 60 * 1000).toISOString()),
      admin
        .from("signup_attempts")
        .select("id", { count: "exact", head: true })
        .eq("ip_hash", ipHash)
        .gte("created_at", new Date(now - 24 * 60 * 60 * 1000).toISOString()),
    ])

    if ((lastHour ?? 0) >= MAX_PER_IP_PER_HOUR || (lastDay ?? 0) >= MAX_PER_IP_PER_DAY) {
      await record(req, { email, handle, score: verdict.score, verdict: "blocked", reasons: ["velocity"] }, ipHash)
      return NextResponse.json({ allow: false, reason: "too_many_signups" })
    }

    await record(
      req,
      {
        email,
        handle,
        score: verdict.score,
        verdict: verdict.review ? "review" : "allowed",
        reasons: verdict.signals.map((s) => s.code),
      },
      ipHash,
    )

    // Prune on roughly one request in fifty rather than on a schedule. Nothing
    // to configure, nothing to forget, and the table never grows without bound.
    // Swallowed: on a deployment where the migration has not been run the
    // function does not exist, and that must not fail a signup.
    if (Math.random() < 0.02) {
      try {
        await admin.rpc("prune_signup_attempts")
      } catch {}
    }

    return NextResponse.json({ allow: true })
  } catch (e: unknown) {
    // Fails open. See the note at the top: refusing real customers because this
    // route had a bad day is the more expensive mistake by a wide margin.
    console.error("[signup-guard] failed open:", e instanceof Error ? e.message : e)
    return NextResponse.json({ allow: true })
  }
}

/** Best-effort write to the ledger. A missing table means the migration has not
 *  been run, which must not turn into a broken signup form. */
async function record(
  req: NextRequest,
  entry: { email: string; handle: string | null; score: number; verdict: string; reasons: string[] },
  precomputedIpHash?: string,
) {
  try {
    const admin = createAdminClient()
    await admin.from("signup_attempts").insert({
      ip_hash: precomputedIpHash ?? hashIp(clientIp(req)),
      email_domain: emailDomain(entry.email) || null,
      handle: entry.handle,
      score: entry.score,
      verdict: entry.verdict,
      reasons: entry.reasons,
    })
  } catch {}
}
