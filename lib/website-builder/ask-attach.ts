/**
 * ===========================================================================
 *  WHAT CAN BE ATTACHED TO A MESSAGE, AND WHAT BECOMES OF IT
 * ===========================================================================
 * The rules behind the composer's pictures, apart from the browser work that
 * carries them out (components/website-builder/ask-attach-prepare.ts), so a
 * test can hold them without a canvas.
 *
 * The model reads pictures: PNG, JPEG, WebP and GIF, at most MAX_IMAGES, each
 * sent at LONG_EDGE (lib/sites/agent/attachments.ts, the one door every
 * surface uses). What people reach for is wider than that, so:
 *
 *   A PHOTO          any size in, shrunk on the device to LONG_EDGE before it
 *                    is sent. A 12 megapixel phone photo goes as a few
 *                    hundred kilobytes.
 *   HEIC             an iPhone photo. Safari reads it and it is converted to
 *                    JPEG like any photo; a browser that cannot read it says
 *                    so in a sentence rather than sending something broken.
 *   A VIDEO          sent as stills: a few frames from across the clip,
 *                    which is how a model looks at a screen recording.
 *   ANYTHING ELSE    refused where it was dropped, in plain words.
 */

import { LONG_EDGE, MAX_IMAGES } from "@/lib/sites/agent/attachments"

export type AttachKind = "image" | "heic" | "video" | "other"

/** Before shrinking. A phone photo is 3 to 12MB; a panorama can be more. */
export const MAX_SOURCE_IMAGE_BYTES = 40 * 1024 * 1024
/** A short screen recording. Only a few frames are ever read from it. */
export const MAX_SOURCE_VIDEO_BYTES = 300 * 1024 * 1024
/** How many stills a video becomes, when there is room for them. */
export const VIDEO_STILLS = 3

const HEIC = /\.(heic|heif)$/i

export function kindOf(file: { type?: string; name?: string }): AttachKind {
  const type = (file.type ?? "").toLowerCase()
  const name = file.name ?? ""
  if (type === "image/heic" || type === "image/heif" || HEIC.test(name)) return "heic"
  if (type.startsWith("image/")) return "image"
  if (type.startsWith("video/") || /\.(mov|mp4|m4v|webm)$/i.test(name)) return "video"
  return "other"
}

/*
  ═══════════════════════════════════════════════════════════════════════════
   ONE PICTURE IS ONE THUMBNAIL
  ═══════════════════════════════════════════════════════════════════════════
  "Attaching an image adds it twice." A file dropped on the composer reached
  two drop handlers, the composer's and the panel's around it, and each
  attached it; a paste can carry the same picture twice over (a PNG and the
  same image as a TIFF, from a Mac); and a picture chosen again by mistake is
  the same picture. So a picture is known two ways:

    BY THE FILE     name, size, type and modified time, before any of it is
                    read: the same file arriving by two routes in one moment
                    is refused at the door (fileKey).
    BY ITS PIXELS   once it is prepared, a fingerprint of the bytes that
                    would be sent: the same picture by another name, or in
                    another format, is let go (pictureFingerprint).
*/

/** The same file, however it arrived: the picker, a paste, a drop. */
export function fileKey(file: { name?: string; size?: number; type?: string; lastModified?: number }): string {
  return [file.name ?? "", file.size ?? 0, (file.type ?? "").toLowerCase(), file.lastModified ?? 0].join("|")
}

/**
 * A fingerprint of a prepared picture's base64: FNV-1a over every character,
 * with the length. Two pictures that would send the same bytes have the same
 * one. Not a security hash: it only has to tell a duplicate from a new one.
 */
export function pictureFingerprint(data: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < data.length; i++) {
    h ^= data.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return `${data.length.toString(36)}:${h.toString(36)}`
}

/**
 * What a paste really holds. A copied image can arrive as several files that
 * are one picture (image.png and image.tiff); the first of a name is kept.
 * Two different screenshots, with different names, are both kept.
 */
