/**
 * Small pieces every website account route shares: the origin a host is
 * reached on, the headers a response that sets or reads these cookies has
 * to carry, so no cache in between keeps it and no Referer carries anything
 * onwards, and the two ways a route knows a write came from the website's
 * own page.
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

function originIsHost(origin: string | null, host: string): boolean {
  if (!origin) return false
  try {
    return new URL(origin).host.toLowerCase() === host
  } catch {
    return false
  }
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
  return originIsHost(request.headers.get("origin"), host)
}

/**
 * A form this website's own page submitted: the sign in steps and the
 * profile. Every browser in use sends Origin with a POST, and it names the
 * page the form was on; one that is not this host is another site's form.
 * A browser that hides it (no Origin, or "null", which a strict referrer
 * setting or an extension can cause) is let through only when it says the
 * request is same-origin (Sec-Fetch-Site, which no page can set), and
 * refused when it says nothing.
 */
export function sameOriginForm(request: Request, host: string): boolean {
  const origin = request.headers.get("origin")
  if (origin && origin !== "null") return originIsHost(origin, host)
  return request.headers.get("sec-fetch-site") === "same-origin"
}
