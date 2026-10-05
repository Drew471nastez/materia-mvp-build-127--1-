import type { Db } from "./db"
import { parsePostParam } from "../post-url"

/** Turn a route segment (uuid or slug-shortId) into the post's uuid, or null. */
export async function resolvePostId(db: Db, communityId: string, param: string): Promise<string | null> {
  const parsed = parsePostParam(param)
  if (!parsed) return null
  if (parsed.kind === "uuid") return parsed.id
  const { data, error } = await db
    .from("community_feed_posts")
    .select("id")
    .eq("community_id", communityId)
    .ilike("id", `${parsed.short}%`)
    .limit(1)
    .maybeSingle()
  if (error || !data) return null
  return (data as { id: string }).id
}
