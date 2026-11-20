import "server-only"

/**
 * ===========================================================================
 *  DISCORD AND TELEGRAM: THE CREATOR'S SETUP AND THE BUYER'S JOIN
 * ===========================================================================
 * Every function takes the store (creators.id) or the buyer (auth user) from
 * the signed in session, never from a request body, and checks that each
 * product, role and chat it is given is that store's own.
 *
 *   creator   connect a Discord server (the bot's install answer), map a
 *             product to a role, link a Telegram chat with a one time code,
 *             map a product to a chat, see each member's access, Try again
 *   buyer     the Join buttons (which products they own have a server or a
 *             chat), Discord's join answer (their account linked, added to
 *             the server with the role), a Telegram one use invite
 *   telegram  the webhook's updates: /link, joins, the bot's own rights
 */
import { randomBytes } from "node:crypto"
import { sealSecret } from "@/lib/physical/secrets"
import { discordConfig, telegramConfig } from "./config"
import { DiscordError, botUser, currentUser, getGuild, guildRoles, memberRoles, roleProblem, roleProblemText, type DiscordTokens, type DiscordRole } from "./discord-api"
import { TelegramError, botRights, getMe, hashOf, linkCommandOf, makeLinkCode, memberChangeOf, normaliseCode, removeMember, sendMessage, deleteMessage, showCode } from "./telegram-api"
import { hasAccess } from "./access"
import { GRANT_COLUMNS_DISCORD, GRANT_COLUMNS_TELEGRAM, DISCORD_GRANTS, TELEGRAM_GRANTS, inviteFor, runDue, settleAccess, tableMissing, type Deps, type DiscordGrant, type TelegramGrant } from "./engine"
import type { DiscordSetupView, JoinOption, MemberAccessRow, PickProduct, TelegramSetupView, CommunityRolesStatus } from "./view-types"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SNOWFLAKE = /^[0-9]{5,25}$/
const iso = (ms: number) => new Date(ms).toISOString()
export const LINK_CODE_TTL_MS = 30 * 60_000

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; status: number }
const fail = (error: string, status = 400) => ({ ok: false as const, error, status })
const NEEDS_SQL_DISCORD = "Discord needs the database update first (SQL part 473 in Admin › SQL updates)."
const NEEDS_SQL_TELEGRAM = "Telegram needs the database update first (SQL part 474 in Admin › SQL updates)."

/* ── Shared reads ────────────────────────────────────────────────────────── */

async function storeProducts(deps: Deps, creatorId: string): Promise<PickProduct[]> {
  const { data } = await deps.db.from("products").select("id, title, type, status").eq("creator_id", creatorId).neq("status", "archived").order("created_at", { ascending: false }).limit(500)
  return ((data as Array<{ id: string; title: string | null; type: string | null }> | null) ?? []).filter((p) => p.type !== "physical").map((p) => ({ id: p.id, title: p.title || "Untitled", type: p.type }))
}

async function ownProduct(deps: Deps, creatorId: string, productId: unknown): Promise<{ id: string; title: string } | null> {
  if (typeof productId !== "string" || !UUID.test(productId)) return null
  const { data } = await deps.db.from("products").select("id, title").eq("id", productId).eq("creator_id", creatorId).maybeSingle()
  return (data as { id: string; title: string } | null) ?? null
}

async function memberRows(deps: Deps, provider: "discord" | "telegram", creatorId: string, targetName: (g: DiscordGrant | TelegramGrant) => string): Promise<MemberAccessRow[]> {
  const table = provider === "discord" ? DISCORD_GRANTS : TELEGRAM_GRANTS
  const { data } = await deps.db.from(table).select(provider === "discord" ? GRANT_COLUMNS_DISCORD : GRANT_COLUMNS_TELEGRAM).eq("creator_id", creatorId).order("updated_at", { ascending: false }).limit(200)
  const rows = ((data as Array<DiscordGrant | TelegramGrant> | null) ?? []) as Array<DiscordGrant | TelegramGrant>
  if (!rows.length) return []
  const userIds = [...new Set(rows.map((r) => r.user_id))]
  const productIds = [...new Set(rows.map((r) => r.product_id).filter((x): x is string => !!x))]
  const [{ data: people }, { data: products }, links] = await Promise.all([
    deps.db.from("profiles").select("id, email, display_name, username").in("id", userIds),
    productIds.length ? deps.db.from("products").select("id, title").in("id", productIds) : { data: [] },
    provider === "discord" ? deps.db.from("discord_member_links").select("user_id, discord_username").in("user_id", userIds) : { data: [] },
  ])
  const who = new Map(((people as Array<{ id: string; email: string | null; display_name: string | null; username: string | null }> | null) ?? []).map((p) => [p.id, p.display_name || p.email || p.username || "A buyer"]))
  const titles = new Map(((products as Array<{ id: string; title: string }> | null) ?? []).map((p) => [p.id, p.title]))
  const handles = new Map(((links.data as Array<{ user_id: string; discord_username: string | null }> | null) ?? []).map((l) => [l.user_id, l.discord_username]))
  return rows.map((r) => ({
    grantId: r.id,
    buyer: who.get(r.user_id) ?? "A buyer",
    productTitle: (r.product_id && titles.get(r.product_id)) || "A deleted product",
    target: targetName(r),
    handle: provider === "discord" ? (handles.get(r.user_id) ?? null) : (r as TelegramGrant).telegram_username ? `@${(r as TelegramGrant).telegram_username}` : null,
    want: r.want,
    status: r.status,
    lastError: r.last_error,
    updatedAt: r.updated_at,
  }))
}

