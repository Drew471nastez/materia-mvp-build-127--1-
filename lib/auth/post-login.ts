/**
 * Where signing in lands you.
 *
 * The marketplace feed, for everyone. This used to fork: sellers were dropped
 * into /app — the seller dashboard inherited from the creator platform — and
 * buyers into /library, which was a shelf of purchased downloads. Neither is
 * where somebody who just opened a second-hand clothing app wants to arrive.
 * Both still exist and are still reachable on purpose; they are simply no
 * longer the front door.
 *
 * Kept as one exported constant rather than a literal repeated across the six
 * places that decide this — the web password flow, the native OAuth bridge, the
 * OAuth callback, the role chooser, onboarding completion and the native
 * cold-start cache. They disagreed once already, which is how a seller could
 * land somewhere different depending on whether they signed in with a password
 * or with Google.
 */
export const POST_LOGIN_HOME = "/"
