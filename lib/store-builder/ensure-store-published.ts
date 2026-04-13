import { createAdminClient } from "@/lib/supabase/admin"
import { defaultShopPageConfig } from "./defaults"

/**
 * Ensures a store builder config exists and is published for the given creator.
 *
 * Called from:
 *  - /api/onboarding/finalize (after creator record is created)
 *  - product save flow (after first product is published)
 *
 * Uses the admin client (service-role key) so RLS is bypassed.
 * This is server-only — never import in client components.
 *
 * Returns true if a config was created/published, false if one already existed.
 */
export async function ensureStorePublished(creatorId: string): Promise<boolean> {
  const admin = createAdminClient()

  // Check if a shop config already exists
  const { data: existing } = await admin
    .from("store_builder_configs")
    .select("id, published_at")
    .eq("creator_id", creatorId)
    .eq("page_type", "shop")
    .maybeSingle()

  if (existing?.published_at) {
    // Already published — nothing to do
    return false
  }

  const now = new Date().toISOString()

  if (existing) {
    // Config row exists but was never published — read its draft_config
    // (user may have started editing) and publish that, or fall back to defaults.
    const { data: fullRow } = await admin
      .from("store_builder_configs")
      .select("draft_config")
      .eq("id", existing.id)
      .single()

    const configToPublish = fullRow?.draft_config ?? defaultShopPageConfig

    const { error } = await admin
      .from("store_builder_configs")
      .update({
        published_config: configToPublish,
        published_at: now,
        updated_at: now,
      })
      .eq("id", existing.id)

    if (error) {
      console.error("[ensure-store-published] update error:", error)
    }
    return !error
  }

  // No config at all — create one with defaults and publish immediately
  const { error } = await admin
    .from("store_builder_configs")
    .insert({
      creator_id: creatorId,
      page_type: "shop",
      draft_config: defaultShopPageConfig,
      published_config: defaultShopPageConfig,
      published_at: now,
      updated_at: now,
    })

  if (error) {
    // Could be a race condition (duplicate key) — that's fine, means another
    // request already created it.
    if (error.code !== "23505") {
      console.error("[ensure-store-published] insert error:", error)
    }
    return false
  }

  return true
}
