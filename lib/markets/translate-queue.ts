import "server-only"

/**
 * ===========================================================================
 *  A STORE'S WEBSITE CHANGED: TRANSLATE IT IN A FEW MINUTES
 * ===========================================================================
 * Every save that changes what a visitor reads (Publish in the builder, a
 * page saved live, theme settings, menus, a product, a collection) calls
 * translationsChanged. For a store with "Translate changes automatically"
 * on, that writes the time on its row (store_localization.translate_dirty_at,
 * SQL part 179). Nothing else: one small update, after the answer, and a
 * failure is swallowed, so a save is never slower and never fails for it.
 *
 * The run every three minutes (/api/cron/translation-jobs, lib/markets/
 * auto-translate.ts runChangedStores) takes the stores whose last change is
 * SETTLE_MS old, so a burst of edits is translated once, and clears the
 * mark when the store is up to date. Stores that changed nothing cost
 * nothing.
 *
 * Before part 179 the column is not there: the update fails quietly and the
 * hourly run works through the stores as it always did.
 */
import { after } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

/** How long after the last change a store waits, so a run of edits is translated once. */
export const SETTLE_MS = 2 * 60_000

/** Part 179 has not run: the columns are not there. */
export function queueMissing(error: { code?: string; message?: string } | null | undefined): boolean {
  return !!error && /translate_dirty_at|translate_lease_until/.test(error.message ?? "")
}

/** Marks the store as having changes to translate, when its switch is on. Never throws. */
export async function markTranslationsChanged(db: Db, creatorId: string): Promise<void> {
  try {
    await db
      .from("store_localization")
      .update({ translate_dirty_at: new Date().toISOString() })
      .eq("creator_id", creatorId)
      .eq("auto_translate", true)
      .then(
        () => undefined,
        () => undefined,
      )
  } catch {
    /* Before part 175 or 179, or the database unreachable: the safety sweep finds the change later. */
  }
}

/**
 * Called by a save that changed the website's words: the mark is written
 * after the answer has gone. Outside a request (a script, a test) it is
 * written straight away instead.
 */
export function translationsChanged(creatorId: string | null | undefined): void {
  if (!creatorId) return
  const work = async () => {
    try {
      await markTranslationsChanged(createAdminClient(), creatorId)
    } catch {
      /* No admin client here: nothing to mark, and nothing to fail. */
    }
  }
  try {
    after(work)
  } catch {
    void work()
  }
}
