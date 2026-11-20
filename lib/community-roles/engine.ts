import "server-only"

/**
 * ===========================================================================
 *  GIVING AND TAKING BACK DISCORD ROLES AND TELEGRAM CHATS
 * ===========================================================================
 * One grant row per buyer and mapping (SQL parts 473 and 474) says what
 * Storelib wants (`want`: in or out) and where it stands (`status`). The row
 * is the job: a change of access sets want and puts it back to pending, and
 * a worker carries it out. So:
 *
 *   NEVER IN THE WAY OF A PAYMENT. The payment code tells us after it has
 *   done its own work (lib/communities/server/payment-hooks), and the whole
 *   of what follows runs in next/server after(), once the webhook has
 *   answered Stripe. Outside a request (the cron) it runs in line.
 *
 *   IDEMPOTENT. A row per (mapping, buyer), unique in the database. Giving a
 *   role the member has, or taking one they do not have, is a 204 from
 *   Discord; a Telegram member removed twice is still out. A grant already
 *   granted is not asked again.
 *
 *   RETRIED. Discord or Telegram not answering, a 429 or a 5xx leaves the row
 *   pending with a later next_attempt_at (their retry_after when they give
 *   one, else 1, 2, 4... minutes up to six hours), and /api/cron/memberships
 *   runs what is due every fifteen minutes. A row is claimed by moving its
 *   next_attempt_at forward where `attempts` is still what was read, so two
 *   workers never run the same try. After MAX_ATTEMPTS it is failed and the
 *   creator sees it with Try again.
 *
 *   SAID. Every row carries its last error in words the creator can act on
 *   (the bot's role below the mapped role, the bot not an admin), and each
 *   step is a line in the access log. Settings › Integrations shows both.
 *
 *   CHECKED AGAIN. The cron also walks grants that are in and asks access
 *   again (./access hasAccess), so a past due grace that ran out, or a
 *   product a membership included, is taken back even with no event.
 */
import { after } from "next/server"
import { openSecret, sealSecret } from "@/lib/physical/secrets"
import { discordConfig, telegramConfig, type Env } from "./config"
import { DiscordError, addMember, addRole, refreshTokens, removeRole, roleProblemText, type Fetch } from "./discord-api"
import { TelegramError, createOneUseInvite, hashOf, removeMember, revokeInvite } from "./telegram-api"
import { hasAccess } from "./access"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = any

export interface Deps {
  db: Db
  fetch: Fetch
  env: Env
  now: () => number
}

export function realDeps(db: Db): Deps {
  return { db, fetch: (input, init) => fetch(input, init), env: process.env, now: () => Date.now() }
}

export const MAX_ATTEMPTS = 8
export const DISCORD_GRANTS = "discord_access_grants"
export const TELEGRAM_GRANTS = "telegram_access_grants"
const LEASE_MS = 2 * 60_000
const MAX_BACKOFF_MS = 6 * 3_600_000

export const GRANT_COLUMNS_DISCORD = "id, mapping_id, creator_id, product_id, user_id, guild_id, role_id, discord_user_id, want, status, attempts, next_attempt_at, last_error, last_error_code, granted_at, revoked_at, checked_at, updated_at"
export const GRANT_COLUMNS_TELEGRAM = "id, mapping_id, creator_id, product_id, user_id, chat_id, telegram_user_id, telegram_username, invite_link_sealed, invite_link_hash, invite_expires_at, want, status, attempts, next_attempt_at, last_error, last_error_code, granted_at, revoked_at, checked_at, updated_at"

export interface DiscordGrant {
  id: string
  mapping_id: string | null
  creator_id: string
  product_id: string | null
  user_id: string
  guild_id: string
  role_id: string
  discord_user_id: string | null
  want: "in" | "out"
  status: "needs_link" | "pending" | "granted" | "revoked" | "failed" | "blocked"
  attempts: number
  next_attempt_at: string | null
  last_error: string | null
  last_error_code: string | null
  granted_at: string | null
  revoked_at: string | null
  checked_at: string | null
  updated_at: string
}

