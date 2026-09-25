/**
 * ===========================================================================
 *  SIGNING IN TO A CREATOR'S WEBSITE, AND THE WISHLIST IT KEEPS
 * ===========================================================================
 * What is held here, and why each one matters:
 *
 *   THE WAY BACK      an address is followed only when its host is a host a
 *                     creator's published website is served at, looked up in
 *                     the database. Everything shaped like an open redirect
 *                     is thrown at it.
 *   THE CODE          signed, two minutes, bound to one host, one browser's
 *                     state and one creator, and exchanged once (Postgres,
 *                     not memory). Expiry, tampering, replay and a stranger's
 *                     link are each refused.
 *   THE SESSION       only good on the host and for the creator it was made
 *                     for.
 *   THE WISHLIST      every read and write scoped by the session's person
 *                     and the website's creator, run against a database that
 *                     holds other people's rows and other creators'
 *                     products; and the table's own row level security, run
 *                     as the policy says, so a person reaches only their own
 *                     rows.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { FakeSupabase } from "./fake-supabase"
import { classifySiteHost, parseReturnUrl, returnPathOf, siteOwnerOfHost } from "@/lib/site-accounts/hosts"
import {
  CODE_TTL_MS,
  SESSION_TTL_MS,
  checkFormProof,
  formProof,
  isSitePath,
  mintCode,
  mintSession,
  newState,
  readCode,
  readSession,
  sameState,
} from "@/lib/site-accounts/token"
import { claimCode } from "@/lib/site-accounts/codes"
import { exchangeCode } from "@/lib/site-accounts/exchange"
import { visitorFrom } from "@/lib/site-accounts/session"
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
import { siteCustomer } from "@/lib/site-accounts/account-data"

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

const RULES = { mainDomain: "storelib.com", sitesDomain: "storelib.com" }
const CREATOR = "11111111-1111-4111-8111-111111111111"
const OTHER_CREATOR = "22222222-2222-4222-8222-222222222222"
const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const P1 = "10000000-0000-4000-8000-000000000001"
const P2 = "10000000-0000-4000-8000-000000000002"
const P_DRAFT = "10000000-0000-4000-8000-000000000003"
const P_OTHER = "20000000-0000-4000-8000-000000000001"

/** The rows a creator's website is looked up by, and a second creator beside them. */
function sitesDb(): FakeSupabase {
  const db = new FakeSupabase()
  db.table("profiles", {}, [
    { id: "u-maralind", username: "maralind" },
    { id: "u-other", username: "otherone" },
    { id: "u-noweb", username: "noweb" },
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
  db.table("profiles_extra", {})
  db.table("custom_domains", {}, [
    { creator_id: CREATOR, domain: "maralind.com", status: "active", purpose: "website" },
    { creator_id: CREATOR, domain: "links.maralind.com", status: "active", purpose: "creator_page" },
    { creator_id: CREATOR, domain: "pending-maralind.com", status: "pending", purpose: "website" },
    { creator_id: OTHER_CREATOR, domain: "other.shop", status: "ssl_provisioning", purpose: "website" },
  ])
  db.table("site_account_codes", { unique: [["jti"]] })
  return db
}

async function main() {
  // ═══════════════════════════════════════════════════════════════════════
  section("The way back is one of the creator's own website hosts")
  // ═══════════════════════════════════════════════════════════════════════
  {
    check("a creator's storelib subdomain is a website host", classifySiteHost("maralind.storelib.com", RULES)?.kind === "subdomain")
    check("a connected domain is a candidate", classifySiteHost("www.maralind.com", RULES)?.kind === "custom")
    for (const host of ["storelib.com", "www.storelib.com", "app.storelib.com", "api.storelib.com", "mcp.storelib.com", "a.b.storelib.com", "localhost", "localhost:3309", "127.0.0.1", "preview-123.vercel.app", "", "evil..com", "exa mple.com"]) {
      check(`"${host}" is not a website host`, classifySiteHost(host, RULES) === null)
    }

    const ok = parseReturnUrl("https://maralind.storelib.com/account?x=1#frag")
    check("a page on a website parses, without its fragment", ok?.host === "maralind.storelib.com" && ok?.path === "/account?x=1" && ok?.href === "https://maralind.storelib.com/account?x=1", ok)
    for (const bad of [
      "http://maralind.storelib.com/account",
      "javascript:alert(1)",
      "//evil.com/account",
      "https://maralind.storelib.com@evil.com/",
      "https://user:pass@maralind.storelib.com/",
      "https://maralind.storelib.com/api/site-account/exchange",
      "https://maralind.storelib.com/\\evil.com",
      "https://maralind.storelib.com/a b",
      "data:text/html,hi",
      "https://maralind.storelib.com/" + "x".repeat(3000),
      42,
      null,
    ]) {
      check(`refused: ${String(bad).slice(0, 60)}`, parseReturnUrl(bad) === null)
    }
    check("the userinfo trick is not our host", parseReturnUrl("https://maralind.storelib.com:@evil.com/")?.host !== "maralind.storelib.com")

    check("a return path is a path", returnPathOf("/wishlist") === "/wishlist" && returnPathOf("/products/x?y=1") === "/products/x?y=1")
    for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "/api/site-account/wishlist", "", " /x", "/x y"]) {
      check(`a return path "${bad}" falls back to the account page`, returnPathOf(bad) === "/account")
    }

    const db = sitesDb()
    const sub = await siteOwnerOfHost(db, "maralind.storelib.com", RULES)
    check("the subdomain belongs to its creator", sub?.creatorId === CREATOR && sub.kind === "subdomain", sub)
    const custom = await siteOwnerOfHost(db, "www.maralind.com", RULES)
    check("the verified website domain belongs to its creator, at www", custom?.creatorId === CREATOR && custom.kind === "custom", custom)
    check("and at its bare name", (await siteOwnerOfHost(db, "maralind.com", RULES))?.creatorId === CREATOR)
    check("a domain still waiting for DNS is not followed", (await siteOwnerOfHost(db, "pending-maralind.com", RULES)) === null)
    check("a creator page domain is not a website", (await siteOwnerOfHost(db, "links.maralind.com", RULES)) === null)
    check("a certificate on its way still counts as verified", (await siteOwnerOfHost(db, "other.shop", RULES))?.creatorId === OTHER_CREATOR)
    check("nobody's domain is nobody's", (await siteOwnerOfHost(db, "evil.com", RULES)) === null)
    check("a live AI-built site under the name is not a website with accounts", (await siteOwnerOfHost(db, "aisite.storelib.com", RULES)) === null)
    check("a creator with nothing published has no website to sign in to", (await siteOwnerOfHost(db, "noweb.storelib.com", RULES)) === null)
    check("an unknown name is nobody's", (await siteOwnerOfHost(db, "ghost.storelib.com", RULES)) === null)
    const broken = new FakeSupabase()
    check("a database that answers nothing places nothing", (await siteOwnerOfHost(broken, "maralind.storelib.com", RULES)) === null)
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The code: signed, short, one host, one browser, once")
  // ═══════════════════════════════════════════════════════════════════════
  const now = Date.parse("2026-09-25T12:00:00Z")
  const state = newState()
  const code = mintCode({ userId: USER_A, creatorId: CREATOR, host: "maralind.storelib.com", state, returnPath: "/account" }, now)
  {
    check("a code is made", typeof code === "string" && code.startsWith("v1."))
    const claims = readCode(code, now + 1000)
    check("and reads back with everything it was made with", claims?.u === USER_A && claims.c === CREATOR && claims.h === "maralind.storelib.com" && claims.r === "/account" && claims.s === state, claims)
    check("two minutes, not longer", readCode(code, now + CODE_TTL_MS + 1) === null && readCode(code, now + CODE_TTL_MS - 1000) !== null)
    const [v, body, sig] = code!.split(".")
    const forged = JSON.parse(Buffer.from(body, "base64url").toString("utf8"))
    forged.u = USER_B
    check("changing who it is for breaks the signature", readCode(`${v}.${Buffer.from(JSON.stringify(forged)).toString("base64url")}.${sig}`, now) === null)
    check("a signature from another key is nothing", (() => {
      const saved = process.env.SITE_ACCOUNT_SECRET
      process.env.SITE_ACCOUNT_SECRET = "a-completely-different-secret-value-0123456789"
      const other = mintCode({ userId: USER_A, creatorId: CREATOR, host: "maralind.storelib.com", state, returnPath: "/account" }, now)
      process.env.SITE_ACCOUNT_SECRET = saved
      return readCode(other, now) === null
    })())
    check("a code is not a session", readSession(code, now) === null)
    check("junk is nothing", readCode("v1.abc.def", now) === null && readCode("", now) === null && readCode(null, now) === null && readCode("x".repeat(5000), now) === null)
    check("a code cannot be made for a path that leaves the website", mintCode({ userId: USER_A, creatorId: CREATOR, host: "maralind.storelib.com", state, returnPath: "//evil.com" }, now) === null)
    check("nor for a bad state", mintCode({ userId: USER_A, creatorId: CREATOR, host: "maralind.storelib.com", state: "short", returnPath: "/account" }, now) === null)
    check("a site path is one slash then a page", isSitePath("/a/b?c") && !isSitePath("//x") && !isSitePath("/\\x") && !isSitePath("x"))
    check("state compares only equal states", sameState(state, state) && !sameState(state, newState()) && !sameState(null, state))
  }

  {
    const db = sitesDb()
    const claim = readCode(code, now)!
    check("the first exchange claims the code", (await claimCode(db, claim)) === "claimed")
    check("the second is told it was used", (await claimCode(db, claim)) === "used")
    check("the claim is a row in Postgres, keyed by the code's id", db.rows("site_account_codes").length === 1 && db.rows("site_account_codes")[0].jti === claim.j)
    const noTable = new FakeSupabase()
    check("with no table (SQL not run) a code is refused, not trusted", (await claimCode(noTable, claim)) === "unavailable")
    check("and it is not an in-memory set", !/new Set|new Map/.test(read("lib/site-accounts/codes.ts")))
  }

  {
    const db = sitesDb()
    const fresh = mintCode({ userId: USER_A, creatorId: CREATOR, host: "maralind.storelib.com", state, returnPath: "/wishlist" }, now)
    const good = await exchangeCode(db, { code: fresh, host: "maralind.storelib.com", state }, now + 500, RULES)
    check("the exchange gives a session and the path to land on", good.ok === true && good.returnPath === "/wishlist", good)
    const again = await exchangeCode(db, { code: fresh, host: "maralind.storelib.com", state }, now + 900, RULES)
    check("the same code a second time is refused as used", again.ok === false && again.why === "used", again)

    const other = mintCode({ userId: USER_A, creatorId: CREATOR, host: "maralind.storelib.com", state, returnPath: "/account" }, now)
    const wrongHost = await exchangeCode(db, { code: other, host: "otherone.storelib.com", state }, now, RULES)
    check("a code taken to another website is refused", wrongHost.ok === false && wrongHost.why === "mismatch")
    const strangersLink = await exchangeCode(db, { code: other, host: "maralind.storelib.com", state: newState() }, now, RULES)
    check("a code arriving in a browser with another state is refused (a stranger's link)", strangersLink.ok === false && strangersLink.why === "mismatch")
    const noState = await exchangeCode(db, { code: other, host: "maralind.storelib.com", state: null }, now, RULES)
    check("and so is one with no state at all", noState.ok === false && noState.why === "mismatch")
    const late = await exchangeCode(db, { code: other, host: "maralind.storelib.com", state }, now + CODE_TTL_MS + 5, RULES)
    check("an expired code is refused as expired", late.ok === false && late.why === "expired")
    const moved = mintCode({ userId: USER_A, creatorId: OTHER_CREATOR, host: "maralind.storelib.com", state, returnPath: "/account" }, now)
    const movedResult = await exchangeCode(db, { code: moved, host: "maralind.storelib.com", state }, now, RULES)
    check("a code naming another creator than the host's is refused", movedResult.ok === false && movedResult.why === "mismatch")
    check("nothing refused was claimed", db.rows("site_account_codes").length === 1)

    const session = good.ok ? good.session : ""
    const visitor = visitorFrom(session, "maralind.storelib.com", { creatorId: CREATOR }, now + 1000)
    check("the session names the person and the creator on its host", visitor?.userId === USER_A && visitor.creatorId === CREATOR, visitor)
    check("the session is nobody on another host", visitorFrom(session, "otherone.storelib.com", undefined, now) === null)
    check("the session is nobody for another creator's page", visitorFrom(session, "maralind.storelib.com", { creatorId: OTHER_CREATOR }, now) === null)
    check("fourteen days, then nobody", visitorFrom(session, "maralind.storelib.com", undefined, now + SESSION_TTL_MS + 1000) === null)
    check("a session is not a code", readCode(session, now) === null)
    check("a session minted for one host is not accepted as another", readSession(mintSession({ userId: USER_A, creatorId: CREATOR, host: "a.storelib.com" }, now), now)?.h === "a.storelib.com")
  }

  {
    const proof = formProof({ userId: USER_A, returnUrl: "https://maralind.storelib.com/account", state }, now)
    check("the consent form's proof checks for its person, address and state", checkFormProof(proof, { userId: USER_A, returnUrl: "https://maralind.storelib.com/account", state }, now + 1000))
    check("not for another person", !checkFormProof(proof, { userId: USER_B, returnUrl: "https://maralind.storelib.com/account", state }, now))
    check("not for another address", !checkFormProof(proof, { userId: USER_A, returnUrl: "https://evil.storelib.com/account", state }, now))
    check("not after ten minutes", !checkFormProof(proof, { userId: USER_A, returnUrl: "https://maralind.storelib.com/account", state }, now + 11 * 60_000))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The routes around it")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const start = read("app/api/site-account/start/route.ts")
    check("start takes the host from the request, never from the query", /const host = hostOf\(request\)/.test(start) && /returnPathOf\(url\.searchParams\.get\("return"\)\)/.test(start))
    check("and keeps the state in an httpOnly cookie for /api/site-account only",
      /res\.cookies\.set\(STATE_COOKIE, state, stateCookie\(host\)\)/.test(start) && /httpOnly: true[^}]*path: STATE_PATH/.test(read("lib/site-accounts/session.ts")))
    const grant = read("app/account/site/grant/route.ts")
    check("the grant refuses a POST that did not come from storelib.com", /fromHere/.test(grant) && /status: 403/.test(grant))
    check("and checks the form's proof and the host again before minting", /checkFormProof\(proof/.test(grant) && /siteOwnerOfHost\(createAdminClient\(\), target\.host\)/.test(grant) && grant.indexOf("checkFormProof") < grant.indexOf("mintCode("))
    check("the redirect carrying the code sends no Referer on", /Referrer-Policy", "no-referrer"/.test(read("lib/site-accounts/respond.ts")))
    const page = read("app/account/site/page.tsx")
    check("the consent page refuses anything that is not a creator's website", /if \(!target \|\| !state \|\| !owner\) return <Refused \/>/.test(page))
    check("signed out, it sends to the existing sign in with a path back to itself", /redirect\(`\$\{signup \? "\/signup" : "\/login"\}\?next=\$\{encodeURIComponent\(self\)\}`\)/.test(page))
    check("the session cookie is httpOnly and host-only", /httpOnly: true, secure: !isLocal\(host\), sameSite: "lax" as const, path: "\/"/.test(read("lib/site-accounts/session.ts")) && !/domain:/.test(read("lib/site-accounts/session.ts")))
    const wl = read("app/api/site-account/wishlist/route.ts")
    check("a wishlist write must come from the website's own page", /sameOriginWrite\(request, host\)/.test(wl))
    check("and the person is the session's, never the request's", /visitorOfRequest\(request\)/.test(wl) && !/body\.userId|body\.user_id/.test(wl))
    check("auth itself is untouched: nothing here writes a Supabase cookie", !/sb-|auth\.setSession|signInWith/.test(read("app/api/site-account/exchange/route.ts") + read("app/account/site/grant/route.ts")))
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
  section("A signed-in visitor's list: their rows, this creator's products")
  // ═══════════════════════════════════════════════════════════════════════
  const wishDb = () => {
    const db = new FakeSupabase()
    db.table("products", {}, [
      { id: P1, creator_id: CREATOR, status: "published", title: "Linen apron", slug: "linen-apron", price_cents: 6400, compare_at_cents: null, thumbnail_url: null },
      { id: P2, creator_id: CREATOR, status: "published", title: "Card wallet", slug: "card-wallet", price_cents: 2900, compare_at_cents: null, thumbnail_url: null },
      { id: P_DRAFT, creator_id: CREATOR, status: "draft", title: "Unreleased", slug: "unreleased", price_cents: 100, compare_at_cents: null, thumbnail_url: null },
      { id: P_OTHER, creator_id: OTHER_CREATOR, status: "published", title: "Somebody else's", slug: "else", price_cents: 100, compare_at_cents: null, thumbnail_url: null },
    ])
    db.table("wishlist_items", {
      unique: [["user_id", "product_id"]],
      defaults: (d) => ({ id: `w-${Math.random().toString(36).slice(2)}`, created_at: d.now() }),
    }, [
      { user_id: USER_A, product_id: P_OTHER, created_at: "2026-09-20T00:00:00Z" },
      { user_id: USER_B, product_id: P1, created_at: "2026-09-21T00:00:00Z" },
      { user_id: USER_B, product_id: P2, created_at: "2026-09-21T00:00:00Z" },
    ])
    return db
  }
  const A = { userId: USER_A, creatorId: CREATOR }
  {
    const db = wishDb()
    check("empty for this website, although they saved another creator's product", (await listSiteWishlist(db, A)).ids.length === 0)
    const added = await addToSiteWishlist(db, A, P1)
    check("saving this creator's product lists it", JSON.stringify(added.ids) === JSON.stringify([P1]), added)
    await addToSiteWishlist(db, A, P1)
    check("saving twice is saving once", db.rows("wishlist_items").filter((r) => r.user_id === USER_A && r.product_id === P1).length === 1)
    await addToSiteWishlist(db, A, P_OTHER)
    await addToSiteWishlist(db, A, P_DRAFT)
    await addToSiteWishlist(db, A, "not-an-id")
    check("another creator's product, a draft and junk are never added from this website", db.rows("wishlist_items").filter((r) => r.user_id === USER_A).length === 2)
    await removeFromSiteWishlist(db, A, P1)
    check("taking out removes this person's row only", !db.rows("wishlist_items").some((r) => r.user_id === USER_A && r.product_id === P1) && db.rows("wishlist_items").some((r) => r.user_id === USER_B && r.product_id === P1))
    await removeFromSiteWishlist(db, A, P_OTHER)
    check("and a website cannot take out another creator's product from their list", db.rows("wishlist_items").some((r) => r.user_id === USER_A && r.product_id === P_OTHER))
    const B = await listSiteWishlist(db, { userId: USER_B, creatorId: CREATOR })
    check("another person's list is theirs, untouched", B.ids.length === 2)
  }
  {
    const db = wishDb()
    const first = await mergeIntoSiteWishlist(db, A, [P2, P1, P_OTHER, P_DRAFT, "junk"])
    check("the guest list merges this creator's published products only", JSON.stringify([...first.ids].sort()) === JSON.stringify([P1, P2].sort()), first)
    const second = await mergeIntoSiteWishlist(db, A, [P2, P1])
    check("merging again adds nothing twice", second.ids.length === 2 && db.rows("wishlist_items").filter((r) => r.user_id === USER_A && r.product_id !== P_OTHER).length === 2)
    const cards = await wishlistCards(db, CREATOR, [P2, P_OTHER, P1])
    check("cards are drawn in saved order, this creator's only", cards.map((c) => c.id).join() === [P2, P1].join() && cards[0].settings.url === "/products/card-wallet", cards)
    check("a bad scope reads nothing", (await listSiteWishlist(db, { userId: "x", creatorId: CREATOR })).ids.length === 0)
  }
  {
    const db = new FakeSupabase()
    db.table("products", {}, [{ id: P1, creator_id: CREATOR, status: "published" }])
    const result = await listSiteWishlist(db, A)
    check("with no wishlist table the page is told to keep the browser's list", result.available === false)
  }
  {
    /**
     * THE TABLE'S OWN RULE. scripts/012_create_wishlist_table.sql: a signed
     * in person reads and changes rows whose user_id is theirs. Run here as
     * Postgres runs a policy: a filter on every read and a check on every
     * write, for one auth.uid(). This is the "fit" the existing table was
     * chosen for; the website's routes add the creator on top.
     */
    const sql = read("scripts/012_create_wishlist_table.sql")
    check("the policy is on, and scopes a signed in person to their own user_id", /ENABLE ROW LEVEL SECURITY/.test(sql) && /auth\.uid\(\) = user_id/.test(sql))
    const db = wishDb()
    const as = (uid: string) => {
      const visible = (r: Record<string, unknown>) => r.user_id === uid || (r.user_id == null && r.guest_id != null)
      return {
        read: () => db.rows("wishlist_items").filter(visible),
        insert: (row: Record<string, unknown>) => (visible(row) ? (db.tables.wishlist_items.push(row), true) : false),
        remove: (productId: string) => {
          const before = db.rows("wishlist_items").length
          db.tables.wishlist_items = db.rows("wishlist_items").filter((r) => !(visible(r) && r.product_id === productId))
          return before - db.rows("wishlist_items").length
        },
      }
    }
    check("A reads only A's rows", as(USER_A).read().every((r) => r.user_id === USER_A))
    check("A cannot write a row as B", as(USER_A).insert({ user_id: USER_B, product_id: P2 }) === false)
    check("A deleting a product B saved touches none of B's rows", as(USER_A).remove(P1) === 0 && db.rows("wishlist_items").some((r) => r.user_id === USER_B && r.product_id === P1))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The account page: this creator's purchases only")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const db = new FakeSupabase()
    db.table("profiles", {}, [{ id: USER_A, display_name: "Alex Morgan", email: "Alex@Example.com", username: "alex" }])
    db.table("entitlements", {}, [
      { buyer_id: USER_A, product_id: P1, created_at: "2026-09-21T10:00:00Z" },
      { buyer_id: USER_A, product_id: P_OTHER, created_at: "2026-09-22T10:00:00Z" },
      { buyer_id: USER_B, product_id: P2, created_at: "2026-09-22T10:00:00Z" },
    ])
    db.table("orders", {}, [
      { id: "o-1", buyer_id: USER_A, product_id: P2, status: "completed", created_at: "2026-09-23T10:00:00Z", receipt_token: "r-tok", amount_cents: 2900 },
      { id: "o-2", buyer_id: USER_A, product_id: P1, status: "refunded", created_at: "2026-09-24T10:00:00Z", receipt_token: "r-2", amount_cents: 6400 },
    ])
    db.table("products", {}, [
      { id: P1, creator_id: CREATOR, status: "published", title: "Linen apron", slug: "linen-apron", thumbnail_url: null, type: "digital" },
      { id: P2, creator_id: CREATOR, status: "published", title: "Card wallet", slug: "card-wallet", thumbnail_url: null, type: "physical" },
      { id: P_OTHER, creator_id: OTHER_CREATOR, status: "published", title: "Elsewhere", slug: "else", thumbnail_url: null, type: "digital" },
    ])
    const customer = await siteCustomer(db, A, "https://storelib.com")
    check("name, first name and email", customer?.name === "Alex Morgan" && customer.first_name === "Alex" && customer.email === "alex@example.com", customer)
    check("two orders from this creator, none from another, newest first", customer?.orders.map((o) => o.title).join() === "Card wallet,Linen apron", customer?.orders)
    check("a download opens in the Library", customer?.orders[1].action_url === `https://storelib.com/library/products/${P1}` && customer.orders[1].action_label === "Download")
    check("anything else opens its receipt", customer?.orders[0].action_url === "https://storelib.com/receipt/r-tok" && customer.orders[0].action_label === "Receipt")
    check("the price is written out", customer?.orders[0].price === "$29.00")
    check("a refunded order is not a purchase", !customer?.orders.some((o) => o.date.includes("24")))
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
