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
 * Supabase's. So those two only put the "Storelib wants access to your
 * Google Account" screen in front of somebody who signed in last week.
 * Neither is asked for.
 *
 * WHAT IS ASKED FOR: `prompt=select_account`. Asking for nothing let Google
 * continue quietly with the account the browser already had, so after Log
 * out, Continue with Google put the person straight back into the account
 * they had just left, with no way to pick another one or make a new one
 * (the owner: "it signs me back into the previous account"). The chooser is
 * one tap on the account they want; it is not the consent screen, which
 * Google still shows only the first time. The same on the web, in the app's
 * browser sheet, and on both pages.
 *
 * Pure, so the server route and the two pages can all read it.
 */

/** The query Google gets for a sign in: always the account chooser, never consent. */
export const GOOGLE_OAUTH_QUERY: Record<string, string> = { prompt: "select_account" }

/** What a provider's sign in should carry, or undefined for "nothing" (Apple refuses Google's parameters). */
export function oauthQueryFor(provider: string): Record<string, string> | undefined {
  return provider === "google" ? GOOGLE_OAUTH_QUERY : undefined
}
