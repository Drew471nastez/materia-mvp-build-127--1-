/**
 * The questions lib/onepage/resolve-address asks, answered from Supabase.
 * Used by the page (with the admin client, every column) and by proxy.ts
 * (with its own client, only the columns it needs), so both look a name up
 * the same way.
 *
 * EVERY MATCH ON A NAME IS IN ANY CASE, with `_` and `%` literal
 * (exactIlike): an ILIKE pattern would read `a_b` as "a, any character, b"
 * and could answer with somebody else's page.
 *
 * ONE ROW, NEVER "EXACTLY ONE". `.limit(1)` before `.maybeSingle()`: a
 * maybeSingle over two rows is an error, and supabase-js hands an error back
 * as no data, so an account with two OnePage rows read as an account with
 * none.
 *
 * A failed read throws, so the caller can tell "nobody" from "could not
 * ask". The history tables are the exception: a database that does not have
 * one yet (onepage_slug_history comes with its part in
 * supabase/sql/run-now) simply has no history in it.
 *
 * No `server-only` here: proxy.ts imports it, and it holds no secret; the
 * client it is handed does.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import type { OnePageAddressLookup } from "@/lib/onepage/resolve-address"
import { exactIlike } from "@/lib/onepage/username"

interface Answer<T> {
  data: T | null
  error: { code?: string; message?: string } | null
}

function must<T>(answer: Answer<T>): T | null {
  if (answer.error) throw new Error(answer.error.message || "lookup failed")
  return answer.data ?? null
}

/** A table the database does not have yet: Postgres's own code, or PostgREST's when its schema cache has no such table. */
function noSuchTable(error: Answer<unknown>["error"]): boolean {
  return !!error && (error.code === "42P01" || error.code === "PGRST205" || /does not exist|schema cache/i.test(error.message || ""))
}

function history<T>(answer: Answer<T>): T | null {
  if (answer.error && noSuchTable(answer.error)) return null
  return must(answer)
}

/**
 * `attemptMs`, when given, ends each query at that limit (its request
 * aborted): a lookup that does not answer is a failed lookup, which throws,
 * never one that holds the page for as long as the database takes. The proxy
 * keeps its own race and passes none.
 */
export function supabaseOnePageLookup<Row = Record<string, unknown>>(
  db: SupabaseClient,
  columns = "*",
  { attemptMs }: { attemptMs?: number } = {},
): OnePageAddressLookup<Row> {
  /* Every query's `from`, with its own deadline when one was asked for. */
  const supabase = (attemptMs
    ? {
        /* Every query here is `from(table).select(...)`, so the deadline goes on at select. */
        from: (table: string) => ({
          select: (cols: string) => {
            const q = db.from(table).select(cols)
            /* supabase-js always has it; a hand-made client may not, and then has no deadline to give. */
            return typeof q.abortSignal === "function" ? q.abortSignal(AbortSignal.timeout(attemptMs)) : q
          },
        }),
      }
    : db) as unknown as SupabaseClient
  const published = () => supabase.from("onepages").select(columns).eq("status", "published")

  return {
    async pageBySlug(name) {
      /* The exact address first, which the slug index answers; then any case. */
      const exact = must((await published().eq("slug", name).limit(1).maybeSingle()) as Answer<Row>)
      if (exact) return exact
      return must((await published().ilike("slug", exactIlike(name)).limit(1).maybeSingle()) as Answer<Row>)
    },

    async accountByUsername(name) {
      const row = must(
        (await supabase.from("profiles").select("id, username").ilike("username", exactIlike(name)).limit(1).maybeSingle()) as Answer<{
          id: string
          username: string | null
        }>,
      )
      return row?.id && row.username ? { id: row.id, username: row.username } : null
    },

    async pageOfAccount(accountId) {
      /*
        Found by the creator it names (seller_id, then creator_id), then by the login that owns it.
        Only a page this account OWNS (round AW): seller_id and creator_id are columns a page's
        owner writes, so a page somebody else owns could name this creator's store and would
        otherwise answer at this account's address (part 453 stops new ones in the database).
      */
      const creator = must((await supabase.from("creators").select("id").eq("user_id", accountId).limit(1).maybeSingle()) as Answer<{ id: string }>)
      if (creator?.id) {
        const bySeller = must((await published().eq("seller_id", creator.id).eq("owner_id", accountId).limit(1).maybeSingle()) as Answer<Row>)
        if (bySeller) return bySeller
        const byCreator = must((await published().eq("creator_id", creator.id).eq("owner_id", accountId).limit(1).maybeSingle()) as Answer<Row>)
        if (byCreator) return byCreator
      }
      return must((await published().eq("owner_id", accountId).limit(1).maybeSingle()) as Answer<Row>)
    },

    async renamedUsername(name) {
      const row = history(
        (await supabase
          .from("username_history")
          .select("new_username")
          .ilike("old_username", exactIlike(name))
          .order("changed_at", { ascending: false })
          .limit(1)
          .maybeSingle()) as Answer<{ new_username: string | null }>,
      )
      return row?.new_username || null
    },

    async renamedSlug(name) {
      const row = history(
        (await supabase
          .from("onepage_slug_history")
          .select("onepage_id")
          /* Written in lower case by its trigger, so an exact match on the lower cased name is any case, and uses the index. */
          .eq("old_slug", name.toLowerCase())
          .order("changed_at", { ascending: false })
          .limit(1)
          .maybeSingle()) as Answer<{ onepage_id: string | null }>,
      )
      if (!row?.onepage_id) return null
      const page = must(
        (await supabase.from("onepages").select("slug").eq("id", row.onepage_id).eq("status", "published").limit(1).maybeSingle()) as Answer<{
          slug: string | null
        }>,
      )
      return page?.slug || null
    },
  }
}
