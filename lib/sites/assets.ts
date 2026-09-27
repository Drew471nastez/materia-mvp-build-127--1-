import "server-only"
import { inspectHead } from "@/lib/security/uploads/inspect"

/**
 * The media a creator uploads to their site.
 *
 * ---------------------------------------------------------------------------
 *  THE SHAPE EVERY BUILDER SETTLES ON
 * ---------------------------------------------------------------------------
 * Text in the database, binary in object storage, referenced by URL. Bolt keeps
 * files in a container filesystem and syncs them; Lovable puts uploads in
 * object storage behind a CDN; v0 uses a blob store. Nobody puts the bytes in
 * Postgres, because you pay database prices for CDN work and every row read
 * drags megabytes through a connection pool.
 *
 * `site_assets` was designed for exactly this and never written to, which is
 * why a model asked for a picture inlined it as base64 and lost the whole edit.
 * This is the half that was missing.
 *
 * The URL is public and absolute, which is what makes it work identically in
 * the editor preview, in the published site, and in an exported project. There
 * is no publish step that copies media anywhere: the address a creator sees
 * while building is the address a visitor loads.
 */

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { matchesDeclared } from "@/lib/storage/file-signature"
import { imageSizeProblem, readImageSize, stripImageMetadata } from "@/lib/images/metadata"

export const ASSET_BUCKET = "site-assets"

/** 25MB — a hero image, a logo set, or a short looping background video. */
export const MAX_ASSET_BYTES = 25 * 1024 * 1024

/** Enough for a site; past this somebody is using us as a drive. */
export const MAX_ASSETS_PER_SITE = 200

/**
 * WHAT MAY BE UPLOADED, and the one thing that may not.
 *
 * SVG IS ABSENT ON PURPOSE. An SVG is a document, not a picture: it can carry
 * `<script>`, and it is served as `image/svg+xml` from a URL with our name on
 * it. Hosting somebody else's executable document is not a feature we need —
 * and a creator loses nothing, because an inline `<svg>` written into a
 * component is already supported, already sandboxed by the site's own CSP, and
 * renders identically.
 *
 * Keyed by MIME with the extension we will actually store it under, so the
 * stored name never depends on what the browser chose to call the upload.
 */
const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "audio/mpeg": "mp3",
  "font/woff2": "woff2",
  "application/pdf": "pdf",
}

export interface SiteAsset {
  id: string
  name: string
  url: string
  mime: string
  bytes: number
  createdAt: string
}

export type UploadResult = { ok: true; asset: SiteAsset } | { ok: false; error: string }

const SUPPORTED_TYPES = "JPEG, PNG, WebP, GIF, AVIF, MP4, WebM, MP3, WOFF2 or PDF"

/**
 * The reason an upload is refused, or null.
 *
 * The declared type is not trusted for safety — the extension we store under
 * comes from the table above, never from the filename — but it is trusted to be
 * honest about a refusal, where the worst case is a creator renaming a file.
 */
export function assetError(mime: string, bytes: number): string | null {
  if (!ALLOWED[mime]) return `That file type is not supported. Upload ${SUPPORTED_TYPES}.`
  if (bytes <= 0) return "That file is empty."
  if (bytes > MAX_ASSET_BYTES) {
    return `That file is ${Math.round(bytes / 1024 / 1024)}MB and the limit is ${
      MAX_ASSET_BYTES / 1024 / 1024
    }MB.`
  }
  return null
}

/** A stored name that cannot collide, cannot traverse, and cannot execute. */
function storageKey(siteId: string, mime: string): string {
  return `sites/${siteId}/${crypto.randomUUID()}.${ALLOWED[mime]}`
}

/**
 * A display name a person recognises, with nothing in it that could be read as
 * a path or hide inside a log line. The stored key is a UUID either way, so
 * this is only ever a label.
 */
function displayName(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? "file"
  // Control characters and NUL: an attempt to make one string look like two.
  return base.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 120) || "file"
}

export async function listAssets(siteId: string): Promise<SiteAsset[]> {
  // The user's client, so RLS answers ownership rather than this function.
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("site_assets")
    .select("id, path, url, mime, bytes, created_at")
    .eq("site_id", siteId)
    .order("created_at", { ascending: false })
    .limit(MAX_ASSETS_PER_SITE)

  if (error) {
    console.error("[listAssets] query failed:", error.message)
    return []
  }

  type Row = {
    id: string
    path: string
    url: string | null
    mime: string | null
    bytes: number | null
    created_at: string
  }

  return ((data as Row[] | null) ?? [])
    .filter((row) => !!row.url)
    .map((row) => ({
      id: row.id,
      name: row.path,
      url: row.url as string,
      mime: row.mime ?? "application/octet-stream",
      bytes: row.bytes ?? 0,
      createdAt: row.created_at,
    }))
}

