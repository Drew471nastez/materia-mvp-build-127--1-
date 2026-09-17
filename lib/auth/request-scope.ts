import "server-only"

import { cache } from "react"
import { createClient } from "@/lib/supabase/server"
import { readCurrentUser, type CurrentUser } from "@/lib/auth/current-user"

/**
 * ===========================================================================
 *  THE SAME QUESTION, ASKED ONCE PER REQUEST
 * ===========================================================================
 * A layout and the page inside it both need to know who is signed in, and
 * both were asking Supabase separately. That is two auth round trips to
 * render one screen, and lib/auth/current-user.ts gives the first one a 3s
 * ceiling with a retry, so a bad moment on the auth service could be paid for
 * twice before anything was drawn.
 *
 * The same is true of the profile row: the library layout reads three columns
 * off it to decide whether to let somebody through, and the library page then
 * reads three different columns off the same row to put a name and a picture
 * at the top.
 *
 * React's `cache` is per request, not across requests. It holds nothing
 * between people and expires with the render, so this is deduplication and
 * not a cache of anybody's session.
 *
 * NOTHING HERE DECIDES ANYTHING. The answers, the classification of errors
 * and every redirect stay exactly where they were; this only stops the same
 * question being put on the wire twice.
 */
export const currentUserForRequest = cache(async (): Promise<CurrentUser> => {
  const supabase = await createClient()
  return readCurrentUser(supabase)
})

export interface RequestProfile {
  display_name: string | null
  avatar_url: string | null
  username: string | null
  email_verified: boolean | null
  is_creator: boolean | null
  welcome_completed: boolean | null
}

/**
 * Every column the library shell and the library page between them need, in
 * one select. Row-level security still applies: this is the caller's own
 * client, so it can only ever return the caller's own row.
 */
export const profileForRequest = cache(async (userId: string): Promise<RequestProfile | null> => {
  const supabase = await createClient()
  const { data } = await supabase
    .from("profiles")
    .select("display_name, avatar_url, username, email_verified, is_creator, welcome_completed")
    .eq("id", userId)
    .maybeSingle()
  return (data as RequestProfile | null) ?? null
})
