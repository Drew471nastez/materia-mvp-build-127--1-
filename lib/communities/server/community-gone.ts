import "server-only"

/**
 * ===========================================================================
 *  A COMMUNITY DELETED: GONE FROM WHAT IT LEFT BEHIND (round 51)
 * ===========================================================================
 * The owner: "I want to be able to delete a community completely, so it no
 * longer shows anywhere, not only archived."
 *
 * Every list already reads `deleted_at` (Explore, the sitemap, the owner's
 * /app, a member's library and profile, the nav, the jobs), and its pages
 * answer 404 (loadCommunity). Three things did not, because they are not a
 * read of the community but copies made while it was alive:
 *
 *   THE BELL   every member's community_notifications rows, and the
 *              user_notifications that link into it ("a creator you follow
 *              made a community", a direct message). They stayed in the
 *              list, in the unread count and in the summary push, each
 *              opening a 404. They are deleted here.
 *   ENGINES    only /community/<slug> was sent to IndexNow. Its old
 *              addresses, its About page and its public posts were indexed
 *              too; all of them are sent now, the posts only when it was a
 *              public community (a private one's post addresses were never
 *              public and are not handed out now).
 *   COPIES     the stored copy of its public pages (lib/edge/snapshot-capture)
 *              was served for a week during a database outage. It is asked
 *              again, answers 404, and is deleted.
 *
 * Called by both ways a community is deleted, at the moment deleted_at is
 * written: ./creator.ts deleteCommunity (nobody pays) and
 * ./community-deletion.ts completeIfDue (somebody paid, when the date comes).
 * The bell is cleared before the answer; engines and copies after it
 * (./community-gone-announce.ts, loaded only then). Never throws.
 */
import { after } from "next/server"
import { listedPublicly } from "../access-model"
import type { CommunityRow } from "../types"
import { missing, reasonOf, type Db } from "./db"

const SLUG = /^[a-z0-9-]{1,64}$/

/** Every address the community answered to: its own and the ones in community_slug_history (part 94). */
export async function addressesOf(db: Db, c: Pick<CommunityRow, "id" | "slug">): Promise<string[]> {
  const out = new Set<string>([c.slug])
  try {
    const { data, error } = await db.from("community_slug_history").select("slug").eq("community_id", c.id).limit(50)
    if (error && !missing(error)) console.error(`[communities] gone old addresses ${c.id}: ${reasonOf(error)}`)
    for (const r of (data as { slug: string }[] | null) ?? []) if (typeof r.slug === "string") out.add(r.slug.toLowerCase())
  } catch (e) {
    console.error(`[communities] gone old addresses ${c.id}: ${reasonOf(e)}`)
  }
  return [...out].filter((s) => SLUG.test(s))
}

/** user_notifications rows that open somewhere in it: /community/<slug>, /community/<slug>/..., /community/<slug>?... */
export function linkFilter(slugs: string[]): string {
  return slugs.flatMap((s) => [`url.eq."/community/${s}"`, `url.like."/community/${s}/%"`, `url.like."/community/${s}?%"`]).join(",")
}

/** Its rows in everybody's bell, in both tables. */
export async function clearGoneNotifications(db: Db, communityId: string, slugs: string[]): Promise<void> {
  try {
    const { error } = await db.from("community_notifications").delete().eq("community_id", communityId)
    if (error && !missing(error)) console.error(`[communities] gone bell ${communityId}: ${reasonOf(error)}`)
  } catch (e) {
    console.error(`[communities] gone bell ${communityId}: ${reasonOf(e)}`)
  }
  if (!slugs.length) return
  try {
    const { error } = await db.from("user_notifications").delete().or(linkFilter(slugs))
    if (error && !missing(error)) console.error(`[communities] gone user bell ${communityId}: ${reasonOf(error)}`)
  } catch (e) {
    console.error(`[communities] gone user bell ${communityId}: ${reasonOf(e)}`)
  }
}

/**
 * Right after deleted_at is written. `wasStatus` is what it was before the
 * deletion started (a scheduled one was archived meanwhile), so a community
 * that was public has its public posts sent to the engines.
 */
export async function communityGone(db: Db, c: CommunityRow, wasStatus: string): Promise<void> {
  const slugs = await addressesOf(db, c)
  await clearGoneNotifications(db, c.id, slugs)
  const wasPublic = wasStatus === "published" && listedPublicly(c) && !c.platform_hidden && !c.suspended_at
  const run = () =>
    import("./community-gone-announce")
      .then((m) => m.announceCommunityGone(db, { id: c.id, slugs, wasPublic }))
      .catch((e) => console.error(`[communities] gone announce ${c.id}: ${reasonOf(e)}`))
  try {
    after(run)
  } catch {
    void run()
  }
}
