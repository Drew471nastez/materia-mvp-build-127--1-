import { NextResponse } from "next/server"
import { shopCaller } from "@/lib/physical/auth"
import { platformOrigin } from "@/lib/onepage/return-address"
import { discordConfig } from "@/lib/community-roles/config"
import { CALLBACK_PATH, installUrl } from "@/lib/community-roles/discord-api"
import { NONCE_COOKIE, makeState } from "@/lib/community-roles/oauth-state"
import { SETTINGS_PATH, backTo } from "@/lib/community-roles/route-helpers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/community-roles/discord/connect: Connect Discord server. The
 * store's owner is sent to Discord's screen to add the Storelib bot (scope
 * bot and applications.commands, Manage Roles and Create Invite) to a server
 * they manage. The state is signed for them, with its nonce in an http only
 * cookie scoped to these routes. With no Discord keys, back to the card,
 * which says Not available yet.
 */
export async function GET() {
  const c = await shopCaller("store", { strict: true })
  if (c instanceof NextResponse) return c
  const config = discordConfig()
  if (!config) return backTo(SETTINGS_PATH("discord"), "discord", "not_available")
  const { state, nonce } = makeState({ kind: "install", userId: c.userId, productId: null, back: SETTINGS_PATH("discord") })
  const res = NextResponse.redirect(installUrl(config, `${platformOrigin()}${CALLBACK_PATH}`, state), 303)
  res.cookies.set(NONCE_COOKIE, nonce, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/community-roles/discord", maxAge: 600 })
  res.headers.set("Cache-Control", "no-store")
  return res
}
