/**
 * ===========================================================================
 *  EVERY PUBLISHED WEBSITE CAN BE FOUND
 * ===========================================================================
 * A creator's site at `<name>.storelib.com` or on their own domain answered
 * /robots.txt with Storelib's file, pointing at storelib.com's sitemap, and
 * had no sitemap of its own. Held here: what the site's own files say, what
 * the sitemap lists, and that the proxy and the pages are wired to them.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  imagesOnPage,
  jsonLdScript,
  listedPageKeys,
  pageUrl,
  productJsonLd,
  productUrl,
  robotsTxt,
  siteIsIndexable,
  sitemapXml,
  websiteJsonLd,
} from "@/lib/website-builder/site-seo"
import type { SectionInstance } from "@/lib/website-builder/types"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const O = "https://astrid.storelib.com"

console.log("\nrobots.txt")
{
  const open = robotsTxt(O, true)
  check("an indexable site lets crawlers in and names its own sitemap", /^User-agent: \*\nAllow: \//.test(open) && open.includes(`Sitemap: ${O}/sitemap.xml`))
  check("it keeps previews, the basket and search results out", ["/preview/", "/cart", "/search"].every((p) => open.includes(`Disallow: ${p}`)))
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
}

console.log("\nWired")
{
  const proxy = read("proxy.ts")
  check("a subdomain's robots.txt and sitemap.xml go to its website", /const seoFile = pathname === "\/robots\.txt" \|\| pathname === "\/sitemap\.xml"/.test(proxy) && /const isWebsite = \(!looksLikeFile \|\| seoFile\) && !\(await hasLiveAiSite\(subdomain\)\)/.test(proxy))
  check("and a connected domain's do too, whatever it shows, though both are reserved paths", /if \(username && isCustomDomain && \(seoFile \|\| !isReservedPath\(pathname\)\)\)/.test(proxy) && /if \(username && domainDecision\?\.kind === "rewrite"\)/.test(proxy))
  check("both routes exist", /robotsTxt\(seo\.origin, seo\.indexable\)/.test(read("app/(site)/w/[username]/robots.txt/route.ts")) && /sitemapXml\(seo\.entries\)/.test(read("app/(site)/w/[username]/sitemap.xml/route.ts")))
  const render = read("app/(site)/w/[username]/render-site.tsx")
  check("every page names its canonical address on the site's own domain", /alternates: \{ canonical: url \}/.test(render) && /themeMetadata\(settings, \{ title: rawTitle, description, url \}\)/.test(render))
  check("the home page carries the website's structured data", /pageKey === "home" \? await homeStructuredData\(site, username\)/.test(render))
  const product = read("app/(site)/w/[username]/products/[slug]/page.tsx")
  check("a product page names its canonical address, respects a hidden site, and carries its structured data",
    /productMetadata\(slug, \{ url: productUrl\(origin, slug\), brand, indexable: siteIsIndexable\(settings\) \}\)/.test(product) && /application\/ld\+json/.test(product))
  check("the canonical is the connected domain when there is one set to show the website",
    /liveDomainOf\(creatorId, "website"\)/.test(read("lib/website-builder/site-seo-data.ts")) && /\.eq\("status", "active"\)/.test(read("lib/custom-domain/server.ts")))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
