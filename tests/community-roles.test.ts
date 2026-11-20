/**
 * Discord roles and Telegram chats for paying members (lib/community-roles,
 * SQL parts 473 and 474). Discord and Telegram are never called: every
 * request goes to a stubbed fetch that answers as their documented APIs do,
 * and the database is a small in-memory one with the tables' unique keys.
 *
 *   disabled       no keys: nothing is available, the hooks touch nothing,
 *                  the webhook answers 404 and the buttons list is empty
 *   install        the signed state: another account, another browser, an
 *                  altered or an old one is refused; the server named by
 *                  Discord's token answer, checked with the bot, one store each
 *   grant          a purchase gives the role (PUT member with the access token
 *                  and the role), a buyer already in gets PUT role
 *   revoke         a cancelled membership, a full refund and past due after
 *                  its grace take it back (DELETE role); within grace it stays
 *   idempotency    the same signal twice is one call; two workers, one try;
 *                  another purchase giving the same role keeps it
 *   hierarchy      Discord's 50013 is "blocked" with the words to fix it,
 *                  and a role above the bot is refused when it is mapped
 *   retries        a 429 waits retry_after; MAX_ATTEMPTS ends in failed
 *   telegram       the webhook secret, /link with a one time code, one use
 *                  invites (member_limit 1, a day), the join recorded, and
 *                  removal as ban then unban only_if_banned
 *   sql            parts 473 and 474: idempotent, server only, sealed tokens
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

process.env.COMMERCE_SECRETS_KEY = process.env.COMMERCE_SECRETS_KEY || "test-only-key-for-community-roles"

import { discordConfig, telegramConfig, anyProviderEnabled } from "../lib/community-roles/config"
import { installUrl, joinUrl, roleProblem, roleProblemText, kindOf, BOT_PERMISSIONS, type Fetch } from "../lib/community-roles/discord-api"
import { webhookSecretOk, linkCommandOf, memberChangeOf, hashOf } from "../lib/community-roles/telegram-api"
import { makeState, readState, safeBack } from "../lib/community-roles/oauth-state"
import { backoffMs, MAX_ATTEMPTS, recheckAccess, runDue, settleAccess, type Deps } from "../lib/community-roles/engine"
import { communityRolesAfterEntitlement, communityRolesAfterMembership } from "../lib/community-roles/hooks"
import { connectDiscordServer, handleTelegramUpdate, joinDiscord, joinOptions, joinTelegram, linkDiscordAccount, loadDiscordSetup, makeTelegramLinkCode, retryGrant, saveDiscordMapping, communityRolesStatus } from "../lib/community-roles/setup"
import { sealSecret } from "../lib/physical/secrets"

/*
  The test loader's after() hands its task to this hook (scripts/push-test-loader.mjs). Throwing is what
  after() does outside a request, so the engine runs the work in line (engine.ts later) and each step
  below can be checked as soon as the hook returns.
*/
;(globalThis as { __PUSH_TEST_AFTER__?: unknown }).__PUSH_TEST_AFTER__ = () => {
  throw new Error("`after` was called outside a request scope")
}

let passed = 0
const failures: string[] = []
const tests: [string, () => unknown][] = []
const check = (name: string, fn: () => unknown) => tests.push([name, fn])
const read = (p: string) => readFileSync(p, "utf8")

/* ── A small in-memory Supabase ─────────────────────────────────────────── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>
const UNIQUE: Record<string, string[][]> = {
  discord_connections: [["creator_id"], ["guild_id"]],
  discord_role_mappings: [["product_id", "guild_id", "role_id"]],
  discord_member_links: [["user_id"]],
  discord_access_grants: [["mapping_id", "user_id"]],
  telegram_chats: [["chat_id"]],
  telegram_link_codes: [["code_hash"]],
  telegram_chat_mappings: [["product_id", "chat_ref"]],
  telegram_access_grants: [["mapping_id", "user_id"]],
}
let seq = 0
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`

class FakeDb {
  tables: Record<string, Row[]> = {}
  touched = 0
  from(table: string) {
    this.touched++
    return new Q(this, table)
  }
}
class Q {
  private filters: ((r: Row) => boolean)[] = []
  private op: "select" | "insert" | "update" | "delete" | "upsert" = "select"
  private patch: Row | null = null
  private rows: Row[] = []
  private conflict: string[] | null = null
  private n = Infinity
  private cols = ""
  private returning = false
  private mode: "many" | "maybe" | "single" = "many"
  constructor(
    private db: FakeDb,
    private table: string,
  ) {}
  select(cols = "*") {
    if (this.op === "select") this.cols = cols
    else this.returning = true
    return this
  }
  eq(k: string, v: unknown) {
    this.filters.push((r) => String(r[k]) === String(v) && r[k] !== undefined && r[k] !== null)
    return this
  }
  neq(k: string, v: unknown) {
    this.filters.push((r) => String(r[k]) !== String(v))
    return this
  }
  in(k: string, v: unknown[]) {
    this.filters.push((r) => v.map(String).includes(String(r[k])))
    return this
  }
  is(k: string, v: null) {
    this.filters.push((r) => (r[k] ?? null) === v)
    return this
  }
  not(k: string, _op: string, v: null) {
    this.filters.push((r) => (r[k] ?? null) !== v)
    return this
  }
  lte(k: string, v: string) {
    this.filters.push((r) => r[k] != null && String(r[k]) <= v)
    return this
  }
  order() {
    return this
  }
  limit(n: number) {
    this.n = n
    return this
  }
  insert(rows: Row | Row[]) {
    this.op = "insert"
    this.rows = Array.isArray(rows) ? rows : [rows]
    return this
  }
  upsert(rows: Row | Row[], opts: { onConflict?: string } = {}) {
    this.op = "upsert"
    this.rows = Array.isArray(rows) ? rows : [rows]
    this.conflict = opts.onConflict ? opts.onConflict.split(",") : null
    return this
  }
  update(p: Row) {
    this.op = "update"
    this.patch = p
    return this
  }
  delete() {
    this.op = "delete"
    return this
  }
  maybeSingle() {
    this.mode = "maybe"
    return this
  }
  single() {
    this.mode = "single"
    return this
  }
  private shape(r: Row): Row {
    const out = { ...r }
    const m = /telegram_chats\(([^)]*)\)/.exec(this.cols)
    if (m) {
      const chat = (this.db.tables.telegram_chats ?? []).find((c) => c.id === r.chat_ref)
      out.telegram_chats = chat ? { ...chat } : null
    }
    return out
  }
  private run(): { data: unknown; error: unknown } {
    const t = (this.db.tables[this.table] ||= [])
    const hit = t.filter((r) => this.filters.every((f) => f(r)))
    let data: Row[] = []
    if (this.op === "select") data = hit.slice(0, this.n).map((r) => this.shape(r))
    else if (this.op === "update") {
      for (const r of hit) Object.assign(r, this.patch)
      data = hit.map((r) => ({ ...r }))
    } else if (this.op === "delete") {
      this.db.tables[this.table] = t.filter((r) => !hit.includes(r))
      data = hit
    } else {
      for (const raw of this.rows) {
        const row = { id: raw.id ?? uuid(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...raw }
        const keys = this.conflict ?? null
        const clash = (UNIQUE[this.table] ?? []).map((k) => t.find((e) => k.every((c) => e[c] != null && String(e[c]) === String(row[c])))).find(Boolean)
        if (clash) {
          if (this.op === "upsert" && keys && keys.every((c) => String(clash[c]) === String(row[c]))) {
            Object.assign(clash, raw)
            data.push({ ...clash })
            continue
          }
          if (this.op === "upsert" && !keys) {
            Object.assign(clash, raw)
            data.push({ ...clash })
            continue
          }
          return { data: null, error: { code: "23505", message: "duplicate key" } }
        }
        t.push(row)
        data.push({ ...row })
      }
    }
    if (this.mode === "many") return { data: this.op === "select" || this.returning || this.op === "insert" || this.op === "upsert" ? data : null, error: null }
    if (this.mode === "single" && data.length !== 1) return { data: null, error: { code: "PGRST116", message: "not one row" } }
    return { data: data[0] ?? null, error: null }
  }
  then<T>(ok: (v: { data: unknown; error: unknown }) => T, bad?: (e: unknown) => T) {
    try {
      return Promise.resolve(ok(this.run()))
    } catch (e) {
      return bad ? Promise.resolve(bad(e)) : Promise.reject(e)
    }
  }
}

/* ── Discord and Telegram, as their docs say they answer ─────────────────── */

