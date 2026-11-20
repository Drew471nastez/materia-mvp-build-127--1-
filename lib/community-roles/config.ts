/**
 * ===========================================================================
 *  DISCORD AND TELEGRAM ACCESS FOR PAYING MEMBERS: WHAT IS SET UP
 * ===========================================================================
 * Storelib's own Discord application and Telegram bot, read from the
 * environment. With a variable missing the provider is off: every screen
 * says "Not available yet", no route calls Discord or Telegram, and the
 * payment hooks return at once.
 *
 *   Discord   DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_BOT_TOKEN
 *   Telegram  TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET
 *             (TELEGRAM_BOT_USERNAME is optional: read with getMe when absent)
 *
 * Pure: safe in tests, takes the environment as an argument.
 */

export type Env = Record<string, string | undefined>

export interface DiscordConfig {
  clientId: string
  clientSecret: string
  botToken: string
}

export interface TelegramConfig {
  botToken: string
  webhookSecret: string
  /** The bot's own user id: the part of the token before the colon. */
  botId: number
  username: string | null
}

const SNOWFLAKE = /^[0-9]{5,25}$/

export function discordConfig(env: Env = process.env): DiscordConfig | null {
  const clientId = env.DISCORD_CLIENT_ID?.trim()
  const clientSecret = env.DISCORD_CLIENT_SECRET?.trim()
  const botToken = env.DISCORD_BOT_TOKEN?.trim()
  if (!clientId || !clientSecret || !botToken || !SNOWFLAKE.test(clientId)) return null
  return { clientId, clientSecret, botToken }
}

/** Telegram's secret_token: 1 to 256 of A-Z, a-z, 0-9, _ and -. */
export const WEBHOOK_SECRET_SHAPE = /^[A-Za-z0-9_-]{1,256}$/

export function telegramConfig(env: Env = process.env): TelegramConfig | null {
  const botToken = env.TELEGRAM_BOT_TOKEN?.trim()
  const webhookSecret = env.TELEGRAM_WEBHOOK_SECRET?.trim()
  if (!botToken || !webhookSecret || !WEBHOOK_SECRET_SHAPE.test(webhookSecret)) return null
  const m = /^(\d{3,20}):[A-Za-z0-9_-]{20,}$/.exec(botToken)
  if (!m) return null
  const username = env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "") || null
  return { botToken, webhookSecret, botId: Number(m[1]), username }
}

export type Provider = "discord" | "telegram"

export function providerEnabled(provider: Provider, env: Env = process.env): boolean {
  return provider === "discord" ? !!discordConfig(env) : !!telegramConfig(env)
}

export function anyProviderEnabled(env: Env = process.env): boolean {
  return !!discordConfig(env) || !!telegramConfig(env)
}

/** The words every screen shows when a provider is off. */
export const NOT_AVAILABLE = "Not available yet"
