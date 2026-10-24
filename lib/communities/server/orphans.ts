import "server-only"

/**
 * ===========================================================================
 *  COMMUNITY UPLOADS NOTHING USES (a daily sweep)
 * ===========================================================================
 * A member picks a picture or a file in the composer, it uploads at once,
 * and then they take it out, or close the draft for good. The upload stays
 * in storage for nobody. This finds those and removes them, once a day from
 * /api/cron/storage-cleanup, erring towards keeping:
 *
 *   PICTURES  in the picture bucket, the member's own folder for the
 *             community, with the name the composer gives
 *             (<user>/community/<community>/<13 digit time>_<random>.<ext>,
 *             components/community/member/media-upload.ts). The storage
 *             listing of the last ORPHANS.lookBackDays (the hourly picture
 *             pass's own list, supabase storage_recent_public_images and
 *             storage_recent_public_objects) gives the candidates; one
 *             older than ORPHANS.graceDays whose name appears in no post,
 *             comment or chat message of that community (any status: a
 *             held, removed or deleted post keeps its pictures, so a
 *             moderator can restore it) by that member or by an account
 *             since deleted, is removed.
 *   FILES     in the private file bucket, the community's folder
 *             (<creator>/community-files/<community>/<member>/<file id>.<ext>,
 *             ./post-files.ts): one older than ORPHANS.graceDays that no
 *             post, comment or chat message of the community carries
 *             ({type:"file", assetId}), any status, is removed (a comments
 *             table without its media column keeps every file). A Library
 *             item's file, or a product's file at the same path, is used
 *             too (round 39). A seventh of the communities a day,
 *             so each is looked at once a week.
 *
 * WHY THE GRACE IS LONG. A draft keeps its pictures' addresses in the
 * browser (composer.tsx draftKey) and can come back days later; two weeks
 * covers a draft nobody returns to in good time, and a picture removed
 * after that shows as missing in a draft, never in a post.
 *
 * WHAT IT NEVER TOUCHES. Any path that is not exactly one of the shapes
 * above (a creator's product photos, gallery pictures, covers, logos and
 * videos live elsewhere); any community or member whose rows could not be
 * read this run (nothing is removed on a doubt); more than ORPHANS.maxRemove
 * a run. A dry run (?dry=1 on the cron route) says what would go.
 *
 * Videos are not swept here: a community video can be in a post, the
 * gallery, an event or a lesson, and the video library (./videos.ts) is
 * where its owner removes one.
 *
 * SCHEDULED POSTS AND DRAFTS CARRY THEM TOO (round 27, run-now part 222). A
 * post scheduled weeks ahead, or a team draft, keeps its pictures and files
 * in `community_scheduled_posts.media` until it goes up; they are used, and
 * kept, like a post's. A database without that table or column has none.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { STORAGE_BUCKET } from "@/lib/storage/plans"
import { COMMUNITY_FILES_FOLDER, PICTURE_BUCKET } from "../post-media"
import { missing, reasonOf } from "./db"

export const ORPHANS = {
  graceDays: 14,
  /** The storage listing reaches this far back (it allows 30); the days past the grace are the overlap a missed run needs. */
  lookBackDays: 17,
  /** Candidates read from each storage listing a run. */
  listLimit: 1000,
  maxRemove: 300,
  /** Communities whose files are looked at a run (a seventh of them by id, then this many at most). */
  fileCommunities: 200,
  /** The cron route has 300 seconds and the rest of its work takes up to 150. */
  budgetMs: 60_000,
} as const

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
/** The composer's picture path, and nothing else. */
export const COMMUNITY_PICTURE_PATH = new RegExp(`^(${UUID})/community/(${UUID})/(\\d{13}_[a-z0-9]{1,12}\\.(?:webp|jpe?g|png|gif|heic|heif|avif))$`, "i")
/** A member's post file path. */
export const COMMUNITY_FILE_PATH = new RegExp(`^(${UUID})/${COMMUNITY_FILES_FOLDER}/(${UUID})/(${UUID})/(${UUID})\\.[a-z0-9]{1,10}$`, "i")