export interface TelegramGrant {
  id: string
  mapping_id: string | null
  creator_id: string
  product_id: string | null
  user_id: string
  chat_id: number
  telegram_user_id: number | null
  telegram_username: string | null
  invite_link_sealed: string | null
  invite_link_hash: string | null
  invite_expires_at: string | null
  want: "in" | "out"
  status: "needs_link" | "invited" | "pending" | "granted" | "revoked" | "failed" | "blocked"
  attempts: number
  next_attempt_at: string | null
  last_error: string | null
  last_error_code: string | null
  granted_at: string | null
  revoked_at: string | null
  checked_at: string | null
  updated_at: string
}

export const tableMissing = (e: { code?: string; message?: string } | null | undefined) => !!e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache|could not find the table/i.test(e.message ?? ""))

const iso = (ms: number) => new Date(ms).toISOString()

/** 1, 2, 4, 8... minutes, up to six hours; a wait Discord or Telegram asked for wins when it is longer. */
export function backoffMs(attempts: number, retryAfterSeconds: number | null = null): number {
  const base = Math.min(MAX_BACKOFF_MS, 60_000 * 2 ** Math.max(0, attempts - 1))
  return Math.max(base, retryAfterSeconds ? Math.ceil(retryAfterSeconds * 1000) + 500 : 0)
}

async function log(db: Db, provider: "discord" | "telegram", entry: { grantId: string | null; creatorId: string; userId: string | null; action: string; detail?: string | null }): Promise<void> {
  try {
    await db.from(`${provider}_access_log`).insert({ grant_id: entry.grantId, creator_id: entry.creatorId, user_id: entry.userId, action: entry.action, detail: entry.detail ? entry.detail.slice(0, 500) : null })
  } catch {
    /* the log never stops the work */
  }
}

/* ── Running work after the response ────────────────────────────────────── */

/** Runs `work` after the response when there is a request, in line when there is none. Never throws. */
export function later(work: () => Promise<unknown>): Promise<void> {
  const guarded = () =>
    work().then(
      () => undefined,
      (e) => console.error("[community-roles] background work failed:", e instanceof Error ? e.message : e),
    )
  try {
    after(guarded)
    return Promise.resolve()
  } catch {
    return guarded()
  }
}

/* ══ Access changed: what each mapping should be ══════════════════════════ */

interface DiscordMapping {
  id: string
  creator_id: string
  product_id: string
  guild_id: string
  role_id: string
  role_name: string | null
}
interface TelegramMapping {
  id: string
  creator_id: string
  product_id: string
  chat_ref: string
  telegram_chats?: { chat_id: number; status: string } | { chat_id: number; status: string }[] | null
}

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null))

/**
 * Settles every Discord role and Telegram chat mapped to these products for
 * this person, from what they own now. Grants to give are made (Discord: run
 * now when the buyer has linked their Discord; Telegram: waiting for the
 * buyer's Join, which makes their one use invite), grants to take back are
 * queued. Returns the ids of rows queued, so the caller can run them.
 */
