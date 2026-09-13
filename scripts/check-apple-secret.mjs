/**
 * ===========================================================================
 *  WHEN SIGN IN WITH APPLE STOPS WORKING FOR EVERYBODY
 * ===========================================================================
 * Apple does not give you a client secret. You sign one, as a JWT, with a .p8
 * key, and Apple refuses to honour it past six months (15777000 seconds is
 * the cap it enforces). That JWT is pasted into
 *
 *     Supabase → Authentication → Providers → Apple → Secret Key (for OAuth)
 *
 * and then it sits there until the day it expires. On that day Apple starts
 * answering `invalid_client` to every token exchange, Supabase reports
 *
 *     Unable to exchange external code: <code>
 *
 * and Sign in with Apple is down for every person on the site at once, with
 * nothing in the repository, nothing in a deploy, and nothing in a dashboard
 * that changed. It is the one failure in this flow that a retry cannot fix
 * and that no amount of error handling can soften.
 *
 * This is the thing that tells you first. It decodes the secret, reads its
 * `exp`, and says how long is left.
 *
 * ---------------------------------------------------------------------------
 *  RUNNING IT
 * ---------------------------------------------------------------------------
 *     APPLE_CLIENT_SECRET='eyJhbGci...' node scripts/check-apple-secret.mjs
 *
 * Locally, with the value copied out of the Supabase dashboard. NOTHING IS
 * SENT ANYWHERE: a JWT's payload is base64, so reading it needs no network,
 * no key and no Apple. The secret itself is never printed, never written to a
 * file, and must not be committed. Exit code 1 when it has expired or has
 * less than 30 days left.
 */

const RENEW_WITHIN_DAYS = 30
const APPLE_MAX_LIFETIME_DAYS = 15777000 / 86400 // 182.6, Apple's own cap

const secret = process.env.APPLE_CLIENT_SECRET || process.argv[2] || ""

if (!secret) {
  console.log(`
  Nothing to check.

    APPLE_CLIENT_SECRET='eyJhbGci...' node scripts/check-apple-secret.mjs

  The value is the "Secret Key (for OAuth)" in the Supabase dashboard under
  Authentication → Providers → Apple. It stays on this machine.
`)
  process.exit(2)
}

const parts = secret.trim().split(".")
if (parts.length !== 3) {
  console.log("\n  ✗   That is not a JWT. Apple's client secret has three dot-separated parts.\n")
  process.exit(1)
}

/** base64url, which is base64 with two characters swapped and no padding. */
function decodeSegment(segment) {
  const b64 = segment.replace(/-/g, "+").replace(/_/g, "/")
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4)
  return JSON.parse(Buffer.from(padded, "base64").toString("utf8"))
}

let header
let payload
try {
  header = decodeSegment(parts[0])
  payload = decodeSegment(parts[1])
} catch {
  console.log("\n  ✗   The secret could not be decoded. Copy the whole value, with no line breaks.\n")
  process.exit(1)
}

const now = Math.floor(Date.now() / 1000)
const exp = Number(payload.exp)
const iat = Number(payload.iat)

const days = (seconds) => Math.round((seconds / 86400) * 10) / 10
const when = (unix) => (Number.isFinite(unix) ? new Date(unix * 1000).toISOString().slice(0, 16).replace("T", " ") : "not set")

console.log(`
══ Apple client secret ══

  algorithm   ${header.alg ?? "?"}${header.alg === "ES256" ? "" : "   ← Apple requires ES256"}
  key id      ${header.kid ?? "not set"}
  team        ${payload.iss ?? "not set"}          (iss, the Apple Developer team)
  services id ${payload.sub ?? "not set"}          (sub, must match the Client ID in Supabase)
  audience    ${payload.aud ?? "not set"}${payload.aud === "https://appleid.apple.com" ? "" : "   ← should be https://appleid.apple.com"}
  issued      ${when(iat)}
  expires     ${when(exp)}
`)

let failures = 0
const ok = (name, pass, detail) => {
  if (!pass) failures++
  console.log(`  ${pass ? "ok  " : "✗   "} ${name}${detail ? `  ${detail}` : ""}`)
}

ok("it is signed the way Apple requires", header.alg === "ES256", header.alg ? `alg is ${header.alg}` : "no alg")
ok("it is addressed to Apple", payload.aud === "https://appleid.apple.com", payload.aud ? `aud is ${payload.aud}` : "no aud")
ok("it names a team", typeof payload.iss === "string" && payload.iss.length > 0)
ok("it names a Services ID", typeof payload.sub === "string" && payload.sub.length > 0)
ok("it has an expiry at all", Number.isFinite(exp), "a secret with no exp is rejected outright")

if (Number.isFinite(exp)) {
  const left = exp - now
  ok(
    "it has not expired",
    left > 0,
    left > 0 ? "" : `it expired ${days(-left)} days ago, so every Apple sign in is failing right now`,
  )
  if (left > 0) {
    ok(
      `it has more than ${RENEW_WITHIN_DAYS} days left`,
      left > RENEW_WITHIN_DAYS * 86400,
      `${days(left)} days remaining`,
    )
  }

  if (Number.isFinite(iat)) {
    const lifetime = exp - iat
    ok(
      "its lifetime is within Apple's limit",
      lifetime <= 15777000,
      lifetime <= 15777000
        ? `${days(lifetime)} of ${APPLE_MAX_LIFETIME_DAYS.toFixed(1)} days`
        : `${days(lifetime)} days, and Apple rejects anything over ${APPLE_MAX_LIFETIME_DAYS.toFixed(1)}`,
    )
  }
}

if (failures) {
  console.log(`
  ${failures} to fix.

  To mint a new one: Apple Developer → Certificates, Identifiers & Profiles →
  Keys → the key with Sign in with Apple enabled (that is the .p8). Sign a
  JWT with it: header { alg: ES256, kid: <key id> }, claims { iss: <team id>,
  iat: now, exp: now + 15777000, aud: "https://appleid.apple.com",
  sub: <Services ID> }. Paste the result into Supabase → Authentication →
  Providers → Apple → Secret Key (for OAuth), and put a reminder in a calendar
  for a month before the expiry printed above.
`)
  process.exit(1)
}

console.log(`\n  Apple sign in has ${days(exp - now)} days before this has to be replaced.\n`)