export interface OrphanSummary {
  dryRun: boolean
  pictures: { candidates: number; removed: number; kept: number }
  files: { communities: number; candidates: number; removed: number; kept: number }
  errors: string[]
}

type StorageEntry = { name: string; created_at?: string | null; id?: string | null }

/** Swappable in tests. */
export const orphanDeps = {
  now: () => Date.now(),
}

function days(n: number): number {
  return n * 86_400_000
}

/** A folder's entries, up to 1000; null when it cannot be listed (keep everything in it). */
async function listFolder(admin: SupabaseClient, bucket: string, folder: string): Promise<StorageEntry[] | null> {
  const { data, error } = await admin.storage.from(bucket).list(folder, { limit: 1000, sortBy: { column: "name", order: "asc" } })
  if (error || !Array.isArray(data)) return null
  return data as StorageEntry[]
}

/** Every text a community's rows by these authors (and by deleted accounts) carry, since a moment; null when any read failed. */
async function referencesSince(admin: SupabaseClient, communityId: string, authorId: string, sinceIso: string): Promise<string | null> {
  const by = `author_id.eq.${authorId},author_id.is.null`
  /* Written or edited since: one "or" a query, so the post reads are two (by the member, by deleted accounts). */
  const fresh = `created_at.gte."${sinceIso}",edited_at.gte."${sinceIso}"`
  const [mine, orphaned, comments, messages, waiting] = await Promise.all([
    admin.from("community_feed_posts").select("title, body_text, media").eq("community_id", communityId).eq("author_id", authorId).or(fresh).limit(5000),
    admin.from("community_feed_posts").select("title, body_text, media").eq("community_id", communityId).is("author_id", null).or(fresh).limit(5000),
    admin.from("community_feed_comments").select("body, media").eq("community_id", communityId).or(by).gte("created_at", sinceIso).limit(5000),
    admin.from("community_messages").select("body, attachments").eq("community_id", communityId).or(by).gte("created_at", sinceIso).limit(5000),
    /* Scheduled posts and drafts, by anyone on the team (round 27): a picture is in its uploader's folder, whoever's post it is. */
    admin.from("community_scheduled_posts").select("media").eq("community_id", communityId).gte("updated_at", sinceIso).limit(5000),
  ])
  /* Before parts 194 and 222 there are none; any other failure keeps everything. */
  if (waiting.error && !missing(waiting.error)) return null
  /* A missing media column (a database before part 96) reads again without it. */
  let commentRows = comments.data as unknown[] | null
  if (comments.error && /media/.test(comments.error.message ?? "")) {
    const again = await admin.from("community_feed_comments").select("body").eq("community_id", communityId).or(by).gte("created_at", sinceIso).limit(5000)
    if (again.error) return null
    commentRows = again.data as unknown[]
  } else if (comments.error) return null
  if (mine.error || orphaned.error || messages.error) return null
  /*
    A conversation's and a group's messages carry pictures too (round 39): read like a channel's, or every picture sent
    in a direct message went after the grace. Before part 270 they carry none; any other failure keeps everything.
  */
  const [direct, grouped] = await Promise.all([
    admin.from("community_direct_messages").select("body, attachments").eq("community_id", communityId).or(by).gte("created_at", sinceIso).limit(5000),
    admin.from("community_chat_group_messages").select("body, attachments").eq("community_id", communityId).or(by).gte("created_at", sinceIso).limit(5000),
  ])
  if ((direct.error && !missing(direct.error)) || (grouped.error && !missing(grouped.error))) return null
  const chatRows = [...(direct.error ? [] : (direct.data ?? [])), ...(grouped.error ? [] : (grouped.data ?? []))]
  /* A read that came back full may have left a reference out: keep everything rather than guess. */
  const waitingRows = waiting.error ? [] : (waiting.data ?? [])
  if ([mine.data, orphaned.data, commentRows, messages.data, waitingRows, direct.data, grouped.data].some((d) => Array.isArray(d) && d.length >= 5000)) return null
  return JSON.stringify([mine.data ?? [], orphaned.data ?? [], commentRows ?? [], messages.data ?? [], waitingRows, chatRows])
}

