import "server-only"
/**
 * Two facts about the install the Blog screen is opened from: which page keys
 * the Blog and Post templates have on it (an imported theme's "blog", a
 * native site's "blogs"; both "article"), and the site's own address, where
 * View and Preview open.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { compatOf } from "@/lib/storelib-theme/compat/install"
import { siteOrigin } from "@/lib/website-builder/site-seo-data"
import type { BlogTemplateKeys } from "./types"
import { blogTemplateKeys } from "./urls"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>

/** The template keys for this install. A read that fails is a native site's, which is what most are. */
export async function templatesFor(db: Db, installId: string): Promise<BlogTemplateKeys> {
  const { data } = await db.from("store_theme_settings").select("settings, draft_settings").eq("install_id", installId).maybeSingle()
  const row = data as { settings?: unknown; draft_settings?: unknown } | null
  return blogTemplateKeys(!!compatOf(row?.draft_settings ?? row?.settings))
}

/** https://<the site's domain or name>, as search engines see it (siteOrigin). */
export async function siteLiveBase(db: Db, creatorId: string): Promise<string> {
  const { data } = await db.from("creators").select("username, slug").eq("id", creatorId).maybeSingle()
  const row = data as { username?: string | null; slug?: string | null } | null
  return siteOrigin(creatorId, String(row?.username || row?.slug || "")).catch(() => "")
}