/* ── The directory's two cards ───────────────────────────────────────────── */

export async function communityRolesStatus(deps: Deps, creatorId: string): Promise<CommunityRolesStatus> {
  const out: CommunityRolesStatus = { discord: { available: !!discordConfig(deps.env), connected: false, attention: false }, telegram: { available: !!telegramConfig(deps.env), connected: false, attention: false } }
  if (out.discord.available) {
    const { data } = await deps.db.from("discord_connections").select("status, last_error").eq("creator_id", creatorId).maybeSingle()
    if (data) out.discord = { available: true, connected: true, attention: data.status !== "connected" || !!data.last_error }
  }
  if (out.telegram.available) {
    const { data } = await deps.db.from("telegram_chats").select("status").eq("creator_id", creatorId).limit(20)
    const chats = (data as Array<{ status: string }> | null) ?? []
    if (chats.length) out.telegram = { available: true, connected: true, attention: chats.some((c) => c.status !== "linked") }
  }
  return out
}

/* ══ Discord: the creator ═════════════════════════════════════════════════ */

/** The bot's view of the server's roles, with why each one cannot be given. Null when Discord did not answer. */
async function rolesWithProblems(deps: Deps, guildId: string): Promise<DiscordRoleView[] | null> {
  const config = discordConfig(deps.env)
  if (!config) return null
  try {
    const [roles, me] = await Promise.all([guildRoles(deps.fetch, config, guildId), botUser(deps.fetch, config)])
    const mine = (await memberRoles(deps.fetch, config, guildId, me.id)) ?? []
    return roles
      .filter((r) => r.id !== guildId && !r.managed)
      .sort((a, b) => b.position - a.position)
      .map((r) => {
        const p = roleProblem(roles, mine, r.id, guildId)
        return { id: r.id, name: r.name, position: r.position, problem: p ? roleProblemText(p, r.name) : null }
      })
  } catch {
    return null
  }
}
type DiscordRoleView = { id: string; name: string; position: number; problem: string | null }

export async function loadDiscordSetup(deps: Deps, creatorId: string): Promise<DiscordSetupView> {
  const empty: DiscordSetupView = { available: !!discordConfig(deps.env), ready: true, connection: null, roles: null, mappings: [], products: [], members: [] }
  if (!empty.available) return empty
  const { data: conn, error } = await deps.db.from("discord_connections").select("guild_id, guild_name, status, last_error").eq("creator_id", creatorId).maybeSingle()
  if (error) return { ...empty, ready: !tableMissing(error) }
  const products = await storeProducts(deps, creatorId)
  if (!conn) return { ...empty, products }
  const [roles, { data: maps }, members] = await Promise.all([
    rolesWithProblems(deps, conn.guild_id),
    deps.db.from("discord_role_mappings").select("id, product_id, role_id, role_name").eq("creator_id", creatorId).eq("guild_id", conn.guild_id).order("created_at", { ascending: true }),
    memberRows(deps, "discord", creatorId, (g) => g.id),
  ])
  const titles = new Map(products.map((p) => [p.id, p.title]))
  const mappings = ((maps as Array<{ id: string; product_id: string; role_id: string; role_name: string | null }> | null) ?? []).map((m) => {
    const live = roles?.find((r) => r.id === m.role_id)
    return { id: m.id, productId: m.product_id, productTitle: titles.get(m.product_id) ?? "A product no longer for sale", roleId: m.role_id, roleName: live?.name ?? m.role_name ?? "", problem: roles ? (live ? live.problem : roleProblemText("missing", m.role_name)) : null }
  })
  const roleNames = new Map(mappings.map((m) => [m.roleId, m.roleName]))
  const grantRoles = new Map<string, string>()
  const { data: grantRoleRows } = await deps.db.from(DISCORD_GRANTS).select("id, role_id").eq("creator_id", creatorId).limit(200)
  for (const g of (grantRoleRows as Array<{ id: string; role_id: string }> | null) ?? []) grantRoles.set(g.id, roleNames.get(g.role_id) || roles?.find((r) => r.id === g.role_id)?.name || "A role")
  return {
    available: true,
    ready: true,
    connection: { guildId: conn.guild_id, guildName: conn.guild_name || "Your Discord server", status: conn.status, lastError: conn.last_error },
    roles: roles ? roles.map(({ id, name, problem }) => ({ id, name, problem })) : null,
    mappings,
    products,
    members: members.map((m) => ({ ...m, target: grantRoles.get(m.grantId) ?? "A role" })),
  }
}

