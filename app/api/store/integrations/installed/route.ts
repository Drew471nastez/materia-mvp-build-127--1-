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
 * Names, logos (the small file the sidebar shows beside each) and pages only.
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
  /* Klaviyo and Omnisend connected with a key count as installed whatever the store sells (lib/integrations/marketing). */
  const { data: marketingRows } = await c.db.from("commerce_integrations").select("provider, status, last_error").eq("creator_id", c.creatorId).in("provider", ["klaviyo", "omnisend"])
  const marketing = ((marketingRows ?? []) as { provider: string; status: string; last_error: string | null }[]).filter((m) => m.status === "connected")
  /* The directory as /admin left it (lib/integrations/overrides.ts): a hidden one is not in the sidebar either, and its name is the admin's. */
  const installed = applyCatalogOverrides(INTEGRATIONS, overrides, physical).filter((i) => {
    if (i.kind === "app") return i.appId === "storelib_reviews" && reviewsApp?.settings.enabled === true
    if (i.kind === "tracker") return !!(i.trackerId && ((tracking as Record<string, string>)[i.trackerId] || marketing.some((m) => m.provider === i.trackerId)))
    /* A Coming soon provider with a key kept from before is not installed: it does nothing. */
    if (i.kind === "commerce" && !i.builtIn && !i.comingSoon) return providers.some((p) => p.provider === i.providerId && p.status !== "disconnected")
    return false
  }).map((i) => ({ id: i.id, name: i.name, logo: i.logo ?? null, needsAttention: (i.kind === "commerce" && providers.some((p) => p.provider === i.providerId && p.status === "error")) || (i.kind === "tracker" && marketing.some((m) => m.provider === i.trackerId && !!m.last_error)) }))
  return physicalJson({ installed }, 200)
}
