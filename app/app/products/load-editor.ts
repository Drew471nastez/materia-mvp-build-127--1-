import "server-only"

import { createClient } from "@/lib/supabase/server"
import { creatorForRequest, currentUserForRequest, profileForRequest } from "@/lib/auth/request-scope"
import type { EditorAssetRow, EditorCreator, EditorProductRow, EditorVariantRow, LoadedProduct } from "./new/editor-form"
import { paymentsReadyFrom } from "@/lib/home/progress"
import { providerPaymentsReady } from "@/lib/payments/readiness"

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
 *
 * THE PRODUCT DOES NOT WAIT FOR THE AUTH CHECK. Its three reads (the row,
 * its files, its variants) need no user id: row-level security reads the
 * session from the request's own cookie. So they go out at the same moment
 * as the auth check rather than after it, and only the creator and the
 * profile, which are looked up by the user's id, wait for it. Nothing read is
 * used before the check has said who this is, and for a signed out request
 * all of it is dropped. The page then costs one auth round trip plus one
 * read, not an auth round trip and then all the reads.
 *
 * TIMED. Each phase is measured, and a load slower than SLOW_LOAD_MS says so
 * in the function's log with where the time went ("[editor-load] 5120ms:
 * auth 4870, reads 250"), so a slow open can be read off production rather
 * than guessed at.
 */

export type EditorLoad =
  | { state: "signed-out" }
  | { state: "no-creator" }
  | { state: "missing"; creator: EditorCreator }
  | { state: "ready"; creator: EditorCreator; loaded: LoadedProduct | null }

const VARIANT_COLUMNS =
  "id, name, description, price_cents, compare_at_price_cents, max_purchases, position, pay_what_you_want, pwyw_min_price_cents, pwyw_suggested_price_cents, product_variant_files ( digital_asset_id )"
/* The variants' columns from before compare at and a purchase limit (supabase/sql/run-now/35), read when the full set is refused. */
const VARIANT_COLUMNS_BASIC =
  "id, name, description, price_cents, position, pay_what_you_want, pwyw_min_price_cents, pwyw_suggested_price_cents, product_variant_files ( digital_asset_id )"

/*
  THE PRODUCT'S COLUMNS, NAMED. `*` also brought the row's search index (a
  tsvector as long as the description again), its counters and every column
  the editor never shows, into the page's payload, where the editor's first
  frame waited for them. These are the fields the form reads (EditorProductRow);
  a database that refuses one (a column not there yet) is read with `*` as
  before, so the page never fails where it used to open.
*/
const PRODUCT_COLUMNS =
  "id, creator_id, title, description, price_cents, compare_at_cents, slug, type, status, show_sales_badge, refund_policy_enabled, refund_policy_type, seo_title, seo_description, call_to_action, category, pay_what_you_want, pwyw_min_price_cents, pwyw_suggested_price_cents, video_url, thumbnail_url, gallery_urls, whats_included, faqs, custom_fields"

/** Postgres and PostgREST's "no such column": 42703, or PGRST204 from the schema cache. */
const missingColumn = (error: { code?: string; message?: string } | null | undefined) =>
  !!error && (error.code === "42703" || error.code === "PGRST204" || /column .* does not exist/i.test(error.message ?? ""))

/** A load slower than this is written to the log with its phases. */
const SLOW_LOAD_MS = 800

/** A product id is a uuid; anything else is not looked up. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function loadProductEditor(productId: string | null): Promise<EditorLoad> {
  const began = performance.now()
  const id = productId && UUID.test(productId) ? productId : null
  const supabase = await createClient()

  /* The product's reads, started now, beside the auth check (see THE PRODUCT DOES NOT WAIT, above). */
  const productReads = Promise.all([
    id ? supabase.from("products").select(PRODUCT_COLUMNS).eq("id", id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    id ? supabase.from("digital_assets").select("id, file_name, file_path, file_size, mime_type, scan_status").eq("product_id", id) : Promise.resolve({ data: [] }),
    /* The variants table may be missing on an old database; no variants then, as before. */
    id ? supabase.from("product_variants").select(VARIANT_COLUMNS).eq("product_id", id).order("position") : Promise.resolve({ data: [], error: null }),
  ])
  /* Never an unhandled rejection when the check below returns first. */
  productReads.catch(() => {})

  const { user } = await currentUserForRequest()
  const authed = performance.now()
  if (!user) return { state: "signed-out" }

  /* The creator and profiles rows through the request's own copies (lib/auth/request-scope): on a full load the /app layout has already asked for both, and the editor now shares those answers instead of asking again. */
  const [creatorRow, profileRow, [productRes, assetsRes, variantsRes]] = await Promise.all([
    creatorForRequest(user.id),
    profileForRequest(user.id),
    productReads,
  ])

  /* The two fallbacks, only when the first read was refused for a column, and together. */
  const [productRow, variantsRead] = await Promise.all([
    id && missingColumn(productRes.error) ? supabase.from("products").select("*").eq("id", id).maybeSingle() : productRes,
    id && missingColumn(variantsRes.error)
      ? supabase.from("product_variants").select(VARIANT_COLUMNS_BASIC).eq("product_id", id).order("position")
      : variantsRes,
  ])

  const took = performance.now() - began
  if (took > SLOW_LOAD_MS) {
    console.warn(`[editor-load] ${Math.round(took)}ms: auth ${Math.round(authed - began)}, reads ${Math.round(performance.now() - authed)}${id ? "" : " (new)"}`)
  }

  if (!creatorRow) return { state: "no-creator" }
  /* Only what the editor reads goes to the browser, not the whole shell row. */
  const creator: EditorCreator = {
    id: creatorRow.id,
    slug: creatorRow.slug,
    stripe_account_id: creatorRow.stripe_account_id,
    stripe_onboarding_status: creatorRow.stripe_onboarding_status,
    username: profileRow?.username ?? null,
    /* The editor's status line says when a live paid product cannot be bought yet. */
    payments_ready: await providerPaymentsReady(creatorRow.id, paymentsReadyFrom(creatorRow)),
  }

  if (!productId) return { state: "ready", creator, loaded: null }
  const product = productRow.data as EditorProductRow | null
  if (!product || product.creator_id !== creator.id) return { state: "missing", creator }

  return {
    state: "ready",
    creator,
    loaded: {
      product,
      assets: ((assetsRes.data as EditorAssetRow[] | null) ?? []),
      variants: ((variantsRead.data as EditorVariantRow[] | null) ?? []),
      /* A table that is not there is no variants, as before; any other failure is "not read", and a save leaves the saved ones alone. */
      variantsUnread: !!variantsRead.error && variantsRead.error.code !== "42P01" && variantsRead.error.code !== "PGRST205",
    },
  }
}
