import { NextResponse } from "next/server"
import { currentCreatorId } from "@/lib/creators/current"
import { IntegrationsClient } from "./integrations-client"
import type { Metadata } from "next"
import { getServerTt } from "@/lib/i18n/server"
import { noStorePage } from "@/lib/team/server"
import { shopCaller } from "@/lib/physical/auth"
import { integrationPopularity } from "@/lib/integrations/popularity-server"
import { cachedCatalogOverrides } from "@/lib/integrations/overrides-server"
import { loadTracking } from "@/lib/store/tracking-server"
import { loadMarketing } from "@/lib/integrations/marketing/sync-server"
import type { DirectoryInitial } from "@/components/app/settings/integrations-directory"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return { title: tt("Integrations") }
}

/** A read that takes longer than this is left to the browser, as before: the page never waits on it. */
const WAIT_MS = 1200

function bounded<T>(work: Promise<T>): Promise<T | null> {
  return Promise.race([work.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), WAIT_MS))])
}

/**
 * THE ORDER IS THERE ON THE FIRST PAINT (round 41, the owner: "the
 * integrations tabs flash and reorder randomly. They should just be
 * there"). The cards' order hangs on how much each is used across Storelib
 * and on /admin's overrides (their order, a hidden or added one), and the
 * pills and the Installed count on what this store has connected. All four
 * were read by the browser after the first paint, so the page drew the
 * catalog's order and then moved: cards jumped, pills came and went. Now
 * they are read here, with the page, and the directory draws from them on
 * its first frame (components/app/settings/integrations-directory `initial`).
 */
async function initialFor(): Promise<DirectoryInitial | null> {
  const c = await shopCaller().catch(() => null)
  if (!c || c instanceof NextResponse) return null
  const [scores, overrides, tracking, marketing] = await Promise.all([
    bounded(integrationPopularity(c.db)),
    bounded(cachedCatalogOverrides()),
    bounded(loadTracking(c.db, c.creatorId)),
    bounded(loadMarketing(c.db, c.creatorId)),
  ])
  return {
    scores: scores ?? null,
    overrides: overrides ?? null,
    tracking: tracking?.tracking ?? null,
    trackingReady: tracking?.ready ?? null,
    marketing: (marketing as DirectoryInitial["marketing"]) ?? null,
  }
}

/**
 * /app/integrations: the store's integrations on a page of their own, as
 * Shopify keeps its apps: the ones connected, to manage, then every one
 * there is to add, each opening its own page (?integration=<id>, the link
 * each installed one has in the sidebar). The same directory and pages as
 * Settings › Integrations (components/app/settings/integrations-directory.tsx).
 */
export default async function IntegrationsPage() {
  const creatorId = await currentCreatorId()
  if (!creatorId) return noStorePage("/app/integrations")
  return <IntegrationsClient initial={await initialFor()} />
}
