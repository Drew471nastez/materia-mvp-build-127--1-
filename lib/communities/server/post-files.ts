import "server-only"

/**
 * ===========================================================================
 *  FILES MEMBERS ATTACH TO POSTS
 * ===========================================================================
 * Any member who may upload (can(role, "upload")) attaches a file to a post,
 * not only the creator. The file goes straight from the browser into
 * Storelib's private file bucket, in the community's own folder under the
 * creator's storage and the member's id:
 *
 *   <creatorId>/community-files/<communityId>/<memberId>/<fileId>.<ext>
 *
 * through a signed upload address this module hands out, the way a
 * community video goes (lib/communities/server/videos.ts). Nothing about the
 * file is believed:
 *
 *   before   the name, the declared type and the size go through the same
 *            precheck every upload on Storelib gets, for a file a page hands
 *            out (`link_page_file`: no program, no script, no web page or
 *            SVG), at 50 MB for a member and 500 MB for staff
 *   after    the stored file's real size and its first and last bytes are
 *            read where it landed (inspectStoredObject, the product file
 *            check, ZIPs included); a refused file is deleted and written
 *            to the security log
 *   posting  the file must be there, under the poster's own id in this
 *            community's folder, and keeps the extension it was checked with
 *   reading  only through the post's download route, for a member who may
 *            see the post (requireMember, then the space's access rule), as
 *            a five minute signed address that saves rather than opens
 *
 * No table: the path is the record. The file id is a fresh UUID, so one
 * person cannot guess another's, and every path is rebuilt here from ids the
 * server checked, never taken from a client.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { logUploadVerdict } from "@/lib/security/uploads/audit"
import { precheckUpload } from "@/lib/security/uploads/inspect"
import { inspectStoredObject } from "@/lib/security/uploads/stored"
import { STORAGE_BUCKET } from "@/lib/storage/plans"
import { generateSignedDownloadUrl, SIGNED_DOWNLOAD_SECONDS } from "@/lib/storage/download"
import { storedObjectSize } from "@/lib/storage/upload-guard"
import { MEMBER_FILE_MAX_BYTES, STAFF_FILE_MAX_BYTES, communityFilePath, fileDisplayName, fileExtension } from "../post-media"
import type { CommunityRow, PostMedia } from "../types"
import type { Viewer } from "./context"
import { reasonOf, type Db } from "./db"
import type { Checked } from "./feed"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const FILE_CONTEXT = "link_page_file" as const

export interface FileTicket {
  fileId: string
  /** Where the browser PUTs the bytes (a signed upload address). */
  url: string
  token: string
  name: string
  maxBytes: number
}

export function fileLimitFor(staff: boolean): number {
  return staff ? STAFF_FILE_MAX_BYTES : MEMBER_FILE_MAX_BYTES
}

function pathFor(community: Pick<CommunityRow, "id" | "creator_id">, uploaderId: string, fileId: string, ext: string): string | null {
  if (!community.creator_id || !UUID.test(community.creator_id) || !UUID.test(community.id) || !UUID.test(uploaderId) || !UUID.test(fileId)) return null
  if (!/^[a-z0-9]{1,10}$/.test(ext)) return null
  return communityFilePath(community.creator_id, community.id, uploaderId, fileId.toLowerCase(), ext)
}

/** Step one: is this file one we take, and where does it go. */
export async function prepareCommunityFile(
  db: Db,
  input: { community: CommunityRow; viewer: Viewer; staff: boolean; fileName: unknown; fileSize: unknown; contentType: unknown },
): Promise<Checked<FileTicket>> {
  if (!input.viewer.userId) return { ok: false, error: "Sign in to attach a file.", status: 401 }
  if (!input.community.creator_id) return { ok: false, error: "This community has no creator account to keep its files.", status: 409 }
  const fileName = typeof input.fileName === "string" ? input.fileName.slice(0, 255) : ""
  const contentType = typeof input.contentType === "string" ? input.contentType.slice(0, 120) : ""
  const size = Number(input.fileSize)
  const maxBytes = fileLimitFor(input.staff)
  const verdict = precheckUpload({ fileName, size, declaredMime: contentType, context: FILE_CONTEXT, maxBytes })
  if (!verdict.ok) return { ok: false, error: verdict.userMessage || "This file can't be uploaded.", status: verdict.code === "too_large" ? 413 : 415 }
  const ext = fileExtension(fileName)
  const fileId = crypto.randomUUID()
  const path = pathFor(input.community, input.viewer.userId, fileId, ext)
  if (!path) return { ok: false, error: "This file can't be uploaded.", status: 400 }
  try {
    const { data, error } = await db.storage.from(STORAGE_BUCKET).createSignedUploadUrl(path)
    if (error || !data?.token || !data?.signedUrl) throw new Error(reasonOf(error))
    return { ok: true, value: { fileId, url: data.signedUrl, token: data.token, name: fileDisplayName(fileName, ext), maxBytes } }
  } catch (e) {
    console.error(`[communities] file upload start: ${reasonOf(e)}`)
    return { ok: false, error: "Could not start the upload. Try again.", status: 502 }
  }
}

