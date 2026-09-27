import "server-only"

/**
 * ===========================================================================
 *  A CREATOR DOWNLOADS THEIR OWN FILE
 * ===========================================================================
 * "In the edit product pages, I want to download the files myself."
 *
 * The product editor's file menu asks /api/products/files/<assetId>/download
 * for a link, and this decides the answer:
 *
 *   401  nobody is signed in.
 *   404  there is no such file, or it is not this person's. The same answer
 *        for both, so the route cannot be used to learn which file ids exist.
 *   403  the virus scan flagged it (lib/storage/scan-gate.ts, the same gate a
 *        buyer's download goes through, with the creator's allowance for a
 *        file still waiting for its verdict).
 *   200  a signed storage URL for this one file, good for two minutes, made
 *        with the file's real name so storage answers with
 *        `Content-Disposition: attachment` and that name
 *        (lib/storage/download.ts, generateSignedDownloadUrl).
 *
 * WHO OWNS IT. The caller is the session's user, read by the route with the
 * session client. A file belongs to them when its product's creator row has
 * their user id, or, for a file whose product was never saved, when they
 * uploaded it. The rows are read with the service role because the file
 * policies have changed shape across migrations and a creator's own read
 * must not depend on which of them a database has; every read is filtered
 * by that user id, and nothing is signed until the answer is yes.
 *
 * The file's name may come from the editor, because a rename there is saved
 * with the product and the creator expects the name they see. It only ever
 * names the download; the file is the one the id and the owner decide.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

import { isUuid } from "@/lib/receipts/rules"
import { generateSignedDownloadUrl } from "./download"
import { gateDownload, type ScannableAsset } from "./scan-gate"
import { BLOCKED_STATUSES } from "@/lib/security/uploads/pipeline"

/** Long enough to start a download on a slow phone, short enough to be useless shared. */
export const OWNER_LINK_SECONDS = 120

export type OwnerDownloadAnswer =
  | { status: 200; body: { success: true; downloadUrl: string; fileName: string; expiresIn: number } }
  | { status: 401 | 403 | 404 | 409 | 500; body: { error: string } }

export const NOT_FOUND = "File not found"

/**
 * The name a download is saved under: what the editor shows, else what was
 * stored, else "download". No path, no quotes, no line breaks, no control
 * characters, and never longer than a file system takes; the extension
 * survives a cut.
 */
export function downloadFileName(requested: unknown, stored: unknown): string {
  const clean = (v: unknown) =>
    typeof v === "string"
      ? v
          .replace(/[\u0000-\u001f\u007f"\\/]/g, "_")
          .replace(/^[.\s]+/, "")
          .trim()
      : ""
  const name = clean(requested) || clean(stored) || "download"
  if (name.length <= 180) return name
  const dot = name.lastIndexOf(".")
  const ext = dot > 0 && name.length - dot <= 12 ? name.slice(dot) : ""
  return name.slice(0, 180 - ext.length) + ext
}

type AssetRow = ScannableAsset & { product_id?: string | null; uploaded_by?: string | null }

/** Whether this user owns this file, read with every query filtered by them. */
export async function ownsAsset(admin: SupabaseClient, asset: AssetRow, userId: string): Promise<boolean> {
  if (asset.product_id) {
    const { data: product } = await admin.from("products").select("id, creator_id").eq("id", asset.product_id).maybeSingle()
    if (!product?.creator_id) return false
    const { data: creator } = await admin
      .from("creators")
      .select("id")
      .eq("id", product.creator_id)
      .eq("user_id", userId)
      .maybeSingle()
    return !!creator
  }
  /* Uploaded before its product was saved: the person who uploaded it. */
  return !!asset.uploaded_by && asset.uploaded_by === userId
}

export interface OwnerDownloadDeps {
  admin: SupabaseClient
  sign?: typeof generateSignedDownloadUrl
  gate?: typeof gateDownload
}

export async function ownerDownload(
  deps: OwnerDownloadDeps,
  input: { userId: string | null | undefined; assetId: string; name?: string | null },
): Promise<OwnerDownloadAnswer> {
  if (!input.userId) return { status: 401, body: { error: "Sign in to download this file." } }
  if (!isUuid(input.assetId)) return { status: 404, body: { error: NOT_FOUND } }

  const { admin } = deps
  const sign = deps.sign ?? generateSignedDownloadUrl
  const gate = deps.gate ?? gateDownload

  /* "*": scan_status and storage_bucket came in later migrations; this row never leaves the server. */
  const { data: row, error } = await admin.from("digital_assets").select("*").eq("id", input.assetId).maybeSingle()
  if (error || !row) return { status: 404, body: { error: NOT_FOUND } }
  const asset = row as AssetRow

  if (!(await ownsAsset(admin, asset, input.userId))) return { status: 404, body: { error: NOT_FOUND } }
  if (!asset.file_path) return { status: 404, body: { error: "This file has not finished uploading." } }

  /* A file the checks refused is not handed back, not even to its owner: the
     gate lets a creator's own reads through (lib/storage/scan-gate), but a
     download puts the file on a device, and a flagged one helps nobody there. */
  if (BLOCKED_STATUSES.has(String(asset.scan_status ?? ""))) {
    return { status: 403, body: { error: "The virus scan flagged this file, so it cannot be downloaded." } }
  }

  const passed = await gate(admin, asset, { isCreator: true })
  if (!passed.ok) {
    /* Spelled out: the suite compiles without strict narrowing. */
    const refused = passed as Extract<typeof passed, { ok: false }>
    /* The gate's words are for a buyer ("the seller has been told"); this is the seller. */
    const error = refused.status === 403 ? "The virus scan flagged this file, so it cannot be downloaded." : refused.error
    return { status: refused.status as 403 | 409, body: { error } }
  }

  const fileName = downloadFileName(input.name, asset.file_name)
  const signed = await sign(admin, asset.file_path, OWNER_LINK_SECONDS, asset.storage_bucket || undefined, fileName)
  if (!signed) return { status: 500, body: { error: "The file could not be prepared. Try again." } }

  return { status: 200, body: { success: true, downloadUrl: signed.url, fileName, expiresIn: OWNER_LINK_SECONDS } }
}