/**
 * The bot's install came back. The server is the one Discord names in the
 * code's token answer when there is one (the guild_id in the address is
 * only a hint, Discord says), and it must be one the bot can read now. A
 * server another store connected stays theirs.
 */
export async function connectDiscordServer(deps: Deps, creatorId: string, userId: string, answer: { tokens: DiscordTokens | null; guildIdHint: string | null }): Promise<Result<{ guildName: string }>> {
  const config = discordConfig(deps.env)
  if (!config) return fail("Discord is not available yet.", 404)
  const guildId = answer.tokens?.guild?.id ?? answer.guildIdHint
  if (!guildId || !SNOWFLAKE.test(guildId)) return fail("Discord did not say which server the bot was added to. Try again.")
  let guild
  try {
    guild = await getGuild(deps.fetch, config, guildId)
  } catch {
    return fail("Storelib's bot is not in that server. Add it again and pick the server.")
  }
  const { data: taken, error: readError } = await deps.db.from("discord_connections").select("creator_id").eq("guild_id", guildId).maybeSingle()
  if (readError) return tableMissing(readError) ? fail(NEEDS_SQL_DISCORD, 503) : fail("That could not be saved. Try again.", 500)
  if (taken && taken.creator_id !== creatorId) return fail("That Discord server is connected to another Storelib store.", 409)
  const now = iso(deps.now())
  const { error } = await deps.db.from("discord_connections").upsert({ creator_id: creatorId, guild_id: guildId, guild_name: guild.name.slice(0, 200) || null, guild_icon: guild.icon, installed_by: userId, status: "connected", last_error: null, last_error_at: null, updated_at: now }, { onConflict: "creator_id" })
  if (error) return tableMissing(error) ? fail(NEEDS_SQL_DISCORD, 503) : fail("That could not be saved. Try again.", 500)
  return { ok: true, guildName: guild.name }
}

export async function disconnectDiscord(deps: Deps, creatorId: string): Promise<Result> {
  /* Roles already given stay in Discord; Storelib stops giving and taking them. The mappings go with the server. */
  const { data: conn } = await deps.db.from("discord_connections").select("guild_id").eq("creator_id", creatorId).maybeSingle()
  if (!conn) return { ok: true }
  await deps.db.from("discord_role_mappings").delete().eq("creator_id", creatorId).eq("guild_id", conn.guild_id)
  await deps.db.from("discord_connections").delete().eq("creator_id", creatorId)
  return { ok: true }
}

export async function saveDiscordMapping(deps: Deps, creatorId: string, body: { productId?: unknown; roleId?: unknown }): Promise<Result<{ queued: number }>> {
  const config = discordConfig(deps.env)
  if (!config) return fail("Discord is not available yet.", 404)
  const product = await ownProduct(deps, creatorId, body.productId)
  if (!product) return fail("Choose one of your products.")
  if (typeof body.roleId !== "string" || !SNOWFLAKE.test(body.roleId)) return fail("Choose a role.")
  const { data: conn } = await deps.db.from("discord_connections").select("guild_id").eq("creator_id", creatorId).maybeSingle()
  if (!conn) return fail("Connect your Discord server first.")
  let roles: DiscordRole[]
  let mine: string[]
  try {
    roles = await guildRoles(deps.fetch, config, conn.guild_id)
    const me = await botUser(deps.fetch, config)
    mine = (await memberRoles(deps.fetch, config, conn.guild_id, me.id)) ?? []
  } catch (e) {
    return fail(e instanceof DiscordError && e.kind === "missing_access" ? "Storelib's bot cannot read your server's roles. Connect the server again." : "Discord did not answer. Try again in a moment.", 502)
  }
  const problem = roleProblem(roles, mine, body.roleId, conn.guild_id)
  const role = roles.find((r) => r.id === body.roleId)
  if (problem) return fail(roleProblemText(problem, role?.name ?? null), 409)
  const { data: row, error } = await deps.db
    .from("discord_role_mappings")
    .upsert({ creator_id: creatorId, product_id: product.id, guild_id: conn.guild_id, role_id: body.roleId, role_name: role?.name?.slice(0, 200) ?? null, updated_at: iso(deps.now()) }, { onConflict: "product_id,guild_id,role_id" })
    .select("id")
    .maybeSingle()
  if (error || !row) return error && tableMissing(error) ? fail(NEEDS_SQL_DISCORD, 503) : fail("That could not be saved. Try again.", 500)
  /* Buyers who already linked their Discord and own it get the role now; the rest when they press Join. */
  const queued = await backfill(deps, creatorId, product.id)
  return { ok: true, queued }
}

