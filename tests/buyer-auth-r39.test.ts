/**
 * ===========================================================================
 *  ROUND 39: SIGNING IN FROM A RECEIPT, AND A GUEST KEEPING WHAT THEY BOUGHT
 * ===========================================================================
 * The owner: from a receipt, Create account or Sign in came back "not fully
 * logged in" (the page still said Sign in, the header and Library sent them
 * to sign in again), Create account with an address that had an account
 * ended on "Welcome back" with nothing said, and a guest who bought and came
 * back to the product was asked to buy it again. Held here:
 *
 *   RETURN       every way back is a path here or storelib.com (no open
 *                redirect), the receipt's links carry it, sign up hands it to
 *                sign in, the verify step keeps it, the library's gate too
 *   EXISTS       sign up moves an existing address to sign in, filled in,
 *                saying why; the look up is rate limited; no claim before the
 *                address is verified
 *   CLAIM        a guest's orders join the account at /auth/continue, only
 *                after the address is verified, only that exact address,
 *                once, paid lines granted, refunded ones only recorded; an
 *                unconfirmed account collects nothing at checkout either;
 *                the library's automatic claim wants the same address
 *   COOKIE       the guest grant: signed per order with its token, a year,
 *                tampering, another order's token, expiry, junk, the cap,
 *                refunds closing it, httpOnly + Secure + Lax
 *   DOWNLOAD     a grant opens the file of its product and nothing else, by
 *                the same rule as the receipt link
 *   PAGES        the receipt's doors (Sign in when the address has an
 *                account, Create account only when not, links to Storelib on
 *                a creator's website), the product page owned for a guest,
 *                the /p page no longer shared by a CDN
 *   HEADER       sign out reaches every reader at once, a failed profile read
 *                still says signed in, and a page drawn for the other answer
 *                asks again (viewerSyncMove)
 *
 * Run with: npx tsx --conditions=react-server tests/buyer-auth-r39.test.ts
 */
import { readCode, readSource } from "./_source"
import { fakeDb } from "./_fake-db"
import { safeNext, readCarry, withCarry } from "@/lib/auth/continue"
import { EXISTING_EMAIL_KEY, EXISTS_PARAM, signInInsteadHref, takeExistingEmail } from "@/lib/auth/existing-account"
import { viewerSyncMove } from "@/lib/auth/viewer-sync"
import {
  GRANT_TTL_SECONDS,
  GUEST_ACCESS_COOKIE,
  MAX_GRANTS,
  grantHolds,
  guestAccessCookieOptions,
  guestAccessFromCookieHeader,
  guestAccessKey,
  mergeGrants,
  readGrants,
  requestIsHttps,
  signGrant,
  withoutOrders,
  writeGrants,
} from "@/lib/receipts/guest-access"
import { heldGrants } from "@/lib/receipts/guest-access-server"
import { attachGuestOrdersByEmail, normaliseEmail, verifiedAccountForEmail } from "@/lib/orders/attach-guest-orders"
import { resolveDownloadAccess } from "@/lib/receipts/download-access"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail)?.slice(0, 400)}`}`)
  }
}
const section = (name: string) => console.log(`\n${name}`)

const MAIN = "storelib.com"
const KEY = guestAccessKey({ GUEST_ACCESS_SECRET: "a-test-secret-that-is-long-enough" })!
const ORDER_A = "11111111-1111-4111-8111-111111111111"
const ORDER_B = "22222222-2222-4222-8222-222222222222"
const ORDER_C = "33333333-3333-4333-8333-333333333333"
const TOKEN_A = "tokA_tokA_tokA_tokA_tokA_tokA_12"
const TOKEN_B = "tokB_tokB_tokB_tokB_tokB_tokB_12"
const TOKEN_C = "tokC_tokC_tokC_tokC_tokC_tokC_12"
const PRODUCT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const OTHER_PRODUCT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const ASSET = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
const OTHER_ASSET = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"

function memoryStorage() {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m }
}

