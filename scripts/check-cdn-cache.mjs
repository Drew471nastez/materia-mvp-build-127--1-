#!/usr/bin/env node
/*
  IS THE CDN ANSWERING? (round 54, cost watch)

  Asks each public address twice and prints what Vercel's CDN did the second
  time (x-vercel-cache: HIT, STALE, MISS...). A public page, a website page or
  a picture that is MISS twice in a row is being drawn or fetched by a
  function on every visit: that is where Function Invocations, Active CPU and
  Fast Origin Transfer come from. Read only, a handful of requests; run it
  after a deploy or when the Usage page jumps.

    node scripts/check-cdn-cache.mjs                      (storelib.com and andrewrullz's site)
    node scripts/check-cdn-cache.mjs https://x.storelib.com/ https://storelib.com/name
*/
const defaults = [
  ["page", "https://storelib.com/"],
  ["page", "https://storelib.com/pricing"],
  ["page", "https://storelib.com/blog"],
  ["creator page", "https://storelib.com/andrewrullz"],
  ["website (browser)", "https://andrewrullz.storelib.com/", { "Sec-Fetch-Dest": "document" }],
  ["website (crawler)", "https://andrewrullz.storelib.com/collections/all", {}],
  ["live marker", "https://andrewrullz.storelib.com/api/public/site-release?name=andrewrullz"],
]
const asked = process.argv.slice(2)
const list = asked.length ? asked.map((u) => ["asked", u]) : defaults

async function head(url, extra) {
  const r = await fetch(url, { headers: { "User-Agent": "storelib-cdn-check", ...extra }, redirect: "manual" })
  await r.arrayBuffer().catch(() => null)
  return { status: r.status, cache: r.headers.get("x-vercel-cache") ?? "-", cookie: r.headers.has("set-cookie") }
}

/* A picture from the first page, if the defaults are used: /media is where most transfer was. */
if (!asked.length) {
  const html = await fetch("https://andrewrullz.storelib.com/").then((r) => r.text()).catch(() => "")
  const pic = /https:\/\/storelib\.com\/media\/[^"'?&\s]+\.(?:jpe?g|png|webp)/i.exec(html)?.[0]
  if (pic) list.push(["picture", pic])
}

let misses = 0
for (const [kind, url, extra] of list) {
  try {
    await head(url, extra)
    const again = await head(url, extra)
    const ok = /HIT|STALE|PRERENDER/.test(again.cache)
    if (!ok) misses++
    console.log(`${ok ? "ok  " : "MISS"}  ${String(again.status).padEnd(4)} ${again.cache.padEnd(10)} ${kind.padEnd(18)} ${url}${again.cookie ? "  (sets a cookie: never kept)" : ""}`)
  } catch (e) {
    misses++
    console.log(`FAIL  ${kind.padEnd(18)} ${url}  ${e instanceof Error ? e.message : e}`)
  }
}
console.log(misses ? `\n${misses} address(es) not answered by the CDN the second time.` : "\nEvery address answered by the CDN.")
process.exitCode = misses ? 1 : 0
