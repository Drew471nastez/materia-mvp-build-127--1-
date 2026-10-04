/**
 * ===========================================================================
 *  WHAT STORELIB ASKS GOOGLE FOR, AND WHAT IT STOPPED ASKING FOR
 * ===========================================================================
 * Every Continue with Google used to carry:
 *
 *     access_type=offline   give me a refresh token for this person's Google
 *                           account, so I can call Google as them later
 *     prompt=consent        and ask them to agree to that, EVERY time
 *
 * Nothing in Storelib has ever used a Google token: nothing reads
 * `provider_token` or `provider_refresh_token`, because the session is
 * Supabase's. So the only thing those two did was put the "Storelib wants
 * access to your Google Account" screen in front of somebody who signed in
 * last week, on every single sign in. `prompt=consent` also tells Google not
 * to continue quietly with a session it already has, which is most of what
 * "it opens like a private window, it never knows me" is.
 *
 * Asking for neither: Google continues with the account it already has when
 * there is one, shows the chooser when there are several, and asks to agree
 * only the first time. The same on the web, in the app, and on both pages.
 *
 * Pure, so the server route and the two pages can all read it.
 */

/**
 * The query Google gets for a sign in. Empty on purpose; `undefined` where a
 * caller wants to pass nothing at all (Apple refuses Google's parameters).
 */
export const GOOGLE_OAUTH_QUERY: Record<string, string> = {}

/** What a provider's sign in should carry, or undefined for "nothing". */
export function oauthQueryFor(provider: string): Record<string, string> | undefined {
  return provider === "google" ? GOOGLE_OAUTH_QUERY : undefined
}