interface Call {
  method: string
  url: string
  body: Row | null
  headers: Record<string, string>
}
type Answer = { status: number; body?: unknown }
function stubFetch(handler: (c: Call) => Answer | undefined): { fetch: Fetch; calls: Call[] } {
  const calls: Call[] = []
  const fetch: Fetch = async (url, init) => {
    const raw = typeof init?.body === "string" ? init.body : null
    let body: Row | null = null
    if (raw) {
      try {
        body = JSON.parse(raw)
      } catch {
        body = Object.fromEntries(new URLSearchParams(raw))
      }
    }
    const call: Call = { method: init?.method ?? "GET", url, body, headers: (init?.headers as Record<string, string>) ?? {} }
    calls.push(call)
    const a = handler(call) ?? { status: 404, body: { message: "Unknown", code: 0 } }
    return new Response(a.status === 204 ? null : JSON.stringify(a.body ?? {}), { status: a.status, headers: { "content-type": "application/json" } })
  }
  return { fetch, calls }
}

const ENV = {
  DISCORD_CLIENT_ID: "111111111111111111",
  DISCORD_CLIENT_SECRET: "client-secret",
  DISCORD_BOT_TOKEN: "bot-token",
  TELEGRAM_BOT_TOKEN: "7000000001:AAHabcdefghijklmnopqrstuvwxyz012345",
  TELEGRAM_WEBHOOK_SECRET: "hook_secret-123",
}
const GUILD = "222222222222222222"
const ROLE = "333333333333333333"
const BOT_ROLE = "444444444444444444"
const BOT_USER = "555555555555555555"
const BUYER_DISCORD = "666666666666666666"
const CREATOR = "aaaaaaaa-0000-4000-8000-000000000001"
const OWNER_USER = "aaaaaaaa-0000-4000-8000-000000000002"
const BUYER = "bbbbbbbb-0000-4000-8000-000000000001"
const PRODUCT = "cccccccc-0000-4000-8000-000000000001"
const MEMBERSHIP_PRODUCT = "cccccccc-0000-4000-8000-000000000002"
const CHAT = -1001234567890
const DAY = 86_400_000

/** Discord as a server where the bot's role is above "Members". */
function discordServer(over: (c: Call) => Answer | undefined = () => undefined, members: Record<string, string[]> = {}) {
  const memberRoles: Record<string, string[]> = { [BOT_USER]: [BOT_ROLE], ...members }
  return stubFetch((c) => {
    const o = over(c)
    if (o) return o
    const path = c.url.replace("https://discord.com/api/v10", "")
    if (path === "/oauth2/token") return { status: 200, body: { access_token: "user-access", refresh_token: "user-refresh", expires_in: 604800, scope: "identify guilds.join", token_type: "Bearer" } }
    if (path === "/users/@me") return c.headers.Authorization?.startsWith("Bot ") ? { status: 200, body: { id: BOT_USER, username: "Storelib" } } : { status: 200, body: { id: BUYER_DISCORD, username: "mara", global_name: "Mara" } }
    if (path === `/guilds/${GUILD}`) return { status: 200, body: { id: GUILD, name: "Night Owls", icon: null } }
    if (path === `/guilds/${GUILD}/roles`)
      return {
        status: 200,
        body: [
          { id: GUILD, name: "@everyone", position: 0, managed: false },
          { id: ROLE, name: "Members", position: 1, managed: false },
          { id: BOT_ROLE, name: "Storelib", position: 2, managed: true },
          { id: "777777777777777777", name: "Admins", position: 3, managed: false },
        ],
      }
    const member = /^\/guilds\/\d+\/members\/(\d+)$/.exec(path)
    if (member && c.method === "GET") return memberRoles[member[1]] ? { status: 200, body: { roles: memberRoles[member[1]] } } : { status: 404, body: { message: "Unknown Member", code: 10007 } }
    if (member && c.method === "PUT") {
      if (memberRoles[member[1]]) return { status: 204 }
      memberRoles[member[1]] = [...((c.body?.roles as string[]) ?? [])]
      return { status: 201, body: { roles: memberRoles[member[1]] } }
    }
    const role = /^\/guilds\/\d+\/members\/(\d+)\/roles\/(\d+)$/.exec(path)
    if (role) {
      if (!memberRoles[role[1]]) return { status: 404, body: { message: "Unknown Member", code: 10007 } }
      if (c.method === "PUT") memberRoles[role[1]] = [...new Set([...memberRoles[role[1]], role[2]])]
      else memberRoles[role[1]] = memberRoles[role[1]].filter((r) => r !== role[2])
      return { status: 204 }
    }
    return undefined
  })
}

