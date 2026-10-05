import "server-only"

/**
 * ===========================================================================
 *  PICTURES IN POSTS AND COMMENTS, CHECKED BEFORE ANYBODY SEES THEM
 * ===========================================================================
 * Called by screenWrite and screenEdit (./safety.ts) for a post's or a
 * comment's pictures and video stills: the ones in Storelib's own picture
 * storage (a Giphy GIF is already rated PG-13 by the search, ./gifs.ts; a
 * link card's picture belongs to the linked site). Each picture is read
 * from storage and judged by lib/security/images/classify.ts:
 *
 *   refused  clearly explicit (only with the classifier on): the write is
 *            refused, the picture is deleted from storage when it is in the
 *            writer's own folder (its address stops working) and the
 *            platform's security log has it (file_security_events)
 *   held     likely adult content, or for a member on their first day a
 *            skin heavy picture or one that cannot be read: the write goes
 *            up hidden for a moderator (the hold safety.ts already has)
 *
 * WHEN IT RUNS. With the classifier off, only for a member on their first
 * day (nobody else's pictures are downloaded, so nothing costs a thing). With
 * it on, for everybody but the team's holds. One picture after another
 * inside IMAGE_CHECK.budgetMs; a picture not reached in time counts as not
 * read (held for a first day member, let through for anybody else).
 *
 * Fails open like the rest of safety.ts, except where noted for first day
 * members: a broken storage read never stops an established member posting.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { imageClassifier, judgePicture, readPicture, explicitOf, type PictureReading, type PictureVerdict } from "@/lib/security/images/classify"
import { logSecurityEvent } from "@/lib/security/uploads/audit"
import { PICTURE_BUCKET, picturePathOf } from "../post-media"
import type { PostMedia } from "../types"
import { reasonOf, type Db } from "./db"

export const IMAGE_CHECK = {
  /** A post carries ten things at most; a comment four. */
  maxPictures: 10,
  /** Time for all of a write's pictures together. */
  budgetMs: 8000,
  /** A picture larger than this is not read (the composer sends 2560px WebP, well under). */
  maxBytes: 25 * 1024 * 1024,
} as const

/** What a hold says to the moderator, by what decided it. */
export const PICTURE_HOLD_WORDS: Record<PictureVerdict["code"], string> = {
  clean: "",
  adult_explicit: "a picture that looks explicit",
  adult_likely: "a picture that may be adult content",
  adult_suggestive: "a picture that may be adult content",
  skin_heavy: "a picture with a lot of skin, from a member on their first day",
  unreadable: "a picture that could not be checked, from a member on their first day",
}

export const PICTURE_REFUSED = "That picture can't be posted on Storelib."

export interface PictureRef {
  path: string
  url: string
}

/** The pictures of a post or comment that are in Storelib's own storage: pictures and video stills, each once. */
export function picturesOf(media: unknown): PictureRef[] {
  const out: PictureRef[] = []
  const seen = new Set<string>()
  for (const m of Array.isArray(media) ? (media as PostMedia[]) : []) {
    if (!m || typeof m !== "object") continue
    const url = m.type === "image" ? m.url : m.type === "video" ? m.poster : undefined
    const path = picturePathOf(url)
    if (!path || seen.has(path)) continue
    seen.add(path)
    out.push({ path, url: String(url) })
  }
  return out.slice(0, IMAGE_CHECK.maxPictures)
}

/** How many uploaded videos a write carries (a video by address plays from YouTube, Vimeo or Loom). */
export function uploadedVideoCount(media: unknown): number {
  return (Array.isArray(media) ? (media as PostMedia[]) : []).filter((m) => m && typeof m === "object" && m.type === "video").length
}