export async function settleAccess(deps: Deps, who: { userId: string; email?: string | null }, productIds: string[]): Promise<{ discord: string[]; telegram: string[] }> {
  const out = { discord: [] as string[], telegram: [] as string[] }
  const ids = [...new Set(productIds.filter((p) => typeof p === "string" && p))]
  if (!ids.length) return out
  const { db } = deps
  const discordOn = !!discordConfig(deps.env)
  const telegramOn = !!telegramConfig(deps.env)
  if (!discordOn && !telegramOn) return out

  const [dm, tm] = await Promise.all([
    discordOn ? db.from("discord_role_mappings").select("id, creator_id, product_id, guild_id, role_id, role_name").in("product_id", ids) : { data: [], error: null },
    telegramOn ? db.from("telegram_chat_mappings").select("id, creator_id, product_id, chat_ref, telegram_chats(chat_id, status)").in("product_id", ids) : { data: [], error: null },
  ])
  const discordMaps = (dm.error ? [] : ((dm.data as DiscordMapping[] | null) ?? [])) as DiscordMapping[]
  const telegramMaps = (tm.error ? [] : ((tm.data as TelegramMapping[] | null) ?? [])) as TelegramMapping[]
  if (!discordMaps.length && !telegramMaps.length) return out

  const access = new Map<string, boolean>()
  for (const p of new Set([...discordMaps.map((m) => m.product_id), ...telegramMaps.map((m) => m.product_id)])) access.set(p, await hasAccess(db, who, p, deps.now()))

  let link: { discord_user_id: string } | null = null
  if (discordMaps.length) {
    const { data } = await db.from("discord_member_links").select("discord_user_id").eq("user_id", who.userId).maybeSingle()
    link = (data as { discord_user_id: string } | null) ?? null
  }
  for (const m of discordMaps) {
    const id = await settleDiscord(deps, m, who.userId, access.get(m.product_id) === true, link?.discord_user_id ?? null)
    if (id) out.discord.push(id)
  }
  for (const m of telegramMaps) {
    const chat = one(m.telegram_chats)
    if (!chat) continue
    const id = await settleTelegram(deps, m, Number(chat.chat_id), who.userId, access.get(m.product_id) === true)
    if (id) out.telegram.push(id)
  }
  return out
}

async function settleDiscord(deps: Deps, m: DiscordMapping, userId: string, has: boolean, discordUserId: string | null): Promise<string | null> {
  const { db } = deps
  const now = iso(deps.now())
  const { data: existing } = await db.from(DISCORD_GRANTS).select(GRANT_COLUMNS_DISCORD).eq("mapping_id", m.id).eq("user_id", userId).maybeSingle()
  const g = existing as DiscordGrant | null
  if (has) {
    const status = discordUserId ? "pending" : "needs_link"
    if (!g) {
      const { data, error } = await db
        .from(DISCORD_GRANTS)
        .insert({ mapping_id: m.id, creator_id: m.creator_id, product_id: m.product_id, user_id: userId, guild_id: m.guild_id, role_id: m.role_id, discord_user_id: discordUserId, want: "in", status, attempts: 0, next_attempt_at: discordUserId ? now : null, checked_at: now })
        .select("id")
        .maybeSingle()
      if (error && error.code !== "23505") throw new Error(`grant insert: ${error.code ?? ""} ${error.message ?? ""}`)
      if (data?.id) await log(db, "discord", { grantId: data.id, creatorId: m.creator_id, userId, action: "queued", detail: discordUserId ? "Access started" : "Access started; waiting for the buyer to join" })
      return discordUserId && data?.id ? data.id : null
    }
    /* In and settled already: nothing to do. A blocked or failed one waits for Try again; a link that arrived since moves it on. */
    if (g.want === "in" && (g.status === "granted" || g.status === "pending")) return null
    if (g.want === "in" && g.status === "needs_link" && !discordUserId) return null
    if (g.want === "in" && (g.status === "blocked" || g.status === "failed") && g.discord_user_id) return null
    await db
      .from(DISCORD_GRANTS)
      .update({ want: "in", status, discord_user_id: discordUserId ?? g.discord_user_id, attempts: 0, next_attempt_at: discordUserId ? now : null, last_error: null, last_error_code: null, checked_at: now, updated_at: now })
      .eq("id", g.id)
    await log(db, "discord", { grantId: g.id, creatorId: g.creator_id, userId, action: "queued", detail: "Access started again" })
    return discordUserId ? g.id : null
  }
  if (!g || g.want === "out") return null
  await db.from(DISCORD_GRANTS).update({ want: "out", status: "pending", attempts: 0, next_attempt_at: now, last_error: null, last_error_code: null, checked_at: now, updated_at: now }).eq("id", g.id)
  await log(db, "discord", { grantId: g.id, creatorId: g.creator_id, userId, action: "queued", detail: "Access ended" })
  return g.id
}

