/**
 * Round 49. The response header that says how the server checked who is
 * signed in, so the owner can see in the browser's Network tab whether the
 * local check is active (docs/reliability/AUTH_KEYS.md, "Confirm it worked"):
 *
 *   proxy-local; verifier=hs256     the proxy checked the token's signature itself
 *   proxy-network; verifier=none    the proxy had to ask Supabase Auth
 *   local / network / none          the same, from an API route or /api/auth/state
 *
 * It names the kind of check only: never a key, a token or anybody's id.
 * Browser safe, no imports.
 */
export const AUTH_CHECK_HEADER = "X-Storelib-Auth-Check"
