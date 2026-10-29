/**
 * ===========================================================================
 *  ROUND 44: STORELIB'S OWN PUBLIC PAGES, AS A SEARCH ENGINE READS THEM
 * ===========================================================================
 * METADATA   /pricing and /features had none (the home page's title and
 *            og:url); /terms, /privacy, /themes, a theme and the FAQ set an
 *            openGraph without an address or a picture, so their cards were
 *            the home page's. One writer now (lib/seo/page-metadata).
 * HOME       a canonical of its own, set on the page and not in the root
 *            layout, where every page without one would inherit it.
 * AUTH       logging in, resetting, verifying: noindex. /signup is indexed
 *            under its own title.
 * EXPLORE    /explore?type=communities is in the sitemap and now names
 *            itself canonical; a search is noindex; Explore switched off is
 *            not in the sitemap.
 * BLOG       real <a href> pages past the newest fifty (/blog/page/N), an RSS
 *            feed linked from every blog page, a title without an em dash or
 *            a second "| Storelib", an empty category noindex and out of the
 *            sitemap, each post's real dates, dateModified from the row, an
 *            image always, its byline's role as a jobTitle.
 * HELP       og:url at help.storelib.com, like the canonical; the footer's
 *            Help link goes there without the 308.
 * LEGAL      /terms and /privacy in the sitemap with the date they print,
 *            and a WebPage and BreadcrumbList.
 * LLMS       llms.txt names Storelib's own pages too.
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { stripComments } from "./_source"
import { absoluteUrl, breadcrumbJsonLd, legalJsonLd, legalMetadata, pageMetadata } from "@/lib/seo/page-metadata"
import { EXPLORE_COMMUNITIES_URL, EXPLORE_URL, exploreIndexing } from "@/lib/seo/explore-indexing"
import {
  BLOG_FEED_ALTERNATE,
  BLOG_FEED_URL,
  BLOG_PAGE_SIZE,
  STATIC_BLOG_POSTS,
  absoluteBlogImage,
  blogPage,
  blogPageCount,
  blogPageParam,
  blogPagePath,
  blogRssXml,
  blogSitemapEntries,
  mergeBlogPosts,
  type BlogPost,
} from "@/lib/blog/listing"
import { STORELIB_CATEGORIES, categoryToSlug, CATEGORY_SUBTITLES } from "@/lib/blog-categories"
import { LEGAL_DOCS } from "@/components/legal/legal-parts"
import { llmsTxt } from "@/lib/developers/llms"
import BlogListing from "@/app/(marketing)/blog/_blog-listing"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 600)}`}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (p: string) => stripComments(read(p))
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any

console.log("\nOne writer for a page's metadata (lib/seo/page-metadata)")
{
  const m = pageMetadata({ path: "/pricing", title: "Pricing", description: "Two plans." }) as Any
  check("the canonical is absolute, on storelib.com", m.alternates.canonical === "https://storelib.com/pricing")
  check("og:url is the same address, not the home page's", m.openGraph.url === m.alternates.canonical)
  check("the title goes through the root template; the card's title is written out", m.title === "Pricing" && m.openGraph.title === "Pricing | Storelib" && m.twitter.title === "Pricing | Storelib")
  check("a picture always: Storelib's card when the page has none", /storelib-og-v2\.jpg$/.test(m.openGraph.images[0].url) && m.twitter.images[0] === m.openGraph.images[0].url && m.twitter.card === "summary_large_image")
  check("no robots unless asked, so the root layout's index stands", !("robots" in m))
  const abs = pageMetadata({ path: "/blog", title: "Storelib Blog: guides", absolute: true, description: "x", image: { url: "/images/a.png" } }) as Any
  check("an absolute title stays as written", abs.title.absolute === "Storelib Blog: guides" && abs.openGraph.title === "Storelib Blog: guides")
  check("a page's own picture, made absolute", abs.openGraph.images[0].url === "https://storelib.com/images/a.png")
  check("absoluteUrl: a path on storelib.com, a full address as it is, the home page without a slash", absoluteUrl("/faq") === "https://storelib.com/faq" && absoluteUrl("https://help.storelib.com/x") === "https://help.storelib.com/x" && absoluteUrl("/") === "https://storelib.com")
  const crumbs = breadcrumbJsonLd([{ name: "Blog", path: "/blog" }, { name: "Page 2", path: "/blog/page/2" }]) as Any
  check("breadcrumbs carry full addresses in order", crumbs.itemListElement[1].position === 2 && crumbs.itemListElement[1].item === "https://storelib.com/blog/page/2")
}

console.log("\nEach page in scope sets its own")
{
  const uses = (p: string, re: RegExp) => re.test(code(p))
  check("/pricing", uses("app/(marketing)/pricing/page.tsx", /export const metadata: Metadata = pageMetadata\(\{\s*path: "\/pricing"/))
  check("/features, a client page, from a layout of its own", existsSync(join(process.cwd(), "app/(marketing)/features/layout.tsx")) && uses("app/(marketing)/features/layout.tsx", /path: "\/features"/) && /^"use client"/.test(read("app/(marketing)/features/page.tsx")))
  check("/faq", uses("app/(marketing)/faq/page.tsx", /pageMetadata\(\{\s*path: "\/faq"/))
  check("/themes and a theme", uses("app/(marketing)/themes/page.tsx", /path: "\/themes"/) && uses("app/(marketing)/themes/[slug]/page.tsx", /return pageMetadata\(\{\s*path: listingPath\(listing\.slug\)/))
  check("/terms and /privacy", uses("app/terms/page.tsx", /legalMetadata\("terms"\)/) && uses("app/privacy/page.tsx", /legalMetadata\("privacy"\)/))
  check("the home page's canonical is on the page", uses("app/(marketing)/page.tsx", /alternates: \{ canonical: "https:\/\/storelib\.com" \}/))
  check("  and not in the root layout, where every page without one would inherit it", !/canonical/.test(code("app/layout.tsx")))
  const pricingDesc = (pageMetadata({ path: "/pricing", title: "Pricing", description: "x" }) as Any).description
  check("  (a description is the one given)", pricingDesc === "x")
  check("the pricing description says what the plans cost, as the pricing section does", /\$29 a month/.test(read("app/(marketing)/pricing/page.tsx")) && /5% \+ \$0\.25/.test(read("app/(marketing)/pricing/page.tsx")) && /Pro is \$29 a month and lowers the fee on every sale from 5% to 3%/.test(read("components/marketing/pricing-section.tsx")))
}

console.log("\nLegal documents")
{
  const t = legalMetadata("terms") as Any
  const p = legalMetadata("privacy") as Any
  check("canonical and og:url at /terms and /privacy", t.alternates.canonical === "https://storelib.com/terms" && t.openGraph.url === t.alternates.canonical && p.alternates.canonical === "https://storelib.com/privacy")
  check("titles in sentence case, as the page heads them", t.title === LEGAL_DOCS.terms.title && p.title === LEGAL_DOCS.privacy.title)
  const ld = legalJsonLd("privacy") as Any
  const page = ld["@graph"].find((x: Any) => x["@type"] === "WebPage")
  const crumbs = ld["@graph"].find((x: Any) => x["@type"] === "BreadcrumbList")
  check("a WebPage with the date the page prints", page.dateModified === LEGAL_DOCS.privacy.updated && page.url === "https://storelib.com/privacy")
  check("and breadcrumbs: Storelib, then the document", crumbs.itemListElement.length === 2 && crumbs.itemListElement[1].item === "https://storelib.com/privacy")
  check("the legal layout prints it, through jsonLdScript", /jsonLdScript\(legalJsonLd\(kind\)\)/.test(code("components/legal/legal-page.tsx")))
  check("/legal/terms and /legal/privacy are still a server 308 to the one document", /permanentRedirect\("\/terms"\)/.test(code("app/(marketing)/legal/terms/page.tsx")) && /permanentRedirect\("\/privacy"\)/.test(code("app/(marketing)/legal/privacy/page.tsx")))
}

console.log("\nAuth pages")
{
  const auth = code("app/(auth)/layout.tsx")
  check("the auth layout says noindex, links followed", /robots: \{ index: false, follow: true \}/.test(auth))
  check("  and still carries the card the share test counts", (read("app/(auth)/layout.tsx").match(/storelibAssetUrl\(STORELIB_OG_IMAGE\)/g) ?? []).length === 2)
  const signup = code("app/(auth)/signup/layout.tsx")
  check("/signup is indexed, under its own title and canonical", /path: "\/signup"/.test(signup) && /title: "Sign up"/.test(signup) && /robots: \{ index: true, follow: true \}/.test(signup))
  check("  and the step after it says noindex again", /robots: \{ index: false, follow: true \}/.test(code("app/(auth)/signup/verify/layout.tsx")))
  check("seller onboarding already says noindex", /robots: \{ index: false, follow: false \}/.test(code("app/(auth)/sell/page.tsx")))
}

console.log("\nExplore")
{
  const base = exploreIndexing({ communitiesOn: true })
  check("/explore is canonical at /explore and indexed", base.canonical === EXPLORE_URL && base.index && !base.communities)
  const comm = exploreIndexing({ type: "communities", communitiesOn: true })
  check("/explore?type=communities names itself, so the sitemap row is not a page that points elsewhere", comm.canonical === EXPLORE_COMMUNITIES_URL && comm.index)
  check("  while communities are off, it is /explore (the page shows the products)", exploreIndexing({ type: "communities", communitiesOn: false }).canonical === EXPLORE_URL)
  check("a search is noindex", !exploreIndexing({ q: "fonts", communitiesOn: true }).index && exploreIndexing({ q: "  ", communitiesOn: true }).index)
  const page = code("app/(marketing)/explore/page.tsx")
  check("the page reads it in generateMetadata", /export async function generateMetadata\(\{ searchParams \}/.test(page) && /exploreIndexing\(/.test(page) && !/export const metadata/.test(page))
  check("  its og:url is absolute", /url: "https:\/\/storelib\.com\/explore"/.test(page))
  check("  and the share test's count is unchanged", (read("app/(marketing)/explore/page.tsx").match(/storelibAssetUrl\(STORELIB_OG_IMAGE\)/g) ?? []).length === 2)
}

console.log("\nThe blog's list, pages and feed (lib/blog/listing)")
const row = (i: number, o: Partial<BlogPost> = {}): BlogPost => ({
  id: `db${i}`,
  slug: `post-${i}`,
  title: `Post ${i} & <more>`,
  excerpt: `About ${i}`,
  category: "Tutorials",
  published_at: new Date(Date.UTC(2026, 5, 1) + i * 86_400_000).toISOString(),
  updated_at: null,
  read_time: "3 min read",
  cover_image_url: null,
  ...o,
})
{
  const rows = Array.from({ length: 120 }, (_, i) => row(i))
  const all = mergeBlogPosts(rows)
  check("the rows and the four code-written posts, newest first", all.length === 124 && all[0].slug === "post-119" && all[all.length - 1].slug === STATIC_BLOG_POSTS[0].slug)
  const edited = mergeBlogPosts([row(1, { slug: STATIC_BLOG_POSTS[1].slug, title: "Edited" })])
  check("a row with a code-written slug is that post's edited copy", edited.filter((p) => p.slug === STATIC_BLOG_POSTS[1].slug).length === 1 && edited.find((p) => p.slug === STATIC_BLOG_POSTS[1].slug)?.title === "Edited")
  check("one category's posts only", mergeBlogPosts(rows, "Growth").every((p) => p.category === "Growth") && mergeBlogPosts(rows, "Growth").length === 1)
  check("fifty to a page, three pages for 124", BLOG_PAGE_SIZE === 50 && blogPageCount(all.length) === 3 && blogPage(all, 3)?.posts.length === 24)
  check("no page 0 and no page past the last (a 404, not an empty 200)", blogPage(all, 0) === null && blogPage(all, 4) === null && blogPage([], 1)?.pages === 1)
  check("page 1 is /blog, the rest /blog/page/N", blogPagePath(1) === "/blog" && blogPagePath(2) === "/blog/page/2")
  check("only a plain page number is one", blogPageParam("2") === 2 && blogPageParam("02") === null && blogPageParam("2x") === null && blogPageParam("-1") === null)
  check("a cover is a full address", absoluteBlogImage("/images/x.jpg") === "https://storelib.com/images/x.jpg" && absoluteBlogImage("https://cdn.x/y.png") === "https://cdn.x/y.png" && absoluteBlogImage("x.png") === null)

  const rss = blogRssXml(all)
  check("the feed is RSS 2.0 with its own address as self", /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<rss version="2\.0"/.test(rss) && rss.includes(`<atom:link href="${BLOG_FEED_URL}" rel="self" type="application/rss+xml"/>`))
  check("thirty items, newest first, each with its address as guid", (rss.match(/<item>/g) ?? []).length === 30 && rss.indexOf("post-119") < rss.indexOf("post-118") && rss.includes('<guid isPermaLink="true">https://storelib.com/blog/post-119</guid>'))
  check("titles escaped", rss.includes("Post 119 &amp; &lt;more&gt;") && !rss.includes("<more>"))
  check("dates as RFC 822", /<pubDate>\w{3}, \d{2} \w{3} \d{4} \d{2}:\d{2}:\d{2} GMT<\/pubDate>/.test(rss))
  check("the feed is linked from the blog's pages", BLOG_FEED_ALTERNATE["application/rss+xml"][0].url === BLOG_FEED_URL)

  const entries = blogSitemapEntries([{ ...row(1), category: "Tutorials", updated_at: "2026-09-01T00:00:00.000Z" }], STORELIB_CATEGORIES, categoryToSlug)
  const urls = entries.map((e) => e.url)
  check("the sitemap rows: /blog, the categories with posts, every post", urls[0] === "https://storelib.com/blog" && urls.includes("https://storelib.com/blog/explore/categories/tutorials") && urls.includes("https://storelib.com/blog/post-1") && STATIC_BLOG_POSTS.every((p) => urls.includes(`https://storelib.com/blog/${p.slug}`)))
  check("an empty category is not listed", !urls.includes("https://storelib.com/blog/explore/categories/announcements") && !urls.includes("https://storelib.com/blog/explore/categories/case-studies"))
  check("/blog's date is the newest change, a post's its own", entries[0].lastModified === "2026-09-01T00:00:00.000Z" && entries.find((e) => e.url.endsWith("/post-1"))?.lastModified === "2026-09-01T00:00:00.000Z")
  check("each code-written post carries its own date, not one shared date", new Set(STATIC_BLOG_POSTS.map((p) => entries.find((e) => e.url.endsWith(`/${p.slug}`))?.lastModified)).size === 4)
  check("an unpublished post is not a row, so it is not listed (the query asks for is_published)", /\.from\("blog_posts"\)\.select\("slug, category, updated_at, published_at"\)\.eq\("is_published", true\)/.test(code("lib/seo/sitemaps.ts")))
  const many = blogSitemapEntries(Array.from({ length: 60 }, (_, i) => row(i)), STORELIB_CATEGORIES, categoryToSlug).map((e) => e.url)
  check("older pages are listed once there are more than fifty posts", many.includes("https://storelib.com/blog/page/2") && !many.includes("https://storelib.com/blog/page/3"))
}

console.log("\nThe blog's pages")
{
  const html = renderToStaticMarkup(createElement(BlogListing, { posts: [row(1)], activeCategory: null, title: "Blog", subtitle: "x", pagination: { page: 2, pages: 3 } }))
  check("older and newer posts are real links", /<a[^>]*href="\/blog"[^>]*rel="prev"|<a[^>]*rel="prev"[^>]*href="\/blog"/.test(html) && /href="\/blog\/page\/3"/.test(html) && /rel="next"/.test(html))
  const one = renderToStaticMarkup(createElement(BlogListing, { posts: [row(1)], activeCategory: null, title: "Blog", subtitle: "x", pagination: { page: 1, pages: 1 } }))
  check("  and nothing when there is one page", !/data-blog-pages/.test(one))
  const withCover = renderToStaticMarkup(createElement(BlogListing, { posts: [row(1, { cover_image_url: "/c.jpg" })], activeCategory: null, title: "Blog", subtitle: "x" }))
  check("a cover has alt text", /<img[^>]*src="\/c\.jpg"[^>]*alt="Post 1 &amp; &lt;more&gt;"|<img[^>]*alt="Post 1 &amp; &lt;more&gt;"[^>]*src="\/c\.jpg"/.test(withCover))

  const index = code("app/(marketing)/blog/_blog-index.tsx")
  check("the index's title has no em dash and no second | Storelib", /title: first \? "Storelib Blog: guides for selling digital products"/.test(index) && /absolute: true/.test(index) && !/—/.test(index))
  check("  and links the feed", /types: BLOG_FEED_ALTERNATE/.test(index))
  const older = code("app/(marketing)/blog/page/[page]/page.tsx")
  /* Measured on the built site (round 44): inside loading.tsx's boundary these answered 200, so they are decided in a layout, before anything streams. */
  const olderLayout = code("app/(marketing)/blog/page/[page]/layout.tsx")
  check("/blog/page/N decides its 308 and 404 in its layout, before the stream", /if \(n === 1\) permanentRedirect\("\/blog"\)/.test(olderLayout) && /if \(!n \|\| !\(await blogIndexPage\(n\)\)\) notFound\(\)/.test(olderLayout))
  check("a missing post is a 404 from its layout, before the stream", /if \(!\(await blogPostExists\(slug\)\)\) notFound\(\)/.test(code("app/(marketing)/blog/[slug]/layout.tsx")) && /STATIC_BLOG_SLUGS\.includes\(slug\)/.test(code("lib/blog/post.ts")))
  check("/blog/page/N: page 1 is a 308 to /blog, a page that does not exist a 404", /if \(n === 1\) permanentRedirect\("\/blog"\)/.test(older) && /if \(!page\) notFound\(\)/.test(older) && /export const revalidate = 60/.test(older))
  check("the feed route exists and is rebuilt once a minute", /blogRssXml\(await readBlogPosts\(\)\)/.test(code("app/(marketing)/blog/rss.xml/route.ts")) && /application\/rss\+xml/.test(code("app/(marketing)/blog/rss.xml/route.ts")) && /export const revalidate = 60/.test(code("app/(marketing)/blog/rss.xml/route.ts")))
  const cat = code("app/(marketing)/blog/explore/categories/[category]/page.tsx")
  check("a category's title names it once and the blog once", /title: `\$\{category\} \| Storelib Blog`/.test(cat) && /absolute: true/.test(cat) && !/—/.test(cat))
  check("  an empty category is noindex", /robots: hasPosts \? \{ index: true/.test(cat) && /: \{ index: false, follow: true \}/.test(cat))
  check("  its description has no em dash", Object.values(CATEGORY_SUBTITLES).every((s) => !s.includes("—")))
  const post = code("app/(marketing)/blog/[slug]/page.tsx")
  check("a post: dateModified from the row's last save", /dateModified: post\.updated_at/.test(post) && /updated_at: \(dbPost\?\.updated_at \|\| dbPost\?\.published_at \|\| staticData\?\.published_at\)/.test(post))
  check("  an image always, a full address", /image: \{ "@type": "ImageObject", url: postImage\(post\.cover_image_url\)/.test(post) && /images: \[\{ url: cover, width: 1200, height: 630/.test(post))
  check("  og modified time and author", /modifiedTime: modified/.test(post) && /authors: \[author\]/.test(post))
  check("  the feed linked and its own canonical", /alternates: \{ canonical: `https:\/\/storelib\.com\/blog\/\$\{slug\}`, types: BLOG_FEED_ALTERNATE \}/.test(post))
  check("  a missing post is notFound(), and its metadata says noindex", /if \(!dbPost && !staticData\) notFound\(\)/.test(post) && /title: "Post not found", robots: \{ index: false/.test(post))
  check("  a byline's role is a jobTitle", /author: personOf\(/.test(post))
}

console.log("\nThe sitemap's own pages (pagesSitemap)")
{
  const sm = code("lib/seo/sitemaps.ts")
  check("the legal documents with the date they print", /\.\.\.Object\.values\(LEGAL_DOCS\)\.map\(\(d\) => \(\{ url: `\$\{BASE\}\$\{d\.href\}`, lastModified: d\.updated \}\)\)/.test(sm))
  check("the theme marketplace", /\{ url: `\$\{BASE\}\/themes` \}/.test(sm))
  check("the Help Center's contact page", /helpUrl\("\/help\/contact"\)/.test(sm))
  check("Explore only while it is open", /const exploreOpen = await isExploreMarketplaceEnabled\(\)/.test(sm) && /\.\.\.\(exploreOpen \? \[\{ url: `\$\{BASE\}\/explore` \}\] : \[\]\)/.test(sm) && /for \(const category of CATEGORIES\) \{\s*if \(category\.id === "all" \|\| !exploreOpen\) continue/.test(sm))
  check("the blog from the one rule", /routes\.push\(\.\.\.blogSitemapEntries\(posts, STORELIB_CATEGORIES, categoryToSlug\)\)/.test(sm) && !/STATIC_BLOG_SLUGS/.test(sm))
  check("no row for a noindexed page: help search, the auth steps, the account deletion page", !/help\/search|\/login|reset-password|account-deletion/.test(sm))
  check("the account deletion page is noindex on purpose and stays so", /robots: \{ index: false, follow: false \}/.test(code("app/(marketing)/account-deletion/page.tsx")))
}

console.log("\nThe Help Center at its own host")
{
  check("og:url at help.storelib.com on its home, topics, articles and questions",
    /url: publicHelpUrl\("\/"\)/.test(code("app/help/page.tsx")) &&
    /url: publicHelpUrl\(`\/\$\{category\.slug\}`\)/.test(code("app/help/[category]/page.tsx")) &&
    /url: publicHelpUrl\(path\.replace\(\/\^\\\/help\/, ""\)\)/.test(code("app/help/[category]/[article]/page.tsx")) &&
    /url: publicHelpUrl\("\/questions"\)/.test(code("app/help/questions/page.tsx")))
  check("the contact page has a card of its own", /openGraph: \{ title: "Contact support"[^}]*url: publicHelpUrl\("\/contact"\)/.test(code("app/help/contact/page.tsx")))
  check("no help page writes a bare /help og:url any more", ["app/help/page.tsx", "app/help/[category]/page.tsx", "app/help/[category]/[article]/page.tsx", "app/help/questions/page.tsx", "app/help/contact/page.tsx"].every((p) => !/url: "\/help|url: `\/help|url: path,/.test(code(p))))
  check("the footers' Help link is the Help Center's address, not a 308", /\{ label: "Help", href: publicHelpUrl\(\) \}/.test(code("components/marketing/footer.tsx")) && /\{ label: "Help", href: publicHelpUrl\(\) \}/.test(code("components/marketing/shop-compact-footer.tsx")))
  check("search results stay noindex", /robots: \{ index: false, follow: true \}/.test(code("app/help/search/page.tsx")))
}

console.log("\nllms.txt")
{
  const map = llmsTxt()
  check("names Storelib's own pages, at the addresses the sitemap uses", ["https://storelib.com/pricing", "https://help.storelib.com", "https://storelib.com/faq", "https://storelib.com/blog", "https://storelib.com/terms", "https://storelib.com/privacy"].every((u) => map.includes(`](${u})`)))
  check("  and the feed", map.includes("https://storelib.com/blog/rss.xml"))
  check("  before the Optional section, which an agent may skip", map.indexOf("## Storelib") > 0 && map.indexOf("## Storelib") < map.indexOf("## Optional"))
  check("  every link absolute", !/\]\(\//.test(map))
  check("  no em dash in what was added", !map.slice(map.indexOf("## Storelib"), map.indexOf("## Optional")).includes("—"))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
