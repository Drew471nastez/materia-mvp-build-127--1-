/**
 * ===========================================================================
 *  A MADE OR FOUND PICTURE, KEPT IN THE CREATOR'S FILES (round P, P1)
 * ===========================================================================
 * Exactly where the editor's own uploads go (components/website-builder/
 * editor/image-picker.tsx): the public `store-builder-images` bucket, in the
 * store owner's folder, so it shows in Files and in every image picker's
 * "Choose from your files" like any upload (lib/files/library.ts lists the
 * folder as "AI"):
 *
 *   store-builder-images/<owner user id>/ai-images/<time>-<random>.<ext>
 *
 * The bytes pass the same gate as every server upload of a public picture
 * (lib/storage/public-image.ts: a raster picture by its bytes, size limits,
 * metadata removed). The address is Storelib's /media/ one (lib/storage/
 * media-url), which the image optimizer and every image_picker take.
 *
 * Its row in public.file_details (part 214) carries the alt text and, after
 * part 441, `source` ("ai" or "stock") and `origin` (the prompt, aspect,
 * provider, the job, a stock photographer's credit), which is what the
 * editor's Regenerate reads. A database without part 441 still keeps the
 * picture and its alt text; only Regenerate is unavailable for it.
 */
import { preparePublicImage } from "@/lib/storage/public-image"
import { mediaUrl } from "@/lib/storage/media-url"
import { AI_IMAGE_BUCKET, AI_IMAGE_FOLDER, type ImageOrigin } from "./types"

export { aiImagePathOf, isAiImagePath } from "./paths"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Admin = any

export type SavedImage = { ok: true; url: string; width: number; height: number; mediaId: string; path: string } | { ok: false; error: string }

export interface SaveImageInput {
  ownerUserId: string
  creatorId: string
  bytes: Uint8Array
  alt: string
  origin: ImageOrigin
}

/** Whether a column part 441 adds is missing (an older database). */
function missingColumn(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return error.code === "42703" || error.code === "PGRST204" || /column .*(source|origin).* (does not exist|could not find)|could not find the '(source|origin)' column/i.test(error.message ?? "")
}

export async function saveImageToLibrary(admin: Admin, input: SaveImageInput): Promise<SavedImage> {
  const picture = preparePublicImage(input.bytes, 15 * 1024 * 1024)
  if (picture.ok === false) return { ok: false, error: "The picture that came back is not one Storelib can keep." }
  const rand = Math.random().toString(36).slice(2, 10)
  const path = `${input.ownerUserId}/${AI_IMAGE_FOLDER}/${Date.now()}-${rand}.${picture.ext}`
  const { error: upErr } = await admin.storage.from(AI_IMAGE_BUCKET).upload(path, picture.bytes, { contentType: picture.mime, cacheControl: "31536000", upsert: false })
  if (upErr) return { ok: false, error: "The picture could not be stored." }
  const width = picture.size?.width ?? input.origin.width
  const height = picture.size?.height ?? input.origin.height
  const origin: ImageOrigin = { ...input.origin, width, height }
  const row = { bucket: AI_IMAGE_BUCKET, path, creator_id: input.creatorId, alt_text: input.alt.slice(0, 500) || null, updated_at: new Date().toISOString() }
  let { error } = await admin.from("file_details").upsert({ ...row, source: origin.source, origin }, { onConflict: "bucket,path" })
  /* Part 441 not run yet: the picture and its alt text are kept all the same. */
  if (error && missingColumn(error)) ({ error } = await admin.from("file_details").upsert(row, { onConflict: "bucket,path" }))
  const { data } = admin.storage.from(AI_IMAGE_BUCKET).getPublicUrl(path)
  return { ok: true, url: mediaUrl(String(data.publicUrl)), width, height, mediaId: `${AI_IMAGE_BUCKET}:${path}`, path }
}

/** What a picture was made from, for Regenerate. Null when it has no record (an upload, or part 441 not run). */
export async function readImageOrigin(admin: Admin, creatorId: string, path: string): Promise<{ origin: ImageOrigin; alt: string | null } | null> {
  const { data, error } = await admin.from("file_details").select("origin, alt_text, creator_id").eq("bucket", AI_IMAGE_BUCKET).eq("path", path).maybeSingle()
  if (error || !data || data.creator_id !== creatorId) return null
  const origin = data.origin as ImageOrigin | null
  if (!origin || typeof origin !== "object" || typeof origin.prompt !== "string") return null
  return { origin, alt: (data.alt_text as string | null) ?? null }
}

/** The store owner's auth user id: whose folder the files are in. */
export async function ownerUserIdOf(admin: Admin, creatorId: string): Promise<string | null> {
  const { data } = await admin.from("creators").select("user_id").eq("id", creatorId).maybeSingle()
  return (data?.user_id as string | undefined) ?? null
}
