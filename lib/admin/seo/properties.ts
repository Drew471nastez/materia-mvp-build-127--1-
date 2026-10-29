/**
 * ===========================================================================
 *  WHICH SEARCH CONSOLE PROPERTY AN ADDRESS BELONGS TO
 * ===========================================================================
 * The URL Inspection API answers only for a property the service account is
 * a user on, and it needs to be told which one. Storelib's are:
 *
 *   sc-domain:storelib.com   storelib.com, help.storelib.com and every
 *                            <name>.storelib.com website
 *   sc-domain:storelib.me    every OnePage
 *
 * GOOGLE_SEARCH_CONSOLE_PROPERTIES replaces that list: properties separated
 * by commas, each written as Search Console writes it, `sc-domain:<domain>`
 * for a Domain property (the domain and every subdomain of it) or a URL
 * prefix such as `https://shop.example.com/`. The most specific one wins.
 *
 * A creator's own connected domain is in none of them unless the owner adds
 * it, and then the address has no property: the console says so rather than
 * asking Google about a site Storelib cannot see.
 */

export const DEFAULT_PROPERTIES = ["sc-domain:storelib.com", "sc-domain:storelib.me"]

export function propertiesFromEnv(env: Record<string, string | undefined> = process.env): string[] {
  const raw = env.GOOGLE_SEARCH_CONSOLE_PROPERTIES?.trim()
  if (!raw) return DEFAULT_PROPERTIES
  const list = raw
    .split(/[,\s]+/)
    .map((p) => p.trim())
    .filter((p) => /^sc-domain:[a-z0-9.-]+\.[a-z]{2,}$/i.test(p) || /^https?:\/\/[^\s/]+\/.*$/i.test(p))
  return list.length ? list : DEFAULT_PROPERTIES
}

/** The property for an address, or null when none of Storelib's covers it. */
export function propertyFor(url: string, properties: string[] = propertiesFromEnv()): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  const host = parsed.hostname.toLowerCase().replace(/\.$/, "")
  let best: { property: string; weight: number } | null = null
  for (const property of properties) {
    let weight = -1
    if (property.startsWith("sc-domain:")) {
      const domain = property.slice("sc-domain:".length).toLowerCase()
      if (host === domain || host.endsWith(`.${domain}`)) weight = domain.length
    } else if (url.toLowerCase().startsWith(property.toLowerCase())) {
      /* A URL prefix is more specific than any Domain property that also covers it. */
      weight = 1000 + property.length
    }
    if (weight >= 0 && (!best || weight > best.weight)) best = { property, weight }
  }
  return best?.property ?? null
}
