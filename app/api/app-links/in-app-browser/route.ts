import { cookies, headers } from "next/headers"
import { APP_SEEN_COOKIE, OPEN_CARD_COOKIE, handoffCard } from "@/lib/platform/open-in-app"

/**
 * ===========================================================================
 *  "IS SOMEBODY ELSE'S APP SHOWING THIS PAGE?"
 * ===========================================================================
 * Android names the app hosting a web view in the `x-requested-with` request
 * header, and only the server ever sees a request header. So the decision
 * lives here (lib/platform/open-in-app handoffCard, pure and tested) and
 * components/platform/open-in-app-card.tsx asks for it.
 *
 * IT IS ASKED FROM INSIDE A WEB VIEW AND NOWHERE ELSE. The card reads the
 * user agent first and only calls this when that already looks like a web
 * view, so a page in Safari or Chrome makes no request at all. No database,
 * no session, nothing written: the answer is the two signals and two
 * cookies.
 *
 * The root layout cannot read headers without giving up static rendering for
 * the whole site, which is why this is a route and not a server component.
 */
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const [head, jar] = await Promise.all([headers(), cookies()])
  const path = new URL(request.url).searchParams.get("path") || "/"
  const card = handoffCard({
    ua: head.get("user-agent") || "",
    requestedWith: head.get("x-requested-with"),
    path,
    quietCookie: jar.get(OPEN_CARD_COOKIE)?.value ?? null,
    appSeenCookie: jar.get(APP_SEEN_COOKIE)?.value ?? null,
    appStoreId: process.env.NEXT_PUBLIC_IOS_APP_STORE_ID || null,
  })
  return new Response(JSON.stringify({ card }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store",
      Vary: "User-Agent, X-Requested-With, Cookie",
    },
  })
}