function world(fetch: Fetch, env: Row = ENV, now = Date.parse("2026-11-20T12:00:00Z")) {
  const db = new FakeDb()
  db.tables.products = [
    { id: PRODUCT, creator_id: CREATOR, title: "Night Owls Pass", type: "digital", status: "published", created_at: "2026-01-01" },
    { id: MEMBERSHIP_PRODUCT, creator_id: CREATOR, title: "Night Owls Club", type: "membership", status: "published", created_at: "2026-01-02" },
  ]
  db.tables.profiles = [{ id: BUYER, email: "mara@example.com", display_name: "Mara", username: "mara" }]
  db.tables.entitlements = []
  db.tables.memberships = []
  db.tables.membership_plans = []
  let clock = now
  const deps: Deps = { db, fetch, env, now: () => clock }
  return { db, deps, tick: (ms: number) => (clock += ms), at: () => clock }
}

async function connected(w: ReturnType<typeof world>) {
  const r = await connectDiscordServer(w.deps, CREATOR, OWNER_USER, { tokens: { accessToken: "x", refreshToken: null, expiresAt: 0, scope: "bot", guild: { id: GUILD, name: "Night Owls", icon: null } }, guildIdHint: null })
  assert.ok(r.ok, JSON.stringify(r))
  const m = await saveDiscordMapping(w.deps, CREATOR, { productId: PRODUCT, roleId: ROLE })
  assert.ok(m.ok, JSON.stringify(m))
  await saveDiscordMapping(w.deps, CREATOR, { productId: MEMBERSHIP_PRODUCT, roleId: ROLE })
}

async function linked(w: ReturnType<typeof world>) {
  const r = await linkDiscordAccount(w.deps, BUYER, { accessToken: "user-access", refreshToken: "user-refresh", expiresAt: w.at() + 7 * DAY, scope: "identify guilds.join", guild: null })
  assert.ok(r.ok)
}

/** A refusal, read without strict narrowing (this suite compiles loose, like the list it is in). */
const E = (r: unknown) => r as { ok: boolean; error: string; status: number; link?: string }
const grants = (w: ReturnType<typeof world>, t = "discord_access_grants") => w.db.tables[t] ?? []
const writes = (calls: Call[], method: string, part: string) => calls.filter((c) => c.method === method && c.url.includes(part))

/* ═══ Disabled ══════════════════════════════════════════════════════════ */

check("no env vars: both providers off, nothing touched, no buttons", async () => {
  assert.equal(discordConfig({}), null)
  assert.equal(telegramConfig({}), null)
  assert.equal(anyProviderEnabled({}), false)
  assert.equal(discordConfig({ ...ENV, DISCORD_BOT_TOKEN: "" }), null, "one missing key is off")
  assert.equal(telegramConfig({ ...ENV, TELEGRAM_WEBHOOK_SECRET: "has spaces" }), null, "a secret Telegram would refuse is off")
  const { fetch, calls } = stubFetch(() => undefined)
  const w = world(fetch, {})
  const before = w.db.touched
  await communityRolesAfterEntitlement(w.db, { userId: BUYER, productId: PRODUCT }, w.deps)
  await communityRolesAfterMembership(w.db, { product_id: MEMBERSHIP_PRODUCT, buyer_id: BUYER }, w.deps)
  assert.equal(w.db.touched, before, "the hooks return before any read")
  assert.deepEqual(await joinOptions(w.deps, { userId: BUYER, email: null }, [PRODUCT], "https://storelib.com"), [])
  const status = await communityRolesStatus(w.deps, CREATOR)
  assert.equal(status.discord.available, false)
  assert.equal(status.telegram.available, false)
  const setup = await loadDiscordSetup(w.deps, CREATOR)
  assert.equal(setup.available, false)
  assert.deepEqual(await runDue(w.deps), { available: true, ran: 0, granted: 0, revoked: 0, failed: 0 })
  assert.equal(await handleTelegramUpdate(w.deps, { message: { text: "/link ABCDE-FGHJK", chat: { id: CHAT, type: "supergroup" } } }), "ignored")
  assert.equal(calls.length, 0, "Discord and Telegram never called")
})

check("no env vars: the webhook route is a 404 and the buttons route an empty list", async () => {
  const saved = { a: process.env.TELEGRAM_BOT_TOKEN, b: process.env.DISCORD_BOT_TOKEN }
  delete process.env.TELEGRAM_BOT_TOKEN
  delete process.env.DISCORD_BOT_TOKEN
  const { POST } = await import("../app/api/community-roles/telegram/webhook/route")
  const res = await POST(new Request("https://storelib.com/api/community-roles/telegram/webhook", { method: "POST", body: "{}" }))
  assert.equal(res.status, 404)
  const { GET } = await import("../app/api/community-roles/options/route")
  const opt = await GET(new Request("https://storelib.com/api/community-roles/options?products=" + PRODUCT))
  assert.deepEqual(await opt.json(), { options: [] })
  if (saved.a) process.env.TELEGRAM_BOT_TOKEN = saved.a
  if (saved.b) process.env.DISCORD_BOT_TOKEN = saved.b
})

check("the UI says Not available yet without keys", () => {
  const panel = read("components/app/settings/community-access-panel.tsx")
  assert.ok(panel.includes('tt("Not available yet")'))
  const buttons = read("components/community-roles/join-buttons.tsx")
  assert.ok(buttons.includes("options.length === 0") || buttons.includes("!options.length"), "no options, no buttons")
})

/* ═══ Install callback state ════════════════════════════════════════════ */

check("the install state: only this account, this browser, unaltered and within ten minutes", () => {
  const now = Date.parse("2026-11-20T12:00:00Z")
  const { state, nonce } = makeState({ kind: "install", userId: OWNER_USER, productId: null, back: "/app/settings?tab=integrations&integration=discord" }, now)
  const ok = readState(state, nonce, OWNER_USER, now + 60_000)
  assert.equal(ok?.kind, "install")
  assert.equal(ok?.back, "/app/settings?tab=integrations&integration=discord")
  assert.equal(readState(state, nonce, BUYER, now), null, "another account")
  assert.equal(readState(state, "other-nonce", OWNER_USER, now), null, "another browser")
  assert.equal(readState(state, undefined, OWNER_USER, now), null, "no cookie")
  assert.equal(readState(state, nonce, OWNER_USER, now + 11 * 60_000), null, "too old")
  const [body, mac] = state.split(".")
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), k: "join", p: PRODUCT })).toString("base64url")
  assert.equal(readState(`${forged}.${mac}`, nonce, OWNER_USER, now), null, "altered")
  assert.equal(safeBack("//evil.example/x"), null)
  assert.equal(safeBack("https://evil.example"), null)
  assert.equal(safeBack("/account/library"), "/account/library")
})