async function settleTelegram(deps: Deps, m: TelegramMapping, chatId: number, userId: string, has: boolean): Promise<string | null> {
  const { db } = deps
  const now = iso(deps.now())
  const { data: existing } = await db.from(TELEGRAM_GRANTS).select(GRANT_COLUMNS_TELEGRAM).eq("mapping_id", m.id).eq("user_id", userId).maybeSingle()
  const g = existing as TelegramGrant | null
  if (has) {
    if (!g) {
      const { data, error } = await db
        .from(TELEGRAM_GRANTS)
        .insert({ mapping_id: m.id, creator_id: m.creator_id, product_id: m.product_id, user_id: userId, chat_id: chatId, want: "in", status: "needs_link", attempts: 0, checked_at: now })
        .select("id")
        .maybeSingle()
      if (error && error.code !== "23505") throw new Error(`grant insert: ${error.code ?? ""} ${error.message ?? ""}`)
      if (data?.id) await log(db, "telegram", { grantId: data.id, creatorId: m.creator_id, userId, action: "queued", detail: "Access started; waiting for the buyer to join" })
      return null
    }
    if (g.want === "in") return null
    /* Removed before: they come back by a new invite, which their Join makes. */
    await db.from(TELEGRAM_GRANTS).update({ want: "in", status: "needs_link", attempts: 0, next_attempt_at: null, last_error: null, last_error_code: null, checked_at: now, updated_at: now }).eq("id", g.id)
    await log(db, "telegram", { grantId: g.id, creatorId: g.creator_id, userId, action: "queued", detail: "Access started again" })
    return null
  }
  if (!g || g.want === "out") return null
  await db.from(TELEGRAM_GRANTS).update({ want: "out", status: "pending", attempts: 0, next_attempt_at: now, last_error: null, last_error_code: null, checked_at: now, updated_at: now }).eq("id", g.id)
  await log(db, "telegram", { grantId: g.id, creatorId: g.creator_id, userId, action: "queued", detail: "Access ended" })
  return g.id
}

/* ══ Claiming one row ═════════════════════════════════════════════════════ */

/** Takes a row for one try: attempts moves on and next_attempt_at moves past the lease, only where attempts is still what was read. */
async function claim(db: Db, table: string, row: { id: string; attempts: number }, now: number): Promise<boolean> {
  const { data, error } = await db
    .from(table)
    .update({ attempts: row.attempts + 1, next_attempt_at: iso(now + LEASE_MS), updated_at: iso(now) })
    .eq("id", row.id)
    .eq("attempts", row.attempts)
    .eq("status", "pending")
    .select("id")
  return !error && Array.isArray(data) && data.length === 1
}

type Outcome = { status: string; error?: string | null; code?: string | null; retryAfter?: number | null; patch?: Record<string, unknown> }

async function finish(deps: Deps, provider: "discord" | "telegram", g: { id: string; creator_id: string; user_id: string; attempts: number; want: string }, o: Outcome): Promise<string> {
  const { db } = deps
  const now = deps.now()
  const tries = g.attempts + 1
  let status = o.status
  let next: string | null = null
  if (status === "pending") {
    if (tries >= MAX_ATTEMPTS) status = "failed"
    else next = iso(now + backoffMs(tries, o.retryAfter ?? null))
  }
  const patch: Record<string, unknown> = { status, next_attempt_at: next, last_error: o.error ? o.error.slice(0, 500) : null, last_error_code: o.code ?? null, updated_at: iso(now), ...(o.patch ?? {}) }
  if (status === "granted") patch.granted_at = iso(now)
  if (status === "revoked") patch.revoked_at = iso(now)
  await db.from(provider === "discord" ? DISCORD_GRANTS : TELEGRAM_GRANTS).update(patch).eq("id", g.id)
  const action = status === "granted" ? "granted" : status === "revoked" ? "revoked" : status === "blocked" ? "blocked" : status === "failed" || status === "pending" ? "failed" : "queued"
  await log(db, provider, { grantId: g.id, creatorId: g.creator_id, userId: g.user_id, action, detail: o.error ?? (status === "needs_link" ? "Waiting for the buyer to join" : null) })
  return status
}

/* ══ Discord ══════════════════════════════════════════════════════════════ */

interface MemberLink {
  user_id: string
  discord_user_id: string
  access_token_sealed: string | null
  refresh_token_sealed: string | null
  access_expires_at: string | null
}