/** Existing buyers of a product just mapped who have linked an account: settled now. Bounded. */
async function backfill(deps: Deps, creatorId: string, productId: string): Promise<number> {
  const [{ data: ents }, { data: subs }] = await Promise.all([
    deps.db.from("entitlements").select("buyer_id").eq("product_id", productId).limit(500),
    deps.db.from("memberships").select("buyer_id").eq("product_id", productId).not("buyer_id", "is", null).limit(500),
  ])
  const buyers = [...new Set([...((ents as Array<{ buyer_id: string | null }> | null) ?? []), ...((subs as Array<{ buyer_id: string | null }> | null) ?? [])].map((r) => r.buyer_id).filter((x): x is string => !!x))]
  if (!buyers.length) return 0
  const { data: linked } = await deps.db.from("discord_member_links").select("user_id").in("user_id", buyers)
  let queued = 0
  for (const b of ((linked as Array<{ user_id: string }> | null) ?? []).slice(0, 200)) {
    try {
      const r = await settleAccess(deps, { userId: b.user_id }, [productId])
      queued += r.discord.length
    } catch {
      /* the cron's recheck and the buyer's Join both catch up */
    }
  }
  void creatorId
  return queued
}

export async function removeMapping(deps: Deps, creatorId: string, provider: "discord" | "telegram", id: unknown): Promise<Result> {
  if (typeof id !== "string" || !UUID.test(id)) return fail("Not found.", 404)
  /* Roles and members already in stay; Storelib stops managing them for this product. */
  await deps.db.from(provider === "discord" ? "discord_role_mappings" : "telegram_chat_mappings").delete().eq("id", id).eq("creator_id", creatorId)
  return { ok: true }
}

/** Try again: a blocked or failed row back in the queue, run now. */
export async function retryGrant(deps: Deps, creatorId: string, provider: "discord" | "telegram", grantId: unknown): Promise<Result<{ grantStatus: string }>> {
  if (typeof grantId !== "string" || !UUID.test(grantId)) return fail("Not found.", 404)
  const table = provider === "discord" ? DISCORD_GRANTS : TELEGRAM_GRANTS
  const { data: g } = await deps.db.from(table).select("id, want, status, user_id").eq("id", grantId).eq("creator_id", creatorId).maybeSingle()
  if (!g) return fail("Not found.", 404)
  if (provider === "telegram" && g.want === "in") return { ok: true, grantStatus: g.status }
  const now = iso(deps.now())
  await deps.db.from(table).update({ status: "pending", attempts: 0, next_attempt_at: now, last_error: null, last_error_code: null, updated_at: now }).eq("id", grantId).eq("creator_id", creatorId)
  if (provider === "discord") await deps.db.from("discord_connections").update({ last_error: null, last_error_at: null }).eq("creator_id", creatorId)
  await runDue(deps, { ids: { [provider]: [grantId] } })
  const { data: after } = await deps.db.from(table).select("status").eq("id", grantId).maybeSingle()
  return { ok: true, grantStatus: after?.status ?? "pending" }
}

/* ══ Discord: the buyer ═══════════════════════════════════════════════════ */

export async function linkDiscordAccount(deps: Deps, userId: string, tokens: DiscordTokens): Promise<Result<{ discordUserId: string }>> {
  if (!tokens.scope.split(" ").includes("guilds.join")) return fail("Discord did not give Storelib permission to add you to the server. Try again and press Authorize.")
  let me
  try {
    me = await currentUser(deps.fetch, tokens.accessToken)
  } catch {
    return fail("Discord did not answer. Try again in a moment.", 502)
  }
  const now = iso(deps.now())
  const { error } = await deps.db.from("discord_member_links").upsert(
    {
      user_id: userId,
      discord_user_id: me.id,
      discord_username: me.username || null,
      access_token_sealed: sealSecret(tokens.accessToken),
      refresh_token_sealed: tokens.refreshToken ? sealSecret(tokens.refreshToken) : null,
      access_expires_at: iso(tokens.expiresAt),
      scopes: tokens.scope.slice(0, 500),
      updated_at: now,
    },
    { onConflict: "user_id" },
  )
  if (error) return tableMissing(error) ? fail("Discord is not available yet.", 503) : fail("That could not be saved. Try again.", 500)
  /* Rows waiting for this link (needs_link, or a different Discord account before) take this one. */
  await deps.db.from(DISCORD_GRANTS).update({ discord_user_id: me.id, updated_at: now }).eq("user_id", userId).eq("want", "in")
  return { ok: true, discordUserId: me.id }
}

