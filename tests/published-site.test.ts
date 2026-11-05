/**
 * ===========================================================================
 *  A CACHE EVERY VISITOR READS
 * ===========================================================================
 * A visitor to a creator's site paid for the whole thing on every hit:
 * resolve the name, find the published install, read its settings, read the
 * home page's sections, read every .storelib file the creator saved, then
 * compile and render each section. Eight sequential round trips before a
 * byte of HTML, for a page that changes when somebody presses Publish and at
 * no other time.
 *
 * Caching that is the obvious win and the dangerous one. Two ways it goes
 * badly wrong, and this file is mostly about them:
 *
 *   1. SOMETHING PRIVATE GETS IN. The cache is read by anybody who visits
 *      the address, so anything in it is public by construction. A draft, a
 *      preview token, or anything belonging to whoever happened to warm it
 *      would be handed to the next stranger.
 *
 *   2. SOMETHING STALE STAYS IN. A publish that does not clear the cache is
 *      a publish that changed the database and not the website. An unpublish
 *      that does not clear it is a site that is still up.
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

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
/**
 * The website is two routes over one renderer: `/w/[username]` is the front
 * page, `/w/[username]/[page]` is every other page, and both call
 * render-site.tsx. Read together, because a rule about what the website does
 * could be broken in either half.
 */
const store =
  read("app/(site)/w/[username]/page.tsx") +
  read("app/(site)/w/[username]/[page]/page.tsx") +
  read("app/(site)/w/[username]/render-site.tsx")
const publish = read("app/api/website-builder/themes/[installId]/publish/route.ts")