/** Step two: the bytes are there. Check them where they landed; a refused file is removed. */
export async function completeCommunityFile(
  db: Db,
  input: { community: CommunityRow; viewer: Viewer; staff: boolean; fileId: unknown; name: unknown },
): Promise<Checked<Extract<PostMedia, { type: "file" }>>> {
  if (!input.viewer.userId || typeof input.fileId !== "string") return { ok: false, error: "Upload not found.", status: 404 }
  const ext = fileExtension(input.name)
  const path = pathFor(input.community, input.viewer.userId, input.fileId, ext)
  if (!path) return { ok: false, error: "Upload not found.", status: 404 }
  const size = await storedObjectSize(db as SupabaseClient, STORAGE_BUCKET, path)
  if (size === null) return { ok: false, error: "The upload did not arrive. Try again.", status: 400 }
  const name = fileDisplayName(input.name, ext)
  const limit = fileLimitFor(input.staff)
  const remove = () =>
    db.storage
      .from(STORAGE_BUCKET)
      .remove([path])
      .then(
        () => undefined,
        () => undefined,
      )
  if (size > limit) {
    await remove()
    return { ok: false, error: `This file is too large. The limit is ${Math.round(limit / (1024 * 1024))} MB.`, status: 413 }
  }
  const verdict = await inspectStoredObject(db as SupabaseClient, { bucket: STORAGE_BUCKET, path }, { fileName: name, size, context: FILE_CONTEXT, budgetMs: 6000 })
  await logUploadVerdict(db as SupabaseClient, verdict, {
    context: FILE_CONTEXT,
    userId: input.viewer.userId,
    creatorId: input.community.creator_id,
    bucket: STORAGE_BUCKET,
    path,
    bytes: size,
    outcome: verdict.ok ? undefined : "removed",
  })
  if (!verdict.ok) {
    await remove()
    return { ok: false, error: verdict.userMessage || "We couldn't accept this file. Try another file.", status: 415 }
  }
  return { ok: true, value: { type: "file", assetId: input.fileId.toLowerCase(), name, size, store: "community" } }
}

/**
 * At posting: each file is in this member's folder in this community, under
 * the extension its name carries. Answers each file's name as it will be
 * kept (the checked extension on the end).
 */
export async function communityFilesExist(db: Db, community: Pick<CommunityRow, "id" | "creator_id">, uploaderId: string, files: { fileId: string; name: string }[]): Promise<Checked<Map<string, string>>> {
  const out = new Map<string, string>()
  const found = await Promise.all(
    files.map(async (f) => {
      const ext = fileExtension(f.name)
      const path = pathFor(community, uploaderId, f.fileId, ext)
      if (!path) return false
      const size = await storedObjectSize(db as SupabaseClient, STORAGE_BUCKET, path).catch(() => null)
      if (size === null) return false
      out.set(f.fileId.toLowerCase(), fileDisplayName(f.name, ext))
      return true
    }),
  )
  if (found.some((ok) => !ok)) return { ok: false, error: "That file could not be added. Upload it again." }
  return { ok: true, value: out }
}

/** A five minute address that saves the file under its name, for the download route (which checked the reader). */
export async function signCommunityFile(db: Db, community: Pick<CommunityRow, "id" | "creator_id">, authorId: string | null, file: { assetId: string; name: string }): Promise<string | null> {
  if (!authorId) return null
  const path = pathFor(community, authorId, file.assetId, fileExtension(file.name))
  if (!path) return null
  const signed = await generateSignedDownloadUrl(db as SupabaseClient, path, SIGNED_DOWNLOAD_SECONDS, STORAGE_BUCKET, file.name)
  return signed?.url ?? null
}
