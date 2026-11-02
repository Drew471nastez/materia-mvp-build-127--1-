/**
 * ===========================================================================
 *  CREATOR BLOGS ON A STORELIB THEME (package 4)
 * ===========================================================================
 * The native side of a creator's blog, run rather than read wherever it can
 * be:
 *
 *   KEYS       "blogs" and "article" are reserved, generated templates under
 *              a Blog group; a creator's own page called "blog" stays theirs
 *   LAYOUT     the generated Blog and Blog post pages, the stored one kept
 *   SECTIONS   main_blog, main_article and blog_featured drawn with real
 *              posts: pages, a category, a tag, related posts, neighbours,
 *              share links; nothing on a live page without a blog, a note
 *              in the editor
 *   DATA       a scheduled post is not shown before its time, whatever the
 *              cache held; dates in the page's language
 *   ROUTES     every /blogs address, its metadata (canonical, article card,
 *              robots from the site and the post), its JSON-LD, the 308s for
 *              an old handle and /page/1, previews private
 *   EDITOR     the canvas and the link picker read the blog; Blog sits
 *              under Pages
 *   AI         read_blog after the page tools and before ask_creator, so the
 *              cached prefix keeps its place; MCP lists the templates
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { Metadata } from "next"
import { stripComments } from "./_source"
import { BLOG_PAGE_KEYS, BUILT_IN_PAGE_KEYS, GENERATED_PAGE_KEYS, RESERVED_PAGE_KEYS, isPageKey, pageKeyFromSegment, pagePath, pageTitleFromKey, templateForPage } from "@/lib/website-builder/site-pages"
import { PAGE_META } from "@/lib/website-builder/types"
import { groupPages, pageGroupOf } from "@/lib/website-builder/page-groups"
import { blogArticleSections, blogListingSections, canvasBlogData, describeBlog, isBlogSectionType, pageParts, pageWantsBlog, postDate, relatedCards, storefrontArticleFull, storefrontBlog } from "@/lib/website-builder/blog-page"
import { blogPageData } from "@/lib/website-builder/published-site"
import { renderStorelibSection } from "@/lib/website-builder/storelib-runtime"
import { SECTION_SCHEMAS, ADDABLE_SECTIONS } from "@/lib/website-builder/section-schemas"
import { storefrontData, dynamicContext } from "@/lib/website-builder/storefront-data"
import { storeLinkTargets } from "@/lib/website-builder/link-targets"
import { linkCategoryOf } from "@/lib/website-builder/link-menu"
import { resolveEditorHref } from "@/lib/website-builder/editor-navigation"
import { SITE_DISALLOW } from "@/lib/seo/indexing"
import { robotsTxt } from "@/lib/website-builder/site-seo"
import { articleMetadata, handleDecision, listPath, listingMetadata, listingStructuredData, pageFromSegment, postStructuredData, tagFromSegment } from "@/app/(site)/w/[username]/blogs/blog-route"
import { themeAgent, READ_BLOG_TOOL } from "@/lib/website-builder/agent/loop"
import type { AgentProvider, ProviderTurn, ToolCall } from "@/lib/sites/agent/types"
import type { ThemeState } from "@/lib/website-builder/agent/operations"
import type { BlogListing, PublicPost, PublicPostCard, SiteBlogSettings } from "@/lib/site-blog/types"
import type { SectionInstance } from "@/lib/website-builder/types"

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
const section = (t: string) => console.log(`\n${t}`)
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (p: string) => stripComments(read(p))
/** The words a visitor reads in some markup: no styles, no tags. */
const words = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()

/* ── A blog with posts ───────────────────────────────────────────────── */

