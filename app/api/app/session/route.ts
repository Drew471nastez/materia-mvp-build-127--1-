import { type NextRequest, NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { routeUser } from "@/lib/auth/route-user"

const HEADERS = { "Cache-Control": "no-store" }

/**
 * GET /api/app/session
 *
 * Tiny session-check endpoint used by the Storelib Capacitor mobile app to
 * decide which native screen to show before the WebView loads:
 *
 *   • Not logged in          → { loggedIn: false }
 *   • Creator (onboarded)    → { loggedIn: true, type: "creator" }  → open /app
 *   • Seller (still setting  → { loggedIn: true, type: "seller"  }  → open /app
 *       up, incomplete setup)
 *   • Buyer / regular user   → { loggedIn: true, type: "buyer"   }  → open /library
 *
 * Always returns HTTP 200. Supabase Auth not answering is { loggedIn: true, type: "unknown" }
 * (see below); any other error falls back to { loggedIn: false }.
 * No personal data is included – only login status + account type.
 *
 * Testing:
 *   curl -s -b "<supabase-auth-cookie>" https://storelib.com/api/app/session
 *   Logged-in creator  → {"loggedIn":true,"type":"creator"}
 *   Logged-in buyer    → {"loggedIn":true,"type":"buyer"}
 *   No cookie / bad cookie → {"loggedIn":false}
 */
export async function GET(_request: NextRequest) {
  try {
    /*
      SUPABASE AUTH NOT ANSWERING IS NOT "LOGGED OUT" (round 50). The Android launcher
      (WelcomeActivity) asks this before the WebView loads and shows the welcome screen, with its sign
      in buttons, for anything but loggedIn: true. A blip at Auth put a signed in person on it. Now only
      Auth's own "nobody" is loggedIn: false. When it could not tell, the answer is "go in" with no
      account type, which the launcher opens at /library; that page checks the session itself and sends
      a real visitor to sign in, so nothing is let through by this answer.
    */
    const who = await routeUser({ fresh: false })
    if (who.kind === "unavailable") return NextResponse.json({ loggedIn: true, type: "unknown" }, { headers: HEADERS })
    if (who.kind !== "user") {
      return NextResponse.json({ loggedIn: false }, { headers: HEADERS })
    }
    const user = who.user
    const supabase = await createClient()

    // A single query covers all three creator states in one round-trip.
    // maybeSingle() returns null (not an error) when no row is found.
    const { data: creator } = await supabase
      .from("creators")
      .select("onboarding_completed")
      .eq("user_id", user.id)
      .maybeSingle()

    if (creator) {
      // Fully onboarded → "creator"; still setting up → "seller"
      const type = creator.onboarding_completed ? "creator" : "seller"
      return NextResponse.json({ loggedIn: true, type }, { headers: HEADERS })
    }

    // Authenticated user with no creator account → buyer
    return NextResponse.json({ loggedIn: true, type: "buyer" }, { headers: HEADERS })
  } catch {
    // Never expose errors; always 200 with loggedIn: false as fallback
    return NextResponse.json({ loggedIn: false }, { headers: HEADERS })
  }
}