/** Pictures uploaded for a community and never used. */
async function sweepPictures(admin: SupabaseClient, summary: OrphanSummary, stopAt: number): Promise<void> {
  const now = orphanDeps.now()
  const since = Math.round(days(ORPHANS.lookBackDays) / 60_000)
  const lists = await Promise.all(
    ["storage_recent_public_images", "storage_recent_public_objects"].map((fn) => admin.rpc(fn, { p_since_minutes: since, p_limit: ORPHANS.listLimit })),
  )
  const groups = new Map<string, Set<string>>()
  for (const l of lists) {
    if (l.error) {
      if (!/storage_recent_public/.test(l.error.message ?? "")) summary.errors.push(`picture list: ${l.error.message}`)
      continue
    }
    for (const o of (l.data ?? []) as { bucket_id: string; name: string }[]) {
      if (o.bucket_id !== PICTURE_BUCKET) continue
      const m = COMMUNITY_PICTURE_PATH.exec(o.name)
      if (!m) continue
      const key = `${m[1].toLowerCase()}/${m[2].toLowerCase()}`
      const set = groups.get(key) ?? new Set<string>()
      set.add(m[3])
      groups.set(key, set)
    }
  }
  /* Anything created in the window may be referenced by a row written or edited since its start (a day of margin). */
  const sinceIso = new Date(now - days(ORPHANS.lookBackDays + 1)).toISOString()
  for (const [key, names] of groups) {
    if (orphanDeps.now() > stopAt || summary.pictures.removed >= ORPHANS.maxRemove) break
    summary.pictures.candidates += names.size
    const [userId, communityId] = key.split("/")
    const folder = `${userId}/community/${communityId}`
    const entries = await listFolder(admin, PICTURE_BUCKET, folder)
    const refs = entries ? await referencesSince(admin, communityId, userId, sinceIso) : null
    if (!entries || refs === null) {
      summary.pictures.kept += names.size
      continue
    }
    const created = new Map(entries.map((e) => [e.name, e.created_at ? Date.parse(e.created_at) : NaN]))
    const gone: string[] = []
    for (const name of names) {
      const at = created.get(name)
      /* Not listed (already gone), no date, too young, or used: kept. */
      if (at === undefined || !Number.isFinite(at) || now - at < days(ORPHANS.graceDays) || refs.includes(name)) {
        summary.pictures.kept++
        continue
      }
      if (summary.pictures.removed + gone.length >= ORPHANS.maxRemove) break
      gone.push(`${folder}/${name}`)
    }
    if (!gone.length) continue
    if (!summary.dryRun) {
      const { error } = await admin.storage.from(PICTURE_BUCKET).remove(gone)
      if (error) {
        summary.errors.push(`pictures ${folder}: ${error.message}`)
        continue
      }
    }
    summary.pictures.removed += gone.length
  }
}

/** The communities whose files are looked at today: a seventh of them, by the last two hex digits of their id. */
export function fileDayShare(id: string, now: number): boolean {
  const digit = parseInt(id.replace(/-/g, "").slice(-2), 16)
  return Number.isFinite(digit) && digit % 7 === Math.floor(now / 86_400_000) % 7
}

