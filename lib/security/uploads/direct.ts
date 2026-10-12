import "server-only"

/**
 * ===========================================================================
 *  A FILE THE BROWSER PUT STRAIGHT INTO A PUBLIC BUCKET
 * ===========================================================================
 * Most of Storelib's pictures, and every video and lead magnet, go from the
 * page into a public bucket without a server touching them: either with the
 * person's own session, or through a signed upload URL a route handed out. A
 * signed upload URL cannot limit what is sent through it, so whatever the
 * page declared when it asked for the URL is a wish, not a fact. A creator
 * could ask for "freebie.pdf, 1 KB" and PUT half a gigabyte of program, then
 * hand that public URL to every lead they have.
 *
 * So the check happens once the bytes are there, from storage, the same way a
 * product file is checked (stored.ts): the first 8 KB and the last 64 KB by
 * Range, never the whole file. A file that is refused is DELETED, which stops
 * its URL working, and written to the security log. Nothing is shown to the
 * creator by this step and nothing waits for it: the route that calls it
 * answers first and runs this after (next/server after()).
 *
 * WHERE. PUBLIC_DIRECT_UPLOADS is every public bucket a browser can write
 * into, with what each one is allowed to hold. A path outside the caller's
 * own folder is refused before anything is read, so this cannot be pointed at
 * somebody else's file.
 *
 * The hourly picture pass (lib/storage/metadata-sweep.ts) is the net under
 * this one: it catches anything whose confirm never arrived, because a page
 * was closed or because whoever uploaded it never meant to ask.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

import { logSecurityEvent, logUploadVerdict } from "./audit"
import { isContainedPath } from "./filename"
import { MAX_UPLOAD_BYTES, type UploadContext } from "./policy"
import { inspectStoredObject } from "./stored"
import { MAX_VIDEO_BYTES } from "@/lib/media/video"

export interface DirectUploadBucket {
  /** What files here are allowed to be. */
  context: UploadContext
  /** The one this bucket takes, when it is not the context's own ceiling. */
  maxBytes?: number
  /** What the folders under the owner's id may be called, when it matters. */
  note: string
}

/**
 * Every public bucket a browser writes into, and what each may hold. A bucket
 * that is not here cannot be confirmed through this route at all.
 *
 *   avatars, covers, product-images, store-builder-images
 *                      pictures: profile photos, product and gallery
 *                      pictures, website builder pictures. Real pictures only.
 *   onepage-assets     a link page's pictures AND its videos (a wallpaper, a
 *                      block's clip), so the ceiling is the video one and a
 *                      file is allowed to be either.
 *   lead-form-files-v2 a link page's pictures and its lead magnets. A lead
 *                      magnet is any kind of file, so `link_page_file`, which
 *                      refuses a program, a script or anything a browser
 *                      renders as a page.
 *   product-videos     a product's video. Real video containers only.
 */
export const PUBLIC_DIRECT_UPLOADS: Readonly<Record<string, DirectUploadBucket>> = {
  avatars: { context: "public_image", note: "profile photos" },
  covers: { context: "public_image", note: "cover pictures" },
  "product-images": { context: "public_image", note: "product and gallery pictures" },
  "store-builder-images": { context: "public_image", note: "website builder pictures" },
  "onepage-assets": { context: "link_page_file", maxBytes: MAX_UPLOAD_BYTES.video, note: "link page pictures and videos" },
  "lead-form-files-v2": { context: "link_page_file", note: "link page pictures and lead magnets" },
  "product-videos": { context: "video", note: "product videos" },
}

export type DirectUploadBucketName = keyof typeof PUBLIC_DIRECT_UPLOADS

/**
 * store-builder-images also holds the videos a page, the Files library or a
 * product's gallery plays (lib/files/upload-video.ts), each named .mp4,
 * .webm, .mov or .m4v. Checked as the picture bucket, a real video there was
 * "not a picture" and removed. A file with a video's name is checked as a
 * video (real video bytes only, up to MAX_VIDEO_BYTES); every other name
 * there is still checked as a picture. So the name and the bytes have to
 * agree either way: a program called clip.mp4 is not a video, and a video
 * called photo.jpg is not a picture.
 */
