/**
 * WHERE /explore SENDS SOMEBODY WHILE EXPLORE IS SWITCHED OFF (round 51).
 *
 * It was always "/", the marketing landing page, which the iOS and Android
 * apps must never show, and which a seller who pressed Explore in their
 * dashboard's account menu did not ask for either. Now:
 *
 *   the iOS or Android app    /native-start, which sends a seller to /app, a
 *                             buyer to their library and a stranger to
 *                             /welcome (app/native-start/page.tsx)
 *   signed in, on the web     their library, the buyer side that is open
 *   a stranger on the web     the home page, as before
 *
 * The /app account menu does not offer Explore while it is off
 * (components/app/sidebar.tsx), so this is for a link from elsewhere.
 * Pure: the layout passes what it read.
 */
import { carriesSignIn } from "@/lib/auth/no-session-paths"

/** The Capacitor shell's user agent (capacitor.config.ts appendUserAgent), as lib/native-bridge reads it. */
export function isAppUserAgent(userAgent: string | null | undefined): boolean {
  const ua = userAgent || ""
  return /StorelibApp|Capacitor/.test(ua) || (/wv/.test(ua) && /Android/.test(ua))
}

export function exploreOffTarget({ userAgent, cookieNames }: { userAgent: string | null | undefined; cookieNames: readonly string[] }): string {
  if (isAppUserAgent(userAgent)) return "/native-start"
  if (carriesSignIn(cookieNames)) return "/account/library"
  return "/"
}