/**
 * Store one upload.
 *
 * The caller has already proved the site is theirs; this uses the admin client
 * because a creator who could write to the bucket directly could put a file
 * under somebody else's prefix, and it would be served from an address with our
 * name on it.
 */
export async function uploadAsset(input: {
  siteId: string
  filename: string
  mime: string
  body: ArrayBuffer
}): Promise<UploadResult> {
  const bytes = input.body.byteLength
  const invalid = assetError(input.mime, bytes)
  if (invalid) return { ok: false, error: invalid }

  const admin = createAdminClient()

  const { count } = await admin
    .from("site_assets")
    .select("id", { count: "exact", head: true })
    .eq("site_id", input.siteId)

  if ((count ?? 0) >= MAX_ASSETS_PER_SITE) {
    return { ok: false, error: `This site is at its limit of ${MAX_ASSETS_PER_SITE} files.` }
  }

  /*
    The declared type chose the extension; the bytes have to agree with it. A
    page called logo.png and sent as image/png is refused here, and a photo
    loses its location metadata before it gets a public URL
    (lib/storage/file-signature.ts, lib/images/metadata.ts).
  */
  const head = new Uint8Array(input.body, 0, Math.min(input.body.byteLength, 4096))
  if (!matchesDeclared(head, input.mime)) {
    return { ok: false, error: `That file is not the ${ALLOWED[input.mime].toUpperCase()} it says it is.` }
  }
  /* The central check (lib/security/uploads): nothing that runs, nothing a
     browser renders as a page, whatever the declared type says. */
  const verdict = inspectHead({
    fileName: `asset.${ALLOWED[input.mime]}`,
    declaredMime: input.mime,
    size: bytes,
    head,
    context: input.mime.startsWith("image/") ? "public_image" : "link_page_file",
    maxBytes: Number.MAX_SAFE_INTEGER,
  })
  if (!verdict.ok) return { ok: false, error: verdict.userMessage }
  let body: ArrayBuffer | Uint8Array = input.body
  if (input.mime.startsWith("image/")) {
    const size = readImageSize(new Uint8Array(input.body))
    const tooBig = imageSizeProblem(size)
    if (tooBig) return { ok: false, error: tooBig }
    body = stripImageMetadata(new Uint8Array(input.body))
  }

  const key = storageKey(input.siteId, input.mime)

  const { error: uploadError } = await admin.storage.from(ASSET_BUCKET).upload(key, body, {
    contentType: input.mime,
    // The key carries a UUID, so a name is never reused and the file behind a
    // URL never changes. That is what makes the long cache below safe.
    upsert: false,
    cacheControl: "31536000",
  })

  if (uploadError) {
    console.error("[uploadAsset] storage rejected the file:", uploadError.message)
    return {
      ok: false,
      error: uploadError.message.toLowerCase().includes("bucket")
        ? `Uploads are not set up on this deployment yet — the "${ASSET_BUCKET}" bucket does not exist. Run the latest SQL.`
        : "That file could not be stored. Try again.",
    }
  }

  const { data: pub } = admin.storage.from(ASSET_BUCKET).getPublicUrl(key)
  const url = pub.publicUrl

  const name = displayName(input.filename)
  const { data: row, error: rowError } = await admin
    .from("site_assets")
    .insert({
      site_id: input.siteId,
      path: name,
      storage_key: key,
      url,
      mime: input.mime,
      bytes,
    })
    .select("id, created_at")
    .maybeSingle()

  if (rowError || !row) {
    /**
     * The bytes landed but the record did not, so nothing can find them. Remove
     * the object rather than leave a file no row points at — an orphan in a
     * public bucket is a file nobody can see, delete, or account for.
     */
    await admin.storage.from(ASSET_BUCKET).remove([key])
    console.error("[uploadAsset] could not record the file:", rowError?.message)
    return { ok: false, error: "That file could not be saved. Try again." }
  }

  const created = row as { id: string; created_at: string }
  return {
    ok: true,
    asset: { id: created.id, name, url, mime: input.mime, bytes, createdAt: created.created_at },
  }
}

/** Remove one, bytes and record together. */
export async function deleteAsset(siteId: string, assetId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("site_assets")
    .select("storage_key")
    .eq("id", assetId)
    .eq("site_id", siteId)
    .maybeSingle()

  const key = (data as { storage_key: string } | null)?.storage_key
  if (!key) return false

  // The row goes first. A row without bytes renders a broken image; bytes
  // without a row are invisible and unaccountable, which is worse.
  await admin.from("site_assets").delete().eq("id", assetId).eq("site_id", siteId)
  await admin.storage.from(ASSET_BUCKET).remove([key])
  return true
}
