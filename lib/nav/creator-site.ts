/**
 * Whether a page is on a creator's website: username.storelib.com or a domain
 * of their own, as against Storelib's own host, a preview or a developer's
 * machine. Storelib's own pages (/explore, /login, /privacy...) do not exist
 * there, so nothing links to or reads ahead a path of Storelib's on one.
 */
export function onCreatorSite(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^www\./, "")
  const main = (process.env.NEXT_PUBLIC_SITES_HOST || "storelib.com").toLowerCase()
  if (!h || h === main || h === "localhost" || h === "127.0.0.1" || h.endsWith(".vercel.app")) return false
  return true
}
