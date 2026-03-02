/**
 * lib/bundles.ts
 *
 * Core ZIP-bundle logic for digital products.
 *
 * Rule:
 *   file_count < 6  → no bundle, download works normally (individual files / single redirect)
 *   file_count ≥ 6  → always one ZIP, named after the product (+ variant if applicable)
 *
 * ZIPs are generated ONCE (on product save/publish) and cached in `product_bundles`.
 * Every buyer download re-uses the cached ZIP — instant downloads, zero re-zipping.
 *
 * The cache is invalidated automatically when:
 *   - files change (files_hash changes)
 *   - product/variant title changes (files_hash includes the title)
 */

import { STORAGE_BUCKET } from "@/lib/storage"
import type { createAdminClient } from "@/lib/supabase/admin"

/** Minimum number of files that triggers automatic ZIP bundling. */
export const BUNDLE_THRESHOLD = 6

type AdminClient = ReturnType<typeof createAdminClient>

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute a stable hash for a set of file IDs and a title string.
 * Used to detect when a cached bundle needs to be regenerated.
 */
export function computeFilesHash(fileIds: string[], title: string): string {
  return [...fileIds].sort().join(",") + ":" + (title || "")
}

/**
 * Convert a product/variant title into a safe ZIP filename.
 * e.g. "My Cool Product!" → "My_Cool_Product.zip"
 */
export function makeZipFileName(title: string, variantName?: string | null): string {
  const base = [title, variantName].filter(Boolean).join(" - ")
  return (
    (base || "product")
      .replace(/[^a-zA-Z0-9._\- ]/g, "_")
      .replace(/\s+/g, "_")
      .replace(/_{2,}/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 120) + ".zip"
  )
}

// ---------------------------------------------------------------------------
// Core: ensureProductBundle
// ---------------------------------------------------------------------------

export interface BundleResult {
  zipPath: string
  zipFileName: string
  fromCache: boolean
}

/**
 * Ensure a cached ZIP bundle exists for the given product (or variant).
 *
 * - Returns `null` when file_count < BUNDLE_THRESHOLD (no bundle needed).
 * - Returns cached bundle info when nothing has changed (fast path).
 * - Generates and stores a new ZIP when files or title have changed.
 *
 * @param admin       Supabase admin client (service role)
 * @param productId   Product UUID
 * @param productTitle Product title — included in ZIP filename and hash
 * @param creatorId   Creator UUID — used to build the storage path
 * @param variantId   Optional variant UUID for variant-specific bundles
 * @param variantName Optional variant name — appended to ZIP filename
 */
