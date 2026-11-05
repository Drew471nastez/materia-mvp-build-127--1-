/**
 * ===========================================================================
 *  ROUND 53: A CREATOR'S WEBSITE AND ONEPAGE, AS GOOGLE READS THEM
 * ===========================================================================
 * Measured on a local production build by scripts/check-site-seo-r53.mjs
 * (every page type on a subdomain, a connected domain, storelib.me and a
 * creator page domain) and fixed here:
 *
 *   - an imported theme drew its favicon at 32 pixels (Dawn's and the
 *     owner's Materia's `image_url: width: 32`), under the 48 Google asks
 *     for: the site's own square, sized icon replaces it;
 *   - no page said og:site_name, and the WebSite structured data had no
 *     alternateName, so Google had only the domain or the title for the
 *     site's name;
 *   - a page without an SEO description said "Visit <store>'s website on
 *     Storelib";
 *   - a OnePage's title ended "| Storelib" and its og:site_name was
 *     "Storelib"; on a creator page domain its icon was the photo's storage
 *     address (another host, no size) and /favicon.ico was Storelib's 404;
 *   - /favicon.ico was held for a day and served stale for a week after a
 *     new favicon was published;
 *   - a blog post published or taken down was never announced to IndexNow.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { stripComments } from "./_source"
import { siteAlternateName, websiteJsonLd } from "@/lib/website-builder/site-seo"
import { themeMetadata } from "@/lib/website-builder/theme-metadata"
import { siteFallbackDescription } from "@/lib/website-builder/tab-title"
import { siteIconTags, withSiteIcon } from "@/lib/website-builder/site-icon"
import { ownIconPath, iconVersion } from "@/lib/website-builder/site-favicon"
import { autoTitle, legacyAutoTitles, onePageHostIcons, onePageMetadataFrom, profilePhotoVersion, resolveOnePageSeo } from "@/lib/onepage/seo"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? `: ${JSON.stringify(detail).slice(0, 400)}` : ""}`) }
}
const code = (p: string) => stripComments(readFileSync(join(process.cwd(), p), "utf8"))

console.log("\nThe site's name")
check("alternateName: the store's other name when it differs", siteAlternateName("Nova Studio", "https://nova.storelib.com", ["Nova Studio", "nova prints"]) === "nova prints")
check("else the address without www.", siteAlternateName("Lena Goods", "https://www.lenashop.com", ["lena goods"]) === "lenashop.com")
check("nothing when every name is the name", siteAlternateName("lenashop.com", "https://www.lenashop.com", []) === undefined)
const graph = (websiteJsonLd({ origin: "https://www.lenashop.com", name: "Lena Goods", alternateNames: ["Lena"] }) as { "@graph": Record<string, unknown>[] })["@graph"]
const site = graph.find((x) => x["@type"] === "WebSite")
check("WebSite says name and alternateName", site?.name === "Lena Goods" && site?.alternateName === "Lena" && site?.url === "https://www.lenashop.com/", site)
const og = themeMetadata({}, { title: "About | Lena Goods", description: "Handmade.", url: "https://www.lenashop.com/about", siteName: "Lena Goods" }).openGraph as Record<string, unknown>
check("og:site_name is the store's name", og.siteName === "Lena Goods", og)
check("a Storelib theme's pages pass it (render-site.tsx)", /siteName: brand \}/.test(code("app/(site)/w/[username]/render-site.tsx")))
check("the front page's WebSite is named as the tab is (siteStoreName), with the store's other names", /name: siteStoreName\(\{ brandName: t\.brand_name/.test(code("app/(site)/w/[username]/render-site.tsx")) && /alternateNames: \[site\.profile\?\.storeName, site\.displayName\]/.test(code("app/(site)/w/[username]/render-site.tsx")))
check("an imported theme's too (compat-search.ts)", /alternateNames: site\.alternateNames/.test(code("lib/website-builder/compat-search.ts")) && /alternateNames: \[store\.name, creator\.displayName\]/.test(code("lib/website-builder/compat-site.ts")))

console.log("\nNo Storelib in a store's description")
check("the fallback names the store, not Storelib", siteFallbackDescription("Lena Goods") === "Visit Lena Goods's website." && !/storelib/i.test(siteFallbackDescription("x")))
for (const f of ["app/(site)/w/[username]/render-site.tsx", "lib/website-builder/compat-search.ts", "components/website-builder/website-settings/seo.tsx", "components/website-builder/website-settings/pages.tsx"]) {
  check(`  ${f} says no "website on Storelib"`, !/website on Storelib/.test(code(f)) && /siteFallbackDescription\(/.test(code(f)))
}

console.log("\nEach page says its own")
const compatSite = code("lib/storelib-theme/compat/site.ts")
check("an imported theme's product and collection keep their own description and picture, not the site's", /const item = !!\(extra\.product \|\| extra\.collection\)/.test(compatSite) && /seo\?\.description && !item/.test(compatSite) && /seoHead\(item && seo \? \{ noindex: seo\.noindex \} : seo\)/.test(compatSite))
check("an imported theme's other pages share the site's picture (SEO & Social) first, as a Storelib theme's do", /const shareImage = \(typeof ownShare === "string"[\s\S]*?\?\? compatShareImage\(/.test(code("lib/website-builder/compat-site.ts")))
const coll = code("app/(site)/w/[username]/collections/[handle]/collection-page.tsx")
check("a Storelib theme's collection says its own description and is shared with its own picture", /description: about/.test(coll) && /images: \[\{ url: picture \}\]/.test(coll) && /images: \[picture\]/.test(coll))
const never = onePageMetadataFrom(resolveOnePageSeo({ name: "Kai", bio: "Records", handle: "kai", avatarUrl: null, theme: {}, settings: {}, pageUrl: "https://storelib.me/kai" }), { indexable: true }) as Record<string, unknown>
check("a OnePage is never said to be Storelib's (author, creator, publisher, generator, keywords)", JSON.stringify(never.authors) === JSON.stringify([{ name: "Kai" }]) && never.creator === null && never.publisher === null && never.generator === null && never.keywords === null, never)

console.log("\nThe favicon Google reads")
const v = iconVersion("https://x.supabase.co/storage/v1/object/public/media/fav.png")
const own = ownIconPath("https://x.supabase.co/storage/v1/object/public/media/fav.png")
check("the site's own icon is /favicon.ico?v=", own === `/favicon.ico?v=${v}`)
check("drawn with its size and type, and the home screen one beside it", siteIconTags(own) === `<link rel="icon" href="${own}" type="image/png" sizes="192x192"><link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon?v=${v}">`, siteIconTags(own))
const dawn = `<html><head><title>x</title><link rel="icon" type="image/png" href="/_next/image?url=https%3A%2F%2Fx.supabase.co%2Ffav.png&w=32&q=90"></head><body></body></html>`
const swapped = withSiteIcon(dawn, own, { ownFavicon: true })
check("a theme's 32 pixel favicon is replaced by the site's sized one", !/w=32/.test(swapped) && swapped.includes(`sizes="192x192"`) && (swapped.match(/rel="icon"/g) ?? []).length === 1, swapped)
check("  with the home screen icon", swapped.includes(`href="/apple-touch-icon?v=${v}"`))
const twice = `<html><head><link rel="shortcut icon" href="/a.png"><link rel="icon" href="/b.png"><link rel="apple-touch-icon" href="/t.png"></head></html>`
const one = withSiteIcon(twice, own, { ownFavicon: true })
check("  every theme icon link goes, one sized one stays, the theme's home screen icon is kept", (one.match(/rel="(shortcut )?icon"/g) ?? []).length === 1 && one.includes(`href="/t.png"`) && !one.includes("/a.png") && !one.includes("/b.png"), one)
check("a theme's own icon on a site with no favicon set stays as drawn", withSiteIcon(dawn, own).includes("w=32"))
check("a theme with no icon gets the sized one", withSiteIcon("<html><head></head></html>", own).includes(`sizes="192x192"`))
check("the compat site says whether the creator set a favicon", /ownFavicon: !!faviconOf\(settings/.test(code("lib/website-builder/compat-site.ts")) && /withSiteIcon\([\s\S]*?\{ ownFavicon: site\.ownFavicon \}\)/.test(code("lib/storelib-theme/compat/site.ts")))
const server = code("lib/website-builder/site-favicon-server.ts")
check("/favicon.ico without ?v= is held an hour, not a day plus a week stale", /ICON_CACHE = "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400"/.test(server) && !/604800/.test(server))
check("  the address the page links, a year", /asked === iconVersion\(source\) \? ICON_CURRENT : ICON_CACHE/.test(server))
for (const r of ["favicon.ico", "apple-touch-icon"]) check(`  /${r} passes its ?v=`, /searchParams\.get\("v"\)/.test(code(`app/(site)/w/[username]/${r}/route.ts`)))

console.log("\nA OnePage")
check("its title is its name and handle, no \"| Storelib\"", autoTitle("Satori Studio", "satori") === "Satori Studio (@satori)" && autoTitle("satori", "satori") === "satori")
check("the old automatic titles typed back are not overrides", legacyAutoTitles("Satori Studio", "satori").includes("Satori Studio (@satori) | Storelib"))
const base = { name: "Satori Studio", bio: "Loops", handle: "satori", avatarUrl: "https://x.supabase.co/storage/v1/object/public/a.png", theme: {}, origin: "https://storelib.com" }
const kept = resolveOnePageSeo({ ...base, settings: { seo_title: "Satori Studio (@satori) | Storelib" }, pageUrl: "https://storelib.me/satori" })
check("  so a page saved with one says the new one", kept.title.value === "Satori Studio (@satori)" && kept.title.auto === true, kept.title)
const chosen = resolveOnePageSeo({ ...base, settings: { seo_title: "Loops by Satori" }, pageUrl: "https://storelib.me/satori" })
check("  and one the creator wrote stays", chosen.title.value === "Loops by Satori" && chosen.title.auto === false)
const me = resolveOnePageSeo({ ...base, settings: {}, pageUrl: "https://storelib.me/satori" })
const meMeta = onePageMetadataFrom(me, { handle: "satori", indexable: true, icon: base.avatarUrl }) as Record<string, unknown>
check("og:site_name is the page's name", (meMeta.openGraph as { siteName?: string }).siteName === "Satori Studio")
check("on storelib.me the tab icon is the photo, as before", JSON.stringify(meMeta.icons) === JSON.stringify({ icon: base.avatarUrl, apple: base.avatarUrl }) && onePageHostIcons(me) === null)
const dom = resolveOnePageSeo({ ...base, settings: {}, pageUrl: "https://www.satori.ro/links" })
const domMeta = onePageMetadataFrom(dom, { handle: "satori", indexable: true, icon: base.avatarUrl }) as Record<string, unknown>
const pv = profilePhotoVersion(base.avatarUrl)
check("on its own domain, the domain's square icons, sized", JSON.stringify(domMeta.icons) === JSON.stringify({ icon: [{ url: `https://www.satori.ro/favicon.ico?v=${pv}`, type: "image/png", sizes: "192x192" }], apple: [{ url: `https://www.satori.ro/apple-touch-icon?v=${pv}`, sizes: "180x180" }] }), domMeta.icons)
const proxy = code("proxy.ts")
check("a creator page domain answers /favicon.ico and /apple-touch-icon itself (/u/<name>/...)", /if \(!ai && pathname !== SITE_MANIFEST_PATH\) return NextResponse\.rewrite\(new URL\(`\/u\/\$\{username\}\$\{pathname\}\$\{search\}`/.test(proxy))
const hostIcon = code("lib/onepage/host-icon-server.ts")
check("  from the creator's photo, square, through the public fetch for another host's", /fit: "cover"/.test(hostIcon) && /fetchImageBytes\(/.test(hostIcon) && /fetchableIconSource\(/.test(hostIcon))
for (const r of ["favicon.ico", "apple-touch-icon"]) check(`  app/(storelib)/(marketing)/u/[username]/${r}`, /creatorIconResponse\(request/.test(code(`app/(storelib)/(marketing)/u/[username]/${r}/route.ts`)))

console.log("\nIndexNow for blog posts")
const actions = code("app/api/website-builder/themes/[installId]/blog/posts/[postId]/actions/route.ts")
check("publish, update, unpublish and archive announce the post and its blog, after the answer", /if \(liveChanged && action !== "schedule" && action !== "duplicate"\) after\(\(\) => announce\(\(\) => blogPostAddresses\(creatorId, post\.slug\)\)\)/.test(actions))
const announce = code("lib/seo/announce.ts")
check("  at the site's canonical origin, only while it is open to search", /export async function blogPostAddresses[\s\S]*?site\.entries\.length === 0[\s\S]*?postPath\(blog\.handle, post\)/.test(announce))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