/** The buyer's access token, refreshed when it has run out. Null when there is none to be had (they join again). */
export async function buyerAccessToken(deps: Deps, link: MemberLink): Promise<string | null> {
  const config = discordConfig(deps.env)
  if (!config) return null
  const expires = link.access_expires_at ? Date.parse(link.access_expires_at) : 0
  const current = openSecret(link.access_token_sealed)
  if (current && expires - 60_000 > deps.now()) return current
  const refresh = openSecret(link.refresh_token_sealed)
  if (!refresh) return null
  try {
    const t = await refreshTokens(deps.fetch, config, refresh, deps.now())
    await deps.db
      .from("discord_member_links")
      .update({ access_token_sealed: sealSecret(t.accessToken), refresh_token_sealed: t.refreshToken ? sealSecret(t.refreshToken) : link.refresh_token_sealed, access_expires_at: iso(t.expiresAt), updated_at: iso(deps.now()) })
      .eq("user_id", link.user_id)
    return t.accessToken
  } catch (e) {
    if (e instanceof DiscordError && e.retryable) throw e
    return null
  }
}

function discordFailure(e: unknown, roleName: string | null): Outcome {
  if (!(e instanceof DiscordError)) return { status: "pending", error: "Something went wrong talking to Discord. Storelib tries again.", code: "unknown" }
  switch (e.kind) {
    case "hierarchy":
      return { status: "blocked", error: roleProblemText("hierarchy", roleName), code: "role_hierarchy" }
    case "missing_access":
      return { status: "blocked", error: "Storelib's bot cannot reach your Discord server. Connect the server again from Settings › Integrations › Discord.", code: "missing_access" }
    case "unknown_role":
      return { status: "blocked", error: roleProblemText("missing", roleName), code: "unknown_role" }
    case "unknown_guild":
      return { status: "blocked", error: "Storelib's bot is no longer in your Discord server. Connect it again.", code: "unknown_guild" }
    case "banned":
      return { status: "blocked", error: "This buyer is banned from your Discord server. Unban them in Discord, then press Try again.", code: "banned" }
    case "bad_bot_token":
      return { status: "pending", error: "Storelib's Discord bot could not sign in. Storelib tries again.", code: "bot_token" }
    default:
      return { status: "pending", error: e.retryable ? "Discord did not answer. Storelib tries again." : `Discord said: ${e.message}`, code: e.kind, retryAfter: e.retryAfter }
  }
}

/** Errors that are the server's, not this buyer's: written on the connection so the setup screen shows them at the top. */
async function noteConnection(deps: Deps, creatorId: string, o: Outcome): Promise<void> {
  if (!o.code || !["role_hierarchy", "missing_access", "unknown_guild"].includes(o.code)) return
  try {
    await deps.db.from("discord_connections").update({ last_error: o.error?.slice(0, 500) ?? null, last_error_at: iso(deps.now()), ...(o.code === "unknown_guild" ? { status: "needs_reconnect" } : {}) }).eq("creator_id", creatorId)
  } catch {
    /* shown on the grant anyway */
  }
}

