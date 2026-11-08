import { getMainDomain } from "@/lib/url-helpers"

/**
 * Where a job asks itself for its next step: storelib.com itself (or
 * localhost in development), never the deployment's own *.vercel.app
 * address, which sits behind Vercel's deployment protection and would
 * answer the job with a login page. Same rule as cover-take's renderOrigin,
 * without importing the browser code that file brings with it.
 */
export function ownOrigin(requestUrl: string): string {
  const main = getMainDomain()
  const u = new URL(requestUrl)
  const host = u.hostname
  if (host === "localhost" || host === "127.0.0.1") return u.origin
  if (host === main || host === `www.${main}`) return `https://${host}`
  return `https://${main}`
}