check("the install screen asks for bot and applications.commands with Manage Roles and Create Invite", () => {
  const config = discordConfig(ENV)!
  const u = new URL(installUrl(config, "https://storelib.com/api/community-roles/discord/callback", "s"))
  assert.equal(u.origin + u.pathname, "https://discord.com/oauth2/authorize")
  assert.equal(u.searchParams.get("scope"), "bot applications.commands")
  assert.equal(BOT_PERMISSIONS, String(268435456 + 1))
  assert.equal(u.searchParams.get("permissions"), "268435457")
  assert.equal(u.searchParams.get("response_type"), "code")
  assert.equal(u.searchParams.get("state"), "s")
  const j = new URL(joinUrl(config, "https://storelib.com/cb", "t"))
  assert.equal(j.searchParams.get("scope"), "identify guilds.join")
})

check("the install answer: the server Discord names, the bot in it, one store a server", async () => {
  const { fetch } = discordServer()
  const w = world(fetch)
  const r = await connectDiscordServer(w.deps, CREATOR, OWNER_USER, { tokens: { accessToken: "x", refreshToken: null, expiresAt: 0, scope: "bot", guild: { id: GUILD, name: "Night Owls", icon: null } }, guildIdHint: "999999999999999999" })
  assert.ok(r.ok)
  assert.equal(w.db.tables.discord_connections[0].guild_id, GUILD, "the token's server, not the hint")
  const notIn = await connectDiscordServer(w.deps, CREATOR, OWNER_USER, { tokens: null, guildIdHint: "999999999999999999" })
  assert.ok(!notIn.ok && /not in that server/.test(E(notIn).error))
  const other = await connectDiscordServer(w.deps, "aaaaaaaa-0000-4000-8000-0000000000ff", OWNER_USER, { tokens: null, guildIdHint: GUILD })
  assert.ok(!other.ok && E(other).status === 409, "another store cannot take a connected server")
  const none = await connectDiscordServer(w.deps, CREATOR, OWNER_USER, { tokens: null, guildIdHint: "not-a-snowflake" })
  assert.ok(!none.ok)
})

check("the callback route refuses a state it did not sign", () => {
  const route = read("app/api/community-roles/discord/callback/route.ts")
  assert.ok(route.includes("readState(url.searchParams.get(\"state\"), nonce, who.userId)"))
  assert.ok(route.includes('if (!state) return clearNonce(backTo("/account/library", "discord", "expired"))'))
  assert.ok(read("app/api/community-roles/discord/connect/route.ts").includes("httpOnly: true"))
})

/* ═══ Grant on purchase ═════════════════════════════════════════════════ */

check("grant on purchase: a linked buyer is added to the server with the role", async () => {
  const { fetch, calls } = discordServer()
  const w = world(fetch)
  await connected(w)
  await linked(w)
  w.db.tables.entitlements.push({ buyer_id: BUYER, product_id: PRODUCT })
  await communityRolesAfterEntitlement(w.db, { userId: BUYER, productId: PRODUCT }, w.deps)
  const add = writes(calls, "PUT", `/guilds/${GUILD}/members/${BUYER_DISCORD}`).find((c) => !c.url.includes("/roles/"))
  assert.ok(add, "PUT /guilds/{guild}/members/{user}")
  assert.equal(add!.body?.access_token, "user-access")
  assert.deepEqual(add!.body?.roles, [ROLE])
  assert.ok(add!.headers.Authorization.startsWith("Bot "), "with the bot's token")
  const g = grants(w).find((x) => x.product_id === PRODUCT)!
  assert.equal(g.status, "granted")
  assert.equal(g.discord_user_id, BUYER_DISCORD)
  assert.ok((w.db.tables.discord_access_log ?? []).some((l) => l.action === "granted"), "logged")
  const link = w.db.tables.discord_member_links[0]
  assert.ok(String(link.access_token_sealed).startsWith("v1.") && !String(link.access_token_sealed).includes("user-access"), "the token is sealed")
})

check("grant on purchase: a buyer who has not linked Discord waits, then Join adds them", async () => {
  const { fetch, calls } = discordServer()
  const w = world(fetch)
  await connected(w)
  w.db.tables.entitlements.push({ buyer_id: BUYER, product_id: PRODUCT })
  await communityRolesAfterEntitlement(w.db, { userId: BUYER, productId: PRODUCT }, w.deps)
  assert.equal(grants(w)[0].status, "needs_link")
  assert.equal(writes(calls, "PUT", "/members/").length, 0)
  const opts = await joinOptions(w.deps, { userId: BUYER, email: null }, [PRODUCT], "https://storelib.com")
  assert.equal(opts.length, 1)
  assert.equal(opts[0].state, "join")
  assert.equal(opts[0].name, "Night Owls")
  assert.ok(opts[0].href.startsWith("https://storelib.com/api/community-roles/discord/join?product="))
  await linked(w)
  const r = await joinDiscord(w.deps, { userId: BUYER, email: null }, PRODUCT)
  assert.ok(r.ok && r.guildId === GUILD, JSON.stringify(r))
  assert.equal(grants(w)[0].status, "granted")
  const after = await joinOptions(w.deps, { userId: BUYER, email: null }, [PRODUCT], "https://storelib.com")
  assert.equal(after[0].state, "joined")
  assert.equal(after[0].href, `https://discord.com/channels/${GUILD}`)
})

check("a buyer already in the server: 204 from Add Guild Member, then the role by PUT role", async () => {
  const { fetch, calls } = discordServer(undefined, { [BUYER_DISCORD]: [] })
  const w = world(fetch)
  await connected(w)
  await linked(w)
  w.db.tables.entitlements.push({ buyer_id: BUYER, product_id: PRODUCT })
  const r = await joinDiscord(w.deps, { userId: BUYER, email: null }, PRODUCT)
  assert.ok(r.ok, JSON.stringify(r))
  assert.equal(writes(calls, "PUT", `/members/${BUYER_DISCORD}/roles/${ROLE}`).length, 1, "PUT /guilds/{guild}/members/{user}/roles/{role}")
  assert.equal(grants(w).find((g) => g.product_id === PRODUCT)!.status, "granted")
})

