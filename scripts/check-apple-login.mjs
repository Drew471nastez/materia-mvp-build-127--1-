/**
 * ===========================================================================
 *  WHERE SIGN IN WITH APPLE IS BREAKING
 * ===========================================================================
 * A creator pressed Continue with Apple, twice, and got
 *
 *     Apple did not finish signing you in. Try once more.
 *
 * both times. The product's automatic retry had already been spent by then,
 * so that is two real attempts, which rules out the whole transient family:
 * a code that aged out or arrived twice works on the next go.
 *
 * ---------------------------------------------------------------------------
 *  THE THREE STEPS, AND WHICH ONE THIS CAN SEE
 * ---------------------------------------------------------------------------
 *   1. AUTHORIZE   the browser goes to appleid.apple.com with a client_id and
 *                  a redirect_uri. Apple either shows a sign in page or says
 *                  the client is wrong. PUBLIC. This script drives it.
 *
 *   2. THE PERSON  signs in. Nothing to test.
 *
 *   3. EXCHANGE    Supabase's server posts the authorization code AND A
 *                  CLIENT SECRET to appleid.apple.com/auth/token. This is the
 *                  step that was failing, and it is the ONLY step that uses
 *                  the secret.
 *
 * So a green step 1 with a failing sign in is not ambiguous. It says the
 * client_id and the return URL are right and the secret is not.
 *
 * Step 3 cannot be driven from here without the secret, and the secret lives
 * in the Supabase dashboard. Set APPLE_CLIENT_SECRET and this checks it
 * offline, including the thing a bare expiry check misses: whether its `sub`
 * is the same client_id step 1 just proved Apple accepts. A secret minted
 * with the iOS app's Bundle ID instead of the Services ID passes every
 * inspection, sails through step 1, and fails step 3 forever.
 *
 * ---------------------------------------------------------------------------
 *  RUNNING IT
 * ---------------------------------------------------------------------------
 *     node scripts/check-apple-login.mjs
 *
 *     # and, locally, with Supabase → Authentication → Providers → Apple →
 *     # "Secret Key (for OAuth)" pasted in:
 *     APPLE_CLIENT_SECRET='eyJhbGci...' node scripts/check-apple-login.mjs
 *
 * The secret stays on this machine: a JWT's claims are base64, so reading
 * them needs no network and no key. It is never printed and never written.
 */

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "https://skgtqglupjcnfhfscink.supabase.co").replace(/\/$/, "")
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://storelib.com"
const RENEW_WITHIN_DAYS = 30
const APPLE_MAX_LIFETIME = 15777000 // seconds, Apple's own cap

let failures = 0
const ok = (name, pass, detail) => {
  if (!pass) failures++
  console.log(`  ${pass ? "ok  " : "✗   "} ${name}${detail ? `  ${detail}` : ""}`)
}

const get = (url, opts = {}) =>
  fetch(url, {
    redirect: "manual",
    headers: {
      /** Apple serves a different page to something that is not a browser. */
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      ...(opts.headers || {}),
    },
    signal: AbortSignal.timeout(30000),
  })

console.log(`\n══ Sign in with Apple, end to end ══\n\n  project   ${SUPABASE_URL}\n  site      ${SITE_URL}\n`)

// ── 1. What does Supabase send to Apple? ───────────────────────────────────
let appleUrl = null
try {
  const res = await get(
    `${SUPABASE_URL}/auth/v1/authorize?provider=apple&redirect_to=${encodeURIComponent(`${SITE_URL}/auth/callback`)}`,
  )
  const location = res.headers.get("location")
  ok("Supabase hands the browser off to Apple", res.status === 302 && !!location, `HTTP ${res.status}`)
  if (location && location.startsWith("https://appleid.apple.com/")) appleUrl = new URL(location)
  else if (location) ok("and the handoff goes to Apple", false, location.slice(0, 120))
} catch (e) {
  ok("Supabase hands the browser off to Apple", false, String(e.message))
}

if (!appleUrl) {
  console.log("\n  Apple is not configured on this Supabase project, or it is unreachable.\n")
  process.exit(1)
}

const clientId = appleUrl.searchParams.get("client_id")
const redirectUri = appleUrl.searchParams.get("redirect_uri")

console.log(`
  services id   ${clientId}
  return url    ${redirectUri}
  scope         ${appleUrl.searchParams.get("scope")}
  response mode ${appleUrl.searchParams.get("response_mode")}
`)

ok("a Services ID is configured", !!clientId)
ok(
  "the return URL is this project's callback",
  redirectUri === `${SUPABASE_URL}/auth/v1/callback`,
  redirectUri === `${SUPABASE_URL}/auth/v1/callback` ? "" : "Apple returns to Supabase, never to the site",
)
ok(
  "Apple is asked to post the result back",
  appleUrl.searchParams.get("response_mode") === "form_post",
  "anything else and the name and email are dropped",
)

// ── 2. Does Apple accept that client? ──────────────────────────────────────
try {
  const res = await get(appleUrl.toString())
  const body = res.status === 200 ? await res.text() : ""
  const signInPage = /<title>[^<]*Sign in to Apple/i.test(body)
  const rejected = /invalid_client|invalid_request|invalid_redirect/i.test(body) || res.status >= 400

  ok(
    "Apple accepts the Services ID and the return URL",
    signInPage && !rejected,
    signInPage && !rejected
      ? "it served the sign in page"
      : rejected
        ? "Apple refused the client: check the Services ID and its Return URLs in the Apple Developer portal"
        : `HTTP ${res.status}, and no sign in page`,
  )
} catch (e) {
  ok("Apple accepts the Services ID and the return URL", false, String(e.message))
}