const settings: SiteBlogSettings = { handle: "journal", previousHandles: ["news"], title: "The Journal", description: "Notes from the studio.", postsPerPage: 2, seoTitle: "", seoDescription: "", ogImageUrl: "https://cdn.example/blog.jpg" }
const author = { id: "a1", slug: "ana", name: "Ana Lee", role: "Potter", bio: "Throws pots in Lisbon.", avatarUrl: "https://cdn.example/ana.jpg", links: [{ label: "Instagram", url: "https://instagram.com/ana" }] }
const cat = (slug: string, name: string) => ({ slug, name, path: `/blogs/journal/category/${slug}` })
function card(i: number, over: Partial<PublicPostCard> = {}): PublicPostCard {
  return {
    id: `00000000-0000-4000-8000-00000000000${i}`,
    slug: `post-${i}`,
    path: `/blogs/journal/post-${i}`,
    title: `Post ${i}`,
    excerpt: `What post ${i} is about.`,
    summaryHtml: `<p>Opening words of post ${i}.</p>`,
    coverImageUrl: `https://cdn.example/${i}.jpg`,
    coverAlt: `Cover ${i}`,
    category: null,
    tags: [],
    author,
    publishedAt: `2026-0${9 - i}-01T10:00:00.000Z`,
    updatedAt: `2026-0${9 - i}-02T10:00:00.000Z`,
    readingMinutes: 4,
    featured: false,
    ...over,
  }
}
/* Newest first, as the blog reads them. */
const cards: PublicPostCard[] = [
  card(1, { category: cat("glazes", "Glazes"), tags: ["kiln", "blue"], featured: true }),
  card(2, { category: cat("studio", "Studio") , tags: ["kiln"] }),
  card(3, { category: cat("glazes", "Glazes"), tags: ["blue"] }),
  card(4, { tags: [] }),
  card(5, { category: cat("glazes", "Glazes"), tags: [], featured: true }),
]
const categories = [
  { id: "c1", slug: "glazes", name: "Glazes", description: "Colour and fire.", sortOrder: 0, seoTitle: "", seoDescription: "" },
  { id: "c2", slug: "studio", name: "Studio", description: "", sortOrder: 1, seoTitle: "", seoDescription: "" },
  { id: "c3", slug: "empty", name: "Empty one", description: "", sortOrder: 2, seoTitle: "", seoDescription: "" },
]
function listing(over: Partial<BlogListing> = {}): BlogListing {
  return { blog: settings, posts: cards.slice(0, 2), page: 1, pages: 3, total: 5, category: null, tag: null, categories, allTags: ["blue", "kiln"], ...over }
}
function post(i: number, over: Partial<PublicPost> = {}): PublicPost {
  const c = cards.find((x) => x.slug === `post-${i}`) ?? card(i)
  return {
    ...c,
    blocks: [],
    html: `<h2 id="first">The first firing</h2><p>Body of post ${i} with <strong>bold</strong>.</p>`,
    wordCount: 640,
    seo: { title: "", description: "", canonicalUrl: "", ogTitle: "", ogDescription: "", ogImageUrl: "", noindex: false },
    ...over,
  }
}

const sec = (id: string, type: string, settings: Record<string, unknown> = {}): SectionInstance => ({ id, type, name: type, settings, blocks: [] }) as SectionInstance
const draw = (s: SectionInstance, data: Record<string, unknown>, template = "index", inEditor = false) => {
  const out = renderStorelibSection(s, {} as never, { template, in_editor: inEditor }, undefined, [], data as never)
  if (out.ok === false) throw new Error(`${s.type} did not draw: ${JSON.stringify(out).slice(0, 400)}`)
  return out.html
}

