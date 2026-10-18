import { NextResponse, type NextRequest } from "next/server"
import { revalidatePath, revalidateTag } from "next/cache"

import { requireAdmin, adminFailure } from "@/lib/admin/gate"
import { recordAdminAction } from "@/lib/admin/audit"
import { createAdminClient } from "@/lib/supabase/admin"
import { BUYER_HEADER_LIGHT_CACHE_TAG, isBuyerHeaderLight, setBuyerHeaderLight } from "@/lib/platform/buyer-header-theme"
import {
  EXPLORE_MARKETPLACE_CACHE_TAG,
  isExploreMarketplaceEnabled,
  setExploreMarketplaceEnabled,
} from "@/lib/platform/explore-marketplace"
import {
  EXPLORE_DISCOVER_MODE_SWITCHER_CACHE_TAG,
  isExploreDiscoverModeSwitcherEnabled,
  setExploreDiscoverModeSwitcherEnabled,
} from "@/lib/platform/explore-discover-mode-switcher"
import {
  PHYSICAL_COMMERCE_CACHE_TAG,
  PHYSICAL_COMMERCE_KEY,
  isPhysicalCommerceEnabled,
  setPhysicalCommerceEnabled,
} from "@/lib/platform/physical-commerce"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/admin/marketplace-flags — discover + buyer header appearance. */
export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const [exploreEnabled, buyerHeaderLight, exploreDiscoverModeSwitcher, physicalCommerceEnabled] = await Promise.all([
      isExploreMarketplaceEnabled(),
      isBuyerHeaderLight(),
      isExploreDiscoverModeSwitcherEnabled(),
      isPhysicalCommerceEnabled(),
    ])
    return NextResponse.json(
      { exploreEnabled, buyerHeaderLight, exploreDiscoverModeSwitcher, physicalCommerceEnabled },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    return adminFailure("marketplace flags read", error, "Could not read marketplace flags.")
  }
}

/** POST /api/admin/marketplace-flags — { exploreEnabled?, buyerHeaderLight? } */
export async function POST(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  let body: { exploreEnabled?: unknown; buyerHeaderLight?: unknown; exploreDiscoverModeSwitcher?: unknown; physicalCommerceEnabled?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Send JSON." }, { status: 400 })
  }

  const setExplore = typeof body.exploreEnabled === "boolean"
  const setHeader = typeof body.buyerHeaderLight === "boolean"
  const setDiscoverSwitcher = typeof body.exploreDiscoverModeSwitcher === "boolean"
  const setPhysical = typeof body.physicalCommerceEnabled === "boolean"
  if (!setExplore && !setHeader && !setDiscoverSwitcher && !setPhysical) {
    return NextResponse.json({
      error: "Send exploreEnabled, buyerHeaderLight, exploreDiscoverModeSwitcher and/or physicalCommerceEnabled as booleans.",
    }, { status: 400 })
  }

  const admin = createAdminClient()
  try {
    if (setExplore) {
      await setExploreMarketplaceEnabled(body.exploreEnabled as boolean)
      revalidateTag(EXPLORE_MARKETPLACE_CACHE_TAG, { expire: 0 })
      await recordAdminAction(admin, {
        action: "set_explore_marketplace",
        targetType: "platform",
        targetId: "explore_marketplace",
        targetLabel: body.exploreEnabled ? "on" : "off",
        detail: { exploreEnabled: body.exploreEnabled },
      })
    }
    if (setDiscoverSwitcher) {
      await setExploreDiscoverModeSwitcherEnabled(body.exploreDiscoverModeSwitcher as boolean)
      revalidateTag(EXPLORE_DISCOVER_MODE_SWITCHER_CACHE_TAG, { expire: 0 })
      await recordAdminAction(admin, {
        action: "set_explore_discover_mode_switcher",
        targetType: "platform",
        targetId: "explore_discover_mode_switcher",
        targetLabel: body.exploreDiscoverModeSwitcher ? "on" : "off",
        detail: { exploreDiscoverModeSwitcher: body.exploreDiscoverModeSwitcher },
      })
    }
    if (setPhysical) {
      await setPhysicalCommerceEnabled(body.physicalCommerceEnabled as boolean)
      revalidateTag(PHYSICAL_COMMERCE_CACHE_TAG, { expire: 0 })
      /* The help centre's physical products guide follows the switch at once. */
      revalidatePath("/help", "layout")
      await recordAdminAction(admin, {
        action: "set_physical_commerce",
        targetType: "platform",
        targetId: PHYSICAL_COMMERCE_KEY,
        targetLabel: body.physicalCommerceEnabled ? "on" : "off",
        detail: { physicalCommerceEnabled: body.physicalCommerceEnabled },
      })
    }
    if (setHeader) {
      await setBuyerHeaderLight(body.buyerHeaderLight as boolean)
      revalidateTag(BUYER_HEADER_LIGHT_CACHE_TAG, { expire: 0 })
      await recordAdminAction(admin, {
        action: "set_buyer_header_light",
        targetType: "platform",
        targetId: "buyer_header_light",
        targetLabel: body.buyerHeaderLight ? "light" : "dark",
        detail: { buyerHeaderLight: body.buyerHeaderLight },
      })
    }
  } catch (error) {
    const msg = String(error && typeof error === "object" && "message" in error ? (error as { message?: string }).message : error ?? "")
    const hint = /platform_settings|does not exist|42P01|PGRST205/i.test(msg)
      ? " Run supabase/sql/RUN_ADMIN_HEALTH.sql in Supabase first."
      : ""
    return adminFailure("marketplace flags write", error, `Could not save. Nothing was changed.${hint}`)
  }

  const [exploreEnabled, buyerHeaderLight, exploreDiscoverModeSwitcher, physicalCommerceEnabled] = await Promise.all([
    isExploreMarketplaceEnabled(),
    isBuyerHeaderLight(),
    isExploreDiscoverModeSwitcherEnabled(),
    isPhysicalCommerceEnabled(),
  ])
  return NextResponse.json(
    { exploreEnabled, buyerHeaderLight, exploreDiscoverModeSwitcher, physicalCommerceEnabled },
    { headers: { "Cache-Control": "no-store" } },
  )
}
