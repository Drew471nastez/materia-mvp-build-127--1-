/**
 * WHERE /explore SENDS SOMEBODY WHILE EXPLORE IS SWITCHED OFF (round 51).
 *
 * Explore's own render is the same for everybody and the CDN may hold it
 * (tests/cdnpages-r49), so it cannot ask who is looking: it sends everybody
 * here, and this answer, never held by a cache, decides from the person's
 * user agent and cookies (lib/explore/off-target.ts): the app's start gate
 * in the iOS and Android apps, the library for somebody signed in, the home
 * page for a stranger on the web. It was always "/", the landing page.
 */
import { NextResponse, type NextRequest } from "next/server"
import { exploreOffTarget } from "@/lib/explore/off-target"

export const dynamic = "force-dynamic"

export function GET(request: NextRequest) {
  const to = exploreOffTarget({ userAgent: request.headers.get("user-agent"), cookieNames: request.cookies.getAll().map((c) => c.name) })
  const res = NextResponse.redirect(new URL(to, request.url), 307)
  res.headers.set("Cache-Control", "private, no-store")
  return res
}