check("no access, no join: someone who did not buy is refused", async () => {
  const { fetch } = discordServer()
  const w = world(fetch)
  await connected(w)
  await linked(w)
  const r = await joinDiscord(w.deps, { userId: BUYER, email: null }, PRODUCT)
  assert.ok(!r.ok && E(r).status === 403)
  assert.deepEqual(await joinOptions(w.deps, { userId: BUYER, email: null }, [PRODUCT], "https://storelib.com"), [])
  const signedOut = await joinOptions(w.deps, null, [PRODUCT], "https://storelib.com")
  assert.equal(signedOut[0]?.state, "sign_in", "a visitor is told it comes with a server, and to sign in")
})

/* ═══ Revoke ════════════════════════════════════════════════════════════ */

async function memberWithRole(over?: (c: Call) => Answer | undefined) {
  const s = discordServer(over)
  const w = world(s.fetch)
  await connected(w)
  await linked(w)
  const m = { id: uuid(), product_id: MEMBERSHIP_PRODUCT, buyer_id: BUYER, buyer_email: "mara@example.com", status: "active", current_period_end: new Date(w.at() + 20 * DAY).toISOString(), past_due_since: null }
  w.db.tables.memberships.push(m)
  await communityRolesAfterMembership(w.db, m, w.deps)
  assert.equal(grants(w).find((g) => g.product_id === MEMBERSHIP_PRODUCT)?.status, "granted")
  return { ...s, w, m }
}

check("revoke on cancel: a membership that ended takes the role back", async () => {
  const { w, m, calls } = await memberWithRole()
  Object.assign(m, { status: "expired" })
  await communityRolesAfterMembership(w.db, m, w.deps)
  assert.equal(writes(calls, "DELETE", `/members/${BUYER_DISCORD}/roles/${ROLE}`).length, 1, "DELETE /guilds/{guild}/members/{user}/roles/{role}")
  const g = grants(w).find((x) => x.product_id === MEMBERSHIP_PRODUCT)!
  assert.equal(g.status, "revoked")
  assert.equal(g.want, "out")
})

check("cancelled at period end: kept while the paid period runs, gone after it", async () => {
  const { w, m, calls } = await memberWithRole()
  Object.assign(m, { status: "canceled" })
  await communityRolesAfterMembership(w.db, m, w.deps)
  assert.equal(writes(calls, "DELETE", "/roles/").length, 0, "the period is still paid for")
  w.tick(21 * DAY)
  const queued = await recheckAccess(w.deps)
  assert.equal(queued, 1)
  await runDue(w.deps)
  assert.equal(writes(calls, "DELETE", "/roles/").length, 1)
})

check("revoke on past_due: within the seven day grace it stays, after it the cron takes it", async () => {
  const { w, m, calls } = await memberWithRole()
  Object.assign(m, { status: "past_due", past_due_since: new Date(w.at()).toISOString() })
  await communityRolesAfterMembership(w.db, m, w.deps)
  assert.equal(writes(calls, "DELETE", "/roles/").length, 0, "within the grace")
  w.tick(8 * DAY)
  await recheckAccess(w.deps)
  await runDue(w.deps)
  assert.equal(writes(calls, "DELETE", "/roles/").length, 1, "past the grace")
  assert.equal(grants(w).find((x) => x.product_id === MEMBERSHIP_PRODUCT)!.status, "revoked")
})

check("revoke on refund: the library row gone, the role goes", async () => {
  const { fetch, calls } = discordServer()
  const w = world(fetch)
  await connected(w)
  await linked(w)
  w.db.tables.entitlements.push({ buyer_id: BUYER, product_id: PRODUCT })
  await communityRolesAfterEntitlement(w.db, { userId: BUYER, productId: PRODUCT }, w.deps)
  w.db.tables.entitlements = []
  await communityRolesAfterEntitlement(w.db, { userId: BUYER, productId: PRODUCT }, w.deps)
  assert.equal(writes(calls, "DELETE", `/roles/${ROLE}`).length, 1)
  assert.equal(grants(w)[0].status, "revoked")
})

check("the payment code calls the hooks, after its own work, through payment-hooks", () => {
  const hooks = read("lib/communities/server/payment-hooks.ts")
  assert.ok(hooks.includes("m.communityRolesAfterMembership(db, row)"))
  assert.ok(hooks.includes("m.communityRolesAfterEntitlement(db, { userId: e.userId, productId: e.productId })"))
  assert.ok(read("lib/community-roles/engine.ts").includes("after(guarded)"), "after the response")
  assert.ok(read("lib/stripe/refund-sync.ts").includes("communityAccessAfterEntitlement(db, { userId: row.buyer_id, productId: row.product_id, orderId: row.id, granted: false })"), "refunds reach it")
  assert.ok(read("lib/memberships/sync.ts").includes("communityAccessAfterMembership(admin, row"), "every membership sync reaches it")
  assert.ok(read("app/api/cron/memberships/route.ts").includes("runCommunityRoleCron(realDeps(admin))"), "the cron retries and rechecks")
})

/* ═══ Idempotency ═══════════════════════════════════════════════════════ */

check("idempotent: the same signal twice is one grant and one call", async () => {
  const { fetch, calls } = discordServer()
  const w = world(fetch)
  await connected(w)
  await linked(w)
  w.db.tables.entitlements.push({ buyer_id: BUYER, product_id: PRODUCT })
  await communityRolesAfterEntitlement(w.db, { userId: BUYER, productId: PRODUCT }, w.deps)
  await communityRolesAfterEntitlement(w.db, { userId: BUYER, productId: PRODUCT }, w.deps)
  assert.equal(grants(w).filter((g) => g.product_id === PRODUCT).length, 1)
  assert.equal(writes(calls, "PUT", `/members/${BUYER_DISCORD}`).length, 1)
})

check("idempotent: two workers on one due row make one try", async () => {
  const { fetch, calls } = discordServer()
  const w = world(fetch)
  await connected(w)
  await linked(w)
  w.db.tables.entitlements.push({ buyer_id: BUYER, product_id: PRODUCT })
  const q = await settleAccess(w.deps, { userId: BUYER }, [PRODUCT])
  assert.equal(q.discord.length, 1)
  await Promise.all([runDue(w.deps, { ids: q }), runDue(w.deps, { ids: q })])
  assert.equal(writes(calls, "PUT", `/members/${BUYER_DISCORD}`).length, 1)
  assert.equal(grants(w)[0].attempts, 1)
})