/** Files attached to posts, then taken out. */
async function sweepFiles(admin: SupabaseClient, summary: OrphanSummary, stopAt: number): Promise<void> {
  const now = orphanDeps.now()
  const { data, error } = await admin.from("communities").select("id, creator_id").not("creator_id", "is", null).order("id", { ascending: true }).limit(5000)
  if (error) {
    summary.errors.push(`communities: ${error.message}`)
    return
  }
  const today = ((data as { id: string; creator_id: string }[] | null) ?? []).filter((c) => fileDayShare(c.id, now)).slice(0, ORPHANS.fileCommunities)
  for (const c of today) {
    if (orphanDeps.now() > stopAt || summary.files.removed >= ORPHANS.maxRemove) break
    summary.files.communities++
    const base = `${c.creator_id}/${COMMUNITY_FILES_FOLDER}/${c.id}`
    const members = await listFolder(admin, STORAGE_BUCKET, base)
    if (!members) continue
    for (const m of members) {
      /* A folder has no id in the listing; a file at this level is not one of ours. */
      if (m.id || !new RegExp(`^${UUID}$`, "i").test(m.name)) continue
      const files = await listFolder(admin, STORAGE_BUCKET, `${base}/${m.name}`)
      if (!files) continue
      const old = files.filter((f) => f.id && f.created_at && now - Date.parse(f.created_at) >= days(ORPHANS.graceDays))
      summary.files.candidates += old.length
      const gone: string[] = []
      for (const f of old) {
        const path = `${base}/${m.name}/${f.name}`
        const match = COMMUNITY_FILE_PATH.exec(path)
        if (!match) {
          summary.files.kept++
          continue
        }
        const fileId = match[4].toLowerCase()
        /* A post carries it, or an older comment or chat message (comments took files before round 12). */
        /* As JSON text: handed an array of objects, supabase-js writes `cs.{[object Object]}`, every read errors, and nothing is ever let go. */
        const carries = JSON.stringify([{ assetId: fileId }])
        const reads = await Promise.all([
          admin.from("community_feed_posts").select("id").eq("community_id", c.id).contains("media", carries).limit(1),
          admin.from("community_feed_comments").select("id").eq("community_id", c.id).contains("media", carries).limit(1),
          admin.from("community_messages").select("id").eq("community_id", c.id).contains("attachments", carries).limit(1),
        ])
        /* A scheduled post or a draft carrying it (round 27, part 222); before that part there are none. */
        const scheduled = await admin.from("community_scheduled_posts").select("id").eq("community_id", c.id).contains("media", carries).limit(1)
        if (!(scheduled.error && missing(scheduled.error))) reads.push(scheduled)
        /* A direct or group message carrying it (round 39); before part 270 there are none. */
        for (const table of ["community_direct_messages", "community_chat_group_messages"]) {
          const held = await admin.from(table).select("id").eq("community_id", c.id).contains("attachments", carries).limit(1)
          if (!(held.error && missing(held.error))) reads.push(held)
        }
        /* Round 39: a Library item's file (part 278), and any product's file at this path (a sold resource's product, which its buyers keep after the item changes). */
        const library = await admin.from("community_library_items").select("id").eq("community_id", c.id).contains("files", JSON.stringify([{ fileId }])).limit(1)
        if (!(library.error && missing(library.error))) reads.push(library)
        reads.push(await admin.from("digital_assets").select("id").eq("file_path", path).limit(1))
        if (reads.some((r) => r.error || !Array.isArray(r.data) || r.data.length)) {
          summary.files.kept++
          continue
        }
        if (summary.files.removed + gone.length >= ORPHANS.maxRemove) break
        gone.push(path)
      }
      if (!gone.length) continue
      if (!summary.dryRun) {
        const { error: removeError } = await admin.storage.from(STORAGE_BUCKET).remove(gone)
        if (removeError) {
          summary.errors.push(`files ${base}: ${removeError.message}`)
          continue
        }
      }
      summary.files.removed += gone.length
    }
  }
}

/** The sweep. Never throws: what went wrong is in `errors`, and nothing doubtful was removed. */
export async function sweepCommunityOrphans(admin: SupabaseClient, options: { dryRun?: boolean } = {}): Promise<OrphanSummary> {
  const summary: OrphanSummary = { dryRun: options.dryRun === true, pictures: { candidates: 0, removed: 0, kept: 0 }, files: { communities: 0, candidates: 0, removed: 0, kept: 0 }, errors: [] }
  const stopAt = orphanDeps.now() + ORPHANS.budgetMs
  try {
    await sweepPictures(admin, summary, stopAt)
  } catch (e) {
    summary.errors.push(`pictures: ${reasonOf(e)}`)
  }
  try {
    await sweepFiles(admin, summary, stopAt)
  } catch (e) {
    summary.errors.push(`files: ${reasonOf(e)}`)
  }
  return summary
}
