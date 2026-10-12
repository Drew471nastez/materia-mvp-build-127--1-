/**
 * ===========================================================================
 *  CUSTOMER ACCOUNTS ON A CREATOR'S WEBSITE, AND THE WISHLIST THEY KEEP
 * ===========================================================================
 * What is held here, and why each one matters:
 *
 *   THE HOST          a code is only sent from, and a session only made for,
 *                     a host a creator's published website is served at,
 *                     looked up in the database.
 *   THE CODE          six digits, emailed, kept as an HMAC, ten minutes,
 *                     five tries counted in one conditional update, used
 *                     once, one live code per address. Expiry, guessing,
 *                     replay, two tries at once, another host and another
 *                     creator are each refused.
 *   THE ACCOUNT       a new email makes a customer of THAT website and
 *                     nothing else: no creator row, no profile, no user.
 *   NO ENUMERATION    asking for a code answers and emails the same for an
 *                     address with an account and one without.
 *   THE SESSION       only good on the host and for the creator it was made
 *                     for, in a __Host- cookie.
 *   THE WISHLIST      every read and write scoped by the session's customer
 *                     and the website's creator, run against a database that
 *                     holds other customers' rows and other creators'
 *                     products.
 *   THE ORDERS        the orders placed with the customer's email, with this
 *                     creator only, one per payment, compared exactly.
 *   THE SQL           part 33 is complete, safe to run twice, and closed to
 *                     the public key.
 */
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { FakeSupabase } from "./fake-supabase"
import { classifySiteHost, returnPathOf, siteOwnerOfHost } from "@/lib/site-accounts/hosts"
import {
  CODE_TRIES,
  CODE_TTL_MS,
  PENDING_TTL_MS,
  SESSION_TTL_MS,
  cleanCode,
  cleanEmail,
  codeHash,
  isSitePath,
  mintPending,
  mintSession,
  newCode,
  readPending,
  readSession,
} from "@/lib/site-accounts/token"
import { checkCode, issueCode } from "@/lib/site-accounts/codes"
import { cleanName, customerById, deleteCustomer, findOrCreateCustomer, renameCustomer } from "@/lib/site-accounts/customers"
import { requestCode, verifyCode, type SignInDeps } from "@/lib/site-accounts/sign-in"
import { codeEmail } from "@/lib/site-accounts/code-email"
import { pendingCookie, pendingCookieName, sessionCookie, sessionCookieName, visitorFrom } from "@/lib/site-accounts/session"
import { sameOriginForm } from "@/lib/site-accounts/respond"
import {
  WISHLIST_MAX,
  cleanList,
  cookieValue,
  merged,
  parseCookieValue,
  parseStored,
  serializeList,
  toggled,
} from "@/lib/site-accounts/wishlist-list"
import {
  addToSiteWishlist,
  listSiteWishlist,
  mergeIntoSiteWishlist,
  removeFromSiteWishlist,
  wishlistCards,
} from "@/lib/site-accounts/wishlist-store"
import { customerOrders, likeExact, siteCustomer } from "@/lib/site-accounts/account-data"
import { customerOrderAccess, downloadPath, fileSize } from "@/lib/site-accounts/order-files"
import { signInNotice } from "@/lib/website-builder/account-pages"

