/**
 * ===========================================================================
 *  THE KEY THAT IGNORES EVERY PERMISSION IN THE DATABASE
 * ===========================================================================
 * Supabase gives this project two keys. The ordinary one is the visitor's:
 * every query it makes is checked against row level security, and the rules
 * say a creator sees their own rows and nobody else's. The service role key
 * is the other one, and it is not checked against anything. It reads and
 * writes every row in every table for everyone.
 *
 * Some routes genuinely need it. A webhook from Stripe arrives with no
 * session at all; a buyer following a receipt link has no account; a cron
 * job runs at four in the morning with nobody signed in. In all of those the
 * database cannot work out who is asking, so the route has to.
 *
 * WHICH MAKES THE ROUTE THE ONLY THING STANDING THERE. With the ordinary key
 * a forgotten `.eq("creator_id", …)` returns nothing, because the policy
 * catches it. With this key the same forgotten line returns everybody's. One
 * hundred and twenty-two files hold it, and a rule that lives in somebody's
 * memory does not survive one hundred and twenty-two files.
 *
 * So each one has to show, in its own source, how it decides who is asking:
 * a session, a creator lookup, an RLS-backed helper, the admin password, or
 * a shared secret. Anything that cannot is named below with the reason it is
 * open, and a new route that is neither fails this suite rather than
 * shipping. The list is deliberately tedious to add to.
 *
 * This is a static check and it knows it. It cannot tell a correct ownership
 * filter from a wrong one — it can only tell that the question was asked at
 * all, which is the failure mode that actually happens.
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`) }
}

/** How a route may establish who is asking. */
const PROOFS: [string, RegExp][] = [
  ["a signed-in session", /auth\.getUser\(\)/],
  ["the creator behind the session", /currentCreatorId\(\)/],
  ["a helper that leaves the decision to RLS", /\b(resolveSite|getSite)\(/],
  ["the admin password", /isAdminAuthenticated/],
  ["a shared secret, failing closed", /requireBearerSecret\(/],
  ["a signature on the payload", /constructEvent|HOOK_SECRET/],
  /* An agent connected to one site: its token, hashed, looked up, revocable.
     See lib/agent-access/tokens.ts. */
  ["a site connection token", /await authenticateAgent\(request\)/],
]

/**
 * ROUTES THAT ANSWER SOMEBODY WITH NO ACCOUNT, and why each one is allowed
 * to. Every entry here was read. The reason is the point of the entry: a
 * line with no reason is a line nobody checked.
 *
 * What they have in common is that the thing identifying the caller is not a
 * session — it is an unguessable token in the URL, a Stripe payment intent,
 * or nothing at all because the route only writes a counter or reads what is
 * already public.
 */
const PUBLIC_BY_DESIGN: Record<string, string> = {
  // Sign-up and password recovery: the caller has no session yet, by definition.
  "auth/account-origin/route.ts": "answers how an email address signed up, before there is a session",
  "auth/complete-reset-password/route.ts": "carries the reset token, which is the credential",
  "auth/confirm-email/route.ts": "carries the confirmation token",
  "auth/exchange-reset-code/route.ts": "carries the one-time code",
  "auth/request-password-reset/route.ts": "takes an email and sends a link; it tells the caller nothing",
  "auth/signup-guard/route.ts": "runs during sign-up, before an account exists",
  "auth/validate-reset-token/route.ts": "carries the reset token",
  "auth/verify-email/route.ts": "carries the verification token",

  // Buyers. A buyer does not have an account on this platform.
  "checkout/complete/route.ts": "keyed by the Stripe payment intent, which the buyer alone holds",
  "checkout/confirm-payment/route.ts": "keyed by the Stripe payment intent",
  "receipt/[token]/assets/route.ts": "the receipt token in the path is the credential",
  "receipt/resend/route.ts": "the receipt token is the credential",
  "receipt/update-email/route.ts": "the receipt token is the credential",
  "receipt/view/route.ts": "the receipt token is the credential",
  "onepage/download/route.ts": "the download token is the credential",
  "onepage/download/[token]/route.ts": "the download token is the credential",
  "coupons/validate/route.ts": "a buyer checking a code at checkout, and it answers yes or no",
  "coupons/[id]/use/route.ts": "records a redemption made during a checkout",

  // Email, opened in a mail client with no cookies.
  "email/click/route.ts": "a link in a sent email, keyed by its own token",
  "email/track/route.ts": "the open pixel in a sent email",
  "email/unsubscribe/route.ts": "the unsubscribe link, which must work without signing in",

  // Writes that only ever add a row for the visitor in front of it.
  "subscribe/route.ts": "a visitor subscribing to a creator from a public page",
  "subscribers/route.ts": "the same, from the storefront",
  "website-builder/subscribe/route.ts": "the same, from a built site",
  "onepage/email-capture/route.ts": "a visitor leaving their email on a public page",
  "track-view/route.ts": "increments a view counter",
  "track-event/route.ts": "records an anonymous event",
  "blog/track/route.ts": "records a blog page view",

  // Reads of things that are already public.
  "reviews/stats/route.ts": "the rating shown on a public product page",
  "domains/resolve/route.ts": "maps a public hostname to the site it serves",
  "v2/search/route.ts": "public search over published products",
  "website-builder/search/route.ts": "public search inside a published site",
}

function routeFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) routeFiles(p, out)
    else if (name === "route.ts" || name === "route.tsx") out.push(p)
  }
  return out
}

