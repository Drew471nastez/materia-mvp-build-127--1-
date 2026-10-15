import "server-only"

/**
 * ===========================================================================
 *  WHAT HAPPENED LATELY, FOR A COMMUNITY'S OVERVIEW (round 32)
 * ===========================================================================
 * The newest posts and the newest members, read from their own rows and put
 * in one list by time: who, what, when, and where it opens. Nothing is
 * counted or estimated here; a community with no posts and nobody new shows
 * nothing (components/community/creator/overview.tsx says so in a line).
 *
 * Two reads of five rows each and one read of the people in them. A failed
 * read is an empty list, never an error on the overview.
 */
import { postPath } from "../post-url"
import type { OverviewActivity } from "@/components/community/creator/view-types"
import { peopleOf } from "./moderation"
import type { Db } from "./db"

/** How many lines the overview shows. */
export const ACTIVITY_LINES = 6

type PostRow = { id: string; title: string | null; body_text: string | null; author_id: string | null; created_at: string }
type JoinRow = { user_id: string; joined_at: string | null }

export async function overviewActivity(db: Db, community: { id: string; slug: string }): Promise<OverviewActivity[]> {
  try {
    const [posts, joins] = await Promise.all([
      db.from("community_feed_posts").select("id, title, body_text, author_id, created_at").eq("community_id", community.id).eq("status", "published").order("created_at", { ascending: false }).limit(5),
      db.from("community_members").select("user_id, joined_at").eq("community_id", community.id).eq("status", "active").not("joined_at", "is", null).order("joined_at", { ascending: false }).limit(5),
    ])
    const postRows = ((posts.data as PostRow[] | null) ?? []).filter((p) => p.author_id)
    const joinRows = ((joins.data as JoinRow[] | null) ?? []).filter((m) => m.joined_at)
    const people = await peopleOf(db, [...postRows.map((p) => p.author_id as string), ...joinRows.map((m) => m.user_id)])
    const base = `/app/community/${community.slug}`
    const lines: OverviewActivity[] = [
      ...postRows.map((p) => {
        const who = people.get(p.author_id as string)
        const words = (p.title || p.body_text || "").replace(/\s+/g, " ").trim().slice(0, 140)
        return { kind: "post" as const, id: `post:${p.id}`, name: who?.name ?? "Member", avatarUrl: who?.avatarUrl ?? null, text: words, at: p.created_at, href: postPath(community.slug, { id: p.id, title: p.title, bodyText: p.body_text }) }
      }),
      ...joinRows.map((m) => {
        const who = people.get(m.user_id)
        return { kind: "join" as const, id: `join:${m.user_id}`, name: who?.name ?? "Member", avatarUrl: who?.avatarUrl ?? null, text: "", at: m.joined_at as string, href: `${base}/members` }
      }),
    ]
    return lines.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, ACTIVITY_LINES)
  } catch {
    return []
  }
}
