"use client"

import { createContext, useContext, type ReactNode } from "react"

/**
 * ===========================================================================
 *  LOG IN AND SIGN UP DRAW THE FORM FIRST, UNLESS SOMEBODY MAY BE SIGNED IN
 * ===========================================================================
 * Both pages used to show a spinner until the browser's Supabase client had
 * read the session, and only then the form, faded and slid up into place. A
 * stranger pressing Log in on the home page saw a grey screen with a violet
 * spinner (loading.tsx), a white one with a black spinner (this check), and
 * then the form arriving: three screens for one press (round 3,
 * scripts/check-auth-arrival-r3.mjs films it).
 *
 * The check is only worth waiting for when there is a session to find. The
 * layout reads the request's cookies (lib/auth/session-hint: the Supabase
 * session cookie, whole or chunked) and says so here; with none, the page
 * draws the form in its first HTML and on its first frame, and the session
 * check still runs underneath it and still sends a signed in person on.
 */
const MaybeSignedIn = createContext(false)

export function AuthArrivalProvider({ maybeSignedIn, children }: { maybeSignedIn: boolean; children: ReactNode }) {
  return <MaybeSignedIn.Provider value={maybeSignedIn}>{children}</MaybeSignedIn.Provider>
}

/** A session cookie came with this request: wait for the session check before drawing the form. */
export function useMaybeSignedIn(): boolean {
  return useContext(MaybeSignedIn)
}
