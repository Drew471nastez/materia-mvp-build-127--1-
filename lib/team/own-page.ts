/**
 * ===========================================================================
 *  WAS THIS PRESS ON STORELIB'S OWN INVITE PAGE?
 * ===========================================================================
 * The invite's Join, Decline and Switch account are plain form posts, and a
 * form on another site must not be able to make them. The old check was
 * "Origin, when sent, equals this URL's origin", and it refused every real
 * press: the invite page asked for `referrer: no-referrer` to keep the token
 * out of Referer headers, and under that policy a browser sends a form
 * post's Origin as the literal "null". So Join answered
 * {"error":"Open the invite from your email."} to everybody, signed in by
 * email, Google or Apple alike. The page now asks for `same-origin`, and
 * this check reads the browser's own Sec-Fetch-Site too, so the next policy
 * change cannot break the button again.
 *
 *   Origin is a real origin   its host is this site's host
 *   Origin is "null" or none  Sec-Fetch-Site, when sent, is same-origin
 *                             (a sandboxed frame elsewhere says cross-site)
 *
 * Same-site is not enough: creators' own sites live on subdomains of the
 * platform and their HTML is theirs. Pure, so the table is a unit test.
 */
export function fromOwnPage(headers: { get(name: string): string | null }, requestUrl: string): boolean {
  const fetchSite = (headers.get("sec-fetch-site") ?? "").toLowerCase()
  if (fetchSite && fetchSite !== "same-origin") return false
  const origin = (headers.get("origin") ?? "").trim()
  if (!origin || origin === "null") return true
  let originHost: string
  try {
    originHost = new URL(origin).host.toLowerCase()
  } catch {
    return false
  }
  const hosts = new Set<string>()
  try {
    hosts.add(new URL(requestUrl).host.toLowerCase())
  } catch {}
  for (const h of [headers.get("x-forwarded-host"), headers.get("host")]) {
    const first = (h ?? "").split(",")[0].trim().toLowerCase()
    if (first) hosts.add(first)
  }
  return hosts.has(originHost)
}
