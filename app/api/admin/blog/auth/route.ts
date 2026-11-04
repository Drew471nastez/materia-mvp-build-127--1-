import { NextRequest, NextResponse } from "next/server"
import { createHash, timingSafeEqual } from "node:crypto"
import { ADMIN_COOKIE, SESSION_MAX_AGE, issueSessionToken } from "@/lib/admin-session"
import { addressSubject, rateLimit } from "@/lib/api/rate-limit"
import { ADMIN_LOGIN_LIMITS, adminCredentialWarnings } from "@/lib/admin/login-guard"

/** `node:crypto`, and a cookie that must be set on the real host. */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  SIGNING IN TO THE ADMIN
 * ===========================================================================
 * The username and the password were written here, in the repository:
 *
 *     const USERNAME = "storelib"
 *     const PASSWORD = "…"
 *
 * so everybody who could read the repo could sign in, and the only way to
 * change either was a deploy. They come from the environment now.
 *
 * ===========================================================================
 *  THE CREDENTIAL IS WRITTEN HERE, AND THE OWNER ASKED FOR IT TWICE
 * ===========================================================================
 * IF YOU ARE ABOUT TO "FIX" THIS, READ THIS FIRST. It was hardened out of
 * this file once, then put back deliberately, on the repository owner's
 * explicit and repeated instruction: no environment variable, these two
 * values, in the source. An intermediate version stored a scrypt digest
 * instead, which works identically from the outside, and that was declined
 * too. This is a decision, not an oversight, and undoing it silently would
 * lock the owner out of their own platform.
 *
 * WHAT IT COSTS, recorded so the trade is visible rather than forgotten:
 *
 *   - anybody who can read this repository can sign in;
 *   - the password stays in the git history after it is changed here;
 *   - this cookie opens a dashboard over the whole platform and, through
 *     /api/admin/spam-purge, can delete user accounts.
 *
 * `BLOG_ADMIN_PASSWORD` and `BLOG_ADMIN_USER` still win when they are set, so
 * the way out of all three is one environment variable and no deploy. Nothing
 * below has to change for that to work.
 */
const EXPECTED_USER = (process.env.BLOG_ADMIN_USER || "Storelib").trim()
const EXPECTED_PASSWORD = process.env.BLOG_ADMIN_PASSWORD || "Amfetamina11"

/* Said loudly, once per instance, while the fallback is in use; limited per caller address (lib/admin/login-guard.ts). */
let warned = false

/** Constant time, and length-independent because the digests are equal size. */
function sameSecret(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest()
  const hb = createHash("sha256").update(b).digest()
  return timingSafeEqual(ha, hb)
}

export async function POST(req: NextRequest) {
  if (!warned) {
    warned = true
    for (const line of adminCredentialWarnings()) console.error(`[admin-login] WARNING: ${line}. Set it in the Vercel project's environment.`)
  }

  const limited = await rateLimit({
    bucket: "admin-login",
    subjects: [addressSubject(req)],
    windows: ADMIN_LOGIN_LIMITS,
    message: "Too many sign in attempts. Wait a few minutes and try again.",
  })
  if (limited) return limited

  let username = ""
  let password = ""
  try {
    const body = await req.json()
    username = typeof body.username === "string" ? body.username.trim() : ""
    password = typeof body.password === "string" ? body.password : ""
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  /**
   * Both compared, and both in constant time, and the answer is the same
   * either way: "invalid credentials" never says which half was wrong.
   *
   * THE USERNAME IS FOLDED TO LOWER CASE AND THE PASSWORD IS NOT, which is a
   * deliberate asymmetry rather than an oversight.
   *
   * The password is a secret: every byte of it counts, and comparing it
   * loosely would hand an attacker a smaller space to search. The username is
   * not a secret at all — its default is written in this file, in the
   * repository — so the only thing case-sensitivity there can do is refuse
   * the right person. It very nearly did: the login was typed as "Storelib"
   * and, because this refusal says nothing about which half was wrong, that
   * would have read as a bad password for as long as it took to notice the
   * capital letter.
   *
   * Lowercasing before the digest keeps the comparison constant-time and
   * length-independent, because the digests are still equal size.
   */
  const ok =
    sameSecret(username.toLowerCase(), EXPECTED_USER.toLowerCase()) &&
    sameSecret(password, EXPECTED_PASSWORD)
  if (!ok) {
    console.warn("[admin-login] refused a sign in with wrong credentials")
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
  }

  const token = issueSessionToken()
  if (!token) {
    return NextResponse.json(
      { error: "Blog admin is not configured. Set BLOG_ADMIN_SECRET in the environment." },
      { status: 503 },
    )
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    // The cookie opens an admin. It has no business leaving HTTPS, and no
    // business being sent from anybody else's page.
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  })
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.delete(ADMIN_COOKIE)
  return res
}
