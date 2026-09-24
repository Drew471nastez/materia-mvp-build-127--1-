import "server-only"

/**
 * ===========================================================================
 *  TELLING SEARCH ENGINES A PAGE CHANGED, THE MOMENT IT DOES
 * ===========================================================================
 * IndexNow is a free, open protocol: POST the addresses that changed to one
 * endpoint and Bing, Yandex, Seznam, Naver and the others that take part
 * share them. Google does not take part, and its old sitemap "ping" address
 * is retired, so Google learns about pages from the sitemaps robots.txt
 * names (lib/seo/sitemaps.ts); this is for everybody else, and it is
 * quicker than any crawl.
 *
 * THE KEY IS PUBLIC BY DESIGN. It proves the site is ours by being served
 * as a text file at the root of each host (proxy.ts answers
 * /<INDEXNOW_KEY>.txt on every host). It comes from the INDEXNOW_KEY
 * environment variable, and while that is unset nothing here does anything.
 *
 * NEVER IN THE WAY OF A SAVE. Called from `after()`, so the request that
 * saved the page has already answered; every failure is caught and logged
 * once; and one address is not sent twice within ten minutes from the same
 * server, so a creator pressing Save five times is one notice.
 */

const ENDPOINT = "https://api.indexnow.org/indexnow"
const QUIET_MS = 10 * 60_000
/** The protocol takes up to 10,000 addresses a request. */
const MAX_PER_REQUEST = 10_000

const recent = new Map<string, number>()

export function indexNowKey(): string | null {
  const key = process.env.INDEXNOW_KEY?.trim()
  return key && /^[A-Za-z0-9-]{8,128}$/.test(key) ? key : null
}

/** The addresses worth sending now: real https URLs, not sent in the last ten minutes. */
export function worthSending(urls: string[], now: number, seen: Map<string, number> = recent): string[] {
  const out: string[] = []
  for (const raw of urls) {
    let url: URL
    try {
      url = new URL(raw)
    } catch {
      continue
    }
    if (url.protocol !== "https:" || url.hostname === "localhost" || url.hostname.endsWith(".vercel.app")) continue
    const key = url.toString()
    const last = seen.get(key)
    if (last !== undefined && now - last < QUIET_MS) continue
    if (out.includes(key)) continue
    out.push(key)
  }
  return out
}

/** One request per host, as the protocol asks. */
export function byHost(urls: string[]): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const u of urls) {
    const host = new URL(u).host
    const list = out.get(host) ?? []
    list.push(u)
    out.set(host, list)
  }
  return out
}

/**
 * Send the addresses. Resolves when done and never rejects. Call it inside
 * `after()` so nobody waits for it.
 */
export async function submitToIndexNow(urls: string[]): Promise<void> {
  const key = indexNowKey()
  if (!key) return
  const now = Date.now()
  const fresh = worthSending(urls, now)
  if (fresh.length === 0) return
  for (const u of fresh) recent.set(u, now)
  if (recent.size > 20_000) {
    for (const [u, at] of recent) if (now - at >= QUIET_MS) recent.delete(u)
  }
  for (const [host, list] of byHost(fresh)) {
    for (let i = 0; i < list.length; i += MAX_PER_REQUEST) {
      try {
        const res = await fetch(ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify({
            host,
            key,
            keyLocation: `https://${host}/${key}.txt`,
            urlList: list.slice(i, i + MAX_PER_REQUEST),
          }),
          signal: AbortSignal.timeout(8000),
        })
        /* 200 and 202 are both "received". Anything else is worth a line,
           and never an error for the person who saved. */
        if (res.status !== 200 && res.status !== 202) console.warn(`[indexnow] ${host}: ${res.status}`)
      } catch (e) {
        console.warn(`[indexnow] ${host}: not sent (${(e as Error).message})`)
      }
    }
  }
}
