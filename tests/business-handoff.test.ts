/**
 * Handing a business over (lib/handoff, SQL 20271131).
 *
 * The owner: "I build OnePages, stores, products and creator setups for
 * clients from my own account. I need to give each client their complete
 * prepared business without sharing my login or forcing a rebuild."
 *
 *   the token: 32 random bytes, only its SHA-256 kept, never in a row or a log
 *   expiry, single use and revocation
 *   wrong email, the founder's own link, the recipient's three business limit
 *   every table with a creator_id or user_id is either left with the business,
 *   detached by the transfer, or checked by it, with its reason
 *   every route asks who is signing in, and the claim only from Storelib's page
 *   a new account (sign up with the claim as `next`) and an existing one, each
 *   through the real route handlers on the repo's in-memory PostgREST
 *   a failed transfer changes nothing and the link still works
 *   end to end: the founder sends it, tracks it, the client signs up from the
 *   email, a payout balance holds it, accept, and every owner, team, billing
 *   and address change checked; then resend, cancel and expiry
 *
 * The SQL itself ran on a local Postgres 16 built by scripts/sql-harness
 * (scripts/sql-harness/business-handoff.sql). It has not run on Storelib's
 * own database.
 *
 *   STORELIB_TEST_SEAMS=1 NODE_OPTIONS="--conditions=react-server" npx tsx tests/business-handoff.test.ts
 */
process.env.STORELIB_TEST_SEAMS = "1"
process.env.NEXT_PUBLIC_MAIN_DOMAIN = process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com"

import { createHash, randomBytes } from "node:crypto"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { NextResponse } from "next/server"
import { fakeDb } from "./_fake-db"
import { setHandoffDepsForTests, type HandoffDeps } from "@/lib/handoff/deps"
import { acceptClaim, hashToken, readClaim, viewerOf } from "@/lib/handoff/server"
import {
  CLAIM_PREFIX,
  TOKEN_BYTES,
  TOKEN_PATTERN,
  canonicalToken,
  makeToken,
  claimPath,
  claimSignInPath,
  claimStateOf,
  founderPermissions,
  refusalOf,
  refusalOfSql,
  tokenShapeOk,
  ttlDays,
  type ClaimState,
  type HandoffRow,
} from "@/lib/handoff/rules"
import { HANDOFF_COVERAGE, DETACHED_TABLES, CHECKED_TABLES } from "@/lib/handoff/coverage"
import { handoffInviteEmail } from "@/lib/handoff/email"
import { ClaimCard } from "@/components/handoff/claim-card"
import { destinationAfterAuth, readCarry } from "@/lib/auth/continue"
import { isReservedRootSegment } from "@/lib/routes/reserved-segments"
import { CLAIM_COOKIE, claimFallbackNext, claimSignInHref } from "@/lib/handoff/rules"
import { HANDED_HOME, handedBusinessOf } from "@/lib/handoff/home"
import { opensInApp } from "@/lib/platform/app-links"
import { inviteEmailFrom } from "@/lib/team/invite-links"
import { MAX_BUSINESSES } from "@/lib/businesses/rules"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 500)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/* People. Lia is the founder's login; Studio is the business she built for a client (its own account, linked to hers); Side is another business of hers. */
const LIA = "11111111-1111-4111-8111-111111111111"
const STUDIO = "22222222-2222-4222-8222-222222222222"
const SIDE = "33333333-3333-4333-8333-333333333333"
const TOM = "44444444-4444-4444-8444-444444444444"
const TOM_SHOP = "55555555-5555-4555-8555-555555555555"
const BEN = "66666666-6666-4666-8666-666666666666"
const BEN_A = "77777777-7777-4777-8777-777777777777"
const BEN_B = "88888888-8888-4888-8888-888888888888"
const NEWBIE = "99999999-9999-4999-8999-999999999999"
const STUDIO_CREATOR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const NOW = Date.parse("2026-11-07T12:00:00Z")
const DAY = 86_400_000

type AuthUser = { id: string; email: string | null; app_metadata?: Record<string, unknown> }

function world(over: { authUsers?: AuthUser[] } = {}) {
  const db = fakeDb(
    {
      business_links: [
        { owner_id: LIA, member_id: STUDIO, created_at: "2026-10-01T00:00:00Z" },
        { owner_id: LIA, member_id: SIDE, created_at: "2026-10-02T00:00:00Z" },
        { owner_id: TOM, member_id: TOM_SHOP, created_at: "2026-09-01T00:00:00Z" },
        { owner_id: BEN, member_id: BEN_A, created_at: "2026-09-01T00:00:00Z" },
        { owner_id: BEN, member_id: BEN_B, created_at: "2026-09-02T00:00:00Z" },
      ],
      creators: [{ id: STUDIO_CREATOR, user_id: STUDIO, slug: "glowstudio", username: "glowstudio", display_name: "Glow Studio", avatar_url: null, stripe_account_id: null }],
      profiles: [
        { id: STUDIO, username: "glowstudio", display_name: "Glow Studio", avatar_url: null, email: "lia+slb-1a2b3c4d@example.com" },
        { id: LIA, username: "lia", display_name: "Lia", avatar_url: null, email: "lia@example.com" },
      ],
      store_settings: [{ creator_id: STUDIO_CREATOR, store_name: "Glow Studio" }],
      onepages: [{ id: "op-1", owner_id: STUDIO, slug: "glowstudio" }],
      products: [
        { id: "p1", creator_id: STUDIO_CREATOR },
        { id: "p2", creator_id: STUDIO_CREATOR },
        { id: "p3", creator_id: STUDIO_CREATOR },
      ],
      sites: [{ id: "s1", creator_id: STUDIO_CREATOR }],
      custom_domains: [{ id: "d1", creator_id: STUDIO_CREATOR, domain: "glowstudio.co", status: "active" }],
      subscriptions: [],
      memberships: [],
      business_handoffs: [],
      business_handoff_events: [],
      verification_codes: [],
    },
    { unique: { business_handoffs: [["token_hash"]] } },
  )
  const auth: AuthUser[] = over.authUsers ?? [
    { id: LIA, email: "lia@example.com", app_metadata: { verified_email: "lia@example.com" } },
    { id: STUDIO, email: "lia+slb-1a2b3c4d@example.com", app_metadata: { verified_email: "lia+slb-1a2b3c4d@example.com", business_owner: LIA } },
    { id: SIDE, email: "lia+slb-99990000@example.com", app_metadata: { verified_email: "lia+slb-99990000@example.com" } },
    { id: TOM, email: "tom@example.com", app_metadata: { verified_email: "tom@example.com" } },
    { id: TOM_SHOP, email: "tom+slb-00001111@example.com", app_metadata: { verified_email: "tom+slb-00001111@example.com" } },
    { id: BEN, email: "ben@example.com", app_metadata: { verified_email: "ben@example.com" } },
    { id: NEWBIE, email: "new@example.com", app_metadata: { verified_email: "new@example.com" } },
  ]
  const calls = { updates: [] as { id: string; attrs: Record<string, unknown> }[], signOuts: [] as string[], mails: [] as { to: string; subject: string; text: string }[], caches: [] as unknown[], limited: 0 }
  let clock = NOW
  let limitAfter = Infinity
  let rpcFails: { message: string; code?: string } | null = null

  /*
    The transfer as business_handoff_accept does it (the SQL file is the
    truth; it ran on the harness). Enough of it to run the routes: the same
    checks in the same order, the same words, and the move of the one row.
  */
  const rpc = async (fn: string, a: Record<string, any>) => {
    if (fn !== "business_handoff_accept") return { data: null, error: { message: "unknown function" } }
    if (rpcFails) return { data: null, error: rpcFails }
    const err = (message: string) => ({ data: null, error: { message, code: "P0001" } })
    if (!a.p_handoff || !a.p_recipient || !/^[0-9a-f]{64}$/.test(a.p_token_hash ?? "")) return err("handoff_invalid")
    const h = db.tables.business_handoffs.find((r: any) => r.id === a.p_handoff && r.token_hash === a.p_token_hash)
    if (!h) return err("handoff_not_found")
    if (h.status === "accepted") return err("handoff_used")
    if (h.status === "revoked") return err("handoff_revoked")
    if (h.status === "expired" || Date.parse(h.expires_at) <= clock) return err("handoff_expired")
    const links = db.tables.business_links
    if (!links.some((l: any) => l.member_id === h.business_user_id && l.owner_id === h.from_owner_id)) return err("handoff_stale")
    if (a.p_recipient === h.business_user_id || a.p_recipient === h.from_owner_id || links.some((l: any) => l.owner_id === h.from_owner_id && l.member_id === a.p_recipient)) return err("handoff_self")
    if (links.some((l: any) => l.member_id === a.p_recipient)) return err("handoff_recipient_is_business")
    const email = String(a.p_recipient_email ?? "").trim().toLowerCase()
    const authEmail = auth.find((u) => u.id === a.p_recipient)?.email?.toLowerCase() ?? null
    if (email && authEmail !== email) return err("handoff_wrong_email")
    if (h.recipient_email && email !== h.recipient_email) return err("handoff_wrong_email")
    if (1 + links.filter((l: any) => l.owner_id === a.p_recipient).length >= 3) return err("handoff_limit")
    if (h.keep_founder && !/^[^@\s]+@[^@\s]+$/.test(a.p_founder_email ?? "")) return err("handoff_founder_email")
    links.splice(links.findIndex((l: any) => l.member_id === h.business_user_id), 1)
    links.push({ owner_id: a.p_recipient, member_id: h.business_user_id, created_at: new Date(clock).toISOString() })
    const team = (db.tables.store_team_members ??= [])
    team.splice(0, team.length, ...team.filter((t: any) => t.creator_id !== STUDIO_CREATOR && t.user_id !== h.business_user_id))
    if (h.keep_founder) team.push({ creator_id: STUDIO_CREATOR, email: a.p_founder_email, user_id: h.from_owner_id, status: "active", permissions: founderPermissions(h.founder_access) })
    const result = { business_user_id: h.business_user_id, creator_id: STUDIO_CREATOR, recipient_id: a.p_recipient, kept_founder: h.keep_founder }
    Object.assign(h, { status: "accepted", accepted_at: new Date(clock).toISOString(), accepted_by: a.p_recipient, result })
    db.tables.business_handoff_events.push({ handoff_id: h.id, business_user_id: h.business_user_id, event: "accepted", actor_id: a.p_recipient, ip: a.p_ip })
    return { data: result, error: null }
  }
  ;(db as any).rpc = rpc

  const deps: HandoffDeps = {
    db: db as any,
    async requestUser(request) {
      const id = request.headers.get("x-test-user")
      if (!id) return null
      const u = auth.find((x) => x.id === id)
      return u ? { id: u.id, email: u.email } : null
    },
    async rateLimit(options) {
      calls.limited++
      return calls.limited > limitAfter ? NextResponse.json({ error: options.message }, { status: 429 }) : null
    },
    async authUser(id) {
      return (auth.find((u) => u.id === id) as any) ?? null
    },
    async updateAuthUser(id, attrs) {
      calls.updates.push({ id, attrs })
      const u = auth.find((x) => x.id === id)
      if (u && typeof attrs.email === "string") u.email = attrs.email
      return true
    },
    async signOutEverywhere(userId) {
      calls.signOuts.push(userId)
      return true
    },
    async sendEmail(m) {
      calls.mails.push(m)
      return true
    },
    async payoutBalance() {
      return "none"
    },
    async forgetCaches(b) {
      calls.caches.push(b)
    },
    randomBytes,
    now: () => clock,
  }
  setHandoffDepsForTests(deps)
  return {
    db,
    auth,
    deps,
    calls,
    tick: (ms: number) => (clock += ms),
    limitAfter: (n: number) => ((calls.limited = 0), (limitAfter = n)),
    failRpc: (e: { message: string; code?: string } | null) => (rpcFails = e),
  }
}

