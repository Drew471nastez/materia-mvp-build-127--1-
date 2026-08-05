/**
 * Which column a write was refused over — from either of the two engines that
 * can refuse it, which word it completely differently.
 *
 * Both the read path and the write path degrade by dropping a column the
 * database has not got and carrying on with the rest, and both were looking for
 * ONE of these sentences:
 *
 *   Postgres, SQLSTATE 42703:
 *     column "bio" of relation "profiles" does not exist
 *
 *   PostgREST, code PGRST204:
 *     Could not find the 'bio' column of 'profiles' in the schema cache
 *
 * The second is the one that actually happens. PostgREST keeps its own cached
 * picture of the schema and validates the request against THAT before Postgres
 * is ever asked, so a column added by a migration nobody has run — or one added
 * by a migration that HAS run, before the cache reloaded — never reaches the
 * database at all. It comes back as a sentence with no "does not exist" in it,
 * matched none of the patterns, and took the whole save down with it: a name
 * that had nowhere to go wrong failed to save because a bio did.
 *
 * Matching both is the fix. Written once, because two copies of "is this a
 * missing column" is how one of them ends up knowing about only one engine —
 * which is exactly what happened here.
 */
export function missingColumnFrom(message: string | undefined | null): string | null {
  const m = message ?? ""

  // Postgres. The column name may be bare, quoted, or table-qualified.
  const pg = /column\s+["']?[\w.]*?\b(\w+)["']?\s+(?:of relation\s+["'][\w.]+["']\s+)?does not exist/i.exec(m)?.[1]
  if (pg) return pg

  // PostgREST, checking its own schema cache before the statement is sent.
  const rest = /could not find the ['"]([\w]+)['"] column of ['"][\w.]+['"] in the schema cache/i.exec(m)?.[1]
  if (rest) return rest

  // Its shape for a missing column on a SELECT list, which is worded as a
  // relationship failure rather than as a column one.
  const alt = /column ['"]?([\w]+)['"]? does not exist/i.exec(m)?.[1]
  return alt ?? null
}
