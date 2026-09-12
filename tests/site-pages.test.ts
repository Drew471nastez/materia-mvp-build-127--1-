/**
 * ===========================================================================
 *  A SITE IS MORE THAN ITS FRONT PAGE
 * ===========================================================================
 * The website builder has always offered an About page, a Contact page and
 * pages a creator makes themselves. Every one of them saved, published, and
 * served by nothing: `app/(marketing)/w/` held one route, for the home page,
 * so `<name>.storelib.com/about` was a 404 on every site ever built — including
 * for the `/about` link the shipped header puts in the nav of a brand new one.
 *
 * Three things had to be true at once for that page to appear, and this file
 * is one check for each:
 *
 *   1. THE CACHE HAS TO HOLD IT. `buildSite` read one row, `page_key = home`,
 *      so the sections of every other page never left the database.
 *   2. A ROUTE HAS TO ANSWER. The proxy already forwards the path; nothing
 *      caught it.
 *   3. THE EDITOR HAS TO KEEP IT. A page made in the builder lived in React
 *      state: gone on reload, and its delete button deleted nothing.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  BUILT_IN_PAGE_KEYS,
  RESERVED_PAGE_KEYS,
  pageKeyFromSegment,
  pageTitleFromKey,
  templateForPage,
} from "@/lib/website-builder/site-pages"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
function section(t: string) { console.log(`\n${t}`) }

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")

const cache = read("lib/website-builder/published-site.ts")
const renderer = read("app/(marketing)/w/[username]/render-site.tsx")
const home = read("app/(marketing)/w/[username]/page.tsx")
const sub = read("app/(marketing)/w/[username]/[page]/page.tsx")
const sectionsApi = read("app/api/website-builder/themes/[installId]/sections/route.ts")
const editor = read("app/website-builder/editor/[installId]/page.tsx")
const switcher = read("components/website-builder/page-switcher.tsx")
const proxy = read("proxy.ts")

function main() {
  // ═══════════════════════════════════════════════════════════════════════
  section("An address, as a page of a site")
  // ═══════════════════════════════════════════════════════════════════════
  {
    // Run, not read.
    check("a plain name is a page", pageKeyFromSegment("about") === "about")
    check("a hyphenated one too", pageKeyFromSegment("size-guide") === "size-guide")
    check("case does not matter, because a visitor types what they like", pageKeyFromSegment("About") === "about")
    check("an escaped segment is decoded first", pageKeyFromSegment("size%2Dguide") === "size-guide")

    check("the front page is not a second address", pageKeyFromSegment("home") === null)
    check("and neither is the product template", pageKeyFromSegment("product") === null)
    for (const reserved of RESERVED_PAGE_KEYS) {
      check(`"${reserved}" is refused`, pageKeyFromSegment(reserved) === null)
    }

    check("a path separator is not a key", pageKeyFromSegment("about/team") === null)
    check("nor a traversal", pageKeyFromSegment("..") === null && pageKeyFromSegment("%2e%2e%2f") === null)
    check("nor a query or a fragment smuggled in", pageKeyFromSegment("about?x=1") === null)
    check("nor an empty segment", pageKeyFromSegment("") === null)
    check("nor one that starts with a hyphen", pageKeyFromSegment("-about") === null)
    check("nor one longer than a key can be", pageKeyFromSegment("a".repeat(64)) === null)
    check("a malformed escape is refused rather than thrown", pageKeyFromSegment("%E0%A4%A") === null)

    check("the front page draws as the index template", templateForPage("home") === "index")
    check("and every other page as its own", templateForPage("about") === "page.about")
    check("a key reads back as the name somebody typed", pageTitleFromKey("size-guide") === "Size guide")
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The cache holds every published page, not only home")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const build = cache.slice(cache.indexOf("async function buildSite"), cache.indexOf("export async function publishedSiteByName"))
    check("it no longer asks for one page by name", !/\.eq\("page_key", "home"\)/.test(build))
    check("it reads the install's pages", /\.from\("store_theme_pages"\)[\s\S]{0,120}\.eq\("install_id", row\.id\)/.test(build))
    check("and keeps them by key", /pages\[r\.page_key\] = sanitizeSections\(published\)/.test(build))

    /**
     * A page with no published sections is a page that has been made and not
     * published. Serving it would put an empty page at a real address, and
     * on a site whose header links to it that reads as a broken site.
     */
    check("a page that was never published is not one a visitor can see", /if \(!published \|\| published\.length === 0\) continue/.test(build))

    // The narrow shape is the guarantee, and the new field must stay inside it.
    const shape = cache.slice(cache.indexOf("export interface PublishedSite"), cache.indexOf("export type SiteLookup"))
    check("the pages are part of the declared shape", /pages: Record<string, SectionInstance\[\]>/.test(shape))
    check("and no draft came with them", !/draft_sections/.test(shape))
    check("what came out of the database is still cleaned on the way in", /sanitizeSections\(published\)/.test(build))

    check("the lookup takes the page being asked for", /export async function publishedSiteByName\(name: string, pageKey = "home"\)/.test(cache))
    check(
      "a page the site has not published is missing, not the home page under another name",
      /const sections = found\.site\.pages\[pageKey\] \?\? \(pageKey === "home" \? found\.site\.sections : undefined\)/.test(cache) &&
        /if \(!sections\) return \{ kind: "missing" \}/.test(cache),
    )
    check("and the template follows the page", /const template = templateForPage\(pageKey\)/.test(cache))

    /**
     * One cache entry for the whole site. The pages are published together
     * and invalidated together, so splitting them would be more round trips
     * for no more freshness.
     */
    check("it is still one entry per creator, tagged for Publish", /\["published-site", match\.creatorId\]/.test(cache) && /tags: \[creatorSiteTag\(match\.creatorId\)\]/.test(cache))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("A route answers at the address the proxy sends")
  // ═══════════════════════════════════════════════════════════════════════
  {
    // The proxy has always forwarded the whole path. This is the half that
    // was missing.
    check("the proxy forwards the path to /w", /\/w\/\$\{subdomain\}\$\{pathname === "\/" \? "" : pathname\}/.test(proxy))
    check("the sub-page route exists", /export default async function WebsiteSubPage/.test(sub))
    check("it draws the site through the same renderer as the front page", /renderSite\(username, await searchParams, key\)/.test(sub) && /renderSite\(username, await searchParams, "home"\)/.test(home))
    check("a segment that is not a page key is a 404", /if \(!key\) notFound\(\)/.test(sub))
    check("and /home goes to the front page rather than being served twice", /redirect\("\/"\)/.test(sub))
    check("one segment deep, because a page key is one segment", !/\[\.\.\./.test(sub))

    check("a sub-page says which page it is in the tab", /pageKey === "home" \? siteTitle : `\$\{pageTitleFromKey\(pageKey\)\} \| \$\{brand\}`/.test(renderer))
    check("a preview link works on a sub-page too", /previewPage\(username, wantedToken, pageKey\)/.test(renderer))
    check("and a preview of a page that does not exist is still a 404", /if \(!pageData && pageKey !== "home"\) notFound\(\)/.test(renderer))
    check("the sections a visitor gets are cleaned", /sanitizeSections\(/.test(renderer))
    check("and the page knows whose site it is on", /storefront=\{\{ creatorId: site\.creatorId, installId: site\.installId \}\}/.test(renderer))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("A page made in the builder stays made")
  // ═══════════════════════════════════════════════════════════════════════
  {
    check("the pages come back from the install on load", /const restored = \(inst\.pages \?\? \[\]\)/.test(editor) && /setCustomPages\(restored\)/.test(editor))
    check("the theme's own four are not listed as somebody's", /!BUILT_IN_PAGE_KEYS\.has\(key\)/.test(editor))
    check("and the four are the four", BUILT_IN_PAGE_KEYS.size === 4 && ["home", "product", "about", "contact"].every((k) => BUILT_IN_PAGE_KEYS.has(k)))

    check("delete calls the server", /handleDeletePage/.test(editor) && /method: "DELETE"/.test(editor))
    check("it leaves the page it is deleting first", /if \(currentPage === key\) await handlePageChange\("home"\)/.test(editor))
    check("and a refusal puts the page back rather than lying", /setCustomPages\(before\)/.test(editor))

    check("the endpoint deletes the row", /export async function DELETE/.test(sectionsApi) && /\.delete\(\)[\s\S]{0,120}\.eq\("page_key", pageKey\)/.test(sectionsApi))
    check("the theme's own pages cannot be deleted", /pageKey === "home" \|\| pageKey === "product"/.test(sectionsApi))
    check("and the live site stops serving what was deleted", (() => {
      const del = sectionsApi.slice(sectionsApi.indexOf("export async function DELETE"))
      return /revalidatePublishedSite\(creatorId\)/.test(del)
    })())

    check("a delete that cannot be undone asks first", /confirming === p\.key/.test(switcher))
    check("and the way to ask is reachable on a phone, not only on hover", /sm:opacity-0 sm:group-hover\/row:opacity-100/.test(switcher))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}

main()
