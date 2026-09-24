import "server-only"

import { createClient } from "@/lib/supabase/server"
import { currentUserForRequest } from "@/lib/auth/request-scope"
import type { EditorAssetRow, EditorCreator, EditorProductRow, EditorVariantRow, LoadedProduct } from "./new/editor-form"

/**
 * ===========================================================================
 *  EVERYTHING THE PRODUCT EDITOR NEEDS, IN ONE ROUND
 * ===========================================================================
 * Read on the server, as the page renders, with the creator's own client so
 * row-level security answers exactly as it did for the browser. After the
 * one auth check, the five reads go out together: the creator, the profile,
 * the product, its files and its variants. The product is matched to the
 * creator afterwards rather than filtered by a creator id the first read has
 * not returned yet, and a product that is not theirs is treated as missing,
 * files and variants dropped with it.
 */

export type EditorLoad =
  | { state: "signed-out" }
  | { state: "no-creator" }
  | { state: "missing"; creator: EditorCreator }
  | { state: "ready"; creator: EditorCreator; loaded: LoadedProduct | null }

const VARIANT_COLUMNS =
  "id, name, description, price_cents, compare_at_price_cents, max_purchases, position, pay_what_you_want, pwyw_min_price_cents, pwyw_suggested_price_cents, product_variant_files ( digital_asset_id )"

/** A product id is a uuid; anything else is not looked up. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function loadProductEditor(productId: string | null): Promise<EditorLoad> {
  const { user } = await currentUserForRequest()
  if (!user) return { state: "signed-out" }
  const supabase = await createClient()
  const id = productId && UUID.test(productId) ? productId : null

  const [creatorRes, profileRes, productRes, assetsRes, variantsRes] = await Promise.all([
    supabase.from("creators").select("id, slug, stripe_account_id, stripe_onboarding_status").eq("user_id", user.id).maybeSingle(),
    supabase.from("profiles").select("username").eq("id", user.id).maybeSingle(),
    id ? supabase.from("products").select("*").eq("id", id).maybeSingle() : Promise.resolve({ data: null }),
    id ? supabase.from("digital_assets").select("id, file_name, file_path, file_size, mime_type").eq("product_id", id) : Promise.resolve({ data: [] }),
    /* The variants table may be missing on an old database; no variants then, as before. */
    id ? supabase.from("product_variants").select(VARIANT_COLUMNS).eq("product_id", id).order("position") : Promise.resolve({ data: [] }),
  ])

  const creatorRow = creatorRes.data as { id: string; slug: string | null; stripe_account_id?: string | null; stripe_onboarding_status?: string | null } | null
  if (!creatorRow) return { state: "no-creator" }
  const creator: EditorCreator = {
    ...creatorRow,
    username: (profileRes.data as { username?: string | null } | null)?.username ?? null,
  }

  if (!productId) return { state: "ready", creator, loaded: null }
  const product = productRes.data as EditorProductRow | null
  if (!product || product.creator_id !== creator.id) return { state: "missing", creator }

  return {
    state: "ready",
    creator,
    loaded: {
      product,
      assets: ((assetsRes.data as EditorAssetRow[] | null) ?? []),
      variants: ((variantsRes.data as EditorVariantRow[] | null) ?? []),
    },
  }
}
