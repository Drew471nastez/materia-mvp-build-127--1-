import type * as React from "react"
import Script from "next/script"
import { createAdminClient } from "@/lib/supabase/admin"
import { publishedTracking } from "@/lib/store/tracking-server"
import { purchaseTags, readTracking, trackingTags } from "@/lib/store/tracking"
import type { GaItem } from "@/lib/store/ga"
import { GaRoute, type GaCheckout } from "@/components/analytics/ga-route"
import { PixelPaid } from "@/components/analytics/pixel-paid"
import { gaProductFor, storeCurrencyFor } from "@/lib/store/ga-server"

type Purchase = { id: string; valueCents: number; currency: string; quantity: number; items?: GaItem[] }
type Product = { item: GaItem; currency: string | null }

/**
 * The store's analytics and ad pixels (Settings › Integrations), on each
 * published page of its website and on every page of the store on
 * storelib.com (the creator page, its products, the OnePage, checkout and
 * the thank you page). Previews and cover renders never reach it, so the
 * store's own testing never counts as a visit. Only each service's own tag
 * with a checked ID (lib/store/tracking.ts).
 *
 * Each tag's id names the IDs it carries, so a visitor who goes from one
 * store's page to another's without a full load gets the second store's
 * tag too (a shared id would be taken as already loaded). GaRoute counts
 * the pages after the first and turns the IDs off off the store's pages.
 *
 * `asks`: the page shows Storelib's cookie banner (lib/store/ga.ts
 * gaConsentJs). `product`: the product the page is about, `checkout` what a
 * checkout holds, for GA's ecommerce events.
 */
async function StoreTrackingTags({ creatorId, purchase, product, productSlug, productId, checkout, asks = true }: { creatorId: string | null | undefined; purchase?: Purchase | null; product?: Product | null; productSlug?: string | null; productId?: string | null; checkout?: GaCheckout | null; asks?: boolean }) {
  if (!creatorId) return null
  const stored = await publishedTracking(createAdminClient(), creatorId)
  /* On the order page just after paying, the purchase too (lib/store/tracking.ts purchaseTags), after the base tags. */
  const tags: { key: string; src?: string; inline?: string }[] = [...trackingTags(stored, { creatorId, asks }), ...(purchase ? purchaseTags(stored, purchase) : [])]
  if (tags.length === 0) return null
  const t = readTracking(stored)
  const gtagIds = [t.ga4, t.google_ads].filter((v): v is string => !!v)
  const tagged = `${t.ga4 ?? ""}${t.google_ads ?? ""}${t.gtm ?? ""}`.toLowerCase() || "store"
  /* A product page names its product by its address: read only when Google's tag is on, for view_item's name and price. */
  const shown = product ?? (gtagIds.length && (productSlug || productId) ? await gaProductFor(creatorId, productSlug ?? null, productId ?? null) : null)
  return (
    <>
      {tags.map((x) =>
        x.src ? (
          <Script key={x.key} id={`storelib-${x.key}-${tagged}`} src={x.src} strategy="afterInteractive" />
        ) : (
          <Script key={x.key} id={`storelib-${x.key}-${x.key === "purchase" ? purchase?.id ?? "order" : tagged}`} strategy="afterInteractive">
            {x.inline}
          </Script>
        ),
      )}
      {/* Round 41: a payment on the page (the OnePage's checkout window, Storelib's checkout) told to every pixel, not only Google (components/analytics/pixel-paid). */}
      {t.meta_pixel || t.tiktok_pixel || t.pinterest_tag || t.gtm || gtagIds.length ? <PixelPaid currency={checkout?.currency ?? null} /> : null}
      {gtagIds.length ? <GaRoute ids={gtagIds} product={shown} checkout={checkout ? { ...checkout, currency: checkout.currency ?? (await storeCurrencyFor(creatorId)) } : null} /> : null}
    </>
  )
}

/* An async server component, typed as a plain one so a page can place it in JSX (the repo's TypeScript has no async component types). */
export const StoreTracking = StoreTrackingTags as unknown as (props: { creatorId: string | null | undefined; purchase?: Purchase | null; product?: Product | null; productSlug?: string | null; productId?: string | null; checkout?: GaCheckout | null; asks?: boolean }) => React.ReactElement | null
