/**
 * ===========================================================================
 *  EVERY PUBLISHED WEBSITE CAN BE FOUND
 * ===========================================================================
 * A creator's site at `<name>.storelib.com` or on their own domain answered
 * /robots.txt with Storelib's file, pointing at storelib.com's sitemap, and
 * had no sitemap of its own. Held here: what the site's own files say, what
 * the sitemap lists, and that the proxy and the pages are wired to them.
 */
import "./_usd"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import {
  heroImage,
  imagesOnPage,
  jsonLdScript,
  listedPageKeys,
  pageUrl,
  productJsonLd,
  productUrl,
  robotsTxt,
  siteIsIndexable,
  siteSameAs,
  sitemapXml,
  websiteJsonLd,
} from "@/lib/website-builder/site-seo"
import { themeMetadata } from "@/lib/website-builder/theme-metadata"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const O = "https://astrid.storelib.com"

/**
 * Whether a robots.txt lets a crawler fetch a path, read the way Google reads
 * it: every rule is a prefix, `*` is anything, a trailing `$` ends the match,
 * the longest matching rule wins and Allow wins a tie.
 */
function crawlable(robots: string, path: string): boolean {
  let best: { allow: boolean; length: number } | null = null
  for (const line of robots.split("\n")) {
    const m = /^(Allow|Disallow):\s*(\S*)$/.exec(line)
    if (!m || !m[2]) continue
    const pattern = new RegExp(`^${m[2].replace(/[.+?^{}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}`)
    if (!pattern.test(path)) continue
    const rule = { allow: m[1] === "Allow", length: m[2].length }
    if (!best || rule.length > best.length || (rule.length === best.length && rule.allow)) best = rule
  }
  return best ? best.allow : true
}

