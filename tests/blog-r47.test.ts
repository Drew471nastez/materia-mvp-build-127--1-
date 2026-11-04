/**
 * ===========================================================================
 *  ROUND 47: THE BLOG REDONE FOR READING, AFTER THE OWNER LOOKED AT IT LIVE
 * ===========================================================================
 * ARTICLE   one 720px reading column for the header, the cover and the body;
 *           body 17px on a phone, 18px from 640px, at 1.7; the byline one
 *           row under the dek; "On this page" and one card in a left rail
 *           from 1200px; no right rail and no newsletter box.
 * CTA       the rail's card names everything Storelib sells (physical only
 *           while physical commerce is on); the box in the article keeps its
 *           kind of selling and names the rest; both go to /signup tagged.
 * LISTS     a post with no cover is never an empty box: a typographic cover
 *           on a card, a panel of type for the large post.
 * PILLS     in the blog's own layout, real links, empty categories left out,
 *           drawn only on the lists; the fade is opacity only.
 * SPY       the contents spy only follows headings the list links to.
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { stripComments } from "./_source"
import type { Block } from "@/lib/blog/blocks"
import { BLOG_CTA, blogRailCta } from "@/lib/blog/article"
import { ArticleView } from "@/app/(marketing)/blog/_components/article-view"
import { PostCard } from "@/app/(marketing)/blog/_components/post-card"
import BlogListing from "@/app/(marketing)/blog/_blog-listing"
import { withPublishedAsModified } from "@/lib/blog/trusted-modified"

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

const BANNED = /\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform|passive income)\b|—/i

const post = (i: number, cover: string | null, category = "Getting Started") => ({ id: `p${i}`, slug: `post-${i}`, title: `Post ${i} title`, excerpt: `Excerpt ${i}`, category, published_at: "2026-09-11T00:00:00Z", read_time: "", cover_image_url: cover })

const blocks: Block[] = [
  { id: "1", type: "p", html: "Intro" },
  { id: "2", type: "h2", html: "First" },
  { id: "3", type: "p", html: "a" },
  { id: "4", type: "h2", html: "Second" },
  { id: "5", type: "p", html: "b" },
  { id: "6", type: "p", html: "c" },
  { id: "7", type: "h2", html: "Third" },
]
const article = (physical: boolean) =>
  renderToStaticMarkup(
    createElement(ArticleView, {
      data: { slug: "x", url: "https://storelib.com/blog/x", title: "T", excerpt: "Dek", category: "Growth", published_at: "2026-04-02T00:00:00Z", updated_at: "2026-10-31T00:00:00Z", cover: "https://cdn.example.com/c.jpg", byline: "Anisia - Head of Marketing", blocks, cta: "digital", related: [], previous: null, next: null, physical },
    }),
  )

function main() {
  console.log("\nThe article")
  {
    const html = article(true)
    const view = code("app/(marketing)/blog/_components/article-view.tsx")
    /* Changed on purpose (round 49): no empty right column; the 260px rail and a 760px column, the pair centred (tests/blog-r49.test.ts). */
    check("one grid from 1200px: the rail and the reading column, the pair centred", /min-\[1200px\]:grid-cols-\[260px_minmax\(0,760px\)\] min-\[1200px\]:justify-center/.test(view))
    check("  header, cover and body all in the reading column", (view.match(/\$\{COLUMN\}/g) ?? []).length === 3 && /const COLUMN = "mx-auto w-full max-w-\[720px\]/.test(view))
    check("  no right rail and no newsletter box", !/xl:block/.test(view) && !/Newsletter|newsletter/.test(html) && !/New guides for creators/.test(html))
    check("the byline is one row under the dek, with the dates and Updated on one line", /<header[\s\S]*Dek[\s\S]*data-blog-byline=""[\s\S]*<\/header>/.test(html) && /data-blog-byline-dates=""[\s\S]*min read[\s\S]*Updated <time/.test(html))
    const body = code("app/(marketing)/blog/_components/article-blocks.tsx")
    /* Changed on purpose (round 49): 19px from 1200px, the 640px step written min-[640px] so it sorts before min-[1200px]. */
    check("body 17px, 18px from 640px, line height 1.7, near black links underlined", /const BODY = `text-\[17px\] leading-\[1\.7\] text-\[#374151\] min-\[640px\]:text-\[18px\]/.test(body) && /\[&_a\]:underline/.test(body) && /\[&_a\]:text-\[#1a1a2e\]/.test(body))
    check("  nothing under 14px in the article's own text", !/text-\[1[0-3](\.\d)?px\]/.test(body) && !/text-\[1[0-3](\.\d)?px\]/.test(code("app/(marketing)/blog/_components/toc.tsx")) && !/text-\[1[0-2]px\]/.test(view))
    /* Changed on purpose (round 49): the card is one short line, a subline and a button on a light surface, and names no kind of product (tests/blog-r49.test.ts). */
    check("the rail's card: one line, to /signup tagged src and ref", /data-blog-cta-card="digital"/.test(html) && /Sell anything from one place/.test(html) && /href="\/signup\?intent=sell&amp;src=blog-digital&amp;ref=blog-digital"/.test(html))
    check("  the same with physical commerce on or off", article(false).includes(blogRailCta().body) && article(true).includes(blogRailCta().body))
    check("  no gradient", !/gradient/.test(view))
    /* Changed on purpose (round 49): the box names the whole of Storelib in one short line. */
    check("the box in the article names the whole of Storelib", /data-blog-cta="digital"/.test(html) && /Products, courses, communities and your website/.test(BLOG_CTA.digital.body))
    const copy = [...Object.values(BLOG_CTA).flatMap((c) => [c.title, c.body]), blogRailCta().title, blogRailCta().body, read("app/(marketing)/blog/layout.tsx")].join("\n")
    check("  no banned words, no em dash", !BANNED.test(copy), copy.match(BANNED))
    check("the contents fold above the body below 1200px, the rail from 1200px", /min-\[1200px\]:hidden/.test(view) && /data-blog-toc-inline=""/.test(html) && /aria-label="Contents and sign up"/.test(html))
    const spy = code("app/(marketing)/blog/_components/toc-spy.tsx")
    check("the spy follows only headings the list links to (the sign up box's h2 has an id)", /\.filter\(\(h\) => listed\.has\(h\.id\)\)/.test(spy) && /new IntersectionObserver\(pick/.test(spy) && /"scrollend"/.test(spy))
  }

  console.log("\nA post with no cover")
  {
    const card = renderToStaticMarkup(createElement(PostCard, { post: post(1, null, "Growth") }))
    check("a card draws its category and title in type, on a tint, hidden from screen readers", /data-blog-cover-fallback=""/.test(card) && /aria-hidden="true"[^>]*data-blog-cover-fallback/.test(card) && /bg-\[#fcf3e6\]/.test(card) && (card.match(/Post 1 title/g) ?? []).length === 2)
    check("  never the old empty grey box", !/bg-\[#eef0f3\]/.test(card))
    const withCover = renderToStaticMarkup(createElement(PostCard, { post: post(2, "https://example.com/c.jpg") }))
    check("  a card with a cover is unchanged: its picture, no type", /<img/.test(withCover) && !/data-blog-cover-fallback/.test(withCover))
    const lead = renderToStaticMarkup(createElement(BlogListing, { posts: [post(1, null), post(2, null)], activeCategory: null, featured: true }))
    check("the large post with no cover is a panel of type, not a picture box", /data-blog-featured="" data-blog-featured-text=""/.test(lead) && /bg-\[#f3f0ff\]/.test(lead.slice(0, lead.indexOf("data-blog-featured-text"))))
    const leadCover = renderToStaticMarkup(createElement(BlogListing, { posts: [post(1, "https://example.com/c.jpg"), post(2, null)], activeCategory: null, featured: true }))
    check("  with a cover, the picture beside the text as before", /data-blog-featured=""/.test(leadCover) && !/data-blog-featured-text/.test(leadCover))
  }

  console.log("\nThe pills, kept in the layout")
  {
    const layout = code("app/(marketing)/blog/layout.tsx")
    const nav = code("app/(marketing)/blog/_components/blog-nav.tsx")
    check("the layout reads the categories and which have live posts", /readBlogCategories\(\), readBlogPosts\(\)/.test(layout) && /hasPosts: live\.has\(c\.name\)/.test(layout))
    check("  and asks nothing about the reader (the blog stays held at the edge)", !/cookies\(|headers\(|searchParams/.test(layout))
    check("  no loading.tsx beside it (404s and 308s stay decided before the stream)", !existsSync(join(process.cwd(), "app/(marketing)/blog/loading.tsx")))
    check("empty categories are left out, the one being read always shown", /categories\.filter\(\(c\) => c\.hasPosts \|\| c\.slug === slug\)/.test(nav))
    /* Changed on purpose (round 49): the stuck place is measured from the new page, after it is in. */
    check("pills are next/link, the pressed one current at once, the place kept", /scroll=\{false\}/.test(nav) && /setPressed\(\{ from: pathname, slug: to \}\)/.test(nav) && /window\.scrollTo\(0, Math\.ceil\(window\.scrollY \+ mark\.getBoundingClientRect\(\)\.top - headerHeight\(\)\)\)/.test(nav))
    check("  modified clicks are left to the browser", /e\.metaKey \|\| e\.ctrlKey \|\| e\.shiftKey \|\| e\.altKey/.test(nav))
    check("  sticky under the measured header, scrolls sideways with no scrollbar", /sticky top-\[var\(--blog-top,65px\)\]/.test(nav) && /\[scrollbar-width:none\]/.test(nav) && /\[&::-webkit-scrollbar\]:hidden/.test(nav))
    /* Changed on purpose (round 49): the pill is positioned, so its text sits over the sliding fill. */
    check("  each pill a 44px target", /className="group relative flex h-11 items-center/.test(nav))
    const css = read("app/globals.css")
    /* Changed on purpose (round 49): a crossfade with a 6px rise, opacity and transform only (tests/blog-r49.test.ts). */
    check("the list's fade is opacity and transform only, and off with reduced motion", /@keyframes blog-list-swap \{\s*from \{ opacity: 0; transform: translate3d\(0, 6px, 0\); \}\s*to \{ opacity: 1; transform: none; \}\s*\}/.test(css) && /\.blog-list-swap, \.blog-title-swap \{ animation: none; \}/.test(css))
  }

  /* Round 47, lead: before SQL part 345 a reader's view moves updated_at, so the published date stands in wherever a reader or a crawler sees "updated". */
  {
    const rows = [{ slug: "a", published_at: "2026-04-02T00:00:00Z", updated_at: "2026-11-01T09:00:00Z" }]
    check("before part 345 the published date stands in for updated_at; after it, the real one", withPublishedAsModified(rows, false)[0].updated_at === "2026-04-02T00:00:00Z" && withPublishedAsModified(rows, true)[0].updated_at === "2026-11-01T09:00:00Z")
    check("  the post page, the lists and the sitemap all read it that way", /withPublishedAsModified\(\(data \|\| \[\]\)/.test(read("lib/blog/read.ts")) && /if \(!\("draft_saved_at" in row\)\) row\.updated_at = row\.published_at/.test(read("lib/blog/post.ts")) && /const trustedModified = await trustsUpdatedAt\(\)/.test(read("lib/seo/sitemaps.ts")))
  }

  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exit(1)
}

main()

