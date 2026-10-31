/**
 * ===========================================================================
 *  A PROFILE BY ITS NAME: THE EXACT NAME FIRST, THEN ANY CASE
 * ===========================================================================
 * storelib.com/<name> and /member/<name> found the profile with
 * `username ILIKE <name>`, on every visit. A plain index cannot answer
 * ILIKE, so Postgres read the trigram index or the whole table: 5ms on a
 * table of 100,000 profiles at best, 50ms when the name starts with a
 * common word and the planner gives up on the index
 * (scripts/measure-speed18-indexes.mjs).
 *
 * Names are saved lowercase now and every link the app makes carries the
 * name as it is stored, so the exact name almost always matches, and
 * `username = <name>` is answered by the username index in a tenth of a
 * millisecond. Only a name typed in another case than it is stored (an
 * older account kept as "ZarraBianco", asked for as /zarrabianco) misses
 * and is asked again exactly as before.
 *
 * It answers what ILIKE answered, with one difference that is a fix: ILIKE
 * read `_` and `%` in a name as wildcards, and two accounts matching that
 * way came back as an error and a 404 for both. The exact name is now found.
 */
import { readPublicRow, readPublicRowStrict } from "@/lib/security/public-rows"

type Client = Parameters<typeof readPublicRow>[0]

export async function publicProfileByName<T = any>(client: Client, username: string): Promise<T | null> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const exact = await readPublicRow<T>(client, "profiles", (q) => q.eq("username", username))
  if (exact) return exact
  return readPublicRow<T>(client, "profiles", (q) => q.ilike("username", username))
}

/** The same lookup, bounded, THROWING when a read failed (lib/security/public-rows readPublicRowStrict): for pages where null is a 404 or a redirect. */
export async function publicProfileByNameStrict<T = any>(client: Client, username: string): Promise<T | null> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const exact = await readPublicRowStrict<T>(client, "profiles", (q) => q.eq("username", username))
  if (exact) return exact
  return readPublicRowStrict<T>(client, "profiles", (q) => q.ilike("username", username))
}
