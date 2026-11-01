/**
 * ===========================================================================
 *  THE BROWSER'S SUPABASE CLIENT, FETCHED WHEN SOMETHING FIRST ASKS FOR IT
 * ===========================================================================
 * The platform header, its notification bell and the phone's search screen
 * are on every marketing page, and each imported lib/supabase/client.ts
 * directly, so supabase-js (about 180 KB of script before compression: auth,
 * the database client, realtime, storage) was downloaded, parsed and run
 * before /features or /pricing could answer a tap, for a visitor who never
 * signs in (round 46, measured at 4x CPU).
 *
 * Every one of those callers already used the client asynchronously: who is
 * signed in is a network read (auth.getUser), the bell's channels open after
 * mount, a search runs after a debounce, sign out awaits signOut. So they
 * ask through here instead, and the module arrives as its own chunk the
 * first time any of them does. The first paint does not wait for it: the
 * header draws the last known person from lib/auth/auth-snapshot.ts in a
 * layout effect, exactly as before, and the session read overwrites it.
 *
 * Nothing about the session changes. It is the same module and the same
 * singleton client (createClient keeps one per page), with the same cookie
 * storage, the same native Preferences adapter and the same token handling;
 * only the moment it is loaded moves.
 */
import type { createClient as CreateClient } from "./client"

export type BrowserSupabase = ReturnType<typeof CreateClient>

let loading: Promise<typeof import("./client")> | null = null

/** The client module, fetched once; a fetch that failed (a dropped chunk) is asked again next time. */
export function loadBrowserSupabase(): Promise<typeof import("./client")> {
  if (!loading) {
    loading = import("./client")
    loading.catch(() => {
      loading = null
    })
  }
  return loading
}

/** The page's one browser client (lib/supabase/client.ts createClient), once its module is here. */
export async function browserSupabase(): Promise<BrowserSupabase> {
  const { createClient } = await loadBrowserSupabase()
  return createClient()
}