/**
 * Join pressed and Discord's answer in: the buyer's roles for this product
 * given now, in this request (they are waiting for it). Where to send them
 * after: the server, or back with what went wrong.
 */
export async function joinDiscord(deps: Deps, viewer: { userId: string; email: string | null }, productId: string): Promise<Result<{ guildId: string }>> {
  if (!UUID.test(productId)) return fail("Not found.", 404)
  let owns = false
  try {
    owns = await hasAccess(deps.db, viewer, productId, deps.now())
  } catch {
    return fail("Storelib could not check your purchase just now. Try again in a moment.", 503)
  }
  if (!owns) return fail("This account does not have access to it.", 403)
  const { data: maps } = await deps.db.from("discord_role_mappings").select("id, guild_id").eq("product_id", productId)
  const mappings = (maps as Array<{ id: string; guild_id: string }> | null) ?? []
  if (!mappings.length) return fail("This product does not come with a Discord server.", 404)
  const queued = await settleAccess(deps, viewer, [productId])
  /* Already granted rows are not queued: a buyer who left the server and pressed Join again is added back. */
  const { data: rows } = await deps.db.from(DISCORD_GRANTS).select("id, status").eq("user_id", viewer.userId).eq("product_id", productId).eq("want", "in")
  const again = ((rows as Array<{ id: string; status: string }> | null) ?? []).filter((r) => r.status === "granted" || r.status === "needs_link" || r.status === "blocked" || r.status === "failed").map((r) => r.id)
  if (again.length) {
    const now = iso(deps.now())
    await deps.db.from(DISCORD_GRANTS).update({ status: "pending", attempts: 0, next_attempt_at: now, updated_at: now }).in("id", again)
  }
  await runDue(deps, { ids: { discord: [...new Set([...queued.discord, ...again])] } })
  const { data: after } = await deps.db.from(DISCORD_GRANTS).select("status, last_error_code").eq("user_id", viewer.userId).eq("product_id", productId).eq("want", "in")
  const states = (after as Array<{ status: string; last_error_code: string | null }> | null) ?? []
  if (states.some((s) => s.status === "granted")) return { ok: true, guildId: mappings[0].guild_id }
  if (states.some((s) => s.status === "blocked")) return fail("The seller's Discord server is not ready to add members yet. The seller has been told.", 409)
  return fail("Discord did not answer. Storelib keeps trying; you will get the role as soon as it does.", 502)
}

/* ══ Telegram: the creator ════════════════════════════════════════════════ */

let botUsernameCache: { name: string | null; at: number } | null = null

async function botUsername(deps: Deps): Promise<string | null> {
  const config = telegramConfig(deps.env)
  if (!config) return null
  if (config.username) return config.username
  if (botUsernameCache && deps.now() - botUsernameCache.at < 3_600_000) return botUsernameCache.name
  try {
    const me = await getMe(deps.fetch, config)
    botUsernameCache = { name: me.username, at: deps.now() }
    return me.username
  } catch {
    return null
  }
}

export async function loadTelegramSetup(deps: Deps, creatorId: string): Promise<TelegramSetupView> {
  const empty: TelegramSetupView = { available: !!telegramConfig(deps.env), ready: true, botUsername: null, chats: [], mappings: [], products: [], members: [] }
  if (!empty.available) return empty
  const { data: chats, error } = await deps.db.from("telegram_chats").select("id, chat_id, title, chat_type, status, last_error").eq("creator_id", creatorId).order("created_at", { ascending: true })
  if (error) return { ...empty, ready: !tableMissing(error) }
  const [products, username, { data: maps }] = await Promise.all([storeProducts(deps, creatorId), botUsername(deps), deps.db.from("telegram_chat_mappings").select("id, product_id, chat_ref").eq("creator_id", creatorId).order("created_at", { ascending: true })])
  const chatRows = (chats as Array<{ id: string; chat_id: number; title: string | null; chat_type: string; status: string; last_error: string | null }> | null) ?? []
  const titles = new Map(products.map((p) => [p.id, p.title]))
  const chatTitle = new Map(chatRows.map((c) => [c.id, c.title || "Telegram chat"]))
  const byChatId = new Map(chatRows.map((c) => [String(c.chat_id), c.title || "Telegram chat"]))
  const members = await memberRows(deps, "telegram", creatorId, (g) => byChatId.get(String((g as TelegramGrant).chat_id)) ?? "A chat")
  return {
    available: true,
    ready: true,
    botUsername: username,
    chats: chatRows.map((c) => ({ id: c.id, title: c.title || "Telegram chat", type: c.chat_type, status: c.status, lastError: c.last_error })),
    mappings: ((maps as Array<{ id: string; product_id: string; chat_ref: string }> | null) ?? []).map((m) => ({ id: m.id, productId: m.product_id, productTitle: titles.get(m.product_id) ?? "A product no longer for sale", chatRef: m.chat_ref, chatTitle: chatTitle.get(m.chat_ref) ?? "A chat" })),
    products,
    members,
  }
}