export function pastedFiles<T extends { name?: string; type?: string }>(files: T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const file of files) {
    const base = (file.name ?? "").replace(/\.[a-z0-9]+$/i, "").toLowerCase()
    const key = kindOf(file) === "other" ? `other:${file.name}` : base || `${out.length}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(file)
  }
  return out
}

/**
 * The files from one gesture that are not already attached or arriving.
 * `taken` is every key in the composer and in flight; the result's keys are
 * added to it by the caller in the same tick, so a second route a moment
 * later finds them taken.
 */
export function newFiles<T extends { name?: string; size?: number; type?: string; lastModified?: number }>(files: T[], taken: ReadonlySet<string>): T[] {
  const seen = new Set(taken)
  const out: T[] = []
  for (const file of files) {
    const key = fileKey(file)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(file)
  }
  return out
}

/** "1.2 MB", "340 KB". */
export function sizeLabel(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/** Why a file cannot be attached, before any of it is read, or null. */
export function attachProblem(file: { type?: string; name?: string; size?: number }): string | null {
  const kind = kindOf(file)
  const name = file.name || "That file"
  const size = file.size ?? 0
  if (kind === "other") return `${name} can't be attached. Pictures and videos only.`
  if (kind === "video" && size > MAX_SOURCE_VIDEO_BYTES) return `${name} is ${sizeLabel(size)}. Videos up to ${sizeLabel(MAX_SOURCE_VIDEO_BYTES)} can be attached.`
  if (kind !== "video" && size > MAX_SOURCE_IMAGE_BYTES) return `${name} is ${sizeLabel(size)}. Pictures up to ${sizeLabel(MAX_SOURCE_IMAGE_BYTES)} can be attached.`
  return null
}

/** The size a picture is sent at: its own when it fits, else scaled so its long edge is `edge`. */
export function fitWithin(width: number, height: number, edge = LONG_EDGE): { width: number; height: number } {
  const long = Math.max(width, height)
  if (!long || long <= edge) return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) }
  const scale = edge / long
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/**
 * When the stills are taken, in seconds: evenly across the clip, away from
 * the very first and last frames (often black, or a fade).
 */
export function stillTimes(duration: number, count = VIDEO_STILLS): number[] {
  if (!Number.isFinite(duration) || duration <= 0) return [0]
  const n = Math.max(1, Math.min(count, Math.ceil(duration)))
  return Array.from({ length: n }, (_, i) => +((duration * (i + 1)) / (n + 1)).toFixed(3))
}

/** How many stills a video may become, given how many pictures are already attached. */
export function stillsRoom(attached: number, count = VIDEO_STILLS): number {
  return Math.max(0, Math.min(count, MAX_IMAGES - attached))
}

/** What to call the ring's progress for a screen reader. */
export function progressLabel(stage: "preparing" | "sending", fraction: number): string {
  const pct = Math.round(Math.max(0, Math.min(1, fraction)) * 100)
  return stage === "preparing" ? `Preparing, ${pct}%` : `Sending, ${pct}%`
}

/*
  ═══════════════════════════════════════════════════════════════════════════
   THE NOTE A STORED MESSAGE KEEPS FOR ITS PICTURES
  ═══════════════════════════════════════════════════════════════════════════
  The transcript keeps a message's words and, after them, a note of how many
  pictures came with it: "[an image attached]", "[3 images attached]". The
  pictures themselves are rows beside the message, kept thirty days
  (lib/website-builder/agent/attachment-store.ts). The note is what is left
  once they have gone, and it is how many tiles the thread draws: a picture
  that comes back is a thumbnail, one that does not is "Picture no longer
  available". It is never shown as text. One writer and one reader, here,
  used by the route that writes it, the history that names a conversation
  after it, and the thread that reads it back.
*/

/** "[an image attached]", "[3 images attached]", or "" for none. */
export function pictureNote(count: number): string {
  const n = Math.max(0, Math.floor(count))
  if (n === 0) return ""
  return `[${n === 1 ? "an image" : `${n} images`} attached]`
}

/** The words with the note after them, as the transcript stores a message. */
export function withPictureNote(words: string, count: number): string {
  const note = pictureNote(count)
  const text = words.trim()
  if (!note) return words
  return text ? `${text}\n\n${note}` : note
}

const PICTURE_NOTE = /\n*\[(an image|(\d+) images) attached\]\s*$/

/** A stored message read back: its words without the note, and how many pictures the note says it had. */
export function readPictureNote(content: string): { text: string; count: number } {
  const match = PICTURE_NOTE.exec(content)
  if (!match) return { text: content, count: 0 }
  const count = match[2] ? Math.max(1, Number.parseInt(match[2], 10) || 1) : 1
  return { text: content.slice(0, match.index).trim(), count }
}
