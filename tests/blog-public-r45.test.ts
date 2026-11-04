/**
 * ===========================================================================
 *  ROUND 45: THE PUBLIC BLOG AND THE HELP ARTICLE, AS A READER AND A CRAWLER SEE THEM
 * ===========================================================================
 * STRUCTURED DATA  BlogPosting (image array, Person or Storelib, publisher
 *                  logo), BreadcrumbList, VideoObject only with an uploadDate,
 *                  Blog with its posts (lib/blog/structured-data).
 * SANITISER        sanitizeInline keeps b, strong, i, em, u, s, a[href],
 *                  code, br and nothing else.
 * BLOCKS           every type in lib/blog/blocks.ts renders; older rows' lists
 *                  and pictures inside a paragraph are lifted out; headings
 *                  carry the anchors the contents list links to.
 * CATEGORIES       /blog/category/<slug>; the old address is a 308 to it;
 *                  the sitemap names the new one.
 * CTA, NEWSLETTER  the sign up box's address reads back as a source; the
 *                  newsletter route takes source "blog" and a honeypot (the
 *                  article's newsletter box itself is gone since round 47).
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { stripComments } from "./_source"
import type { Block } from "@/lib/blog/blocks"
import { NEW_BLOCK_TYPES, LEGACY_BLOCK_TYPES } from "@/lib/blog/blocks"
import {
  articleOutline,
  articleWordCount,
  authorOf,
  blogCategoryPath,
  blogSignupHref,
  ctaVariant,
  isMeaningfullyUpdated,
  legacyBlocks,
  legacyCategoryTarget,
  normalizeBlocks,
  parseChapters,
  postNeighbours,
  readMinutes,
  relatedPosts,
  withBlogCategoryPages,
  youtubeWatchUrl,
} from "@/lib/blog/article"
import { blogEmbed, youtubeIdFromUrl } from "@/lib/blog/embed"
import { blogJsonLd, blogPostingJsonLd, breadcrumbListJsonLd, videoObjectsJsonLd } from "@/lib/blog/structured-data"
import { readSignupSource } from "@/lib/alternatives/attribution"
import { blogSitemapEntries } from "@/lib/blog/listing"
import { STORELIB_CATEGORIES, categoryToSlug } from "@/lib/blog-categories"
import { ArticleBlocks, sanitizeInline } from "@/app/(marketing)/blog/_components/article-blocks"
import { GET as legacyCategoryGET } from "@/app/(marketing)/blog/explore/categories/[category]/route"
import BlogListing from "@/app/(marketing)/blog/_blog-listing"
import { blogListOf } from "@/app/(marketing)/blog/_components/blog-nav"

/* Round 47: which paths draw the pills (the lists) and which do not (an article, an author). */
const blogListOfOk = () =>
  blogListOf("/blog").list && blogListOf("/blog/page/2").list && blogListOf("/blog/category/growth").slug === "growth" && blogListOf("/blog/category/growth/page/3").slug === "growth" && !blogListOf("/blog/some-post").list && !blogListOf("/blog/author/anisia").list && !blogListOf("/blog/page").list

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

