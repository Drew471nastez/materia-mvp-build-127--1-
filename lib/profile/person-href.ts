/**
 * WHERE A PERSON'S NAME TAKES YOU.
 *
 * A creator whose storefront is live is at `/<handle>`; everybody else,
 * buyers and creators who have not opened a store yet, is at `/@handle`
 * (next.config.mjs rewrites that to /member/<handle>). Somebody with no
 * handle at all has nowhere to go yet, so the link is the home page rather
 * than a broken address. Pure, so client components can import it.
 */
export function personHref(p: { username: string | null | undefined; hasStorefront: boolean }): string {
  const handle = (p.username || "").trim().toLowerCase()
  if (!handle || !/^[a-z0-9][a-z0-9_.-]*$/.test(handle)) return "/"
  return p.hasStorefront ? `/${handle}` : `/@${handle}`
}
