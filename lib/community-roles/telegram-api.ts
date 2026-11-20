/**
 * ===========================================================================
 *  TELEGRAM, AS STORELIB ASKS IT
 * ===========================================================================
 * The Bot API over HTTPS (https://api.telegram.org/bot<token>/<method>),
 * JSON in and { ok, result } or { ok: false, error_code, description,
 * parameters.retry_after } out. Every call takes `fetch` as an argument, so
 * the tests replay the documented answers and never reach Telegram.
 *
 * The methods (checked against the Bot API types published as
 * @grammyjs/types 5.0.0, methods.d.ts and manage.d.ts):
 *
 *   getMe                   the bot's username, for the setup screen
 *   getChat                 a linked chat's title and type
 *   getChatMember           the bot's own rights in a chat (can_invite_users,
 *                           can_restrict_members)
 *   createChatInviteLink    { chat_id, name, expire_date, member_limit: 1 }:
 *                           one person can join with it, until it expires
 *   revokeChatInviteLink    an invite that was not used, when access ends
 *   banChatMember           then
 *   unbanChatMember         { only_if_banned: true }: removed, not banned for
 *                           good, so a buyer who pays again can come back
 *   sendMessage             the reply to /link
 *   deleteMessage           the /link message, so the code is not left in the chat
 *
 * Updates arrive at /api/community-roles/telegram/webhook with the header
 * X-Telegram-Bot-Api-Secret-Token set to the secret_token given to
 * setWebhook; anything without it is refused. The webhook must be set with
 * allowed_updates including "chat_member" (Telegram leaves it out by
 * default), or joins are never reported.
 */
import { createHash, timingSafeEqual } from "node:crypto"
import type { TelegramConfig } from "./config"

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>

export const TELEGRAM_API = "https://api.telegram.org"
export const WEBHOOK_PATH = "/api/community-roles/telegram/webhook"
export const ALLOWED_UPDATES = ["message", "channel_post", "chat_member", "my_chat_member"] as const

const CALL_MS = 8_000

export type TelegramErrorKind = "rate_limited" | "no_answer" | "server" | "not_admin" | "chat_gone" | "bad_token" | "user_missing" | "other"

export class TelegramError extends Error {
  constructor(
    message: string,
    readonly kind: TelegramErrorKind,
    readonly status: number,
    readonly retryAfter: number | null = null,
  ) {
    super(message)
  }
  get retryable(): boolean {
    return this.kind === "rate_limited" || this.kind === "no_answer" || this.kind === "server"
  }
}

export function telegramKindOf(code: number, description: string): TelegramErrorKind {
  if (code === 429) return "rate_limited"
  if (code >= 500) return "server"
  if (code === 401 || code === 404) return "bad_token"
  const d = description.toLowerCase()
  if (/not enough rights|need administrator rights|not an administrator|have no rights|chat_admin_required|administrator rights/.test(d)) return "not_admin"
  if (/chat not found|bot was kicked|bot is not a member|group chat was upgraded|chat was deleted/.test(d)) return "chat_gone"
  if (/user not found|participant_id_invalid|user_not_participant|member not found/.test(d)) return "user_missing"
  if (code === 403) return "not_admin"
  return "other"
}

