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
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { stripComments } from "./_source"
import {
  getLinksInternalPath,
  getLinksShareUrl,
  getLinksUrl,
  getLinksUrlDisplay,
  getProductInternalPath,
  getProductShareUrl,
  getStoreInternalPath,
} from "../lib/url-helpers"
import { avoidReservedProductSlug, isReservedProductSlug } from "../lib/commerce/reserved-slugs"

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
  "lib/seo/sitemaps.ts",
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
  /* Or the creator page's own domain when it has one (lib/custom-domains): still one address, never /u/, under the username as stored. */
  /const pageUrl = pageHost \? `https:\/\/\$\{pageHost\}\/` : `https:\/\/storelib\.com\/\$\{handle\}`/.test(code("app/(marketing)/u/[username]/page.tsx")) &&
    /canonical: pageUrl,/.test(code("app/(marketing)/u/[username]/page.tsx")),
  "two spellings competing as duplicate content is the thing a canonical exists to stop",
)
check(
  "the sitemap lists it",
  /* Changed on purpose (round 41): the chunk's rule moved to creatorChunkEntries, where the handle is `handle`. */
  /url: `\$\{BASE\}\/\$\{handle\}`/.test(code("lib/seo/sitemaps.ts")),
  "the sellers block now reads the same map the products block built",
)
/**
 * The block used to end in `catch {}` and drop every Supabase `error`, which
 * is how it listed zero creator pages for an unknown length of time without
 * anyone finding out.
 */
