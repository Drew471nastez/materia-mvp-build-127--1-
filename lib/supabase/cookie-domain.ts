/**
 * Which domain the session cookie is written to — ONE rule, in one file.
 *
 * There were three copies — lib/supabase/server.ts, lib/supabase/client.ts and
 * proxy.ts — and they DISAGREED. proxy.ts wrote `.storelib.com` for every
 * non-localhost request; server.ts only wrote it when the request was actually
 * on a storelib host. On a seller's custom domain that meant proxy.ts emitted a
 * Set-Cookie for a domain the browser was not on, which the browser silently
 * DISCARDS — so a token rotation there was performed at Supabase and then
 * thrown away, leaving a dead refresh token in place to fail later at random.
 *
 * The general form of the hazard is worth stating: if two writers disagree, the
 * browser can end up holding `sb-…-auth-token` on BOTH `.storelib.com` and
 * `storelib.com` and sending both on every request. The server reads whichever
 * the cookie header lists first — which nothing defines — and refreshing one
 * leaves the other stale. It presents as being randomly signed out.
 *
 * No imports, so proxy.ts (Edge runtime) and the server client (Node) can both
 * use it.
 */

export function mainDomain(): string {
  return process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com"
}

/**
 * `.storelib.com` on the real domain, undefined everywhere else.
 *
 * Undefined means "the current host", which is the only thing that works on a
 * Vercel preview (`*.vercel.app`) or localhost — a cookie naming a domain the
 * browser is not on is silently dropped, taking the PKCE code verifier with it.
 */
export function cookieDomainFor(requestHost: string): string | undefined {
  const main = mainDomain()
  if (main.includes("localhost") || requestHost.includes("localhost")) return undefined

  const host = requestHost.split(":")[0]
  if (host === main || host.endsWith(`.${main}`)) return `.${main}`
  return undefined
}

/** Secure everywhere except localhost, where there is no https to be secure on. */
export function cookieSecureFor(requestHost: string): boolean {
  const main = mainDomain()
  return !(main.includes("localhost") || requestHost.includes("localhost"))
}

/**
 * Is this request coming from the Capacitor app rather than a browser?
 *
 * capacitor.config.ts sets `appendUserAgent: 'Capacitor'`, so every request the
 * native WebView makes — on both platforms — carries it. This is checked rather
 * than guessed because native and web keep their sessions in different places
 * and must not be refreshed by the same code. See middleware.ts.
 *
 * It is a HINT, never a permission: nothing here grants access, it only decides
 * who is responsible for refreshing a token. Faking it makes proxy.ts skip a
 * refresh it would otherwise perform on your own session, which costs you a
 * working session and gains you nothing.
 */
export function isNativeUserAgent(userAgent: string | null | undefined): boolean {
  return !!userAgent && userAgent.includes("Capacitor")
}
