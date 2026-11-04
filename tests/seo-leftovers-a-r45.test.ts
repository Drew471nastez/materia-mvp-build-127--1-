/**
 * ===========================================================================
 *  ROUND 45 LEFTOVERS (A): WHAT A PAGE CARRIES, WHAT ENGINES ARE TOLD
 * ===========================================================================
 *   1. A creator's contact address is no longer in storelib.com/<name>'s
 *      HTML or RSC payload (live: curl storelib.com/andrewrullz, grep "@").
 *      The Contact button asks /api/creator-contact for it, with the page's
 *      own rule asked again, rate limited, noindex and never cached. A
 *      website's contact form no longer ships the "send messages to"
 *      address to visitors either.
 *   2. Explore's cards carry no sign in ids (creators.user_id, profiles.id).
 *   3. Moderation tells IndexNow: a public post removed or moved, a product
 *      taken down or put back, a creator banned or unbanned, a community
 *      hidden or suspended.
 *   4. A product's JSON-LD says the page's own language, or nothing.
 *   5. A 404 prints one robots tag, noindex (it printed noindex and
 *      "index, follow" on storelib.com and on every native website).
 *   6. www.storelib.com is a 308, and www plus a trailing slash is one hop.
 *   7. An imported theme's unknown collection keeps its 303, on purpose.
 */