process.env.SITE_ACCOUNT_SECRET = "test-secret-for-site-accounts-0123456789abcdef"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`) }
}
function section(title: string) { console.log(`\n${title}`) }
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1")

const RULES = { mainDomain: "storelib.com", sitesDomain: "storelib.com" }
const HOST = "maralind.storelib.com"
const CREATOR = "11111111-1111-4111-8111-111111111111"
const OTHER_CREATOR = "22222222-2222-4222-8222-222222222222"
const CUSTOMER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const CUSTOMER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const P1 = "10000000-0000-4000-8000-000000000001"
const P2 = "10000000-0000-4000-8000-000000000002"
const P3 = "10000000-0000-4000-8000-000000000004"
const P_DRAFT = "10000000-0000-4000-8000-000000000003"
const P_OTHER = "20000000-0000-4000-8000-000000000001"

/** The rows a creator's website is looked up by, a second creator beside them, and the three tables of part 33. */
function sitesDb(): FakeSupabase {
  const db = new FakeSupabase()
  db.table("profiles", {}, [
    { id: "u-maralind", username: "maralind", email: "maralind@storelib.test" },
    { id: "u-other", username: "otherone", email: "other@storelib.test" },
    { id: "u-noweb", username: "noweb", email: "noweb@storelib.test" },
  ])
  db.table("creators", {}, [
    { id: CREATOR, user_id: "u-maralind", slug: "maralind" },
    { id: OTHER_CREATOR, user_id: "u-other", slug: "otherone" },
    { id: "33333333-3333-4333-8333-333333333333", user_id: "u-noweb", slug: "noweb" },
  ])
  db.table("store_theme_installs", {}, [
    { id: "install-1", creator_id: CREATOR, status: "published", sort_order: 0 },
    { id: "install-2", creator_id: OTHER_CREATOR, status: "published", sort_order: 0 },
  ])
  db.table("site_deployments", {}, [{ slug: "aisite", is_live: true, storage_prefix: "sites/aisite" }])
  db.table("custom_domains", {}, [
    { creator_id: CREATOR, domain: "maralind.com", status: "active", purpose: "website" },
    { creator_id: CREATOR, domain: "links.maralind.com", status: "active", purpose: "creator_page" },
    { creator_id: CREATOR, domain: "pending-maralind.com", status: "pending", purpose: "website" },
    { creator_id: OTHER_CREATOR, domain: "other.shop", status: "ssl_provisioning", purpose: "website" },
  ])
  /* supabase/sql/run-now/33_site_customers.sql, its keys and checks. */
  db.table("site_customer_codes", {
    unique: [["id"]],
    checks: [
      (r) => (Number(r.attempts) >= 0 && Number(r.attempts) <= 5 ? null : "site_customer_codes_attempts"),
      (r) => (r.email === String(r.email).toLowerCase() ? null : "site_customer_codes_email_lower"),
    ],
  })
  db.table("site_customers", {
    unique: [["id"], ["creator_id", "email"]],
    checks: [(r) => (r.email === String(r.email).toLowerCase() ? null : "site_customers_email_lower")],
  })
  return db
}

function deps(db: FakeSupabase, now: number, over: Partial<SignInDeps> = {}) {
  const sent: { to: string; subject: string; html: string; text: string; fromName: string; replyTo?: string | null }[] = []
  const d: SignInDeps = {
    db,
    owner: (h) => siteOwnerOfHost(db, h, RULES),
    limited: async () => false,
    send: async (m) => {
      sent.push(m)
      return { success: true }
    },
    brand: async () => "Maralind",
    now,
    ...over,
  }
  return { d, sent }
}

const codeOf = (mail: { subject: string }) => mail.subject.slice(0, 6)

async function main() {
  // ═══════════════════════════════════════════════════════════════════════
  section("The host is one of the creator's own website hosts")
  // ═══════════════════════════════════════════════════════════════════════
  {
    check("a creator's storelib subdomain is a website host", classifySiteHost(HOST, RULES)?.kind === "subdomain")
    check("a connected domain is a candidate", classifySiteHost("www.maralind.com", RULES)?.kind === "custom")
    for (const host of ["storelib.com", "www.storelib.com", "app.storelib.com", "api.storelib.com", "mcp.storelib.com", "a.b.storelib.com", "localhost", "localhost:3309", "127.0.0.1", "preview-123.vercel.app", "", "evil..com", "exa mple.com"]) {
      check(`"${host}" is not a website host`, classifySiteHost(host, RULES) === null)
    }

    check("a return path is a path", returnPathOf("/wishlist") === "/wishlist" && returnPathOf("/products/x?y=1") === "/products/x?y=1")
    for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "/api/site-account/wishlist", "", " /x", "/x y", "/account/logout", "/account/logout?x=1", "/account/login", "/account/login/"]) {
      check(`a return path "${bad}" falls back to the account page`, returnPathOf(bad) === "/account")
    }

    const db = sitesDb()
    const sub = await siteOwnerOfHost(db, HOST, RULES)
    check("the subdomain belongs to its creator", sub?.creatorId === CREATOR && sub.kind === "subdomain", sub)
    const custom = await siteOwnerOfHost(db, "www.maralind.com", RULES)
    check("the verified website domain belongs to its creator, at www", custom?.creatorId === CREATOR && custom.kind === "custom", custom)
    check("and at its bare name", (await siteOwnerOfHost(db, "maralind.com", RULES))?.creatorId === CREATOR)
    check("a domain still waiting for DNS is not a website host", (await siteOwnerOfHost(db, "pending-maralind.com", RULES)) === null)
    check("a creator page domain is not a website", (await siteOwnerOfHost(db, "links.maralind.com", RULES)) === null)
    check("a certificate on its way still counts as verified", (await siteOwnerOfHost(db, "other.shop", RULES))?.creatorId === OTHER_CREATOR)
    check("nobody's domain is nobody's", (await siteOwnerOfHost(db, "evil.com", RULES)) === null)
    check("a live AI-built site under the name has no accounts", (await siteOwnerOfHost(db, "aisite.storelib.com", RULES)) === null)
    check("a creator with nothing published has no website to sign in to", (await siteOwnerOfHost(db, "noweb.storelib.com", RULES)) === null)
    check("an unknown name is nobody's", (await siteOwnerOfHost(db, "ghost.storelib.com", RULES)) === null)
    check("a database that answers nothing places nothing", (await siteOwnerOfHost(new FakeSupabase(), HOST, RULES)) === null)
    const banned = sitesDb()
    banned.rows("creators").find((c) => c.id === CREATOR)!.banned_at = "2026-09-20T00:00:00Z"
    check("a banned creator's website is no website to sign in to", (await siteOwnerOfHost(banned, HOST, RULES)) === null && (await siteOwnerOfHost(banned, "maralind.com", RULES)) === null)
    check("and a ban on one creator leaves the others be", (await siteOwnerOfHost(banned, "other.shop", RULES))?.creatorId === OTHER_CREATOR)
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("What a visitor types")
  // ═══════════════════════════════════════════════════════════════════════
  {
    check("an email is trimmed and lower cased", cleanEmail("  New.Buyer@Mail.TEST ") === "new.buyer@mail.test")
    for (const bad of ["", "nobody", "a@b", "a b@c.test", "<a@b.test>", "a@b.te\nst", "a\u0000@b.test", "x".repeat(250) + "@b.test", 42, null]) {
      check(`not an email: ${JSON.stringify(bad).slice(0, 30)}`, cleanEmail(bad) === null)
    }
    check("a code is six digits, with the spaces and dash a person adds dropped", cleanCode("123456") === "123456" && cleanCode(" 123 456 ") === "123456" && cleanCode("123-456") === "123456")
    for (const bad of ["12345", "1234567", "12345a", "", null, "１２３４５６"]) check(`not a code: ${JSON.stringify(bad)}`, cleanCode(bad) === null)
    const codes = Array.from({ length: 200 }, () => newCode())
    check("new codes are six digits, leading zeros kept", codes.every((c) => /^\d{6}$/.test(c)))
    check("and not the same one twice in a row of 200 (random, not a counter)", new Set(codes).size > 190)
    check("the stored hash is not the code, and differs per row", codeHash("dddddddd-0000-4000-8000-000000000001", "123456") !== "123456" && codeHash("dddddddd-0000-4000-8000-000000000001", "123456") !== codeHash("dddddddd-0000-4000-8000-000000000002", "123456"))
    check("a name is one line, trimmed, at most 120 characters", cleanName("  Ana \n Pop ") === "Ana Pop" && cleanName("x".repeat(121)) === null && cleanName("") === "")
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Signing in: an email, a code, and a new email makes a customer, never a creator")
  // ═══════════════════════════════════════════════════════════════════════
  const now = Date.parse("2026-09-25T12:00:00Z")
  {
    const db = sitesDb()
    const creatorsBefore = JSON.stringify(db.rows("creators"))
    const profilesBefore = JSON.stringify(db.rows("profiles"))
    const { d, sent } = deps(db, now)
    const asked = await requestCode({ host: HOST, email: "  New.Buyer@Mail.test ", returnPath: "/wishlist" }, d)
    check("asking for a code answers with the note for this browser", asked.ok === true && typeof (asked.ok && asked.pending) === "string", asked)
    check("one email, to the address as it is kept", sent.length === 1 && sent[0].to === "new.buyer@mail.test", sent.map((m) => m.to))
    check("from the store, by name, with the code in the subject and the body", sent[0].fromName === "Maralind" && /^\d{6} is your code for Maralind$/.test(sent[0].subject) && sent[0].text.includes(codeOf(sent[0])) && sent[0].html.includes(codeOf(sent[0])))
    const row = db.rows("site_customer_codes")[0]
    check("one code row, for this creator, this host and this address, ten minutes", db.rows("site_customer_codes").length === 1 && row.creator_id === CREATOR && row.host === HOST && row.email === "new.buyer@mail.test" && Date.parse(row.expires_at) - now === CODE_TTL_MS, row)
    check("the row keeps a hash and never the code", row.code_hash === codeHash(row.id, codeOf(sent[0])) && row.code_hash !== codeOf(sent[0]) && !("code" in row))
    check("nothing about the address was looked up or written but the code", db.writes.every((w) => w.endsWith("site_customer_codes")), db.writes)
    const note = asked.ok ? readPending(asked.pending, now + 1000) : null
    check("the note names the code row, the address, the creator, the host and where to land", note?.k === row.id && note?.m === "new.buyer@mail.test" && note?.c === CREATOR && note?.h === HOST && note?.r === "/wishlist", note)

    const done = await verifyCode({ host: HOST, pending: asked.ok ? asked.pending : null, code: codeOf(sent[0]) }, { db, owner: d.owner, now: now + 30_000 })
    check("the right code signs them in, to where they were going", done.ok === true && done.returnPath === "/wishlist", done)
    check("and a new email is a new account, made now", done.ok === true && done.created === true && db.rows("site_customers").length === 1 && db.rows("site_customers")[0].email === "new.buyer@mail.test" && db.rows("site_customers")[0].creator_id === CREATOR)
    check("A NEW EMAIL MAKES A CUSTOMER AND NOT A CREATOR: no creator row, no profile touched", JSON.stringify(db.rows("creators")) === creatorsBefore && JSON.stringify(db.rows("profiles")) === profilesBefore)
    check("the only tables written are the codes and the customers", db.writes.every((w) => /site_customer_codes$|site_customers$/.test(w)), db.writes)
    const session = done.ok ? done.session : ""
    const visitor = visitorFrom(session, HOST, { creatorId: CREATOR }, now + 60_000)
    check("the session names the customer and the creator on this host", visitor?.customerId === db.rows("site_customers")[0].id && visitor?.creatorId === CREATOR, visitor)
    check("the session is nobody on another host", visitorFrom(session, "otherone.storelib.com", undefined, now + 60_000) === null)
    check("the session is nobody for another creator's page", visitorFrom(session, HOST, { creatorId: OTHER_CREATOR }, now + 60_000) === null)
    check("fourteen days, then nobody", visitorFrom(session, HOST, undefined, now + SESSION_TTL_MS + 60_000) === null)
    check("the same code a second time is refused", (await verifyCode({ host: HOST, pending: asked.ok ? asked.pending : null, code: codeOf(sent[0]) }, { db, owner: d.owner, now: now + 40_000 })).ok === false)

    /* The same person again: signs in, is not made twice. */
    const again = await requestCode({ host: HOST, email: "new.buyer@mail.test", returnPath: "/account" }, d)
    const back = await verifyCode({ host: HOST, pending: again.ok ? again.pending : null, code: codeOf(sent[1]) }, { db, owner: d.owner, now: now + 90_000 })
    check("an email with an account signs in to it and makes nothing", back.ok === true && back.created === false && back.customerId === db.rows("site_customers")[0].id && db.rows("site_customers").length === 1, back)
    check("last signed in is kept", db.rows("site_customers")[0].last_sign_in_at === new Date(now + 90_000).toISOString())

    /* The same person on another creator's website is another customer there. */
    const elsewhere = await requestCode({ host: "other.shop", email: "new.buyer@mail.test", returnPath: "/account" }, d)
    const there = await verifyCode({ host: "other.shop", pending: elsewhere.ok ? elsewhere.pending : null, code: codeOf(sent[2]) }, { db, owner: d.owner, now: now + 120_000 })
    check("the same email on another creator's website is a separate account there", there.ok === true && there.created === true && db.rows("site_customers").filter((r) => r.email === "new.buyer@mail.test").map((r) => r.creator_id).sort().join() === [CREATOR, OTHER_CREATOR].sort().join())
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Nothing tells a stranger whether an email has an account")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const db = sitesDb()
    db.tables.site_customers.push({ id: CUSTOMER_A, creator_id: CREATOR, email: "known@mail.test", name: "Ana", created_at: "2026-09-01T00:00:00Z" })
    const { d, sent } = deps(db, now)
    const known = await requestCode({ host: HOST, email: "known@mail.test", returnPath: "/account" }, d)
    const fresh = await requestCode({ host: HOST, email: "fresh@mail.test", returnPath: "/account" }, d)
    const shape = (r: typeof known) => (r.ok === false ? r.why : Object.keys(r).sort().join())
    check("asking for a code answers the same, with and without an account", known.ok === true && fresh.ok === true && shape(known) === shape(fresh))
    const plain = (m: (typeof sent)[number]) => ({ subject: m.subject.replace(/\d{6}/g, "CODE"), text: m.text.replace(/\d{6}/g, "CODE"), html: m.html.replace(/\d{6}/g, "CODE") })
    check("and sends the same email, word for word but the code", JSON.stringify(plain(sent[0])) === JSON.stringify(plain(sent[1])))
    const stepOne = code("lib/site-accounts/sign-in.ts").split("export async function requestCode")[1]?.split("export type VerifyResult")[0] ?? "x"
    check("nothing about the address is read at that step", !/site_customers/.test(code("lib/site-accounts/codes.ts")) && !/findOrCreateCustomer|customerById|site_customers/.test(stepOne) && stepOne.length > 200)
    for (const why of ["email", "code", "expired", "tries", "restart", "limit", "send", "site", "unavailable", "failed"]) {
      const words = signInNotice(why) ?? ""
      check(`the "${why}" sentence says nothing about an account existing`, words.length > 0 && !/no account|not found|does not exist|already has|registered|unknown email/i.test(words), words)
    }
    check("and nothing else from the address is printed", signInNotice("<script>") === null && signInNotice(undefined) === null)
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The code: ten minutes, five tries, once, one at a time")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const ask = async (db: FakeSupabase, at = now, email = "try@mail.test") => {
      const { d, sent } = deps(db, at)
      const r = await requestCode({ host: HOST, email, returnPath: "/account" }, d)
      return { pending: r.ok ? r.pending : null, code: sent[0] ? codeOf(sent[0]) : "", owner: d.owner }
    }
    const wrong = (c: string) => String((Number(c) + 1) % 1_000_000).padStart(6, "0")

    {
      const db = sitesDb()
      const a = await ask(db)
      const late = await verifyCode({ host: HOST, pending: a.pending, code: a.code }, { db, owner: a.owner, now: now + CODE_TTL_MS + 1000 })
      check("after ten minutes the right code is refused as expired", late.ok === false && late.why === "expired", late)
    }
    {
      const db = sitesDb()
      const a = await ask(db)
      const answers: string[] = []
      for (let i = 0; i < CODE_TRIES; i++) {
        const r = await verifyCode({ host: HOST, pending: a.pending, code: wrong(a.code) }, { db, owner: a.owner, now: now + 1000 + i })
        answers.push(r.ok === false ? r.why : "ok")
      }
      check("each wrong code is counted, and the fifth ends the code", answers.join() === "code,code,code,code,tries" && db.rows("site_customer_codes")[0].attempts === CODE_TRIES, answers)
      const after = await verifyCode({ host: HOST, pending: a.pending, code: a.code }, { db, owner: a.owner, now: now + 2000 })
      check("after five wrong tries the right code no longer works", after.ok === false && after.why === "tries" && db.rows("site_customers").length === 0, after)
      const typo = await verifyCode({ host: HOST, pending: a.pending, code: "12a456" }, { db, owner: a.owner, now: now + 3000 })
      check("something that is not six digits is a typing slip and costs no try", typo.ok === false && typo.why === "code" && db.rows("site_customer_codes")[0].attempts === CODE_TRIES)
    }
    {
      const db = sitesDb()
      const a = await ask(db)
      const [x, y] = await Promise.all([
        verifyCode({ host: HOST, pending: a.pending, code: a.code }, { db, owner: a.owner, now: now + 1000 }),
        verifyCode({ host: HOST, pending: a.pending, code: a.code }, { db, owner: a.owner, now: now + 1000 }),
      ])
      check("two tabs with the right code at once: one signs in, the other is refused", [x.ok, y.ok].filter(Boolean).length === 1 && db.rows("site_customers").length === 1, [x, y])
    }
    {
      const db = sitesDb()
      const a = await ask(db)
      await Promise.all(Array.from({ length: 8 }, () => verifyCode({ host: HOST, pending: a.pending, code: wrong(a.code) }, { db, owner: a.owner, now: now + 1000 })))
      check("eight wrong tries at once are never counted past the limit", db.rows("site_customer_codes")[0].attempts <= CODE_TRIES, db.rows("site_customer_codes")[0].attempts)
      const still = await verifyCode({ host: HOST, pending: a.pending, code: a.code }, { db, owner: a.owner, now: now + 2000 })
      const counted = db.rows("site_customer_codes")[0].attempts
      check("and only a try that was counted is ever weighed", still.ok === (counted < CODE_TRIES), { still, counted })
    }
    {
      const db = sitesDb()
      const first = await ask(db)
      const second = await ask(db, now + 5000)
      const old = await verifyCode({ host: HOST, pending: first.pending, code: first.code }, { db, owner: first.owner, now: now + 6000 })
      check("asking again ends the code before it", old.ok === false && old.why === "expired", old)
      check("one live code per address", db.rows("site_customer_codes").filter((r) => Date.parse(r.expires_at) > now + 6000 && !r.used_at).length === 1)
      const fresh = await verifyCode({ host: HOST, pending: second.pending, code: second.code }, { db, owner: second.owner, now: now + 7000 })
      check("the new one works", fresh.ok === true, fresh)
    }
    {
      const db = sitesDb()
      const a = await ask(db)
      const otherHost = await verifyCode({ host: "otherone.storelib.com", pending: a.pending, code: a.code }, { db, owner: a.owner, now: now + 1000 })
      check("the note taken to another website is refused", otherHost.ok === false && otherHost.why === "expired")
      const row = db.rows("site_customer_codes")[0]
      const forged = mintPending({ codeId: row.id, email: "try@mail.test", creatorId: OTHER_CREATOR, host: HOST, returnPath: "/account" }, now)
      const otherCreator = await verifyCode({ host: HOST, pending: forged, code: a.code }, { db, owner: a.owner, now: now + 1000 })
      check("a note naming another creator than the host's is refused", otherCreator.ok === false && otherCreator.why === "expired")
      const stranger = mintPending({ codeId: "dddddddd-0000-4000-8000-00000000abcd", email: "try@mail.test", creatorId: CREATOR, host: HOST, returnPath: "/account" }, now)
      check("a note for a code that is not there is refused", (await verifyCode({ host: HOST, pending: stranger, code: a.code }, { db, owner: a.owner, now: now + 1000 })).ok === false)
      check("no note at all is refused", (await verifyCode({ host: HOST, pending: null, code: a.code }, { db, owner: a.owner, now: now + 1000 })).ok === false)
      const body = (a.pending ?? "").split(".")
      const claims = JSON.parse(Buffer.from(body[1], "base64url").toString("utf8"))
      claims.m = "victim@mail.test"
      const tampered = `${body[0]}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.${body[2]}`
      check("changing the address in the note breaks its signature", readPending(tampered, now) === null)
      check("the code row's own address is the one signed in, whatever a note says", (await checkCode(db, { codeId: row.id, creatorId: CREATOR, host: HOST, code: a.code }, now + 1000)).ok === true && db.rows("site_customer_codes")[0].email === "try@mail.test")
      check("another website's code row is no code here", (await checkCode(db, { codeId: row.id, creatorId: OTHER_CREATOR, host: HOST, code: a.code }, now + 1000)).ok === false)
    }
    {
      const db = sitesDb()
      const limited = deps(db, now, { limited: async () => true })
      const r = await requestCode({ host: HOST, email: "a@mail.test", returnPath: "/account" }, limited.d)
      check("over a limit: no code, no email", r.ok === false && r.why === "limit" && limited.sent.length === 0 && db.rows("site_customer_codes").length === 0)
      const bounced = deps(db, now, { send: async () => ({ success: false }) })
      const s = await requestCode({ host: HOST, email: "a@mail.test", returnPath: "/account" }, bounced.d)
      check("an email that could not be sent says so", s.ok === false && s.why === "send")
      const badEmail = deps(db, now)
      check("a malformed email is refused before anything else", (await requestCode({ host: HOST, email: "nope", returnPath: "/account" }, badEmail.d)).ok === false && badEmail.sent.length === 0)
      check("a host that is not a creator's website sends nothing", (await requestCode({ host: "storelib.com", email: "a@mail.test", returnPath: "/account" }, deps(db, now).d)).ok === false)
      const bare = new FakeSupabase()
      bare.tables = { ...sitesDb().tables }
      bare.specs = { ...sitesDb().specs }
      delete bare.tables.site_customer_codes
      const none = deps(bare, now)
      const missing = await requestCode({ host: HOST, email: "a@mail.test", returnPath: "/account" }, { ...none.d, owner: async () => ({ creatorId: CREATOR }) })
      check("before part 33 has run no code is sent, and the page says it is not available yet", missing.ok === false && missing.why === "unavailable" && none.sent.length === 0, missing)
    }
    {
      const issued = await issueCode(sitesDb(), { creatorId: CREATOR, email: "x@mail.test", host: HOST }, now)
      check("a code is made for a creator's website with a random id", issued.ok === true && /^[0-9a-f-]{36}$/.test(issued.ok ? issued.codeId : ""))
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The notes and the cookies")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const note = mintPending({ codeId: "dddddddd-0000-4000-8000-000000000001", email: "a@mail.test", creatorId: CREATOR, host: HOST, returnPath: "/account" }, now)
    check("the note lasts thirty minutes, so a new code can be sent to the same email", readPending(note, now + PENDING_TTL_MS - 1000) !== null && readPending(note, now + PENDING_TTL_MS + 1) === null)
    check("a note is not a session, and a session is not a note", readSession(note, now) === null && readPending(mintSession({ customerId: CUSTOMER_A, creatorId: CREATOR, host: HOST }, now), now) === null)
    check("a note cannot carry a path that leaves the website", mintPending({ codeId: "dddddddd-0000-4000-8000-000000000001", email: "a@mail.test", creatorId: CREATOR, host: HOST, returnPath: "//evil.com" }, now) === null)
    check("a site path is one slash then a page", isSitePath("/a/b?c") && !isSitePath("//x") && !isSitePath("/\\x") && !isSitePath("x"))
    const session = mintSession({ customerId: CUSTOMER_A, creatorId: CREATOR, host: HOST }, now)!
    check("a session of the first version, which named a Storelib user, is nobody", readSession(session.replace(/^v2\./, "v1."), now) === null)
    check("a signature from another key is nothing", (() => {
      const saved = process.env.SITE_ACCOUNT_SECRET
      process.env.SITE_ACCOUNT_SECRET = "a-completely-different-secret-value-0123456789"
      const other = mintSession({ customerId: CUSTOMER_A, creatorId: CREATOR, host: HOST }, now)
      process.env.SITE_ACCOUNT_SECRET = saved
      return readSession(other, now) === null
    })())
    check("junk is nothing", readSession("v2.abc.def", now) === null && readSession("", now) === null && readSession(null, now) === null && readSession("x".repeat(5000), now) === null)

    check("the session and note cookies are __Host- on a real host, so a sibling website cannot set them", sessionCookieName(HOST) === "__Host-sl_site_session" && pendingCookieName("www.maralind.com") === "__Host-sl_site_pending")
    check("and plain names on localhost, where there is no https", sessionCookieName("localhost:3000") === "sl_site_session")
    const opts = sessionCookie(HOST)
    check("the session cookie is httpOnly, Secure, SameSite=Lax, path /, no domain", opts.httpOnly === true && opts.secure === true && opts.sameSite === "lax" && opts.path === "/" && !("domain" in opts) && opts.maxAge === SESSION_TTL_MS / 1000)
    const p = pendingCookie(HOST)
    check("so is the note's, for thirty minutes", p.httpOnly === true && p.secure === true && p.sameSite === "lax" && p.path === "/" && !("domain" in p) && p.maxAge === PENDING_TTL_MS / 1000)
    check("nothing sets a cookie for a whole domain", !/domain:/.test(code("lib/site-accounts/session.ts")))

    const req = (h: Record<string, string>) => new Request(`https://${HOST}/api/site-account/code`, { method: "POST", headers: h })
    check("a form from this website's own page is let through", sameOriginForm(req({ origin: `https://${HOST}` }), HOST))
    check("a form from another website, even a sibling on storelib.com, is not", !sameOriginForm(req({ origin: "https://otherone.storelib.com" }), HOST) && !sameOriginForm(req({ origin: "https://evil.test" }), HOST))
    check("a browser hiding the origin is let through only when it says same-origin", sameOriginForm(req({ origin: "null", "sec-fetch-site": "same-origin" }), HOST) && !sameOriginForm(req({ origin: "null" }), HOST) && !sameOriginForm(req({}), HOST) && !sameOriginForm(req({ "sec-fetch-site": "cross-site" }), HOST))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("A theme's Create account form, and deleting an account")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const now = Date.parse("2026-10-10T10:00:00Z")
    const db = sitesDb()
    const { d, sent } = deps(db, now)
    const asked = await requestCode({ host: HOST, email: "bea@mail.test", returnPath: "/account", name: " Bea   Lin " }, d)
    const note = asked.ok ? readPending(asked.pending, now + 1000) : null
    check("the name a Create account form asked for rides in the signed note, cleaned", note?.n === "Bea Lin", note)
    check("and nothing is written about it before the code proves the email", db.rows("site_customers").length === 0)
    const done = await verifyCode({ host: HOST, pending: asked.ok ? asked.pending : null, code: codeOf(sent[0]) }, { db, owner: d.owner, now: now + 30_000 })
    check("the new account gets that name once the code is typed", done.ok === true && db.rows("site_customers")[0]?.name === "Bea Lin", db.rows("site_customers"))
    const again = await requestCode({ host: HOST, email: "bea@mail.test", returnPath: "/account", name: "Somebody Else" }, d)
    await verifyCode({ host: HOST, pending: again.ok ? again.pending : null, code: codeOf(sent[1]) }, { db, owner: d.owner, now: now + 90_000 })
    check("an account that has a name keeps it: nobody renames an account by asking for a code", db.rows("site_customers")[0]?.name === "Bea Lin")
    check("a name too long for the note is not put in it", mintPending({ codeId: CUSTOMER_A, email: "a@mail.test", creatorId: CREATOR, host: HOST, returnPath: "/", name: "x".repeat(121) }, now)?.length === mintPending({ codeId: CUSTOMER_A, email: "a@mail.test", creatorId: CREATOR, host: HOST, returnPath: "/" }, now)?.length)

    const bea = db.rows("site_customers")[0]
    db.table("site_customer_wishlist", {}, [{ customer_id: bea.id, product_id: P1 }, { customer_id: CUSTOMER_B, product_id: P1 }])
    db.rows("site_customers").push({ id: CUSTOMER_B, creator_id: CREATOR, email: "other@mail.test", name: null, created_at: null })
    check("somebody else's account cannot be deleted through another creator", (await deleteCustomer(db, { customerId: bea.id, creatorId: OTHER_CREATOR })) === false && db.rows("site_customers").some((r) => r.id === bea.id))
    check("a customer deletes their own account", (await deleteCustomer(db, { customerId: bea.id, creatorId: CREATOR })) === true)
    check("the row, what it saved and its waiting codes go; nobody else's", !db.rows("site_customers").some((r) => r.id === bea.id) && db.rows("site_customers").some((r) => r.id === CUSTOMER_B) && !db.rows("site_customer_wishlist").some((r) => r.customer_id === bea.id) && db.rows("site_customer_wishlist").some((r) => r.customer_id === CUSTOMER_B) && !db.rows("site_customer_codes").some((r) => r.email === "bea@mail.test"))
    check("the session it had is nobody now", (await customerById(db, { customerId: bea.id, creatorId: CREATOR })) === null)
    check("deleting twice deletes nothing", (await deleteCustomer(db, { customerId: bea.id, creatorId: CREATOR })) === false)
    const del = code("app/api/site-account/delete/route.ts")
    check("the delete route: same-origin form, the session's customer for this host's creator, confirm=delete, limited, every cookie cleared", /sameOriginForm\(request, host\)/.test(del) && /visitorOfRequest\(request, \{ creatorId: owner\.creatorId \}\)/.test(del) && /form\?\.get\("confirm"\) !== "delete"/.test(del) && /"site-account-delete"/.test(del) && /sessionCookieName\(host\), ""/.test(del) && /HINT_COOKIE, ""/.test(del) && !/form\?\.get\("(id|customer|email)"\)/.test(del))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The routes around it")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const codeRoute = code("app/api/site-account/code/route.ts")
    check("step one takes the host from the request, checks the form's origin and asks three limits", /const host = hostOf\(request\)/.test(codeRoute) && /sameOriginForm\(request, host\)/.test(codeRoute) && ["site-signin-email", "site-signin-visitor", "site-signin-store"].every((b) => codeRoute.includes(`"${b}"`)))
    check("and keeps the note in the __Host- cookie", /res\.cookies\.set\(pendingCookieName\(host\), result\.pending, pendingCookie\(host\)\)/.test(codeRoute))
    const verify = code("app/api/site-account/verify/route.ts")
    check("step two checks the origin, limits a visitor, and sets the session, the hint and clears the note", /sameOriginForm\(request, host\)/.test(verify) && /"site-signin-verify"/.test(verify) && /sessionCookieName\(host\), result\.session, sessionCookie\(host\)/.test(verify) && /pendingCookieName\(host\), "", \{ \.\.\.pendingCookie\(host\), maxAge: 0 \}/.test(verify))
    const profile = code("app/api/site-account/profile/route.ts")
    check("the profile is changed for the session's customer, never an id from the form", /visitorOfRequest\(request, \{ creatorId: owner\.creatorId \}\)/.test(profile) && /customerById\(db, visitor\)/.test(profile) && !/form\?\.get\("(id|customer|email)"\)/.test(profile))
    const wl = code("app/api/site-account/wishlist/route.ts")
    check("a wishlist write must come from the website's own page", /sameOriginWrite\(request, host\)/.test(wl))
    check("and the customer is the session's, and must still be there", /visitorOfRequest\(request\)/.test(wl) && /customerById\(createAdminClient\(\), visitor\)/.test(wl) && !/body\.(userId|customerId|user_id)/.test(wl))
    const logout = code("app/(site)/w/[username]/account/logout/route.ts")
    check("signing out clears the session, the note and the hint", /sessionCookieName\(host\), ""/.test(logout) && /pendingCookieName\(host\), ""/.test(logout) && /HINT_COOKIE, ""/.test(logout))
    check("every answer is private and sends no Referer on", /private, no-store/.test(read("lib/site-accounts/respond.ts")) && /Referrer-Policy", "no-referrer"/.test(read("lib/site-accounts/respond.ts")))

    const accounts = ["lib/site-accounts/sign-in.ts", "lib/site-accounts/codes.ts", "lib/site-accounts/customers.ts", "lib/site-accounts/token.ts", "lib/site-accounts/session.ts", "app/api/site-account/code/route.ts", "app/api/site-account/verify/route.ts", "app/api/site-account/profile/route.ts", "app/api/site-account/wishlist/route.ts", "app/api/site-account/start/route.ts"].map(code).join("\n")
    check("NO STORELIB LOGIN IS EVER MADE: no Supabase user, sign up, session or creator row anywhere in it", !/auth\.admin|createUser|signUp|signInWith|setSession|verifyOtp|\.from\("creators"\)|\.from\("profiles"\)|\.from\("wishlist_items"\)/.test(accounts))
    check("the storelib.com consent page and the code exchange are gone", !readdirSync(join(process.cwd(), "app/api/site-account")).includes("exchange") && !readdirSync(join(process.cwd(), "app/account")).includes("site"))
    check("the old Sign in address still lands on the website's sign in page", /new URL\("\/account\/login", originOf\(host\)\)/.test(code("app/api/site-account/start/route.ts")))
    const login = code("app/(site)/w/[username]/account/login/page.tsx")
    check("the sign in page shows the code step while this browser waits on one, and sends a signed in customer on", /pendingSignIn\(creatorId\)/.test(login) && /if \(visitor\) redirect\(back\)/.test(login))
    check("a code refused after the note ran out says to start again at the email step", /!pending && \(sp\.error === "code" \|\| sp\.error === "expired" \|\| sp\.error === "tries"\) \? "restart" : sp\.error/.test(login) && signInNotice("restart") === "That sign in has expired. Enter your email to get a new code.")
    const account = code("app/(site)/w/[username]/account/page.tsx")
    check("the account page is for a customer who is still there, and sends anybody else to sign in", /if \(!visitor \|\| !customer\) redirect\("\/account\/login"\)/.test(account))
    check("a session is only good while its customer is", /customerById\(createAdminClient\(\), visitor\)/.test(code("app/(site)/w/[username]/visitor.ts")))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The guest list, as the browser keeps it")
  // ═══════════════════════════════════════════════════════════════════════
  {
    check("ids only, lower case, each once", JSON.stringify(cleanList([P1.toUpperCase(), P1, "junk", 3, P2])) === JSON.stringify([P1, P2]))
    check("capped", cleanList(Array.from({ length: 100 }, (_, i) => `10000000-0000-4000-8000-${String(i).padStart(12, "0")}`)).length === WISHLIST_MAX)
    check("a broken stored value is an empty list", parseStored("{nope").length === 0 && parseStored(null).length === 0)
    check("storage round trip", JSON.stringify(parseStored(serializeList([P2, P1]))) === JSON.stringify([P2, P1]))
    check("the cookie copy has no comma and round trips", !cookieValue([P1, P2]).includes(",") && JSON.stringify(parseCookieValue(cookieValue([P1, P2]))) === JSON.stringify([P1, P2]))
    check("saving puts it first, once", JSON.stringify(toggled([P1, P2], P2, true)) === JSON.stringify([P2, P1]))
    check("taking out removes it", JSON.stringify(toggled([P1, P2], P1, false)) === JSON.stringify([P2]))
    check("merging keeps the account's and adds the guest's new ones", JSON.stringify(merged([P1], [P2, P1])) === JSON.stringify([P1, P2]))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("A signed-in customer's list: their rows, this creator's products")
  // ═══════════════════════════════════════════════════════════════════════
  const wishDb = () => {
    const db = new FakeSupabase()
    db.table("products", {}, [
      { id: P1, creator_id: CREATOR, status: "published", title: "Linen apron", slug: "linen-apron", price_cents: 6400, compare_at_cents: null, thumbnail_url: null },
      { id: P2, creator_id: CREATOR, status: "published", title: "Card wallet", slug: "card-wallet", price_cents: 2900, compare_at_cents: null, thumbnail_url: null },
      { id: P_DRAFT, creator_id: CREATOR, status: "draft", title: "Unreleased", slug: "unreleased", price_cents: 100, compare_at_cents: null, thumbnail_url: null },
      { id: P_OTHER, creator_id: OTHER_CREATOR, status: "published", title: "Somebody else's", slug: "else", price_cents: 100, compare_at_cents: null, thumbnail_url: null },
    ])
    db.table("site_customer_wishlist", {
      unique: [["customer_id", "product_id"]],
      defaults: (d) => ({ created_at: d.now() }),
    }, [
      { customer_id: CUSTOMER_B, product_id: P1, created_at: "2026-09-21T00:00:00Z" },
      { customer_id: CUSTOMER_B, product_id: P2, created_at: "2026-09-21T00:00:00Z" },
    ])
    return db
  }
  const A = { customerId: CUSTOMER_A, creatorId: CREATOR }
  {
    const db = wishDb()
    check("empty to begin with", (await listSiteWishlist(db, A)).ids.length === 0)
    const added = await addToSiteWishlist(db, A, P1)
    check("saving this creator's product lists it", JSON.stringify(added.ids) === JSON.stringify([P1]), added)
    await addToSiteWishlist(db, A, P1)
    check("saving twice is saving once", db.rows("site_customer_wishlist").filter((r) => r.customer_id === CUSTOMER_A && r.product_id === P1).length === 1)
    await addToSiteWishlist(db, A, P_OTHER)
    await addToSiteWishlist(db, A, P_DRAFT)
    await addToSiteWishlist(db, A, "not-an-id")
    check("another creator's product, a draft and junk are never added", db.rows("site_customer_wishlist").filter((r) => r.customer_id === CUSTOMER_A).length === 1)
    await removeFromSiteWishlist(db, A, P1)
    check("taking out removes this customer's row only", !db.rows("site_customer_wishlist").some((r) => r.customer_id === CUSTOMER_A && r.product_id === P1) && db.rows("site_customer_wishlist").some((r) => r.customer_id === CUSTOMER_B && r.product_id === P1))
    const B = await listSiteWishlist(db, { customerId: CUSTOMER_B, creatorId: CREATOR })
    check("another customer's list is theirs, untouched", B.ids.length === 2)
    check("a bad scope reads nothing", (await listSiteWishlist(db, { customerId: "x", creatorId: CREATOR })).ids.length === 0)
  }
  {
    const db = wishDb()
    const first = await mergeIntoSiteWishlist(db, A, [P2, P1, P_OTHER, P_DRAFT, "junk"])
    check("the guest list merges this creator's published products only", JSON.stringify([...first.ids].sort()) === JSON.stringify([P1, P2].sort()), first)
    const second = await mergeIntoSiteWishlist(db, A, [P2, P1])
    check("merging again adds nothing twice", second.ids.length === 2 && db.rows("site_customer_wishlist").filter((r) => r.customer_id === CUSTOMER_A).length === 2)
    const cards = await wishlistCards(db, CREATOR, [P2, P_OTHER, P1])
    check("cards are drawn in saved order, this creator's only", cards.map((c) => c.id).join() === [P2, P1].join() && cards[0].settings.url === "/products/card-wallet", cards)
  }
  {
    const db = new FakeSupabase()
    db.table("products", {}, [{ id: P1, creator_id: CREATOR, status: "published" }])
    check("with no wishlist table the page is told to keep the browser's list", (await listSiteWishlist(db, A)).available === false)
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("A customer's name")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const db = sitesDb()
    db.tables.site_customers.push(
      { id: CUSTOMER_A, creator_id: CREATOR, email: "ana@mail.test", name: null, created_at: "2026-09-01T00:00:00Z" },
      { id: CUSTOMER_B, creator_id: OTHER_CREATOR, email: "ana@mail.test", name: "Ana elsewhere", created_at: "2026-09-01T00:00:00Z" },
    )
    check("a customer is read for the creator the session names", (await customerById(db, { customerId: CUSTOMER_A, creatorId: CREATOR }))?.email === "ana@mail.test")
    check("and is nobody for another creator", (await customerById(db, { customerId: CUSTOMER_A, creatorId: OTHER_CREATOR })) === null)
    check("renaming changes this customer's name", (await renameCustomer(db, { customerId: CUSTOMER_A, creatorId: CREATOR }, "Ana Pop")) === true && db.rows("site_customers").find((r) => r.id === CUSTOMER_A)?.name === "Ana Pop")
    check("and nobody else's", db.rows("site_customers").find((r) => r.id === CUSTOMER_B)?.name === "Ana elsewhere")
    check("a session for another creator renames nobody", (await renameCustomer(db, { customerId: CUSTOMER_A, creatorId: OTHER_CREATOR }, "X")) === false)
    const made = await findOrCreateCustomer(db, { creatorId: CREATOR, email: "ana@mail.test" }, now)
    check("finding an existing customer makes nothing new", made.ok === true && made.created === false && made.customer.id === CUSTOMER_A && db.rows("site_customers").length === 2)
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The account page's orders: placed with this email, with this creator, one per payment")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const db = new FakeSupabase()
    db.table("products", {}, [
      { id: P1, creator_id: CREATOR, status: "published", title: "Linen apron pattern", slug: "linen-apron", thumbnail_url: "https://cdn.test/apron.jpg", type: "digital" },
      { id: P2, creator_id: CREATOR, status: "published", title: "Card wallet", slug: "card-wallet", thumbnail_url: null, type: "physical" },
      { id: P3, creator_id: CREATOR, status: "unpublished", title: "Weaving course", slug: "weaving", thumbnail_url: null, type: "course" },
      { id: P_OTHER, creator_id: OTHER_CREATOR, status: "published", title: "Elsewhere", slug: "else", thumbnail_url: null, type: "digital" },
    ])
    const order = (o: Record<string, unknown>) => ({ creator_id: CREATOR, currency: "usd", tip_cents: 0, refund_amount_cents: null, stripe_session_id: null, paypal_order_id: null, shipped_at: null, delivered_at: null, variant_name: null, ...o })
    db.table("orders", {}, [
      /* A basket: two rows, one payment. */
      order({ id: "o-basket-1", product_id: P1, buyer_email: "a_b@mail.test", status: "completed", created_at: "2026-09-20T10:00:00Z", receipt_token: "tok-basket-1-aaaaaaaaaaaa", amount_cents: 1200, stripe_session_id: "cs_test_basket" }),
      order({ id: "o-basket-2", product_id: P2, buyer_email: "A_B@Mail.test", status: "completed", created_at: "2026-09-20T10:00:01Z", receipt_token: "tok-basket-2-aaaaaaaaaaaa", amount_cents: 2900, stripe_session_id: "cs_test_basket", variant_name: "Blue", shipped_at: "2026-09-21T09:00:00Z" }),
      /* The newest: a course. */
      order({ id: "o-course", product_id: P3, buyer_email: "a_b@mail.test", status: "completed", created_at: "2026-09-24T10:00:00Z", receipt_token: "tok-course-aaaaaaaaaaaaaa", amount_cents: 0 }),
      /* Refunded in full, and in part. */
      order({ id: "o-refund", product_id: P1, buyer_email: "a_b@mail.test", status: "refunded", created_at: "2026-09-10T10:00:00Z", receipt_token: "tok-refund-aaaaaaaaaaaaaa", amount_cents: 1200 }),
      order({ id: "o-partial", product_id: P1, buyer_email: "a_b@mail.test", status: "refunded", created_at: "2026-09-11T10:00:00Z", receipt_token: "tok-partial-aaaaaaaaaaaaa", amount_cents: 1200, refund_amount_cents: 200 }),
      /* Never shown: a failed payment, another address that a wildcard would match, another creator. */
      order({ id: "o-failed", product_id: P1, buyer_email: "a_b@mail.test", status: "failed", created_at: "2026-09-25T10:00:00Z", receipt_token: "tok-failed-aaaaaaaaaaaaaa", amount_cents: 1200 }),
      order({ id: "o-lookalike", product_id: P1, buyer_email: "axb@mail.test", status: "completed", created_at: "2026-09-25T11:00:00Z", receipt_token: "tok-lookalike-aaaaaaaaaaa", amount_cents: 1200 }),
      order({ id: "o-other-creator", creator_id: OTHER_CREATOR, product_id: P_OTHER, buyer_email: "a_b@mail.test", status: "completed", created_at: "2026-09-25T12:00:00Z", receipt_token: "tok-other-aaaaaaaaaaaaaaa", amount_cents: 500 }),
    ])
    check("the email is matched exactly: an underscore is an underscore", likeExact("a_b%c\\d@x.test") === "a\\_b\\%c\\\\d@x.test")
    const orders = await customerOrders(db, { creatorId: CREATOR, email: "a_b@mail.test" }, "https://storelib.com")
    check("four orders: the course, the basket and the two refunds, newest first", orders.map((o) => o.id).join() === "o-course,o-basket-1,o-partial,o-refund", orders.map((o) => o.id))
    check("never a failed payment, an address a wildcard would match, or another creator's order", !orders.some((o) => ["o-failed", "o-lookalike", "o-other-creator"].includes(o.id)))
    const basket = orders.find((o) => o.id === "o-basket-1")!
    check("a basket is one order with both items, whatever case the address was typed in", basket.item_count === 2 && basket.items.map((i) => i.title).join() === "Linen apron pattern,Card wallet" && basket.items[1].variant === "Blue", basket)
    check("its total is the payment's total", basket.total === "$41.00", basket.total)
    check("with a date and the receipt's number (the first row's id, as the receipt shows it)", basket.date === "Sep 20, 2026" && basket.number === "OBASKET1", basket)
    check("a download is Download, and opens the receipt, which is the download page", basket.action_label === "Download" && basket.action_url === "https://storelib.com/receipt/tok-basket-1-aaaaaaaaaaaa")
    check("something shipped says so", basket.status === "Shipped")
    const course = orders[0]
    check("a course is Access, free is Free, and a product no longer for sale has no link", course.action_label === "Access" && course.total === "Free" && course.items[0].url === "" && course.status === "Complete", course)
    check("a refund in full is Refunded, and in part is Partly refunded", orders.find((o) => o.id === "o-refund")?.status === "Refunded" && orders.find((o) => o.id === "o-partial")?.status === "Partly refunded")
    check("a refunded order's button is View order", orders.find((o) => o.id === "o-refund")?.action_label === "View order")
    check("the first item and the total are there under the names older templates read", basket.title === "Linen apron pattern and 1 more" && basket.image === "https://cdn.test/apron.jpg" && basket.price === basket.total && basket.url === "/products/linen-apron")

    const other = await customerOrders(db, { creatorId: CREATOR, email: "axb@mail.test" }, "https://storelib.com")
    check("another customer sees only their own order", other.map((o) => o.id).join() === "o-lookalike")
    const none = await customerOrders(db, { creatorId: CREATOR, email: "nobody@mail.test" }, "https://storelib.com")
    check("an email with no orders has none", none.length === 0)

    const account = await siteCustomer(db, { id: CUSTOMER_A, creator_id: CREATOR, email: "a_b@mail.test", name: "Ana Pop", created_at: null }, "https://storelib.com")
    check("the customer object: name, email, orders, and never a sample", account.name === "Ana Pop" && account.first_name === "Ana" && account.email === "a_b@mail.test" && account.orders_count === 4 && account.sample === false)

    /* An imported theme's account draws an order's own page: a download opens it on the website, never a storelib.com receipt. */
    const paged = await customerOrders(db, { creatorId: CREATOR, email: "a_b@mail.test" }, "https://storelib.com", { orderPages: true })
    const pagedBasket = paged.find((o) => o.id === "o-basket-1")!
    check("with order pages, a download opens /account/orders/<id> on the website", pagedBasket.action_label === "Download" && pagedBasket.action_url === "/account/orders/o-basket-1", pagedBasket.action_url)
    check("  a course still opens its receipt (taking it needs a Storelib account), and a refund its order", paged[0].action_url.startsWith("https://storelib.com/receipt/") && paged.find((o) => o.id === "o-refund")?.action_url.startsWith("https://storelib.com/receipt/") === true)
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Downloads on the website: only the buyer's own order, only its own files")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const O1 = "40000000-0000-4000-8000-000000000001"
    const O2 = "40000000-0000-4000-8000-000000000002"
    const O_REFUND = "40000000-0000-4000-8000-000000000003"
    const O_OTHER = "40000000-0000-4000-8000-000000000004"
    const O_ELSEWHERE = "40000000-0000-4000-8000-000000000005"
    const A1 = "50000000-0000-4000-8000-000000000001"
    const A2 = "50000000-0000-4000-8000-000000000002"
    const A_OTHER = "50000000-0000-4000-8000-000000000003"
    const db = new FakeSupabase()
    db.table("creators", {}, [{ id: CREATOR, slug: "maralind", user_id: "u-maralind" }, { id: OTHER_CREATOR, slug: "otherone", user_id: "u-other" }])
    db.table("profiles", {}, [{ id: "u-maralind", username: "maralind", display_name: "Mara Lind" }])
    db.table("products", {}, [
      { id: P1, creator_id: CREATOR, status: "published", title: "Linen apron pattern", slug: "linen-apron", thumbnail_url: null, type: "digital" },
      { id: P_OTHER, creator_id: OTHER_CREATOR, status: "published", title: "Elsewhere", slug: "else", thumbnail_url: null, type: "digital" },
    ])
    db.table("digital_assets", {}, [
      { id: A1, product_id: P1, file_name: "apron.pdf", file_size: 2_400_000, created_at: "2026-09-01T00:00:00Z", file_path: "x/apron.pdf" },
      { id: A2, product_id: P1, file_name: "sizes.pdf", file_size: 900, created_at: "2026-09-02T00:00:00Z", file_path: "x/sizes.pdf" },
      { id: A_OTHER, product_id: P_OTHER, file_name: "else.zip", file_size: 10, created_at: "2026-09-01T00:00:00Z", file_path: "x/else.zip" },
    ])
    const row = (o: Record<string, unknown>) => ({ creator_id: CREATOR, currency: "usd", tip_cents: 0, amount_cents: 1200, refund_amount_cents: null, stripe_session_id: null, variant_id: null, variant_name: null, created_at: "2026-09-20T10:00:00Z", ...o })
    db.table("orders", {}, [
      row({ id: O1, product_id: P1, buyer_email: "ana@mail.test", status: "completed", receipt_token: "tok-dl-1-aaaaaaaaaaaaaaaa" }),
      row({ id: O_REFUND, product_id: P1, buyer_email: "ana@mail.test", status: "refunded", refund_amount_cents: 1200, receipt_token: "tok-dl-r-aaaaaaaaaaaaaaaa" }),
      row({ id: O2, product_id: P1, buyer_email: "ana@mail.test", status: "failed", receipt_token: "tok-dl-f-aaaaaaaaaaaaaaaa" }),
      row({ id: O_OTHER, product_id: P1, buyer_email: "bea@mail.test", status: "completed", receipt_token: "tok-dl-b-aaaaaaaaaaaaaaaa" }),
      row({ id: O_ELSEWHERE, creator_id: OTHER_CREATOR, product_id: P_OTHER, buyer_email: "ana@mail.test", status: "completed", receipt_token: "tok-dl-e-aaaaaaaaaaaaaaaa" }),
    ])
    const mine = await customerOrderAccess(db, { creatorId: CREATOR, email: "ana@mail.test" }, O1)
    const files = mine?.detail.lines[0]?.files ?? []
    check("the buyer's own paid order lists its files, by name and size", files.map((f) => `${f.name} ${f.size}`).join() === "apron.pdf 2.3 MB,sizes.pdf 900 B", mine?.detail)
    check("  each downloads from the website itself, never a storage path or a receipt token", files.every((f) => f.url === downloadPath(O1, f.id) && f.url.startsWith("/api/site-account/download?")) && !JSON.stringify(mine?.detail).includes("tok-dl-") && !JSON.stringify(mine?.detail).includes("x/apron"))
    check("  the receipt token stays on the server, for the download to be decided with", mine?.tokens.get(O1) === "tok-dl-1-aaaaaaaaaaaaaaaa")
    check("the same email in another case is the same buyer", (await customerOrderAccess(db, { creatorId: CREATOR, email: "ANA@mail.test" }, O1)) !== null)
    check("somebody else's order on this website is not found", (await customerOrderAccess(db, { creatorId: CREATOR, email: "ana@mail.test" }, O_OTHER)) === null)
    check("the buyer's order on another creator's website is not found here", (await customerOrderAccess(db, { creatorId: CREATOR, email: "ana@mail.test" }, O_ELSEWHERE)) === null)
    check("a failed payment is not an order to show", (await customerOrderAccess(db, { creatorId: CREATOR, email: "ana@mail.test" }, O2)) === null)
    const refunded = await customerOrderAccess(db, { creatorId: CREATOR, email: "ana@mail.test" }, O_REFUND)
    check("a refunded order is shown, with its files closed and why", refunded !== null && refunded.detail.lines[0].files.length === 0 && /Refunded/.test(refunded.detail.lines[0].note), refunded?.detail)
    check("an address that is not an order id finds nothing", (await customerOrderAccess(db, { creatorId: CREATOR, email: "ana@mail.test" }, "o-1")) === null)
    check("file sizes read as people write them", fileSize(0) === "" && fileSize(512) === "512 B" && fileSize(1536) === "1.5 KB" && fileSize(52_428_800) === "50 MB")

    const route = code("app/api/site-account/download/route.ts")
    check("the download route: who is the website's own session, for this host's creator", /siteOwnerOfHost\(db, host\)/.test(route) && /visitorOfRequest\(request, \{ creatorId: owner\.creatorId \}\)/.test(route) && /customerById\(db, visitor\)/.test(route))
    check("  the order must be this customer's, by the email the session proved", /customerOrderAccess\(db, \{ creatorId: owner\.creatorId, email: customer\.email \}, orderId\)/.test(route))
    check("  only a file that order lists, asked against its own line's token", /access\.detail\.lines\.find\(\(l\) => l\.files\.some\(\(f\) => f\.id === fileId\)\)/.test(route) && /access\.tokens\.get\(line\.orderId\)/.test(route))
    check("  then the door every download goes through, with the same limits and scan gate", /resolveDownloadAccess\(db, \{ assetId: fileId, receiptToken: token, userId: null \}\)/.test(route) && /downloadRateLimit\(/.test(route) && /purchaseRateLimit\(/.test(route) && /gateDownload\(db, asset, \{ isCreator: false \}\)/.test(route))
    check("  a guest is sent to sign in, and back to the order after", /\/account\/login/.test(route) && /searchParams\.set\("return", `\/account\/orders\/\$\{orderId\}`\)/.test(route))
    check("  never a storage path, an id or a database error in what it answers", !/file_path\s*[,}]/.test(route.replace(/asset\.file_path/g, "")) && !/NextResponse\.json\(\{ error: (error|e)/.test(route))
    const visitor = code("lib/site-accounts/theme-visitor.ts")
    check("an imported theme's account links downloads to the order's page", /siteCustomer\(db, row, `https:\/\/\$\{getMainDomain\(\)\}`, \{ orderPages: true \}\)/.test(visitor))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The email with the code")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const mail = codeEmail({ store: "Mara <b>Lind</b>", code: "042917", host: "www.maralind.com", minutes: 10 })
    check("the code and the store in the subject, on one line with no markup", mail.subject === "042917 is your code for Mara b Lind /b" && mail.fromName === "Mara b Lind /b", mail.subject)
    check("a store name cannot put markup in the email", !mail.html.includes("<b>Lind</b>") && mail.text.includes("10 minutes") && mail.html.includes("maralind.com"))
    check("no link to follow: a code to type, on the website that asked", !/href=/i.test(mail.html))
    const logo = codeEmail({ store: "Maralind", code: "042917", host: "maralind.com", minutes: 10, logoUrl: "https://cdn.test/logo.png" })
    check("the store's logo on top, with the store's name as its words", /<img[^>]*src="https:\/\/cdn\.test\/logo\.png" alt="Maralind"/.test(logo.html))
    for (const bad of ["javascript:alert(1)", "http://cdn.test/logo.png", 'https://cdn.test/a.png" onerror="x', "data:image/png;base64,AAAA"]) {
      check(`  not a logo the email shows: ${bad.slice(0, 30)}`, !/<img/.test(codeEmail({ store: "M", code: "1", host: "m.com", minutes: 10, logoUrl: bad }).html))
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The code email comes from the store, reliably")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const db = sitesDb()
    const t = Date.parse("2026-09-25T12:00:00Z")
    const { d, sent } = deps(db, t, { brand: async () => ({ name: "Mara Lind Studio", logoUrl: "https://cdn.test/m.png", replyTo: "hello@maralind.com" }) })
    const r = await requestCode({ host: HOST, email: "visitor@mail.test", returnPath: "/account" }, d)
    const mail = sent[0]
    check("from the store by name, with its logo, and a reply reaches the store", r.ok && mail?.fromName === "Mara Lind Studio" && mail.html.includes("https://cdn.test/m.png") && mail.replyTo === "hello@maralind.com", mail && { fromName: mail.fromName, replyTo: mail.replyTo })
    const plain = deps(sitesDb(), t)
    await requestCode({ host: HOST, email: "visitor@mail.test", returnPath: "/account" }, plain.d)
    check("a store given only by name still sends, with no reply-to of its own", plain.sent[0]?.fromName === "Maralind" && (plain.sent[0]?.replyTo ?? null) === null && !/<img/.test(plain.sent[0]?.html ?? ""))
    const route = code("app/api/site-account/code/route.ts")
    check("the route sends it as a code they just asked for: transactional, at once, never held by a stale bounce", /transactional: true/.test(route) && /replyTo: mail\.replyTo \|\| undefined/.test(route))
    check("  and signs it with the store's identity, the same as its receipts and order emails", /brand: \(creatorId\) => siteBrand\(db, creatorId\)/.test(route) && /storeIdentity\(db, creatorId\)/.test(code("lib/site-accounts/site-brand.ts")))
    check("  a reply-to only the store chose: never the owner's own login address", /store_settings"\)\.select\("contact_email"\)/.test(code("lib/site-accounts/site-brand.ts")) && /replyTo \}/.test(code("lib/site-accounts/site-brand.ts")) && !/identity\?\.email/.test(code("lib/site-accounts/site-brand.ts")))
    const mg = code("lib/mailgun.ts")
    check("when the sending address is swapped for the signed one, the store's name stays on it", /const named = built\.match\(/.test(mg) && /quotedFrom\(`\$\{named\} <\$\{signedEmail\}>`\)/.test(mg))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The SQL: part 33, complete, safe twice, closed to the public key")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const part = read("supabase/sql/run-now/33_site_customers.sql")
    const lines = part.trim().split("\n")
    const migration = readdirSync(join(process.cwd(), "supabase/migrations")).find((f) => /_site_customers\.sql$/.test(f)) ?? ""
    check("part 33 is there, with its migration", lines.length > 10 && migration !== "")
    check("one comment line, then one statement per line", lines[0].startsWith("/*") && lines[0].endsWith("*/") && lines.slice(1).every((l) => /;$/.test(l) && !l.startsWith("/*")))
    const statements = new Set(read(`supabase/migrations/${migration}`).split("\n").filter((l) => l.trim() && !l.startsWith("/*")))
    check("every statement of the part is the migration's, word for word", lines.slice(1).every((l) => statements.has(l)))
    for (const table of ["site_customers", "site_customer_codes", "site_customer_wishlist"]) {
      check(`${table}: made only if it is not there`, part.includes(`CREATE TABLE IF NOT EXISTS public.${table} (`))
      check(`${table}: row level security on`, part.includes(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`))
      check(`${table}: closed to the public key`, part.includes(`REVOKE ALL ON public.${table} FROM anon, authenticated;`))
    }
    check("no policy opens any of them", !/CREATE POLICY/i.test(part))
    check("every index is made only if it is not there", (part.match(/CREATE (UNIQUE )?INDEX/g) ?? []).length === (part.match(/CREATE (UNIQUE )?INDEX IF NOT EXISTS/g) ?? []).length)
    check("one customer per website and email, stored lower case", /UNIQUE INDEX IF NOT EXISTS site_customers_creator_email ON public\.site_customers \(creator_id, email\)/.test(part) && /CHECK \(email = lower\(email\)\)/.test(part))
    check("the database itself refuses a sixth try", /CONSTRAINT site_customer_codes_attempts CHECK \(attempts BETWEEN 0 AND 5\)/.test(part))
    check("and no column holds a code, only its hash", /code_hash text NOT NULL/.test(part) && !/\bcode text\b/.test(part))
    check("no statement touches auth.users, profiles or creators beyond pointing at a creator, and none changes a row", !/auth\.users|ALTER TABLE public\.(profiles|creators)|\bINSERT\b|\bUPDATE\b|DELETE FROM/i.test(lines.slice(1).join("\n").replace(/ON DELETE CASCADE/g, "")))
    const after = read("supabase/sql/run-now/99_check_after.sql")
    check("the check after has its column", /as p33_site_customers/.test(after) && /to_regclass\('public\.site_customer_codes'\) is not null/.test(after))
    check("and the README its row", /`33_site_customers\.sql`/.test(read("supabase/sql/run-now/README.md")))
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
