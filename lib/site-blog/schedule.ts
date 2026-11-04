import type { SitePostStatus } from "./types"

/** A post's status from its row. A published post whose date is ahead is scheduled; it goes live by itself at that time, no job needed. */
export function postStatusOf(row: { status: string; published_at: string | null }, now: number = Date.now()): SitePostStatus {
  if (row.status === "archived") return "archived"
  if (row.status !== "published") return "draft"
  const at = row.published_at ? Date.parse(row.published_at) : NaN
  return Number.isFinite(at) && at > now ? "scheduled" : "published"
}

export function isLive(row: { status: string; published_at: string | null }, now: number = Date.now()): boolean {
  return postStatusOf(row, now) === "published"
}