import "./_usd"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { createRequire } from "node:module"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { stripComments } from "./_source"
import { CONTACT_EMAIL_HEADERS, contactEmailFor, contactHandle, withoutContactEmail, type ContactLookup } from "@/lib/commerce/contact-email"
import { ContactReveal, contactAddressUrl } from "@/components/storefront/contact-reveal"
import { forVisitors, PRIVATE_SECTION_SETTINGS } from "@/lib/website-builder/visitor-sections"
import { cardCreator } from "@/lib/explore/card-creator"
import { seenByModeration } from "@/lib/seo/announce-posts"
import { productJsonLd } from "@/lib/website-builder/site-seo"
import { STORELIB_PAGE_LANG, languageTag, websitePageLanguage } from "@/lib/seo/page-language"
import { NOT_FOUND_METADATA } from "@/lib/seo/not-found-metadata"
import { trailingSlashHop, withoutTrailingSlash, wwwHop } from "@/lib/seo/one-hop"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail: unknown = "") {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    const d = typeof detail === "string" ? detail : JSON.stringify(detail)
    console.log(`  FAIL  ${name}${d ? `\n        ${d.slice(0, 900)}` : ""}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (p: string) => stripComments(read(p))
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/

async function main() {
  /* ------------------------------------------------------------------ */
  console.log("\n1. The contact address is asked for, never shipped\n")
  {
    const CREATOR = { id: "c1", onboarding_completed: true }
    const base = (over: Partial<ContactLookup> = {}): ContactLookup => ({
      profile: async (h) => (h === "maker" ? { id: "u1" } : null),
      creator: async (u) => (u === "u1" ? CREATOR : null),
      banned: async () => false,
      typedEmail: async () => "hello@maker.studio",
      accountEmail: async () => "login@maker.studio",
      viewerBought: async (v, c) => v === "buyer" && c === "c1",
      ...over,
    })
    check("a buyer of a live, unbanned creator gets the typed address", (await contactEmailFor("maker", "buyer", base())) === "hello@maker.studio")
    check("  the handle is read as the page writes it (@, case)", (await contactEmailFor("@Maker", "buyer", base())) === "hello@maker.studio")
    check("  with none typed, the account's stands in, as on the page", (await contactEmailFor("maker", "buyer", base({ typedEmail: async () => "" }))) === "login@maker.studio")
    check("a viewer who never bought gets nothing", (await contactEmailFor("maker", "stranger", base())) === null)
    check("nobody signed in gets nothing", (await contactEmailFor("maker", null, base())) === null)
    check("a banned creator gives nothing", (await contactEmailFor("maker", "buyer", base({ banned: async () => true }))) === null)
    check("a storefront not finished (the page is /@handle) gives nothing", (await contactEmailFor("maker", "buyer", base({ creator: async () => ({ id: "c1", onboarding_completed: false }) }))) === null)
    check("no address at all gives nothing", (await contactEmailFor("maker", "buyer", base({ typedEmail: async () => null, accountEmail: async () => null }))) === null)
    check("something that is not an address is not given", (await contactEmailFor("maker", "buyer", base({ typedEmail: async () => "not an address" , accountEmail: async () => null }))) === null)
    check("a handle that cannot be one is refused before any read", contactHandle("a/b") === null && contactHandle("x".repeat(65)) === null && contactHandle(42) === null && contactHandle(" Maker ") === "maker")
    check("a read that throws is no address, not an error", (await contactEmailFor("maker", "buyer", base({ banned: async () => { throw new Error("db") } }))) === null)

    const settings = { bio: "Sample packs", contactEmail: "hello@maker.studio", socialLinks: { youtube: { url: "https://youtube.com/@maker", enabled: true } } }
    const sent = withoutContactEmail(settings)
    check("the header's settings reach the client without contactEmail", !("contactEmail" in (sent as object)) && JSON.stringify(sent).includes("Sample packs") && !JSON.stringify(sent).includes("hello@maker.studio"))
    check("  and the stored object is left as it was", settings.contactEmail === "hello@maker.studio")
    check("  undefined stays undefined", withoutContactEmail(undefined) === undefined)

    const page = code("app/(marketing)/u/[username]/page.tsx")
    check("the creator page hands the header withoutContactEmail(headerSettings)", /settings=\{withoutContactEmail\(headerSettings\)\}/.test(page) && !/settings=\{headerSettings\}/.test(page))
    /* Round 49: the gate is the browser's (useContactShown, from /api/creator-page/viewer); the address is still answered only by /api/creator-contact. */
    check("the About block gets the handle, gated, never the address", /sellerContactHandle=\{publicContactHandle\}/.test(page) && /const publicContactHandle = profile\.username \|\| username/.test(page) && /\{contactHandle && contactShown && \(/.test(code("components/store-builder/unified-section-renderer.tsx")) && !/sellerContactEmail=/.test(page))
    check("no client prop is handed the resolved or gated address", !/=\{(publicContactEmail|resolvedContactEmail)[^}]*\}/.test(page))
    check("the owner's About form is given their own typed address (it saved \"\" over it)", /<OwnerOnly>\s*<EditAboutButtonForOwner/.test(page) && /contactEmail=\{contactEmail \?\? ""\}/.test(code("components/storefront/owner-controls-lazy.tsx")) && /const contactEmail = owner \? await loadTypedContactEmail\(row\.id\) : null/.test(code("app/api/creator-page/viewer/route.ts")))

    const renderer = code("components/store-builder/unified-section-renderer.tsx")
    check("the About block draws ContactReveal with the handle", renderer.includes("<ContactReveal handle={contactHandle} />") && (renderer.match(/<ContactReveal/g) ?? []).length === 1)
    check("  and the wrapper passes the handle on", /sellerContactHandle=\{sellerContactHandle\}/.test(code("components/store-builder/section-renderer.tsx")))

    const reveal = code("components/storefront/contact-reveal.tsx")
    check("the button fetches the address when pressed", /fetch\(contactAddressUrl\(handle\)/.test(reveal) && contactAddressUrl("ma ker") === "/api/creator-contact?handle=ma%20ker")
    check("  and takes no address as a prop", !/\bemail: string\b/.test(reveal.slice(reveal.indexOf("export function ContactReveal"), reveal.indexOf("}) {"))))
    const html = renderToStaticMarkup(createElement(ContactReveal, { handle: "maker" }))
    check("drawn on the server, it says Contact and carries no address", />Contact</.test(html) && !EMAIL.test(html), html)
    check("  and with no handle it draws nothing", renderToStaticMarkup(createElement(ContactReveal, { handle: "" })) === "")

    const route = code("app/api/creator-contact/route.ts")
    check("the route is rate limited with the shared helper", /await rateLimit\(\{/.test(route) && /bucket: "creator-contact"/.test(route) && /addressSubject\(request\)/.test(route))
    check("  every answer says noindex and private, no-store", CONTACT_EMAIL_HEADERS["X-Robots-Tag"] === "noindex" && CONTACT_EMAIL_HEADERS["Cache-Control"] === "private, no-store" && (route.match(/headers: CONTACT_EMAIL_HEADERS/g) ?? []).length === 2 && /limited\.headers\.set\(k, v\)/.test(route))
    check("  it asks the page's own questions (published, banned, bought)", /contactEmailFor\(/.test(route) && /creatorIsBanned/.test(route) && /hasBoughtFromCreator/.test(route) && /loadTypedContactEmail/.test(route))
    check("  and is not under /api/public, which reads no session", !/app\/api\/public/.test("app/api/creator-contact/route.ts"))

    /* Websites: the contact form's own inbox address, which only the builder shows. */
    const sections = [
      { id: "a", type: "contact_form", settings: { heading: "Write to us", recipient_email: "me@studio.test" } },
      { id: "b", type: "hero", settings: { heading: "Hi" } },
      { id: "c", type: "group", settings: {}, blocks: [{ id: "d", type: "contact_form", settings: { recipient_email: "me@studio.test", button: "Send" } }] },
    ]
    const live = forVisitors(sections)
    check("a website's live page carries no recipient_email", !JSON.stringify(live).includes("me@studio.test") && PRIVATE_SECTION_SETTINGS.includes("recipient_email"))
    check("  everything else is kept, and untouched sections are the same objects", (live[0].settings as Record<string, unknown>).heading === "Write to us" && live[1] === sections[1] && ((live[2] as { blocks: Array<{ settings: Record<string, unknown> }> }).blocks[0].settings.button === "Send"))
    check("  the stored sections are not changed", sections[0].settings.recipient_email === "me@studio.test")
    check("  nothing to take out: the same array back", forVisitors([sections[1]]).length === 1 && forVisitors(sections.slice(1, 2))[0] === sections[1])
    check("  applied where a live site's pages are built, and on the product page", /forVisitors\(sanitizeSections\(published, ownSchemas\)\)/.test(code("lib/website-builder/published-site.ts")) && (code("components/website-builder/theme/render-product.tsx").match(/forVisitors\(sanitizeSections\(/g) ?? []).length === 2)
    check("  and never in sanitizeSections, which save paths run too", !/visitor-sections/.test(code("lib/website-builder/sanitize-sections.ts")))
  }

  /* ------------------------------------------------------------------ */
  console.log("\n2. Explore's cards carry no sign in ids\n")
  {
    const card = cardCreator({ id: "c1", user_id: "auth-uuid", slug: "maker", niche_tags: ["audio", 3], stripe_account_id: "acct_x" }, { id: "auth-uuid", display_name: "Maker", avatar_url: "https://x/a.png", username: "maker" })
    const json = JSON.stringify(card)
    check("the card keeps the public id, handle, tags and face", card?.id === "c1" && card.slug === "maker" && card.profile?.username === "maker" && card.profile.display_name === "Maker" && card.profile.avatar_url === "https://x/a.png" && JSON.stringify(card.niche_tags) === '["audio"]')
    check("  and no account id under any key", !json.includes("auth-uuid") && !json.includes("user_id") && !json.includes("acct_x"), json)
    check("no creator, no card creator", cardCreator(null, null) === null && cardCreator({ slug: "x" }, null) === null)
    for (const p of ["app/(marketing)/explore/page.tsx", "app/(marketing)/explore/[category]/page.tsx"]) {
      const src = code(p)
      check(`${p}: the client gets cardCreator(...), never the creator row`, /cardCreator\(creator, /.test(src) && !/\{ \.\.\.creator, profile/.test(src))
    }
    const used = readdirSync(join(process.cwd(), "components/explore")).filter((f) => f.endsWith(".tsx")).map((f) => code(`components/explore/${f}`)).join("\n")
    check("no Explore component reads a creator's user_id or profile id", !/creator\??\.user_id/.test(used) && !/profile\??\.id\b/.test(used))
  }

  /* ------------------------------------------------------------------ */
  console.log("\n3. Moderation tells IndexNow\n")
  {
    check("a post removed, restored or moved is announced", seenByModeration("post", "remove") && seenByModeration("post", "restore") && seenByModeration("post", "move"))
    check("  pinning or locking a post, or anything on a comment, is not", !seenByModeration("post", "pin") && !seenByModeration("post", "lock") && !seenByModeration("comment", "remove") && !seenByModeration("message", "remove"))
    for (const p of ["app/api/community/[communityId]/moderation/act/route.ts", "app/api/app/community/[id]/moderation/route.ts"]) {
      const src = code(p)
      const beforeAt = src.indexOf("const before = postId ? await publicPostAddresses(")
      check(`${p}: the public address is read before the action and again after`, beforeAt > 0 && beforeAt < src.indexOf("await actOnContent(") && /after\(async \(\) => announceAddresses\(\[\.\.\.new Set\(\[\.\.\.before, \.\.\.\(await publicPostAddresses\(/.test(src))
    }
    const product = code("app/api/admin/products/moderate/route.ts")
    check("an admin taking a product down or back announces its addresses", /after\(\(\) => announce\(\(\) => productAddresses\(productId, creatorId\)\)\)/.test(product))
    const ban = code("app/api/admin/creators/moderate/route.ts")
    const slugsAt = ban.indexOf("const slugs = await publishedSlugs(admin, target.creatorId)")
    check("a ban reads the published products before unpublishing them", slugsAt > 0 && slugsAt < ban.indexOf('.update({ status: "unpublished" })'))
    check("  read through a helper, so the ban branch keeps no unchecked write or read", /\.select\("slug"\)\.eq\("creator_id", creatorId\)\.eq\("status", "published"\)/.test(ban))
    check("  and announces the creator's pages after the answer, an unban its page", /bannedCreatorAddresses\(t\.creatorId, t\.slugs\)/.test(ban) && /profileAddresses\(t\.creatorId\)/.test(ban) && /after\(\(\) =>\s*announce\(/.test(ban))
    const announce = code("lib/seo/announce.ts")
    check("bannedCreatorAddresses reads the handle even though the ban is written", /handleOfCreator\(admin, creatorId, true\)/.test(announce) && /if \(isBanned\(c\) && !evenIfBanned\) return null/.test(announce))
    check("  every other announcement still says nothing for a banned creator", (announce.match(/handleOfCreator\(createAdminClient\(\), creatorId\)/g) ?? []).length >= 4)
    check("  and a link farm is never announced, even as gone", /bannedCreatorAddresses[\s\S]{0,200}if \(!notSpam\(handle\)\) return \[\]/.test(announce))
    check("a community hidden or suspended by an admin is announced", /after\(\(\) => announceAddresses\(communityAddresses\(slug\)\)\)/.test(code("app/api/admin/communities/route.ts")))
  }

  /* ------------------------------------------------------------------ */
  console.log("\n4. A product's JSON-LD carries no inLanguage (schema.org Product has none); the page's <html lang> does\n")
  {
    const base = { url: "https://s.test/products/a", name: "A", images: [], priceCents: 100, inStock: true, seller: "S" }
    /* Changed on purpose (round 45, lead): Product has no inLanguage in schema.org, so it is never printed. */
    check("a website product prints no inLanguage, even when the page's language is known", !("inLanguage" in productJsonLd({ ...base, inLanguage: "ro" })) && !("inLanguage" in productJsonLd(base)))
    const saved = { saved: true, defaultLanguage: "es", others: ["fr", "pt-BR"] }
    check("with Markets saved: the address's language, else the default", websitePageLanguage(saved, "fr", null) === "fr" && websitePageLanguage(saved, "pt-br", null) === "pt-BR" && websitePageLanguage(saved, null, { site_language: "de" }) === "es" && websitePageLanguage(saved, "it", null) === "es")
    check("without: Website settings' language, or nothing", websitePageLanguage({ saved: false, defaultLanguage: "en", others: [] }, null, { site_language: "de" }) === "de" && websitePageLanguage(null, null, {}) === undefined)
    check("a language tag is checked", languageTag("en") === "en" && languageTag("pt-BR") === "pt-BR" && languageTag("<script>") === undefined)
    const site = code("app/(site)/w/[username]/products/[slug]/page.tsx")
    check("the website product page passes that language to its JSON-LD", /const language = websitePageLanguage\(langs, locale,/.test(site) && /language \}\),/.test(site) && /inLanguage: site\.language/.test(code("components/website-builder/theme/render-product.tsx")))
    const store = code("app/(marketing)/p/[slug]/page.tsx")
    check("storelib.com's product page prints no inLanguage on its Product; the layout's <html lang> says it", !/inLanguage:/.test(store) && /<html lang=\{STORELIB_PAGE_LANG\}/.test(code("app/layout.tsx")) && STORELIB_PAGE_LANG === "en")
  }

  /* ------------------------------------------------------------------ */
  console.log("\n5. A 404 prints one robots tag: noindex\n")
  {
    check("a not found page clears the layout's robots", NOT_FOUND_METADATA.robots === null)
    /* Next's own merge, as it builds a 404's head: the root layout's metadata, then the not-found file's. */
    const req = createRequire(join(process.cwd(), "package.json"))
    /* Next's metadata module requires `server-only`, which throws outside a bundler. The push suite's loader empties it for imports, not for require, so it is emptied here too. */
    const serverOnly = createRequire(req.resolve("next/dist/lib/metadata/resolve-metadata.js")).resolve("server-only")
    req.cache[serverOnly] = { id: serverOnly, filename: serverOnly, loaded: true, exports: {} } as unknown as NodeModule
    const { accumulateMetadata } = req("next/dist/lib/metadata/resolve-metadata.js") as { accumulateMetadata: (route: string, items: unknown[], pathname: string, ctx: unknown) => Promise<{ robots: unknown }> }
    const rootRobots = { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" } }
    const ctx = { trailingSlash: false, isStaticMetadataRouteFile: false }
    const without = await accumulateMetadata("/", [[{ robots: rootRobots }, null], [null, null]], "/", ctx)
    const withIt = await accumulateMetadata("/", [[{ robots: rootRobots }, null], [NOT_FOUND_METADATA, null]], "/", ctx)
    check("  before: the 404 inherited \"index, follow\" beside Next's noindex", JSON.stringify(without.robots).includes("index, follow"), without.robots)
    check("  now: no robots of its own, so Next's noindex is the only one", withIt.robots === null, withIt.robots)
    const app = (dir: string): string[] =>
      readdirSync(dir).flatMap((f) => {
        const p = join(dir, f)
        return statSync(p).isDirectory() ? (f === "node_modules" ? [] : app(p)) : f === "not-found.tsx" ? [p] : []
      })
    const files = app(join(process.cwd(), "app"))
    const bare = files.filter((f) => !/export const metadata(: Metadata)? = NOT_FOUND_METADATA|export \{ default, metadata \}/.test(stripComments(readFileSync(f, "utf8"))))
    check("every not-found.tsx exports it (a 404 takes the nearest one's)", files.length >= 6 && bare.length === 0, bare)
    check("the site 404's own answer still says noindex", /"X-Robots-Tag": "noindex"/.test(code("app/(site)/w/[username]/not_found/route.ts")))
  }

  /* ------------------------------------------------------------------ */
  console.log("\n6. www and a trailing slash: one 308\n")
  {
    const M = "storelib.com"
    check("www.storelib.com/pricing/ goes straight to the apex without the slash", JSON.stringify(trailingSlashHop("www.storelib.com", "/pricing/", "", M)) === JSON.stringify({ location: "https://storelib.com/pricing", status: 308 }))
    check("  the query is kept", trailingSlashHop("www.storelib.com:443", "/explore/", "?q=kit", M)?.location === "https://storelib.com/explore?q=kit")
    check("storelib.com/pricing/ drops its slash on the same host", trailingSlashHop("storelib.com", "/pricing/", "?a=1", M)?.location === "/pricing?a=1")
    check("a custom domain drops its slash on its own host", trailingSlashHop("www.maker.com", "/about//", "", M)?.location === "/about")
    check("an API call on www keeps its host, as every API call does", trailingSlashHop("www.storelib.com", "/api/health/", "", M)?.location === "/api/health")
    check("no slash, no hop; / is /", trailingSlashHop("www.storelib.com", "/pricing", "", M) === null && trailingSlashHop("storelib.com", "/", "", M) === null && withoutTrailingSlash("///") === "/")
    check("www without a slash is a 308 to the apex", JSON.stringify(wwwHop("/pricing", "?x=1", M)) === JSON.stringify({ location: "https://storelib.com/pricing?x=1", status: 308 }))
    const proxy = code("proxy.ts")
    const top = proxy.indexOf("async function routeRequest(request: NextRequest) {")
    check("the proxy answers a trailing slash first, before anything else", top > 0 && proxy.indexOf("trailingSlashHop(host, pathname, search, MAIN_DOMAIN)") > top && proxy.indexOf("trailingSlashHop(host, pathname, search, MAIN_DOMAIN)") < proxy.indexOf("markedThemeAddress(pathname)", top))
    const www = proxy.slice(proxy.indexOf("if (!isApiCall && bareHost === `www.${MAIN_DOMAIN}`) {"))
    check("the www branch redirects with the helper's 308, not a 301", /wwwHop\(pathname, search, MAIN_DOMAIN\)/.test(www.slice(0, 300)) && !/status: 301/.test(www.slice(0, 300)))
    check("next.config leaves the trailing slash to the proxy", /skipTrailingSlashRedirect: true/.test(code("next.config.mjs")))
  }

  /* ------------------------------------------------------------------ */
  console.log("\n7. An imported theme's unknown collection keeps its 303, on purpose\n")
  {
    const src = read("lib/storelib-theme/compat/site.ts")
    check("the redirect says it is deliberate and why", /A 303, AND ON PURPOSE/.test(src) && /tests\/builder-nav19\.test\.ts pins it/.test(src))
    check("  and it is still a 303", /const redirect = \(to: string[^\n]*status: 303/.test(src))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