export async function runDiscordGrant(deps: Deps, g: DiscordGrant): Promise<string> {
  const config = discordConfig(deps.env)
  if (!config) return g.status
  const { db } = deps
  const { data: mapping } = g.mapping_id ? await db.from("discord_role_mappings").select("role_name").eq("id", g.mapping_id).maybeSingle() : { data: null }
  const roleName = (mapping as { role_name?: string | null } | null)?.role_name ?? null
  const { data: conn } = await db.from("discord_connections").select("guild_id, status").eq("creator_id", g.creator_id).maybeSingle()

  if (g.want === "in") {
    if (!conn || conn.guild_id !== g.guild_id) return finish(deps, "discord", g, { status: "blocked", error: "This Discord server is no longer connected to your store.", code: "disconnected" })
    const { data: linkRow } = await db.from("discord_member_links").select("user_id, discord_user_id, access_token_sealed, refresh_token_sealed, access_expires_at").eq("user_id", g.user_id).maybeSingle()
    const link = linkRow as MemberLink | null
    if (!link) return finish(deps, "discord", g, { status: "needs_link" })
    const discordUserId = link.discord_user_id
    try {
      const token = await buyerAccessToken(deps, link)
      let done = false
      if (token) {
        const r = await addMember(deps.fetch, config, g.guild_id, discordUserId, token, [g.role_id])
        done = r === "added"
      }
      if (!done) {
        try {
          await addRole(deps.fetch, config, g.guild_id, discordUserId, g.role_id)
        } catch (e) {
          /* Not in the server and no token to add them with: they press Join the Discord again. */
          if (e instanceof DiscordError && e.kind === "unknown_member") return finish(deps, "discord", g, { status: "needs_link", error: "Not in the server. The buyer can join again from their library.", code: "not_in_server", patch: { discord_user_id: discordUserId } })
          throw e
        }
      }
      return finish(deps, "discord", g, { status: "granted", patch: { discord_user_id: discordUserId } })
    } catch (e) {
      /* A refused buyer token: their link is spent, they join again. */
      if (e instanceof DiscordError && e.kind === "bad_user_token") return finish(deps, "discord", g, { status: "needs_link", error: "The buyer's Discord sign in ran out. They can join again from their library.", code: "relink" })
      const o = discordFailure(e, roleName)
      await noteConnection(deps, g.creator_id, o)
      return finish(deps, "discord", g, { ...o, patch: { discord_user_id: discordUserId } })
    }
  }

  /* Out. Never joined: nothing to take back. */
  if (!g.discord_user_id) return finish(deps, "discord", g, { status: "revoked" })
  /* Another purchase still gives the same role in the same server: the role stays. */
  const { data: others } = await db.from(DISCORD_GRANTS).select("id").eq("guild_id", g.guild_id).eq("role_id", g.role_id).eq("discord_user_id", g.discord_user_id).eq("want", "in").neq("id", g.id).limit(1)
  if (Array.isArray(others) && others.length > 0) return finish(deps, "discord", g, { status: "revoked", error: null, code: "kept_by_other" })
  try {
    await removeRole(deps.fetch, config, g.guild_id, g.discord_user_id, g.role_id)
    return finish(deps, "discord", g, { status: "revoked" })
  } catch (e) {
    /* Left the server, or the role is gone: there is nothing to take back. */
    if (e instanceof DiscordError && (e.kind === "unknown_member" || e.kind === "unknown_role" || e.kind === "unknown_guild")) return finish(deps, "discord", g, { status: "revoked" })
    const o = discordFailure(e, roleName)
    await noteConnection(deps, g.creator_id, o)
    return finish(deps, "discord", g, o)
  }
}

/* ══ Telegram ═════════════════════════════════════════════════════════════ */

function telegramFailure(e: unknown, chatTitle: string | null): Outcome {
  const where = chatTitle ? `"${chatTitle}"` : "your Telegram chat"
  if (!(e instanceof TelegramError)) return { status: "pending", error: "Something went wrong talking to Telegram. Storelib tries again.", code: "unknown" }
  switch (e.kind) {
    case "not_admin":
      return { status: "blocked", error: `Storelib's bot needs to be an admin of ${where} with Invite users and Ban users. Change its rights in Telegram, then press Try again.`, code: "not_admin" }
    case "chat_gone":
      return { status: "blocked", error: `Storelib's bot is no longer in ${where}. Add it back as an admin and link the chat again.`, code: "chat_gone" }
    case "bad_token":
      return { status: "pending", error: "Storelib's Telegram bot could not sign in. Storelib tries again.", code: "bot_token" }
    default:
      return { status: "pending", error: e.retryable ? "Telegram did not answer. Storelib tries again." : `Telegram said: ${e.message}`, code: e.kind, retryAfter: e.retryAfter }
  }
}

async function chatTitle(db: Db, chatId: number): Promise<string | null> {
  try {
    const { data } = await db.from("telegram_chats").select("title").eq("chat_id", chatId).maybeSingle()
    return (data as { title?: string | null } | null)?.title ?? null
  } catch {
    return null
  }
}

