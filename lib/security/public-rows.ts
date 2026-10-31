import { publicCreator, publicProfile } from "./public-columns"
import { siteRead } from "@/lib/website-builder/site-read"

/**
 * One creator or profile row with every PUBLIC column, read through the
 * reader's own client (the anon key in a shared cache, the visitor's session
 * on a page), never the service role.
 *
 * Reads `creators_public` / `profiles_public` (run-now part 63): the same
 * table with the private columns left out, so `*` there is every public
 * column, whichever of them this database has. Before part 63 has run the
 * view does not exist and `*` on the table itself is still allowed, so that
 * is read instead, and cut to the public columns here. Either way no private
 * column comes back.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = { from: (table: string) => any }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Filter = (query: any) => any

const MISSING = new Set(["42P01", "PGRST205", "PGRST200"])

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function readPublicRow<T = any>(
  client: Client,
  table: "creators" | "profiles",
  filter: Filter,
): Promise<T | null> {
  const first = await filter(client.from(`${table}_public`).select("*")).maybeSingle()
  if (!first.error) return (first.data ?? null) as T | null
  if (!MISSING.has(String((first.error as { code?: string }).code ?? ""))) return null
  const old = await filter(client.from(table).select("*")).maybeSingle()
  if (old.error || !old.data) return null
  return (table === "creators" ? publicCreator(old.data) : publicProfile(old.data)) as T
}

/**
 * THE SAME ROW, WHERE "NOT THERE" DECIDES WHAT A VISITOR IS TOLD.
 *
 * readPublicRow above answers null for a row that is not there AND for a read
 * that failed, which is right where null only means "show less". It is wrong
 * where null becomes a 404 or a permanent redirect (the creator page and its
 * storefront gate): a statement timeout told visitors and search engines the
 * storefront had moved for good, or did not exist.
 *
 * This one is bounded (siteRead: two tries within the public page limits) and
 * THROWS a SiteReadError when the read failed or did not answer, so the page
 * shows its error screen with Try again. Only a read that answered and found
 * nothing is null. Same views, same fallback before part 63, same columns.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function readPublicRowStrict<T = any>(
  client: Client,
  table: "creators" | "profiles",
  filter: Filter,
): Promise<T | null> {
  let viewMissing = false
  const first = await siteRead<T>(`${table}_public`, async (signal) => {
    const r = await filter(client.from(`${table}_public`).select("*")).abortSignal(signal).maybeSingle()
    if (r.error && MISSING.has(String((r.error as { code?: string }).code ?? ""))) {
      viewMissing = true
      return { data: null, error: null }
    }
    return r
  })
  if (!viewMissing) return (first ?? null) as T | null
  const old = await siteRead<Record<string, unknown>>(table, (signal) =>
    filter(client.from(table).select("*")).abortSignal(signal).maybeSingle(),
  )
  if (!old) return null
  return (table === "creators" ? publicCreator(old) : publicProfile(old)) as T
}
