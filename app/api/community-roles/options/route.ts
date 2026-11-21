import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { rateLimit, addressSubject } from "@/lib/api/rate-limit"
import { platformOrigin } from "@/lib/onepage/return-address"
import { realDeps } from "@/lib/community-roles/engine"
import { joinOptions } from "@/lib/community-roles/setup"
import { anyProviderEnabled } from "@/lib/community-roles/config"
import { buyer } from "@/lib/community-roles/route-helpers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const headers = { "Cache-Control": "private, no-store" }

/**
 * GET /api/community-roles/options?products=<id>,<id>  (or no products: the
 * whole library). The Join the Discord and Join the Telegram buttons a
 * receipt, the library, a membership page or a OnePage block shows. With no
 * keys set, an empty list: the buttons are simply not there.
 */
export async function GET(request: Request) {
  if (!anyProviderEnabled()) return NextResponse.json({ options: [] }, { headers })
  const limited = await rateLimit({ bucket: "community-roles-options", subjects: [addressSubject(request)], windows: [{ limit: 60, seconds: 60 }] })
  if (limited) return limited
  const raw = new URL(request.url).searchParams.get("products")
  const ids = raw === null ? null : raw.split(",").map((s) => s.trim()).filter(Boolean)
  const who = await buyer()
  if (who === "unavailable") return NextResponse.json({ options: [] }, { headers })
  try {
    const options = await joinOptions(realDeps(createAdminClient()), who === "anonymous" ? null : who, ids, platformOrigin())
    return NextResponse.json({ options, signedIn: who !== "anonymous" }, { headers })
  } catch {
    return NextResponse.json({ options: [] }, { headers })
  }
}