/** A code for /link, shown once, kept as a hash for thirty minutes. */
export async function makeTelegramLinkCode(deps: Deps, creatorId: string, userId: string): Promise<Result<{ code: string; expiresAt: string }>> {
  if (!telegramConfig(deps.env)) return fail("Telegram is not available yet.", 404)
  const code = makeLinkCode(randomBytes)
  const expiresAt = iso(deps.now() + LINK_CODE_TTL_MS)
  const { error } = await deps.db.from("telegram_link_codes").insert({ code_hash: hashOf(code), creator_id: creatorId, user_id: userId, expires_at: expiresAt })
  if (error) return tableMissing(error) ? fail(NEEDS_SQL_TELEGRAM, 503) : fail("That could not be saved. Try again.", 500)
  return { ok: true, code: showCode(code), expiresAt }
}

export async function removeTelegramChat(deps: Deps, creatorId: string, id: unknown): Promise<Result> {
  if (typeof id !== "string" || !UUID.test(id)) return fail("Not found.", 404)
  await deps.db.from("telegram_chats").delete().eq("id", id).eq("creator_id", creatorId)
  return { ok: true }
}

export async function saveTelegramMapping(deps: Deps, creatorId: string, body: { productId?: unknown; chatRef?: unknown }): Promise<Result> {
  if (!telegramConfig(deps.env)) return fail("Telegram is not available yet.", 404)
  const product = await ownProduct(deps, creatorId, body.productId)
  if (!product) return fail("Choose one of your products.")
  if (typeof body.chatRef !== "string" || !UUID.test(body.chatRef)) return fail("Choose a chat.")
  const { data: chat } = await deps.db.from("telegram_chats").select("id, status").eq("id", body.chatRef).eq("creator_id", creatorId).maybeSingle()
  if (!chat) return fail("Choose one of your linked chats.")
  const { error } = await deps.db.from("telegram_chat_mappings").upsert({ creator_id: creatorId, product_id: product.id, chat_ref: chat.id, updated_at: iso(deps.now()) }, { onConflict: "product_id,chat_ref" })
  if (error) return tableMissing(error) ? fail(NEEDS_SQL_TELEGRAM, 503) : fail("That could not be saved. Try again.", 500)
  return { ok: true }
}

/* ══ Telegram: the buyer ══════════════════════════════════════════════════ */

export async function joinTelegram(deps: Deps, viewer: { userId: string; email: string | null }, productId: string, chatRef: string | null): Promise<Result<{ link: string }>> {
  if (!UUID.test(productId)) return fail("Not found.", 404)
  let owns = false
  try {
    owns = await hasAccess(deps.db, viewer, productId, deps.now())
  } catch {
    return fail("Storelib could not check your purchase just now. Try again in a moment.", 503)
  }
  if (!owns) return fail("This account does not have access to it.", 403)
  await settleAccess(deps, viewer, [productId])
  let q = deps.db.from("telegram_chat_mappings").select("id, chat_ref").eq("product_id", productId)
  if (chatRef && UUID.test(chatRef)) q = q.eq("chat_ref", chatRef)
  const { data: maps } = await q.limit(1)
  const mapping = ((maps as Array<{ id: string }> | null) ?? [])[0]
  if (!mapping) return fail("This product does not come with a Telegram chat.", 404)
  const { data: g } = await deps.db.from(TELEGRAM_GRANTS).select(GRANT_COLUMNS_TELEGRAM).eq("mapping_id", mapping.id).eq("user_id", viewer.userId).maybeSingle()
  if (!g) return fail("Storelib could not check your purchase just now. Try again in a moment.", 503)
  const r = await inviteFor(deps, g as TelegramGrant)
  if ("error" in r) return fail(r.error, 502)
  return { ok: true, link: (r as { link: string }).link }
}

/* ══ The buyer's buttons ══════════════════════════════════════════════════ */

/**
 * Which of these products come with a server or a chat, for this person. A
 * signed out visitor is told which ones do (products are public) with Sign
 * in; a signed in one sees only what they own. `productIds` null: every
 * product they own that has one (the library).
 */
