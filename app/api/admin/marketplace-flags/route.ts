import { NextResponse, type NextRequest } from "next/server"
import { revalidateTag } from "next/cache"

import { requireAdmin, adminFailure } from "@/lib/admin/gate"
import { recordAdminAction } from "@/lib/admin/audit"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  EXPLORE_MARKETPLACE_CACHE_TAG,
  isExploreMarketplaceEnabled,
  setExploreMarketplaceEnabled,
} from "@/lib/platform/explore-marketplace"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/admin/marketplace-flags — current discover / explore toggle. */
export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const exploreEnabled = await isExploreMarketplaceEnabled()
    return NextResponse.json({ exploreEnabled }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return adminFailure("marketplace flags read", error, "Could not read marketplace flags.")
  }
}

/** POST /api/admin/marketplace-flags — { exploreEnabled: boolean } */
export async function POST(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  let body: { exploreEnabled?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Send JSON." }, { status: 400 })
  }

  if (typeof body.exploreEnabled !== "boolean") {
    return NextResponse.json({ error: "exploreEnabled must be true or false." }, { status: 400 })
  }

  const admin = createAdminClient()
  try {
    await setExploreMarketplaceEnabled(body.exploreEnabled)
    revalidateTag(EXPLORE_MARKETPLACE_CACHE_TAG)
    await recordAdminAction(admin, {
      action: "set_explore_marketplace",
      targetType: "platform",
      targetId: "explore_marketplace",
      targetLabel: body.exploreEnabled ? "on" : "off",
      detail: { exploreEnabled: body.exploreEnabled },
    })
  } catch (error) {
    return adminFailure("marketplace flags write", error, "Could not save. Nothing was changed.")
  }

  return NextResponse.json({ exploreEnabled: body.exploreEnabled }, { headers: { "Cache-Control": "no-store" } })
}
