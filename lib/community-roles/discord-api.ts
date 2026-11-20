/**
 * ===========================================================================
 *  DISCORD, AS STORELIB ASKS IT
 * ===========================================================================
 * REST only (API v10), no gateway connection, so the bot needs no
 * privileged intents. Every call takes `fetch` as an argument, so the tests
 * replay Discord's documented answers and never reach Discord.
 *
 * The calls, each with the documented endpoint
 * (github.com/discord/discord-api-docs, developers/resources/guild.mdx,
 * developers/topics/oauth2.mdx, developers/topics/permissions.mdx):
 *
 *   install      GET  discord.com/oauth2/authorize  scope "bot applications.commands",
 *                     permissions MANAGE_ROLES | CREATE_INSTANT_INVITE,
 *                     response_type=code: back with ?code&guild_id&permissions
 *   join         GET  discord.com/oauth2/authorize  scope "identify guilds.join"
 *   token        POST /oauth2/token                 authorization_code / refresh_token,
 *                     client id and secret as HTTP Basic
 *   me           GET  /users/@me                    with the buyer's Bearer token, or the bot's
 *   guild        GET  /guilds/{guild}               the bot's view of the server
 *   roles        GET  /guilds/{guild}/roles
 *   member       GET  /guilds/{guild}/members/{user}
 *   add member   PUT  /guilds/{guild}/members/{user} { access_token, roles }
 *                     201 added (with the roles), 204 already a member (roles ignored)
 *   add role     PUT  /guilds/{guild}/members/{user}/roles/{role}     204
 *   remove role  DELETE /guilds/{guild}/members/{user}/roles/{role}   204
 *
 * Errors carry Discord's JSON error code: 50013 Missing Permissions (most
 * often the bot's own role sits below the role it is asked to give: a bot
 * can only grant roles lower than its highest role), 50001 Missing Access,
 * 10004 Unknown Guild, 10007 Unknown Member, 10011 Unknown Role, 40007 the
 * user is banned from the server, 50025 Invalid OAuth2 access token; a 429
 * carries retry_after in seconds.
 */
import type { DiscordConfig } from "./config"

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>

export const DISCORD_API = "https://discord.com/api/v10"
export const DISCORD_AUTHORIZE = "https://discord.com/oauth2/authorize"
export const CALLBACK_PATH = "/api/community-roles/discord/callback"

/** MANAGE_ROLES (1 << 28) and CREATE_INSTANT_INVITE (1 << 0). Add Guild Member needs the second. */
export const BOT_PERMISSIONS = String((1 << 28) + 1)
export const INSTALL_SCOPES = ["bot", "applications.commands"]
export const JOIN_SCOPES = ["identify", "guilds.join"]

const CALL_MS = 8_000
const USER_AGENT = "DiscordBot (https://storelib.com, 1.0)"

export type DiscordErrorKind = "hierarchy" | "missing_access" | "unknown_guild" | "unknown_member" | "unknown_role" | "banned" | "bad_user_token" | "bad_bot_token" | "rate_limited" | "no_answer" | "server" | "other"

export class DiscordError extends Error {
  constructor(
    message: string,
    readonly kind: DiscordErrorKind,
    readonly status: number,
    readonly code: number | null = null,
    /** Seconds Discord asked to wait (429). */
    readonly retryAfter: number | null = null,
  ) {
    super(message)
  }
  /** Worth trying again later without anyone changing anything. */
  get retryable(): boolean {
    return this.kind === "rate_limited" || this.kind === "no_answer" || this.kind === "server"
  }
}

export function kindOf(status: number, code: number | null): DiscordErrorKind {
  if (status === 429) return "rate_limited"
  if (status >= 500) return "server"
  if (code === 50013) return "hierarchy"
  if (code === 50001) return "missing_access"
  if (code === 10004) return "unknown_guild"
  if (code === 10007) return "unknown_member"
  if (code === 10011) return "unknown_role"
  if (code === 40007) return "banned"
  if (code === 50025) return "bad_user_token"
  if (status === 401) return "bad_bot_token"
  if (status === 403) return "missing_access"
  return "other"
}

