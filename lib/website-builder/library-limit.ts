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

/** "You can keep 7 websites: one live and 6 drafts." */
export const LIBRARY_RULE = `You can keep ${THEME_INSTALL_LIMIT} websites: one live and ${DRAFT_LIMIT} ${DRAFT_LIMIT === 1 ? "draft" : "drafts"}.`

/** "One live website and 6 drafts", for a heading. */
export const LIBRARY_RULE_TITLE = `One live website and ${DRAFT_LIMIT} ${DRAFT_LIMIT === 1 ? "draft" : "drafts"}`

export const LIBRARY_FULL_MESSAGE = `${LIBRARY_RULE} Remove one to add another.`

/** Sent with a refusal, so the page can open the full library sheet rather than show a toast. */
export const LIBRARY_FULL_CODE = "library_full"

/**
 * ===========================================================================
 *  TWO AT ONCE STILL MAKE SEVEN
 * ===========================================================================
 * librarySlotsLeft, below, counts before the insert. Two requests at the same
 * moment (an import and a duplicate, two tabs, a double tap) both read 6 and
 * both insert, and the library holds 8. Two guards close that:
 *
 *   1. The database refuses the insert itself once a creator has
 *      THEME_INSTALL_LIMIT websites (supabase/sql/RUN_THEME_LIBRARY_LIMIT.sql).
 *      Its trigger takes a lock per creator, so concurrent inserts for one
 *      creator are counted one after the other. The refusal's message is
 *      LIBRARY_FULL_CODE, which isLibraryFullError reads.
 *   2. Until that file has been run on a database, every route counts again
 *      right after its insert (keptWithinLimit) and removes its own row if
 *      the library went past the limit. Each request counts after its own
 *      insert has committed, so the later of two always sees both and backs
 *      out. At worst both back out and the person tries again; the library
 *      never ends up over.
 */

/** The database's own refusal (RUN_THEME_LIBRARY_LIMIT.sql), read as a full library. */
export function isLibraryFullError(error: { message?: unknown } | null | undefined): boolean {
  return !!error && typeof error.message === "string" && error.message.includes(LIBRARY_FULL_CODE)
}

/**
 * After an insert: is this creator still within the limit? If not, the new
 * website is removed again and the answer is false, which the route sends as
 * a full library. A count that cannot be read keeps the website: the check
 * before the insert passed, and removing a real website on a failed read is
 * the worse mistake.
 */
export async function keptWithinLimit(admin: SupabaseClient, creatorId: string, installId: string): Promise<boolean> {
  const { count, error } = await admin
    .from("store_theme_installs")
    .select("id", { count: "exact", head: true })
    .eq("creator_id", creatorId)
  if (error || count === null || count <= THEME_INSTALL_LIMIT) return true
  await admin.from("store_theme_installs").delete().eq("id", installId).eq("creator_id", creatorId)
  return false
}

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

/**
 * Where an IMPORTED website goes: before every website already there.
 *
 * An import is the website somebody has just brought in and is about to
 * open, so it is the first row of the library, not the last one below the
 * fold. The page draws it there while it uploads (app/app/website-builder/
 * incoming.tsx), and scrolls to it and rings it when it lands. The lowest
 * place minus one, so it never ties with another; `sort_order` is a plain
 * integer and may go below zero.
 */
export async function firstSortOrder(supabase: SupabaseClient, creatorId: string): Promise<number> {
  const { data } = await supabase
    .from("store_theme_installs")
    .select("sort_order")
    .eq("creator_id", creatorId)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle()
  return sortOrderBefore(typeof data?.sort_order === "number" ? data.sort_order : null)
}

/** The place before the first one, or 0 in an empty library. Pure, for the test. */
export function sortOrderBefore(lowest: number | null): number {
  return lowest === null ? 0 : lowest - 1
}
