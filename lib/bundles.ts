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

import JSZip from "jszip"
import { STORAGE_BUCKET } from "@/lib/storage"
import type { createAdminClient } from "@/lib/supabase/admin"

/** Minimum number of files that triggers automatic ZIP bundling. */
export const BUNDLE_THRESHOLD = 6

/** The most a bundle may hold, since the ZIP is assembled in memory. */
export const BUNDLE_MAX_BYTES = 400 * 1024 * 1024

/** Files a bundle never includes: the ones the virus scan flagged. */
const BLOCKED_SCAN = new Set(["infected", "quarantined"])

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

/**
 * A file's name inside the ZIP, unique within it: two files a creator
 * uploaded with the same name would otherwise be one entry, the second
 * silently replacing the first. The second becomes "name (2).ext".
 * Folders in a name are kept flat, so nothing unpacks outside the folder the
 * buyer chose.
 */
export function zipEntryName(fileName: string, taken: Set<string>): string {
  const base = (fileName || "file").replace(/[\\/]+/g, "_").replace(/^\.+/, "").trim() || "file"
  const dot = base.lastIndexOf(".")
  const stem = dot > 0 ? base.slice(0, dot) : base
  const ext = dot > 0 ? base.slice(dot) : ""
  let name = base
  for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${stem} (${n})${ext}`
  taken.add(name.toLowerCase())
  return name
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
    // Variant-specific files (via product_variant_files junction table).
    // Only this product's own files: a variant id is a request parameter,
    // and one from another creator's product must not pull their files into
    // this creator's bundle.
    const { data: vFiles } = await admin
      .from("product_variant_files")
      .select(
        `digital_asset_id,
         digital_assets!inner(id, file_path, file_name, file_size, storage_bucket, product_id, upload_status, scan_status)`,
      )
      .eq("variant_id", variantId)
      .eq("digital_assets.product_id", productId)

    assets = ((vFiles ?? []) as any[])
      .map((vf) => vf.digital_assets)
      .filter((a) => a && a.product_id === productId && (a.upload_status ?? "completed") === "completed" && !BLOCKED_SCAN.has(a.scan_status))
  } else {
    // All files for the product
    const { data } = await admin
      .from("digital_assets")
      .select("id, file_path, file_name, file_size, storage_bucket, scan_status")
      .eq("product_id", productId)
      .eq("upload_status", "completed")
      .order("created_at", { ascending: true })

    assets = (data ?? []).filter((a: { scan_status?: string | null }) => !BLOCKED_SCAN.has(a.scan_status ?? ""))
  }

  // ── 2. Below threshold → no bundle ─────────────────────────────────────
  if (assets.length < BUNDLE_THRESHOLD) return null

  /* A ZIP is built in this function's memory. Past this, the files go one
     by one instead of the function running out of memory for everybody. */
  const totalBytes = assets.reduce((n, a) => n + (Number(a.file_size) || 0), 0)
  if (totalBytes > BUNDLE_MAX_BYTES) return null

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
  /*
    JSZIP, NOT ARCHIVER. This used `archiver`, which was never a dependency
    of this project: every bundle logged "[bundles] archiver package not
    available" and the buyer got the files one by one. jszip is one already,
    pure JavaScript, and the theme export and import routes run it in
    production, so nothing new has to be installed or traced into the
    function. The ZIP was built in memory before as well (BUNDLE_MAX_BYTES).
  */
  const zip = new JSZip()
  const names = new Set<string>()

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

    zip.file(zipEntryName(asset.file_name, names), new Uint8Array(await res.arrayBuffer()), { binary: true })
    addedCount++
  }

  if (addedCount === 0) {
    console.error("[bundles] No files were added to the ZIP")
    return null
  }

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } })
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
