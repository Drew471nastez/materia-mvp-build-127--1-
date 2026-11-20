import "server-only"
import { NextResponse } from "next/server"
import { routeUser } from "@/lib/auth/route-user"
import { platformOrigin } from "@/lib/onepage/return-address"
import { safeBack } from "./oauth-state"

export const NO_STORE = { "Cache-Control": "no-store" }

/** The signed in buyer with their address when it is confirmed; "anonymous"; or "unavailable" when Auth did not answer. */
export async function buyer(): Promise<{ userId: string; email: string | null } | "anonymous" | "unavailable"> {
  const who = await routeUser({ full: true })
  if (who.kind === "unavailable") return "unavailable"
  if (who.kind !== "user") return "anonymous"
  const u = who.user as { id: string; email?: string | null; email_confirmed_at?: string | null; confirmed_at?: string | null }
  return { userId: u.id, email: u.email && (u.email_confirmed_at || u.confirmed_at) ? u.email.trim().toLowerCase() : null }
}

/** Back to a page on Storelib with a word on how it went (`discord=joined`, `telegram=error`). */
export function backTo(path: string | null, key: string, word: string, message?: string): NextResponse {
  const target = new URL(safeBack(path) ?? "/account/library", platformOrigin())
  target.searchParams.set(key, word)
  if (message) target.searchParams.set(`${key}_message`, message.slice(0, 200))
  const res = NextResponse.redirect(target.toString(), 303)
  res.headers.set("Cache-Control", "no-store")
  return res
}

export function signInFirst(request: Request): NextResponse {
  const url = new URL(request.url)
  const next = `${url.pathname}${url.search}`
  const res = NextResponse.redirect(`${platformOrigin()}/login?next=${encodeURIComponent(next)}`, 303)
  res.headers.set("Cache-Control", "no-store")
  return res
}

export const SETTINGS_PATH = (provider: "discord" | "telegram") => `/app/settings?tab=integrations&integration=${provider}`
