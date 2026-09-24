/**
 * ===========================================================================
 *  ONE LIVE WEBSITE AND THE REST DRAFTS
 * ===========================================================================
 * A creator keeps at most THEME_INSTALL_LIMIT websites: the one that is live
 * and the drafts they are working on. Only one can be published at a time;
 * the publish route already unpublishes the previous one.
 *
 * The limit was checked by "Add theme" alone. Duplicate and Import wrote a
 * new website without asking, so a library the page said was full could
 * still grow, one copy at a time. Every route that creates a website asks
 * here first, and the answer comes from the database rather than from
 * whatever count the page had when it was drawn.
 *
 * The rule's words are written here once, from the number, so changing the
 * limit changes every sentence that states it: the routes' refusal, the
 * library's counter and the full library sheet.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { THEME_INSTALL_LIMIT } from "./theme-registry"

/** Drafts a creator can keep beside the live website. */
export const DRAFT_LIMIT = THEME_INSTALL_LIMIT - 1

/** "You can keep 5 websites: one live and 4 drafts." */
export const LIBRARY_RULE = `You can keep ${THEME_INSTALL_LIMIT} websites: one live and ${DRAFT_LIMIT} ${DRAFT_LIMIT === 1 ? "draft" : "drafts"}.`

/** "One live website and 4 drafts", for a heading. */
export const LIBRARY_RULE_TITLE = `One live website and ${DRAFT_LIMIT} ${DRAFT_LIMIT === 1 ? "draft" : "drafts"}`

export const LIBRARY_FULL_MESSAGE = `${LIBRARY_RULE} Remove one to add another.`

/** Sent with a refusal, so the page can open the full library sheet rather than show a toast. */
export const LIBRARY_FULL_CODE = "library_full"

/** How many more websites this creator may add. Never negative. */
export async function librarySlotsLeft(supabase: SupabaseClient, creatorId: string): Promise<number> {
  const { count, error } = await supabase
    .from("store_theme_installs")
    .select("id", { count: "exact", head: true })
    .eq("creator_id", creatorId)
  /* A count that could not be read is treated as full. Refusing one add is
     recoverable; a website past the limit nobody can see is not. */
  if (error) return 0
  return Math.max(0, THEME_INSTALL_LIMIT - (count ?? 0))
}

/**
 * Where a new website goes: after every website already there.
 *
 * The page lists websites by `sort_order`, and it draws the incoming one at
 * the end of the library while it is being made, so the real one has to land
 * there too. Add and Duplicate used the COUNT plus one, which after a delete
 * could equal an existing website's place and put the new one somewhere in
 * the middle, or tied with another. The highest place plus one never does.
 */
export async function nextSortOrder(supabase: SupabaseClient, creatorId: string): Promise<number> {
  const { data } = await supabase
    .from("store_theme_installs")
    .select("sort_order")
    .eq("creator_id", creatorId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle()
  const top = typeof data?.sort_order === "number" ? data.sort_order : -1
  return top + 1
}
