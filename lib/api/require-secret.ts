/**
 * ===========================================================================
 *  A SHARED SECRET THAT IS NOT SET MUST REFUSE EVERYBODY, NOT ADMIT EVERYBODY
 * ===========================================================================
 * A handful of routes are not reached by a signed-in person at all. A cron
 * job, an internal retry, an operator script: they carry a bearer token from
 * the environment instead of a session, and they hold the service role key,
 * which bypasses every row level security policy in the database.
 *
 * Every one of them was written inline, and six of the seven were wrong in
 * one of two ways.
 *
 *   if (secret && header !== `Bearer ${secret}`) return 401
 *
 * reads as "check the secret", and does the opposite when there is no secret
 * to check: the condition is false, the guard is skipped, and the route is
 * open to anyone who can find the URL. An environment variable missing from
 * one deployment is not an exotic situation, it is Tuesday.
 *
 *   if (header !== `Bearer ${process.env.CRON_SECRET}`) return 401
 *
 * looks stricter and is worse. With the variable unset the template produces
 * the literal string "Bearer undefined", and that is a password: anybody
 * sending exactly that header is let straight through.
 *
 * So there is one function, it fails closed, and it says which it was in the
 * server log so a missing variable is findable rather than silent.
 *
 * The comparison is timing safe. It matters little for a header nobody can
 * see the result of quickly, and it costs nothing to do properly.
 */
import { timingSafeEqual } from "node:crypto"
import { NextResponse } from "next/server"

function sameString(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8")
  const right = Buffer.from(b, "utf8")
  /* timingSafeEqual throws on a length mismatch, which is itself the answer. */
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

/**
 * A secret that arrived somewhere other than the Authorization header, such
 * as in a posted body. The caller still has to check that the expected value
 * exists; this only compares.
 */
export function matchesSecret(given: unknown, expected: string): boolean {
  return typeof given === "string" && given.length > 0 && sameString(given, expected)
}

/**
 * `null` when the caller presented the right token, or the 401 to return.
 *
 *     const denied = requireBearerSecret(request, "CRON_SECRET")
 *     if (denied) return denied
 */
export function requireBearerSecret(
  request: Request,
  variable: "CRON_SECRET" | "ADMIN_SECRET" | "INTERNAL_SECRET",
): NextResponse | null {
  const expected = process.env[variable]

  if (!expected) {
    /* Not the caller's fault, and not something to tell the caller either. */
    console.error(`[auth] ${variable} is not configured; refusing the request`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const header = request.headers.get("authorization")
  if (!header || !sameString(header, `Bearer ${expected}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  return null
}