const VIDEO_NAME = /\.(mp4|webm|mov|m4v)$/i
export function directRulesFor(bucket: string, path: string): DirectUploadBucket | null {
  const rules = PUBLIC_DIRECT_UPLOADS[bucket]
  if (!rules) return null
  if (bucket === "store-builder-images" && VIDEO_NAME.test(path)) return { context: "video", maxBytes: MAX_VIDEO_BYTES, note: "website builder, library and product videos" }
  return rules
}

/** Whether this is a bucket a browser writes into directly. */
export function isDirectUploadBucket(name: unknown): name is string {
  return typeof name === "string" && Object.hasOwn(PUBLIC_DIRECT_UPLOADS, name)
}

/**
 * Whether this path is one the signed in person may have written: a plain
 * relative path whose first folder is their own user id, or their creator id,
 * which is how every route and every page here builds one.
 */
export function ownedDirectPath(path: unknown, ownerIds: (string | null | undefined)[]): path is string {
  if (!isContainedPath(path) || path.startsWith("/") || path.length > 512) return false
  const first = path.split("/")[0]
  return ownerIds.some((id) => typeof id === "string" && id.length > 0 && id === first)
}

export interface DirectCheckResult {
  /** False when the file was refused and removed. */
  ok: boolean
  code: string
  bytes: number
}

/**
 * The central check on a file already in a public bucket, and the removal of
 * one that is refused. Never throws, and never tells the caller's page
 * anything: this runs after the answer has gone.
 */
export async function checkDirectUpload(
  admin: SupabaseClient,
  where: { bucket: string; path: string },
  who: { userId?: string | null; creatorId?: string | null } = {},
): Promise<DirectCheckResult> {
  const rules = directRulesFor(where.bucket, where.path)
  if (!rules) return { ok: true, code: "not_a_direct_bucket", bytes: 0 }
  try {
    const size = await storedSize(admin, where.bucket, where.path)
    if (size === null) return { ok: true, code: "not_there", bytes: 0 }

    const limit = rules.maxBytes ?? MAX_UPLOAD_BYTES[rules.context]
    if (size > limit) {
      await remove(admin, where)
      await logSecurityEvent(admin, {
        event: "upload",
        outcome: "removed",
        context: rules.context,
        code: "too_large",
        bucket: where.bucket,
        path: where.path,
        bytes: size,
        userId: who.userId ?? null,
        creatorId: who.creatorId ?? null,
        detail: { found: `${size} bytes, over ${limit}`, via: "direct_confirm" },
      })
      return { ok: false, code: "too_large", bytes: size }
    }

    /*
      A picture bucket takes pictures; a link page bucket takes anything that
      is not a program, a script or a page. onepage-assets holds both, so a
      real video there is a video rather than "not a picture".
    */
    const verdict = await inspectStoredObject(
      admin,
      where,
      { fileName: where.path, size, context: rules.context, budgetMs: 4000 },
    )
    if (!verdict.ok) {
      await remove(admin, where)
    }
    await logUploadVerdict(admin, verdict, {
      context: rules.context,
      userId: who.userId ?? null,
      creatorId: who.creatorId ?? null,
      bucket: where.bucket,
      path: where.path,
      bytes: size,
      outcome: verdict.ok ? undefined : "removed",
    })
    return { ok: verdict.ok, code: verdict.code, bytes: size }
  } catch (e) {
    console.warn("[file-security] a direct upload could not be checked:", e instanceof Error ? e.message : e)
    return { ok: true, code: "not_checked", bytes: 0 }
  }
}

async function remove(admin: SupabaseClient, where: { bucket: string; path: string }): Promise<void> {
  await admin.storage
    .from(where.bucket)
    .remove([where.path])
    .then(
      () => undefined,
      () => undefined,
    )
}

/** The size storage recorded for an object, or null when it is not there. */
async function storedSize(admin: SupabaseClient, bucket: string, path: string): Promise<number | null> {
  const slash = path.lastIndexOf("/")
  const folder = slash === -1 ? "" : path.slice(0, slash)
  const name = path.slice(slash + 1)
  const { data, error } = await admin.storage.from(bucket).list(folder, { search: name, limit: 100 })
  if (error || !data) return null
  const entry = data.find((f) => f.name === name)
  if (!entry) return null
  const size = Number((entry.metadata as { size?: unknown } | null)?.size)
  return Number.isFinite(size) ? size : 0
}