/** Swappable in tests: where the bytes come from, the classifier, and the clock. */
export const imageCheckDeps = {
  download: async (db: Db, path: string): Promise<Uint8Array | null> => {
    const { data, error } = await (db as SupabaseClient).storage.from(PICTURE_BUCKET).download(path)
    if (error || !data) return null
    if (data.size > IMAGE_CHECK.maxBytes) return null
    return new Uint8Array(await data.arrayBuffer())
  },
  remove: async (db: Db, path: string): Promise<void> => {
    await (db as SupabaseClient).storage
      .from(PICTURE_BUCKET)
      .remove([path])
      .then(
        () => undefined,
        () => undefined,
      )
  },
  classifier: () => imageClassifier(),
  read: readPicture,
  log: (db: Db, e: Parameters<typeof logSecurityEvent>[1]) => logSecurityEvent(db as SupabaseClient, e),
  now: () => Date.now(),
}

const TIMED_OUT = Symbol("timed out")

/** A promise's value, or TIMED_OUT when it takes longer than this (it is left to finish on its own). */
function withinMs<T>(p: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => resolve(TIMED_OUT), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      },
    )
  })
}

export interface PictureScreen {
  /** The write must not go up. */
  refuse: boolean
  /** Reasons to hold it, each once. */
  hold: string[]
}

/**
 * Judges a write's pictures. `fresh` and `team` are safety.ts's isNewMember
 * and isTeam. Answers at once (nothing downloaded) when there is nothing a
 * verdict could change.
 */
export async function screenPictures(db: Db, who: { communityId: string; userId: string; fresh: boolean; team: boolean }, pictures: readonly PictureRef[]): Promise<PictureScreen> {
  const out: PictureScreen = { refuse: false, hold: [] }
  if (!pictures.length) return out
  const classifier = await imageCheckDeps.classifier().catch(() => null)
  /* Without the classifier only a first day member's pictures can change anything. */
  if (!classifier && (!who.fresh || who.team)) return out
  const stopAt = imageCheckDeps.now() + IMAGE_CHECK.budgetMs
  const hold = new Set<string>()
  for (const pic of pictures) {
    let reading: PictureReading | null = null
    let undecodable = false
    const left = stopAt - imageCheckDeps.now()
    if (left > 0) {
      try {
        /* One slow read never holds the write past the budget. */
        const bytes = await withinMs(imageCheckDeps.download(db, pic.path), left)
        if (bytes && bytes !== TIMED_OUT) {
          const read = await withinMs(imageCheckDeps.read(bytes, classifier), Math.max(1, stopAt - imageCheckDeps.now()))
          /* Slow is not the same as not a picture: only bytes that would not decode count as undecodable. */
          reading = read === TIMED_OUT ? null : read
          undecodable = read === null
        }
      } catch (e) {
        console.error(`[image-check] picture not read: ${reasonOf(e)}`)
      }
    }
    const verdict = judgePicture(reading, { fresh: who.fresh, team: who.team, undecodable, classifierOn: classifier !== null })
    if (verdict.action === "ok") continue
    await imageCheckDeps
      .log(db, {
        event: "upload",
        outcome: verdict.action === "refuse" ? "removed" : "noted",
        context: "community_picture",
        code: verdict.code,
        bucket: PICTURE_BUCKET,
        path: pic.path,
        userId: who.userId,
        provider: reading?.classes ? (classifier?.name ?? null) : "skin",
        detail: {
          communityId: who.communityId,
          action: verdict.action,
          frames: reading?.frames ?? 0,
          skin: reading?.skin.skin ?? null,
          explicit: reading?.classes ? Math.round(explicitOf(reading.classes) * 100) / 100 : null,
          sexy: reading?.classes ? Math.round(reading.classes.sexy * 100) / 100 : null,
        },
      })
      .catch(() => undefined)
    if (verdict.action === "refuse") {
      /* Deleted only from the writer's own folder: a post may point at somebody else's picture, and that is not this check's to delete. */
      if (pic.path.startsWith(`${who.userId}/community/`)) await imageCheckDeps.remove(db, pic.path)
      out.refuse = true
      return out
    }
    hold.add(PICTURE_HOLD_WORDS[verdict.code])
  }
  out.hold = [...hold]
  return out
}