async function call(fetcher: Fetch, path: string, init: RequestInit & { auth: string }): Promise<{ status: number; body: unknown }> {
  const { auth, ...rest } = init
  let res: Response
  try {
    res = await fetcher(path.startsWith("http") ? path : `${DISCORD_API}${path}`, {
      ...rest,
      headers: { Authorization: auth, "User-Agent": USER_AGENT, ...(rest.body && typeof rest.body === "string" && !(rest.headers as Record<string, string> | undefined)?.["Content-Type"] ? { "Content-Type": "application/json" } : {}), ...((rest.headers as Record<string, string>) ?? {}) },
      signal: AbortSignal.timeout(CALL_MS),
      cache: "no-store",
    })
  } catch {
    throw new DiscordError("Discord did not answer.", "no_answer", 0)
  }
  const text = await res.text().catch(() => "")
  let body: unknown = null
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
  }
  if (res.ok) return { status: res.status, body }
  const b = (body && typeof body === "object" ? body : {}) as { code?: unknown; message?: unknown; retry_after?: unknown; error?: unknown; error_description?: unknown }
  const code = typeof b.code === "number" ? b.code : null
  const retryAfter = typeof b.retry_after === "number" ? b.retry_after : Number(res.headers.get("retry-after")) || null
  const message = typeof b.message === "string" ? b.message : typeof b.error_description === "string" ? b.error_description : typeof b.error === "string" ? b.error : `Discord answered ${res.status}.`
  throw new DiscordError(message.slice(0, 300), kindOf(res.status, code), res.status, code, retryAfter)
}

const bot = (config: DiscordConfig) => `Bot ${config.botToken}`
const bearer = (token: string) => `Bearer ${token}`

/* ── The two authorize screens ───────────────────────────────────────────── */

export function installUrl(config: DiscordConfig, redirectUri: string, state: string): string {
  const q = new URLSearchParams({
    client_id: config.clientId,
    scope: INSTALL_SCOPES.join(" "),
    permissions: BOT_PERMISSIONS,
    response_type: "code",
    redirect_uri: redirectUri,
    integration_type: "0",
    state,
  })
  return `${DISCORD_AUTHORIZE}?${q.toString()}`
}

export function joinUrl(config: DiscordConfig, redirectUri: string, state: string): string {
  const q = new URLSearchParams({ client_id: config.clientId, scope: JOIN_SCOPES.join(" "), response_type: "code", redirect_uri: redirectUri, state })
  return `${DISCORD_AUTHORIZE}?${q.toString()}`
}

/* ── Tokens ──────────────────────────────────────────────────────────────── */

export interface DiscordTokens {
  accessToken: string
  refreshToken: string | null
  expiresAt: number
  scope: string
  /** Only on a bot install exchanged as a code grant: the server the bot was added to. */
  guild: { id: string; name: string | null; icon: string | null } | null
}

function tokensFrom(body: unknown, now: number): DiscordTokens {
  const b = (body ?? {}) as { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown; scope?: unknown; guild?: { id?: unknown; name?: unknown; icon?: unknown } | null }
  if (typeof b.access_token !== "string" || !b.access_token) throw new DiscordError("Discord sent no access token.", "other", 200)
  const g = b.guild && typeof b.guild.id === "string" ? { id: b.guild.id, name: typeof b.guild.name === "string" ? b.guild.name : null, icon: typeof b.guild.icon === "string" ? b.guild.icon : null } : null
  return {
    accessToken: b.access_token,
    refreshToken: typeof b.refresh_token === "string" ? b.refresh_token : null,
    expiresAt: now + Math.max(60, Number(b.expires_in) || 604800) * 1000,
    scope: typeof b.scope === "string" ? b.scope : "",
    guild: g,
  }
}

async function tokenCall(fetcher: Fetch, config: DiscordConfig, form: Record<string, string>, now: number): Promise<DiscordTokens> {
  const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")
  const { body } = await call(fetcher, `${DISCORD_API}/oauth2/token`, {
    method: "POST",
    auth: `Basic ${basic}`,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  })
  return tokensFrom(body, now)
}

export function exchangeCode(fetcher: Fetch, config: DiscordConfig, code: string, redirectUri: string, now = Date.now()): Promise<DiscordTokens> {
  return tokenCall(fetcher, config, { grant_type: "authorization_code", code, redirect_uri: redirectUri }, now)
}

export function refreshTokens(fetcher: Fetch, config: DiscordConfig, refreshToken: string, now = Date.now()): Promise<DiscordTokens> {
  return tokenCall(fetcher, config, { grant_type: "refresh_token", refresh_token: refreshToken }, now)
}

/* ── Users, servers, roles ───────────────────────────────────────────────── */

export interface DiscordUser {
  id: string
  username: string
}

function userFrom(body: unknown): DiscordUser {
  const b = (body ?? {}) as { id?: unknown; username?: unknown; global_name?: unknown }
  if (typeof b.id !== "string") throw new DiscordError("Discord sent no user.", "other", 200)
  const name = typeof b.global_name === "string" && b.global_name ? b.global_name : typeof b.username === "string" ? b.username : ""
  return { id: b.id, username: name.slice(0, 100) }
}

export async function currentUser(fetcher: Fetch, accessToken: string): Promise<DiscordUser> {
  return userFrom((await call(fetcher, "/users/@me", { method: "GET", auth: bearer(accessToken) })).body)
}

export async function botUser(fetcher: Fetch, config: DiscordConfig): Promise<DiscordUser> {
  return userFrom((await call(fetcher, "/users/@me", { method: "GET", auth: bot(config) })).body)
}

