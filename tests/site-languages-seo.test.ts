/**
 * A website in many languages, as search engines read it: a sitemap that
 * does not fit one file is split under an index rather than cut off, and an
 * imported theme names the website's own address in its canonical and its
 * languages, whatever host the page was reached at.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { SITEMAP_CHUNK_BYTES, SITEMAP_CHUNK_URLS, sitemapChunks, sitemapIndexXml, sitemapXml, type SitemapEntry } from "@/lib/website-builder/site-seo"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail)}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nA sitemap that does not fit one file")
const small: SitemapEntry[] = Array.from({ length: 10 }, (_, i) => ({ loc: `https://shop.test/p/${i}` }))
check("a small website: one file", sitemapChunks(small).length === 1)
const many: SitemapEntry[] = Array.from({ length: SITEMAP_CHUNK_URLS + 10 }, (_, i) => ({ loc: `https://shop.test/p/${i}` }))
const byCount = sitemapChunks(many)
check("past the address limit: two files, nothing left out", byCount.length === 2 && byCount[0].length === SITEMAP_CHUNK_URLS && byCount[0].length + byCount[1].length === many.length)
const langs = Array.from({ length: 20 }, (_, i) => ({ hreflang: `l${i}`, href: `https://shop.test/l${i}/products/a-long-product-address-${"x".repeat(60)}` }))
const heavy: SitemapEntry[] = Array.from({ length: 17_000 }, (_, i) => ({ loc: `https://shop.test/p/${i}`, alternates: langs }))
const bySize = sitemapChunks(heavy)
check("many languages: split by size before 50MB, every address kept", bySize.length > 1 && bySize.every((c) => sitemapXml(c).length < 50_000_000) && bySize.reduce((n, c) => n + c.length, 0) === heavy.length, bySize.map((c) => c.length))
check("  each file under the size the split allows", bySize.every((c) => sitemapXml(c).length <= SITEMAP_CHUNK_BYTES + 1000))
const index = sitemapIndexXml(["https://shop.test/sitemap.xml?page=1", "https://shop.test/sitemap.xml?page=2"])
check("the index names each file", /<sitemapindex xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/.test(index) && (index.match(/<sitemap><loc>/g) ?? []).length === 2 && index.includes("?page=2"))
const route = read("app/(site)/w/[username]/sitemap.xml/route.ts")
check("the website's sitemap serves the index and each file", /sitemapChunks\(entries\)/.test(route) && /sitemap\.xml\?page=\$\{i \+ 1\}/.test(route) && /return new Response\("Not found", \{ status: 404 \}\)/.test(route))

console.log("\nAn imported theme names the website's own address")
const site = read("lib/storelib-theme/compat/site.ts")
check("its languages (hreflang) at the website's primary address", /const host = site\.canonicalHost \?\? site\.host/.test(site))
check("its canonical too", /canonical_url: page\.canonicalHost \?\? page\.host \?/.test(read("lib/storelib-theme/compat/theme.ts")))
/* Changed on purpose (live speed, Oct 21): asked beside the install, by the creator the name found, rather than after the whole site. */
check("read from the same place a built website reads it", /siteOrigin\(creator\.creatorId, name\)/.test(read("lib/website-builder/compat-site.ts")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