console.log("\nrobots.txt")
{
  const open = robotsTxt(O, true)
  check("an indexable site lets crawlers in and names its own sitemap", /^User-agent: \*\nAllow: \//.test(open) && open.includes(`Sitemap: ${O}/sitemap.xml`))
  check("it keeps previews, the basket and search results out",
    ["/preview/abc", "/cart", "/cart?item=1", "/search", "/search?q=presets", "/api/subscribe"].every((p) => !crawlable(open, p)), open)
  check("and not a creator's own page that starts the same way",
    ["/", "/cartoons", "/cart-guide", "/search-tips", "/searchlight", "/previews", "/about", "/products/cart"].every((p) => crawlable(open, p)), open)
  check("the rules are anchored ones, not bare prefixes", !/^Disallow: \/(cart|search)$/m.test(open) && /^Disallow: \/cart\$$/m.test(open) && /^Disallow: \/search\$$/m.test(open))
  const hidden = robotsTxt(O, false)
  check("a hidden site still lets crawlers read each page's noindex, and names no sitemap", !hidden.includes("Sitemap:") && !/Disallow: \/\n/.test(hidden) && hidden.includes("Allow: /"))
  check("hidden means the switch in SEO & Social, stored either way", !siteIsIndexable({ seo_robots: false }) && !siteIsIndexable({ seo_robots: "noindex, nofollow" }) && siteIsIndexable({}) && siteIsIndexable({ seo_robots: true }))
}

console.log("\nsitemap.xml")
{
  check("home is /, a page is /<key>, a product is /products/<slug>", pageUrl(O, "home") === `${O}/` && pageUrl(O, "about") === `${O}/about` && productUrl(O, "film presets") === `${O}/products/film%20presets`)
  check("home first, then the pages by name, and never search or the product template", listedPageKeys(["contact", "search", "home", "about", "product"]).join() === "home,about,contact")
  const sections: SectionInstance[] = [
    { id: "a", type: "hero", name: "Hero", settings: { heading: "Film presets", bg_image: "https://x.supabase.co/storage/v1/object/public/store-builder-images/u/1.webp", bg_video: "https://x.supabase.co/storage/v1/object/public/v/clip.mp4" } },
    { id: "b", type: "gallery", name: "Gallery", settings: {}, blocks: [{ id: "b1", type: "image", settings: { image: "https://cdn.example.com/p/2.JPG?w=800" } }, { id: "b2", type: "image", settings: { image: "https://cdn.example.com/p/2.JPG?w=800" } }] },
    { id: "c", type: "text", name: "Hidden", hidden: true, settings: { image: "https://cdn.example.com/hidden.png" } },
    { id: "d", type: "text", name: "Text", settings: { body: "not a picture", link: "https://example.com/page" } },
  ]
  const imgs = imagesOnPage(sections)
  check("every picture on a page is found, from settings and blocks", imgs.length === 2 && imgs[0].loc.endsWith("1.webp") && imgs[1].loc.includes("2.JPG"), JSON.stringify(imgs))
  check("once each, with the section's heading as its title", imgs[0].title === "Film presets")
  check("and not a video, a link, or a picture in a hidden section", !imgs.some((i) => /mp4|hidden|example\.com\/page/.test(i.loc)))
  const xml = sitemapXml([
    { loc: `${O}/`, images: imgs },
    { loc: productUrl(O, "presets"), lastmod: "2026-09-20T10:00:00.000Z", images: [{ loc: "https://cdn.example.com/a&b.png", title: "Presets <v2>" }] },
  ])
  check("it is a sitemap with the image extension", xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>') && xml.includes('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"'))
  check("each address with its pictures and when it last changed", (xml.match(/<url>/g) ?? []).length === 2 && xml.includes("<lastmod>2026-09-20T10:00:00.000Z</lastmod>") && (xml.match(/<image:image>/g) ?? []).length === 3)
  check("and what it holds is escaped", xml.includes("a&amp;b.png") && xml.includes("Presets &lt;v2&gt;") && !xml.includes("<v2>"))
}

console.log("\nStructured data")
{
  const site = websiteJsonLd({ origin: O, name: "Astrid Studio", description: "<p>Film presets</p>" })
  const graph = (site["@graph"] as { "@type": string; description?: string }[])
  check("the home page says it is a website and whose", graph[0]["@type"] === "WebSite" && graph[1]["@type"] === "Organization" && graph[0].description === "Film presets")
  const product = productJsonLd({ url: `${O}/products/p`, name: "Presets", description: "Twelve presets", images: ["https://cdn.example.com/p.png"], priceCents: 2400, inStock: true, seller: "Astrid Studio" }) as { offers?: { price: string; priceCurrency: string } }
  check("a product carries its price, so a result can show it", product.offers?.price === "24.00" && product.offers?.priceCurrency === "USD")
  check("a description cannot end the script it is printed in", !jsonLdScript({ d: "</script><script>alert(1)" }).includes("</script>"))
  const named = { name: "Mara </script><img src=x onerror=alert(1)>", sameAs: ["https://x.com/mara"] }
  check("and what a search engine reads back is exactly what was given", JSON.stringify(JSON.parse(jsonLdScript(named))) === JSON.stringify(named))

  /*
    EVERY PAGE THAT PRINTS JSON-LD PRINTS IT THROUGH jsonLdScript. The creator
    page and the product page put a display name and a product title into
    JSON.stringify and straight into the script element, so a name containing
    `</script>` ended it. Walked rather than listed, so a page added later is
    held to the same rule without anybody remembering to add it here.
  */
  const walk = (dir: string): string[] =>
    readdirSync(join(process.cwd(), dir)).flatMap((f) => {
      const p = `${dir}/${f}`
      if (f === "node_modules" || f.startsWith(".")) return []
      return statSync(join(process.cwd(), p)).isDirectory() ? walk(p) : /\.tsx?$/.test(f) ? [p] : []
    })
  const emitters = [...walk("app"), ...walk("components")].filter((p) => read(p).includes("application/ld+json"))
  const bare = emitters.filter((p) => /__html:\s*JSON\.stringify/.test(read(p)) || !/jsonLdScript\(|__html: structured/.test(read(p)))
  check("every page that prints JSON-LD escapes it with the one helper", emitters.length >= 10 && bare.length === 0, bare.join(", "))
}

console.log("\nWired")
{
  const proxy = read("proxy.ts")
  check("a subdomain's robots.txt and sitemap.xml go to its website", /const seoFile = pathname === "\/robots\.txt" \|\| pathname === "\/sitemap\.xml"/.test(proxy) && /const isWebsite = \(!looksLikeFile \|\| seoFile\) && !\(await hasLiveAiSite\(subdomain\)\)/.test(proxy))
  check("and a connected domain's do too, before the reserved-path rule sends them to Storelib's", /isCustomDomain &&\s*\n\s*(?:domainPurpose === "website" &&\s*\n\s*)?\(pathname === "\/robots\.txt" \|\| pathname === "\/sitemap\.xml"\)/.test(proxy) && proxy.indexOf("seoUrl.pathname = `/w/${username}${pathname}`") < proxy.search(/if \(username && \(?!isReservedPath\(pathname\)/))
  check("both routes exist", /robotsTxt\(seo\.origin, seo\.indexable\)/.test(read("app/(site)/w/[username]/robots.txt/route.ts")) && /* Changed on purpose (round AB): every language of the website. */ /seo\.entries\.flatMap\(/.test(read("app/(site)/w/[username]/sitemap.xml/route.ts")) && /sitemapXml\(entries\)/.test(read("app/(site)/w/[username]/sitemap.xml/route.ts")))
  const render = read("app/(site)/w/[username]/render-site.tsx")
  check("every page names its canonical address on the site's own domain", /* Changed on purpose (round AB): the website in another language. */ /alternates: \{ canonical: url, \.\.\.\(languages \? \{ languages \} : \{\}\) \}/.test(render) && /* Round R6: a page's own share picture (page_seo) stands in for the site's. */
    /themeMetadata\((?:settings|own\.image \? \{ \.\.\.settings, seo_og_image: own\.image \} : settings), \{ title: rawTitle, description, url, image: shareImage \}\)/.test(render))
  check("the home page carries the website's structured data", /* Changed on purpose (round AB): the website in another language. */ /pageKey === "home" \? homeStructuredData\(site, username\)/.test(render))
  const product = read("app/(site)/w/[username]/products/[slug]/page.tsx")
  check("a product page names its canonical address, respects a hidden site, and carries its structured data",
    /* Changed on purpose (round AB): the website in another language. */ /productMetadata\(slug, \{ inLanguage: localizer \? \(p\) => localizer\.product\(p\) : undefined, url: pageLocale \? [^\n]*? : productUrl\(origin, slug\), brand, indexable: builtSiteIndexable\(settings, username\), creatorId: creator\.creatorId, locale: siteLocale\(settings\) \}\)/.test(product) && /application\/ld\+json/.test(product))
  /* The website's own primary domain, read through lib/custom-domains/store.ts, once it is live. */
  check("the canonical is the connected domain when there is one", /primaryHostFor\(creatorId, "website"\)/.test(read("lib/website-builder/site-seo-data.ts")) && /r\.status === "active"/.test(read("lib/custom-domains/store.ts")))
}

console.log("\nA website shared or searched for is its creator's, with a picture")
{
  const card = (settings: Record<string, unknown>, image?: string) =>
    themeMetadata(settings as ThemeSettingsValues, { title: "t", description: "d", image }).openGraph as { images?: { url: string }[] }
  check("a share image the creator chose wins", card({ seo_og_image: "https://cdn.example.com/og.png" }, "https://cdn.example.com/logo.png").images?.[0]?.url === "https://cdn.example.com/og.png")
  check("without one, the page's fallback is used rather than no picture", card({}, "https://cdn.example.com/logo.png").images?.[0]?.url === "https://cdn.example.com/logo.png" && !card({}).images)
  const page: SectionInstance[] = [
    { id: "h0", type: "hero", name: "Hero", hidden: true, settings: { bg_image: "https://cdn.example.com/hidden.jpg" } },
    { id: "t", type: "text", name: "Text", settings: { image: "https://cdn.example.com/text.jpg" } },
    { id: "h1", type: "hero_split", name: "Hero", settings: { heading: "Presets", image: "https://cdn.example.com/mark.svg", bg: "https://cdn.example.com/hero.webp" } },
  ]
  check("the fallback picture is the first hero's, shown and not an SVG", heroImage(page) === "https://cdn.example.com/hero.webp" && heroImage([page[1]]) === undefined)
  const same = siteSameAs({ social_instagram: "https://instagram.com/astrid", social_twitter: "astrid", social_youtube: "javascript:alert(1)", social_github: "https://github.com/astrid", brand_name: "https://not-a-social.example" })
  check("its owner's profiles elsewhere come from Social links, full addresses only, in the panel's order",
    JSON.stringify(same) === JSON.stringify(["https://instagram.com/astrid", "https://github.com/astrid"]), JSON.stringify(same))
  const ld = websiteJsonLd({ origin: O, name: "Astrid", sameAs: same }) as { "@graph": { "@type": string; sameAs?: string[] }[] }
  check("and they are on the website's owner in its structured data", ld["@graph"][1]["@type"] === "Organization" && ld["@graph"][1].sameAs?.length === 2)
  const render = read("app/(site)/w/[username]/render-site.tsx")
  check("the share card falls back to the logo, then the hero, then the creator's avatar, and only without its own",
    /* Changed on purpose (round 36): the avatar is asked early when the published page has nothing better, with the account the name lookup already found. */
    /const shareImage = hasShareImage\s*\? undefined\s*: logo \|\| heroImage\(found\.site\.pages\.home \?\? found\.site\.sections\) \|\| \(await \(avatarEarly \?\? creatorAvatar\(creator\.creatorId, creator\.userId\)\)\) \|\| undefined/.test(render)
      && /const avatarEarly = shareCardWantsAvatar\(found\.site\.themeSettings \?\? \{\}, pageKey, found\.site\.pages\.home \?\? found\.site\.sections\) \? creatorAvatar\(creator\.creatorId, creator\.userId\) : null/.test(render)
      && /return !hasOwnShareImage\(settings, pageKey\) && !shareLogo\(settings\) && !heroImage\(home\)/.test(render))
  check("the home page's structured data carries the site's sameAs", /sameAs: siteSameAs\(t\)/.test(render))
  const layout = read("app/(site)/layout.tsx")
  check("no page of a website inherits Storelib as its keywords, author, creator, publisher or generator",
    /export const metadata: Metadata = \{\s*keywords: null,\s*authors: null,\s*creator: null,\s*publisher: null,\s*generator: null,\s*\}/.test(layout) &&
      ["keywords", "authors", "creator", "publisher", "generator"].every((k) => new RegExp(`\\b${k}: `).test(read("app/(storelib)/layout.tsx"))))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
