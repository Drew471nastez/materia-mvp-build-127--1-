"use client"

/**
 * Has this tab navigated yet, or is it still on the screen it loaded with?
 *
 * One boolean, and it exists to answer a question the home feed asks: is this
 * mount a COLD START, or did somebody arrive here from somewhere else in the
 * app?
 *
 * The feed opens behind an opaque curtain the first time it mounts in a
 * session. That is correct for a cold start — there is no previous screen to
 * dissolve from, and the curtain hides the moment where the server's guess at
 * which view you were on is replaced by the real one. It is badly wrong for a
 * tab change, and the feed had no way to tell the two apart: `introPlayed` is
 * "has the feed mounted before", not "did the app just start". So a session
 * that began anywhere other than the feed — opening a notification, a shared
 * listing link, signing in and landing on your profile — put that curtain over
 * the FIRST tap on Acasă. A screenful of skeleton, then a solid panel dropped
 * over it for the best part of a second, then the feed. And the curtain's
 * colour is remembered from your last view, so for anyone who had been in reels
 * it was a black one.
 *
 * Module scope rather than storage on purpose: the question is about this
 * document's lifetime and nothing else. A reload is a cold start again, which
 * is exactly when the curtain should be back.
 */

let navigated = false

/** Called by the shell on every route change after the first commit. */
export function markNavigated(): void {
  navigated = true
}

/** True once the app has moved from the screen it was loaded on. */
export function hasNavigated(): boolean {
  return navigated
}
