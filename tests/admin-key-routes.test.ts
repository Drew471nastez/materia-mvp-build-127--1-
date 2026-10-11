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
  /* lib/auth/current-user.ts: getUser(), with "Supabase did not answer" kept
     apart from "nobody is signed in". A route that uses it acts only on
     `current.user`, which is null in both. */
  ["a signed-in session, classified", /await readCurrentUser\(supabase\)[\s\S]*if \(!(current\.)?user\b/],
  ["the creator behind the session", /currentCreatorId\(\)/],
  ["a helper that leaves the decision to RLS", /\b(resolveSite|getSite)\(/],
  /* requireAdmin() in lib/admin/gate.ts is isAdminAuthenticated with the 401 attached. */
  ["the admin password", /isAdminAuthenticated|await requireAdmin\(\)/],
  ["a shared secret, failing closed", /requireBearerSecret\(/],
  ["a signature on the payload", /constructEvent|HOOK_SECRET/],
  /* app/api/payments/airwallex/webhook: x-timestamp and x-signature, HMAC over the raw body, before anything is parsed. */
  ["Airwallex's signature on the payload", /verifyAirwallexSignature\(\{\s*rawBody: raw,/],
  /* An agent connected to one site: its token, hashed, looked up, revocable.
     See lib/agent-access/tokens.ts. */
  ["a site connection token", /await authenticateAgent\(request\)/],
  /* The signed-in creator's own site: lib/github-sync/own-install.ts reads
     the session with auth.getUser() and the install by creator. */
  ["the signed-in creator's own site", /await ownInstall\(/],
  /* GitHub's HMAC over the exact body, checked before the body is parsed. */
  ["GitHub's signature on the payload", /verifySignature\(raw, req\.headers\.get\("x-hub-signature-256"\)/],
  /* lib/automations/flow-io.ts: auth.getUser(), then the creator by user id,
     and every flow read by that creator id. */
  ["the signed-in creator, for an automation", /await signedInCreator\(\)[\s\S]*\.eq\("creator_id", me\.creatorId\)/],
  /* lib/courses/route-auth.ts: auth.getUser(), then lib/courses/access decides
     from that id what the caller may have (a creator, a buyer, or a visitor who
     gets only a published course's free preview lessons). The stop link in a
     course email is signed over its enrollment id (lib/email-campaigns/link-sign). */
  ["the signed-in person, for a course", /await sessionUserId\(\)[\s\S]*(lessonContext|productAccess|ownerOf|verifyLink|\.eq\("buyer_id", userId\))/],
  /* lib/memberships/viewer.ts: auth.getUser() as a member; the route answers 401 without one and checks the membership is theirs. */
  ["a signed-in member", /await requestViewer\(\)[\s\S]*if \(!viewer\)/],
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
  "payouts-sheet/route.ts": "the apps' browser sheet has no session: the caller is a thirty minute HMAC link signed for one creator by the signed-in /api/payments/app-sheet, checked and the creator re-read before an Account Session is opened, rate limited",
  "site-theme/assets/[installId]/[version]/[...name]/route.ts": "an imported Shopify theme's own stylesheets, scripts, icons and fonts, which its website sends every visitor; read from any origin because the builder draws the theme in a sandboxed frame with none",
  "health/route.ts": "the uptime check: answers whether the database and the scheduled jobs are working, names jobs and ages, never data",
  "auth/unconfirmed-account/route.ts": "the login page's way to /signup/verify: answers an id only when Supabase says the password is right and the address is unconfirmed, rate limited",
  "auth/complete-reset-password/route.ts": "carries the reset token, which is the credential",
  "auth/confirm-email/route.ts": "carries the confirmation token",
  "auth/exchange-reset-code/route.ts": "carries the one-time code",
  "auth/request-password-reset/route.ts": "takes an email and sends a link; it tells the caller nothing",
  "auth/signup-guard/route.ts": "runs during sign-up, before an account exists",
  "auth/validate-reset-token/route.ts": "carries the reset token",
  "auth/verify-email/route.ts": "carries the verification token",

  // Buyers. A buyer does not have an account on this platform.
  "checkout/confirm-payment/route.ts": "keyed by the Stripe payment intent and its client secret, which only the paying page holds",
  "payments/airwallex/return/route.ts": "keyed by the Airwallex payment intent and its client secret, which only the paying tab holds (lib/payments/checkout)",
  "checkout/invoice/route.ts": "the receipt token is the credential",
  "checkout/site/route.ts": "a website's own checkout, a buyer paying (who may be a guest): only on a host that is a creator's published website, whose shop it is (siteOfRequest, from the database), every price the server's and another shop's products refused; an account first comes from the website's own signed session cookie when the store asks for one; the payment is confirmed with its client secret, which only the paying page holds; rate limited like the other payment routes",
  "receipt/[token]/assets/route.ts": "the receipt token in the path is the credential",
  "receipt/view/route.ts": "the receipt token is the credential",
  "receipt/contact/route.ts": "the receipt token and order id are the credential; it only writes to the seller, Reply-To the order's own address, rate limited",
  "onepage/download/route.ts": "the download token is the credential",
  "onepage/download/[token]/route.ts": "the download token is the credential",
  "coupons/validate/route.ts": "a buyer checking a code at checkout, and it answers yes or no",
  "physical/checkout/complete/route.ts": "Stripe's return after paying for a physical order: keyed by the Checkout Session id, which Stripe re-reads and must be paid; it only writes that session's own order once (lib/physical/checkout-server)",
  "physical/order-status/[token]/return/route.ts": "a buyer asking to return items: the order's random receipt token is the credential, rate limited; it only opens a return request the shop then approves",
  "physical/storefront/shop/route.ts": "what a shop's own website already shows every visitor about delivery and returns (whether returns are taken, their window, the order value that ships free); no rates, locations or addresses; ?mine=1 checks the owner",
  "physical/storefront/product/route.ts": "a published physical product's options, prices and whether each can be bought, for its public page; never costs, SKUs, locations or exact stock",
  "order-help/route.ts": "a buyer opens a case about their order with the order's own receipt token, the key they already hold; the buyer's email comes from the order, never the request, and it is rate limited by address and by email",
  "order-help/[id]/route.ts": "a buyer reads and writes their own case with its private link's secret, checked against the stored hash; nothing is read or written without it",
  "offers/bundles/route.ts": "the bundles a published product is in, with each item's public title, picture and price, for its public page; only a store's active offers and published products, and the checkout prices the cart again on the server",
  "memberships/confirm/route.ts": "after joining: the subscription's own current client secret, which only the paying page holds, is the credential; it only brings the row up to date from Stripe, rate limited",

  // Email, opened in a mail client with no cookies.
  "email/click/route.ts": "a link in a sent email, keyed by its own token",
  "email/track/route.ts": "the open pixel in a sent email",
  "email/unsubscribe/route.ts": "the unsubscribe link, which must work without signing in",
  "memberships/unsubscribe/route.ts": "the link in a creator's update email to members: the signed token names one membership and only turns its post emails off or on",
  "notify/unsubscribe/route.ts": "Storelib's own unsubscribe link: the signed token names the person and the category, and the page never shows an address",
  "automations/t/o/route.ts": "the open pixel in an automated email, keyed by its send's random token; it only ever sets opened_at once",
  "automations/t/c/route.ts": "a link in an automated email: the target is signed with the send's token, so it redirects only where the email said",

  // Writes that only ever add a row for the visitor in front of it.
  "subscribe/route.ts": "a visitor subscribing to a creator from a public page",
  "subscribers/route.ts": "the same, from the storefront",
  "website-builder/subscribe/route.ts": "the same, from a built site",
  "newsletter/route.ts": "a visitor asking Storelib itself for news from the storelib.com footer; rate limited, and it tells the caller nothing about the list",
  "onepage/email-capture/route.ts": "a visitor leaving their email on a public page",
  "track-view/route.ts": "records a page view for a visitor with no session; the creator, product and property are checked against the database in lib/analytics/collect",
  "track-event/route.ts": "records an anonymous event, by the same pipeline and the same checks as a page view",
  "onepage/track/route.ts": "a OnePage link click from a visitor; whose OnePage it is comes from the onepages row, and the analytics copy goes through lib/analytics/collect",
  "blog/track/route.ts": "records a blog page view",
  "public/vitals/route.ts": "a published site's speed numbers from its visitors, for a published site only, validated, capped per site a day and limited per address",
  "perf/beacon/route.ts": "Storelib's own speed numbers from one page load in five, checked item by item (lib/perf/telemetry), capped per day by the database, limited per address, and answered 204 with nothing in it",
  "website-builder/contact/route.ts": "a visitor writing to a creator from a contact form on their website; a trap field, a timing check and the rate limiter per visitor, address and store, and it tells the caller nothing about the list",

  // A creator's website, signing a customer in with a credential of its own (lib/site-accounts).
  "site-account/code/route.ts": "a visitor asking a creator's website for a sign in code: same-origin forms only, the host must be a creator's published website, limited per address emailed, per visitor and per store, and it answers the same whether the email has an account there or not",
  "site-account/verify/route.ts": "the code emailed to the address is the credential: kept as an HMAC, ten minutes, five tries counted by a conditional update, used once, bound to the host, the creator and this browser's signed note; it makes a customer row for that website and nothing else",
  "site-account/profile/route.ts": "the website's own signed session cookie is the credential, for this host's creator, and the customer row must still be there; it changes that customer's name and nothing else",
  "site-account/wishlist/route.ts": "the website's own signed session cookie is the credential, for one host and one creator; without it the answer is signedIn false and nothing is read",
  "site-account/download/route.ts": "the website's own signed session cookie is the credential, for this host's creator; the order must have been placed with the email that session proved, on this website, and the file must be one its receipt lists, decided again by resolveDownloadAccess with the order's own token read on the server, under the download limits and the scan gate",
  "site-account/delete/route.ts": "the website's own signed session cookie is the credential, for this host's creator, from a same-origin form with confirm=delete; it deletes that customer's own account row (and what it saved) and nothing else, limited per customer",
  "site-password/route.ts": "a visitor typing a website's password on its password page (same-origin forms only, the host must be a creator's published website, limited per visitor and per website before any compare against the stored hash), or the owner's two minute signed note, spent once; it only ever sets a pass cookie for that host",

  // Reads of things that are already public.
  "reviews/stats/route.ts": "the rating shown on a public product page",
  "reviews/breakdown/route.ts": "the star counts under a public product's rating, from published reviews only, no names or text",
  "reviews/request/route.ts": "Storelib Reviews: a review from the request email's link, which is the credential (an HMAC of one order line's request, lib/reviews/request-token); the order is read again and must still be paid, limited per address",
  "reviews/site/route.ts": "Storelib Reviews: a visitor's review on a website whose store lets anyone write, checked against that store's own settings; one answer whatever address is typed, nothing posted until the emailed link is confirmed, never verified, a hidden field and limits per address, per email and per store, the address kept server only",
  "reviews/confirm/route.ts": "Storelib Reviews: the confirm link emailed to the address typed into a website review form; the HMAC token signed for one held review is the proof, it posts that review once, unverified, rate limited per address",
  "reviews/photo/route.ts": "Storelib Reviews: a photo for a review, with the request link as its credential or for a store that lets anyone write; a picture by its bytes, the picture reader and the malware scan, limited per address",
  "domains/resolve/route.ts": "maps a public hostname to the site it serves",
  "v2/search/route.ts": "public search over published products",
  "website-builder/search/route.ts": "public search inside a published site",
  "profile/activity/route.ts": "a person's public activity on their profile (lib/profile/activity.ts reads only public communities, open spaces, published reviews and products), nothing when they hid it unless the session is theirs; limited per address",
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
