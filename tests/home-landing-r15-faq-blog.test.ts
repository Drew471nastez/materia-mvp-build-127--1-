/**
 * Landing round 15, faq-blog. The owner:
 *  - /faq: the heading reads "Frequently asked questions" (it read "Questions
 *    about Storelib"), and the dark top a little darker
 *  - the blog: switching between All, Getting Started, Creator Tips, Growth
 *    and Strategy flashed and glitched, and the heading and its line changed.
 *    The heading and line stay the blog's; only the list changes, smoothly
 *
 * The pills no longer load a page: they write the category's address with
 * history.pushState and the list is redrawn in the browser from every post
 * the page already holds (app/(storelib)/(marketing)/blog/_components/
 * blog-lists.tsx). Each address is still a real page with its own metadata,
 * canonical and JSON-LD.
 *
 * Measured in a browser (next dev, 390x844 and 1440x900, every animation
 * frame across a switch): the h1 read "Blog" and its line the blog's own in
 * every frame, the h1 never moved, no frame without cards, no document or
 * RSC request for a switch, the list's opacity never under 0.3, the tab title
 * the category's; back and forward land on the right list with its pill marked.
 */
import { existsSync, readFileSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { FaqPageClient } from "@/components/marketing/faq-page-client"
import { faqTopics, SUPPORT_EMAIL } from "@/lib/marketing/faq-page"
import { BlogLists } from "@/app/(storelib)/(marketing)/blog/_components/blog-lists"
import { blogListOf } from "@/app/(storelib)/(marketing)/blog/_components/blog-nav"
import { blogCategoryTitle, blogIndexTitle } from "@/app/(storelib)/(marketing)/blog/_components/blog-titles"
import { blogIndexMetadata } from "@/app/(storelib)/(marketing)/blog/_blog-index"
import { STATIC_BLOG_POSTS, type BlogPost } from "@/lib/blog/listing"

let failed = 0
let passed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${name}`) } else { failed++; console.log(`  FAIL  ${name}`, detail ?? "") }
}
const read = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "")
const CLIENT = "components/marketing/faq-page-client.tsx"
const BLOG = "app/(storelib)/(marketing)/blog"
const BANNED = /\b(unlock|elevate|seamless(ly)?|powerful|effortless(ly)?|supercharge|transform(s|ing)?)\b|—/i

console.log("\n/faq")
{
  const html = renderToStaticMarkup(createElement(FaqPageClient, { topics: faqTopics(), supportEmail: SUPPORT_EMAIL, helpUrl: "/help" }))
  check("the heading reads Frequently asked questions, the second line muted", /<h1 id="fq-title" class="fq-title">Frequently <span>asked questions<\/span><\/h1>/.test(html))
  check("  the old heading is gone", !/Questions about/.test(read(CLIENT)))
  const css = (/const CSS = `([\s\S]*?)`/.exec(read(CLIENT))?.[1] ?? "").replace(/\/\*[\s\S]*?\*\//g, "")
  check("the dark top is a step darker than the header's #16161a", /\.fq-top\{position:relative;isolation:isolate;overflow:clip;background:#0e0e11;/.test(css))
}

const post = (id: number, category: string): BlogPost => ({ id: `p${id}`, slug: `post-${id}`, title: `Post ${id} title`, excerpt: "An excerpt.", category, published_at: `2026-0${(id % 9) + 1}-01T00:00:00Z`, read_time: "3 min read", cover_image_url: null })
const posts = [post(1, "Growth"), post(2, "Strategy"), post(3, "Growth"), post(4, "Creator Tips")]
const categories = [{ slug: "growth", name: "Growth" }, { slug: "strategy", name: "Strategy" }, { slug: "creator-tips", name: "Creator Tips" }]
/* The suites' next/navigation (scripts/push-test-loader.mjs) reads the address from here. */
const at = (pathname: string) => {
  ;(globalThis as { __PUSH_TEST_PATHNAME__?: string }).__PUSH_TEST_PATHNAME__ = pathname
  return renderToStaticMarkup(createElement(BlogLists, { posts, categories }))
}

console.log("\nThe blog: one list, drawn by its address")
{
  const all = at("/blog")
  check("/blog: every post, the newest with the large card", new Set(all.match(/Post \d title/g)).size === 4 && /data-blog-featured=""/.test(all))
  const growth = at("/blog/category/growth")
  check("/blog/category/growth: its posts only, no large card", /Post 1 title/.test(growth) && /Post 3 title/.test(growth) && !/Post 2 title|Post 4 title/.test(growth) && !/data-blog-featured/.test(growth))
  check("  headed for readers of assistive tech as its category", /Articles in Growth/.test(growth))
  check("  no fade on a first load, only after a move", !/blog-list-swap/.test(growth) && /data-blog-client-list=""/.test(growth))
  check("the path's page is read: /blog/page/3 and a category's page 2", blogListOf("/blog/page/3").page === 3 && blogListOf("/blog/category/growth/page/2").page === 2 && blogListOf("/blog/category/growth/page/2").slug === "growth" && blogListOf("/blog").page === 1)
  check("the four posts in the code are on the list as well", STATIC_BLOG_POSTS.length === 4)
}

console.log("\nThe blog: the heading and the line never change")
{
  const nav = code(`${BLOG}/_components/blog-nav.tsx`)
  check("the h1 is Blog and the line the blog's own on every list", /data-blog-list-header="">\s*<h1[^>]*>Blog<\/h1>/.test(nav) && />\{description\}<\/p>/.test(nav))
  check("  never re-keyed, never faded", !/<header key=/.test(nav) && !/blog-title-swap/.test(nav) && !/blog-title-swap/.test(read("app/globals.css")))
  check("  no category name or line drawn over the list", !/current\.name|current\.description/.test(nav))
}

console.log("\nThe blog: a pill loads no page")
{
  const nav = code(`${BLOG}/_components/blog-nav.tsx`)
  check("with the list on the page, a press writes the address with pushState and stops the link", /if \(root\.current\?\.querySelector\("\[data-blog-client-list\]"\)\) \{\s*e\.preventDefault\(\)\s*window\.history\.pushState\(null, "", e\.currentTarget\.href\)/.test(nav))
  check("  modified clicks are still the browser's, each pill still a real link", /e\.metaKey \|\| e\.ctrlKey \|\| e\.shiftKey \|\| e\.altKey/.test(nav) && /<Link href=\{href\} scroll=\{false\} prefetch=\{false\}/.test(nav))
  check("  the old list never fades out to a blank (it was the flash)", !/blog-list-out/.test(nav) && !/\.blog-list-out \{/.test(read("app/globals.css")))
  check("  back and forward mark the pill of the list they land on", /useIsoLayoutEffect\(\(\) => \{\s*setPressed\(null\)/.test(nav))
  const lists = code(`${BLOG}/_components/blog-lists.tsx`)
  check("the list reads the address and redraws, keyed by it, fading in after a move", /const pathname = usePathname\(\)/.test(lists) && /<div key=\{pathname\} className=\{moved \? "blog-list-swap" : undefined\}/.test(lists))
  check("  the tab title follows, in the metadata's own words", /document\.title = category \? blogCategoryTitle\(category\.name, cut\.page\) : blogIndexTitle\(cut\.page\)/.test(lists))
  const css = read("app/globals.css")
  check("the fade: 220ms, from 30% and 6px down, opacity and transform only, none with reduced motion", /\.blog-list-swap \{\s*animation: blog-list-swap 220ms/.test(css) && /@keyframes blog-list-swap \{\s*from \{ opacity: 0\.3; transform: translate3d\(0, 6px, 0\); \}\s*to \{ opacity: 1; transform: none; \}/.test(css) && /prefers-reduced-motion: reduce\) \{\s*\.blog-list-swap \{ animation: none; \}/.test(css))
  check("no loading.tsx anywhere in the blog (no skeleton flash between lists)", !existsSync(`${BLOG}/loading.tsx`) && !existsSync(`${BLOG}/category/[slug]/loading.tsx`))
}

console.log("\nThe blog: each list is still its own page")
{
  const index = code(`${BLOG}/_blog-index.tsx`)
  const category = code(`${BLOG}/_blog-category.tsx`)
  check("the index and a category hand the list every post and category", /readBlogPosts\(\), readBlogCategories\(\)/.test(index) && /<BlogLists posts=\{all\}/.test(index) && /const all = await readBlogPosts\(\)/.test(category) && /<BlogLists posts=\{all\}/.test(category))
  check("  their titles are the shared ones", blogIndexMetadata(1).title && (blogIndexMetadata(1).title as { absolute?: string }).absolute === blogIndexTitle(1) && /title: blogCategoryTitle\(category\.name, page\)/.test(category) && blogCategoryTitle("Growth", 1) === "Growth | Storelib Blog" && blogCategoryTitle("Growth", 2) === "Growth, page 2 | Storelib Blog")
  check("  a category keeps its canonical, its CollectionPage and breadcrumbs", /path: blogCategoryPath\(category\.name, page, categories\)/.test(category) && /"@type": "CollectionPage"/.test(category) && /breadcrumbListJsonLd\(crumbs\)/.test(category))
  check("  the category pages are still built and held for an hour", /generateStaticParams/.test(code(`${BLOG}/category/[slug]/page.tsx`)) && /export const revalidate = 3600/.test(code(`${BLOG}/category/[slug]/page.tsx`)))
  check("no banned words or em dash in what changed", !BANNED.test(code(`${BLOG}/_components/blog-lists.tsx`) + code(`${BLOG}/_components/blog-titles.ts`) + code(`${BLOG}/_components/blog-nav.tsx`)))
}

console.log("\nRegistered")
check("this suite runs with the push tests, after the last round 14 entry", /"tests\/home-landing-r14-everything\.test\.ts",\s*\/\*[^*]*\*\/\s*"tests\/home-landing-r15-faq-blog\.test\.ts"/.test(read("scripts/run-push-tests.mjs")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
