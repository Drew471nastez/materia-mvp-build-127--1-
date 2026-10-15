/**
 * ===========================================================================
 *  A LIVE WEBSITE THROUGH A DATABASE BLINK
 * ===========================================================================
 *   npx tsx tests/site-resilience.test.ts
 *
 * A read that fails is never taken for "no such row": it throws, so nothing
 * wrong is cached, and the site is served as it last was. Where nothing was
 * kept, the visitor is asked to try again in a moment rather than shown a
 * 404 or sent away.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { siteRead, isSiteReadError } from "../lib/website-builder/site-read"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail)}` : ""}`) }
}
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)

;(async () => {
  console.log("\nA read a live site depends on\n")
  check("an answer is the answer", (await siteRead("x", async () => ({ data: { id: 1 }, error: null }))) !== null)
  check("no row is nothing", (await siteRead("x", async () => ({ data: null, error: null }))) === null)
  let tries = 0
  const ok = await siteRead("x", async () => (++tries === 1 ? { data: null, error: { message: "timeout" } } : { data: 7, error: null }))
  check("a failed read is tried once more", ok === 7 && tries === 2)
  let thrown: unknown = null
  await siteRead("published install", async () => ({ data: null, error: { message: "statement timeout" } })).catch((e) => { thrown = e })
  check("a read that keeps failing throws, so it is never cached as no site", isSiteReadError(thrown) && String((thrown as Error).message).includes("published install"))

  console.log("\nWhere it is used\n")
  const site = read("lib/website-builder/published-site.ts")
  check("the native site reads its name, install and pages this way", (site.match(/siteRead\(/g) ?? []).length >= 5 && site.includes('siteRead("published install"') && site.includes('siteRead("pages"'))
  check("  and serves the last good copy when a read throws", /const lastGood = new Map/.test(site) && /served the last good copy/.test(site))
  const compat = read("lib/website-builder/compat-site.ts")
  check("an imported theme's files are never held half read", compat.includes('throw new SiteReadError("theme files"'))
  check("  its install and pages are read this way, with a last good copy", compat.includes('siteRead("published install"') && compat.includes('siteRead("pages"') && compat.includes("lastGoodSite"))
  const route = read("app/api/site-theme/site/[username]/[[...path]]/route.ts")
  check("  and with nothing kept it answers 503, try again, never a 404", route.includes("status: 503") && route.includes('"Retry-After": "5"'))
  const proxy = read("proxy.ts")
  check("a connected domain keeps its last answer, and is never sent away for a failed lookup", proxy.includes('return held ? held.value : "unavailable"') && proxy.includes('resolved === "unavailable" && !isApiCall'))
  check("an imported theme is never taken for a native one because a check failed", /if \(failed\) return hit\?\.value \?\? false/.test(proxy))
  check("AI sites and connected websites keep their last answer too", (proxy.match(/return remembered\(/g) ?? []).length === 2)
  check("a canonical address never fails a page", read("lib/website-builder/site-seo-data.ts").includes('primaryHostFor(creatorId, "website").catch(() => null)'))

  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exit(1)
})()