// ── 3. The secret, which is the only thing left ────────────────────────────
const secret = (process.env.APPLE_CLIENT_SECRET || process.argv[2] || "").trim()

if (!secret) {
  console.log(`
  ────────────────────────────────────────────────────────────────────────
  The steps above are everything that can be checked without the secret,
  and they are the steps that are working.

  WHAT IS LEFT is the token exchange, which is the only step that uses the
  client secret, and it is the step a failing Apple sign in is failing at.
  Run this again with it to find out why:

    APPLE_CLIENT_SECRET='eyJhbGci...' node scripts/check-apple-login.mjs

  Supabase → Authentication → Providers → Apple → "Secret Key (for OAuth)".
  It stays on this machine and is never printed.
  ────────────────────────────────────────────────────────────────────────
`)
  process.exit(failures ? 1 : 0)
}

const parts = secret.split(".")
if (parts.length !== 3) {
  ok("the secret is a JWT", false, "Apple's client secret has three dot-separated parts")
  process.exit(1)
}

/** base64url: base64 with two characters swapped and no padding. */
const decode = (seg) => {
  const b64 = seg.replace(/-/g, "+").replace(/_/g, "/")
  return JSON.parse(Buffer.from(b64 + "=".repeat((4 - (b64.length % 4)) % 4), "base64").toString("utf8"))
}

let header, claims
try {
  header = decode(parts[0])
  claims = decode(parts[1])
} catch {
  ok("the secret can be decoded", false, "copy the whole value, with no line breaks")
  process.exit(1)
}

const now = Math.floor(Date.now() / 1000)
const days = (s) => Math.round((s / 86400) * 10) / 10
const when = (u) => (Number.isFinite(u) ? new Date(u * 1000).toISOString().slice(0, 16).replace("T", " ") : "not set")

console.log(`
  algorithm     ${header.alg ?? "?"}
  key id        ${header.kid ?? "not set"}
  team          ${claims.iss ?? "not set"}
  signed for    ${claims.sub ?? "not set"}
  audience      ${claims.aud ?? "not set"}
  issued        ${when(Number(claims.iat))}
  expires       ${when(Number(claims.exp))}
`)

ok("it is signed the way Apple requires", header.alg === "ES256", header.alg ? `alg is ${header.alg}` : "no alg")
ok("it names the key it was signed with", typeof header.kid === "string" && header.kid.length > 0)
ok("it is addressed to Apple", claims.aud === "https://appleid.apple.com", claims.aud ? `aud is ${claims.aud}` : "no aud")
ok("it names an Apple Developer team", typeof claims.iss === "string" && claims.iss.length > 0)

/**
 * THE CHECK AN EXPIRY TEST MISSES.
 *
 * `sub` is the client this secret speaks for, and it has to be the SAME
 * client_id the browser was sent to Apple with. Mint it with the iOS app's
 * Bundle ID rather than the Services ID and everything looks right: the
 * authorize step above still passes, because that step never sees the
 * secret. Only the exchange fails, every time, for everyone.
 */
ok(
  "it was signed for the Services ID Supabase actually uses",
  claims.sub === clientId,
  claims.sub === clientId
    ? ""
    : `the secret is for "${claims.sub}" but Supabase sends "${clientId}" — Apple rejects every exchange`,
)

const exp = Number(claims.exp)
const iat = Number(claims.iat)
ok("it has an expiry", Number.isFinite(exp), "Apple rejects a secret with no exp")

if (Number.isFinite(exp)) {
  const left = exp - now
  ok("it has not expired", left > 0, left > 0 ? "" : `it expired ${days(-left)} days ago, so every Apple sign in is failing`)
  if (left > 0) ok(`it has over ${RENEW_WITHIN_DAYS} days left`, left > RENEW_WITHIN_DAYS * 86400, `${days(left)} days remaining`)
  if (Number.isFinite(iat)) {
    ok(
      "its lifetime is inside Apple's limit",
      exp - iat <= APPLE_MAX_LIFETIME,
      `${days(exp - iat)} of ${days(APPLE_MAX_LIFETIME)} days`,
    )
  }
}

if (failures) {
  console.log(`
  ${failures} to fix.

  TO MINT A NEW SECRET
    Apple Developer → Certificates, Identifiers & Profiles → Keys → the key
    with Sign in with Apple enabled. That is the .p8. Sign a JWT with it:

      header  { alg: "ES256", kid: <the key id> }
      claims  { iss: <team id>, iat: <now>, exp: <now + ${APPLE_MAX_LIFETIME}>,
                aud: "https://appleid.apple.com", sub: "${clientId}" }

    The sub is the SERVICES ID above, not the iOS app's Bundle ID. Paste the
    result into Supabase → Authentication → Providers → Apple → Secret Key
    (for OAuth), then run this again.
`)
  process.exit(1)
}

console.log(`\n  Every step checks out. Apple sign in has ${days(exp - now)} days before the secret must be replaced.\n`)