check("idempotent: a role another purchase still gives is kept when one ends", async () => {
  const { w, calls } = await memberWithRole()
  w.db.tables.entitlements.push({ buyer_id: BUYER, product_id: PRODUCT })
  await communityRolesAfterEntitlement(w.db, { userId: BUYER, productId: PRODUCT }, w.deps)
  w.db.tables.memberships[0].status = "expired"
  await communityRolesAfterMembership(w.db, w.db.tables.memberships[0] as { product_id: string; buyer_id: string }, w.deps)
  assert.equal(writes(calls, "DELETE", "/roles/").length, 0, "the one time purchase still gives Members")
  assert.equal(grants(w).find((g) => g.product_id === MEMBERSHIP_PRODUCT)!.status, "revoked")
  assert.equal(grants(w).find((g) => g.product_id === PRODUCT)!.status, "granted")
})

/* ═══ Role hierarchy ════════════════════════════════════════════════════ */

check("the role hierarchy: a role above the bot cannot be mapped, with how to fix it", async () => {
  const roles = [
    { id: GUILD, name: "@everyone", position: 0, managed: false },
    { id: ROLE, name: "Members", position: 1, managed: false },
    { id: BOT_ROLE, name: "Storelib", position: 2, managed: true },
    { id: "777777777777777777", name: "Admins", position: 3, managed: false },
  ]
  assert.equal(roleProblem(roles, [BOT_ROLE], ROLE, GUILD), null)
  assert.equal(roleProblem(roles, [BOT_ROLE], "777777777777777777", GUILD), "above_bot")
  assert.equal(roleProblem(roles, [BOT_ROLE], GUILD, GUILD), "everyone")
  assert.equal(roleProblem(roles, [BOT_ROLE], BOT_ROLE, GUILD), "managed")
  assert.equal(roleProblem(roles, [BOT_ROLE], "888888888888888888", GUILD), "missing")
  assert.match(roleProblemText("above_bot", "Admins"), /Server Settings › Roles and drag the Storelib role above "Admins"/)
  const { fetch } = discordServer()
  const w = world(fetch)
  await connected(w)
  const r = await saveDiscordMapping(w.deps, CREATOR, { productId: PRODUCT, roleId: "777777777777777777" })
  assert.ok(!r.ok && E(r).status === 409 && /drag the Storelib role above/.test(E(r).error))
  const view = await loadDiscordSetup(w.deps, CREATOR)
  assert.ok(view.roles?.find((x) => x.name === "Admins")?.problem, "the setup screen marks it")
  assert.equal(view.roles?.find((x) => x.name === "Members")?.problem, null)
})

check("the role hierarchy: Discord's 50013 blocks the grant, tells the creator, and Try again runs it", async () => {
  let refuse = true
  const { fetch } = discordServer((c) => (refuse && c.method === "PUT" ? { status: 403, body: { message: "Missing Permissions", code: 50013 } } : undefined))
  const w = world(fetch)
  await connected(w)
  await linked(w)
  w.db.tables.entitlements.push({ buyer_id: BUYER, product_id: PRODUCT })
  await communityRolesAfterEntitlement(w.db, { userId: BUYER, productId: PRODUCT }, w.deps)
  const g = grants(w)[0]
  assert.equal(g.status, "blocked")
  assert.equal(g.last_error_code, "role_hierarchy")
  assert.match(g.last_error, /Storelib role above "Members"/)
  assert.match(w.db.tables.discord_connections[0].last_error, /Server Settings › Roles/, "on the connection, for the top of the screen")
  assert.equal(kindOf(403, 50013), "hierarchy")
  refuse = false
  const r = await retryGrant(w.deps, CREATOR, "discord", g.id)
  assert.ok(r.ok && r.grantStatus === "granted", JSON.stringify(r))
  assert.equal(w.db.tables.discord_connections[0].last_error, null)
})

/* ═══ Retries ═══════════════════════════════════════════════════════════ */

check("retries: a 429 waits Discord's retry_after; enough failures end in failed", async () => {
  let limited = true
  const { fetch } = discordServer((c) => (limited && c.method === "PUT" ? { status: 429, body: { message: "You are being rate limited.", retry_after: 30, global: false } } : undefined))
  const w = world(fetch)
  await connected(w)
  await linked(w)
  w.db.tables.entitlements.push({ buyer_id: BUYER, product_id: PRODUCT })
  await communityRolesAfterEntitlement(w.db, { userId: BUYER, productId: PRODUCT }, w.deps)
  const g = grants(w)[0]
  assert.equal(g.status, "pending")
  assert.ok(Date.parse(g.next_attempt_at) >= w.at() + 30_000, "not before retry_after")
  assert.equal((await runDue(w.deps)).ran, 0, "not due yet")
  assert.equal(backoffMs(1), 60_000)
  assert.equal(backoffMs(3), 240_000)
  assert.equal(backoffMs(30), 6 * 3_600_000)
  for (let i = 0; i < MAX_ATTEMPTS + 2; i++) {
    w.tick(7 * 3_600_000)
    await runDue(w.deps)
  }
  assert.equal(grants(w)[0].status, "failed")
  limited = false
})

/* ═══ Telegram ══════════════════════════════════════════════════════════ */

function telegram(over: (method: string, body: Row) => Answer | undefined = () => undefined) {
  let n = 0
  return stubFetch((c) => {
    const method = c.url.split("/").pop()!
    assert.ok(c.url.startsWith(`https://api.telegram.org/bot${ENV.TELEGRAM_BOT_TOKEN}/`))
    const o = over(method, c.body ?? {})
    if (o) return o
    switch (method) {
      case "getChatMember":
        return { status: 200, body: { ok: true, result: { status: "administrator", can_invite_users: true, can_restrict_members: true, user: { id: 7000000001, is_bot: true } } } }
      case "createChatInviteLink":
        return { status: 200, body: { ok: true, result: { invite_link: `https://t.me/+invite${++n}`, member_limit: c.body?.member_limit, expire_date: c.body?.expire_date, creates_join_request: false, is_primary: false, is_revoked: false } } }
      case "getMe":
        return { status: 200, body: { ok: true, result: { id: 7000000001, is_bot: true, username: "StorelibBot" } } }
      default:
        return { status: 200, body: { ok: true, result: true } }
    }
  })
}

