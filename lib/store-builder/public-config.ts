import "server-only"

/**
 * ===========================================================================
 *  A CREATOR'S PUBLISHED PAGE CONFIG, READ BY THE SERVER FOR EVERY VISITOR
 * ===========================================================================
 * Round 48, finding R48-6 (docs/reliability/SECURITY.md). The public pages
 * read `store_builder_configs` and `product_page_configs` with the anon key,
 * which works only while the tables let the anon role read them. That key is
 * in every page Storelib serves, so anybody holding it could ask PostgREST
 * for every row directly: drafts nobody has published, and the contact
 * address in published_config.headerSettings.contactEmail, which round 45
 * took out of the page payload.
 *
 * So these reads moved to the server's service role, which needs no policy,
 * and the tables can then be closed to the anon role (run-now part 354,
 * owner only plus the service role). Because the service role sees every
 * row and column, what it hands back is held narrow here, in one place:
 *
 *   - ONE COLUMN: `published_config`, filtered by the row's identifiers
 *     (creator_id with page_type, or with product_id). Never draft_config;
 *   - NOTHING PRIVATE IN IT: the contact address is taken out before the
 *     value leaves this file (withoutPrivateConfig), so the shared cache
 *     (lib/commerce/product-page-cache.ts) holds no address either;
 *   - AN EMPTY CONFIG READS AS NO ROW, which is what the anon policy
 *     answered (published_config IS NOT NULL AND <> '{}').
 *
 * The one page that may use the typed address, the creator page, asks for
 * it on its own (loadTypedContactEmail) and only on the server: it decides
 * whether a buyer sees the Contact button (lib/commerce/contact-email.ts),
 * and the owner's own About form starts from it.
 *
 * Owner reads (the editor, the dashboard, Settings) do not come here: they
 * keep the owner's own session under the owner policies, or the
 * ownership-checked service role pattern (lib/team/creator-page.ts).
 */
import { cache } from "react"

import { createAdminClient } from "@/lib/supabase/admin"

/** The only column a public read selects. */
export const PUBLIC_CONFIG_COLUMNS = "published_config" as const

/** Fields of a published config that never leave the server with it. */
export const PRIVATE_CONFIG_FIELDS = ["contactEmail"] as const

type Json = Record<string, unknown>

function isObject(v: unknown): v is Json {
  return !!v && typeof v === "object" && !Array.isArray(v)
}

function withoutPrivateFields(settings: unknown): unknown {
  if (!isObject(settings)) return settings
  if (!PRIVATE_CONFIG_FIELDS.some((k) => k in settings)) return settings
  const rest: Json = { ...settings }
  for (const k of PRIVATE_CONFIG_FIELDS) delete rest[k]
  return rest
}

/**
 * The published config as any visitor may have it: the header settings and
 * every section's settings without a contact address. A new object; the
 * value handed in is not changed.
 */
export function withoutPrivateConfig<T>(config: T): T {
  if (!isObject(config)) return config
  const out: Json = { ...config }
  if ("headerSettings" in out) out.headerSettings = withoutPrivateFields(out.headerSettings)
  if (Array.isArray(out.sections)) {
    out.sections = out.sections.map((s) => (isObject(s) && "settings" in s ? { ...s, settings: withoutPrivateFields(s.settings) } : s))
  }
  return out as T
}

/** A row as the public loaders hand it on: its published config, cleaned, or null for nothing published. */
export type PublicConfigRow = { published_config: Json } | null

function publicRow(data: unknown): PublicConfigRow {
  const config = isObject(data) ? data.published_config : null
  if (!isObject(config) || Object.keys(config).length === 0) return null
  return { published_config: withoutPrivateConfig(config) }
}

/**
 * The shop ("shop") or default product template ("product") a creator
 * published. A failed read THROWS, so the shared cache never holds a failure
 * as "nothing published" (the callers read again on a fresh request).
 */
export async function readPublishedStoreConfig(creatorId: string, pageType: string): Promise<PublicConfigRow> {
  const { data } = await createAdminClient()
    .from("store_builder_configs")
    .select(PUBLIC_CONFIG_COLUMNS)
    .eq("creator_id", creatorId)
    .eq("page_type", pageType)
    .maybeSingle()
    .throwOnError()
  return publicRow(data)
}

/** One product's own published override. Throws on a failed read, as above. */
export async function readPublishedProductPageConfig(creatorId: string, productId: string): Promise<PublicConfigRow> {
  const { data } = await createAdminClient()
    .from("product_page_configs")
    .select(PUBLIC_CONFIG_COLUMNS)
    .eq("creator_id", creatorId)
    .eq("product_id", productId)
    .maybeSingle()
    .throwOnError()
  return publicRow(data)
}

/**
 * The contact address the creator typed in About (published header
 * settings), for the server's own decisions only: never cached across
 * visitors, never put in a page that is not the owner's own form. One path
 * of the config, not the config. Null when none, or when the read failed.
 */
export const loadTypedContactEmail = cache(async (creatorId: string): Promise<string | null> => {
  try {
    const { data } = await createAdminClient()
      .from("store_builder_configs")
      .select("contact:published_config->headerSettings->>contactEmail")
      .eq("creator_id", creatorId)
      .eq("page_type", "shop")
      .maybeSingle()
    const typed = (data as { contact?: unknown } | null)?.contact
    return typeof typed === "string" && typed.trim() ? typed : null
  } catch {
    return null
  }
})
