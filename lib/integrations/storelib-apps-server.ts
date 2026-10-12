import "server-only"

/**
 * The reads behind Storelib's own apps' states (lib/integrations/storelib-apps.ts),
 * for the caller's own store, with the loaders the settings themselves use.
 * Every read is filtered by the store's id. A read that fails, or a table a
 * database doesn't have yet, is null: that app shows no state rather than a
 * wrong one. No database error text leaves this file.
 */
import { loadLocations, loadProfiles } from "@/lib/physical/config-server"
import { checkoutReadyForCreator } from "@/lib/payments/service"
import { loadReviewsApp } from "@/lib/reviews/app-server"
import { loadCheckoutConfig } from "@/lib/store/settings-server"
import { loadOffers } from "@/lib/offers/offers-server"
import { readChallengeCounts } from "@/lib/home/progress-server"
import { LIVE_STATUSES } from "@/lib/custom-domains/store"
import { WEBSITE_LIVE_STATUS } from "@/lib/home/progress"
import type { AppFacts } from "./storelib-apps"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

type Res = { data: unknown; error: unknown; count?: number | null }

async function read(q: PromiseLike<Res>): Promise<Res | null> {
  try {
    const r = await q
    return r.error ? null : r
  } catch {
    return null
  }
}
const countOf = (r: Res | null): number | null => (r ? Math.max(0, Number(r.count ?? 0) || 0) : null)

export async function readAppFacts(db: Db, creatorId: string, physical: boolean): Promise<{ facts: AppFacts; codeHref: string | null }> {
  const safe = <T,>(p: Promise<T>): Promise<T | null> => p.catch(() => null)
  const [paymentsReady, reviews, checkout, counts, marketing, taxes, domains, coupons, localization, installs, agentKeys, profiles, locations, offers] = await Promise.all([
    safe(checkoutReadyForCreator(creatorId) as Promise<boolean>),
    safe(loadReviewsApp(db, creatorId)),
    safe(loadCheckoutConfig(db, creatorId)),
    safe(readChallengeCounts(db, creatorId)),
    read(db.from("commerce_integrations").select("provider", { count: "exact", head: true }).eq("creator_id", creatorId).in("provider", ["klaviyo", "omnisend"]).eq("status", "connected")),
    read(db.from("commerce_tax_rates").select("id", { count: "exact", head: true }).eq("creator_id", creatorId)),
    read(db.from("custom_domains").select("id", { count: "exact", head: true }).eq("creator_id", creatorId).in("status", LIVE_STATUSES)),
    read(db.from("coupons").select("id", { count: "exact", head: true }).eq("creator_id", creatorId)),
    read(db.from("store_localization").select("languages, markets").eq("creator_id", creatorId).maybeSingle()),
    read(db.from("store_theme_installs").select("id, status").eq("creator_id", creatorId).limit(50)),
    read(db.from("theme_agent_tokens").select("id", { count: "exact", head: true }).eq("creator_id", creatorId).is("revoked_at", null)),
    physical ? safe(loadProfiles(db, creatorId)) : Promise.resolve(null),
    physical ? safe(loadLocations(db, creatorId)) : Promise.resolve(null),
    physical ? safe(loadOffers(db, creatorId, { activeOnly: true })) : Promise.resolve(null),
  ])

  /* GitHub: a repository linked to one of the store's websites. */
  const installRows = ((installs?.data ?? []) as { id: string; status: string | null }[])
  let github: number | null = null
  if (installs) github = installRows.length === 0 ? 0 : countOf(await read(db.from("theme_github_links").select("install_id", { count: "exact", head: true }).in("install_id", installRows.map((i) => i.id))))
  const agents = countOf(agentKeys)
  const codeConnected = github === null && agents === null ? null : (github ?? 0) > 0 || (agents ?? 0) > 0
  /* Where it is set up: the live website's Connections, else the first website's, else the website builder. */
  const site = installRows.find((i) => i.status === WEBSITE_LIVE_STATUS) ?? installRows[0]
  const codeHref = site ? `/website-builder/editor/${encodeURIComponent(site.id)}?settings=connections` : null

  const loc = (localization?.data ?? null) as { languages?: unknown; markets?: unknown } | null
  const moreMarkets = localization
    ? (Array.isArray(loc?.languages) && loc!.languages.length > 0) || (Array.isArray(loc?.markets) && (loc!.markets as { primary?: boolean; active?: boolean }[]).some((m) => m && !m.primary && m.active !== false))
    : null

  const marketingConnected = countOf(marketing)
  const emailMarketing = counts === null && marketingConnected === null ? null : (counts?.automationsOn ?? 0) > 0 || (counts?.emailsSent ?? 0) > 0 || (marketingConnected ?? 0) > 0

  const facts: AppFacts = {
    paymentsReady: typeof paymentsReady === "boolean" ? paymentsReady : null,
    shippingRates: profiles ? profiles.reduce((n, p) => n + p.zones.reduce((m, z) => m + z.rates.filter((r) => r.active).length, 0), 0) : null,
    pickupOrLocal: locations ? locations.filter((l) => l.active && (l.pickupEnabled || l.localDelivery?.enabled)).length : null,
    taxRegions: countOf(taxes),
    reviewsOn: reviews ? reviews.settings.enabled === true : null,
    emailMarketing,
    domainLive: domains ? (countOf(domains) ?? 0) > 0 : null,
    coupons: countOf(coupons),
    activeOffers: offers && offers.ready ? offers.offers.length : null,
    abandonedRecovery: checkout ? checkout.abandonedRecovery : null,
    requireAccount: checkout ? checkout.requireAccount : null,
    moreMarkets,
    codeConnected,
  }
  return { facts, codeHref }
}
