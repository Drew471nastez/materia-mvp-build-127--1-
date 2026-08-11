import "server-only"

import { missingColumnFrom } from "@/lib/profile/missing-column"

/**
 * Reading a profile row without knowing which migrations this database has had.
 *
 * `profiles` has grown three optional columns at three different times —
 * `last_seen_at` with presence, `bio` and `cover_url` with covers — and a
 * `select` naming a column that is not there fails the WHOLE query. So a page
 * that asks for all of them renders nothing at all on a database missing any
 * one of them, which is a blank profile caused by a feature nobody had turned
 * on yet.
 *
 * The obvious fix — try the full list, fall back to the columns that have
 * always existed — is worse than it looks. It is one fallback for three
 * independent features, so a project that HAS run the presence migration but
 * not the covers one silently loses its presence dots too: the query it was
 * relying on now fails for an unrelated reason and takes everything optional
 * down with it. The dot would go out across the whole app the moment covers
 * shipped, and nothing would say why.
 *
 * So the missing column is READ OUT OF THE ERROR and dropped by name, and the
 * query is retried without it. Both engines that can refuse one name it, though
 * they word it entirely differently — see lib/profile/missing-column.ts, which
 * exists because only one of the two was being matched. At most one extra round trip per absent
 * column, only on a database that is behind, and never in a correct
 * deployment.
 *
 * The set of columns that answered comes back with the row, because "the value
 * is null" and "this database cannot tell you" are different facts and the
 * presence dot in particular must never render the second as the first — a grey
 * dot claiming somebody is offline when nothing was ever asked is worse than no
 * dot at all.
 */

export type ProfileRow = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  created_at: string | null
  last_seen_at?: string | null
  bio?: string | null
  cover_url?: string | null
  /** The blue check and the Storelib mark. See components/marketplace/
   *  profile-badges.tsx; both arrive with RUN_MESSAGING_ALL.sql and are absent
   *  until it has run, which the `present` set below reports honestly. */
  is_verified?: boolean | null
  is_staff?: boolean | null
}

/** Present since the table existed. If one of these is missing, something is
 *  wrong that a retry cannot fix. */
const BASE_COLS = ["id", "username", "display_name", "avatar_url", "created_at"]

/** Added by later migrations, each independently. */
const EXTRA_COLS = ["last_seen_at", "bio", "cover_url", "is_verified", "is_staff"]

type Run = (cols: string) => PromiseLike<{ data: unknown; error: { message?: string } | null }>

export async function readProfileRow(
  run: Run,
  options: { extras?: string[] } = {},
): Promise<{ row: ProfileRow | null; present: Set<string> }> {
  const wanted = options.extras ?? EXTRA_COLS
  let cols = [...BASE_COLS, ...wanted]

  // One attempt per column that could be missing, plus the first.
  for (let i = 0; i <= wanted.length; i++) {
    const { data, error } = await run(cols.join(", "))
    if (!error) return { row: (data as ProfileRow | null) ?? null, present: new Set(cols) }

    const missing = missingColumnFrom(error.message)
    // An error that is not a missing optional column — a network fault, a
    // permission problem — is not something dropping columns will fix, and
    // retrying three more times would only make it slower.
    if (!missing || !cols.includes(missing) || BASE_COLS.includes(missing)) break
    cols = cols.filter((c) => c !== missing)
  }

  const { data } = await run(BASE_COLS.join(", "))
  return { row: (data as ProfileRow | null) ?? null, present: new Set(BASE_COLS) }
}
