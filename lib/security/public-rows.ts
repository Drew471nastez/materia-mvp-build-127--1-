import { publicCreator, publicProfile } from "./public-columns"

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
