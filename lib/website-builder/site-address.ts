/**
 * ===========================================================================
 *  A WEBSITE'S NAME ON STORELIB, APART FROM ITS CREATOR'S USERNAME
 * ===========================================================================
 * A website lives at <name>.storelib.com. The name was always the creator's
 * username, so the only way to change the website's address was to change
 * the username, which is also their profile, their links and their login
 * handle. Now the website can have a name of its own, chosen in Website
 * Settings › Domains, and the username stays as it is. Until one is chosen,
 * the website's name is the username.
 *
 * What makes a name acceptable is here, and nothing else: no database, so
 * the page can say what is wrong as the name is typed and the route can say
 * the same thing again before it saves. Whether a name is free is the
 * route's question (lib/website-builder/site-address-data.ts).
 */

export const HANDLE_MIN = 3
export const HANDLE_MAX = 40

/**
 * Names that are the platform's own, or would read as it. The first seven,
 * and mcp, are the subdomains the proxy never treats as a site (proxy.ts);
 * "domains" is where creators point their own domains. The rest are names a
 * visitor could mistake for Storelib speaking.
 */
export const RESERVED_HANDLES = new Set([
  "www", "app", "api", "admin", "dashboard", "localhost", "domains",
  "mcp", "mail", "email", "cdn", "static", "assets", "media", "images", "files",
  "help", "support", "status", "docs", "developers", "blog", "news",
  "storelib", "official", "security", "billing", "payments", "checkout", "login", "signup", "account",
])

/** What was typed, as a name: lower case, spaces to hyphens, the host part only. */
export function normalizeHandle(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\.storelib\.com.*$/, "")
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
}

/** Why a name cannot be a website's address, or null when it can. */
export function handleProblem(handle: string): string | null {
  if (handle.length < HANDLE_MIN) return `At least ${HANDLE_MIN} characters.`
  if (handle.length > HANDLE_MAX) return `At most ${HANDLE_MAX} characters.`
  if (!/^[a-z0-9-]+$/.test(handle)) return "Letters, numbers and hyphens only."
  if (handle.startsWith("-") || handle.endsWith("-")) return "It cannot start or end with a hyphen."
  if (RESERVED_HANDLES.has(handle)) return "That name is kept for Storelib."
  return null
}

/** The name a website is at: its own when it has one, its creator's username otherwise. */
export function effectiveHandle(own: string | null | undefined, username: string): string {
  return own && own.trim() ? own.trim().toLowerCase() : username.toLowerCase()
}