export async function runTelegramGrant(deps: Deps, g: TelegramGrant): Promise<string> {
  const config = telegramConfig(deps.env)
  if (!config) return g.status
  const { db } = deps
  /* In is never pushed: the buyer's Join makes their invite (inviteFor). A pending "in" waits for it. */
  if (g.want === "in") return finish(deps, "telegram", g, { status: g.telegram_user_id ? "granted" : "needs_link" })
  const title = await chatTitle(db, g.chat_id)
  try {
    /* An invite they never used is closed first, so it cannot be used after access ended. */
    const link = openSecret(g.invite_link_sealed)
    if (link && !g.telegram_user_id) {
      try {
        await revokeInvite(deps.fetch, config, g.chat_id, link)
      } catch (e) {
        if (e instanceof TelegramError && e.retryable) throw e
      }
    }
    if (g.telegram_user_id) {
      const { data: others } = await db.from(TELEGRAM_GRANTS).select("id").eq("chat_id", g.chat_id).eq("telegram_user_id", g.telegram_user_id).eq("want", "in").neq("id", g.id).limit(1)
      if (!(Array.isArray(others) && others.length > 0)) {
        try {
          await removeMember(deps.fetch, config, g.chat_id, Number(g.telegram_user_id))
        } catch (e) {
          if (!(e instanceof TelegramError && e.kind === "user_missing")) throw e
        }
      }
    }
    return finish(deps, "telegram", g, { status: "revoked", patch: { invite_link_sealed: null, invite_link_hash: null, invite_expires_at: null } })
  } catch (e) {
    return finish(deps, "telegram", g, telegramFailure(e, title))
  }
}

/** The buyer's one use invite: a live one they were already given, or a new one. */
export async function inviteFor(deps: Deps, g: TelegramGrant): Promise<{ ok: true; link: string } | { ok: false; error: string }> {
  const config = telegramConfig(deps.env)
  if (!config) return { ok: false, error: "Telegram is not available yet." }
  if (g.want !== "in") return { ok: false, error: "Your access to this chat has ended." }
  const now = deps.now()
  const live = openSecret(g.invite_link_sealed)
  if (live && g.status === "invited" && g.invite_expires_at && Date.parse(g.invite_expires_at) - 5 * 60_000 > now) return { ok: true, link: live }
  try {
    const invite = await createOneUseInvite(deps.fetch, config, g.chat_id, "Storelib member", now)
    await deps.db
      .from(TELEGRAM_GRANTS)
      .update({ status: g.status === "granted" ? "granted" : "invited", invite_link_sealed: sealSecret(invite.link), invite_link_hash: hashOf(invite.link), invite_expires_at: iso(invite.expiresAt), last_error: null, last_error_code: null, updated_at: iso(now) })
      .eq("id", g.id)
    await log(deps.db, "telegram", { grantId: g.id, creatorId: g.creator_id, userId: g.user_id, action: "invited", detail: "One use invite made, for a day" })
    return { ok: true, link: invite.link }
  } catch (e) {
    const o = telegramFailure(e, await chatTitle(deps.db, g.chat_id))
    await deps.db.from(TELEGRAM_GRANTS).update({ last_error: o.error, last_error_code: o.code, updated_at: iso(now), ...(o.status === "blocked" ? { status: "blocked" } : {}) }).eq("id", g.id)
    await log(deps.db, "telegram", { grantId: g.id, creatorId: g.creator_id, userId: g.user_id, action: "failed", detail: o.error })
    return { ok: false, error: o.status === "blocked" ? "This chat cannot take new members right now. The seller has been told." : "Telegram did not answer. Try again in a moment." }
  }
}

/* ══ The worker ═══════════════════════════════════════════════════════════ */

export interface RunSummary {
  available: boolean
  ran: number
  granted: number
  revoked: number
  failed: number
}

