import { type NextRequest, NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"

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
 * Always returns HTTP 200. Any error falls back to { loggedIn: false }.
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
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ loggedIn: false }, { headers: HEADERS })
    }

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
