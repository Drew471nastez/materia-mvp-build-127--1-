/**
 * ===========================================================================
 *  ONE ADDRESS EACH, AND NEITHER OF THEM HAS A PREFIX
 * ===========================================================================
 *   <handle>.storelib.com   the website they built in the website builder
 *   storelib.com/<handle>   their creator page
 *
 * The bare path has rendered the creator page since app/(marketing)/[sellername]
 * existed. Nothing linked to it: every link went through
 * `getStoreInternalPath`, which said `/u/<handle>`, so the address existed and
 * nobody ever saw it.
 *
 * THE REDIRECT IS THE RISKY HALF, and it is risky in a specific way worth
 * writing down. The proxy REWRITES `<handle>.storelib.com` to `/u/<handle>`
 * internally when a creator has no published website. A redirect from `/u/`
 * written without a host guard catches that rewrite and bounces every one of
 * those visitors to the apex — the subdomain stops serving anything at all.
 * So the guard is checked here, by name.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { stripComments } from "./_source"
import { getStoreInternalPath } from "../lib/url-helpers"

let passed = 0
let failed = 0
const failures: string[] = []

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}

const root = process.cwd()
const code = (p: string) => stripComments(readFileSync(join(root, p), "utf8"))

console.log("\nThe creator page's address\n")

/** The function itself, run rather than read. */
check("a creator page is /<handle>", getStoreInternalPath("andrew-rullz") === "/andrew-rullz")
check("with no prefix at all", !getStoreInternalPath("x").startsWith("/u/"))

console.log("\nNothing links to the old spelling any more\n")

/**
 * Every file that builds a link a VISITOR follows. The route-detection
 * `pathname.startsWith("/u/")` in the header and footer is deliberately not
 * here: those still have to recognise the old path, because the redirect that
 * sends it here runs in the proxy and those components see whatever they are
 * given.
 */
const LINKERS = [
  "lib/url-helpers.ts",
  "components/app/creator-page-share.tsx",
  "components/smart-link.tsx",
  "app/(marketing)/p/[slug]/page.tsx",
  "app/(marketing)/c/[slug]/page.tsx",
  "app/sitemap.ts",
]
/**
 * `startsWith("/u/")` is route DETECTION and is stripped before the check —
 * those calls have to go on recognising the old path, because the redirect
 * that rewrites it lives in the proxy and a component sees whatever it is
 * handed. A first run of this file failed on exactly that line and it was the
 * check that was wrong, not the code.
 */
const withoutDetection = (src: string) => src.replace(/startsWith\([^)]*\)/g, "")
for (const file of LINKERS) {
  const src = withoutDetection(code(file))
  check(`${file} builds no /u/ link`, !/["'`]\/u\//.test(src), "a visitor would see the old address")
}

check(
  "the canonical tag names the bare path",
  /canonical: `https:\/\/storelib\.com\/\$\{username\}`/.test(code("app/(marketing)/u/[username]/page.tsx")),
  "two spellings competing as duplicate content is the thing a canonical exists to stop",
)
check(
  "the sitemap lists it",
  /url: `\$\{BASE\}\/\$\{seller\.username\}`/.test(code("app/sitemap.ts")),
)

console.log("\nThe old spelling still resolves, for ever\n")

const proxy = code("proxy.ts")
check(
  "/u/<handle> is redirected",
  /pathname === "\/u" \|\| pathname\.startsWith\("\/u\/"\)/.test(proxy),
  "old links, bookmarks and anything indexed would 404",
)
check(
  "permanently, and without turning a POST into a GET",
  /status: 308/.test(proxy.slice(proxy.indexOf('pathname.startsWith("/u/")'))),
  "301 and 302 both rewrite the method",
)

/**
 * THE GUARD. Without it the subdomain's internal rewrite to `/u/<handle>` is
 * caught by this redirect and every creator without a published website loses
 * their subdomain entirely.
 */
{
  const start = proxy.indexOf('bareHost === MAIN_DOMAIN && (pathname === "/u"')
  check(
    "and only on the main domain",
    start > 0,
    "the subdomain rewrites to /u/<handle> internally — an unguarded redirect breaks every subdomain",
  )
  /* Before the subdomain branch, so it reads the browser's path rather than a
     rewritten one. */
  const subdomainBranch = proxy.indexOf("bareHost.endsWith(`.${SITES_DOMAIN}`)")
  check(
    "and it reads the path before anything rewrites it",
    start > 0 && subdomainBranch > start,
    `redirect at ${start}, subdomain branch at ${subdomainBranch}`,
  )
}

check(
  "/u on its own is left alone",
  /if \(handle\) \{/.test(proxy.slice(proxy.indexOf('pathname.startsWith("/u/")'))),
  "a bare /u is the platform's, not a creator called nothing",
)

console.log("\nThe subdomain is still the website\n")

check(
  "a published website is served at the subdomain",
  /\/w\/\$\{subdomain\}/.test(proxy),
  "that is the other half of the pair and must not have moved",
)

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log("\nFailures:")
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
