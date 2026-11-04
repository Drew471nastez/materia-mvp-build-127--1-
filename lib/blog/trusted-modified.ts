import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { blogSchema } from "./admin-store"

/**
 * A POST'S "UPDATED" DATE IS ONLY TRUSTED ONCE SQL PART 345 HAS RUN (round 47).
 *
 * Before it, the original trigger moves blog_posts.updated_at on every write,
 * and every reader's view is a write (the views counter). So a post nobody
 * touched for months read "Updated November 1" on the page, said so in its
 * BlogPosting dateModified, and told Google in the sitemap's lastmod that it
 * changed today, every day. Part 345 replaces the trigger so the date moves
 * only when something a reader sees changes.
 *
 * Until then the published date stands in for it: never newer than the truth.
 */
export async function trustsUpdatedAt(): Promise<boolean> {
  try {
    return (await blogSchema(createAdminClient())).full
  } catch {
    return false
  }
}

/** The rows with updated_at replaced by published_at when it cannot be trusted. */
export function withPublishedAsModified<T extends { updated_at?: string | null; published_at?: string | null }>(rows: T[], trusted: boolean): T[] {
  if (trusted) return rows
  return rows.map((r) => ({ ...r, updated_at: r.published_at ?? null }))
}
