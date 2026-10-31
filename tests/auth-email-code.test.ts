/**
 * ===========================================================================
 *  THE SIGN UP CODE PROVES THE ACCOUNT'S OWN ADDRESS, AND NOTHING ELSE
 * ===========================================================================
 * Round rel-security (F1). /api/auth/verify-email mailed a code to whatever
 * address the request named, and /api/auth/confirm-email marked any userId
 * verified for a matching code; an account made with somebody else's address
 * then collected that person's guest orders at its next sign in.
 *
 * This suite runs lib/auth/email-code.ts, lib/auth/code-guard.ts,
 * lib/auth/verified-email.ts and lib/orders/attach-guest-orders.ts against
 * tests/_fake-db with a fake Supabase Auth, the attack first.
 */
import { readCode } from "./_source"
import { fakeDb } from "./_fake-db"
import { confirmAccountCode, sendAccountCode, SEND_LIMITS, CONFIRM_WRONG_BUCKET } from "@/lib/auth/email-code"
import { currentEmailIsVerified, VERIFIED_EMAIL_KEY } from "@/lib/auth/verified-email"
import { attachGuestOrdersByEmail, verifiedAccountForEmail } from "@/lib/orders/attach-guest-orders"

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

type AuthUser = { id: string; email: string; app_metadata?: Record<string, unknown>; identities?: any[]; email_confirmed_at?: string | null }

/** fakeDb plus enough of supabase.auth.admin for these modules. */
function world(users: AuthUser[], tables: Record<string, any[]> = {}) {
  const db = fakeDb({ verification_codes: [], profiles: [], rate_limit_hits: [], orders: [], entitlements: [], products: [], ...tables })
  const byId = new Map(users.map((u) => [u.id, { app_metadata: {}, identities: [], ...u }]))
  const updates: Array<{ id: string; attrs: Record<string, any> }> = []
  const auth = {
    admin: {
      async getUserById(id: string) {
        const user = byId.get(id)
        return user ? { data: { user: { ...user } }, error: null } : { data: { user: null }, error: { message: "User not found", status: 404 } }
      },
      async updateUserById(id: string, attrs: Record<string, any>) {
        updates.push({ id, attrs })
        const user = byId.get(id)
        if (!user) return { data: { user: null }, error: { message: "User not found" } }
        if (attrs.app_metadata) user.app_metadata = { ...(user.app_metadata ?? {}), ...attrs.app_metadata }
        if (attrs.email) user.email = attrs.email
        return { data: { user }, error: null }
      },
    },
  }
  const sent: Array<{ to: string; code: string; href: string }> = []
  const limits: Array<{ bucket: string; subjects: unknown[] }> = []
  let refuse: string | null = null
  const deps = {
    db: Object.assign(db, { auth }) as any,
    limit: async (bucket: string, subjects: unknown[]) => {
      limits.push({ bucket, subjects })
      return refuse === bucket
    },
    send: async (to: string, code: string, href: string) => {
      sent.push({ to, code, href })
      return { success: true, messageId: `m${sent.length}` }
    },
    origin: "https://storelib.com",
  }
  return { db: deps.db, tables: db.tables, byId, updates, sent, limits, deps, refuseBucket: (b: string | null) => (refuse = b) }
}

const ATTACKER = "aaaaaaaa-0000-4000-8000-000000000001"
const VICTIM_EMAIL = "victim@example.com"
const ATTACKER_MAILBOX = "attacker@evil.example"