async function main() {
  section("RETURN: where a sign in started is where it ends, and only ever here")
  check("the receipt is a target", safeNext("/receipt/abcdefghijklmnop1234", MAIN) === "/receipt/abcdefghijklmnop1234")
  check("a product page is a target", safeNext("/maria/preset-pack", MAIN) === "/maria/preset-pack")
  check("another site is not", safeNext("https://evil.example/receipt/x", MAIN) === null)
  check("a protocol relative address is not", safeNext("//evil.example", MAIN) === null && safeNext("/\\evil.example", MAIN) === null)
  check("an address dressed as ours is not", safeNext("https://storelib.com.evil.example/", MAIN) === null && safeNext("https://storelib.com@evil.example/", MAIN) === null)
  check("javascript: is not", safeNext("javascript:alert(1)", MAIN) === null)
  check("the sign in screens are not (a loop)", safeNext("/login?next=/x", MAIN) === null && safeNext("/signup", MAIN) === null)
  check("the receipt's old `redirect` name is read as next", readCarry(new URLSearchParams("redirect=%2Freceipt%2Fabcdefghijklmnop1234"), MAIN).next === "/receipt/abcdefghijklmnop1234")
  {
    const store = memoryStorage()
    const href = signInInsteadHref("  Ghita@Example.com ", { intent: null, next: "/receipt/abcdefghijklmnop1234" }, store)
    const u = new URL(href, "https://storelib.com")
    check("sign up hands an existing address to /login, the receipt kept", u.pathname === "/login" && u.searchParams.get(EXISTS_PARAM) === "1" && u.searchParams.get("next") === "/receipt/abcdefghijklmnop1234", href)
    check("  the address goes in this tab's storage, never the URL", !/ghita/i.test(href) && store.m.get(EXISTING_EMAIL_KEY) === "ghita@example.com")
    check("  read once by the login page", takeExistingEmail(store) === "ghita@example.com" && takeExistingEmail(store) === null)
    store.setItem(EXISTING_EMAIL_KEY, "<script>")
    check("  and only if it is an address", takeExistingEmail(store) === null)
  }
  const signup = readCode("app/(auth)/signup/page.tsx")
  const login = readCode("app/(auth)/login/page.tsx")
  const receiptView = readCode("app/receipt/[token]/receipt-view.tsx")
  const receiptPage = readCode("app/receipt/[token]/page.tsx")
  check("an old receipt link (claim=1&receiptToken) comes back to its receipt", /legacyReceipt = searchParams\.get\("claim"\) === "1"/.test(signup) && /carry\.next = `\/receipt\/\$\{legacyReceipt\}`/.test(signup))
  check("the receipt's links carry it as the page to come back to", /`\$\{authBase\}\/signup\?redirect=\$\{encodeURIComponent\(receiptPath\)\}`/.test(receiptView) && /`\$\{authBase\}\/login\?redirect=\$\{encodeURIComponent\(receiptPath\)\}`/.test(receiptView))
  check("  and no longer the claim and token for the sign up form to act on", !/autoBuyer=1&claim=1&receiptToken/.test(receiptView))
  check("sign up always goes through the email code, with the carry", /withCarry\(\s*`\/signup\/verify\?userId=\$\{data\.user\.id\}/.test(signup))
  check("the library's verify gate keeps the way back", /\/signup\/verify\?userId=\$\{user\.id\}&email=\$\{encodeURIComponent\(user\.email \|\| ""\)\}&next=\$\{encodeURIComponent\(LIBRARY_HOME\)\}/.test(readCode("app/account/library/layout.tsx")))
  check("withCarry adds next beside what the path had", withCarry("/login?exists=1", { next: "/x" }) === "/login?exists=1&next=%2Fx")

  section("EXISTS: Create account with an address that has an account is a sign in, and says so")
  check("sign up asks before it makes anything, and moves to sign in", /if \(origin\?\.exists\) \{[\s\S]{0,900}switchToSignIn\(email\)\s*return/.test(signup))
  check("  Supabase's own 'already registered' takes the same move", /failure\.code === "wrong_method"\) \{[\s\S]{0,200}switchToSignIn\(trimmedEmail\)/.test(signup))
  check("  a refusal of the look up (429) is said, not taken as a new address", /res\.status === 429/.test(signup) && /origin\?\.limited/.test(signup))
  check("sign up never claims an order before the address is verified", !/\/api\/purchases\/claim/.test(signup))
  check("login fills in the address and says why it is a sign in", /searchParams\.get\(EXISTS_PARAM\) === "1"/.test(login) && /takeExistingEmail\(\)/.test(login) && /already has a Storelib account\. Sign in to continue\./.test(readSource("app/(auth)/login/page.tsx")))
  check("  and asks the address's way in at once", /if \(existingEmail && email === existingEmail && !showPasswordField\) void askWayIn\(existingEmail\)/.test(login))
  check("  the heading is Sign in there, not Welcome back", /cameFromSignUp && !inviteEmail \? "Sign in" : "Welcome back"/.test(readSource("app/(auth)/login/page.tsx")))
  const origin = readCode("app/api/auth/account-origin/route.ts")
  check("whether an address has an account is rate limited, per caller and per address", /bucket: "account-origin"/.test(origin) && /subjects: \[addressSubject\(request\), emailSubject\(email\)\]/.test(origin) && /if \(limited\) return limited/.test(origin))
  check("  before any user is looked up", origin.indexOf("if (limited) return limited") < origin.indexOf("findAuthUserByEmail(adminSupabase, email)"))

  section("CLAIM: a guest's orders join the account once its address is verified")
  {
    const tables = {
      profiles: [
        { id: "u-verified", email: "ghita@example.com", email_verified: true },
        { id: "u-unverified", email: "squatter@example.com", email_verified: false },
      ],
      products: [{ id: PRODUCT, creator_id: "creator-1" }, { id: OTHER_PRODUCT, creator_id: "creator-1" }],
      orders: [
        { id: ORDER_A, product_id: PRODUCT, variant_id: null, status: "completed", amount_cents: 900, buyer_email: "ghita@example.com", buyer_id: null, receipt_token: TOKEN_A },
        { id: ORDER_B, product_id: OTHER_PRODUCT, variant_id: "v-1", status: "refunded", amount_cents: 500, refund_amount_cents: 500, buyer_email: "ghita@example.com", buyer_id: null, receipt_token: TOKEN_B },
        { id: ORDER_C, product_id: PRODUCT, variant_id: null, status: "completed", amount_cents: 900, buyer_email: "ghita@example.com", buyer_id: "u-someone-else", receipt_token: TOKEN_C },
        { id: "44444444-4444-4444-8444-444444444444", product_id: PRODUCT, variant_id: null, status: "completed", amount_cents: 900, buyer_email: "ghitaXexample.com", buyer_id: null, receipt_token: "tokD_tokD_tokD_tokD_tokD_tokD_12" },
        { id: "55555555-5555-4555-8555-555555555555", product_id: PRODUCT, variant_id: null, status: "completed", amount_cents: 900, buyer_email: "other@example.com", buyer_id: null, receipt_token: "tokE_tokE_tokE_tokE_tokE_tokE_12" },
      ],
      entitlements: [] as any[],
    }
    /*
      Changed on purpose (round rel-security): an attach also asks Supabase Auth
      that the account's CURRENT address is the one it proved (lib/auth/
      verified-email.ts), so the fake has the auth users too. tests/auth-email-code
      covers an account whose address changed after it was proven.
    */
    const authUsers: Record<string, any> = {
      "u-verified": { id: "u-verified", email: "ghita@example.com", app_metadata: { verified_email: "ghita@example.com" }, identities: [] },
      "u-unverified": { id: "u-unverified", email: "squatter@example.com", app_metadata: {}, identities: [] },
    }
    const db = Object.assign(fakeDb(tables as any), {
      auth: { admin: { getUserById: async (id: string) => ({ data: { user: authUsers[id] ?? null }, error: authUsers[id] ? null : { message: "not found" } }) } },
    })
    const { attached } = await attachGuestOrdersByEmail(db as any, { id: "u-verified", email: "Ghita@Example.com" })
    check("every guest order of that exact address is attached", attached.sort().join() === [ORDER_A, ORDER_B].sort().join(), attached)
    check("  never another account's order", tables.orders.find((o) => o.id === ORDER_C)!.buyer_id === "u-someone-else")
    check("  never another address, nor one a wildcard would match", tables.orders.filter((o) => o.buyer_id === "u-verified").length === 2)
    check("  the paid line is granted, with its variant", tables.entitlements.some((e) => e.buyer_id === "u-verified" && e.product_id === PRODUCT && e.variant_id === null))
    check("  a refunded line is attached for the record and grants nothing", !tables.entitlements.some((e) => e.product_id === OTHER_PRODUCT))
    const again = await attachGuestOrdersByEmail(db as any, { id: "u-other", email: "ghita@example.com" })
    check("  once: a second account with the address attaches nothing more", again.attached.length === 0 && tables.orders.find((o) => o.id === ORDER_A)!.buyer_id === "u-verified")
    check("  every order read is the address's own, an equality read the index answers", db.log.some((l) => l.table === "orders" && l.op === "select" && l.filters.some(([k, c, v]) => k === "eq" && c === "buyer_email" && v === "ghita@example.com")))
    check("an account whose address is confirmed is found", (await verifiedAccountForEmail(db as any, " GHITA@example.com")) === "u-verified")
    check("  one made with somebody's address and never confirmed collects nothing", (await verifiedAccountForEmail(db as any, "squatter@example.com")) === null)
    check("  nor an address with no account, nor junk", (await verifiedAccountForEmail(db as any, "nobody@example.com")) === null && (await verifiedAccountForEmail(db as any, "not an email")) === null)
    check("addresses are compared trimmed and lower case", normaliseEmail("  A@B.co ") === "a@b.co" && normaliseEmail("a b@c.d") === null)
  }
  const cont = readCode("app/auth/continue/route.ts")
  check("/auth/continue attaches a guest's orders", /attachGuestOrdersByEmail\(createAdminClient\(\), \{ id: user\.id, email: user\.email \}\)/.test(cont))
  check("  only after the address is known to be verified", cont.indexOf("email_verified") > 0 && cont.indexOf("email_verified") < cont.indexOf("attachGuestOrdersByEmail("))
  check("  bounded, so a slow database never holds a sign in", /Promise\.race\(\[\s*attachGuestOrdersByEmail/.test(cont) && /ATTACH_WAIT_MS = 2500/.test(cont))
  check("checkout attaches only to a confirmed account, both fulfilments",
    /verifiedAccountForEmail\(admin, g\.email\)/.test(readCode("lib/checkout/fulfil-payment.ts")) && (readCode("lib/checkout/fulfil-cart-session.ts").match(/verifiedAccountForEmail\(admin, buyerEmail\)/g) ?? []).length === 2)
  const claim = readCode("app/api/purchases/claim/route.ts")
  check("the library's automatic claim asks for the same address", /match: "email"/.test(readCode("components/checkout/purchase-sync-provider.tsx")) && /sameEmailOnly && normaliseEmail\(order\.buyer_email\) !== normaliseEmail\(user\.email\)/.test(claim))
  check("  a claim by a browser's grant takes only an order that grant holds", /held\.open\.find\(\(o\) => String\(o\.id\)\.toLowerCase\(\) === String\(orderId\)\.toLowerCase\(\)\)/.test(claim))
  check("  and claiming is rate limited", /bucket: "purchase-claim"/.test(claim))

  section("COOKIE: what a guest's browser keeps, signed, a year, and only while it is paid")
  {
    const now = Date.UTC(2026, 9, 22)
    const g = signGrant(KEY, { id: ORDER_A, receiptToken: TOKEN_A }, now)!
    check("a grant is made for one order", !!g && g.orderId === ORDER_A && g.sig.length === 32)
    check("  for a year", g.exp === Math.floor(now / 1000) + GRANT_TTL_SECONDS && GRANT_TTL_SECONDS === 365 * 86400)
    check("  holds for that order's token", grantHolds(KEY, g, TOKEN_A, now))
    check("  not for another order's token", !grantHolds(KEY, g, TOKEN_B, now))
    check("  not with the order id swapped", !grantHolds(KEY, { ...g, orderId: ORDER_B }, TOKEN_A, now))
    check("  not with the expiry pushed out", !grantHolds(KEY, { ...g, exp: g.exp + 86400 }, TOKEN_A, now))
    check("  not signed with another key", !grantHolds(guestAccessKey({ GUEST_ACCESS_SECRET: "another-secret-that-is-long-enough" })!, g, TOKEN_A, now))
    check("  not once it has run out", !grantHolds(KEY, g, TOKEN_A, (g.exp + 1) * 1000))
    check("  not without a token", !grantHolds(KEY, g, null, now) && !grantHolds(KEY, g, "short", now))
    check("no key, no grants (a deployment without a secret remembers nothing)", guestAccessKey({}) === null && guestAccessKey({ SUPABASE_SERVICE_ROLE_KEY: "short" }) === null)
    check("  the key is derived, never the service key itself", guestAccessKey({ SUPABASE_SERVICE_ROLE_KEY: "x".repeat(40) })!.toString("utf8") !== "x".repeat(40))
    const raw = writeGrants([g])
    check("the cookie round trips", readGrants(raw).length === 1 && readGrants(raw)[0].sig === g.sig)
    check("  junk, a duplicate and a hostile value are dropped", readGrants(`${raw}~${raw}~nope~<script>~${ORDER_B}.123.abc`).length === 1)
    check("  an oversized cookie is not read", readGrants("x".repeat(9000)).length === 0)
    const many = Array.from({ length: 40 }, (_, i) => signGrant(KEY, { id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, receiptToken: TOKEN_A }, now)!)
    const merged = mergeGrants(many.slice(0, 35), [g], now)
    check(`  capped at ${MAX_GRANTS}, newest first`, merged.length === MAX_GRANTS && merged[0].orderId === ORDER_A)
    check("  an expired grant is dropped on the next write", mergeGrants([{ ...g, exp: Math.floor(now / 1000) - 1 }], [], now).length === 0)
    check("  a grant for an order seen refunded can be dropped", withoutOrders([g], [ORDER_A.toUpperCase()]).length === 0)
    const opts = guestAccessCookieOptions(true)
    check("the cookie is httpOnly, Secure, SameSite=Lax, path /, a year", opts.httpOnly === true && opts.secure === true && opts.sameSite === "lax" && opts.path === "/" && opts.maxAge === GRANT_TTL_SECONDS)
    check("  host only: no Domain, so a creator's site never reads storelib.com's", !("domain" in opts))
    check("  read back from a Cookie header", guestAccessFromCookieHeader(`a=1; ${GUEST_ACCESS_COOKIE}=${encodeURIComponent(raw)}; b=2`) === raw && guestAccessFromCookieHeader("a=1") === null)
    check("  https is read from the forwarded protocol", requestIsHttps(new Request("http://internal/x", { headers: { "x-forwarded-proto": "https" } })) && !requestIsHttps(new Request("http://localhost:3000/x")))

    const tables = {
      orders: [
        { id: ORDER_A, product_id: PRODUCT, variant_id: null, status: "completed", amount_cents: 900, buyer_email: "g@example.com", buyer_id: null, receipt_token: TOKEN_A },
        { id: ORDER_B, product_id: PRODUCT, variant_id: null, status: "refunded", amount_cents: 900, refund_amount_cents: 900, buyer_email: "g@example.com", buyer_id: null, receipt_token: TOKEN_B },
        { id: ORDER_C, product_id: OTHER_PRODUCT, variant_id: null, status: "completed", amount_cents: 900, buyer_email: "g@example.com", buyer_id: null, receipt_token: TOKEN_C },
      ],
    }
    const db = fakeDb(tables as any)
    const gB = signGrant(KEY, { id: ORDER_B, receiptToken: TOKEN_B }, now)!
    const gC = signGrant(KEY, { id: ORDER_C, receiptToken: TOKEN_C }, now)!
    const forged = { orderId: ORDER_C, exp: g.exp, sig: g.sig }
    const all = await heldGrants(db as any, writeGrants([g, gB]), { key: KEY, now })
    check("a held grant opens its paid order", all.open.length === 1 && all.open[0].id === ORDER_A)
    check("  a refund closes it at once, wherever the cookie is", all.stale.includes(ORDER_B))
    const one = await heldGrants(db as any, writeGrants([g, gC]), { key: KEY, now, productId: OTHER_PRODUCT })
    check("  narrowed to one product, it answers about that product only", one.open.length === 1 && one.open[0].id === ORDER_C)
    const fake = await heldGrants(db as any, writeGrants([forged]), { key: KEY, now })
    check("  a signature copied onto another order holds nothing", fake.open.length === 0 && fake.stale.includes(ORDER_C))
    const noKey = await heldGrants(db as any, writeGrants([g]), { key: null, now })
    check("  without a key nothing is held", noKey.open.length === 0)

    section("DOWNLOAD: a grant opens the file of its product, by the receipt's own rule")
    const files = fakeDb({
      ...tables,
      digital_assets: [
        { id: ASSET, product_id: PRODUCT, file_name: "a.pdf", file_path: "p/a.pdf", upload_status: "completed" },
        { id: OTHER_ASSET, product_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", file_name: "b.pdf", file_path: "p/b.pdf", upload_status: "completed" },
      ],
      products: [{ id: PRODUCT, creator_id: "creator-1" }, { id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", creator_id: "creator-1" }],
      product_variant_files: [],
    } as any)
    const ok = await resolveDownloadAccess(files as any, { assetId: ASSET, guestOrders: all.open })
    check("the file of the product the guest bought", ok.decision.ok === true && (ok.decision as any).via === "receipt" && ok.orderId === ORDER_A, ok.decision)
    const other = await resolveDownloadAccess(files as any, { assetId: OTHER_ASSET, guestOrders: all.open })
    check("  never a file of another product", other.decision.ok === false)
    const refunded = await resolveDownloadAccess(files as any, { assetId: ASSET, guestOrders: [{ ...tables.orders[1] }] as any })
    check("  a refunded order hands nothing over", refunded.decision.ok === false && (refunded.decision as any).reason === "refunded")
    const none = await resolveDownloadAccess(files as any, { assetId: ASSET })
    check("  and no grant, no receipt, no account is no file", none.decision.ok === false)
  }
  const download = readCode("app/api/download/[assetId]/route.ts")
  check("the download route reads the grant only when no receipt link was sent", /isPlausibleToken\(receiptToken\) \? \[\] : \(await heldGrants\(admin, guestAccessFromCookieHeader\(request\.headers\.get\("cookie"\)\)\)\)\.open/.test(download))
  const remember = readCode("app/api/receipt/remember/route.ts")
  const rememberHelper = readCode("lib/receipts/guest-access-server.ts")
  check("the receipt remembers only paid lines of its own payment and address", /rememberReceipt\(createAdminClient\(\), receiptToken, raw\)/.test(remember) && /if \(!canDeliver\(line\) \|\| !isPlausibleToken\(line\.receipt_token\)\) continue/.test(rememberHelper) && /String\(r\.buyer_email \?\? ""\)\.trim\(\)\.toLowerCase\(\) === email/.test(rememberHelper))
  check("  rate limited, and nothing about the order answered back", /bucket: "receipt-remember"/.test(remember) && /NextResponse\.json\(\{ ok: true \}, \{ headers: NO_STORE \}\)/.test(remember))
  check("  never by an IP or a device: the token is the only proof", !/callerAddress|user-agent|fingerprint/i.test(remember.replace(/addressSubject\(request\)/, "")))
  check("the receipt asks it once open, for anybody but its signed in buyer", /if \(remembered\.current \|\| receipt\.state !== "open" \|\| viewer\.isBuyer\) return/.test(receiptView) && /"\/api\/receipt\/remember"/.test(receiptView))
  const open = readCode("app/api/receipt/open/route.ts")
  check("Open receipt checks the grant again and keeps the token out of the product page", /held\.open\.find/.test(open) && /NextResponse\.redirect\(new URL\(`\/receipt\/\$\{order\.receipt_token\}`/.test(open))
  check("  the verify route counts the grant too, so a cached page corrects itself", /heldGrants\(admin, guestAccessFromCookieHeader\(request\.headers\.get\("cookie"\)\), \{ productId \}\)/.test(readCode("app/api/purchases/verify/route.ts")))

  section("PAGES: the receipt's doors, the product page for a guest, no shared copy of /p")
  check("signed out, an order on an account or an address with one: Sign in only", /const hasAccount = !receipt\.buyer\.unclaimed \|\| !!account\?\.exists/.test(receiptView) && /\{hasAccount \? \(\s*<Link href=\{loginHref\} data-receipt-sign-in=""/.test(receiptView))
  check("  Create account only for an address with no account", /data-receipt-create=""/.test(receiptView) && /data-receipt-account=\{hasAccount \? "sign-in" : "create"\}/.test(receiptView))
  check("  signed in as the buyer: In your library", /ct\("In your library"\)/.test(receiptView))
  check("  a clear Save it to your account", /ct\("Save it to your account"\)/.test(receiptView))
  check("the server decides the door from a CONFIRMED account for the order's address", /verifiedAccountForEmail\(admin, data\?\.buyer_email\)/.test(receiptPage))
  check("  and on a creator's website the doors go to Storelib, where the session is", /\(await isPlatformDomain\(\)\) \? "" : getCanonicalSiteUrl\(\)/.test(receiptPage))
  const product = readCode("app/(marketing)/p/[slug]/page.tsx")
  check("the product page reads the guest grant on the server, for this product", /heldGrants\(createAdminClient\(\), guestAccessCookieFrom\(await cookies\(\)\), \{ productId: product\.id \}\)/.test(product))
  check("  only when the account does not already own it", /if \(!hasPurchased && product\.type !== "physical"/.test(product))
  check("  and shows Open receipt and Save it to your account in place of View in Library", (product.match(/guestOwned \? \(\s*<GuestOwnedActions/g) ?? []).length === 2)
  const guest = readSource("components/checkout/guest-owned-actions.tsx")
  check("  Open receipt goes through the grant, never a token in the page", /\/api\/receipt\/open\?order=\$\{encodeURIComponent\(orderId\)\}/.test(guest) && !/receipt_token|receiptToken/.test(readCode("components/checkout/guest-owned-actions.tsx")))
  check("  Save it to your account comes back to the product", /\/signup\?next=\$\{encodeURIComponent\(usePathname\(\) \|\| "\/"\)\}/.test(guest))
  const config = readSource("next.config.mjs")
  const p = config.match(/source: '\/p\/:slug\*',[\s\S]{0,200}?\]/)?.[0] ?? ""
  check("/p/<slug> is no longer shared by a CDN: it is drawn per viewer", /private/.test(p) && !/s-maxage/.test(p) && !/public/.test(p), p)

  section("HEADER: one answer everywhere, at once")
  const header = readCode("components/platform/platform-header-client.tsx")
  check("sign out clears the record every reader listens to, before anything else", /await supabase\.auth\.signOut\(\{ scope: "local" \}\)\s*clearAuthSnapshot\(\)/.test(header))
  check("a failed profile read still tells the tab bar and the menus who is signed in", /if \(profileErr\) \{[\s\S]{0,1600}writeAuthSnapshot\(\{\s*signedIn: true,\s*userId: user\.id/.test(header))
  const cc = readCode("lib/auth/continue-client.ts")
  check("signing in writes the header's record before the next page paints, so its tab bar line sees it (SIGNED_IN_BOOT)",
    /if \(session\?\.user\?\.id\) rememberSignedIn\(session\.user\.id\)/.test(cc) && /writeAuthSnapshot\(\{\s*signedIn: true,\s*userId,/.test(cc) && /localStorage\.getItem\('_sl_auth_v1'\)/.test(readSource("components/nav/buyer-tab-bar.tsx")))
  check("a sign in or out without a page load refreshes the page and the router's five minute copies",
    /if \(\(event === "SIGNED_IN" \|\| event === "SIGNED_OUT"\) && nowId !== was\) router\.refresh\(\)/.test(header) && /dynamic: 300/.test(readSource("next.config.mjs")))
  check("the receipt and the product page hold the server's answer", /<ViewerSync serverSignedIn=\{viewer\.signedIn\} \/>/.test(receiptView) && (product.match(/<ViewerSync serverSignedIn=\{!!user\} \/>/g) ?? []).length === 2)
  const base = { native: false, lastMove: null, path: "/receipt/x" }
  check("  same answer: nothing", viewerSyncMove({ ...base, serverSignedIn: true, read: { signedIn: true, unsure: false } }).kind === "none")
  check("  the browser could not tell: nothing (a blip is not a sign out)", viewerSyncMove({ ...base, serverSignedIn: true, read: { signedIn: false, unsure: true } }).kind === "none")
  check("  drawn signed out, signed in on the web: the page's data again", viewerSyncMove({ ...base, serverSignedIn: false, read: { signedIn: true, unsure: false } }).kind === "refresh")
  const sync = viewerSyncMove({ ...base, native: true, serverSignedIn: false, read: { signedIn: true, unsure: false } })
  check("  in the app: the cookie written first, then back here", sync.kind === "sync" && (sync as any).path === "/receipt/x")
  check("  drawn signed in, signed out since: the page's data again", viewerSyncMove({ ...base, serverSignedIn: true, read: { signedIn: false, unsure: false } }).kind === "refresh")
  const first = viewerSyncMove({ ...base, serverSignedIn: false, read: { signedIn: true, unsure: false } }) as { kind: string; key: string }
  check("  never the same move twice in a row (no blinking loop)", viewerSyncMove({ ...base, lastMove: first.key, serverSignedIn: false, read: { signedIn: true, unsure: false } }).kind === "none")
  const vs = readCode("components/auth/viewer-sync.tsx")
  check("  it listens for a sign in or out in this tab or another, and the back button", /event !== "SIGNED_IN" && event !== "SIGNED_OUT"/.test(vs) && /if \(e\.persisted\) void reconcile\(\)/.test(vs))

  section("COPY")
  const words = [receiptView, readSource("components/checkout/guest-owned-actions.tsx"), readSource("app/(auth)/login/page.tsx")].join("\n")
  const added = ["In your library", "In your Storelib library", "Save it to your account", "Open receipt", "Bought without an account.", "already has a Storelib account. Sign in"]
  check("the new sentences are there", added.every((w) => words.includes(w)))
  check("  no em dash and none of the banned words in them", !/—/.test(added.join(" ")) && !/\b(unlock|elevate|seamless|powerful|effortlessly|supercharge|transform)\b/i.test(added.join(" ")))
  for (const lang of ["es", "fr", "de", "pt-BR", "it", "pl"]) {
    const cat = readSource(`lib/i18n/catalog/${lang}.ts`)
    check(`  ${lang} has them`, ["\"Open receipt\":", "\"Save it to your account\":", "\"{email} already has a Storelib account. Sign in to continue.\":", "\"In your library\":"].every((k) => cat.includes(k)))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
