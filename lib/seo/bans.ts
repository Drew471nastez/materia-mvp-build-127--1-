import "server-only"

/**
 * ===========================================================================
 *  A BANNED CREATOR IS NOT LISTED, ANNOUNCED OR SERVED
 * ===========================================================================
 * A ban (app/api/admin/creators/moderate) sets creators.banned_at and
 * unpublishes the products, and that is all it did: the creator's website
 * and OnePage stayed up and indexable, the website stayed in storelib.com's
 * sitemap, and a product republished after the ban was listed again. These
 * are the reads that close that, for the sitemaps, the pages and IndexNow.
 *
 * SOFT, ALWAYS. `banned_at` arrives with sql/20260919_creator_bans.sql and a
 * database that has not run it has no such column. A read that names a
 * missing column fails as a whole, so every read here treats an error as "no
 * bans", which is what a database without the column means anyway. Nothing
 * that serves a page or a sitemap fails because of this file.
 */
import { unstable_cache } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"

type Admin = ReturnType<typeof createAdminClient>

/** Rows per request: PostgREST answers at most `max_rows`, 1,000 on Supabase. */
const PAGE = 1000

/**
 * Every banned creator's id. The banned set is the small one (the column has
 * a partial index for exactly this read), so a sitemap file asks once.
 */
export async function bannedCreatorIds(admin: Admin = createAdminClient()): Promise<Set<string>> {
  const out = new Set<string>()
  try {
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await admin
        .from("creators")
        .select("id")
        .not("banned_at", "is", null)
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1)
      if (error) return out
      for (const row of (data ?? []) as { id: string }[]) out.add(row.id)
      if (!data || data.length < PAGE) return out
    }
  } catch {
    return out
  }
}

/** Whether a creator is banned, from a row read whole (`*`), so a missing column is simply absent. */
export function isBanned(row: { banned_at?: string | null } | null | undefined): boolean {
  return !!row?.banned_at
}

/**
 * Whether this creator is banned, held for a minute: long enough that a busy
 * page asks once, short enough that a ban or its lifting shows within it.
 */
export async function creatorIsBanned(creatorId: string): Promise<boolean> {
  return unstable_cache(
    async () => {
      try {
        const { data, error } = await createAdminClient().from("creators").select("*").eq("id", creatorId).maybeSingle()
        return !error && isBanned(data as { banned_at?: string | null } | null)
      } catch {
        return false
      }
    },
    ["creator-banned", creatorId],
    { revalidate: 60 },
  )()
}
