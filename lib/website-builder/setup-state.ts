import "server-only"

import { unstable_cache } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * ===========================================================================
 *  WHAT IS NOT SET UP YET, SAID OUT LOUD
 * ===========================================================================
 * Three migrations ship with the builder and are run by a person, once, in
 * the Supabase SQL editor. Every route that needs one falls back when it is
 * missing, which is right — a publish must not fail on a timestamp — but the
 * fallbacks are silent, and silence is how all three came to be unrun for
 * months without anybody noticing:
 *
 *   RUN_THEME_BACKUPS.sql       publish takes a backup. Without it, publish
 *                               takes none, and the first anybody knows is
 *                               the day they want one back.
 *   RUN_THEME_PUBLISHED_AT.sql  "published 4 minutes ago". Without it the
 *                               panel can say Published and not when.
 *   RUN_THEME_FILE_DRAFTS.sql   a saved section file waits for Publish, and
 *                               every save is kept. Without it a save is
 *                               live that second and the old version is gone.
 *
 * The last one changes what Save means, so it is not a detail. This asks the
 * database the cheapest question that can tell, and the editor shows the
 * answer where the loss would happen rather than in a log nobody reads.
 */

export interface SetupState {
  /** RUN_THEME_BACKUPS.sql */
  backups: boolean
  /** RUN_THEME_PUBLISHED_AT.sql */
  publishedAt: boolean
  /** RUN_THEME_FILE_DRAFTS.sql */
  fileDrafts: boolean
}

/** The file to run for each thing that is missing. */
export const SETUP_SQL: Record<keyof SetupState, string> = {
  backups: "RUN_THEME_BACKUPS.sql",
  publishedAt: "RUN_THEME_PUBLISHED_AT.sql",
  fileDrafts: "RUN_THEME_FILE_DRAFTS.sql",
}

/**
 * A table or column that is not there answers with an error rather than an
 * empty list, which is the whole test. `limit(1)` on an empty table is not an
 * error, so this says nothing about whether anybody has used the feature.
 */
async function present(run: () => Promise<{ error: unknown }>): Promise<boolean> {
  try {
    const { error } = await run()
    return !error
  } catch {
    return false
  }
}

/**
 * Held for five minutes. A migration is run once, by hand, and the answer is
 * the same for everybody, so this is one lookup for the whole deployment
 * rather than one per editor load.
 */
export const readSetupState = unstable_cache(
  async (): Promise<SetupState> => {
    const db = createAdminClient()
    const [backups, publishedAt, fileDrafts] = await Promise.all([
      present(() => db.from("store_theme_backups").select("id").limit(1) as never),
      present(() => db.from("store_theme_installs").select("published_at").limit(1) as never),
      present(() => db.from("store_theme_file_versions").select("id").limit(1) as never),
    ])
    return { backups, publishedAt, fileDrafts }
  },
  ["website-builder-setup-state"],
  { revalidate: 300 },
)

/** The migrations still to run, in the order they matter. */
export function missingSetup(state: SetupState): string[] {
  return (Object.keys(SETUP_SQL) as (keyof SetupState)[]).filter((k) => !state[k]).map((k) => SETUP_SQL[k])
}