/** Runs due rows (or the given ids), each claimed first. */
export async function runDue(deps: Deps, opts: { limit?: number; ids?: { discord?: string[]; telegram?: string[] } } = {}): Promise<RunSummary> {
  const summary: RunSummary = { available: true, ran: 0, granted: 0, revoked: 0, failed: 0 }
  const limit = opts.limit ?? 25
  const now = deps.now()
  const tally = (s: string) => {
    summary.ran++
    if (s === "granted") summary.granted++
    else if (s === "revoked") summary.revoked++
    else if (s === "failed" || s === "blocked" || s === "pending") summary.failed++
  }
  for (const provider of ["discord", "telegram"] as const) {
    const on = provider === "discord" ? !!discordConfig(deps.env) : !!telegramConfig(deps.env)
    if (!on) continue
    const table = provider === "discord" ? DISCORD_GRANTS : TELEGRAM_GRANTS
    const cols = provider === "discord" ? GRANT_COLUMNS_DISCORD : GRANT_COLUMNS_TELEGRAM
    const wanted = opts.ids?.[provider]
    let q = deps.db.from(table).select(cols).eq("status", "pending")
    q = wanted ? q.in("id", wanted.length ? wanted : ["00000000-0000-0000-0000-000000000000"]) : q.lte("next_attempt_at", iso(now)).order("next_attempt_at", { ascending: true }).limit(limit)
    const { data, error } = await q
    if (error) {
      if (tableMissing(error)) continue
      throw new Error(`${table} read: ${error.code ?? ""} ${error.message ?? ""}`)
    }
    for (const row of (data as Array<DiscordGrant | TelegramGrant> | null) ?? []) {
      if (!(await claim(deps.db, table, row, deps.now()))) continue
      try {
        tally(provider === "discord" ? await runDiscordGrant(deps, row as DiscordGrant) : await runTelegramGrant(deps, row as TelegramGrant))
      } catch (e) {
        console.error(`[community-roles] ${provider} grant ${row.id} not run:`, e instanceof Error ? e.message : e)
        summary.failed++
      }
    }
  }
  return summary
}

/**
 * The cron's safety net: grants that are in, oldest checked first, asked
 * again. A buyer who no longer has access is queued out; the rest are
 * stamped checked. A read that fails leaves the row for the next run.
 */
export async function recheckAccess(deps: Deps, opts: { limit?: number } = {}): Promise<number> {
  let queued = 0
  const limit = opts.limit ?? 200
  const now = deps.now()
  for (const provider of ["discord", "telegram"] as const) {
    const on = provider === "discord" ? !!discordConfig(deps.env) : !!telegramConfig(deps.env)
    if (!on) continue
    const table = provider === "discord" ? DISCORD_GRANTS : TELEGRAM_GRANTS
    const { data, error } = await deps.db.from(table).select("id, user_id, product_id, creator_id").eq("want", "in").order("checked_at", { ascending: true, nullsFirst: true }).limit(limit)
    if (error) continue
    const seen = new Map<string, boolean>()
    for (const row of (data as Array<{ id: string; user_id: string; product_id: string | null; creator_id: string }> | null) ?? []) {
      if (!row.product_id) continue
      const key = `${row.user_id}:${row.product_id}`
      try {
        if (!seen.has(key)) seen.set(key, await hasAccess(deps.db, { userId: row.user_id }, row.product_id, now))
      } catch {
        continue
      }
      if (seen.get(key)) {
        await deps.db.from(table).update({ checked_at: iso(now) }).eq("id", row.id)
      } else {
        await deps.db.from(table).update({ want: "out", status: "pending", attempts: 0, next_attempt_at: iso(now), checked_at: iso(now), updated_at: iso(now) }).eq("id", row.id).eq("want", "in")
        await log(deps.db, provider, { grantId: row.id, creatorId: row.creator_id, userId: row.user_id, action: "queued", detail: "Access ended" })
        queued++
      }
    }
  }
  return queued
}

/** What /api/cron/memberships runs: the safety net, then whatever is due. */
export async function runCommunityRoleCron(deps: Deps): Promise<RunSummary & { rechecked: number }> {
  if (!discordConfig(deps.env) && !telegramConfig(deps.env)) return { available: false, ran: 0, granted: 0, revoked: 0, failed: 0, rechecked: 0 }
  const rechecked = await recheckAccess(deps)
  const run = await runDue(deps, { limit: 100 })
  return { ...run, rechecked }
}