export async function joinOptions(deps: Deps, viewer: { userId: string; email: string | null } | null, productIds: string[] | null, origin: string): Promise<JoinOption[]> {
  const discordOn = !!discordConfig(deps.env)
  const telegramOn = !!telegramConfig(deps.env)
  if (!discordOn && !telegramOn) return []
  let ids = (productIds ?? []).filter((p) => UUID.test(p)).slice(0, 50)
  if (productIds === null) {
    if (!viewer) return []
    const [{ data: ents }, { data: subs }] = await Promise.all([
      deps.db.from("entitlements").select("product_id").eq("buyer_id", viewer.userId).limit(1000),
      deps.db.from("memberships").select("product_id").eq("buyer_id", viewer.userId).limit(200),
    ])
    ids = [...new Set([...((ents as Array<{ product_id: string }> | null) ?? []), ...((subs as Array<{ product_id: string }> | null) ?? [])].map((r) => r.product_id).filter(Boolean))]
  }
  if (!ids.length) return []
  const [dm, tm] = await Promise.all([
    discordOn ? deps.db.from("discord_role_mappings").select("product_id, guild_id, creator_id").in("product_id", ids) : { data: [], error: null },
    telegramOn ? deps.db.from("telegram_chat_mappings").select("product_id, chat_ref, telegram_chats(title, status)").in("product_id", ids) : { data: [], error: null },
  ])
  const dMaps = (dm.error ? [] : (dm.data ?? [])) as Array<{ product_id: string; guild_id: string; creator_id: string }>
  const tMaps = (tm.error ? [] : (tm.data ?? [])) as Array<{ product_id: string; chat_ref: string; telegram_chats: { title: string | null; status: string } | Array<{ title: string | null; status: string }> | null }>
  if (!dMaps.length && !tMaps.length) return []

  const owned = new Set<string>()
  if (viewer) {
    for (const p of new Set([...dMaps.map((m) => m.product_id), ...tMaps.map((m) => m.product_id)])) {
      try {
        if (await hasAccess(deps.db, viewer, p, deps.now())) owned.add(p)
      } catch {
        /* not shown this time */
      }
    }
  }
  const out: JoinOption[] = []
  if (dMaps.length) {
    const guildIds = [...new Set(dMaps.map((m) => m.guild_id))]
    const { data: conns } = await deps.db.from("discord_connections").select("guild_id, guild_name, status").in("guild_id", guildIds)
    const names = new Map(((conns as Array<{ guild_id: string; guild_name: string | null; status: string }> | null) ?? []).filter((c) => c.status === "connected").map((c) => [c.guild_id, c.guild_name || "Discord"]))
    const granted = new Set<string>()
    if (viewer) {
      const { data } = await deps.db.from(DISCORD_GRANTS).select("product_id, status").eq("user_id", viewer.userId).eq("want", "in").eq("status", "granted")
      for (const r of (data as Array<{ product_id: string }> | null) ?? []) granted.add(r.product_id)
    }
    const seen = new Set<string>()
    for (const m of dMaps) {
      const name = names.get(m.guild_id)
      if (!name || seen.has(m.product_id)) continue
      if (viewer && !owned.has(m.product_id)) continue
      seen.add(m.product_id)
      const href = `${origin}/api/community-roles/discord/join?product=${m.product_id}`
      out.push({ provider: "discord", productId: m.product_id, name, state: !viewer ? "sign_in" : granted.has(m.product_id) ? "joined" : "join", href: granted.has(m.product_id) ? `https://discord.com/channels/${m.guild_id}` : href })
    }
  }
  if (tMaps.length) {
    const granted = new Set<string>()
    if (viewer) {
      const { data } = await deps.db.from(TELEGRAM_GRANTS).select("product_id, status").eq("user_id", viewer.userId).eq("want", "in").eq("status", "granted")
      for (const r of (data as Array<{ product_id: string }> | null) ?? []) granted.add(r.product_id)
    }
    for (const m of tMaps) {
      const chat = Array.isArray(m.telegram_chats) ? m.telegram_chats[0] : m.telegram_chats
      if (!chat || chat.status !== "linked") continue
      if (viewer && !owned.has(m.product_id)) continue
      out.push({ provider: "telegram", productId: m.product_id, name: chat.title || "Telegram", state: !viewer ? "sign_in" : granted.has(m.product_id) ? "joined" : "join", href: `${origin}/api/community-roles/telegram/join?product=${m.product_id}&chat=${m.chat_ref}` })
    }
  }
  return out
}

/* ══ Telegram: the webhook ════════════════════════════════════════════════ */

export type UpdateOutcome = "linked" | "link_refused" | "joined" | "removed_stranger" | "left" | "bot_changed" | "ignored"

