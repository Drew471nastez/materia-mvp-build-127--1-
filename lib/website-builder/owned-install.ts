/**
 * ===========================================================================
 *  "THEME NOT FOUND" ONLY WHEN IT IS NOT THERE
 * ===========================================================================
 * The editor's routes find the creator and their install with two reads and
 * answered 404 "Theme not found" whenever a read came back empty, including
 * when it came back empty because the read itself failed: a statement
 * timeout, a dropped connection, a 504 from the database's gateway. Under
 * load that is several times a minute, so somebody adjusting a slider was
 * told the website they were looking at did not exist.
 *
 * A read that fails is tried once more after a short pause, and a read that
 * fails twice is answered 503 with words that say what happened. Only a read
 * that worked and found nothing is "not found".
 */

export const UNREACHABLE = "Storelib could not reach your website just now. Your changes are still here; try again in a moment."

/** The read, and once more after a pause if it failed. */
export async function readTwice<R extends { error: unknown }>(run: () => PromiseLike<R>): Promise<R> {
  const first = await run()
  if (!first.error) return first
  await new Promise((r) => setTimeout(r, 250))
  return run()
}
