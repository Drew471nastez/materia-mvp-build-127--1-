/**
 * Small pieces every website account route shares: the origin a host is
 * reached on, and the headers a response that sets or reads these cookies
 * has to carry, so no cache in between keeps it and no Referer carries a
 * code onwards.
 */
import type { NextResponse } from "next/server"

export function originOf(host: string): string {
  const bare = host.split(":")[0]
  const local = bare === "localhost" || bare === "127.0.0.1"
  return `${local ? "http" : "https"}://${host}`
}

export function privateResponse<T extends NextResponse>(res: T): T {
  res.headers.set("Cache-Control", "private, no-store")
  res.headers.set("Referrer-Policy", "no-referrer")
  return res
}

/**
 * A write from the website's own page, and not from anywhere else. JSON
 * only, which a form on another site cannot send without asking first, and
 * an Origin that is this host. A request with no Origin at all is not a page
 * of this website calling its API.
 */
export function sameOriginWrite(request: Request, host: string): boolean {
  const type = request.headers.get("content-type") || ""
  if (!type.toLowerCase().startsWith("application/json")) return false
  const origin = request.headers.get("origin")
  if (!origin) return false
  try {
    return new URL(origin).host.toLowerCase() === host
  } catch {
    return false
  }
}
