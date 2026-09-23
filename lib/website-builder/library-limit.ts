/**
 * ===========================================================================
 *  ONE LIVE WEBSITE AND TWO DRAFTS
 * ===========================================================================
 * A creator keeps at most THEME_INSTALL_LIMIT websites: the one that is live
 * and two they are working on. Only one can be published at a time; the
 * publish route already unpublishes the previous one.
 *
 * The limit was checked by "Add theme" alone. Duplicate and Import wrote a
 * new website without asking, so a library the page said was full could
 * still grow, one copy at a time. Every route that creates a website asks
 * here first, and the answer comes from the database rather than from
 * whatever count the page had when it was drawn.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { THEME_INSTALL_LIMIT } from "./theme-registry"

export const LIBRARY_FULL_MESSAGE = `You can keep ${THEME_INSTALL_LIMIT} websites: one live and ${THEME_INSTALL_LIMIT - 1} drafts. Remove one to add another.`

/** How many more websites this creator may add. Never negative. */
export async function librarySlotsLeft(supabase: SupabaseClient, creatorId: string): Promise<number> {
  const { count, error } = await supabase
    .from("store_theme_installs")
    .select("id", { count: "exact", head: true })
    .eq("creator_id", creatorId)
  /* A count that could not be read is treated as full. Refusing one add is
     recoverable; a fourth website nobody can see the limit of is not. */
  if (error) return 0
  return Math.max(0, THEME_INSTALL_LIMIT - (count ?? 0))
}