const sitemapSrc = code("lib/seo/sitemaps.ts")
check(
  "a sitemap query that fails says so",
  /console\.error\(["`]\[sitemap\]/.test(sitemapSrc) && /throw new SitemapReadFailed\(/.test(sitemapSrc) && !/\} catch \{\}\s*$/.test(sitemapSrc.slice(sitemapSrc.indexOf("product block"))),
  "silence is why nobody noticed",
)
check(
  "and it notices when no handle resolves at all",
  /no creator handles resolved/.test(sitemapSrc),
)
/**
 * THE COLUMN THAT DOES NOT EXIST. `profiles.updated_at` is what the seller
 * block selected, and PostgREST answers an unknown column with an error and
 * a null body — which `|| []` turned into "no sellers". Asking for it again
 * puts the sitemap straight back to listing no creator pages at all.
 */
check(
  "the sitemap does not ask profiles for updated_at",
  !/from\("profiles"\)[\s\S]{0,400}?updated_at/.test(sitemapSrc),
  "profiles has no such column; the date comes from the newest product",
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

console.log("\nA product lives under the creator who sells it\n")

check("a product is /<handle>/<slug>", getProductShareUrl("andrew-rullz", "t-shirt") === "https://storelib.com/andrew-rullz/t-shirt")
check("and the relative form matches", getProductInternalPath("t-shirt", "andrew-rullz") === "/andrew-rullz/t-shirt")
/**
 * A product whose creator has no handle has only the old address, and it must
 * keep working rather than becoming `//t-shirt`, which is protocol-relative
 * and points at a host called "t-shirt".
 */
check("no handle falls back to /p/<slug>", getProductShareUrl("", "t-shirt") === "https://storelib.com/p/t-shirt")
check("and so does the relative form", getProductInternalPath("t-shirt") === "/p/t-shirt")

/**
 * TWO URLS SERVING IDENTICAL CONTENT IS THE DUPLICATE A CANONICAL EXISTS TO
 * COLLAPSE. `/p/<slug>` still renders the page, so the tag has to name the
 * address everything links to, or the two compete.
 */
const productPage = code("app/(marketing)/p/[slug]/page.tsx")
check(
  "the product's canonical names the nested address",
  /canonical: productUrl/.test(productPage) && /const productUrl = getProductShareUrl\(/.test(productPage),
  "a canonical pointing at /p/ tells search engines to prefer the spelling nobody links to",
)
check(
  "and the structured data agrees with it",
  /const canonicalUrl = getProductShareUrl\(creatorUsername, product\.slug(?:, pageHost)?\)/.test(productPage) && /const productUrl = getProductShareUrl\(sellerHandle \|\| "", product\.slug(?:, pageHost)?\)/.test(productPage),
  "the JSON-LD url and the <link> must not name different addresses",
)
check(
  "no hardcoded https://storelib.com/p/ left in the product page",
  !/https:\/\/storelib\.com\/p\//.test(productPage),
)

check(
  "the sitemap lists products under their creator",
  /url: getProductShareUrl\(username \|\| "", row\.slug\)/.test(code("lib/seo/sitemaps.ts")),
  "a sitemap entry that redirects spends crawl budget to be sent somewhere else",
)

/**
 * What a person copies out of the app. `window.location.origin` is wrong on a
 * subdomain and wrong in /app, and `/p/` is the spelling that redirects.
 */
for (const file of [
  "components/product/share-button.tsx",
  "components/app/product-edit-form.tsx",
  "components/store-builder/product-creator-bar.tsx",
]) {
  const src = code(file)
  check(`${file} shares the canonical address`, /getProductShareUrl\(/.test(src))
  check(`${file} builds no /p/ link by hand`, !/[`"']\/p\/\$?\{/.test(src))
}

console.log("\nA handle is three addresses and they move together\n")

/**
 *   storelib.com/<handle>         profiles.username
 *   <handle>.storelib.com         creators.slug
 *   storelib.com/<handle>/links   onepages.slug
 *
 * A rename that moves two of the three leaves the OnePage advertising an
 * address that 404s, which is what a creator reported. The third update was
 * wrapped in `try {} catch {}` and marked non-fatal — and a Supabase update
 * RESOLVES with an error rather than throwing, so the catch could never have
 * run and the error was dropped either way.
 */
const settings = code("components/app/settings-form-new.tsx")
check("the rename moves the creator page", /\.from\("profiles"\)[\s\S]{0,400}username: cleanUsername/.test(settings))
check("and the website", /\.from\("creators"\)[\s\S]{0,200}slug: cleanUsername/.test(settings))
check("and the OnePage", /\.from\("onepages"\)[\s\S]{0,200}slug: cleanUsername/.test(settings))
check("and records the old handle for the redirect", /from\("username_history"\)/.test(settings))
check(
  "a failed OnePage move is reported rather than swallowed",
  /if \(onepageError\) \{/.test(settings) && /setError\(onepageWarning\)/.test(settings),
  "the error has to be BRANCHED ON and shown; naming the variable is not reading it",
)
check(
  "no empty catch is left in the rename",
  !/catch \{\} \/\/ Non-fatal/.test(settings),
)

console.log("\nThe subdomain is still the website\n")

check(
  "a published website is served at the subdomain",
  /\/w\/\$\{subdomain\}/.test(proxy),
  "that is the other half of the pair and must not have moved",
)

console.log("\nThe OnePage sits under the handle too\n")

/**
 * ===========================================================================
 *  storelib.com/<handle>/links
 * ===========================================================================
 * It was handed out as `<handle>.storelib.com/links`, and that address had
 * stopped working. The subdomain serves the WEBSITE a creator builds, so
 * `/links` on it is looked up as a page of that website; for anybody who
 * never made a page by that name it is a 404. Measured on production before
 * this changed:
 *
 *     andrewrullz.storelib.com/links  ->  404, x-matched-path /w/[username]/[page]
 *     storelib.com/l/andrewrullz      ->  200, the real page
 *     storelib.com/andrewrullz/links  ->  200, "Product Not Found"
 *
 * So the Share card was giving every creator a dead link to pass around, and
 * the address that reads like the right one was being looked up as a product.
 */
check("a OnePage is /<handle>/links", getLinksInternalPath("andrew-rullz") === "/andrew-rullz/links")
check("with no /l/ prefix", !getLinksInternalPath("x").startsWith("/l/"))

/**
 * THE FOUR OF THEM AGREE. A creator sees the share URL in one place, the
 * display string in another and follows the link from a third; when those
 * were built separately, one of them was a 404 for months. All three are
 * built out of lib/onepage/address onePageUrl now, storelib.me/<handle>
 * (the owner: "nobody wants to put a long link in their bio"), so they
 * cannot disagree. /<handle>/links stays the ROUTE the page renders from.
 */
{
  const handle = "andrew-rullz"
  const address = `storelib.me/${handle}`
  check("the share URL is storelib.me/<handle>", getLinksShareUrl(handle) === `https://${address}`, getLinksShareUrl(handle))
  check("and so is the one links navigate to", getLinksUrl(handle) === `https://${address}`, getLinksUrl(handle))
  check("and so is the string a creator is shown", getLinksUrlDisplay(handle) === address, getLinksUrlDisplay(handle))
  check(
    "none of them is a subdomain any more",
    ![getLinksShareUrl(handle), getLinksUrl(handle), getLinksUrlDisplay(handle)].some((u) => u.includes(`${handle}.`)),
    "the handle belongs in the path, not in the host",
  )
}

/**
 * A ROUTE FILE, NOT A REWRITE. `/{handle}/links` is otherwise caught by
 * `[sellername]/[productSlug]` and looked up as a product — the third
 * measurement above. A static segment beats a dynamic sibling in Next's own
 * matching, so the file is what makes the address mean the OnePage, with no
 * ordering in the proxy to get right.
 *
 * Verified by running it: /andrewrullz/links answered with the OnePage while
 * /andrewrullz/some-product still answered with the product route.
 */
check(
  "the address is a real route",
  existsSync(join(root, "app/(marketing)/[sellername]/links/page.tsx")),
  "without it the path is a product lookup",
)
{
  const route = code("app/(marketing)/[sellername]/links/page.tsx")
  check(
    "and it renders the page /l/<slug> already renders, rather than a second copy",
    /from "\.\.\/\.\.\/l\/\[slug\]\/page"/.test(route),
    "two implementations of one page drift, and the drift is invisible until somebody publishes",
  )
}

/**
 * AND THE OLD ADDRESSES STILL ANSWER. All of them are links people have
 * already sent each other: `/l/<slug>`, `/<handle>/links` and the
 * subdomain's `/links` (the broken one) are sent to storelib.me/<name> by
 * lib/onepage/host-route, which proxy.ts asks first. The cases themselves
 * are pinned in tests/onepage-host.test.ts.
 */
{
  const proxySource = code("proxy.ts")
  const hostRoute = code("lib/onepage/host-route.ts")
  check(
    "/l/<slug> and /<handle>/links redirect to the new address",
    /onePageRoute\(\{/.test(proxySource) && /parts\[0\] === "l" && parts\.length >= 2/.test(hostRoute) && /parts\[1\]\.toLowerCase\(\) === "links"/.test(hostRoute),
    "old links and search results should not compete with the address being handed out now",
  )
  check(
    "and only on the main domain",
    /if \(host !== main\) return null/.test(hostRoute),
    "without the host guard it would catch the custom-domain rewrite to /l/<username> and break it",
  )
  check(
    "the subdomain's /links goes to the page it was meant to reach",
    /host\.endsWith\(`\.\$\{sites\}`\) && \(input\.pathname === "\/links"/.test(hostRoute),
    "it was a 404, and it is the address the Share card gave out",
  )
}

/**
 * NOTHING CAN BE PARKED ON TOP OF IT. A product slugged `links` would be
 * shadowed by the static segment and unreachable at its own address, with
 * nothing saying why.
 */
check("`links` is reserved as a product slug", isReservedProductSlug("links") && isReservedProductSlug("LINKS"))
check("and an ordinary slug is not", !isReservedProductSlug("men-s-white-t-shirt"))
check(
  "a reserved slug is given the same suffix a duplicate gets",
  avoidReservedProductSlug("links", () => "m3k2p-a7f") === "links-m3k2p-a7f" &&
    avoidReservedProductSlug("t-shirt", () => "m3k2p-a7f") === "t-shirt",
)
check(
  "and the product form applies it",
  /avoidReservedProductSlug\(finalSlug, suffix\)/.test(code("app/app/products/new/product-editor.tsx")),
  "the rule is worth nothing if the one place that writes a slug does not use it",
)

/** Nobody hands out the dead address any more. */
{
  const HANDOUTS = [
    "lib/url-helpers.ts",
    "components/onepage/onboarding-modal.tsx",
    "components/onepage/onepage-editor.tsx",
    "components/app/settings-form-new.tsx",
    "components/smart-link.tsx",
  ]
  const stale = HANDOUTS.filter((f) => /\.storelib\.com\/links|storelib\.com\}\/links/.test(code(f)))
  check(
    "no file still shows <handle>.storelib.com/links",
    stale.length === 0,
    `still there in: ${stale.join(", ")}`,
  )
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log("\nFailures:")
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