function main() {
  const root = join(process.cwd(), "app/api")
  const holders = routeFiles(root)
    .map((p) => ({ rel: p.slice(root.length + 1), src: readFileSync(p, "utf8") }))
    .filter((f) => /createAdminClient/.test(f.src))
    .sort((a, b) => a.rel.localeCompare(b.rel))

  console.log(`\n${holders.length} routes hold the key that bypasses row level security`)

  const unproven: string[] = []
  for (const f of holders) {
    if (PROOFS.some(([, re]) => re.test(f.src))) continue
    unproven.push(f.rel)
  }

  const undeclared = unproven.filter((r) => !(r in PUBLIC_BY_DESIGN))
  check(
    "every one of them either establishes who is asking, or is listed here as public",
    undeclared.length === 0,
    undeclared.length
      ? `not accounted for: ${undeclared.join(", ")} — add a caller check, or an entry in PUBLIC_BY_DESIGN saying why it is open`
      : undefined,
  )

  /* And the list does not get to keep names that no longer need to be on it. */
  const stale = Object.keys(PUBLIC_BY_DESIGN).filter((r) => !unproven.includes(r))
  check(
    "and the list holds no route that has since grown a check",
    stale.length === 0,
    stale.length ? `now proven, so remove from PUBLIC_BY_DESIGN: ${stale.join(", ")}` : undefined,
  )
  check(
    "with a reason against every name on it",
    Object.values(PUBLIC_BY_DESIGN).every((why) => why.trim().length > 12),
  )

  console.log(`  ${holders.length - unproven.length} prove it in source, ${unproven.length} are public by design`)

  console.log("\nA secret that was never configured refuses everybody")

  /*
    ═══════════════════════════════════════════════════════════════════════
     THE TWO SHAPES THAT LET STRANGERS IN
    ═══════════════════════════════════════════════════════════════════════
    Six of the seven routes guarded by a bearer token were written one of
    these two ways.

      if (secret && header !== `Bearer ${secret}`) return 401

    skips the whole guard when there is no secret set, so a deployment
    missing the variable serves the route to anyone who finds it.

      if (header !== `Bearer ${process.env.CRON_SECRET}`) return 401

    is worse, because with the variable unset it compares against the string
    "Bearer undefined" — which is then a working password.

    lib/api/require-secret.ts is the one guard now, and it refuses when the
    variable is missing.
  */
  const inline: string[] = []
  const failOpen: string[] = []
  for (const p of routeFiles(root)) {
    const src = readFileSync(p, "utf8")
    const rel = p.slice(root.length + 1)
    const strip = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
    if (/if \(\s*\w*[Ss]ecret && /.test(strip)) failOpen.push(rel)
    if (/!==\s*`Bearer \$\{process\.env\./.test(strip)) inline.push(rel)
  }

  check(
    "no route skips its guard when the variable is missing",
    failOpen.length === 0,
    failOpen.length ? `\`if (secret && …)\` in: ${failOpen.join(", ")}` : undefined,
  )
  check(
    "and none compares against a template that reads \"Bearer undefined\"",
    inline.length === 0,
    inline.length ? `in: ${inline.join(", ")}` : undefined,
  )

  const helper = readFileSync(join(process.cwd(), "lib/api/require-secret.ts"), "utf8")
  check(
    "the shared guard refuses before it compares",
    /if \(!expected\) \{[\s\S]{0,400}status: 401/.test(helper),
  )
  check(
    "and compares in constant time",
    /timingSafeEqual/.test(helper),
  )
  check(
    "the admin client is still server-only, so none of this can be reached from a browser",
    /^import "server-only"$/m.test(readFileSync(join(process.cwd(), "lib/supabase/admin.ts"), "utf8")),
  )

  console.log("\nAnd a link whose token IS the credential does not leak it in a Referer header")

  /*
    Most of the public routes above are reached by a link whose token is the
    whole of the credential: a receipt, a download, an unsubscribe. A page
    opened at such a URL sends that URL to any third party it then loads or
    links to, in the Referer header, unless it is told not to. Modern
    browsers default to this policy, which is a reason to set it rather than
    a reason not to: a default is not a guarantee, and the value of what is
    in these URLs does not depend on the visitor's browser version.
  */
  const vercel = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8"))
  const headers = (vercel.headers ?? []).flatMap((h: { headers?: { key: string; value: string }[] }) => h.headers ?? [])
  const named = Object.fromEntries(headers.map((h: { key: string; value: string }) => [h.key, h.value]))
  check("the referrer is trimmed to the origin when it crosses one",
    named["Referrer-Policy"] === "strict-origin-when-cross-origin",
    `got ${named["Referrer-Policy"] ?? "nothing"}`)
  check("the site still cannot be framed", named["X-Frame-Options"] === "DENY")
  check("and a file is served as the type it was stored as", named["X-Content-Type-Options"] === "nosniff",
    "an uploaded file sniffed as HTML is script on this origin")

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