async function main() {
  section("KEYS: the blog's templates are pages of the site, and a page called blog stays the creator's")
  {
    check("blogs and article are reserved, generated and built in", BLOG_PAGE_KEYS.every((k) => RESERVED_PAGE_KEYS.has(k) && GENERATED_PAGE_KEYS.has(k) && BUILT_IN_PAGE_KEYS.has(k)))
    check("  never an address of their own: /blogs and /article are not creator pages", pageKeyFromSegment("blogs") === null && pageKeyFromSegment("article") === null)
    check("a creator's own page called blog is still theirs", pageKeyFromSegment("blog") === "blog" && !RESERVED_PAGE_KEYS.has("blog") && !BUILT_IN_PAGE_KEYS.has("blog") && isPageKey("blog"))
    check("  and is still listed by the builder as one of the creator's", /!BUILT_IN_PAGE_KEYS\.has\(key\)/.test(code("app/website-builder/editor/[installId]/page.tsx")))
    check("named Blog and Blog post, at /blogs", pageTitleFromKey("blogs") === "Blog" && pageTitleFromKey("article") === "Blog post" && pagePath("blogs") === "/blogs" && pagePath("article") === "/blogs" && PAGE_META.blogs.label === "Blog" && PAGE_META.article.label === "Blog post")
    check("drawn as an imported theme's blog and article templates", templateForPage("blogs") === "blog" && templateForPage("article") === "article")
    const groups = groupPages([...BUILT_IN_PAGE_KEYS].map((k) => ({ key: k, name: k, path: pagePath(k) })))
    check("under a Blog group, after Pages", groups.map((g) => g.key).join(",").includes("pages,blog,accounts") && groups.find((g) => g.key === "blog")?.pages.map((p) => p.key).join(",") === "blogs,article" && pageGroupOf("blog") === "blog")
  }

  section("LAYOUT: generated until arranged, then what was saved")
  {
    const home = [sec("h", "header", { color_scheme: "dark" }), sec("hero", "hero"), sec("f", "footer")]
    const list = blogListingSections(home, {})
    const one = blogArticleSections(home, {})
    check("the Blog page is the header, main_blog and the footer", list.map((s) => s.type).join(",") === "header,main_blog,footer", list.map((s) => s.type))
    check("the Blog post page is the header, main_article and the footer", one.map((s) => s.type).join(",") === "header,main_article,footer")
    check("  in the chrome's colour scheme", list[1].settings.color_scheme === "dark" && one[1].settings.color_scheme === "dark")
    check("  with the same ids every time", blogListingSections(home, {})[1].id === list[1].id)
    const stored = [sec("h", "header"), sec("x", "main_blog", { layout: "list" }), sec("hero2", "hero"), sec("f", "footer")]
    check("a template the creator arranged is the one drawn", blogListingSections(home, {}, stored) === stored && blogArticleSections(home, {}, []).length === 3)
    const route = read("app/api/website-builder/themes/[installId]/sections/route.ts")
    check("the editor opens them from the same builders", /pageKey === "blogs"\s*\?\s*blogListingSections\(homeSections, theme\)/.test(route) && /pageKey === "article"\s*\?\s*blogArticleSections\(homeSections, theme\)/.test(route))
    check("a page shows posts when it has one of the three sections", pageWantsBlog([sec("a", "hero"), sec("b", "blog_featured")]) && !pageWantsBlog([sec("a", "hero")]) && !pageWantsBlog([{ ...sec("b", "blog_featured"), hidden: true }]) && isBlogSectionType("main_blog_2") && !isBlogSectionType("blogger"))
  }

  section("SECTIONS: main_blog draws the list it is handed")
  {
    for (const t of ["main_blog", "main_article", "blog_featured"]) check(`${t} is a section of the theme`, !!SECTION_SCHEMAS[t])
    check("Blog posts (blog_featured) is in Add a section; the two templates' own are not", ADDABLE_SECTIONS.includes("blog_featured") && !ADDABLE_SECTIONS.includes("main_blog") && !ADDABLE_SECTIONS.includes("main_article"))
    const p2 = storefrontBlog({ settings, cards, listing: listing({ posts: cards.slice(2, 4), page: 2 }) })
    const html = draw(sec("m", "main_blog"), { blog: p2 }, "blog")
    check("the page's posts, linked to their addresses", html.includes('href="/blogs/journal/post-3"') && html.includes('href="/blogs/journal/post-4"') && !html.includes("/blogs/journal/post-1\""), words(html))
    check("  the blog's name and description at the top", /<h1 class="head__h">The Journal<\/h1>/.test(html) && html.includes("Notes from the studio."))
    check("  categories with a post as chips, the empty one left out", html.includes('href="/blogs/journal/category/glazes"') && html.includes('href="/blogs/journal/category/studio"') && !html.includes("category/empty"))
    check("  each post's category, author, date and reading time", html.includes(">Glazes</a>") && html.includes("Ana Lee") && /<time class="post__date" datetime="2026-06-01T10:00:00.000Z">1 June 2026<\/time>/.test(html) && html.includes("4 min read"))
    check("  pages: the previous, the next, the numbers, the one open marked", html.includes('href="/blogs/journal" rel="prev"') && html.includes('href="/blogs/journal/page/3" rel="next"') && /aria-current="page">2</.test(html))
    check("  the first post is larger on page 1 only", !html.includes("post--lead") && draw(sec("m", "main_blog"), { blog: storefrontBlog({ settings, cards, listing: listing() }) }, "blog").includes("post--lead"))
    const glazes = storefrontBlog({ settings, cards, listing: listing({ category: { ...categories[0], postCount: 3 }, posts: [cards[0], cards[2]], pages: 2, total: 3 }) })
    const gh = draw(sec("m", "main_blog"), { blog: glazes }, "blog")
    check("a category's list: its name as the heading, its chip on, its own pages", /<h1 class="head__h">Glazes<\/h1>/.test(gh) && /class="chip chip--on" href="\/blogs\/journal\/category\/glazes" aria-current="page"/.test(gh) && gh.includes('href="/blogs/journal/category/glazes/page/2" rel="next"'), words(gh))
    const tagged = storefrontBlog({ settings, cards, listing: listing({ tag: "kiln", posts: [cards[0], cards[1]], pages: 1, total: 2 }) })
    const th = draw(sec("m", "main_blog", { show_tags: true }), { blog: tagged }, "blog")
    check("a tag's list: the tag as the heading, its tag marked, no pages for one page", /<h1 class="head__h">#kiln<\/h1>/.test(th) && /class="tag tag--on" href="\/blogs\/journal\/tagged\/kiln" aria-current="page"/.test(th) && !th.includes('class="pager"'))
    const list = draw(sec("m", "main_blog", { layout: "list", show_categories: false, show_excerpt: false, show_author: false, read_more_label: "Read the post" }), { blog: p2 }, "blog")
    check("the toggles: a list, no chips, no excerpt or author, a link under each", list.includes("posts--list") && !list.includes('class="chips') && !list.includes("What post 3") && !list.includes("Ana Lee") && list.includes("Read the post"))
    check("the columns come from the setting, per screen", /--cols-d: 3; --cols-t: 2; --cols-m: 1;/.test(html) && /--cols-d: 2;/.test(draw(sec("m", "main_blog", { columns: { desktop: 2, tablet: 2, mobile: 1 } }), { blog: p2 }, "blog")))
    const none = storefrontBlog({ settings, cards, listing: listing({ posts: [], total: 0, pages: 1 }) })
    check("a list with nothing in it says the setting's words", words(draw(sec("m", "main_blog"), { blog: none }, "blog")).includes("No posts here yet."))
  }

  section("SECTIONS: main_article draws the post")
  {
    const article = storefrontArticleFull({ post: post(2), cards, origin: "https://shop.example" })
    const html = draw(sec("a", "main_article"), { blog: storefrontBlog({ settings, cards }), article }, "article")
    check("its title, category, author, date and cover", /<h1 class="a__title">Post 2<\/h1>/.test(html) && html.includes('href="/blogs/journal/category/studio"') && html.includes("Ana Lee") && html.includes("1 July 2026") && html.includes('src="https://cdn.example/2.jpg"'))
    check("  its words, as the post's own markup", html.includes('<h2 id="first">The first firing</h2>') && html.includes("<strong>bold</strong>"))
    check("  its tags, linking to their lists", html.includes('href="/blogs/journal/tagged/kiln"'))
    check("  links to share it, at the post's own address", html.includes("https://twitter.com/intent/tweet?url=https%3A%2F%2Fshop.example%2Fblogs%2Fjournal%2Fpost-2") && html.includes("facebook.com/sharer") && html.includes("linkedin.com/sharing") && html.includes("mailto:?subject=Post%202"))
    check("  the author's bio", html.includes("Throws pots in Lisbon.") && html.includes("Written by"))
    check("  the post before it and the one after it", /href="\/blogs\/journal\/post-3" rel="prev"/.test(html) && /href="\/blogs\/journal\/post-1" rel="next"/.test(html))
    check("  related posts: its category first, then shared tags", article.related[0].handle === "post-1" && html.includes("Keep reading"))
    const fewer = draw(sec("a", "main_article", { related_count: 1, show_share: false, show_author_bio: false, show_neighbours: false }), { article }, "article")
    check("the toggles: one related post, no share links, no bio, no neighbours", (fewer.match(/class="rel__post"/g) ?? []).length === 1 && !fewer.includes("twitter.com") && !fewer.includes("Throws pots") && !fewer.includes('rel="prev"'))
    const relatedRule = relatedCards(cards, cards[2])
    check("related: the same category, then tags in common, then the newest", relatedRule.map((c) => c.slug).slice(0, 3).join(",") === "post-1,post-5,post-2", relatedRule.map((c) => c.slug))
  }

  section("SECTIONS: blog_featured on any page")
  {
    const blog = storefrontBlog({ settings, cards })
    const latest = draw(sec("f", "blog_featured"), { blog })
    check("the newest three by default, the heading and a link to the blog", (latest.match(/class="post"/g) ?? []).length === 3 && latest.includes("From the blog") && latest.includes('href="/blogs/journal">Read the blog'))
    const feat = draw(sec("f", "blog_featured", { source: "featured", post_count: 5 }), { blog })
    check("the ones marked featured", feat.includes("post-1") && feat.includes("post-5") && !feat.includes("post-2\""), words(feat))
    const glazes = draw(sec("f", "blog_featured", { source: "category", category_url: "/blogs/journal/category/glazes", post_count: 2 }), { blog })
    check("one category's, as many as asked", (glazes.match(/class="post"/g) ?? []).length === 2 && glazes.includes("post-1") && glazes.includes("post-3") && !glazes.includes("post-5\""))
    check("  named by its address, or its full address on the site's domain", draw(sec("f", "blog_featured", { source: "category", category_url: "https://mugs.example/blogs/journal/category/studio" }), { blog }).includes("post-2"))
  }

  section("SECTIONS: without a blog a live page shows nothing; the editor says where posts come from")
  {
    for (const [t, template] of [["main_blog", "blog"], ["main_article", "article"], ["blog_featured", "index"]] as const) {
      check(`${t}: nothing a visitor reads`, words(draw(sec("s", t), {}, template)) === "")
      check(`  and a note in the editor`, /Website Settings, Blog/.test(words(draw(sec("s", t), {}, template, true))))
    }
    const data = storefrontData({ dynamic: dynamicContext({ theme: {} }), catalog: [] })
    check("storefrontData carries no blog unless handed one", !("blog" in data) && !("article" in data))
    check("  and carries one it is handed", storefrontData({ dynamic: dynamicContext({ theme: {} }), blog: storefrontBlog({ settings, cards }) }).blog?.handle === "journal")
  }

  section("DATA: what a page is handed")
  {
    const future = card(9, { slug: "tomorrow", path: "/blogs/journal/tomorrow", publishedAt: new Date(Date.now() + 86_400_000).toISOString() })
    const got = blogPageData({ settings, cards: [future, ...cards] }, undefined, "https://shop.example", null)
    check("a scheduled post held in the cache is not shown before its time", !!got.blog && !got.blog.recent.some((p) => p.handle === "tomorrow") && got.blog.recent.length === 5)
    check("nothing without a blog (no SQL 355, no settings)", Object.keys(blogPageData(null, undefined, "", null)).length === 0)
    const withPost = blogPageData({ settings, cards }, { post: post(2) }, "https://shop.example", null)
    check("a post's page is handed the post as article, with its neighbours", withPost.article?.handle === "post-2" && withPost.article?.previous?.handle === "post-3" && withPost.article?.next?.handle === "post-1")
    check("dates in the page's language", postDate("2026-03-12T10:00:00Z", "fr") === "12 mars 2026" && postDate("2026-03-12T10:00:00Z", null) === "12 March 2026" && postDate("nonsense") === "")
    check("page numbers with gaps: 1 … 4 5 [6] 7 8 … 20", pageParts(6, 20, (n) => `/p/${n}`).map((p) => (p.gap ? "…" : p.current ? `[${p.label}]` : p.label)).join(" ") === "1 … 4 5 [6] 7 8 … 20" && pageParts(1, 1, String).length === 0)
    const blog = storefrontBlog({ settings, cards })
    check("featured and each category's newest posts are handed ready", blog.featured.map((p) => p.handle).join(",") === "post-1,post-5" && blog.categories.find((c) => c.handle === "glazes")?.posts.length === 3)
    const dress = code("lib/website-builder/published-site.ts")
    check("dressPage reads the blog only for a page that shows posts", /opts\.blog \|\| pageWantsBlog\(sections\)\s*\?\s*import\("@\/lib\/site-blog\/public-read"\)\.then\(\(\{ blogFor \}\) => blogFor\(site\.creatorId\)\)/.test(dress))
    const sample = canvasBlogData({ settings, listing: listing(), post: post(1), sample: true }, "article")
    check("the canvas: sample posts are flagged, and the post page gets its post", sample.blog?.sample === true && sample.article?.handle === "post-1" && canvasBlogData(null, "blogs").blog === null)
  }

  section("ROUTES: every address under /blogs")
  {
    check("an old handle moves, the current one stays, any other is missing", handleDecision(settings, "journal").kind === "current" && handleDecision(settings, "news").kind === "moved" && handleDecision(settings, "nope").kind === "missing")
    check("/page/1 is the list itself (308), /page/2 is page 2, anything else is no page", pageFromSegment("1").kind === "first" && JSON.stringify(pageFromSegment("2")) === '{"kind":"page","n":2}' && pageFromSegment("0").kind === "bad" && pageFromSegment("x").kind === "bad" && pageFromSegment(undefined).kind === "first")
    check("a list's own address, page 2 on in the path", listPath("journal", {}, 1) === "/blogs/journal" && listPath("journal", { tag: "kiln" }, 2) === "/blogs/journal/tagged/kiln/page/2" && listPath("journal", { category: "glazes" }, 3) === "/blogs/journal/category/glazes/page/3")
    check("a tag as typed in the address", tagFromSegment("Kiln%20Gods") === "kiln gods" && tagFromSegment("%E0%A4%A") === null && tagFromSegment("a/b") === null)
    const dir = "app/(site)/w/[username]/blogs"
    const routes = ["page.tsx", "[blog]/page.tsx", "[blog]/page/[n]/page.tsx", "[blog]/tagged/[tag]/page.tsx", "[blog]/tagged/[tag]/page/[n]/page.tsx", "[blog]/category/[category]/page.tsx", "[blog]/category/[category]/page/[n]/page.tsx", "[blog]/[article]/page.tsx", "[blog]/~preview/[token]/page.tsx"]
    for (const r of routes.filter((r) => !r.includes("~preview"))) {
      const src = code(`${dir}/${r}`)
      check(`${r}: held a minute, drawn on demand${r === "page.tsx" ? "" : ", with metadata of its own"}`, /export const revalidate = 60/.test(src) && /generateStaticParams\(\) \{\s*return \[\]/.test(src) && (r === "page.tsx" || /generateMetadata/.test(src)))
    }
    const preview = code(`${dir}/[blog]/~preview/[token]/page.tsx`)
    check("the preview: per request, never held, noindex", /export const dynamic = "force-dynamic"/.test(preview) && /unstable_noStore\(\)/.test(preview) && /robots: \{ index: false, follow: false \}/.test(preview) && !/revalidate/.test(preview))
    check("  and closed in the site's robots.txt", SITE_DISALLOW.includes("/blogs/*/~preview/") && robotsTxt("https://shop.example", true).includes("Disallow: /blogs/*/~preview/"))
    const route = code(`${dir}/blog-route.tsx`)
    check("an old handle or slug, and /page/1, answer 308 in the page's language", /if \(got\.kind === "redirect"\) permanentRedirect\(await inLanguage\(/.test(route) && /siteBlogRedirect\(creatorId, slug\)/.test(route) && /handle\.kind === "moved" \|\| \(ask\.page !== undefined && page\.kind === "first"\)/.test(route))
    check("no blog, or no live post: 404 everywhere, as before blogs", /if \(!source \|\| source\.cards\.length === 0\) return \{ kind: "missing" \}/.test(route) && /if \(!listing \|\| listing\.posts\.length === 0\) return \{ kind: "missing" \}/.test(route))
    check("a preview is read uncached, by its signed token, and never tracked", /readPreviewPost\(found\.site\.creatorId, token\)/.test(route) && /cached: !preview/.test(route) && /preview \? null : <TrackView/.test(route))

    const base: Metadata = { title: { absolute: "Post 2 | Mugs" }, description: "Visit Mugs", alternates: { canonical: "https://mugs.example/blogs/journal/post-2" }, openGraph: { title: "x", images: [{ url: "https://mugs.example/logo.png" }] }, twitter: { card: "summary_large_image" } }
    const meta = articleMetadata(base, post(2, { tags: ["kiln"] }), settings, { preview: false })
    const og = meta.openGraph as Record<string, unknown>
    check("a post: an article share card with its dates, author, section, tags and picture", og.type === "article" && og.publishedTime === cards[1].publishedAt && JSON.stringify(og.authors) === '["Ana Lee"]' && og.section === "Studio" && JSON.stringify(og.tags) === '["kiln"]' && JSON.stringify(og.images).includes("https://cdn.example/2.jpg"), og)
    check("  the canonical on the site's own address (siteMetadata: the custom domain), its description from the excerpt", (meta.alternates as { canonical: string }).canonical === "https://mugs.example/blogs/journal/post-2" && meta.description === "What post 2 is about.")
    const own = articleMetadata(base, post(2, { seo: { title: "Firing blue", description: "How", canonicalUrl: "https://elsewhere.example/a", ogTitle: "", ogDescription: "", ogImageUrl: "https://cdn.example/og.jpg", noindex: true } }), settings, { preview: false })
    check("  the post's own search title, canonical and share picture", JSON.stringify(own.title) === '{"absolute":"Firing blue"}' && (own.alternates as { canonical: string }).canonical === "https://elsewhere.example/a" && JSON.stringify((own.openGraph as Record<string, unknown>).images).includes("og.jpg"))
    check("  a post marked noindex is kept out, its links followed", JSON.stringify(own.robots) === '{"index":false,"follow":true}')
    check("  a site kept out of search keeps its post out too", JSON.stringify(articleMetadata({ ...base, robots: { index: false, follow: false } }, post(2), settings, { preview: false }).robots) === '{"index":false,"follow":false}')
    check("  a preview is never indexed or followed", JSON.stringify(articleMetadata(base, post(2), settings, { preview: true }).robots) === '{"index":false,"follow":false}')
    const listMeta = listingMetadata({ title: "x", alternates: { canonical: "https://mugs.example/blogs/journal/page/2" } }, listing({ page: 2 }))
    check("a list: a website card with the blog's picture and description, page 2 its own canonical", (listMeta.openGraph as Record<string, unknown>).type === "website" && JSON.stringify((listMeta.openGraph as Record<string, unknown>).images).includes("blog.jpg") && listMeta.description === "Notes from the studio." && (listMeta.alternates as { canonical: string }).canonical.endsWith("/page/2") && !listMeta.robots)
    check("  a tag's list is followed and never indexed", JSON.stringify(listingMetadata({}, listing({ tag: "kiln" })).robots) === '{"index":false,"follow":true}')
    check("  a category's says its own words", listingMetadata({}, listing({ category: { ...categories[0], postCount: 3 } })).description === "Colour and fire.")
    check("blogListMetadata asks siteMetadata for the list's path and page number", /siteMetadata\(segment, undefined, "blogs", null, \{ page: \{ kind: "page", name: listingName\(got\.listing\) \}, pageNumber: got\.listing\.page, path: got\.path \}\)/.test(route))

    const ld = postStructuredData({ post: post(2), settings, origin: "https://mugs.example", brand: "Mugs", logo: "https://mugs.example/logo.png" })
    const a = ld.article as Record<string, unknown>
    check("JSON-LD: a BlogPosting the store published, at the post's address", a["@type"] === "BlogPosting" && a.url === "https://mugs.example/blogs/journal/post-2" && (a.publisher as { name: string }).name === "Mugs" && (a.author as { name: string }).name === "Ana Lee" && a.articleSection === "Studio" && a.wordCount === 640)
    const crumbs = (ld.crumbs as { itemListElement: { name: string; item: string }[] }).itemListElement
    check("  and its breadcrumbs: Home › The Journal › Studio › Post 2", crumbs.map((c) => c.name).join(" › ") === "Mugs › The Journal › Studio › Post 2" && crumbs[1].item === "https://mugs.example/blogs/journal")
    const lld = listingStructuredData({ listing: listing({ page: 2, posts: cards.slice(2, 4) }), path: "/blogs/journal/page/2", origin: "https://mugs.example", brand: "Mugs" })
    check("a list's JSON-LD: a Blog of this page's posts", (lld.blog as Record<string, unknown>)["@type"] === "Blog" && ((lld.blog as { blogPost: unknown[] }).blogPost).length === 2 && (lld.blog as { url: string }).url === "https://mugs.example/blogs/journal/page/2")
    check("the pages print it through jsonLdScript", /jsonLdScript\(data\.blog\)/.test(route) && /jsonLdScript\(ld\.article\)/.test(route))
  }

  section("EDITOR: the canvas, its links and the link picker")
  {
    const editor = code("app/website-builder/editor/[installId]/page.tsx")
    check("the canvas reads the blog for the two templates and a page with a Blog posts section", /useCanvasBlog\(installId, !compatInstall && \(currentPage === "blogs" \|\| currentPage === "article" \|\| pageWantsBlog\(canvasSections\)\), currentPage\)/.test(editor) && /blog: canvasBlog\?\.blog, article: canvasBlog\?\.article/.test(editor))
    check("  from GET blog/canvas", /\/blog\/canvas`/.test(code("components/website-builder/use-canvas-blog.ts")))
    const ctx = { currentPage: "home", inspectorEnabled: false, fromNav: true, shopPath: "/products", customPageKeys: ["blog"] }
    const to = (h: string) => { const d = resolveEditorHref(h, ctx); return d.kind === "page" ? d.key : d.kind }
    check("a link to the blog opens the Blog template, a post the Blog post template", to("/blogs/journal") === "blogs" && to("/blogs/journal/page/2") === "blogs" && to("/blogs/journal/category/glazes") === "blogs" && to("/blogs") === "blogs" && to("/blogs/journal/post-2") === "article")
    check("  and the creator's own /blog page is still theirs", to("/blog") === "blog")
    const targets = storeLinkTargets({ blog: { handle: "journal", categories: [{ slug: "glazes", name: "Glazes" }] } })
    const blogTarget = targets.find((t) => t.href === "/blogs/journal")
    check("the link picker offers Blog and its categories under Pages", !!blogTarget && blogTarget.label === "Blog" && linkCategoryOf(blogTarget) === "pages" && targets.some((t) => t.href === "/blogs/journal/category/glazes" && t.context === "Blog" && linkCategoryOf(t) === "pages"))
    check("  and nothing while there is no blog to open", !storeLinkTargets({}).some((t) => t.href.startsWith("/blogs")))
  }

  section("AI: read_blog, after the page tools, before the question")
  {
    const sent: Record<string, string[]> = {}
    let blogAsked = 0
    const outputs: string[] = []
    const run = async (label: string, opts: { blog: boolean; script?: boolean }) => {
      let turn = 0
      const provider: AgentProvider = {
        id: "capture",
        async complete(request): Promise<ProviderTurn> {
          sent[label] ??= request.tools.map((t) => t.name)
          for (const t of request.turns) if (t.role === "tool") for (const r of t.results ?? []) outputs.push(r.output)
          const calls: ToolCall[] = opts.script && turn++ === 0 ? [{ id: "c1", name: "read_blog", argumentsJson: "{}" }] : []
          return { text: calls.length ? "" : "Done.", toolCalls: calls, raw: [], usage: { inputTokens: 1, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 1 }, stop: calls.length ? "tool_calls" : "done" }
        },
      }
      const state: ThemeState = { sections: [sec("h", "header"), sec("x", "hero"), sec("f", "footer")], settings: {} }
      const loop = themeAgent({
        provider,
        model: "test",
        prompt: "show my newest blog posts on the home page",
        state,
        page: "home",
        addable: ADDABLE_SECTIONS,
        pages: { list: async () => "pages", build: async () => ({ ok: true, text: "built" }) } as never,
        ...(opts.blog ? { readBlog: async () => { blogAsked++; return describeBlog({ settings, cards }) } } : {}),
      })
      for (;;) if ((await loop.next()).done) break
    }
    await run("without", { blog: false })
    await run("with", { blog: true })
    await run("called", { blog: true, script: true })
    const without = sent.without ?? []
    const withBlog = sent.with ?? []
    check("read_blog is offered when the run can read the blog, and only then", withBlog.includes("read_blog") && !without.includes("read_blog"))
    const at = withBlog.indexOf("read_blog")
    check("  after list_pages and build_page, right before ask_creator", at > withBlog.indexOf("build_page") && withBlog[at + 1] === "ask_creator", withBlog.slice(-5))
    check("  so every tool before it keeps its place in the cached prefix", JSON.stringify(withBlog.slice(0, at)) === JSON.stringify(without.slice(0, at)))
    check("  described as the blueprint says", READ_BLOG_TOOL.description === "Read the website's blog: its address, categories and the newest posts (title, excerpt, address). Do this before a section that shows posts.")
    check("calling it reads the blog once and answers with its posts and addresses", blogAsked === 1 && outputs.some((o) => o.includes('BLOG "The Journal" at /blogs/journal') && o.includes("/blogs/journal/category/glazes") && o.includes("never type a post")))
    check("no blog: the answer says so and that posts are never typed", describeBlog(null) === null && /never typed into a section/.test(code("lib/website-builder/agent/loop.ts")))
    const agentRoute = code("app/api/website-builder/themes/[installId]/agent/route.ts")
    check("the agent route supplies it from blogFor, on a Storelib theme", /readBlog: importedTheme\s*\?\s*undefined/.test(agentRoute) && /describeBlog\(await blogFor\(creatorId\)/.test(agentRoute))
    const pagesServer = code("lib/website-builder/agent/page-builder-server.ts")
    check("build_page starts the blog's templates from their layout, so main_blog and main_article are kept", /key === "blogs"\s*\?\s*blogListingSections\(homeChrome\(\), \{\}\)/.test(pagesServer) && /key === "article"\s*\?\s*blogArticleSections\(homeChrome\(\), \{\}\)/.test(pagesServer))
    check("the docs have a blog topic", /id: "blog",/.test(code("lib/storelib-ai/knowledge.ts")))
    const mcp = code("lib/agent-access/project.ts")
    check("MCP lists the blog's templates and reads them before they are stored", /blog_templates: BLOG_PAGE_KEYS\.map/.test(mcp) && /BLOG_PAGE_KEYS\.includes\(key\)\) return key/.test(mcp))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
