import { NextResponse } from "next/server"
import { PLAY_URL } from "@/lib/platform/open-in-app"
import { appStoreUrl } from "@/lib/communities/setup-checklist"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/get-app: to the Storelib app's store page for the phone asking.
 * An iPhone or iPad goes to the App Store when its address is set
 * (NEXT_PUBLIC_IOS_APP_STORE_ID or NEXT_PUBLIC_IOS_APP_STORE_URL), anything
 * else to Google Play, whose page also installs to a phone from a computer.
 * The setup list's "Download the app" opens it (lib/communities/setup-checklist.ts).
 * Reads nothing and writes nothing.
 */
export async function GET(request: Request) {
  const ua = request.headers.get("user-agent") || ""
  const ios = appStoreUrl()
  const apple = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && /Mobile/i.test(ua))
  const to = apple && ios ? ios : PLAY_URL
  return NextResponse.redirect(to, { status: 302, headers: { "Cache-Control": "no-store" } })
}