function main() {
  // ═══════════════════════════════════════════════════════════════════════
  section("Nothing private may enter it")
  // ═══════════════════════════════════════════════════════════════════════
  {
    /**
     * The shape is the guarantee. `PublishedSite` is a narrow interface
     * rather than the database rows, so a column added to
     * `store_theme_installs` later cannot arrive in the cache by accident.
     */
    const shape = cache.slice(cache.indexOf("export interface PublishedSite"), cache.indexOf("export type SiteLookup"))
    check("the cached shape is declared, not inherited from a row", /export interface PublishedSite \{/.test(cache))
    for (const forbidden of ["preview_token", "draft_sections", "draft_settings", "user_id", "email"]) {
      check(`it has no ${forbidden}`, !new RegExp(forbidden).test(shape))
    }
    check("and nothing in it is spread from a row", !/\.\.\.(row|install|profile|creator)\b/.test(shape))

    /**
     * `pageSections(row, preview)` and `themeSettings(row, preview)` are the
     * one place the published-only rule lives. Passing `true` in here would
     * put a draft in a cache every visitor reads.
     */
    check("the builder asks for published values and cannot ask for drafts", (() => {
      const build = cache.slice(cache.indexOf("async function buildSite"), cache.indexOf("export async function publishedSiteByName"))
      const lines = build.split("\n").filter((l) => /\b(pageSections|themeSettingsOf)\s*[<(]/.test(l))
      return lines.length === 2 && lines.every((l) => /,\s*false\)/.test(l))
    })(), "every call must pass false for the preview flag")

    check("the token is never read on the cached path", !/preview_token/.test(cache))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("A preview does not go through it at all")
  // ═══════════════════════════════════════════════════════════════════════
  {
    check("a request carrying a token takes the other path", /if \(wantedToken\) return await previewPage\(/.test(store))
    check("and it returns before the cache is consulted", (() => {
      const bail = store.indexOf("if (wantedToken) return await previewPage(")
      const cached = store.indexOf("await publishedSiteByName(")
      return bail > 0 && cached > bail
    })())
    check("the preview path reads the install itself, uncached", (() => {
      // The lookup is shared with the preview's own shop and product pages
      // now, so the token check lives in `previewInstall` and `previewPage`
      // calls it. Both halves, and neither goes near the cache.
      const lookup = store.slice(store.indexOf("export async function previewInstall("), store.indexOf("async function previewPage("))
      const fn = store.slice(store.indexOf("async function previewPage("))
      return /preview_token/.test(lookup) && /mayPreview\(/.test(lookup) &&
        /previewInstall\(username, token\)/.test(fn) && !/publishedSiteByName/.test(fn)
    })())
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Everything that changes the live site clears it")
  // ═══════════════════════════════════════════════════════════════════════
  {
    /**
     * Scoped to the branch. Grepping the whole file passes on the unpublish
     * branch's call, so removing the publish one changed nothing and the
     * guard sat there looking satisfied.
     */
    const publishBranch = publish.slice(publish.indexOf('if (action === "publish")'), publish.indexOf('if (action === "unpublish")'))
    check("publish clears it", /revalidatePublishedSite\(creator\.id\)/.test(publishBranch))
    check("and so does unpublish", (() => {
      const un = publish.slice(publish.indexOf('if (action === "unpublish")'))
      return /revalidatePublishedSite\(creator\.id\)/.test(un)
    })(), "a site taken down that stays cached is still up")

    /**
     * THE ONE THAT IS EASY TO MISS. Publish is not the only route that
     * writes the live columns: the sections route and the settings route
     * both take a `mode: "publish"`, and the settings route has a branch
     * that writes `settings` without being asked to publish at all.
     */
    const live: [string, string][] = [
      ["sections", "app/api/website-builder/themes/[installId]/sections/route.ts"],
      ["the shared header and footer sync", "app/api/website-builder/themes/[installId]/sections/sync-global/route.ts"],
      ["settings", "app/api/website-builder/themes/[installId]/settings/route.ts"],
    ]
    for (const [name, path] of live) {
      const src = read(path)
      check(`${name} clears it when it writes a live column`, /revalidatePublishedSite\(/.test(src))
    }

    /**
     * This is the guard that survives the next route. Any file that writes a
     * live column has to clear the cache, and if somebody adds one that does
     * not, this says so by name rather than leaving a stale site to be found
     * by a confused creator.
     */
    check("no route writes a live column without clearing it", (() => {
      const missing: string[] = []
      const dir = "app/api/website-builder/themes"
      const walk = (p: string): string[] =>
        readdirSync(join(root, p)).flatMap((e: string) => {
          const full = `${p}/${e}`
          return statSync(join(root, full)).isDirectory() ? walk(full) : full.endsWith(".ts") ? [full] : []
        })
      for (const file of walk(dir)) {
        const src = read(file)
        // A write to `sections` or `settings` that is not a draft write.
        const writesLive = /\bsections,\s*draft_sections: null\b/.test(src)
          || /\bsections: merged, draft_sections: null\b/.test(src)
          || /update\.settings = settings/.test(src)
          || /settings: settingsRow\.draft_settings/.test(src)
          || /sections: page\.draft_sections/.test(src)
        if (!writesLive) continue
        /**
         * Duplicate is the one honest exception, and it is checked rather
         * than listed: it writes live columns into an install it has just
         * created, which is a draft nobody has published, so there is no
         * published site of that creator's to go stale. If it ever starts
         * writing to the install in the URL, this stops exempting it.
         */
        // Anchored: `parent_install_id: installId` contains the shorter
        // string, and reading it as "writes to the install in the URL"
        // would un-exempt the one route this clause is for.
        if (/install_id: newInstall\.id/.test(src) && !/(?<![\w.])install_id: installId/.test(src)) continue
        if (!/revalidatePublishedSite\(/.test(src)) missing.push(file)
      }
      if (missing.length) console.log(`        ${missing.join("\n        ")}`)
      return missing.length === 0
    })())
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Stale for the right reasons, and not for long")
  // ═══════════════════════════════════════════════════════════════════════
  {
    /**
     * Two layers, because they go stale for different reasons. The name map
     * changes when somebody signs up or renames, which nothing tells us
     * about, so it is held for a minute. The site changes when somebody
     * publishes, which we are told about exactly.
     */
    check("the name map is held for an hour under each name's tag (Changed on purpose (r54))", /const NAME_TTL = PUBLISHED_HOLD_S/.test(cache) && /tags: \[siteNameTag\(lower\)\], revalidate: NAME_TTL/.test(cache))
    check("the site is held until Publish says otherwise", /const SITE_TTL = 3600/.test(cache) && /tags: \[creatorSiteTag\(match\.creatorId\)\]/.test(cache))
    check("a creator who has not published yet is not cached as missing for an hour", (() => {
      // The "no such creator" answer lives in the short-lived name layer,
      // and "creator with nothing published" is inside the tagged layer,
      // which a publish clears. Neither can strand a new site.
      const named = cache.indexOf('["site-name", lower]')
      const renamed = cache.indexOf('["site-renamed", lower]')
      return /revalidate: NAME_TTL/.test(cache.slice(named, named + 200)) && /revalidate: NAME_TTL/.test(cache.slice(renamed, renamed + 200))
    })())
    check("the purge expires what it purges at once (a stale entry is the old theme for one more visitor)", /revalidateTag\(creatorSiteTag\(creatorId\), \{ expire: 0 \}\)/.test(cache))

    /**
     * THE ONE LINE THAT WOULD TURN ALL OF THIS OFF WITHOUT SAYING SO. Read
     * out of Next's own source rather than assumed: `unstable_cache` gates
     * on `workStore.fetchCache === "force-no-store"`, and that is set only
     * by an explicit `export const fetchCache` in the module.
     * `force-dynamic` does not set it, which is why the route can be both
     * dynamic and cached. Exporting it here would put every visitor back on
     * eight round trips, and nothing would look broken.
     */
    // Anchored to the start of a line: the paragraph above this one in the
    // route NAMES the export it is warning about, and a loose match reads
    // the warning as the thing being warned about.
    check("the route does not opt out of the data cache", !/^export const fetchCache\s*=\s*["'](force-no-store|only-no-store)["']/m.test(store))
    check("and says why being force-dynamic is not the same thing", /unstable_cache` gates on/.test(store))

    /**
     * The tag has to name the creator. A tag fixed at module level would be
     * one tag for everybody, and one publish would throw away every site.
     */
    check("the tag names one creator", /export const creatorSiteTag = \(creatorId: string\) => `published-site:\$\{creatorId\}`/.test(cache))
    check("and the key does too", /\["published-site", match\.creatorId\]/.test(cache))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}

main()
