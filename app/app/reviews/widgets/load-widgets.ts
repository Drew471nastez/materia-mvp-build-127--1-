import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { creatorForRequest, currentUserForRequest } from "@/lib/auth/request-scope"
import { loadReviewsApp } from "@/lib/reviews/app-server"
import { canvasReviews } from "@/lib/reviews/storefront-server"
import { listPresets } from "@/lib/reviews/widget-presets-server"
import { compatOf } from "@/lib/storelib-theme/compat/install"
import type { StorefrontReviews } from "@/lib/reviews/storefront"
import type { WidgetPreset } from "@/lib/reviews/widgets"

/**
 * ===========================================================================
 *  REVIEWS › WIDGETS: WHAT THE PAGE IS DRAWN FROM
 * ===========================================================================
 * Everything a preview needs to be the section as the website would draw it:
 *
 *   the reviews     the store's published ones, exactly as the builder's
 *                   canvas reads them (lib/reviews/storefront-server.ts
 *                   canvasReviews): real when there are any, otherwise the
 *                   canvas's sample reviews, marked `sample`, which the page
 *                   says out loud. A live page is never handed those.
 *   a product       the one with the most reviews, so a widget set to "this
 *                   page" shows a product page's own reviews and summary
 *   the website     the live one, else the first in the library: its theme
 *                   settings (colours, type, corners) and whether it is an
 *                   imported theme, which takes only the two widgets it has
 *   the presets     run-now part 190; `ready: false` before it runs
 *
 * Read with the service role, for the creator the /app layout resolved.
 */
export interface WidgetsPageData {
  state: "ok"
  reviews: StorefrontReviews
  appEnabled: boolean
  installId: string | null
  installName: string | null
  compat: boolean
  theme: Record<string, unknown>
  presets: { ready: boolean; list: WidgetPreset[] }
}

export async function loadWidgetsPage(): Promise<WidgetsPageData | { state: "signed-out" } | { state: "no-creator" }> {
  const { user } = await currentUserForRequest()
  if (!user) return { state: "signed-out" }
  const creator = await creatorForRequest(user.id)
  if (!creator) return { state: "no-creator" }
  const db = createAdminClient()

  const installs = db
    .from("store_theme_installs")
    .select("id, name, status, sort_order, store_theme_settings ( * )")
    .eq("creator_id", creator.id)
    .order("sort_order", { ascending: true })
    .limit(20)
    .then((r: { data: unknown }) => (r.data ?? []) as { id: string; name?: string | null; status?: string | null; store_theme_settings?: Record<string, unknown> | Record<string, unknown>[] | null }[], () => [])

  /* The product with the most published reviews on the website, for the widgets that show "this page". */
  const topProduct = db
    .from("reviews")
    .select("product_id")
    .eq("creator_id", creator.id)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(200)
    .then(async (r: { data: { product_id: string }[] | null }) => {
      const counts = new Map<string, number>()
      for (const row of r.data ?? []) counts.set(row.product_id, (counts.get(row.product_id) ?? 0) + 1)
      const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
      const q = db.from("products").select("id, title").eq("creator_id", creator.id)
      const { data } = best ? await q.eq("id", best).maybeSingle() : await q.eq("status", "published").order("created_at", { ascending: false }).limit(1).maybeSingle()
      return data ? { id: String(data.id), title: (data.title as string | null) ?? null } : null
    }, () => null)

  const [rows, product, app, presets] = await Promise.all([installs, topProduct, loadReviewsApp(db, creator.id).catch(() => null), listPresets(db, creator.id).catch(() => ({ ready: false, presets: [] }))])
  const reviews = await canvasReviews(db, creator.id, product)
  const live = rows.find((r) => r.status === "published") ?? rows[0] ?? null
  const settingsRow = live ? (Array.isArray(live.store_theme_settings) ? live.store_theme_settings[0] : live.store_theme_settings) ?? null : null
  const theme = ((settingsRow?.draft_settings ?? settingsRow?.settings ?? {}) as Record<string, unknown>) || {}
  return {
    state: "ok",
    reviews,
    appEnabled: app?.settings.enabled === true,
    installId: live?.id ?? null,
    installName: live?.name ?? null,
    compat: !!compatOf(settingsRow?.draft_settings ?? settingsRow?.settings),
    theme: theme && typeof theme === "object" && !Array.isArray(theme) ? theme : {},
    presets: { ready: presets.ready, list: presets.presets },
  }
}