export async function handleTelegramUpdate(deps: Deps, update: unknown): Promise<UpdateOutcome> {
  const config = telegramConfig(deps.env)
  if (!config) return "ignored"
  const cmd = linkCommandOf(update)
  if (cmd) return linkChat(deps, cmd)
  const change = memberChangeOf(update)
  if (!change) return "ignored"
  const now = iso(deps.now())

  if (change.aboutBot) {
    if (change.userId !== config.botId) return "ignored"
    const status = change.botStatus === "administrator" ? "linked" : change.botStatus === "left" || change.botStatus === "kicked" ? "removed" : "needs_admin"
    await deps.db.from("telegram_chats").update({ status, updated_at: now, last_error: status === "linked" ? null : status === "removed" ? "Storelib's bot was removed from this chat." : "Storelib's bot is no longer an admin of this chat.", last_error_at: status === "linked" ? null : now }).eq("chat_id", change.chatId)
    return "bot_changed"
  }
  if (change.isBot) return "ignored"

  if (change.joined && change.inviteLink) {
    const { data: g } = await deps.db.from(TELEGRAM_GRANTS).select(GRANT_COLUMNS_TELEGRAM).eq("invite_link_hash", hashOf(change.inviteLink)).eq("chat_id", change.chatId).maybeSingle()
    const grant = g as TelegramGrant | null
    if (!grant) return "ignored"
    if (grant.want === "in") {
      await deps.db.from(TELEGRAM_GRANTS).update({ status: "granted", telegram_user_id: change.userId, telegram_username: change.username, granted_at: now, last_error: null, last_error_code: null, invite_link_sealed: null, invite_link_hash: null, invite_expires_at: null, updated_at: now }).eq("id", grant.id)
      await deps.db.from("telegram_access_log").insert({ grant_id: grant.id, creator_id: grant.creator_id, user_id: grant.user_id, action: "joined", detail: change.username ? `Joined as @${change.username}` : "Joined" })
      return "joined"
    }
    /* Access ended between the invite and the join: out again. */
    try {
      await removeMember(deps.fetch, config, change.chatId, change.userId)
    } catch (e) {
      if (!(e instanceof TelegramError)) throw e
    }
    await deps.db.from("telegram_access_log").insert({ grant_id: grant.id, creator_id: grant.creator_id, user_id: grant.user_id, action: "removed_stranger", detail: "Joined after access ended; removed" })
    return "removed_stranger"
  }
  if (change.left) {
    await deps.db.from(TELEGRAM_GRANTS).update({ status: "needs_link", updated_at: now }).eq("chat_id", change.chatId).eq("telegram_user_id", change.userId).eq("want", "in").eq("status", "granted")
    return "left"
  }
  return "ignored"
}

async function linkChat(deps: Deps, cmd: NonNullable<ReturnType<typeof linkCommandOf>>): Promise<UpdateOutcome> {
  const config = telegramConfig(deps.env)!
  const reply = async (text: string) => {
    try {
      await sendMessage(deps.fetch, config, cmd.chat.id, text)
    } catch {
      /* a channel the bot cannot post in yet */
    }
  }
  const { data: code } = await deps.db.from("telegram_link_codes").select("code_hash, creator_id, user_id, expires_at, used_at").eq("code_hash", hashOf(normaliseCode(cmd.code))).maybeSingle()
  if (!code || code.used_at || Date.parse(code.expires_at) <= deps.now()) {
    await reply("That code is not valid any more. Make a new one in Storelib: Settings › Integrations › Telegram.")
    return "link_refused"
  }
  let rights
  try {
    rights = await botRights(deps.fetch, config, cmd.chat.id)
  } catch {
    await reply("Storelib could not check its rights here. Make the bot an admin, then send the code again.")
    return "link_refused"
  }
  if (!rights.admin || !rights.canInvite || !rights.canRestrict) {
    await reply("Make Storelib's bot an admin here with Invite users via link and Ban users, then send the same code again.")
    return "link_refused"
  }
  const { data: taken } = await deps.db.from("telegram_chats").select("creator_id").eq("chat_id", cmd.chat.id).maybeSingle()
  if (taken && taken.creator_id !== code.creator_id) {
    await reply("This chat is linked to another Storelib store.")
    return "link_refused"
  }
  const now = iso(deps.now())
  /* Used once: only the first /link with this code is taken, even if two arrive together. */
  const { data: used } = await deps.db.from("telegram_link_codes").update({ used_at: now, chat_id: cmd.chat.id }).eq("code_hash", code.code_hash).is("used_at", null).select("code_hash")
  if (!Array.isArray(used) || used.length !== 1) return "link_refused"
  const type = cmd.chat.type === "channel" ? "channel" : cmd.chat.type === "supergroup" ? "supergroup" : "group"
  await deps.db.from("telegram_chats").upsert({ creator_id: code.creator_id, chat_id: cmd.chat.id, chat_type: type, title: cmd.chat.title?.slice(0, 255) ?? null, linked_by: code.user_id, status: "linked", last_error: null, last_error_at: null, updated_at: now }, { onConflict: "chat_id" })
  if (cmd.messageId) {
    try {
      await deleteMessage(deps.fetch, config, cmd.chat.id, cmd.messageId)
    } catch {
      /* the code is spent either way */
    }
  }
  await reply("Linked to Storelib. Members who buy get a one use invite to join here, and are removed when their access ends.")
  return "linked"
}