async function main() {
  console.log("\nsanitizeInline")
  {
    /* Since the merge: lib/blog/sanitize.ts sanitizeInlineHtml does the work, strong and em folded to b and i. */
    check("keeps the inline tags", sanitizeInline("<b>a</b> <strong>b</strong> <i>c</i> <em>d</em> <u>e</u> <s>f</s> <code>g</code> h<br/>i") === "<b>a</b> <b>b</b> <i>c</i> <i>d</i> <u>e</u> <s>f</s> <code>g</code> h<br>i")
    check("a keeps its href and nothing else", sanitizeInline('<a href="/pricing" class="x" style="color:red" onclick="alert(1)">p</a>') === '<a href="/pricing">p</a>')
    check("  an external link keeps its address", sanitizeInline('<a href="https://example.com/x">x</a>') === '<a href="https://example.com/x">x</a>')
    check("javascript: links lose their href", sanitizeInline('<a href="javascript:alert(1)">x</a>') === "x")
    check("  also when hidden with entities, case or whitespace", ['<a href="JaVaScRiPt:alert(1)">x</a>', '<a href="java&#x09;script:alert(1)">x</a>', '<a href=" javascript:alert(1)">x</a>', '<a href="javascript&colon;alert(1)">x</a>'].every((h) => sanitizeInline(h) === "x"))
    check("data: and vbscript: too", sanitizeInline('<a href="data:text/html,x">x</a>') === "x" && sanitizeInline('<a href="vbscript:x">x</a>') === "x")
    check("mailto, tel and anchors are kept", sanitizeInline('<a href="mailto:a@b.co">m</a><a href="tel:+1">t</a><a href="#h">h</a>') === '<a href="mailto:a@b.co">m</a><a href="tel:+1">t</a><a href="#h">h</a>')
    check("on* handlers never survive, on any tag", !/onerror|onload|onclick/i.test(sanitizeInline('<b onmouseover="x()">b</b><img src=x onerror=alert(1)><svg onload=alert(1)>')))
    check("script and style go with their text", sanitizeInline("a<script>alert(1)</script>b<style>p{}</style>c") === "abc")
    const other = sanitizeInline('<span style="x">one</span> <div>two</div> <img src="x.png">')
    check("other tags go, their text stays", !/[<>]/.test(other) && /one\s+two/.test(other), other)
    check("unclosed tags are closed, stray closers dropped", sanitizeInline("<b>bold <i>both") === "<b>bold <i>both</i></b>" && sanitizeInline("x</b></a>") === "x")
    check("text is escaped where it is not markup; real entities stay", sanitizeInline("1 < 2 & 3 > 2 &amp; &lt;") === "1 &lt; 2 &amp; 3 &gt; 2 &amp; &lt;")
    check("the href's quotes cannot break out", !/"\s+onclick/.test(sanitizeInline(`<a href='/x" onclick="alert(1)'>x</a>`)))
    check("comments and unclosed script are removed", sanitizeInline("a<!-- <b>x</b> -->b<script>never closed") === "ab")
    check("null and empty are empty", sanitizeInline(null) === "" && sanitizeInline("") === "")
    const renderer = code("app/(marketing)/blog/_components/article-blocks.tsx")
    check("every dangerouslySetInnerHTML in the renderer goes through sanitizeInline", (renderer.match(/dangerouslySetInnerHTML/g) ?? []).length === 1 && /dangerouslySetInnerHTML=\{\{ __html: sanitizeInline\(html\) \}\}/.test(renderer))
  }

  console.log("\nBlocks and the contents list")
  {
    const blocks: Block[] = [
      { id: "1", type: "h2", html: "Pricing <b>basics</b>" },
      { id: "2", type: "p", html: "x" },
      { id: "3", type: "h3", html: "Anchoring" },
      { id: "4", type: "h2", html: "Pricing basics" },
      { id: "5", type: "h2", html: "Custom", anchor: "my-anchor" },
      { id: "6", type: "h2", html: "   " },
    ]
    const { toc, anchors } = articleOutline(blocks)
    check("h2 and h3 in order, with their level", toc.map((t) => `${t.level}:${t.id}`).join(",") === "2:pricing-basics,3:anchoring,2:pricing-basics-2,2:my-anchor", toc)
    check("  the text without its tags", toc[0].text === "Pricing basics")
    check("  anchors line up with the blocks, none for an empty heading", anchors[0] === "pricing-basics" && anchors[1] === undefined && anchors[3] === "pricing-basics-2" && anchors[5] === undefined)
    const html = renderToStaticMarkup(createElement(ArticleBlocks, { blocks, postTitle: "T" }))
    check("  and the headings carry those ids", /<h2 id="pricing-basics"/.test(html) && /<h3 id="anchoring"/.test(html) && /<h2 id="pricing-basics-2"/.test(html) && /<h2 id="my-anchor"/.test(html))

    const lifted = normalizeBlocks([
      { id: "a", type: "p", html: 'Intro<ul><li><strong>One</strong> first</li><li>Two</li></ul>after' },
      { id: "b", type: "p", html: '<img src="https://cdn.example.com/a.png" alt="A chart" style="width:100%" />' },
      { id: "c", type: "p", html: '<img src="javascript:alert(1)">' },
      { type: "p", text: "plain <text>" },
      { id: "d", type: "nope" },
      null,
    ])
    check("a list inside a paragraph becomes a list block", lifted.map((b) => b.type).join(",") === "p,ul,p,img,p", lifted)
    check("  its items keep their inline html", lifted[1].items?.[0] === "<strong>One</strong> first" && lifted[1].items?.length === 2)
    check("a lone picture becomes a picture block with its alt", lifted[3].url === "https://cdn.example.com/a.png" && lifted[3].alt === "A chart")
    check("  a picture with a script address is dropped", !lifted.some((b) => b.url?.startsWith("javascript")))
    check("plain text is escaped into html, unknown types dropped, every block has an id", lifted[4].html === "plain &lt;text&gt;" && lifted.every((b) => b.id))

    const legacy = legacyBlocks(["Intro **bold** & more", "## A heading", "line one\nline two"])
    check("the code-written posts' lines become blocks", legacy.map((b) => b.type).join(",") === "p,h2,p,p" && legacy[0].html === "Intro <strong>bold</strong> &amp; more")

    const words = articleWordCount([
      { id: "1", type: "p", html: "one two <b>three</b>" },
      { id: "2", type: "code", text: "not counted at all here" },
      { id: "3", type: "youtube", videoId: "dQw4w9WgXcQ", transcript: "not counted either" },
      { id: "4", type: "ul", items: ["four five"] },
    ])
    check("read time counts prose, not code or a transcript", words === 5, words)
    check("  minutes round up and are at least one", readMinutes(0) === 1 && readMinutes(231) === 2 && readMinutes(2300) === 10)
    check("'Updated' only when saved two days or more after publishing", !isMeaningfullyUpdated("2026-03-01T00:00:00Z", "2026-03-01T09:00:00Z") && isMeaningfullyUpdated("2026-03-01T00:00:00Z", "2026-03-04T00:00:00Z") && !isMeaningfullyUpdated(null, "2026-03-04"))
  }

  console.log("\nEvery block type renders")
  {
    const all: Block[] = [
      { id: "p", type: "p", html: 'Text with <a href="/pricing">a link</a>' },
      { id: "h2", type: "h2", html: "Section" },
      { id: "h3", type: "h3", html: "Sub" },
      { id: "hr", type: "hr" },
      { id: "img", type: "img", url: "https://cdn.example.com/p.jpg", alt: "Alt text", caption: "A caption" },
      { id: "yt", type: "youtube", videoId: "dQw4w9WgXcQ", caption: "Watch", chapters: ["0:00 Start", "1:05 Pricing", "1:02:03 Wrap up", "no time"], transcript: "First paragraph.\n\nSecond paragraph." },
      { id: "table", type: "table", headers: ["Plan", "Fee"], rows: [["Free", "5%"]] },
      { id: "quote", type: "quote", html: "A quote" },
      { id: "ul", type: "ul", items: ["<b>One</b>", "Two"] },
      { id: "ol", type: "ol", items: ["First"] },
      { id: "code", type: "code", lang: "js", text: "const a = '<b>'" },
      { id: "callout", type: "callout", tone: "warning", html: "Careful" },
      { id: "cta", type: "cta", title: "Try it", body: "Free to start", label: "Start", url: "/signup" },
      { id: "embed", type: "embed", provider: "vimeo", url: "https://vimeo.com/76979871", caption: "A film" },
      { id: "embed-bad", type: "embed", provider: "vimeo", url: "https://evil.example.com/76979871", caption: "Not vimeo" },
      { id: "video", type: "video", url: "https://cdn.example.com/clip.webm", caption: "Clip" },
      { id: "video-bad", type: "video", url: "https://cdn.example.com/clip.mov" },
      { id: "snip", type: "snippet", snippetId: "s1" },
      { id: "snip-missing", type: "snippet", snippetId: "missing" },
    ]
    check("the fixture covers every type in lib/blog/blocks.ts", [...LEGACY_BLOCK_TYPES, ...NEW_BLOCK_TYPES].every((t) => all.some((b) => b.type === t)))
    const html = renderToStaticMarkup(createElement(ArticleBlocks, { blocks: all, postTitle: "Post", snippets: { s1: [{ id: "s1a", type: "p", html: "From the snippet" }] } }))
    check("p, with its link", /<p[^>]*>Text with <a href="\/pricing">a link<\/a><\/p>/.test(html))
    check("h2, h3, hr, quote", /<h2[^>]*>Section<\/h2>/.test(html) && /<h3[^>]*>Sub<\/h3>/.test(html) && /<hr/.test(html) && /<blockquote[^>]*>[\s\S]*A quote/.test(html))
    check("img with alt and caption, lazy", /<img[^>]*alt="Alt text"/.test(html) && /loading="lazy"/.test(html) && /A caption<\/figcaption>/.test(html))
    check("youtube: a thumbnail and a play button, no iframe until pressed", /i\.ytimg\.com\/vi\/dQw4w9WgXcQ\/hqdefault\.jpg/.test(html) && /aria-label="Play video: Watch"/.test(html) && !/youtube(-nocookie)?\.com\/embed\/dQw4w9WgXcQ/.test(html))
    check("  chapters are links with &t= that work without script", /href="https:\/\/www\.youtube\.com\/watch\?v=dQw4w9WgXcQ&amp;t=65s"/.test(html) && /href="https:\/\/www\.youtube\.com\/watch\?v=dQw4w9WgXcQ&amp;t=3723s"/.test(html) && !/no time/.test(html))
    check("  the transcript is in the page, folded in a <details>", /<details[^>]*data-blog-transcript[\s\S]*Transcript[\s\S]*First paragraph\.[\s\S]*Second paragraph\./.test(html))
    check("table, lists, code (escaped)", /<th[^>]*>Plan<\/th>/.test(html) && /<td[^>]*>5%<\/td>/.test(html) && /<li[^>]*><b>One<\/b><\/li>/.test(html) && /<ol/.test(html) && /const a = &#x27;&lt;b&gt;&#x27;/.test(html))
    check("callout with its tone", /data-blog-callout="warning"[\s\S]*Warning[\s\S]*Careful/.test(html))
    check("cta block with its button", /data-blog-cta-block[\s\S]*Try it[\s\S]*Free to start[\s\S]*href="\/signup"[^>]*>Start/.test(html))
    check("embed from the allow-list is a lazy frame built from the id", /<iframe[^>]*src="https:\/\/player\.vimeo\.com\/video\/76979871"[^>]*loading="lazy"|<iframe[^>]*loading="lazy"[^>]*src="https:\/\/player\.vimeo\.com\/video\/76979871"/.test(html))
    check("  anything else is a plain link, never a frame", /<a href="https:\/\/evil\.example\.com\/76979871"[^>]*>Not vimeo<\/a>/.test(html) && !/<iframe[^>]*evil/.test(html))
    check("video: mp4 or webm, controls, preload none", /<video[^>]*controls=""[^>]*preload="none"/.test(html) && /<source src="https:\/\/cdn\.example\.com\/clip\.webm" type="video\/webm"/.test(html) && !/clip\.mov/.test(html))
    check("snippet: a resolved one draws its blocks, a missing one draws nothing", /From the snippet/.test(html) && !/missing/.test(html))
  }

  console.log("\nEmbeds")
  {
    check("youtube ids from every address shape", ["https://youtu.be/dQw4w9WgXcQ", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://youtube.com/shorts/dQw4w9WgXcQ", "https://www.youtube.com/embed/dQw4w9WgXcQ"].every((u) => youtubeIdFromUrl(u) === "dQw4w9WgXcQ"))
    check("each provider's frame", blogEmbed({ provider: "loom", url: "https://www.loom.com/share/0123456789abcdef0123" })?.kind === "frame" && (blogEmbed({ provider: "x", url: "https://x.com/u/status/1234567" }) as Any).src.startsWith("https://platform.twitter.com/embed/Tweet.html?id=123") && (blogEmbed({ provider: "spotify", url: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC" }) as Any).src === "https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC" && (blogEmbed({ provider: "codepen", url: "https://codepen.io/team/pen/abcDEF" }) as Any).src.startsWith("https://codepen.io/team/embed/abcDEF") && (blogEmbed({ provider: "figma", url: "https://www.figma.com/design/AbC123def456/File" }) as Any).src.startsWith("https://www.figma.com/embed?embed_host=storelib&url="))
    check("a provider with somebody else's address is nothing", blogEmbed({ provider: "loom", url: "https://loom.evil.com/share/abc" }) === null && blogEmbed({ provider: "spotify", url: "javascript:alert(1)" }) === null && blogEmbed({ url: "https://vimeo.com/1" }) === null)
    const csp = read("lib/security/csp.ts")
    check("every frame host is in the CSP's frame-src", ["https://player.vimeo.com", "https://www.loom.com", "https://platform.twitter.com", "https://open.spotify.com", "https://www.figma.com", "https://codepen.io", "https://www.youtube-nocookie.com"].every((h) => csp.includes(`"${h}"`) && read("vercel.json").includes(h)))
    check("chapters parse m:ss and h:mm:ss", JSON.stringify(parseChapters(["0:00 Intro", "12:30 - Pricing", "1:02:03 End"]).map((c) => c.seconds)) === "[0,750,3723]" && youtubeWatchUrl("dQw4w9WgXcQ", 0) === "https://www.youtube.com/watch?v=dQw4w9WgXcQ")
  }

  console.log("\nStructured data")
  {
    const base = { url: "https://storelib.com/blog/x", title: "T", description: "D", fallbackImage: "/images/brand/storelib-og-v2.jpg", published: "2026-03-01T00:00:00Z", modified: "2026-04-01T00:00:00Z" }
    const person = blogPostingJsonLd({ ...base, images: ["https://cdn.example.com/c.jpg", "/rel.jpg", "https://cdn.example.com/c.svg", null], byline: "Anisia - Head of Marketing", category: "Growth", wordCount: 900 }) as Any
    check("BlogPosting with headline, description, dates, mainEntityOfPage", person["@type"] === "BlogPosting" && person.headline === "T" && person.description === "D" && person.datePublished === base.published && person.dateModified === base.modified && person.mainEntityOfPage["@id"] === base.url)
    check("  image is an array of full, non-svg addresses", Array.isArray(person.image) && person.image.length === 1 && person.image[0] === "https://cdn.example.com/c.jpg")
    check("  a person byline is a Person with jobTitle and no made-up url", person.author["@type"] === "Person" && person.author.name === "Anisia" && person.author.jobTitle === "Head of Marketing" && !("url" in person.author))
    check("  publisher is Storelib with its logo", person.publisher["@type"] === "Organization" && person.publisher.name === "Storelib" && /^https:\/\/storelib\.com\/.+\.png$/.test(person.publisher.logo.url))
    check("  articleSection and wordCount", person.articleSection === "Growth" && person.wordCount === 900)
    const team = blogPostingJsonLd({ ...base, images: [], byline: "Storelib Team", authorUrl: null }) as Any
    check("a team byline is the Organization, and no cover is Storelib's card", team.author["@type"] === "Organization" && team.author.name === "Storelib" && team.image[0] === "https://storelib.com/images/brand/storelib-og-v2.jpg")
    const withUrl = blogPostingJsonLd({ ...base, images: [], byline: "Jane Doe", authorUrl: "/blog/authors/jane" }) as Any
    check("a Person gets a url only when an author page is given", withUrl.author.url === "https://storelib.com/blog/authors/jane")
    check("dateModified falls back to datePublished, a bad date is left out", (blogPostingJsonLd({ ...base, modified: null, images: [], byline: null }) as Any).dateModified === base.published && !("datePublished" in (blogPostingJsonLd({ ...base, published: "soon", modified: null, images: [], byline: null }) as Any)))
    check("authorOf reads names, roles and team bylines", authorOf("Storelib Team").organization && !authorOf("Anisia - Head of Marketing").organization && authorOf("").organization && authorOf("Sam | Editor").role === "Editor")

    const crumbs = breadcrumbListJsonLd([{ name: "Blog", path: "/blog" }, { name: "Growth", path: blogCategoryPath("Growth") }, { name: "Post", path: "https://storelib.com/blog/p" }]) as Any
    check("BreadcrumbList with positions and full addresses", crumbs.itemListElement.map((i: Any) => `${i.position}:${i.item}`).join(",") === "1:https://storelib.com/blog,2:https://storelib.com/blog/category/growth,3:https://storelib.com/blog/p")

    const blocks: Block[] = [
      { id: "1", type: "youtube", videoId: "dQw4w9WgXcQ", caption: "Setup walkthrough", uploadDate: "2026-02-01" },
      { id: "2", type: "youtube", videoId: "aaaaaaaaaaa" },
      { id: "3", type: "youtube", videoId: "bad", uploadDate: "2026-02-01" },
      { id: "4", type: "youtube", videoId: "bbbbbbbbbbb", title: "Own title", uploadDate: "not a date" },
      { id: "5", type: "youtube", videoId: "ccccccccccc", title: "Own title", uploadDate: "2026-05-02T10:00:00Z" },
    ]
    const videos = videoObjectsJsonLd(blocks, { title: "Post", description: "About it", url: "https://storelib.com/blog/x" }) as Any[]
    check("VideoObject only for blocks with an uploadDate and a real id", videos.length === 2, videos)
    check("  name from the title, else the caption; hqdefault thumbnail; uploadDate as given", videos[0].name === "Setup walkthrough" && videos[1].name === "Own title" && videos[0].thumbnailUrl[0] === "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg" && videos[0].uploadDate === "2026-02-01")
    check("  never fetched while rendering: no fetch in the builder", !/fetch\(/.test(code("lib/blog/structured-data.ts")))
    const blocksSrc = read("lib/blog/blocks.ts")
    check("the block format has the optional uploadDate and title fields", /uploadDate\?: string/.test(blocksSrc) && /title\?: string/.test(blocksSrc))

    const blog = blogJsonLd([{ slug: "a", title: "A", published_at: "2026-01-01T00:00:00Z", cover_image_url: "/images/blog/x.svg" }, { slug: "b", title: "B", published_at: null, cover_image_url: "https://cdn.example.com/b.jpg" }], { url: "https://storelib.com/blog", description: "d" }) as Any
    check("Blog with its posts as blogPost items", blog["@type"] === "Blog" && blog.blogPost.length === 2 && blog.blogPost[0].url === "https://storelib.com/blog/a" && !("image" in blog.blogPost[0]) && blog.blogPost[1].image === "https://cdn.example.com/b.jpg")

    const page = code("app/(marketing)/blog/[slug]/page.tsx")
    check("the article prints BlogPosting, BreadcrumbList and each VideoObject", /blogPostingJsonLd\(/.test(page) && /breadcrumbListJsonLd\(/.test(page) && /videoObjectsJsonLd\(blocks/.test(page) && (page.match(/jsonLdScript\(/g) ?? []).length === 3)
  }

  console.log("\nCategories at /blog/category/<slug>")
  {
    check("the new address", blogCategoryPath("Getting Started") === "/blog/category/getting-started" && blogCategoryPath("Growth", 3) === "/blog/category/growth/page/3")
    check("the old address's target, null for a category that does not exist", legacyCategoryTarget("creator-tips") === "/blog/category/creator-tips" && legacyCategoryTarget("nope") === null)
    const moved = await legacyCategoryGET(new Request("https://storelib.com/blog/explore/categories/growth"), { params: Promise.resolve({ category: "growth" }) })
    check("the old URL is a 308 to the new one", moved.status === 308 && moved.headers.get("location") === "/blog/category/growth")
    const missing = await legacyCategoryGET(new Request("https://storelib.com/blog/explore/categories/nope"), { params: Promise.resolve({ category: "nope" }) })
    check("  an unknown category is still a 404", missing.status === 404)
    check("the old page is gone, the new pages exist with layouts deciding 404 and 308 before the stream", !existsSync(join(process.cwd(), "app/(marketing)/blog/explore/categories/[category]/page.tsx")) && existsSync(join(process.cwd(), "app/(marketing)/blog/category/[slug]/page.tsx")) && /permanentRedirect\(`\/blog\/category\/\$\{slug\}`\)/.test(code("app/(marketing)/blog/category/[slug]/page/[page]/layout.tsx")) && /notFound\(\)/.test(code("app/(marketing)/blog/category/[slug]/layout.tsx")))
    const cat = code("app/(marketing)/blog/_blog-category.tsx")
    check("a category page: its own canonical, BreadcrumbList, noindex while empty", /path: blogCategoryPath\(category\.name, page, categories\)/.test(cat) && /breadcrumbListJsonLd\(crumbs\)/.test(cat) && /: \{ index: false, follow: true \}/.test(cat))
    const internal = ["app/(marketing)/blog/_blog-listing.tsx", "app/(marketing)/blog/_components/blog-nav.tsx", "app/(marketing)/blog/_components/article-view.tsx", "app/(marketing)/blog/[slug]/page.tsx", "app/(marketing)/blog/_blog-category.tsx"]
    check("no internal link names the old address", internal.every((p) => !code(p).includes("explore/categories")))

    const rows = [{ slug: "p1", category: "Tutorials", published_at: "2026-09-01T00:00:00Z", updated_at: null }]
    const urls = withBlogCategoryPages(blogSitemapEntries(rows, STORELIB_CATEGORIES, categoryToSlug), rows).map((e) => e.url)
    check("the sitemap names /blog/category/<slug>, never the old address", urls.includes("https://storelib.com/blog/category/tutorials") && !urls.some((u) => u.includes("explore/categories")))
    const many = Array.from({ length: 120 }, (_, i) => ({ slug: `g${i}`, category: "Growth", published_at: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(), updated_at: null }))
    const manyUrls = withBlogCategoryPages(blogSitemapEntries(many, STORELIB_CATEGORIES, categoryToSlug), many).map((e) => e.url)
    check("  and a category's older pages once it has them", manyUrls.includes("https://storelib.com/blog/category/growth/page/2") && manyUrls.includes("https://storelib.com/blog/category/growth/page/3") && !manyUrls.includes("https://storelib.com/blog/category/growth/page/4"))
    /* Changed on purpose (round 45): blogSitemapEntries also takes the authors with live posts (their /blog/author pages, tests/seo-leftovers-b-r45.test.ts). */
    check("sitemaps.ts uses it", /withBlogCategoryPages\(blogSitemapEntries\(posts, blogCategories\.map\(\(c\) => c\.name\), \(name\) => categorySlugOf\(name, blogCategories\), blogAuthors\), posts, blogCategories\)/.test(code("lib/seo/sitemaps.ts")))

    /* Changed on purpose (round 47): the list no longer takes a title and a line; the blog's layout draws them. */
    const html = renderToStaticMarkup(createElement(BlogListing, { posts: [], activeCategory: "Growth", pagination: { page: 2, pages: 3 }, pagePath: (n: number) => blogCategoryPath("Growth", n) }))
    check("a category's pages are real links at its own addresses", /href="\/blog\/category\/growth"[^>]*rel="prev"|rel="prev"[^>]*href="\/blog\/category\/growth"/.test(html) && /href="\/blog\/category\/growth\/page\/3"/.test(html))
    /* Changed on purpose (round 47): the category pills moved out of the list into the blog's shared layout (app/(marketing)/blog/layout.tsx and _components/blog-nav.tsx), so they stay mounted between categories. Still real links at the new addresses. */
    const nav = code("app/(marketing)/blog/_components/blog-nav.tsx")
    check("  the category navigation links the new addresses, as real links", /href=\{`\/blog\/category\/\$\{c\.slug\}`\}/.test(nav) && /<Link href=\{href\}/.test(nav) && /aria-current=\{on \? "page" : undefined\}/.test(nav) && !nav.includes("explore/categories"))
    check("  the layout draws it around every blog page", /<BlogNav categories=\{nav\}/.test(code("app/(marketing)/blog/layout.tsx")) && blogListOfOk())
  }

  console.log("\nThe sign up box and the newsletter")
  {
    const href = blogSignupHref("physical", { email: "a@b.co" })
    const source = readSignupSource(new URL(`https://storelib.com${href}`).searchParams)
    check("the box's address reads back as a source on /signup", href.startsWith("/signup?intent=sell") && source?.src === "blog-physical" && source?.ref === "blog-physical" && new URL(`https://x${href}`).searchParams.get("email") === "a@b.co")
    check("a visit's own ref wins", new URL(`https://x${blogSignupHref("digital", { ref: "partner" })}`).searchParams.get("ref") === "partner")
    check("the variant follows the post", ctaVariant({ title: "How to run a paid community" }, true) === "community" && ctaVariant({ title: "Shipping rates for physical products" }, true) === "physical" && ctaVariant({ title: "Shipping rates for physical products" }, false) === "digital" && ctaVariant({ title: "Selling Notion templates" }, true) === "digital")
    const route = code("app/api/newsletter/route.ts")
    check("the newsletter route takes source blog and a honeypot that stores nothing", /body\.source === "blog" \? "blog" : "footer"/.test(route) && /body\.company/.test(route) && route.indexOf("body.company") < route.indexOf(".upsert("))
    /* Changed on purpose (round 47): the owner asked for the newsletter box to go from the article; the card is gone, the route above stays for the footer. */
    check("  the article draws no newsletter box", !existsSync(join(process.cwd(), "app/(marketing)/blog/_components/newsletter-card.tsx")) && !/Newsletter/.test(code("app/(marketing)/blog/_components/article-view.tsx")))
  }

  console.log("\nWired to the editor's data layer (seo-blogadmin)")
  {
    const page = code("app/(marketing)/blog/[slug]/page.tsx")
    check("snippets are expanded on the server before drawing", /expandSnippets\(rowBlocks, await readBlogSnippets\(rowBlocks\)\)/.test(page))
    check("the author row drives the byline, the box and the Person", /readBlogAuthor\(dbPost\?\.author_id\)/.test(page) && /author: profile/.test(page) && /profile,/.test(page))
    check("canonical_url, noindex, og_image_url, cover_alt and tags", /canonicalOf\(slug, dbPost\?\.canonical_url\)/.test(page) && /dbPost\?\.noindex === true/.test(page) && /dbPost\?\.og_image_url \|\| dbPost\?\.cover_image_url/.test(page) && /cover_alt/.test(page) && /dbPost\?\.tags/.test(page))
    check("generateStaticParams lists only live posts", /\.eq\("is_published", true\)\.or\(liveDateFilter\(\)\)/.test(page))
    check("the blog's lists read through readBlogPosts, which is date filtered", /\.or\(liveDateFilter\(\)\)/.test(code("lib/blog/read.ts")) && /readBlogPosts/.test(code("app/(marketing)/blog/rss.xml/route.ts")) && /readBlogPosts/.test(code("app/(marketing)/blog/_blog-category.tsx")))
    check("the preview draws with the public renderer", /import \{ ArticleBlocks \} from "@\/app\/\(marketing\)\/blog\/_components\/article-blocks"/.test(code("app/admin/blog/preview/[token]/_article.tsx")))
    check("sanitizeInline is sanitizeInlineHtml", /return sanitizeInlineHtml\(html \?\? ""\)/.test(code("app/(marketing)/blog/_components/article-blocks.tsx")))
    check("the old slug's 308 stays in the post's layout", /blogRedirectFor\(slug\)/.test(code("app/(marketing)/blog/[slug]/layout.tsx")))
    const renamed = [{ slug: "growth", name: "Growing", description: "d" }]
    check("a renamed category keeps its slug in every address", blogCategoryPath("Growing", 1, renamed) === "/blog/category/growth" && legacyCategoryTarget("growth", renamed) === "/blog/category/growth" && legacyCategoryTarget("tutorials", renamed) === null)
    const sd = blogPostingJsonLd({ url: "https://storelib.com/blog/x", title: "T", description: "D", images: [], fallbackImage: "/x.jpg", published: null, modified: null, byline: "Storelib Team", profile: { name: "Jane Roe", role: "Editor", links: [{ url: "https://x.com/jane" }, { url: "javascript:x" }] } }) as Any
    check("the Person comes from the author row, its links as sameAs", sd.author["@type"] === "Person" && sd.author.name === "Jane Roe" && sd.author.jobTitle === "Editor" && JSON.stringify(sd.author.sameAs) === '["https://x.com/jane"]')
  }

  console.log("\nRelated and neighbours")
  {
    const posts = [
      { slug: "e", category: "A" },
      { slug: "d", category: "B" },
      { slug: "c", category: "A" },
      { slug: "b", category: "B" },
      { slug: "a", category: "A" },
    ]
    check("related: same category first, then the newest, three of them", relatedPosts(posts, { slug: "c", category: "A" }).map((p) => p.slug).join("") === "ead")
    const n = postNeighbours(posts, "c")
    check("previous is older, next is newer", n.previous?.slug === "b" && n.next?.slug === "d" && postNeighbours(posts, "e").next === null)
  }

  console.log("\nPerformance shape")
  {
    const yt = read("app/(marketing)/blog/_components/youtube-facade.tsx")
    check("the YouTube player loads only on a press", /start === null \?/.test(yt) && !/<script/.test(yt) && !/iframe_api/.test(yt))
    const progress = code("app/(marketing)/blog/[slug]/_reading-progress.tsx")
    check("the progress line is a transform, measured on resize only", /scaleX\(\$\{p\}\)/.test(progress) && /new ResizeObserver/.test(progress) && !/useState/.test(progress))
    check("the contents spy uses an IntersectionObserver", /new IntersectionObserver/.test(code("app/(marketing)/blog/_components/toc-spy.tsx")))
    const view = code("app/(marketing)/blog/_components/article-view.tsx")
    check("the article view is a server component; the cover has priority and sizes", !/^"use client"/.test(read("app/(marketing)/blog/_components/article-view.tsx")) && /fill priority sizes=/.test(view))
    check("the help article has the same contents on the left and the progress line", /ReadingProgress target="\[data-help-article\]"/.test(code("app/help/[category]/[article]/page.tsx")) && /lg:grid-cols-\[220px_minmax\(0,1fr\)\]/.test(code("app/help/[category]/[article]/page.tsx")) && /toc\.length >= 2 \?/.test(code("app/help/[category]/[article]/page.tsx")))
  }

  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