export async function telegramCall<T = unknown>(fetcher: Fetch, config: Pick<TelegramConfig, "botToken">, method: string, params: Record<string, unknown> = {}): Promise<T> {
  let res: Response
  try {
    res = await fetcher(`${TELEGRAM_API}/bot${config.botToken}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(CALL_MS),
      cache: "no-store",
    })
  } catch {
    throw new TelegramError("Telegram did not answer.", "no_answer", 0)
  }
  const body = (await res.json().catch(() => null)) as { ok?: boolean; result?: T; error_code?: number; description?: string; parameters?: { retry_after?: number } } | null
  if (body?.ok === true) return body.result as T
  const code = typeof body?.error_code === "number" ? body.error_code : res.status
  const description = typeof body?.description === "string" ? body.description : `Telegram answered ${res.status}.`
  /* The token is in the address: never in a message that might be logged. */
  throw new TelegramError(description.slice(0, 300), telegramKindOf(code, description), code, typeof body?.parameters?.retry_after === "number" ? body.parameters.retry_after : null)
}

/* ── The calls ───────────────────────────────────────────────────────────── */

export async function getMe(fetcher: Fetch, config: TelegramConfig): Promise<{ id: number; username: string | null }> {
  const me = await telegramCall<{ id: number; username?: string }>(fetcher, config, "getMe")
  return { id: me.id, username: me.username ?? null }
}

export interface TelegramChat {
  id: number
  type: "private" | "group" | "supergroup" | "channel"
  title: string | null
}

export async function getChat(fetcher: Fetch, config: TelegramConfig, chatId: number): Promise<TelegramChat> {
  const c = await telegramCall<{ id: number; type: TelegramChat["type"]; title?: string }>(fetcher, config, "getChat", { chat_id: chatId })
  return { id: c.id, type: c.type, title: c.title ?? null }
}

export interface BotRights {
  admin: boolean
  canInvite: boolean
  canRestrict: boolean
}

/** The bot's own standing in a chat. In a channel there are no restrictions to give: removing a subscriber is "ban users" there too. */
export async function botRights(fetcher: Fetch, config: TelegramConfig, chatId: number): Promise<BotRights> {
  const m = await telegramCall<{ status: string; can_invite_users?: boolean; can_restrict_members?: boolean }>(fetcher, config, "getChatMember", { chat_id: chatId, user_id: config.botId })
  const admin = m.status === "administrator" || m.status === "creator"
  return { admin, canInvite: admin && m.can_invite_users !== false, canRestrict: admin && m.can_restrict_members !== false }
}

export interface Invite {
  link: string
  expiresAt: number
}

/** A link one person can join with, for a day. */
export async function createOneUseInvite(fetcher: Fetch, config: TelegramConfig, chatId: number, name: string, now = Date.now(), ttlSeconds = 86_400): Promise<Invite> {
  const expire = Math.floor(now / 1000) + ttlSeconds
  const r = await telegramCall<{ invite_link: string; expire_date?: number }>(fetcher, config, "createChatInviteLink", { chat_id: chatId, name: name.slice(0, 32), expire_date: expire, member_limit: 1 })
  return { link: r.invite_link, expiresAt: (r.expire_date ?? expire) * 1000 }
}

export async function revokeInvite(fetcher: Fetch, config: TelegramConfig, chatId: number, link: string): Promise<void> {
  await telegramCall(fetcher, config, "revokeChatInviteLink", { chat_id: chatId, invite_link: link })
}

/** Out of the chat, free to come back by a new invite: banned, then unbanned only if still banned. */
export async function removeMember(fetcher: Fetch, config: TelegramConfig, chatId: number, userId: number): Promise<void> {
  await telegramCall(fetcher, config, "banChatMember", { chat_id: chatId, user_id: userId, revoke_messages: false })
  await telegramCall(fetcher, config, "unbanChatMember", { chat_id: chatId, user_id: userId, only_if_banned: true })
}

export async function sendMessage(fetcher: Fetch, config: TelegramConfig, chatId: number, text: string): Promise<void> {
  await telegramCall(fetcher, config, "sendMessage", { chat_id: chatId, text, disable_notification: true })
}

export async function deleteMessage(fetcher: Fetch, config: TelegramConfig, chatId: number, messageId: number): Promise<void> {
  await telegramCall(fetcher, config, "deleteMessage", { chat_id: chatId, message_id: messageId })
}

/* ── The webhook ─────────────────────────────────────────────────────────── */

/** The header Telegram sends with every update, compared in constant time. */
export function webhookSecretOk(config: TelegramConfig | null, header: string | null | undefined): boolean {
  if (!config || typeof header !== "string" || !header) return false
  const a = Buffer.from(header)
  const b = Buffer.from(config.webhookSecret)
  return a.length === b.length && timingSafeEqual(a, b)
}

export const hashOf = (text: string) => createHash("sha256").update(text).digest("hex")

export interface LinkCommand {
  code: string
  chat: TelegramChat
  messageId: number | null
  fromId: number | null
}

/** "/link CODE" or "/link@StorelibBot CODE", posted in a group or a channel. */
export function linkCommandOf(update: unknown): LinkCommand | null {
  const u = (update ?? {}) as { message?: TgMessage; channel_post?: TgMessage }
  const m = u.message ?? u.channel_post
  if (!m || typeof m.text !== "string" || !m.chat || typeof m.chat.id !== "number") return null
  const match = /^\/link(?:@[A-Za-z0-9_]+)?\s+([A-Za-z0-9-]{6,20})\s*$/.exec(m.text.trim())
  if (!match) return null
  if (m.chat.type !== "group" && m.chat.type !== "supergroup" && m.chat.type !== "channel") return null
  return { code: normaliseCode(match[1]), chat: { id: m.chat.id, type: m.chat.type, title: m.chat.title ?? null }, messageId: typeof m.message_id === "number" ? m.message_id : null, fromId: typeof m.from?.id === "number" ? m.from.id : null }
}

interface TgMessage {
  message_id?: number
  text?: string
  chat?: { id: number; type: TelegramChat["type"]; title?: string }
  from?: { id: number }
}

export interface MemberChange {
  chatId: number
  chatType: string
  userId: number
  username: string | null
  isBot: boolean
  /** Became a member (from left or kicked). */
  joined: boolean
  /** Left or was removed. */
  left: boolean
  inviteLink: string | null
  /** The update is about the bot itself (my_chat_member). */
  aboutBot: boolean
  botStatus: string | null
}

const IN = new Set(["member", "administrator", "creator", "restricted"])

export function memberChangeOf(update: unknown): MemberChange | null {
  const u = (update ?? {}) as { chat_member?: TgMemberUpdated; my_chat_member?: TgMemberUpdated }
  const c = u.chat_member ?? u.my_chat_member
  if (!c || !c.chat || typeof c.chat.id !== "number" || !c.new_chat_member?.user) return null
  const was = c.old_chat_member?.status ?? "left"
  const now = c.new_chat_member.status
  /* "restricted" carries is_member: a restricted user who is not in the chat is not a member. */
  const isIn = (s: string, m?: { is_member?: boolean }) => IN.has(s) && !(s === "restricted" && m?.is_member === false)
  const before = isIn(was, c.old_chat_member)
  const after = isIn(now, c.new_chat_member)
  return {
    chatId: c.chat.id,
    chatType: c.chat.type,
    userId: c.new_chat_member.user.id,
    username: c.new_chat_member.user.username ?? null,
    isBot: c.new_chat_member.user.is_bot === true,
    joined: !before && after,
    left: before && !after,
    inviteLink: typeof c.invite_link?.invite_link === "string" ? c.invite_link.invite_link : null,
    aboutBot: !!u.my_chat_member && !u.chat_member,
    botStatus: u.my_chat_member && !u.chat_member ? now : null,
  }
}

interface TgMemberUpdated {
  chat?: { id: number; type: string }
  old_chat_member?: { status: string; is_member?: boolean; user?: { id: number } }
  new_chat_member?: { status: string; is_member?: boolean; user: { id: number; is_bot?: boolean; username?: string } }
  invite_link?: { invite_link?: string }
}

/* ── Link codes ──────────────────────────────────────────────────────────── */

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

/** Ten characters a person can read aloud and type: no 0/O, no 1/I. */
export function makeLinkCode(random: (n: number) => Buffer): string {
  const bytes = random(10)
  let out = ""
  for (let i = 0; i < 10; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]
  return out
}

export function normaliseCode(code: string): string {
  return code.replace(/-/g, "").toUpperCase()
}

/** The code as it is shown: two groups of five. */
export function showCode(code: string): string {
  return `${code.slice(0, 5)}-${code.slice(5)}`
}
