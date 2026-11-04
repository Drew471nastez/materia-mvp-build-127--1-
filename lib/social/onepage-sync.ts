/**
 * ===========================================================================
 *  ONE SET OF SOCIAL LINKS FOR THE CREATOR PAGE AND THE ONEPAGE (r51)
 * ===========================================================================
 * The same Instagram was typed twice: once in Edit profile on the creator
 * page (store_builder_configs, headerSettings.socialLinks, as
 * `{ enabled, url }`) and once in the OnePage editor (onepages.social_links
 * and published_social_links, as plain URLs, plus the old instagram, tiktok
 * and youtube columns). Nothing joined them, so a creator who changed one
 * had two pages saying different things.
 *
 * Moving both onto one column would mean rewriting every reader of either,
 * and a page caught between two shapes is how data is lost. So both stores
 * stay as they are and a save on one carries ITS CHANGES to the other:
 *
 *   only the platforms the save actually changed travel, compared with what
 *   that page had before the save. A link that was not touched is never
 *   copied over the other page's, so a newer value there is never replaced
 *   by an older one from here, and a platform only one page offers (the
 *   OnePage's website, email, WhatsApp and the rest) is never touched.
 *
 * Creator page to OnePage: Edit profile's save (app/api/creator-profile).
 * Both the OnePage's draft and its live copy take the change, since the
 * creator page's save is live at once too. OnePage to creator page: the
 * OnePage's publish (app/api/onepage/publish), which is what each OnePage
 * save does; both of the creator page's configs take it.
 *
 * A failure here is logged and never fails the save that caused it: the
 * page the creator was editing has saved.
 */
import { SOCIAL_PLATFORM_KEYS, type SocialPlatformKey } from "@/lib/social/platforms"

/** The platforms both pages have. Every creator page platform is a OnePage platform. */
export const SHARED_SOCIAL_KEYS: readonly SocialPlatformKey[] = SOCIAL_PLATFORM_KEYS

/** The OnePage's own columns from before social_links, kept in step as the OnePage page does. */
const LEGACY_COLUMNS = ["instagram", "tiktok", "youtube"] as const

type Db = {
  from: (table: string) => any // eslint-disable-line @typescript-eslint/no-explicit-any
}

const clean = (v: unknown): string => (typeof v === "string" ? v.trim() : "")

/** A creator page's links as plain URLs, "" for none. Disabled entries are none, as the page draws them. */
export function creatorPageLinks(raw: unknown): Record<string, string> {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, { enabled?: boolean; url?: string } | null | undefined>
  const out: Record<string, string> = {}
  for (const key of SHARED_SOCIAL_KEYS) {
    const entry = src[key]
    out[key] = entry && entry.enabled !== false ? clean(entry.url) : ""
  }
  return out
}

/** A OnePage's links as plain URLs, "" for none. */
export function onePageLinks(raw: unknown): Record<string, string> {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const out: Record<string, string> = {}
  for (const key of SHARED_SOCIAL_KEYS) out[key] = clean(src[key])
  return out
}

/** The platforms whose link differs between two readings, with the new link ("" for removed). */
export function changedLinks(before: Record<string, string>, after: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const key of SHARED_SOCIAL_KEYS) {
    if ((before[key] || "") !== (after[key] || "")) out[key] = after[key] || ""
  }
  return out
}

/** A OnePage's social_links with the changes laid over: a removed link is null, as the OnePage stores it. */
export function applyToOnePage(links: unknown, changes: Record<string, string>): Record<string, unknown> {
  const next = { ...((links && typeof links === "object" ? links : {}) as Record<string, unknown>) }
  for (const [key, url] of Object.entries(changes)) next[key] = url || null
  return next
}

/** A creator page's socialLinks with the changes laid over, in its `{ enabled, url }` shape. */
export function applyToCreatorPage(links: unknown, changes: Record<string, string>): Record<string, { enabled: boolean; url: string }> {
  const next = { ...((links && typeof links === "object" ? links : {}) as Record<string, { enabled: boolean; url: string }>) }
  for (const [key, url] of Object.entries(changes)) next[key] = url ? { enabled: true, url } : { enabled: false, url: "" }
  return next
}

/** Edit profile saved: its changed platforms go to the owner's OnePage, draft and live copy. */
export async function syncCreatorLinksToOnePage(db: Db, ownerId: string, changes: Record<string, string>): Promise<boolean> {
  if (!ownerId || Object.keys(changes).length === 0) return false
  try {
    const { data: row, error } = await db
      .from("onepages")
      .select("id, social_links, published_social_links")
      .eq("owner_id", ownerId)
      .maybeSingle()
    if (error || !row) return false
    const update: Record<string, unknown> = { social_links: applyToOnePage(row.social_links, changes) }
    /* A OnePage that was never published has no live copy to change. */
    if (row.published_social_links && typeof row.published_social_links === "object") {
      update.published_social_links = applyToOnePage(row.published_social_links, changes)
    }
    for (const col of LEGACY_COLUMNS) if (col in changes) update[col] = changes[col] || null
    const { error: writeError } = await db.from("onepages").update(update).eq("id", row.id)
    if (writeError) {
      console.error("[social-sync] onepage update failed", writeError.message)
      return false
    }
    return true
  } catch (e) {
    console.error("[social-sync] onepage sync failed", e instanceof Error ? e.message : e)
    return false
  }
}

/** The OnePage published: its changed platforms go to the owner's creator page, both configs. */
export async function syncOnePageLinksToCreatorPage(db: Db, ownerId: string, changes: Record<string, string>): Promise<boolean> {
  if (!ownerId || Object.keys(changes).length === 0) return false
  try {
    const { data: creator } = await db.from("creators").select("id").eq("user_id", ownerId).maybeSingle()
    if (!creator?.id) return false
    const { data: config, error } = await db
      .from("store_builder_configs")
      .select("id, draft_config, published_config")
      .eq("creator_id", creator.id)
      .eq("page_type", "shop")
      .maybeSingle()
    if (error || !config) return false
    const merge = (raw: unknown) => {
      if (!raw || typeof raw !== "object") return raw
      const cfg = raw as { headerSettings?: Record<string, unknown> }
      const header = { ...(cfg.headerSettings || {}) }
      header.socialLinks = applyToCreatorPage(header.socialLinks, changes)
      return { ...cfg, headerSettings: header }
    }
    const { error: writeError } = await db
      .from("store_builder_configs")
      .update({ draft_config: merge(config.draft_config), published_config: merge(config.published_config) })
      .eq("id", config.id)
    if (writeError) {
      console.error("[social-sync] creator page update failed", writeError.message)
      return false
    }
    return true
  } catch (e) {
    console.error("[social-sync] creator page sync failed", e instanceof Error ? e.message : e)
    return false
  }
}
