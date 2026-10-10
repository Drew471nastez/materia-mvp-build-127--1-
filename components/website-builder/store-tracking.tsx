import type * as React from "react"
import Script from "next/script"
import { createAdminClient } from "@/lib/supabase/admin"
import { publishedTracking } from "@/lib/store/tracking-server"
import { purchaseTags, trackingTags } from "@/lib/store/tracking"

/**
 * The store's analytics and ad pixels (Settings › Integrations), on each
 * published page of its website, beside SiteVitals. Previews and cover
 * renders never reach it, so the store's own testing never counts as a
 * visit. Only each service's own tag with a checked ID (lib/store/tracking.ts).
 */
async function StoreTrackingTags({ creatorId, purchase }: { creatorId: string | null | undefined; purchase?: { id: string; valueCents: number; currency: string; quantity: number } | null }) {
  if (!creatorId) return null
  const stored = await publishedTracking(createAdminClient(), creatorId)
  /* On the order page just after paying, the purchase too (lib/store/tracking.ts purchaseTags), after the base tags. */
  const tags: { key: string; src?: string; inline?: string }[] = [...trackingTags(stored), ...(purchase ? purchaseTags(stored, purchase) : [])]
  if (tags.length === 0) return null
  return (
    <>
      {tags.map((t) =>
        t.src ? <Script key={t.key} id={`storelib-${t.key}`} src={t.src} strategy="afterInteractive" /> : <Script key={t.key} id={`storelib-${t.key}`} strategy="afterInteractive">{t.inline}</Script>,
      )}
    </>
  )
}

/* An async server component, typed as a plain one so a page can place it in JSX (the repo's TypeScript has no async component types). */
export const StoreTracking = StoreTrackingTags as unknown as (props: { creatorId: string | null | undefined; purchase?: { id: string; valueCents: number; currency: string; quantity: number } | null }) => React.ReactElement | null
