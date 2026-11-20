import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { rateLimit } from "@/lib/api/rate-limit"
import { telegramConfig } from "@/lib/community-roles/config"
import { realDeps } from "@/lib/community-roles/engine"
import { joinTelegram } from "@/lib/community-roles/setup"
import { safeBack } from "@/lib/community-roles/oauth-state"
import { backTo, buyer, signInFirst } from "@/lib/community-roles/route-helpers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/community-roles/telegram/join?product=<id>[&chat=<id>][&back=<path>]:
 * Join the Telegram group. A buyer who owns the product gets a one use
 * invite (one person, one day) made for them and is sent to it; pressing
 * again within the day gives the same link. When they join, the webhook
 * records their Telegram account, so they can be removed when access ends.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const back = safeBack(url.searchParams.get("back")) ?? "/account/library"
  if (!telegramConfig()) return backTo(back, "telegram", "not_available")
  const who = await buyer()
  if (who === "unavailable") return backTo(back, "telegram", "error", "We could not check your sign in just now. Try again.")
  if (who === "anonymous") return signInFirst(request)
  const limited = await rateLimit({ bucket: "telegram-invite", subjects: [`user:${who.userId}`], windows: [{ limit: 10, seconds: 600 }] })
  if (limited) return backTo(back, "telegram", "error", "That is a lot of invites. Wait a few minutes and try again.")
  const r = await joinTelegram(realDeps(createAdminClient()), who, url.searchParams.get("product") ?? "", url.searchParams.get("chat"))
  if (!r.ok) return backTo(back, "telegram", r.status === 403 ? "no_access" : "error", r.error)
  const res = NextResponse.redirect(r.link, 303)
  res.headers.set("Cache-Control", "no-store")
  return res
}
