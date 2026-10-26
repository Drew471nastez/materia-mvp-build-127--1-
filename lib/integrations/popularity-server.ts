/**
 * ===========================================================================
 *  WHICH INTEGRATIONS STORELIB'S STORES USE MOST
 * ===========================================================================
 * The owner, round 22: "in all tab categories of integrations and in the All
 * tab, the order should be based on data on platforms like Storelib, what
 * users use the most". So the directory is ordered by how many stores have
 * each one working, counted across every store:
 *
 *   tracking IDs     store_settings.tracking: a store with an ID saved for
 *                    Google Analytics, Meta Pixel, TikTok and the rest
 *   connected ones   commerce_integrations: Printful, Printify, Klaviyo,
 *                    shipping and the rest, not disconnected
 *
 * Counts only, never a store or a person: what leaves this file is one
 * number per integration. Read at most every CACHE_MS per server, since an
 * order that moves by the minute would move cards under somebody's finger.
 *
 * And a prior (PRIOR) under the counts, from what stores on every commerce
 * platform add first: with few stores the counts are mostly noise, and a new
 * platform would open on its least used integrations. A real count outweighs
 * it as soon as it is more than a handful (PRIOR_WEIGHT).
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { INTEGRATIONS } from "@/lib/integrations/catalog"

const CACHE_MS = 6 * 60 * 60 * 1000
/** How far a store's own use counts against the prior: one store is one point, the prior's top is PRIOR.length points. */
const PRIOR_WEIGHT = 1

/** The integrations stores add most across commerce platforms, most first, by catalog id. */
const PRIOR = [
  "google-analytics",
  "meta-pixel",
  "klaviyo",
  "google-tag-manager",
  "tiktok-pixel",
  "google-ads",
  "mailchimp",
  "storelib-reviews",
  "printful",
  "printify",
  "pinterest-tag",
  "microsoft-clarity",
  "omnisend",
  "zapier",
  "shipstation",
  "aftership",
  "hotjar",
  "snapchat-pixel",
  "brevo",
  "cj-dropshipping",
  "gelato",
  "shippo",
  "easypost",
  "make",
  "reddit-pixel",
]

let kept: { at: number; scores: Record<string, number> } | null = null

/** One score per integration id: its stores, plus the prior. Higher first. */
export async function integrationPopularity(db: SupabaseClient, now = Date.now()): Promise<Record<string, number>> {
  if (kept && now - kept.at < CACHE_MS) return kept.scores
  const counts: Record<string, number> = {}
  const add = (id: string | undefined) => {
    if (id) counts[id] = (counts[id] ?? 0) + 1
  }
  const byTracker = new Map(INTEGRATIONS.filter((i) => i.kind === "tracker" && i.trackerId).map((i) => [i.trackerId as string, i.id]))
  const byProvider = new Map(INTEGRATIONS.filter((i) => i.kind === "commerce" && i.providerId).map((i) => [i.providerId as string, i.id]))
  try {
    const { data } = await db.from("store_settings").select("tracking").not("tracking", "is", null).limit(20000)
    for (const row of (data ?? []) as { tracking: Record<string, unknown> | null }[]) {
      for (const [key, value] of Object.entries(row.tracking ?? {})) if (typeof value === "string" && value.trim()) add(byTracker.get(key))
    }
  } catch {
    /* counted without them */
  }
  try {
    const { data } = await db.from("commerce_integrations").select("provider, status").neq("status", "disconnected").limit(20000)
    for (const row of (data ?? []) as { provider: string }[]) add(byProvider.get(row.provider) ?? (INTEGRATIONS.some((i) => i.id === row.provider) ? row.provider : undefined))
  } catch {
    /* counted without them */
  }
  const scores: Record<string, number> = {}
  PRIOR.forEach((id, at) => {
    scores[id] = (PRIOR.length - at) * PRIOR_WEIGHT
  })
  for (const [id, n] of Object.entries(counts)) scores[id] = (scores[id] ?? 0) + n * PRIOR.length * 0.25
  kept = { at: now, scores }
  return scores
}

/** For tests: forget what was counted. */
export function forgetIntegrationPopularity(): void {
  kept = null
}
