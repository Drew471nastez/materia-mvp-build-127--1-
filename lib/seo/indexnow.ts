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
 * once; and one address is not sent twice within ten minutes, so a creator
 * pressing Save five times is one notice.
 *
 * THE TEN MINUTES ARE COUNTED IN POSTGRES, in the table lib/api/rate-limit
 * keeps (rate_limit_hits), because the serverless functions do not share
 * memory: two saves landing on two instances would each think they were
 * first. A website's publish can name hundreds of pages, so they are
 * checked and recorded in batches rather than a round trip each. The map
 * below only spares this instance the query for an address it has just
 * sent itself.
 */

import { createAdminClient } from "@/lib/supabase/admin"

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

const BUCKET = "indexnow"
/** Addresses per query: they travel in the query string. */
const CHECK_CHUNK = 50

/**
 * The addresses no instance has sent in the last ten minutes, recorded as
 * sent in the same pass. It fails open: a missing table or an unreachable
 * database means a duplicate notice now and then, never a missing one.
 */
async function notSentElsewhere(urls: string[], now: number): Promise<string[]> {
  try {
    const admin = createAdminClient()
    const since = new Date(now - QUIET_MS).toISOString()
    const seen = new Set<string>()
    for (let i = 0; i < urls.length; i += CHECK_CHUNK) {
      const subjects = urls.slice(i, i + CHECK_CHUNK).map((u) => `url:${u}`)
      const { data, error } = await admin
        .from("rate_limit_hits")
        .select("subject")
        .eq("bucket", BUCKET)
        .in("subject", subjects)
        .gte("created_at", since)
      if (error) return urls
      for (const row of (data ?? []) as { subject: string }[]) seen.add(row.subject)
    }
    const fresh = urls.filter((u) => !seen.has(`url:${u}`))
    if (fresh.length > 0) {
      await admin.from("rate_limit_hits").insert(fresh.map((u) => ({ bucket: BUCKET, subject: `url:${u}` })))
    }
    return fresh
  } catch {
    return urls
  }
}

/**
 * Send the addresses. Resolves when done and never rejects. Call it inside
 * `after()` so nobody waits for it.
 */
export async function submitToIndexNow(urls: string[]): Promise<void> {
  const key = indexNowKey()
  if (!key) return
  const now = Date.now()
  const local = worthSending(urls, now)
  if (local.length === 0) return
  const fresh = await notSentElsewhere(local, now)
  for (const u of local) recent.set(u, now)
  if (fresh.length === 0) return
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