async function linkedChat(w: ReturnType<typeof world>) {
  const code = await makeTelegramLinkCode(w.deps, CREATOR, OWNER_USER)
  assert.ok(code.ok)
  const out = await handleTelegramUpdate(w.deps, { update_id: 1, message: { message_id: 9, text: `/link@StorelibBot ${code.code}`, chat: { id: CHAT, type: "supergroup", title: "Night Owls chat" }, from: { id: 1 } } })
  assert.equal(out, "linked")
  const chat = w.db.tables.telegram_chats[0]
  w.db.tables.telegram_chat_mappings = [{ id: uuid(), creator_id: CREATOR, product_id: PRODUCT, chat_ref: chat.id }]
  return { code: code.code, chat }
}

check("telegram: the webhook secret header, compared exactly", async () => {
  const config = telegramConfig(ENV)
  assert.equal(webhookSecretOk(config, "hook_secret-123"), true)
  assert.equal(webhookSecretOk(config, "hook_secret-124"), false)
  assert.equal(webhookSecretOk(config, ""), false)
  assert.equal(webhookSecretOk(config, null), false)
  assert.equal(webhookSecretOk(null, "hook_secret-123"), false)
  Object.assign(process.env, { TELEGRAM_BOT_TOKEN: ENV.TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET: ENV.TELEGRAM_WEBHOOK_SECRET })
  const { POST } = await import("../app/api/community-roles/telegram/webhook/route")
  const res = await POST(new Request("https://storelib.com/api/community-roles/telegram/webhook", { method: "POST", headers: { "x-telegram-bot-api-secret-token": "wrong" }, body: "{}" }))
  assert.equal(res.status, 401)
  const none = await POST(new Request("https://storelib.com/api/community-roles/telegram/webhook", { method: "POST", body: "{}" }))
  assert.equal(none.status, 401)
  delete process.env.TELEGRAM_BOT_TOKEN
  delete process.env.TELEGRAM_WEBHOOK_SECRET
})

check("telegram: /link with a one time code links the chat once; a used, old or wrong code is refused", async () => {
  const { fetch, calls } = telegram()
  const w = world(fetch)
  const { code } = await linkedChat(w)
  assert.equal(w.db.tables.telegram_chats[0].creator_id, CREATOR)
  assert.equal(w.db.tables.telegram_chats[0].status, "linked")
  assert.ok(!w.db.tables.telegram_link_codes[0].code_hash.includes(code.replace("-", "")), "kept as a hash")
  assert.ok(calls.some((c) => c.url.endsWith("/deleteMessage")), "the code is taken out of the chat")
  const again = await handleTelegramUpdate(w.deps, { message: { text: `/link ${code}`, chat: { id: -100999, type: "supergroup" } } })
  assert.equal(again, "link_refused", "used once")
  const late = await makeTelegramLinkCode(w.deps, CREATOR, OWNER_USER)
  assert.ok(late.ok)
  w.tick(31 * 60_000)
  assert.equal(await handleTelegramUpdate(w.deps, { message: { text: `/link ${late.code}`, chat: { id: -100998, type: "supergroup" } } }), "link_refused", "thirty minutes")
  assert.equal(linkCommandOf({ message: { text: "/link x", chat: { id: 1, type: "private" } } }), null, "not in a private chat")
})

check("telegram: the bot must be an admin with Invite users and Ban users to link", async () => {
  const { fetch } = telegram((m) => (m === "getChatMember" ? { status: 200, body: { ok: true, result: { status: "administrator", can_invite_users: true, can_restrict_members: false } } } : undefined))
  const w = world(fetch)
  const code = await makeTelegramLinkCode(w.deps, CREATOR, OWNER_USER)
  assert.ok(code.ok)
  assert.equal(await handleTelegramUpdate(w.deps, { message: { text: `/link ${code.code}`, chat: { id: CHAT, type: "supergroup" } } }), "link_refused")
  assert.equal((w.db.tables.telegram_chats ?? []).length, 0)
  assert.equal(w.db.tables.telegram_link_codes[0].used_at ?? null, null, "the code still works once the rights are fixed")
})

check("telegram: one use invites, the join recorded, removal as ban then unban", async () => {
  const { fetch, calls } = telegram()
  const w = world(fetch)
  await linkedChat(w)
  w.db.tables.entitlements.push({ buyer_id: BUYER, product_id: PRODUCT })
  const first = await joinTelegram(w.deps, { userId: BUYER, email: null }, PRODUCT, null)
  assert.ok(first.ok, JSON.stringify(first))
  const create = calls.filter((c) => c.url.endsWith("/createChatInviteLink"))
  assert.equal(create.length, 1)
  assert.equal(create[0].body?.member_limit, 1, "one person")
  assert.equal(create[0].body?.chat_id, CHAT)
  assert.ok(Number(create[0].body?.expire_date) > w.at() / 1000 && Number(create[0].body?.expire_date) <= w.at() / 1000 + 86_400, "for a day")
  assert.equal(create[0].body?.creates_join_request, undefined, "member_limit and creates_join_request are not combined")
  const second = await joinTelegram(w.deps, { userId: BUYER, email: null }, PRODUCT, null)
  assert.ok(second.ok && first.ok && E(second).link === E(first).link, "pressed again: the same link")
  assert.equal(calls.filter((c) => c.url.endsWith("/createChatInviteLink")).length, 1)
  const g = grants(w, "telegram_access_grants")[0]
  assert.equal(g.status, "invited")
  assert.ok(String(g.invite_link_sealed).startsWith("v1.") && g.invite_link_hash === hashOf(E(first).link ?? ""), "sealed, found by its hash")

  const joined = await handleTelegramUpdate(w.deps, { chat_member: { chat: { id: CHAT, type: "supergroup" }, from: { id: 42 }, date: 1, old_chat_member: { status: "left", user: { id: 42 } }, new_chat_member: { status: "member", user: { id: 42, is_bot: false, username: "mara" } }, invite_link: { invite_link: E(first).link ?? "" } } })
  assert.equal(joined, "joined")
  assert.equal(grants(w, "telegram_access_grants")[0].status, "granted")
  assert.equal(grants(w, "telegram_access_grants")[0].telegram_user_id, 42)

  w.db.tables.entitlements = []
  await communityRolesAfterEntitlement(w.db, { userId: BUYER, productId: PRODUCT }, w.deps)
  const ban = calls.findIndex((c) => c.url.endsWith("/banChatMember"))
  const unban = calls.findIndex((c) => c.url.endsWith("/unbanChatMember"))
  assert.ok(ban > -1 && unban > ban, "banChatMember, then unbanChatMember")
  assert.equal(calls[ban].body?.user_id, 42)
  assert.equal(calls[unban].body?.only_if_banned, true, "removed, not banned for good")
  assert.equal(grants(w, "telegram_access_grants")[0].status, "revoked")
})

