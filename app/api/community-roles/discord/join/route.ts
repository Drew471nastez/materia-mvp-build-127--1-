import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { platformOrigin } from "@/lib/onepage/return-address"
import { discordConfig } from "@/lib/community-roles/config"
import { CALLBACK_PATH, joinUrl } from "@/lib/community-roles/discord-api"
import { hasAccess } from "@/lib/community-roles/access"
import { NONCE_COOKIE, makeState, safeBack } from "@/lib/community-roles/oauth-state"
import { backTo, buyer, signInFirst } from "@/lib/community-roles/route-helpers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * GET /api/community-roles/discord/join?product=<id>&back=<path>: Join the
 * Discord. A signed out visitor signs in first and comes back here. A buyer
 * who owns the product is sent to Discord to let Storelib add them to the
 * server (identify, guilds.join); the callback adds them with the role.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const back = safeBack(url.searchParams.get("back")) ?? "/account/library"
  const productId = url.searchParams.get("product") ?? ""
  const config = discordConfig()
  if (!config) return backTo(back, "discord", "not_available")
  if (!UUID.test(productId)) return backTo(back, "discord", "error")
  const who = await buyer()
  if (who === "unavailable") return backTo(back, "discord", "error", "We could not check your sign in just now. Try again.")
  if (who === "anonymous") return signInFirst(request)
  let owns = false
  try {
    owns = await hasAccess(createAdminClient(), who, productId)
  } catch {
    return backTo(back, "discord", "error", "Storelib could not check your purchase just now. Try again in a moment.")
  }
  if (!owns) return backTo(back, "discord", "no_access")
  const { state, nonce } = makeState({ kind: "join", userId: who.userId, productId, back })
  const res = NextResponse.redirect(joinUrl(config, `${platformOrigin()}${CALLBACK_PATH}`, state), 303)
  res.cookies.set(NONCE_COOKIE, nonce, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/community-roles/discord", maxAge: 600 })
  res.headers.set("Cache-Control", "no-store")
  return res
}
