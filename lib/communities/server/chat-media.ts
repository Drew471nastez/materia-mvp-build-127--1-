import "server-only"

/**
 * ===========================================================================
 *  WHAT A CHAT MESSAGE MAY CARRY (round 37)
 * ===========================================================================
 * Pictures, GIFs and files, up to CHAT_ATTACHMENTS_MAX, through the same
 * upload pipeline a post or a comment uses, and nothing from anywhere else:
 *
 *   a picture   in Storelib's picture storage, in the sender's own folder for
 *               this community (memberPictureFolder), and actually there
 *               (storedObjectSize), as a comment's picture is checked
 *   a GIF       from the GIF search the composer already has (checkMedia
 *               keeps only Giphy's own addresses)
 *   a file      the community's private file folder under the sender's id
 *               (./post-files communityFilesExist, checked where it landed
 *               when it was uploaded: no programs, no scripts, no web pages,
 *               50 MB for a member); a video file is a file too, played in
 *               the chat from its signed address (./chat-files route)
 *
 * The admins can switch attachments off for members (Settings, Chat); the
 * team can always send them.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { storedObjectSize } from "@/lib/storage/upload-guard"
import { CHAT_ATTACHMENTS_MAX, isStaffRole, type ChatSettings } from "../chat-rules"
import { can } from "../permissions"
import { PICTURE_BUCKET, memberPictureFolder, picturePathOf } from "../post-media"
import type { CommunityRow, PostMedia } from "../types"
import type { Viewer } from "./context"
import type { Db } from "./db"
import { checkMedia, ownedMedia, permsOf, refused, type Checked } from "./feed"

const CHAT_TYPES = new Set(["image", "gif", "file"])

function storageHost(): string | null {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.toLowerCase() : null
  } catch {
    return null
  }
}

export async function checkChatMedia(db: Db, community: CommunityRow, viewer: Viewer, raw: unknown, settings: Pick<ChatSettings, "attachmentsEnabled">): Promise<Checked<PostMedia[]>> {
  if (raw === undefined || raw === null) return { ok: true, value: [] }
  if (!Array.isArray(raw)) return { ok: false, error: "That could not be added to the message.", status: 400 }
  if (!raw.length) return { ok: true, value: [] }
  if (!settings.attachmentsEnabled && !isStaffRole(viewer.role)) return { ok: false, error: "Pictures and files are turned off in this community's chat.", status: 403 }
  if (!viewer.userId || !can(viewer.role, "upload", permsOf(viewer))) return { ok: false, error: "You cannot send pictures or files here.", status: 403 }
  if (raw.length > CHAT_ATTACHMENTS_MAX) return { ok: false, error: `Up to ${CHAT_ATTACHMENTS_MAX} pictures and files in one message.`, status: 400 }
  const checked = checkMedia(raw)
  if (!checked.ok) return refused(checked, 400)
  const media = checked.value
  if (media.length !== raw.length || media.some((m) => !CHAT_TYPES.has(m.type))) return { ok: false, error: "A message can carry pictures, GIFs and files.", status: 400 }
  /* A file: only the sender's own, in this community's folder. */
  if (media.some((m) => m.type === "file" && m.store !== "community")) return { ok: false, error: "That file could not be added. Upload it again.", status: 400 }
  const pictures = media.filter((m): m is Extract<PostMedia, { type: "image" }> => m.type === "image")
  if (pictures.length) {
    const host = storageHost()
    const folder = memberPictureFolder(viewer.userId, community.id)
    const paths: string[] = []
    for (const p of pictures) {
      const h = new URL(p.url).hostname.toLowerCase()
      const path = picturePathOf(p.url)
      if (!(host ? h === host : h.endsWith(".supabase.co")) || !path || !path.startsWith(folder) || path.slice(folder.length).includes("/")) return { ok: false, error: "That picture could not be added. Upload it again.", status: 400 }
      paths.push(path)
    }
    const sizes = await Promise.all(paths.map((path) => storedObjectSize(db as SupabaseClient, PICTURE_BUCKET, path).catch(() => null)))
    if (sizes.some((size) => size === null)) return { ok: false, error: "That picture could not be added. Upload it again.", status: 400 }
  }
  if (media.some((m) => m.type === "file")) {
    const owned = await ownedMedia(db, community, viewer, media)
    if (!owned.ok) return refused(owned, 400)
    return { ok: true, value: owned.value }
  }
  return { ok: true, value: media }
}

/** A message's attachments as the page draws them: what was stored, nothing more. */
export function chatMediaOf(raw: unknown): PostMedia[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((m): m is PostMedia => !!m && typeof m === "object" && CHAT_TYPES.has(String((m as { type?: unknown }).type))).slice(0, CHAT_ATTACHMENTS_MAX)
}