async function main() {
  section("SEND: the code goes to the account's own address, whatever the request says")
  {
    /* The attack: an account made with the victim's address asks for the code at the attacker's mailbox. */
    const w = world([{ id: ATTACKER, email: VICTIM_EMAIL }], { profiles: [{ id: ATTACKER, email: VICTIM_EMAIL, email_verified: false }] })
    const answer = await sendAccountCode({ userId: ATTACKER, email: ATTACKER_MAILBOX, sessionUserId: ATTACKER, addressSubject: "ip:203.0.113.9" }, w.deps)
    check("a code is sent", answer.status === 200 && w.sent.length === 1, answer)
    check("  to the account's address, never the one in the request", w.sent[0]?.to === VICTIM_EMAIL && !w.sent.some((s) => s.to === ATTACKER_MAILBOX))
    check("  and the stored code is bound to that address", w.tables.verification_codes.length === 1 && w.tables.verification_codes[0].email === VICTIM_EMAIL)
    check("  the code comes from the crypto source (six digits)", /^\d{6}$/.test(w.sent[0]?.code ?? ""))
    check("  limited per caller address and per destination address", w.limits.some((l) => l.bucket === "verify-email-address" && l.subjects.includes("ip:203.0.113.9")) && w.limits.some((l) => l.bucket === "verify-email-to" && l.subjects.includes(`email:${VICTIM_EMAIL}`)))
    check("  limits a person pressing Resend never meets", SEND_LIMITS.email[0].limit >= 5 && SEND_LIMITS.address[0].limit >= 5)

    const again = await sendAccountCode({ userId: ATTACKER, email: VICTIM_EMAIL, sessionUserId: null, addressSubject: "ip:203.0.113.9" }, w.deps)
    check("a second ask inside two minutes mails nothing more", again.status === 200 && again.body.alreadySent === true && w.sent.length === 1)
  }
  {
    const w = world([])
    const answer = await sendAccountCode({ userId: "nobody-0000", email: ATTACKER_MAILBOX, sessionUserId: null, addressSubject: null }, w.deps)
    check("an account that does not exist gets nothing mailed anywhere", answer.status === 400 && w.sent.length === 0 && w.tables.verification_codes.length === 0)
  }
  {
    const w = world([{ id: ATTACKER, email: VICTIM_EMAIL }])
    w.refuseBucket("verify-email-address")
    const a = await sendAccountCode({ userId: ATTACKER, email: VICTIM_EMAIL, sessionUserId: null, addressSubject: "ip:1" }, w.deps)
    w.refuseBucket("verify-email-to")
    const b = await sendAccountCode({ userId: ATTACKER, email: VICTIM_EMAIL, sessionUserId: null, addressSubject: "ip:1" }, w.deps)
    check("over a limit: 429 and nothing sent", a.status === 429 && b.status === 429 && w.sent.length === 0)
  }
  {
    const w = world([{ id: ATTACKER, email: VICTIM_EMAIL }])
    const answer = await sendAccountCode({ userId: "", email: "", sessionUserId: ATTACKER, addressSubject: null }, w.deps)
    check("no userId in the request: the session's account is used", answer.status === 200 && w.sent[0]?.to === VICTIM_EMAIL)
  }

  section("CONFIRM: the code must be the account's AND sent to its current address")
  {
    /* A code from before this fix, sent to the attacker's mailbox for the victim-address account. */
    const w = world([{ id: ATTACKER, email: VICTIM_EMAIL }], {
      profiles: [{ id: ATTACKER, email: VICTIM_EMAIL, email_verified: false }],
      verification_codes: [{ id: "c-old", user_id: ATTACKER, code: "123456", email: ATTACKER_MAILBOX, expires_at: new Date(Date.now() + 600_000).toISOString(), used_at: null, created_at: new Date().toISOString() }],
    })
    const answer = await confirmAccountCode({ userId: ATTACKER, code: "123456", sessionUserId: null, addressSubject: "ip:1" }, w.deps)
    check("a code that went to another mailbox does not verify the account", answer.status === 400 && w.tables.profiles[0].email_verified === false, answer)
    check("  nor confirm it in Supabase Auth", !w.updates.some((u) => u.attrs.email_confirm))
    check("  and it is burned", !!w.tables.verification_codes[0].used_at)
  }
  {
    const w = world([{ id: ATTACKER, email: "Owner@Example.com" }], { profiles: [{ id: ATTACKER, email: "owner@example.com", email_verified: false }] })
    await sendAccountCode({ userId: ATTACKER, email: "owner@example.com", sessionUserId: null, addressSubject: null }, w.deps)
    const code = w.sent[0].code
    const ok = await confirmAccountCode({ userId: ATTACKER, code, sessionUserId: null, addressSubject: "ip:1" }, w.deps)
    check("the right code from the account's mailbox verifies it, with no session (the copy link)", ok.status === 200 && w.tables.profiles[0].email_verified === true, ok)
    check("  Supabase Auth confirms it and records the proven address", w.updates.some((u) => u.attrs.email_confirm === true && u.attrs.app_metadata?.[VERIFIED_EMAIL_KEY] === "owner@example.com"))
    const twice = await confirmAccountCode({ userId: ATTACKER, code, sessionUserId: null, addressSubject: "ip:1" }, w.deps)
    check("  a code works once", twice.status === 400)
  }
  {
    const w = world([{ id: ATTACKER, email: VICTIM_EMAIL }], { profiles: [{ id: ATTACKER, email: VICTIM_EMAIL, email_verified: false }] })
    await sendAccountCode({ userId: ATTACKER, email: VICTIM_EMAIL, sessionUserId: null, addressSubject: null }, w.deps)
    const real = w.sent[0].code
    const wrong = (n: number) => String((Number(real) + n) % 900000 + 100000).padStart(6, "1")
    const answers = []
    for (let i = 1; i <= 5; i++) answers.push(await confirmAccountCode({ userId: ATTACKER, code: wrong(i) === real ? wrong(i + 7) : wrong(i), sessionUserId: null, addressSubject: "ip:1" }, w.deps))
    check("five wrong codes are each refused", answers.every((a) => a.status === 400), answers.map((a) => a.status))
    check("  every wrong one is counted against the account", w.tables.rate_limit_hits.filter((r) => r.bucket === CONFIRM_WRONG_BUCKET && r.subject === `user:${ATTACKER}`).length === 5)
    check("  the fifth burns the live code", w.tables.verification_codes.every((r) => !!r.used_at))
    const after = await confirmAccountCode({ userId: ATTACKER, code: real, sessionUserId: null, addressSubject: "ip:1" }, w.deps)
    check("  the right code after that is refused too", after.status === 429 && w.tables.profiles[0].email_verified === false, after)
    w.limits.length = 0
    const fresh = await sendAccountCode({ userId: ATTACKER, email: VICTIM_EMAIL, sessionUserId: null, addressSubject: null }, w.deps)
    check("  Resend then mails a new code (a burned one is not 'already sent')", fresh.status === 200 && w.sent.length === 2, fresh)
  }
  {
    const w = world([{ id: ATTACKER, email: VICTIM_EMAIL }])
    w.refuseBucket("confirm-email-address")
    const a = await confirmAccountCode({ userId: ATTACKER, code: "111111", sessionUserId: null, addressSubject: "ip:1" }, w.deps)
    check("confirms are limited per caller address", a.status === 429)
    const junk = await confirmAccountCode({ userId: ATTACKER, code: "12ab", sessionUserId: null, addressSubject: "ip:1" }, w.deps)
    check("a code that is not six digits is refused before any read", junk.status === 400)
  }

  section("ATTACH: guest orders join only when the CURRENT address is the proven one")
  {
    const ORDER = "11111111-1111-4111-8111-111111111111"
    const order = () => ({ id: ORDER, product_id: "p1", variant_id: null, status: "completed", amount_cents: 900, buyer_email: VICTIM_EMAIL, buyer_id: null, receipt_token: "t".repeat(32) })
    const products = [{ id: "p1", creator_id: "c1" }]

    /* Proved their own mailbox, then pointed the sign in email at the victim's. */
    const swapped = world([{ id: ATTACKER, email: VICTIM_EMAIL, app_metadata: { [VERIFIED_EMAIL_KEY]: ATTACKER_MAILBOX } }], {
      profiles: [{ id: ATTACKER, email: VICTIM_EMAIL, email_verified: true }],
      orders: [order()],
      products,
    })
    const a = await attachGuestOrdersByEmail(swapped.db, { id: ATTACKER, email: VICTIM_EMAIL })
    check("an account whose proven address is not its current one attaches nothing", a.attached.length === 0 && swapped.tables.orders[0].buyer_id === null)
    check("  and checkout does not hand it the order either", (await verifiedAccountForEmail(swapped.db, VICTIM_EMAIL)) === null)

    /* Verified with profiles.email_verified=true set by hand (no code, no stamp). */
    const selfMarked = world([{ id: ATTACKER, email: VICTIM_EMAIL }], { profiles: [{ id: ATTACKER, email: VICTIM_EMAIL, email_verified: true }], orders: [order()], products })
    check("a profile marked verified with no proof attaches nothing", (await attachGuestOrdersByEmail(selfMarked.db, { id: ATTACKER, email: VICTIM_EMAIL })).attached.length === 0)

    const owner = world([{ id: "u-owner", email: VICTIM_EMAIL, app_metadata: { [VERIFIED_EMAIL_KEY]: VICTIM_EMAIL } }], {
      profiles: [{ id: "u-owner", email: VICTIM_EMAIL, email_verified: true }],
      orders: [order()],
      products,
    })
    const b = await attachGuestOrdersByEmail(owner.db, { id: "u-owner", email: "Victim@Example.com" })
    check("the real owner, proven address current, gets the order", b.attached.length === 1 && owner.tables.orders[0].buyer_id === "u-owner", b)
    check("  checkout finds that account", (await verifiedAccountForEmail(owner.db, VICTIM_EMAIL)) === "u-owner")

    /* Accounts from before the stamp. */
    const legacy = world([{ id: "u-old", email: VICTIM_EMAIL }], {
      profiles: [{ id: "u-old", email: VICTIM_EMAIL, email_verified: true }],
      verification_codes: [{ id: "c1", user_id: "u-old", code: "222222", email: VICTIM_EMAIL, used_at: "2026-01-01T00:00:00Z", expires_at: "2026-01-01T00:15:00Z" }],
      orders: [order()],
      products,
    })
    check("an older account with a used code sent to its current address still attaches", (await attachGuestOrdersByEmail(legacy.db, { id: "u-old", email: VICTIM_EMAIL })).attached.length === 1)
    const google = world([{ id: "u-g", email: VICTIM_EMAIL, identities: [{ provider: "google", identity_data: { email: VICTIM_EMAIL, email_verified: true } }] }])
    check("  as does a Google account vouching for the current address", await currentEmailIsVerified(google.db, google.byId.get("u-g")!))
    const googleOther = world([{ id: "u-g", email: VICTIM_EMAIL, identities: [{ provider: "google", identity_data: { email: ATTACKER_MAILBOX } }] }])
    check("  but not a Google identity for some other address", !(await currentEmailIsVerified(googleOther.db, googleOther.byId.get("u-g")!)))
    const noAuth = world([], { profiles: [{ id: "u-x", email: VICTIM_EMAIL, email_verified: true }], orders: [order()], products })
    check("Auth that cannot be asked attaches nothing (the safe side)", (await attachGuestOrdersByEmail(noAuth.db, { id: "u-x", email: VICTIM_EMAIL })).attached.length === 0)
  }

  section("WIRING: the routes run these, and every place that proves an address records it")
  {
    const verify = readCode("app/api/auth/verify-email/route.ts")
    const confirm = readCode("app/api/auth/confirm-email/route.ts")
    check("verify-email sends through sendAccountCode", /sendAccountCode\(/.test(verify))
    check("  and never mails `to: email` from the request body", !/to:\s*email\b/.test(verify) && !/body\?\.email\s*\?\?|const email = typeof emailRaw/.test(verify))
    check("confirm-email confirms through confirmAccountCode", /confirmAccountCode\(/.test(confirm) && !/updateUserById\(userId/.test(confirm))
    check("an email change records the new proven address", /\[VERIFIED_EMAIL_KEY\]: String\(pending\.new_email\)/.test(readCode("app/api/auth/verify-email-change/route.ts")))
    check("Google and Apple sign in records the address they vouch for", /providerVerifiedEmails\(data\.user\)\.includes\(vouched\)/.test(readCode("app/auth/callback/route.ts")))
    check("a business account records its address", /verified_email: email\.trim\(\)\.toLowerCase\(\)/.test(readCode("lib/businesses/server.ts")))
    const sql = readCode("supabase/sql/run-now/345_profiles_keep_email_verified.sql")
    check("SQL part 345: the browser key cannot set email_verified", /current_user IN \('authenticated', 'anon'\)/.test(sql) && /NEW\.email_verified := OLD\.email_verified/.test(sql) && /NEW\.email_verified := false/.test(sql))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
