import "server-only"

import type { Db } from "./db"
import { parsePostParam, postShortIdRange } from "../post-url"

/** Turn a route segment (uuid or slug-shortId) into the post's uuid, or null. */
export async function resolvePostId(db: Db, communityId: string, param: string): Promise<string | null> {
  const parsed = parsePostParam(param)
  if (!parsed) return null
  if (parsed.kind === "uuid") return parsed.id
  const range = postShortIdRange(parsed.short)
  let q = db.from("community_feed_posts").select("id").eq("community_id", communityId).gte("id", range.from)
  if (range.to) q = q.lt("id", range.to)
  const { data, error } = await q.limit(1).maybeSingle()
  if (error || !data) return null
  return (data as { id: string }).id
}