check("telegram: an invite never used is revoked when access ends; a join after that is removed", async () => {
  const { fetch, calls } = telegram()
  const w = world(fetch)
  await linkedChat(w)
  w.db.tables.entitlements.push({ buyer_id: BUYER, product_id: PRODUCT })
  const inv = await joinTelegram(w.deps, { userId: BUYER, email: null }, PRODUCT, null)
  assert.ok(inv.ok)
  w.db.tables.entitlements = []
  await communityRolesAfterEntitlement(w.db, { userId: BUYER, productId: PRODUCT }, w.deps)
  assert.ok(calls.some((c) => c.url.endsWith("/revokeChatInviteLink")), "the unused invite is closed")
  assert.equal(calls.filter((c) => c.url.endsWith("/banChatMember")).length, 0, "nobody to remove")
  const denied = await joinTelegram(w.deps, { userId: BUYER, email: null }, PRODUCT, null)
  assert.ok(!denied.ok && E(denied).status === 403)
})

check("telegram: the bot losing its admin rights blocks removal with words the creator can act on", async () => {
  let fail = false
  const { fetch } = telegram((m) => (fail && m === "banChatMember" ? { status: 400, body: { ok: false, error_code: 400, description: "Bad Request: not enough rights to restrict/unrestrict chat member" } } : undefined))
  const w = world(fetch)
  await linkedChat(w)
  w.db.tables.entitlements.push({ buyer_id: BUYER, product_id: PRODUCT })
  const inv = await joinTelegram(w.deps, { userId: BUYER, email: null }, PRODUCT, null)
  assert.ok(inv.ok)
  await handleTelegramUpdate(w.deps, { chat_member: { chat: { id: CHAT, type: "supergroup" }, old_chat_member: { status: "left", user: { id: 42 } }, new_chat_member: { status: "member", user: { id: 42 } }, invite_link: { invite_link: E(inv).link ?? "" } } })
  fail = true
  w.db.tables.entitlements = []
  await communityRolesAfterEntitlement(w.db, { userId: BUYER, productId: PRODUCT }, w.deps)
  const g = grants(w, "telegram_access_grants")[0]
  assert.equal(g.status, "blocked")
  assert.match(g.last_error, /admin of "Night Owls chat" with Invite users and Ban users/)
})

check("telegram: member updates read right", () => {
  const c = memberChangeOf({ chat_member: { chat: { id: 1, type: "channel" }, old_chat_member: { status: "member", user: { id: 2 } }, new_chat_member: { status: "left", user: { id: 2 } } } })
  assert.equal(c?.left, true)
  const r = memberChangeOf({ chat_member: { chat: { id: 1, type: "supergroup" }, old_chat_member: { status: "left", user: { id: 2 } }, new_chat_member: { status: "restricted", is_member: false, user: { id: 2 } } } })
  assert.equal(r?.joined, false, "restricted but not in the chat is not a join")
  const bot = memberChangeOf({ my_chat_member: { chat: { id: 1, type: "supergroup" }, old_chat_member: { status: "administrator", user: { id: 7 } }, new_chat_member: { status: "kicked", user: { id: 7, is_bot: true } } } })
  assert.equal(bot?.aboutBot, true)
  assert.equal(bot?.botStatus, "kicked")
})

/* ═══ SQL ═══════════════════════════════════════════════════════════════ */

check("SQL 473 and 474: safe to run again, server only, tokens sealed, copied to migrations", () => {
  for (const [part, mig, tables] of [
    ["473_discord_member_roles.sql", "20271473_discord_member_roles.sql", ["discord_connections", "discord_role_mappings", "discord_member_links", "discord_access_grants", "discord_access_log"]],
    ["474_telegram_member_access.sql", "20271474_telegram_member_access.sql", ["telegram_chats", "telegram_link_codes", "telegram_chat_mappings", "telegram_access_grants", "telegram_access_log"]],
  ] as const) {
    const sql = read(`supabase/sql/run-now/${part}`)
    assert.equal(sql, read(`supabase/migrations/${mig}`), `${part}: byte for byte in migrations`)
    const lines = sql.trimEnd().split("\n")
    assert.ok(lines[0].startsWith("/* ") && lines[0].endsWith("*/"))
    assert.equal(lines[lines.length - 1], "notify pgrst, 'reload schema';")
    assert.ok(!lines.some((l) => l.trimStart().startsWith("--")))
    assert.ok(!/\bDROP\b|\bDELETE FROM\b|\bUPDATE public\./i.test(sql), "changes no existing row")
    for (const line of lines.slice(1)) if (/^CREATE (TABLE|UNIQUE INDEX|INDEX)/.test(line)) assert.ok(/IF NOT EXISTS/.test(line), `idempotent: ${line.slice(0, 60)}`)
    for (const t of tables) {
      assert.ok(sql.includes(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;`), `${t}: RLS`)
      assert.ok(new RegExp(`REVOKE ALL ON [^;]*public\\.${t}\\b[^;]*FROM PUBLIC, anon, authenticated;`).test(sql), `${t}: nothing for browsers`)
    }
    assert.ok(read("supabase/sql/run-now/README.md").includes(`| \`${part}\` |`))
  }
  const p473 = read("supabase/sql/run-now/473_discord_member_roles.sql")
  assert.ok(p473.includes("access_token_sealed LIKE 'v1.%'") && p473.includes("refresh_token_sealed LIKE 'v1.%'"), "only sealed tokens fit")
  assert.ok(p473.includes("CONSTRAINT discord_access_grants_once UNIQUE (mapping_id, user_id)"))
  assert.ok(read("supabase/sql/run-now/474_telegram_member_access.sql").includes("CONSTRAINT telegram_access_grants_once UNIQUE (mapping_id, user_id)"))
})

/* Kept honest: an old token in the database still opens. */
check("sealed values are the integration secrets' own format", () => {
  assert.ok(sealSecret("x").startsWith("v1."))
})

/* ── run ─────────────────────────────────────────────────────────────── */
;(async () => {
  for (const [name, fn] of tests) {
    try {
      await fn()
      passed++
      console.log(`  ok    ${name}`)
    } catch (e) {
      failures.push(name)
      console.log(`  FAIL  ${name}\n        ${e instanceof Error ? (e.stack ?? e.message).split("\n").slice(0, 4).join("\n        ") : e}`)
    }
  }
  console.log(`\n${passed} passed, ${failures.length} failed`)
  if (failures.length) process.exit(1)
  process.exit(0)
})()
