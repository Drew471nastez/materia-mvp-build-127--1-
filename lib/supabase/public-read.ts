/**
 * ===========================================================================
 *  A CLIENT WITH NO SESSION, FOR ROWS THAT BELONG TO NOBODY
 * ===========================================================================
 * A product page is the same page for everybody: the product, the creator,
 * the shop's theme. Those reads are most of what makes the page slow, and
 * they are also the only reads on it that can safely be shared between
 * visitors.
 *
 * `createClient()` in ./server.ts reads cookies, which means two things: the
 * response can never be cached, and anything cached from it would have to be
 * cached PER SESSION, which is not a cache. This client has no cookies at
 * all, so a value fetched through it can be stored once and handed to
 * everyone.
 *
 * ---------------------------------------------------------------------------
 *  IT IS THE ANON KEY, NOT THE SERVICE ROLE, AND THAT IS THE POINT
 * ---------------------------------------------------------------------------
 * The service-role key bypasses row-level security. Caching anything fetched
 * with it would mean storing rows the database would have refused to show a
 * stranger, and then serving them to one. This client is exactly as
 * privileged as a signed-out visitor, so everything it can read is already
 * public and sharing it leaks nothing.
 *
 * NEVER give this file the service role. If a read needs more privilege than
 * a stranger has, it is not a read that can be cached — it belongs on the
 * per-request client with the session attached.
 */
import { createClient } from "@supabase/supabase-js"
import { mediaFetch } from "@/lib/storage/media-url"

let cached: ReturnType<typeof createClient> | null = null

export function createPublicReadClient() {
  if (cached) return cached
  cached = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: mediaFetch },
      auth: {
        // No session, ever. Nothing to persist, nothing to refresh, and no
        // cookie for a cached value to accidentally belong to.
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  )
  return cached
}