export interface DiscordGuild {
  id: string
  name: string
  icon: string | null
}

export async function getGuild(fetcher: Fetch, config: DiscordConfig, guildId: string): Promise<DiscordGuild> {
  const { body } = await call(fetcher, `/guilds/${encodeURIComponent(guildId)}`, { method: "GET", auth: bot(config) })
  const b = (body ?? {}) as { id?: unknown; name?: unknown; icon?: unknown }
  return { id: String(b.id ?? guildId), name: typeof b.name === "string" ? b.name : "", icon: typeof b.icon === "string" ? b.icon : null }
}

export interface DiscordRole {
  id: string
  name: string
  position: number
  managed: boolean
}

export async function guildRoles(fetcher: Fetch, config: DiscordConfig, guildId: string): Promise<DiscordRole[]> {
  const { body } = await call(fetcher, `/guilds/${encodeURIComponent(guildId)}/roles`, { method: "GET", auth: bot(config) })
  return (Array.isArray(body) ? body : [])
    .map((r: { id?: unknown; name?: unknown; position?: unknown; managed?: unknown }) => ({ id: String(r.id ?? ""), name: typeof r.name === "string" ? r.name : "", position: Number(r.position) || 0, managed: r.managed === true }))
    .filter((r) => /^[0-9]{5,25}$/.test(r.id))
}

/** A member's role ids, or null when they are not in the server. */
export async function memberRoles(fetcher: Fetch, config: DiscordConfig, guildId: string, userId: string): Promise<string[] | null> {
  try {
    const { body } = await call(fetcher, `/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(userId)}`, { method: "GET", auth: bot(config) })
    const roles = (body as { roles?: unknown } | null)?.roles
    return Array.isArray(roles) ? roles.map(String) : []
  } catch (e) {
    if (e instanceof DiscordError && e.kind === "unknown_member") return null
    throw e
  }
}

/** Adds the buyer to the server with the role: "added" (201), or "already" (204, already a member: the role is not given by this call). */
export async function addMember(fetcher: Fetch, config: DiscordConfig, guildId: string, userId: string, accessToken: string, roles: string[]): Promise<"added" | "already"> {
  const { status } = await call(fetcher, `/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(userId)}`, {
    method: "PUT",
    auth: bot(config),
    body: JSON.stringify({ access_token: accessToken, roles }),
  })
  return status === 204 ? "already" : "added"
}

export async function addRole(fetcher: Fetch, config: DiscordConfig, guildId: string, userId: string, roleId: string): Promise<void> {
  await call(fetcher, `/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(userId)}/roles/${encodeURIComponent(roleId)}`, {
    method: "PUT",
    auth: bot(config),
    headers: { "X-Audit-Log-Reason": "Storelib: paid access" },
  })
}

export async function removeRole(fetcher: Fetch, config: DiscordConfig, guildId: string, userId: string, roleId: string): Promise<void> {
  await call(fetcher, `/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(userId)}/roles/${encodeURIComponent(roleId)}`, {
    method: "DELETE",
    auth: bot(config),
    headers: { "X-Audit-Log-Reason": "Storelib: paid access ended" },
  })
}

/* ── The role hierarchy, checked before it fails ─────────────────────────── */

export type RoleProblem = "missing" | "everyone" | "managed" | "above_bot"

/**
 * Whether the bot can give `roleId`: it exists, it is not @everyone (its id
 * is the server's own) or a role an integration manages, and it sits below
 * the bot's highest role. `botRoleIds` are the bot member's roles.
 */
export function roleProblem(roles: DiscordRole[], botRoleIds: string[], roleId: string, guildId: string): RoleProblem | null {
  const role = roles.find((r) => r.id === roleId)
  if (!role) return "missing"
  if (role.id === guildId) return "everyone"
  if (role.managed) return "managed"
  const top = roles.filter((r) => botRoleIds.includes(r.id)).reduce((m, r) => Math.max(m, r.position), 0)
  if (role.position >= top) return "above_bot"
  return null
}

/** What the creator reads about a role the bot cannot give. */
export function roleProblemText(problem: RoleProblem | "hierarchy", roleName: string | null): string {
  const name = roleName ? `"${roleName}"` : "this role"
  switch (problem) {
    case "missing":
      return `The role ${name} is no longer in your Discord server. Choose another role.`
    case "everyone":
      return "Everyone in the server already has @everyone. Choose a role of your own."
    case "managed":
      return `${name} is managed by another app and cannot be given by Storelib. Choose another role.`
    case "above_bot":
    case "hierarchy":
      return `Storelib's bot cannot give ${name}: its own role must be above ${name}. In Discord, open Server Settings › Roles and drag the Storelib role above ${name}, then press Try again.`
  }
}
