import { NextResponse } from "next/server"
import { physicalJson, shopCaller } from "@/lib/physical/auth"
import { loadTracking } from "@/lib/store/tracking-server"
import { INTEGRATIONS } from "@/lib/integrations/catalog"
import { applyCatalogOverrides } from "@/lib/integrations/overrides"
import { cachedCatalogOverrides } from "@/lib/integrations/overrides-server"
import { isPhysicalCommerceEnabled } from "@/lib/platform/physical-commerce"
import { loadReviewsApp } from "@/lib/reviews/app-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * The integrations a store has installed, for the app's sidebar: a pixel
 * with its ID saved, a provider with a key or an address saved (not the
 * built in ones, which every store has), and not hidden from /admin.
 * Names and pages only.
 */
export async function GET() {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const [{ tracking }, physical, overrides, reviewsApp] = await Promise.all([
    loadTracking(c.db, c.creatorId).catch(() => ({ tracking: {} as Record<string, string> })),
    isPhysicalCommerceEnabled().catch(() => false),
    cachedCatalogOverrides().catch(() => []),
    loadReviewsApp(c.db, c.creatorId).catch(() => null),
  ])
  let providers: { provider: string; status: string }[] = []
  if (physical) {
    const { data } = await c.db.from("commerce_integrations").select("provider, status").eq("creator_id", c.creatorId)
    providers = (data ?? []) as { provider: string; status: string }[]
  }
  /* The directory as /admin left it (lib/integrations/overrides.ts): a hidden one is not in the sidebar either, and its name is the admin's. */
  const installed = applyCatalogOverrides(INTEGRATIONS, overrides, physical).filter((i) => {
    if (i.kind === "app") return i.appId === "storelib_reviews" && reviewsApp?.settings.enabled === true
    if (i.kind === "tracker") return !!(i.trackerId && (tracking as Record<string, string>)[i.trackerId])
    if (i.kind === "commerce" && !i.builtIn) return providers.some((p) => p.provider === i.providerId && p.status !== "disconnected")
    return false
  }).map((i) => ({ id: i.id, name: i.name, needsAttention: i.kind === "commerce" && providers.some((p) => p.provider === i.providerId && p.status === "error") }))
  return physicalJson({ installed }, 200)
}
