import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createAdminClient } from "@/lib/supabase/admin"
import { shopCaller } from "@/lib/physical/auth"
import { platformOrigin } from "@/lib/onepage/return-address"
import { recordActivity } from "@/lib/activity/log-server"
import { discordConfig } from "@/lib/community-roles/config"
import { CALLBACK_PATH, exchangeCode, type DiscordTokens } from "@/lib/community-roles/discord-api"
import { NONCE_COOKIE, readState } from "@/lib/community-roles/oauth-state"
import { realDeps } from "@/lib/community-roles/engine"
import { connectDiscordServer, joinDiscord, linkDiscordAccount } from "@/lib/community-roles/setup"
import { SETTINGS_PATH, backTo, buyer } from "@/lib/community-roles/route-helpers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

/**
 * GET /api/community-roles/discord/callback?code&state[&guild_id&permissions]
 *
 * Discord's answer to both screens. Taken only when the state is one this
 * server signed for the signed in person, under ten minutes old, with the
 * nonce this browser was given; anything else goes back with "expired".
 *
 *   install   the creator added the bot: the code is exchanged (the answer
 *             names the server), the server checked with the bot's own
 *             token, and saved for their store
 *   join      the buyer let Storelib add them: their tokens sealed and kept,
 *             then added to the server with the role, and sent to it
 *
 * No token is ever put in a URL or sent to the browser.
 */
const clearNonce = (res: NextResponse) => {
  res.cookies.set(NONCE_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/api/community-roles/discord", maxAge: 0 })
  return res
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const config = discordConfig()
  if (!config) return clearNonce(backTo(SETTINGS_PATH("discord"), "discord", "not_available"))
  const who = await buyer()
  if (who === "unavailable" || who === "anonymous") return clearNonce(backTo("/account/library", "discord", "expired"))
  const nonce = (await cookies()).get(NONCE_COOKIE)?.value
  const state = readState(url.searchParams.get("state"), nonce, who.userId)
  if (!state) return clearNonce(backTo("/account/library", "discord", "expired"))
  const back = state.back ?? (state.kind === "install" ? SETTINGS_PATH("discord") : "/account/library")
  if (url.searchParams.get("error")) return clearNonce(backTo(back, "discord", "declined"))
  const code = url.searchParams.get("code")
  const deps = realDeps(createAdminClient())

  if (state.kind === "install") {
    const c = await shopCaller("store", { strict: true })
    if (c instanceof NextResponse) return clearNonce(backTo(back, "discord", "error", "Sign in as the store's owner and try again."))
    let tokens: DiscordTokens | null = null
    if (code && code.length < 200) {
      try {
        tokens = await exchangeCode(deps.fetch, config, code, `${platformOrigin()}${CALLBACK_PATH}`)
      } catch {
        tokens = null
      }
    }
    const hint = url.searchParams.get("guild_id")
    const r = await connectDiscordServer(realDeps(c.db), c.creatorId, c.userId, { tokens, guildIdHint: hint })
    if (!r.ok) return clearNonce(backTo(back, "discord", "error", r.error))
    await recordActivity(c.db, c, { action: "integration.installed", subjectType: "integration", subjectId: "discord", subjectLabel: "Discord" }).catch(() => undefined)
    return clearNonce(backTo(back, "discord", "connected"))
  }

  /* join */
  if (!code || code.length > 200 || !state.productId) return clearNonce(backTo(back, "discord", "error"))
  let tokens: DiscordTokens
  try {
    tokens = await exchangeCode(deps.fetch, config, code, `${platformOrigin()}${CALLBACK_PATH}`)
  } catch {
    return clearNonce(backTo(back, "discord", "error", "Discord did not answer. Try again in a moment."))
  }
  const linked = await linkDiscordAccount(deps, who.userId, tokens)
  if (!linked.ok) return clearNonce(backTo(back, "discord", "error", linked.error))
  const joined = await joinDiscord(deps, who, state.productId)
  if (!joined.ok) return clearNonce(backTo(back, "discord", joined.status === 403 ? "no_access" : "error", joined.error))
  const res = NextResponse.redirect(`https://discord.com/channels/${joined.guildId}`, 303)
  res.headers.set("Cache-Control", "no-store")
  return clearNonce(res)
}