export async function ensureProductBundle(
  admin: AdminClient,
  productId: string,
  productTitle: string,
  creatorId: string,
  variantId?: string | null,
  variantName?: string | null,
): Promise<BundleResult | null> {
  // ── 1. Load digital assets ──────────────────────────────────────────────
  let assets: Array<{
    id: string
    file_path: string
    file_name: string
    file_size: number | null
    storage_bucket: string | null
  }>

  if (variantId) {
    // Variant-specific files (via product_variant_files junction table)
    const { data: vFiles } = await admin
      .from("product_variant_files")
      .select(
        `digital_asset_id,
         digital_assets!inner(id, file_path, file_name, file_size, storage_bucket)`,
      )
      .eq("variant_id", variantId)

    assets = ((vFiles ?? []) as any[])
      .map((vf) => vf.digital_assets)
      .filter(Boolean)
  } else {
    // All files for the product
    const { data } = await admin
      .from("digital_assets")
      .select("id, file_path, file_name, file_size, storage_bucket")
      .eq("product_id", productId)
      .eq("upload_status", "completed")
      .order("created_at", { ascending: true })

    assets = data ?? []
  }

  // ── 2. Below threshold → no bundle ─────────────────────────────────────
  if (assets.length < BUNDLE_THRESHOLD) return null

  // ── 3. Check cache ──────────────────────────────────────────────────────
  const newHash = computeFilesHash(
    assets.map((a) => a.id),
    [productTitle, variantName].filter(Boolean).join(":"),
  )

  // Query must handle NULL variant_id correctly
  let existingQuery = admin
    .from("product_bundles")
    .select("id, zip_path, zip_file_name, files_hash")
    .eq("product_id", productId)

  if (variantId) {
    existingQuery = existingQuery.eq("variant_id", variantId)
  } else {
    existingQuery = existingQuery.is("variant_id", null)
  }

  const { data: existing } = await existingQuery.maybeSingle()

  if (existing && existing.files_hash === newHash) {
    // Cache hit — nothing has changed, re-use existing bundle
    return { zipPath: existing.zip_path, zipFileName: existing.zip_file_name, fromCache: true }
  }

  // ── 4. Generate ZIP ─────────────────────────────────────────────────────
  let archiver: typeof import("archiver") | null = null
  try {
    // Use runtime require to keep archiver optional at build time.
    // This avoids Turbopack "module not found" warnings when the package
    // is not installed in a given deployment environment.
    const runtimeRequire = (0, eval)("require") as NodeRequire
    archiver = runtimeRequire("archiver")
  } catch {
    console.error("[bundles] archiver package not available — run: pnpm add archiver")
    return null
  }

  const archive = (archiver.default || archiver)("zip", { zlib: { level: 6 } })
  const chunks: Buffer[] = []

  archive.on("data", (chunk: Buffer) => chunks.push(chunk))

  let addedCount = 0
  for (const asset of assets) {
    const bucket = asset.storage_bucket || STORAGE_BUCKET
    const { data: signed } = await admin.storage
      .from(bucket)
      .createSignedUrl(asset.file_path, 300) // 5-min window to download

    if (!signed?.signedUrl) {
      console.warn(`[bundles] Could not sign URL for asset ${asset.id}`)
      continue
    }

    const res = await fetch(signed.signedUrl)
    if (!res.ok) {
      console.warn(`[bundles] Could not fetch asset ${asset.id}: HTTP ${res.status}`)
      continue
    }

    const fileBuffer = await res.arrayBuffer()
    archive.append(Buffer.from(fileBuffer), { name: asset.file_name })
    addedCount++
  }

  await archive.finalize()
  await new Promise<void>((resolve, reject) => {
    archive.on("end", resolve)
    archive.on("error", reject)
  })

  if (addedCount === 0) {
    console.error("[bundles] No files were added to the ZIP")
    return null
  }

  const zipBuffer = Buffer.concat(chunks)
  const zipFileName = makeZipFileName(productTitle, variantName)

  // Stable storage path — same key every time so upsert simply overwrites
  const zipPath = variantId
    ? `${creatorId}/bundles/${productId}_${variantId}.zip`
    : `${creatorId}/bundles/${productId}.zip`

  // ── 5. Upload ZIP to storage ─────────────────────────────────────────────
  const { error: uploadError } = await admin.storage
    .from(STORAGE_BUCKET)
    .upload(zipPath, zipBuffer, {
      contentType: "application/zip",
      cacheControl: "31536000", // 1 year
      upsert: true,
    })

  if (uploadError) {
    console.error("[bundles] ZIP upload failed:", uploadError)
    return null
  }

  // ── 6. Upsert bundle record ──────────────────────────────────────────────
  // Use delete + insert because UPSERT with nullable unique columns is fragile.
  if (variantId) {
    await admin
      .from("product_bundles")
      .delete()
      .eq("product_id", productId)
      .eq("variant_id", variantId)
  } else {
    await admin
      .from("product_bundles")
      .delete()
      .eq("product_id", productId)
      .is("variant_id", null)
  }

  await admin.from("product_bundles").insert({
    product_id: productId,
    variant_id: variantId || null,
    zip_path: zipPath,
    zip_file_name: zipFileName,
    zip_size: zipBuffer.length,
    file_count: addedCount,
    files_hash: newHash,
  })

  console.log(
    `[bundles] Generated ZIP for product=${productId}${variantId ? ` variant=${variantId}` : ""}: ${zipFileName} (${addedCount} files, ${zipBuffer.length} bytes)`,
  )

  return { zipPath, zipFileName, fromCache: false }
}

/**
 * Generate a signed download URL for a cached bundle ZIP.
 * Returns null if the bundle doesn't exist or signing fails.
 */
export async function getBundleSignedUrl(
  admin: AdminClient,
  zipPath: string,
  expiresIn = 300,
): Promise<string | null> {
  const { data } = await admin.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(zipPath, expiresIn)
  return data?.signedUrl ?? null
}