const SITE = "https://storelib.com"
const asUser = (id: string | null, extra: Record<string, string> = {}) => ({ ...(id ? { "x-test-user": id } : {}), ...extra })
const jsonReq = (path: string, method: string, user: string | null, body?: unknown) =>
  new Request(`${SITE}${path}`, { method, headers: { "content-type": "application/json", ...asUser(user) }, body: body === undefined ? undefined : JSON.stringify(body) })
const formReq = (path: string, user: string | null, fields: Record<string, string>, headers: Record<string, string> = { origin: SITE, "sec-fetch-site": "same-origin" }) =>
  new Request(`${SITE}${path}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "203.0.113.7", ...headers, ...asUser(user) }, body: new URLSearchParams(fields).toString() })

async function main() {
  const handoffRoute = await import("@/app/api/handoff/route")
  const oneRoute = await import("@/app/api/handoff/[id]/route")
  const claimRoute = await import("@/app/api/handoff/claim/route")
  const switchRoute = await import("@/app/api/handoff/claim/switch/route")
  const signInRoute = await import("@/app/api/handoff/claim/sign-in/route")
  const idParams = (id: string) => ({ params: Promise.resolve({ id }) })

  console.log("\nThe token: random, long, kept only as its SHA-256")
  {
    const w = world()
    const res = await handoffRoute.POST(jsonReq("/api/handoff", "POST", STUDIO, { email: "Tom@Example.com ", days: 7 }))
    const body = (await res.json()) as { link: string; pending: { id: string; email: string; expiresAt: string }; emailed: boolean }
    const token = body.link.split(CLAIM_PREFIX)[1]
    check("a link is made for the business, signed in as it", res.status === 200 && typeof body.link === "string", body)
    const canonical = (token ?? "").replace(/-/g, "")
    check("  the link is short and clean: /team/claim/ and four groups of four, no ids", /^https:\/\/storelib\.com\/team\/claim\/[0-9a-hjkmnp-tv-z]{4}(-[0-9a-hjkmnp-tv-z]{4}){3}$/.test(body.link) && body.link.length <= 60 && !body.link.includes(STUDIO) && !body.link.includes(body.pending.id), body.link)
    check("  its token is 80 random bits in Crockford base32 (16 characters)", TOKEN_PATTERN.test(canonical) && tokenShapeOk(token), token)
    const row = w.db.tables.business_handoffs[0]
    check("  only the SHA-256 of it is stored", row.token_hash === createHash("sha256").update(canonical).digest("hex") && row.token_hash === hashToken(token) && /^[0-9a-f]{64}$/.test(row.token_hash))
    const everything = JSON.stringify(w.db.tables) + JSON.stringify(w.db.log)
    check("  and the token itself is in no row and no line of the record", !everything.includes(token) && !everything.includes(canonical))
    const typed = await readClaim(w.deps, canonical.toUpperCase(), null)
    check("  the same link opens typed in capitals or without its dashes", typed.ok && typed.state.kind === "signed_out" && hashToken(canonical.toUpperCase()) === row.token_hash, typed.ok ? typed.state.kind : typed)
    check("  a lookalike letter (i, l, o, u) is not a token", ["i", "l", "o", "u"].every((c) => !tokenShapeOk(c + canonical.slice(1))))
    check("  the email kept lower case, the expiry seven days on, the founder's login recorded", row.recipient_email === "tom@example.com" && Date.parse(row.expires_at) === NOW + 7 * DAY && row.from_owner_id === LIA && row.business_user_id === STUDIO)
    check("  the email went out through the mailer, with the link", w.calls.mails.length === 1 && w.calls.mails[0].to === "tom@example.com" && w.calls.mails[0].text.includes(body.link), w.calls.mails)
    const events = w.db.tables.business_handoff_events.map((e: any) => e.event)
    check("  and the record says created, then sent", events.join(",") === "created,sent", events)
    const tokens = new Set(Array.from({ length: 2000 }, () => makeToken(randomBytes(TOKEN_BYTES))))
    check("two thousand tokens, two thousand different ones, every one the right shape", tokens.size === 2000 && [...tokens].every((t) => TOKEN_PATTERN.test(t)))
    const counts = new Map<string, number>()
    for (const t of tokens) for (const ch of t) counts.set(ch, (counts.get(ch) ?? 0) + 1)
    check("  every one of the 32 letters is used, none much more than another (no bias)", counts.size === 32 && Math.max(...counts.values()) / Math.min(...counts.values()) < 1.5, Object.fromEntries(counts))
    check("  ten bytes of ones and of zeros give the ends of the alphabet", makeToken(new Uint8Array(10).fill(255)) === "z".repeat(16) && makeToken(new Uint8Array(10)) === "0".repeat(16))
    check("a token of another shape is not ours", !tokenShapeOk("short") && !tokenShapeOk(`${token}x`) && !tokenShapeOk("a".repeat(42) + "/") && !tokenShapeOk(null) && !tokenShapeOk(`${canonical}0`))
    const legacy = randomBytes(32).toString("base64url")
    check("a link made before the short ones (43 base64url characters) still opens as it was", tokenShapeOk(legacy) && canonicalToken(legacy) === legacy && claimPath(legacy) === `${CLAIM_PREFIX}${legacy}` && hashToken(legacy) === createHash("sha256").update(legacy).digest("hex"))

    const again = await handoffRoute.POST(jsonReq("/api/handoff", "POST", STUDIO, {}))
    check("one open link per business: a second one is refused", again.status === 409)

    const renewed = await oneRoute.POST(jsonReq(`/api/handoff/${body.pending.id}`, "POST", STUDIO, { send: false }), idParams(body.pending.id))
    const renewedBody = (await renewed.json()) as { link: string }
    const newToken = renewedBody.link.split(CLAIM_PREFIX)[1]
    check("New link: a new token, the old one stops working", renewed.status === 200 && newToken !== token && w.db.tables.business_handoffs[0].token_hash === hashToken(newToken))
    const old = await readClaim(w.deps, token, null)
    check("  the old link now reads as gone", old.ok && old.state.kind === "gone", old.ok ? old.state : old)
    const resend = await oneRoute.POST(jsonReq(`/api/handoff/${body.pending.id}`, "POST", STUDIO, { send: true }), idParams(body.pending.id))
    check("Send again within a minute of the last email is a double press", resend.status === 429)
    w.tick(61_000)
    const resend2 = await oneRoute.POST(jsonReq(`/api/handoff/${body.pending.id}`, "POST", STUDIO, { send: true }), idParams(body.pending.id))
    check("  a minute later it goes", resend2.status === 200 && w.calls.mails.length === 2)
  }

  console.log("\nHow long a link works")
  {
    check("seven days unless chosen", ttlDays(undefined) === 7 && ttlDays("") === 7)
    check("one to thirty days", ttlDays(1) === 1 && ttlDays("30") === 30 && ttlDays(0) === null && ttlDays(31) === null && ttlDays("7 days") === null && ttlDays(2.5) === null)
    const w = world()
    const res = await handoffRoute.POST(jsonReq("/api/handoff", "POST", STUDIO, { days: 45 }))
    check("forty five days is refused", res.status === 400)
    const r2 = await handoffRoute.POST(jsonReq("/api/handoff", "POST", STUDIO, { days: 1, email: "not an email" }))
    check("an email that is not one is refused", r2.status === 400 && w.db.tables.business_handoffs.length === 0)
    const r3 = await handoffRoute.POST(jsonReq("/api/handoff", "POST", STUDIO, { email: "lia@example.com" }))
    check("the founder's own email is refused", r3.status === 400)
  }

  /* A pending handoff row and its token, made the way the route makes them. */
  async function made(w: ReturnType<typeof world>, body: Record<string, unknown> = {}) {
    const res = await handoffRoute.POST(jsonReq("/api/handoff", "POST", STUDIO, body))
    const j = (await res.json()) as { link: string; pending: { id: string } }
    return { token: j.link.split(CLAIM_PREFIX)[1], id: j.pending.id }
  }

  console.log("\nExpiry, single use and revocation")
  {
    const w = world()
    const { token, id } = await made(w)
    w.tick(8 * DAY)
    const viewer = await viewerOf(w.deps, { id: TOM, email: "tom@example.com" })
    const expired = await readClaim(w.deps, token, viewer)
    check("past its days the link says expired", expired.ok && expired.state.kind === "expired")
    const out = await acceptClaim(w.deps, token, { id: TOM, email: "tom@example.com" }, { ip: null, userAgent: null })
    check("  and accepting it is refused, changing nothing", out.ok === false && out.status === 410 && w.db.tables.business_links.some((l: any) => l.member_id === STUDIO && l.owner_id === LIA))
    check("  the refusal is recorded", w.db.tables.business_handoff_events.some((e: any) => e.event === "failed" && e.detail?.reason === "expired"))
    const fresh = await made(w)
    check("an expired link makes way for a new one", !!fresh.token && fresh.id !== id && w.db.tables.business_handoffs.find((r: any) => r.id === id)?.status === "expired")

    const w2 = world()
    const two = await made(w2)
    const del = await oneRoute.DELETE(jsonReq(`/api/handoff/${two.id}`, "DELETE", STUDIO), idParams(two.id))
    check("Revoke stops the link", del.status === 200 && w2.db.tables.business_handoffs[0].status === "revoked")
    const after = await readClaim(w2.deps, two.token, await viewerOf(w2.deps, { id: TOM, email: "tom@example.com" }))
    check("  it says cancelled", after.ok && after.state.kind === "revoked")
    const accept = await acceptClaim(w2.deps, two.token, { id: TOM, email: "tom@example.com" }, { ip: null, userAgent: null })
    check("  and cannot be accepted", accept.ok === false && accept.status === 410)
    const delAgain = await oneRoute.DELETE(jsonReq(`/api/handoff/${two.id}`, "DELETE", STUDIO), idParams(two.id))
    check("  revoking twice is not found, not an error", delAgain.status === 404)

    const w3 = world()
    const three = await made(w3)
    const first = await acceptClaim(w3.deps, three.token, { id: TOM, email: "tom@example.com" }, { ip: "203.0.113.7", userAgent: "test" })
    check("single use: the first accept takes it", first.ok === true, first)
    const second = await acceptClaim(w3.deps, three.token, { id: NEWBIE, email: "new@example.com" }, { ip: null, userAgent: null })
    check("  a second account cannot", second.ok === false && second.status === 409, second)
    const mine = await readClaim(w3.deps, three.token, await viewerOf(w3.deps, { id: TOM, email: "tom@example.com" }))
    check("  the new owner reads It's yours", mine.ok && mine.state.kind === "accepted" && (mine.state as Extract<ClaimState, { kind: "accepted" }>).mine)
    const theirs = await readClaim(w3.deps, three.token, await viewerOf(w3.deps, { id: NEWBIE, email: "new@example.com" }))
    check("  anybody else reads already used", theirs.ok && theirs.state.kind === "accepted" && !(theirs.state as Extract<ClaimState, { kind: "accepted" }>).mine)
  }

  console.log("\nWrong email, the founder's own link, and the three business limit")
  {
    const w = world()
    const { token } = await made(w, { email: "tom@example.com" })
    const asNew = await readClaim(w.deps, token, await viewerOf(w.deps, { id: NEWBIE, email: "new@example.com" }))
    check("sent to tom@: signed in as another email reads wrong_email, naming both", asNew.ok && asNew.state.kind === "wrong_email" && (asNew.state as any).email === "tom@example.com" && (asNew.state as any).signedInAs === "new@example.com")
    const refused = await acceptClaim(w.deps, token, { id: NEWBIE, email: "new@example.com" }, { ip: null, userAgent: null })
    check("  and cannot accept it", refused.ok === false && refused.status === 403 && w.db.tables.business_links.some((l: any) => l.member_id === STUDIO && l.owner_id === LIA))
    for (const [who, id, email] of [["the founder's login", LIA, "lia@example.com"], ["the business itself", STUDIO, "lia+slb-1a2b3c4d@example.com"], ["the founder's other business", SIDE, "lia+slb-99990000@example.com"]] as const) {
      const s = await readClaim(w.deps, token, await viewerOf(w.deps, { id, email }))
      check(`self claim from ${who}: "own"`, s.ok && s.state.kind === "own", s.ok ? s.state.kind : s)
    }
    const self = await acceptClaim(w.deps, token, { id: LIA, email: "lia@example.com" }, { ip: null, userAgent: null })
    check("  and the founder cannot accept their own link", self.ok === false && self.status === 400)

    const w2 = world()
    const open = await made(w2)
    const ben = await readClaim(w2.deps, open.token, await viewerOf(w2.deps, { id: BEN, email: "ben@example.com" }))
    check(`a login with ${MAX_BUSINESSES} businesses already: "limit", explained, nothing merged`, ben.ok && ben.state.kind === "limit")
    const benAccept = await acceptClaim(w2.deps, open.token, { id: BEN, email: "ben@example.com" }, { ip: null, userAgent: null })
    check("  accepting is refused and the link still works", benAccept.ok === false && benAccept.status === 409 && w2.db.tables.business_handoffs[0].status === "pending")
    check("  the database says the same if two accepts race (23514 from business_links' own trigger)", refusalOfSql({ code: "23514", message: "One login can have at most 3 businesses" }).state === "limit")

    const w3 = world({
      authUsers: [
        { id: LIA, email: "lia@example.com", app_metadata: { verified_email: "lia@example.com" } },
        { id: STUDIO, email: "lia+slb-1a2b3c4d@example.com", app_metadata: { verified_email: "lia+slb-1a2b3c4d@example.com" } },
        { id: NEWBIE, email: "new@example.com", app_metadata: {} },
      ],
    })
    const t3 = await made(w3)
    const unverified = await readClaim(w3.deps, t3.token, await viewerOf(w3.deps, { id: NEWBIE, email: "new@example.com" }))
    check("an email not confirmed yet: confirm it first", unverified.ok && unverified.state.kind === "verify_email")

    const w4 = world()
    w4.db.tables.subscriptions.push({ id: "sub", creator_id: STUDIO_CREATOR, stripe_subscription_id: "sub_1", status: "active" })
    const blocked = await handoffRoute.POST(jsonReq("/api/handoff", "POST", STUDIO, {}))
    check("a business on a running paid plan cannot be handed over: the founder's card would keep paying", blocked.status === 409 && /paid plan/.test(((await blocked.json()) as { error: string }).error))
  }

  console.log("\nEvery table keyed by a creator or a person has a decision")
  {
    const sources = [
      ...readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).map((f) => `supabase/migrations/${f}`),
      ...readdirSync("supabase/sql/run-now").filter((f) => f.endsWith(".sql")).map((f) => `supabase/sql/run-now/${f}`),
      ...readdirSync("scripts").filter((f) => f.endsWith(".sql")).map((f) => `scripts/${f}`),
      "scripts/sql-harness/dashboard-made.sql",
    ]
    const keyed = new Set<string>()
    for (const file of sources) {
      const sql = read(file).replace(/--[^\n]*/g, "")
      const create = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z_0-9]+)"?\s*\(/gi
      let m: RegExpExecArray | null
      while ((m = create.exec(sql))) {
        let depth = 0
        let i = m.index + m[0].length - 1
        const start = i
        for (; i < sql.length; i++) {
          if (sql[i] === "(") depth++
          else if (sql[i] === ")" && --depth === 0) break
        }
        if (/(^|[\s,(])(creator_id|user_id)\s/i.test(sql.slice(start, i))) keyed.add(m[1].toLowerCase())
      }
      const added = /alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:public\.)?"?([a-z_0-9]+)"?\s+add\s+column\s+(?:if\s+not\s+exists\s+)?(?:creator_id|user_id)\b/gi
      while ((m = added.exec(sql))) keyed.add(m[1].toLowerCase())
    }
    const named = new Map<string, string[]>()
    for (const [group, tables] of HANDOFF_COVERAGE) for (const t of Object.keys(tables)) named.set(t, [...(named.get(t) ?? []), group])
    const missing = [...keyed].filter((t) => !named.has(t)).sort()
    check(`${keyed.size} tables with a creator_id or user_id found across ${sources.length} SQL files`, keyed.size > 180, keyed.size)
    check("every one of them is decided in lib/handoff/coverage.ts", missing.length === 0, missing)
    const twice = [...named].filter(([, g]) => g.length > 1)
    check("  each exactly once", twice.length === 0, twice)
    const stale = [...named.keys()].filter((t) => !keyed.has(t))
    check("  and the list names no table that is not there", stale.length === 0, stale)
    check("  every decision has its reason", [...HANDOFF_COVERAGE].every(([, tables]) => Object.values(tables).every((r) => r.length > 30)))

    const sql = read("supabase/migrations/20271131_business_handoff.sql")
    const body = sql.slice(sql.indexOf("create or replace function public.business_handoff_accept"), sql.indexOf("$f$;"))
    const touched = (t: string) => new RegExp(`public\\.${t}\\b`).test(body)
    const notTouched = Object.keys(DETACHED_TABLES).concat(Object.keys(CHECKED_TABLES)).filter((t) => !touched(t))
    check("every detached or checked table is in the transfer function", notTouched.length === 0, notTouched)
    const others = [...named].filter(([t, g]) => !["detached", "checked", "records"].includes(g[0]) && touched(t)).map(([t]) => t)
    check("  and no table that goes with the business is rewritten by it", others.length === 0, others)
    check("  the business's own row in business_links is the one that moves", /delete from public\.business_links where member_id = h\.business_user_id;/.test(body) && /insert into public\.business_links \(owner_id, member_id\) values \(p_recipient, h\.business_user_id\);/.test(body))
    check("  orders, products, the OnePage, domains, files and the ledger are never named", !/public\.(orders|products|onepages|custom_domains|sites|ledger_events|payouts|storage)\b/.test(body))
    check("  the founder's payout account is cleared from the business, the old one kept", /\('stripe_account_id', null\)/.test(body) && /\('stripe_previous_account_id', v_stripe\)/.test(body) && /\('charges_enabled', 'false'\)/.test(body) && /\('stripe_customer_id', null\)/.test(body))
    for (const preset of ["full", "content", "support"] as const) {
      const list = founderPermissions(preset)
      const inSql = preset === "full" ? /else array\[([^\]]+)\] end;/.exec(body)?.[1] : new RegExp(`when '${preset}' then array\\[([^\\]]+)\\]`).exec(body)?.[1]
      check(`  "${preset}" for a founder who stays is the team's own preset, word for word`, !!inSql && inSql.replace(/[' ]/g, "") === list.join(","), { inSql, list })
    }
    check("  the founder never keeps payouts, billing or the team", ["full", "content", "support"].every((p) => !founderPermissions(p as "full").some((x) => /payouts|billing|team/.test(x))))
  }

  console.log("\nThe SQL: additive, row level security, server only")
  {
    const sql = read("supabase/migrations/20271131_business_handoff.sql")
    check("the migration and run-now part 376 are the same text", sql === read("supabase/sql/run-now/376_business_handoff.sql"))
    check("new tables only, each if not exists", (sql.match(/create table if not exists public\.business_handoff/g) ?? []).length === 2 && !/alter table public\.(?!business_handoff)\w+ (add|drop|alter)/i.test(sql) && !/drop table|drop column|truncate/i.test(sql))
    check("row level security on both", /alter table public\.business_handoffs enable row level security;/.test(sql) && /alter table public\.business_handoff_events enable row level security;/.test(sql))
    check("nothing for anon; signed in users read their own business's rows, never the token hash, the result or an address", /revoke all on public\.business_handoffs, public\.business_handoff_events from public, anon, authenticated;/.test(sql) && /grant select \((?![^)]*token_hash)(?![^)]*result)[^)]+\) on public\.business_handoffs to authenticated;/.test(sql) && /grant select \((?![^)]*\bip\b)[^)]+\) on public\.business_handoff_events to authenticated;/.test(sql) && /using \(\(select auth\.uid\(\)\) = business_user_id or \(select auth\.uid\(\)\) = from_owner_id\)/.test(sql))
    check("one open link per business, by a unique index", /create unique index if not exists business_handoffs_one_open on public\.business_handoffs \(business_user_id\) where status = 'pending';/.test(sql))
    check("the transfer is security definer with a fixed search path, callable by the service role only", /security definer set search_path = public, pg_temp/.test(sql) && /revoke all on function public\.business_handoff_accept\([^)]*\) from public, anon, authenticated;/.test(sql) && /grant execute on function public\.business_handoff_accept\([^)]*\) to service_role;/.test(sql))
    check("it locks the link and the business's row before it checks them", /for update;/.test(sql) && /pg_advisory_xact_lock\(hashtextextended\('business_links ' \|\| p_recipient::text, 0\)\)/.test(sql))
    check("the check after has a column for it", /as p376_business_handoff[,;]/.test(read("supabase/sql/run-now/99_check_after.sql")))
    check("and the README a row", /`376_business_handoff\.sql`/.test(read("supabase/sql/run-now/README.md")))
  }

  console.log("\nEvery route asks who is signing in")
  {
    const w = world()
    check("GET /api/handoff signed out: 401", (await handoffRoute.GET(jsonReq("/api/handoff", "GET", null))).status === 401)
    check("POST /api/handoff signed out: 401", (await handoffRoute.POST(jsonReq("/api/handoff", "POST", null, {}))).status === 401)
    const firstBiz = (await (await handoffRoute.GET(jsonReq("/api/handoff", "GET", LIA))).json()) as { eligible: boolean; reason: string }
    check("the founder's login (their first business) is not offered it", firstBiz.eligible === false && firstBiz.reason === "first_business")
    check("  and cannot make a link for it", (await handoffRoute.POST(jsonReq("/api/handoff", "POST", LIA, {}))).status === 403)
    check("an account on its own cannot either", (await handoffRoute.POST(jsonReq("/api/handoff", "POST", NEWBIE, {}))).status === 403)
    const panel = (await (await handoffRoute.GET(jsonReq("/api/handoff", "GET", STUDIO))).json()) as { eligible: boolean; business: { name: string } }
    check("the business itself is offered it, by its store name", panel.eligible === true && panel.business.name === "Glow Studio")
    const { id } = await made(w)
    const fromLogin = (await (await handoffRoute.GET(jsonReq("/api/handoff", "GET", STUDIO))).json()) as { pending: Record<string, unknown> }
    check("the open link is shown without its token or hash", !!fromLogin.pending && !("token_hash" in fromLogin.pending) && !JSON.stringify(fromLogin).includes(w.db.tables.business_handoffs[0].token_hash))
    for (const [label, user] of [["signed out", null], ["the founder's other business", SIDE], ["a stranger", TOM]] as const) {
      const del = await oneRoute.DELETE(jsonReq(`/api/handoff/${id}`, "DELETE", user), idParams(id))
      const renew = await oneRoute.POST(jsonReq(`/api/handoff/${id}`, "POST", user, { send: false }), idParams(id))
      check(`revoke and new link refused for ${label}`, (user ? [404, 403] : [401]).includes(del.status) && (user ? [404, 403] : [401]).includes(renew.status) && w.db.tables.business_handoffs[0].status === "pending", { del: del.status, renew: renew.status })
    }
    check("an id that is not a uuid is refused before any read", (await oneRoute.DELETE(jsonReq("/api/handoff/1;drop", "DELETE", STUDIO), idParams("1;drop"))).status === 400)

    const t = w.db.tables.business_handoffs[0]
    const { token } = await (async () => {
      const r = await oneRoute.POST(jsonReq(`/api/handoff/${t.id}`, "POST", STUDIO, { send: false }), idParams(t.id))
      return { token: ((await r.json()) as { link: string }).link.split(CLAIM_PREFIX)[1] }
    })()
    const forged = await claimRoute.POST(formReq("/api/handoff/claim", TOM, { token }, { origin: "https://evil.example", "sec-fetch-site": "cross-site" }))
    const to = new URL(forged.headers.get("location") ?? "", SITE)
    check("a claim pressed from another site changes nothing and goes back to the page", forged.status === 303 && to.pathname === claimPath(token) && to.searchParams.get("note") === "again" && w.db.tables.business_handoffs[0].status === "pending")
    const signedOut = await claimRoute.POST(formReq("/api/handoff/claim", null, { token }))
    check("a claim signed out goes back to the page, which offers sign in", signedOut.status === 303 && new URL(signedOut.headers.get("location") ?? "", SITE).pathname === claimPath(token) && w.db.tables.business_handoffs[0].status === "pending")
    w.limitAfter(0)
    const slow = await claimRoute.POST(formReq("/api/handoff/claim", TOM, { token }))
    check("claim attempts are rate limited per account and address", new URL(slow.headers.get("location") ?? "", SITE).searchParams.get("note") === "slow" && w.db.tables.business_handoffs[0].status === "pending")
    w.limitAfter(Infinity)
    const sw = await switchRoute.POST(formReq("/api/handoff/claim/switch", TOM, { token, email: "tom@example.com" }, { origin: "https://evil.example", "sec-fetch-site": "cross-site" }))
    check("Switch account from another site signs nobody out", sw.status === 303 && new URL(sw.headers.get("location") ?? "", SITE).searchParams.get("note") === "again")
    for (const p of ["app/api/handoff/claim/route.ts", "app/api/handoff/claim/switch/route.ts"]) check(`${p}: never JSON, a form post's answer is the page`, !/NextResponse\.json/.test(read(p)))
    check("the claim page lives under /team, a word no creator can hold", isReservedRootSegment("team") && claimPath(token).startsWith("/team/claim/"))
  }

  console.log("\nA new account: sign up with the claim as `next`, confirm the email, accept")
  {
    const w = world()
    const { token } = await made(w, { keepFounder: true, founderAccess: "content" })
    /* Lia's plan for the studio ended last month; the webhook's row still names her Stripe customer. Tom's own store pays. */
    w.db.tables.subscriptions.push({ id: "sub-ended", creator_id: STUDIO_CREATOR, stripe_subscription_id: "sub_lia", stripe_customer_id: "cus_lia", plan_id: "pro", status: "canceled" })
    w.db.tables.subscriptions.push({ id: "sub-tom", creator_id: "tom-creator", stripe_subscription_id: "sub_tom", stripe_customer_id: "cus_tom", plan_id: "pro", status: "active" })
    const signedOut = await readClaim(w.deps, token, null)
    check("signed out: the business, its addresses and counts, and Create account", signedOut.ok && signedOut.state.kind === "signed_out" && signedOut.preview?.products === 3 && signedOut.preview?.domains[0] === "glowstudio.co" && signedOut.preview?.onePageAddress?.endsWith("/glowstudio") === true)
    const signup = claimSignInPath(token, { signup: true, email: null })
    const carry = readCarry(new URLSearchParams(signup.split("?")[1]), "storelib.com")
    check("Create account carries the claim as next, accepted by the sign in rules", signup.startsWith("/signup?") && carry.next === claimPath(token), { signup, carry })
    check("  a brand new account (no store yet) comes back to the claim, not onboarding", destinationAfterAuth(carry, { state: "none" } as never) === claimPath(token))
    check("  and a seller logging in comes back to it too", destinationAfterAuth(readCarry(new URLSearchParams(claimSignInPath(token, { signup: false, email: "a@b.co" }).split("?")[1]), "storelib.com"), { state: "seller" } as never) === claimPath(token))
    const card = renderToStaticMarkup(createElement(ClaimCard, { state: (signedOut as { state: ClaimState }).state, token, note: "", signedIn: false, preview: (signedOut as any).preview }))
    check("  the card's Create account and Log in go through the route that keeps the claim", card.includes(claimSignInHref(token, { signup: true }).replace(/&/g, "&amp;")) && card.includes(claimSignInHref(token, { signup: false }).replace(/&/g, "&amp;")))
    const kept = await signInRoute.GET(new Request(`${SITE}${claimSignInHref(token, { signup: true })}`))
    const keptTo = new URL(kept.headers.get("location") ?? "", SITE)
    const setCookie = kept.headers.get("set-cookie") ?? ""
    check("  which opens sign up with the claim as next, and keeps the token in a short lived httpOnly cookie", keptTo.pathname === "/signup" && keptTo.searchParams.get("next") === claimPath(token) && setCookie.includes(`${CLAIM_COOKIE}=${token}`) && /HttpOnly/i.test(setCookie) && /Max-Age=1800/i.test(setCookie), { location: kept.headers.get("location"), setCookie })
    const forgedKeep = await signInRoute.GET(new Request(`${SITE}/api/handoff/claim/sign-in?token=..%2F..%2Fevil&to=login`))
    check("  a made up token is not kept", !(forgedKeep.headers.get("set-cookie") ?? "").includes(CLAIM_COOKIE))
    check("an OAuth round trip that lost next comes back to the claim from the cookie", claimFallbackNext(null, token) === claimPath(token) && claimFallbackNext("/library", token) === "/library" && claimFallbackNext(null, "../evil") === null)
    const cont = read("app/(storelib)/auth/continue/route.ts")
    const cb = read("app/(storelib)/auth/callback/route.ts")
    check("  /auth/continue and /auth/callback both read the claim cookie once", [cont, cb].every((src) => /jar\.get\(CLAIM_COOKIE\)/.test(src) && /jar\.delete\(CLAIM_COOKIE\)/.test(src) && /claimFallbackNext\(carry\.next, claim\)/.test(src)))
    check("a claim link opens in the iOS and Android apps", opensInApp(claimPath(token)) && opensInApp(HANDED_HOME))

    const ready = await readClaim(w.deps, token, await viewerOf(w.deps, { id: NEWBIE, email: "new@example.com" }))
    check("signed up and confirmed: ready, with what comes with it and what stays", ready.ok && ready.state.kind === "ready")
    const readyCard = renderToStaticMarkup(createElement(ClaimCard, { state: (ready as { state: ClaimState }).state, token, note: "", signedIn: true, preview: (ready as any).preview, founderAccess: (ready as any).handoff?.founder_access })).replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'")
    check("  the preview names the business, its addresses, the counts, and what the new owner sets up", /Manage Glow Studio/.test(readyCard) && /glowstudio\.co/.test(readyCard) && /3 products/.test(readyCard) && /Connect your own after you accept/.test(readyCard) && /You choose your own/.test(readyCard) && /Accept ownership/.test(readyCard), readyCard)
    check("  it speaks as the Storelib Team, never as the founder: her name is nowhere on it", /Storelib Team invited you/.test(readyCard) && !/\bLia\b/.test(readyCard) && !("sender" in ((ready as any).preview ?? {})))
    check("  the founder who stays is said, with her access and never money", /stays on your team with content access, never payouts or billing/.test(readyCard))

    const res = await claimRoute.POST(formReq("/api/handoff/claim", NEWBIE, { token }))
    const loc = new URL(res.headers.get("location") ?? "", SITE)
    check("Accept: back to the page, accepted", res.status === 303 && loc.pathname === claimPath(token) && loc.searchParams.get("note") === "accepted", res.headers.get("location"))
    const links = w.db.tables.business_links
    check("the business is now on the new login, the founder's other business still hers", links.some((l: any) => l.member_id === STUDIO && l.owner_id === NEWBIE) && !links.some((l: any) => l.member_id === STUDIO && l.owner_id === LIA) && links.some((l: any) => l.member_id === SIDE && l.owner_id === LIA))
    check("  its ids, username, OnePage, products and domains are where they were", w.db.tables.creators[0].id === STUDIO_CREATOR && w.db.tables.creators[0].user_id === STUDIO && w.db.tables.onepages[0].owner_id === STUDIO && w.db.tables.products.length === 3 && w.db.tables.custom_domains[0].creator_id === STUDIO_CREATOR)
    check("  the founder stays with the access she chose, and nothing of money", (w.db.tables.store_team_members ?? []).some((m: any) => m.user_id === LIA && m.permissions.join(",") === "website,onepage,creator_pages,products,community"))
    const upd = w.calls.updates.find((u) => u.id === STUDIO)
    check("the business's sign in address is made from the new owner's, so seller emails reach them", !!upd && /^new\+slb-[0-9a-f]{8}@example\.com$/.test(String(upd.attrs.email)) && (upd.attrs.app_metadata as any)?.business_owner === NEWBIE, upd)
    check("  every session the business had (the founder's) is ended", w.calls.signOuts.includes(STUDIO))
    check("  billing starts fresh: the founder's ended plan row (her Stripe customer) is gone, nobody else's plan touched", !w.db.tables.subscriptions.some((r: any) => r.creator_id === STUDIO_CREATOR) && w.db.tables.subscriptions.some((r: any) => r.id === "sub-tom"))
    check("  the OnePage, store and domain caches forget it", w.calls.caches.some((c: any) => c.userId === STUDIO && c.creatorId === STUDIO_CREATOR))
    check("  the founder is emailed that it was taken", w.calls.mails.some((m) => m.to === "lia@example.com" && /new owner/.test(m.subject + m.text)))
    const ev = w.db.tables.business_handoff_events.map((e: any) => e.event)
    check("the record: created, accepted, finished, with who and from where", ev.includes("created") && ev.includes("accepted") && ev.includes("finished") && w.db.tables.business_handoff_events.some((e: any) => e.event === "accepted" && e.actor_id === NEWBIE && e.ip === "203.0.113.7"), ev)
    check("  finished_at is set, so opening the link again does not finish twice", !!w.db.tables.business_handoffs[0].finished_at)
    const after = await readClaim(w.deps, token, await viewerOf(w.deps, { id: NEWBIE, email: "new@example.com" }))
    check("the page now says It's yours, with Open", after.ok && after.state.kind === "accepted" && (after.state as any).mine && renderToStaticMarkup(createElement(ClaimCard, { state: (after as any).state, token, note: "", signedIn: true, preview: null })).includes("Open Glow Studio"))
  }

  console.log("\nAn existing account with a business of its own")
  {
    const w = world()
    const { token } = await made(w, { email: "tom@example.com" })
    const fromShop = await readClaim(w.deps, token, await viewerOf(w.deps, { id: TOM_SHOP, email: "tom+slb-00001111@example.com" }))
    check("opened from inside one of their businesses: read as their login (tom@), ready", fromShop.ok && fromShop.state.kind === "ready", fromShop.ok ? fromShop.state : fromShop)
    const res = await claimRoute.POST(formReq("/api/handoff/claim", TOM_SHOP, { token }))
    check("  accepted", new URL(res.headers.get("location") ?? "", SITE).searchParams.get("note") === "accepted")
    const tomLinks = w.db.tables.business_links.filter((l: any) => l.owner_id === TOM).map((l: any) => l.member_id)
    check("  it joins their login beside the business they had, kept apart (no merge)", tomLinks.includes(TOM_SHOP) && tomLinks.includes(STUDIO) && tomLinks.length === 2)
    check("  the founder kept no access (she did not ask to stay)", !(w.db.tables.store_team_members ?? []).some((m: any) => m.user_id === LIA))
  }

  console.log("\nA transfer that fails changes nothing, and the link still works")
  {
    const w = world()
    const { token } = await made(w)
    w.failRpc({ message: "canceling statement due to statement timeout", code: "57014" })
    const res = await claimRoute.POST(formReq("/api/handoff/claim", TOM, { token }))
    check("the page says it did not go through", new URL(res.headers.get("location") ?? "", SITE).searchParams.get("note") === "failed")
    check("  the business is still the founder's and the link still open", w.db.tables.business_links.some((l: any) => l.member_id === STUDIO && l.owner_id === LIA) && w.db.tables.business_handoffs[0].status === "pending")
    check("  the failure is recorded", w.db.tables.business_handoff_events.some((e: any) => e.event === "failed" && e.detail?.reason === "failed"))
    w.failRpc(null)
    const retry = await claimRoute.POST(formReq("/api/handoff/claim", TOM, { token }))
    check("  pressing again works", new URL(retry.headers.get("location") ?? "", SITE).searchParams.get("note") === "accepted")
    check("every word the database refuses with means something on the page", ["handoff_used", "handoff_expired", "handoff_revoked", "handoff_wrong_email", "handoff_self", "handoff_limit", "handoff_paid_plan"].every((c) => refusalOfSql({ message: `ERROR: ${c}` }).code === c) && refusalOfSql({ message: "something else" }).state === "failed")
  }

  console.log("\nThe pages and emails read like Storelib")
  {
    const handoff: HandoffRow = { id: "h", business_user_id: STUDIO, creator_id: STUDIO_CREATOR, from_owner_id: LIA, recipient_email: null, keep_founder: false, founder_access: "full", ttl_days: 7, status: "pending", expires_at: new Date(NOW + DAY).toISOString(), created_at: new Date(NOW).toISOString(), last_sent_at: null, send_count: 0, accepted_at: null, accepted_by: null, revoked_at: null, finished_at: null }
    const token = randomBytes(32).toString("base64url")
    const states: ClaimState[] = [
      claimStateOf({ token: "x", handoff: null, business: null, stillFounders: false, viewer: null, blockers: [], now: NOW }),
      claimStateOf({ token, handoff: null, business: null, stillFounders: false, viewer: null, blockers: [], now: NOW }),
      claimStateOf({ token, handoff: { ...handoff, status: "revoked" }, business: { name: "Glow", avatarUrl: null }, stillFounders: true, viewer: null, blockers: [], now: NOW }),
      claimStateOf({ token, handoff, business: { name: "Glow", avatarUrl: null }, stillFounders: true, viewer: null, blockers: [], now: NOW + 2 * DAY }),
      claimStateOf({ token, handoff, business: { name: "Glow", avatarUrl: null }, stillFounders: false, viewer: null, blockers: [], now: NOW }),
      claimStateOf({ token, handoff, business: { name: "Glow", avatarUrl: null }, stillFounders: true, viewer: { loginId: TOM, sessionId: TOM, email: "tom@example.com", emailVerified: true, groupIds: [TOM] }, blockers: ["paid_plan"], now: NOW }),
    ]
    check("each state has its own card", states.map((s) => s.kind).join(",") === "invalid,gone,revoked,expired,stale,not_ready", states.map((s) => s.kind))
    check("  a refusal for each that is not ready", states.every((s) => refusalOf(s) !== null))
    const words = states.map((s) => renderToStaticMarkup(createElement(ClaimCard, { state: s, token, note: "failed", signedIn: true, preview: null })).replace(/<[^>]+>/g, " ")).join(" ")
    const mail = handoffInviteEmail({ businessName: "Glow Studio", email: "tom@example.com", link: `${SITE}${claimPath(token)}`, days: 7 })
    const all = words + mail.text + read("components/app/settings/handoff-panel.tsx") + read("components/handoff/claim-card.tsx") + read("lib/handoff/rules.ts")
    check("no em dash and none of the words the owner banned", !/—/.test(all) && !/\b(unlock|elevate|seamless|powerful|effortlessly|supercharge|transform)\b/i.test(all))
    check("the invite email carries the link, the business and the days, from the Storelib Team", mail.text.includes(claimPath(token)) && /Storelib Team invited you to take over Glow Studio/.test(mail.text) && /7 days/.test(mail.text) && /manage Glow Studio/.test(mail.subject))
    check("the settings panel is in the Team tab, loaded with it", /panelTab === "team" && \([\s\S]{0,120}<HandoffPanel \/>/.test(read("components/app/settings-form-new.tsx")) && /team: \["team", "handoff"\]/.test(read("components/app/settings/lazy-panels.tsx")))
  }

  console.log("\nA client whose only store was handed to them lands in it")
  {
    const w = world()
    const { token } = await made(w)
    check("before taking anything, nothing is handed to the login", (await handedBusinessOf(NEWBIE, w.db as never)) === null)
    await claimRoute.POST(formReq("/api/handoff/claim", NEWBIE, { token }))
    const handed = await handedBusinessOf(NEWBIE, w.db as never)
    check("after the claim, the login's handed business is the one it took", handed?.userId === STUDIO && handed?.name === "Glow Studio", handed)
    check("  nobody else has it handed to them", (await handedBusinessOf(LIA, w.db as never)) === null && (await handedBusinessOf(TOM, w.db as never)) === null)
    w.db.tables.business_links.splice(w.db.tables.business_links.findIndex((l: any) => l.member_id === STUDIO), 1)
    check("  and once it is no longer on the login, it is not opened", (await handedBusinessOf(NEWBIE, w.db as never)) === null)
    const accepted = renderToStaticMarkup(createElement(ClaimCard, { state: { kind: "accepted", business: { name: "Glow Studio", avatarUrl: null }, mine: true, businessUserId: STUDIO }, token, note: "accepted", signedIn: true, preview: null }))
    check("right after Accept the page opens the business by itself (Open stays for a second press)", /Open Glow Studio/.test(accepted) && !/role="alert"/.test(accepted))
    const cont = read("app/(storelib)/auth/continue/route.ts")
    const cb = read("app/(storelib)/auth/callback/route.ts")
    const layout = read("app/(storelib)/app/layout.tsx")
    const asked = /const handed = !hasSellerAccess\(access\) && !teamMember && !carry\.next && !carry\.intent \? await handedHomeFor\([^)]+\) : null/
    check("sign in opens it only for a login with no store, no team and nowhere else to go", asked.test(cont) && asked.test(cb) && [cont, cb].every((src) => /destinationWithAppOpen\(handed \?\? destinationAfterAuth\(/.test(src)))
    check("/app sends such a login there instead of onboarding", /!memberRead\.failed \? await handedHomeFor\(user\.id\) : null\s*\n\s*if \(handed\) redirect\(handed\)/.test(layout) && layout.indexOf("if (handed) redirect(handed)") < layout.indexOf('redirect("/sell")'))
    check("the page that opens it switches the way the account menu does", /<OpenBusiness userId=\{handed\.userId\} name=\{handed\.name\} auto \/>/.test(read("app/(storelib)/team/claim/home/page.tsx")))
    check("the read is indexed", /create index if not exists business_handoffs_accepted_by on public\.business_handoffs \(accepted_by, accepted_at desc\) where status = 'accepted';/.test(read("supabase/migrations/20271131_business_handoff.sql")))
  }

  console.log("\nEnd to end: the founder hands Glow Studio to Ana, who signs up from the email")
  {
    const w = world()
    const ANA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
    const meta = { origin: SITE, "sec-fetch-site": "same-origin" }
    /* Lia was on Pro for the studio until last month (the row names her Stripe customer), and its payouts went to her Connect account. */
    w.db.tables.subscriptions.push({ id: "sub-ended", creator_id: STUDIO_CREATOR, stripe_subscription_id: "sub_lia", stripe_customer_id: "cus_lia", plan_id: "pro", status: "canceled" })
    w.db.tables.creators[0].stripe_account_id = "acct_lia"

    const before = (await (await handoffRoute.GET(jsonReq("/api/handoff", "GET", STUDIO))).json()) as { eligible: boolean; pending: unknown }
    check("1. Settings, Team in the studio: Transfer ownership is offered, nothing open", before.eligible === true && before.pending === null)
    const made = await handoffRoute.POST(jsonReq("/api/handoff", "POST", STUDIO, { email: "Ana@Example.com", days: 3, keepFounder: true, founderAccess: "support" }))
    const madeBody = (await made.json()) as { link: string; pending: { id: string; email: string; ttlDays: number; keepFounder: boolean; founderAccess: string }; emailed: boolean }
    const token = madeBody.link.split(CLAIM_PREFIX)[1]
    check("2. Send link: a short clean link, emailed to ana@, three days, Lia staying for support", made.status === 200 && /^https:\/\/storelib\.com\/team\/claim\/[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}$/.test(madeBody.link) && madeBody.emailed && madeBody.pending.email === "ana@example.com" && madeBody.pending.ttlDays === 3 && madeBody.pending.keepFounder && madeBody.pending.founderAccess === "support", madeBody)
    const invite = w.calls.mails.find((m) => m.to === "ana@example.com")
    check("   the email is from the Storelib Team, with the link and the business, and not Lia's name", !!invite && invite.text.includes(madeBody.link) && /manage Glow Studio/.test(invite.subject) && /Storelib Team invited you/.test(invite.text) && !/\bLia\b/.test(invite.subject + invite.text), invite?.subject)
    const panel = (await (await handoffRoute.GET(jsonReq("/api/handoff", "GET", STUDIO))).json()) as { pending: { id: string; email: string; lastSentAt: string | null }; events: { event: string }[] }
    check("   the panel tracks it: waiting for ana@, sent, its record", panel.pending?.id === madeBody.pending.id && panel.pending.email === "ana@example.com" && !!panel.pending.lastSentAt && panel.events.map((e) => e.event).sort().join(",") === "created,sent", panel)

    const opened = await readClaim(w.deps, token, null)
    check("3. Ana opens it signed out: Create account or Log in, the business and what comes with it", opened.ok && opened.state.kind === "signed_out" && opened.preview?.products === 3)
    const toSignup = await signInRoute.GET(new Request(`${SITE}${claimSignInHref(token, { signup: true })}`))
    const signupAt = new URL(toSignup.headers.get("location") ?? "", SITE)
    const cookie = /sl_handoff_claim=([^;]+)/.exec(toSignup.headers.get("set-cookie") ?? "")?.[1] ?? ""
    check("4. Create account to accept: sign up with her email filled in, the claim kept as next and in the cookie", signupAt.pathname === "/signup" && signupAt.searchParams.get("email") === "ana@example.com" && signupAt.searchParams.get("next") === claimPath(token) && tokenShapeOk(cookie), { at: signupAt.toString(), cookie })
    w.auth.push({ id: ANA, email: "ana@example.com", app_metadata: { verified_email: "ana@example.com" } })
    check("   the sign up and log in pages fill in ana@ and keep it, as for a team invite (only that email can accept)", inviteEmailFrom(signupAt.searchParams) === "ana@example.com" && inviteEmailFrom(new URLSearchParams(claimSignInPath(token, { signup: false, email: "ana@example.com" }).split("?")[1])) === "ana@example.com" && inviteEmailFrom(new URLSearchParams(claimSignInPath(token, { signup: false, email: null }).split("?")[1])) === null)
    check("5. Signed up and confirmed: back to the claim, from next or, if an OAuth trip lost it, from the cookie", destinationAfterAuth(readCarry(signupAt.searchParams, "storelib.com"), { state: "none" } as never) === claimPath(token) && claimFallbackNext(null, cookie) === claimPath(token))
    const ready = await readClaim(w.deps, token, await viewerOf(w.deps, { id: ANA, email: "ana@example.com" }))
    check("   ready: Manage Glow Studio, Accept ownership", ready.ok && ready.state.kind === "ready" && /Manage Glow Studio[\s\S]*Accept ownership/.test(renderToStaticMarkup(createElement(ClaimCard, { state: (ready as { state: ClaimState }).state, token, note: "", signedIn: true, preview: (ready as any).preview }))))

    w.deps.payoutBalance = async () => "held"
    const held = await claimRoute.POST(formReq("/api/handoff/claim", ANA, { token }, meta))
    check("6. Lia's payout account still holds money: Accept says not yet, nothing moves, the link still works", new URL(held.headers.get("location") ?? "", SITE).searchParams.get("note") === "not_ready" && w.db.tables.business_links.some((l: any) => l.member_id === STUDIO && l.owner_id === LIA) && w.db.tables.business_handoffs[0].status === "pending")
    w.deps.payoutBalance = async () => "none"

    const accepted = await claimRoute.POST(formReq("/api/handoff/claim", ANA, { token }, meta))
    check("7. Accept ownership: back to the page, accepted", new URL(accepted.headers.get("location") ?? "", SITE).searchParams.get("note") === "accepted")
    const links = w.db.tables.business_links
    check("   ownership: the studio is on Ana's login; Lia keeps her login and her other business", links.some((l: any) => l.member_id === STUDIO && l.owner_id === ANA) && !links.some((l: any) => l.member_id === STUDIO && l.owner_id === LIA) && links.some((l: any) => l.member_id === SIDE && l.owner_id === LIA))
    check("   the OnePage, store, products and domain are where they were (same ids and addresses)", w.db.tables.onepages[0].owner_id === STUDIO && w.db.tables.creators[0].user_id === STUDIO && w.db.tables.custom_domains[0].creator_id === STUDIO_CREATOR && w.db.tables.products.length === 3)
    const team = (w.db.tables.store_team_members ?? []) as any[]
    check("   team roles: Lia stays as a member with support access only, never payouts, billing or the team", team.length === 1 && team[0].user_id === LIA && team[0].permissions.join(",") === "orders,customers")
    check("   billing: the ended plan that named Lia's Stripe customer is gone, so Ana's Billing starts fresh", !w.db.tables.subscriptions.some((r: any) => r.creator_id === STUDIO_CREATOR))
    const alias = w.calls.updates.find((u) => u.id === STUDIO)
    check("   sign in address: the studio's is made from Ana's, Lia's sessions in it ended, caches forgotten", /^ana\+slb-[0-9a-f]{8}@example\.com$/.test(String(alias?.attrs.email)) && w.calls.signOuts.includes(STUDIO) && w.calls.caches.some((c: any) => c.userId === STUDIO))
    check("   Lia is told it has a new owner", w.calls.mails.some((m) => m.to === "lia@example.com" && /new owner/.test(m.subject + m.text)))
    const row = w.db.tables.business_handoffs[0]
    check("   the record: accepted by Ana, finished", row.status === "accepted" && row.accepted_by === ANA && !!row.finished_at)

    const again = await claimRoute.POST(formReq("/api/handoff/claim", TOM, { token }, meta))
    const tomRead = await readClaim(w.deps, token, await viewerOf(w.deps, { id: TOM, email: "tom@example.com" }))
    check("8. Single use: Tom opening the same link reads already used and cannot take it", tomRead.ok && tomRead.state.kind === "accepted" && !(tomRead.state as any).mine && new URL(again.headers.get("location") ?? "", SITE).searchParams.get("note") !== "accepted" && w.db.tables.business_links.some((l: any) => l.member_id === STUDIO && l.owner_id === ANA), { tom: tomRead.ok ? tomRead.state : tomRead, again: again.headers.get("location") })
    const anaRead = await readClaim(w.deps, token, await viewerOf(w.deps, { id: ANA, email: "ana@example.com" }))
    check("   Ana reads It's yours, with Open", anaRead.ok && anaRead.state.kind === "accepted" && (anaRead.state as any).mine)
    const lia = (await (await handoffRoute.GET(jsonReq("/api/handoff", "GET", LIA))).json()) as { eligible: boolean; reason: string }
    check("9. Lia's login: her first business, so nothing to hand over from there", lia.eligible === false && lia.reason === "first_business")
    const anaPanel = (await (await handoffRoute.GET(jsonReq("/api/handoff", "GET", STUDIO))).json()) as { eligible: boolean; pending: unknown }
    check("   in the studio now (Ana's): Transfer ownership is hers to use, nothing open", anaPanel.eligible === true && anaPanel.pending === null)
    const lateRevoke = await oneRoute.DELETE(jsonReq(`/api/handoff/${row.id}`, "DELETE", STUDIO), idParams(row.id))
    check("   an accepted transfer cannot be cancelled after the fact", lateRevoke.status === 404 && w.db.tables.business_handoffs[0].status === "accepted")
  }

  console.log("\nEnd to end: cancelled, resent and expired links")
  {
    const w = world()
    const first = await made(w, { email: "tom@example.com" })
    w.tick(61_000)
    const resent = await oneRoute.POST(jsonReq(`/api/handoff/${first.id}`, "POST", STUDIO, { send: true }), idParams(first.id))
    const second = ((await resent.json()) as { link: string }).link.split(CLAIM_PREFIX)[1]
    const old = await readClaim(w.deps, first.token, null)
    check("Resend: a new link goes out and the earlier one stops", resent.status === 200 && second !== first.token && old.ok && old.state.kind === "gone" && w.calls.mails.filter((m) => m.to === "tom@example.com").length === 2)
    const cancel = await oneRoute.DELETE(jsonReq(`/api/handoff/${first.id}`, "DELETE", STUDIO), idParams(first.id))
    const afterCancel = await readClaim(w.deps, second, await viewerOf(w.deps, { id: TOM, email: "tom@example.com" }))
    const tryCancelled = await claimRoute.POST(formReq("/api/handoff/claim", TOM, { token: second }))
    check("Cancel transfer: the link says cancelled and Accept moves nothing", cancel.status === 200 && afterCancel.ok && afterCancel.state.kind === "revoked" && new URL(tryCancelled.headers.get("location") ?? "", SITE).searchParams.get("note") === "revoked" && w.db.tables.business_links.some((l: any) => l.member_id === STUDIO && l.owner_id === LIA))
    const panel = (await (await handoffRoute.GET(jsonReq("/api/handoff", "GET", STUDIO))).json()) as { pending: unknown }
    check("  and the panel is back to a new transfer", panel.pending === null)
    const third = await made(w, {})
    w.tick(8 * DAY)
    const expiredPanel = (await (await handoffRoute.GET(jsonReq("/api/handoff", "GET", STUDIO))).json()) as { pending: { expired: boolean } }
    const expiredRead = await readClaim(w.deps, third.token, await viewerOf(w.deps, { id: TOM, email: "tom@example.com" }))
    check("Expired: the panel says so, the link says so, and Accept moves nothing", expiredPanel.pending?.expired === true && expiredRead.ok && expiredRead.state.kind === "expired" && (await acceptClaim(w.deps, third.token, { id: TOM, email: "tom@example.com" }, { ip: null, userAgent: null })).ok === false)
    const fourth = await made(w, {})
    check("  a new link replaces it", !!fourth.token && w.db.tables.business_handoffs.find((r: any) => r.id === third.id)?.status === "expired")
  }

  setHandoffDepsForTests(null)
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
