/**
 * Creator blogs in an imported (Shopify) theme (package P3):
 *
 *   a Dawn-style theme's blog, article and featured blog sections drawn
 *   with real posts: pagination, tags, categories, the post's own page
 *   old slugs and old handles answer 308, a post's preview is noindex and
 *   never kept by any cache
 *   the search facts: BlogPosting and Blog JSON-LD, Home › Blog › Post,
 *   og:type article and the post's picture, the canonical on the site's
 *   own domain, a post's own canonical and noindex
 *   a theme with no blog template draws Storelib's own markup
 *   the sitemap lists the blog, its posts and categories on the site's
 *   origin (its custom domain)
 *   without a blog, or with no live post, every address is answered
 *   exactly as before
 *
 *   npx tsx tests/site-blog-compat.test.ts
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import JSZip from "jszip"
import { convertShopifyTheme } from "../lib/storelib-theme/shopify/convert"
import { themeOfInstall } from "../lib/storelib-theme/compat/page"
import { answer, liveBlogOf, type CompatBlogSource, type SiteData, type SiteResponse } from "../lib/storelib-theme/compat/site"
import { compatMenus } from "../lib/storelib-theme/compat/menus"
import { siteLink } from "../lib/storelib-theme/compat/links"
import { typedValue, articleObject, blogObject, type Resources } from "../lib/storelib-theme/compat/objects"
import { strangerAddress } from "../lib/storelib-theme/compat/anonymous-cache"
import { canvasBlogPage, canvasBlogSource, wantsCanvasBlog } from "../lib/storelib-theme/compat/canvas-blog"
import { compatSearchHead } from "../lib/website-builder/compat-search"
import { blogSitemapEntries, listedPageKeys, sitemapXml } from "../lib/website-builder/site-seo"
import type { PublicPost, PublicPostCard, SiteBlogSettings } from "../lib/site-blog/types"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/* ── A Dawn-style theme: the posture fixture with Dawn's blog sections, article card, pagination and meta tags ── */
const DAWN: Record<string, string> = {
  "layout/theme.liquid": `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>{{ page_title }}{%- if current_tags %} &ndash; tagged "{{ current_tags | join: ', ' }}"{% endif -%}{%- if current_page != 1 %} &ndash; Page {{ current_page }}{% endif -%}</title>
    <link rel="canonical" href="{{ canonical_url }}">
    {%- assign og_type = 'website' -%}
    {%- if request.page_type == 'article' -%}{%- assign og_type = 'article' -%}{%- endif -%}
    <meta property="og:type" content="{{ og_type }}">
    <meta property="og:title" content="{{ page_title | escape }}">
    {%- if page_image -%}<meta property="og:image" content="http:{{ page_image | image_url }}">{%- endif -%}
    {{ content_for_header }}
  </head>
  <body class="template-{{ template.name }}">
    {% sections 'header-group' %}
    <main id="MainContent" role="main">{{ content_for_layout }}</main>
    {% sections 'footer-group' %}
  </body>
</html>`,
  "snippets/article-card.liquid": `<div class="article-card-wrapper card-wrapper">
  <div class="card article-card">
    {%- if show_image == true and article.image -%}
      <div class="article-card__image-wrapper card__media">
        <div class="media" style="padding-bottom: {{ 1 | divided_by: article.image.aspect_ratio | times: 100 }}%;">
          <img src="{{ article.image.src | image_url: width: 533 }}" alt="{{ article.image.alt | escape }}" width="{{ article.image.width }}" height="{{ article.image.height }}" loading="lazy">
        </div>
      </div>
    {%- endif -%}
    <div class="card__content">
      <h3 class="card__heading"><a href="{{ article.url }}" class="full-unstyled-link">{{ article.title | escape }}</a></h3>
      <div class="article-card__info">
        {%- if show_date -%}<span class="circle-divider">{{ article.published_at | time_tag: format: 'date' }}</span>{%- endif -%}
        {%- if show_author -%}<span class="article-card__author">{{ article.author }}</span>{%- endif -%}
      </div>
      {%- if show_excerpt -%}
        {%- if article.excerpt.size > 0 or article.content.size > 0 -%}
          <p class="article-card__excerpt">{%- if article.excerpt.size > 0 -%}{{ article.excerpt | strip_html | truncatewords: 30 }}{%- else -%}{{ article.content | strip_html | truncatewords: 30 }}{%- endif -%}</p>
        {%- endif -%}
      {%- endif -%}
    </div>
  </div>
</div>`,
  "snippets/pagination.liquid": `<nav class="pagination" role="navigation"><ul class="pagination__list">
  {%- if paginate.previous -%}<li><a href="{{ paginate.previous.url }}" class="pagination__item--prev">Previous</a></li>{%- endif -%}
  {%- for part in paginate.parts -%}<li>{%- if part.is_link -%}<a href="{{ part.url }}" class="pagination__item">{{ part.title }}</a>{%- else -%}<span class="pagination__item pagination__item--current" aria-current="page">{{ part.title }}</span>{%- endif -%}</li>{%- endfor -%}
  {%- if paginate.next -%}<li><a href="{{ paginate.next.url }}" class="pagination__item--next">Next</a></li>{%- endif -%}
</ul></nav>`,
  "sections/main-blog.liquid": `<div class="main-blog page-width">
  <h1 class="title--primary">{{ blog.title | escape }}</h1>
  {%- if current_tags -%}<p class="current-tags">Tagged {{ current_tags | join: ', ' }}</p>{%- endif -%}
  {%- if blog.all_tags.size > 0 -%}<ul class="blog-tags">{%- for tag in blog.all_tags -%}<li><a href="{{ blog.url }}/tagged/{{ tag | handle }}">{{ tag }}</a></li>{%- endfor -%}</ul>{%- endif -%}
  {%- paginate blog.articles by 6 -%}
    <div class="blog-articles">
      {%- for article in blog.articles -%}
        <div class="blog-articles__article article">
          {%- render 'article-card', article: article, show_image: section.settings.show_image, show_date: section.settings.show_date, show_author: section.settings.show_author, show_excerpt: true -%}
        </div>
      {%- endfor -%}
    </div>
    {%- if paginate.pages > 1 -%}{%- render 'pagination', paginate: paginate -%}{%- endif -%}
  {%- endpaginate -%}
</div>
{% schema %}{"name":"Blog posts","settings":[{"type":"checkbox","id":"show_image","default":true,"label":"Image"},{"type":"checkbox","id":"show_date","default":true,"label":"Date"},{"type":"checkbox","id":"show_author","default":false,"label":"Author"}]}{% endschema %}`,
  "sections/main-article.liquid": `<article class="article-template">
  {%- for block in section.blocks -%}
    {%- case block.type -%}
      {%- when 'featured_image' -%}
        {%- if article.image -%}<div class="article-template__hero-container"><img src="{{ article.image | image_url: width: 1100 }}" alt="{{ article.image.alt | escape }}" class="article-template__hero"></div>{%- endif -%}
      {%- when 'title' -%}
        <header class="page-width page-width--narrow">
          <h1 class="article-template__title">{{ article.title | escape }}</h1>
          {%- if block.settings.blog_show_date -%}<span class="circle-divider">{{ article.published_at | time_tag: format: 'date' }}</span>{%- endif -%}
          {%- if block.settings.blog_show_author -%}<span class="article-template__author">{{ article.author }}</span>{%- endif -%}
        </header>
      {%- when 'content' -%}
        <div class="article-template__content page-width page-width--narrow rte">{{ article.content }}</div>
    {%- endcase -%}
  {%- endfor -%}
  <ul class="article-tags">{%- for tag in article.tags -%}<li><a href="{{ blog.url }}/tagged/{{ tag | handle }}">{{ tag }}</a></li>{%- endfor -%}</ul>
  <div class="article-template__back"><a href="{{ blog.url }}" class="article-template__link">Back to {{ blog.title | escape }}</a></div>
  {%- if blog.next_article -%}<a class="article-next" href="{{ blog.next_article }}">Newer</a>{%- endif -%}
  {%- if blog.previous_article -%}<a class="article-prev" href="{{ blog.previous_article }}">Older</a>{%- endif -%}
</article>
<script type="application/ld+json">{{ article | structured_data }}</script>
{% schema %}{"name":"Blog post","blocks":[{"type":"@app"},{"type":"featured_image","name":"Featured image","limit":1},{"type":"title","name":"Title","limit":1,"settings":[{"type":"checkbox","id":"blog_show_date","default":true,"label":"Date"},{"type":"checkbox","id":"blog_show_author","default":false,"label":"Author"}]},{"type":"content","name":"Content","limit":1}]}{% endschema %}`,
  "sections/featured-blog.liquid": `<div class="blog page-width featured-blog">
  <h2 class="blog__title">{{ section.settings.heading | escape }}</h2>
  {%- if section.settings.blog != blank and section.settings.blog.articles_count > 0 -%}
    <ul class="blog__posts">
      {%- for article in section.settings.blog.articles limit: section.settings.post_limit -%}
        <li class="blog__post">{% render 'article-card', article: article, show_image: section.settings.show_image, show_date: section.settings.show_date, show_author: section.settings.show_author, show_excerpt: true %}</li>
      {%- endfor -%}
    </ul>
    <a href="{{ section.settings.blog.url }}" class="button blog__view-all">View all</a>
  {%- else -%}
    <div class="blog-placeholder">{%- for i in (1..3) -%}<h3 class="placeholder">Your article's title</h3>{%- endfor -%}</div>
  {%- endif -%}
</div>
{% schema %}{"name":"Blog posts","settings":[{"type":"text","id":"heading","default":"Blog posts","label":"Heading"},{"type":"blog","id":"blog","label":"Blog"},{"type":"range","id":"post_limit","min":2,"max":4,"step":1,"default":3,"label":"Posts"},{"type":"checkbox","id":"show_image","default":true,"label":"Image"},{"type":"checkbox","id":"show_date","default":true,"label":"Date"},{"type":"checkbox","id":"show_author","default":false,"label":"Author"}],"presets":[{"name":"Blog posts"}]}{% endschema %}`,
  "templates/blog.json": `{ "sections": { "main": { "type": "main-blog", "settings": { "show_image": true, "show_date": true, "show_author": true } } }, "order": ["main"] }`,
  "templates/article.json": `{ "sections": { "main": { "type": "main-article", "blocks": { "featured_image": { "type": "featured_image" }, "title": { "type": "title", "settings": { "blog_show_date": true, "blog_show_author": true } }, "content": { "type": "content" } }, "block_order": ["featured_image", "title", "content"] } }, "order": ["main"] }`,
}

async function convert(extra: Record<string, string>) {
  const dir = join(process.cwd(), "tests", "fixtures", "shopify-posture")
  const zip = new JSZip()
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n)
      if (statSync(p).isDirectory()) walk(p)
      else zip.file(relative(dir, p), readFileSync(p))
    }
  }
  walk(dir)
  /* Dawn's home page has a featured blog section, with the blog the store it came from called "news". */
  const index = JSON.parse(readFileSync(join(dir, "templates/index.json"), "utf8")) as { sections: Record<string, unknown>; order: string[] }
  index.sections.blog = { type: "featured-blog", settings: { heading: "From the journal", blog: "news", post_limit: 3, show_author: true } }
  index.order.push("blog")
  for (const [k, v] of Object.entries(extra)) zip.file(k, v)
  if (extra["sections/featured-blog.liquid"]) zip.file("templates/index.json", JSON.stringify(index))
  const r = await convertShopifyTheme(zip)
  if (!r.ok) throw new Error("the fixture theme did not convert")
  return r.theme
}

/* ── The blog's data, as lib/site-blog's reads hand it ── */
const NOW = Date.now()
const day = 86_400_000
const SETTINGS: SiteBlogSettings = { handle: "news", previousHandles: ["journal"], title: "News", description: "Stories from the workshop", postsPerPage: 4, seoTitle: "", seoDescription: "", ogImageUrl: "" }
const AUTHOR = { id: "a1", slug: "ana", name: "Ana Lopez", role: "Founder", bio: "Makes things.", avatarUrl: "https://cdn.example.com/ana.jpg", links: [{ label: "Site", url: "https://ana.example.com" }] }
const card = (i: number, extra: Partial<PublicPostCard> = {}): PublicPostCard => {
  const slug = `post-${i}`
  return {
    id: `id-${i}`,
    slug,
    path: `/blogs/news/${slug}`,
    title: `Post number ${i}`,
    excerpt: `Excerpt of post ${i}`,
    summaryHtml: `<p>Opening words of post ${i}</p>`,
    coverImageUrl: `https://cdn.example.com/cover-${i}.jpg`,
    coverAlt: `Cover ${i}`,
    category: i % 2 === 0 ? { slug: "guides", name: "Guides", path: "/blogs/news/category/guides" } : null,
    tags: i % 3 === 0 ? ["Recipes", "Summer sale"] : ["News"],
    author: AUTHOR,
    publishedAt: new Date(NOW - i * day).toISOString(),
    updatedAt: new Date(NOW - i * day + 3600_000).toISOString(),
    readingMinutes: 3,
    featured: i === 1,
    ...extra,
  }
}
/* Seven live posts, newest first, and one scheduled for tomorrow. */
const CARDS: PublicPostCard[] = [card(0, { slug: "tomorrow", path: "/blogs/news/tomorrow", title: "Scheduled one", publishedAt: new Date(NOW + day).toISOString() }), ...[1, 2, 3, 4, 5, 6, 7].map((i) => card(i))]
const full = (c: PublicPostCard, extra: Partial<PublicPost> = {}): PublicPost => ({
  ...c,
  blocks: [],
  html: `<p>The whole body of ${c.title}.</p><h2 id="more">More</h2><p>Second paragraph.</p>`,
  wordCount: 420,
  seo: { title: "", description: "", canonicalUrl: "", ogTitle: "", ogDescription: "", ogImageUrl: "", noindex: false },
  ...extra,
})
const POSTS: Record<string, PublicPost> = {
  "post-1": full(CARDS[1], { title: `Tom & "Jerry" <b>`, seo: { title: "Own search title", description: "Own description", canonicalUrl: "", ogTitle: "", ogDescription: "", ogImageUrl: "https://cdn.example.com/social-1.jpg", noindex: false } }),
  "post-2": full(CARDS[2], { seo: { title: "", description: "", canonicalUrl: "https://elsewhere.example.com/original", ogTitle: "", ogDescription: "", ogImageUrl: "", noindex: false } }),
  "post-3": full(CARDS[3], { seo: { title: "", description: "", canonicalUrl: "", ogTitle: "", ogDescription: "", ogImageUrl: "", noindex: true } }),
  "post-4": full(CARDS[4]),
}
const asked: string[] = []
const source = (cards: PublicPostCard[]): CompatBlogSource => ({
  settings: SETTINGS,
  cards,
  post: async (slug) => {
    asked.push(`post:${slug}`)
    return POSTS[slug] ?? (slug === "tomorrow" ? full(CARDS[0]) : null)
  },
  preview: async (token) => (token === "good-token" ? full(card(9, { slug: "draft-one", path: "/blogs/news/draft-one", title: "A draft being written" })) : null),
  redirect: async (slug) => (slug === "old-slug" ? "post-1" : null),
})

const products = [{ id: "00000000-0000-4000-8000-000000000001", settings: { title: "Corrector", slug: "corrector", url: "/products/corrector", price: "$39.00", image: "", images: [], available: true, variants: [], options: [] } }]

function siteOf(t: Awaited<ReturnType<typeof convert>>, blog: CompatBlogSource | undefined, extra: Partial<SiteData> = {}): SiteData {
  const theme = themeOfInstall(t.files, t.settings, { assetUrl: (n) => `/a/${n}`, assetText: (n) => t.files[`shopify/assets/${n}`] ?? null })
  const pages = Object.fromEntries(t.pages.map((p) => [p.page_key, p.sections])) as SiteData["pages"]
  return { creatorId: "c1", theme, pages, products: products as never, collections: [], menus: compatMenus({ "main-menu": { title: "Main", links: [{ title: "Journal", url: "/blogs/news" }] } } as never, Object.keys(pages)), shop: { name: "Posturex", currency: "USD", moneyFormat: "${{amount}}" }, host: "posturex.storelib.com", canonicalHost: "www.posturex.com", ...(blog ? { blog } : {}), ...extra }
}
const get = (site: SiteData, path: string) => {
  const [p, q = ""] = path.split("?")
  return answer(site, { method: "GET", path: p, query: new URLSearchParams(q), body: null, cart: [] })
}
const body = (r: SiteResponse) => String(r.body)
const ldOf = (html: string): Record<string, unknown>[] => [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]) as Record<string, unknown>)
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length

async function main() {
  const dawn = await convert(DAWN)
  const plain = await convert({})
  check("the Dawn-style fixture keeps its blog and article templates as pages", dawn.pages.some((p) => p.page_key === "blog") && dawn.pages.some((p) => p.page_key === "article"))

  console.log("\nWithout a blog, everything as before\n")
  {
    const none = siteOf(dawn, undefined)
    const empty = siteOf(dawn, source([]))
    const onlyScheduled = siteOf(dawn, source([CARDS[0]]))
    for (const path of ["/", "/blogs/news", "/blogs/news/post-1", "/blogs/journal", "/blogs", "/blogs/news/tagged/recipes", "/collections/all"]) {
      const a = await get(none, path)
      const b = await get(empty, path)
      const c = await get(onlyScheduled, path)
      const same = (x: SiteResponse, y: SiteResponse) => x.status === y.status && body(x) === body(y) && JSON.stringify(x.headers) === JSON.stringify(y.headers)
      check(`${path}: a blog with no live post answers exactly as no blog`, same(a, b) && same(a, c), { a: a.status, b: b.status, c: c.status })
    }
    const page = body(await get(none, "/blogs/news"))
    check("the theme's blog page still draws its empty blog (emptyBlog), titled by its address", page.includes(`<h1 class="title--primary">News</h1>`) && !page.includes("blog-articles__article"))
    check("the featured blog section shows the theme's placeholders, as before", body(await get(none, "/")).includes("Your article's title"))
    const nav = siteOf(plain, undefined)
    const r = await get(nav, "/blogs/news")
    check("a theme with no blog page and no blog: /blogs/news goes home (builder-nav19)", r.status === 303 && r.headers?.Location === "/", r)
    check("  and a link to it is home", siteLink("/blogs/news", { pages: ["home"] }) === "/")
    check("asking for a post's page reads nothing without a live post", !asked.length, asked)
  }

  const site = siteOf(dawn, source(CARDS))
  console.log("\nThe blog page, with real posts\n")
  {
    const r = await get(site, "/blogs/news")
    const html = body(r)
    check("200, a page any visitor may be shown (private, no-cache)", r.status === 200 && r.headers?.["Cache-Control"] === "private, no-cache", r.headers)
    check("Dawn's main-blog draws the first six live posts, newest first", count(html, /blog-articles__article/g) === 6 && html.indexOf("Post number 1") < html.indexOf("Post number 2") && html.includes("Post number 6") && !html.includes("Post number 7"))
    check("a scheduled post is not on the page before its time", !html.includes("Scheduled one"))
    check("each card links to its post, with its picture, date, author and excerpt", html.includes(`href="/blogs/news/post-1"`) && html.includes("https://cdn.example.com/cover-1.jpg") && /<time datetime="[^"]+">/.test(html) && html.includes(`<span class="article-card__author">Ana Lopez</span>`) && html.includes("Excerpt of post 1"))
    check("the picture's shape is a cover's (16:9)", html.includes("padding-bottom: 56.2"), html.match(/padding-bottom: [^;]+/)?.[0])
    check("the pagination links page 2 with ?page=", html.includes(`href="/blogs/news?page=2"`) && html.includes(`aria-current="page">1<`))
    check("the blog's tags, for its tag filter", html.includes(`href="/blogs/news/tagged/recipes"`) && html.includes(`href="/blogs/news/tagged/summer-sale"`))
    const two = body(await get(site, "/blogs/news?page=2"))
    check("page 2 shows the seventh post and says it is page 2", two.includes("Post number 7") && !two.includes("Post number 1<") && /<title>[^<]*Page 2/.test(two))
    check("page 2 is its own canonical, on the site's own domain", two.includes(`<link rel="canonical" href="https://www.posturex.com/blogs/news?page=2">`))
    check("the blog page's canonical is on the custom domain", html.includes(`<link rel="canonical" href="https://www.posturex.com/blogs/news">`))
    const moved = await get(site, "/blogs/news/page/2")
    check("a Storelib theme's /page/2 answers 308 to ?page=2", moved.status === 308 && moved.headers?.Location === "/blogs/news?page=2", moved)
  }

  console.log("\nTags and categories\n")
  {
    const tagged = body(await get(site, "/blogs/news/tagged/summer-sale"))
    check("/tagged/<tag> shows only the posts with that tag (by its handle)", tagged.includes("Post number 3") && tagged.includes("Post number 6") && !tagged.includes("Post number 1<") && count(tagged, /blog-articles__article/g) === 2)
    check("  titled with the tag (the tab), and current_tags is the tag", /<title>Summer sale – News \| Posturex<\/title>/.test(tagged) && tagged.includes(`<p class="current-tags">Tagged Summer sale</p>`), tagged.match(/<title>[^<]*<\/title>/)?.[0])
    check("  and all its tags still offered", tagged.includes(`href="/blogs/news/tagged/news"`))
    check("a tag no live post has is a 404", (await get(site, "/blogs/news/tagged/nothing-here")).status === 404)
    const cat = body(await get(site, "/blogs/news/category/guides"))
    check("/category/<c> shows only that category's posts", count(cat, /blog-articles__article/g) === 3 && cat.includes("Post number 2") && cat.includes("Post number 6") && !cat.includes("Post number 3<"))
    check("  titled with the category", /<title>Guides – News/.test(cat), cat.match(/<title>[^<]*<\/title>/)?.[0])
    check("an unknown category is a 404", (await get(site, "/blogs/news/category/nope")).status === 404)
  }

  console.log("\nA post's own page\n")
  {
    const r = await get(site, "/blogs/news/post-4")
    const html = body(r)
    check("Dawn's main-article draws the post: title, date, author, its whole content", r.status === 200 && html.includes(`<h1 class="article-template__title">Post number 4</h1>`) && html.includes("The whole body of Post number 4.") && html.includes(`<span class="article-template__author">Ana Lopez</span>`) && /<time datetime=/.test(html))
    check("  its cover, its tags and the way back to the blog", html.includes(`class="article-template__hero"`) && html.includes(`href="/blogs/news/tagged/news"`) && html.includes(`href="/blogs/news" class="article-template__link">Back to News`))
    check("  blog.next_article (newer) and blog.previous_article (older)", html.includes(`class="article-next" href="/blogs/news/post-3"`) && html.includes(`class="article-prev" href="/blogs/news/post-5"`))
    check("  the theme's og:type is article and its og:image the post's", html.includes(`<meta property="og:type" content="article">`) && html.includes("cover-4.jpg"))
    check("  the canonical is the post on the custom domain", html.includes(`<link rel="canonical" href="https://www.posturex.com/blogs/news/post-4">`))
    check("  the tab says the post and the store", /<title>Post number 4 \| Posturex<\/title>/.test(html), html.match(/<title>[^<]*<\/title>/)?.[0])
    const own = body(await get(site, "/blogs/news/post-1"))
    check("a title with markup is escaped in the theme's heading", own.includes("Tom &amp; &quot;Jerry&quot; &lt;b&gt;") && !own.includes(`Jerry" <b>`))
    check("a post's own search title is the tab, exactly", /<title>Own search title<\/title>/.test(own), own.match(/<title>[^<]*<\/title>/)?.[0])
    const canonical = body(await get(site, "/blogs/news/post-2"))
    check("a post's own canonical replaces the page's", canonical.includes(`<link rel="canonical" href="https://elsewhere.example.com/original">`))
    const hidden = body(await get(site, "/blogs/news/post-3"))
    check("a post kept out of search says noindex", /<meta name="robots" content="noindex/.test(hidden))
    check("a scheduled post's address is a 404 before its time", (await get(site, "/blogs/news/tomorrow")).status === 404)
    check("an unknown post is a 404", (await get(site, "/blogs/news/never-written")).status === 404)
    const old = await get(site, "/blogs/news/old-slug")
    check("a post's old slug answers 308 to its slug now", old.status === 308 && old.headers?.Location === "/blogs/news/post-1", old)
    const handle = await get(site, "/blogs/journal/post-4?utm_source=x")
    check("the blog's old handle answers 308 to its handle now, query kept", handle.status === 308 && handle.headers?.Location === "/blogs/news/post-4?utm_source=x", handle)
    const listOld = await get(site, "/blogs/journal")
    check("  and the old blog address itself", listOld.status === 308 && listOld.headers?.Location === "/blogs/news")
    check("an address of another blog is a 404, not a page", (await get(site, "/blogs/other/post-4")).status === 404)
    const all = await get(site, "/blogs")
    check("/blogs goes to the blog", all.status === 303 && all.headers?.Location === "/blogs/news", all)
  }

  console.log("\nA post's preview\n")
  {
    const r = await get(site, "/blogs/news/~preview/good-token")
    const html = body(r)
    check("the draft is drawn in the theme's article template", r.status === 200 && html.includes("A draft being written") && html.includes("article-template__content"))
    check("  never kept by any cache (private, no-store)", r.headers?.["Cache-Control"] === "private, no-store", r.headers)
    check("  and noindex, in its header and its head", r.headers?.["X-Robots-Tag"] === "noindex" && /<meta name="robots" content="noindex, nofollow"/.test(html))
    check("a token that does not verify is a 404 that is not kept", (await get(site, "/blogs/news/~preview/forged")).status === 404 && (await get(site, "/blogs/news/~preview/forged")).headers?.["Cache-Control"] === "private, no-store")
    const first = await get(siteOf(dawn, source([])), "/blogs/news/~preview/good-token")
    check("a preview works before any post is live (the first post)", first.status === 200 && body(first).includes("A draft being written"))
    check("a preview is never a stranger's page (the CDN hold), a post is", !strangerAddress("/blogs/news/~preview/good-token", new URLSearchParams()) && strangerAddress("/blogs/news/post-1", new URLSearchParams()) && strangerAddress("/blogs/news", new URLSearchParams("page=2")))
    const route = read("app/api/site-theme/site/[username]/[[...path]]/route.ts")
    check("the site route says noindex when the page does", /headers\.get\("X-Robots-Tag"\) === "noindex"/.test(route))
  }

  console.log("\nThe featured blog section, anywhere\n")
  {
    const home = body(await get(site, "/"))
    check("Dawn's featured-blog shows the newest three live posts from the website's blog", home.includes("From the journal") && count(home, /class="blog__post"/g) === 3 && home.includes("Post number 1") && home.includes("Post number 3") && !home.includes("Post number 4<") && !home.includes("Your article's title"))
    check("  and View all goes to the blog", home.includes(`href="/blogs/news" class="button blog__view-all"`))
    check("the menu's link to the blog is kept", home.includes(`href="/blogs/news"`))
    const res: Resources = { products: [], collections: [], menus: {}, schemes: {}, imageUrl: (v) => v, currentPath: "/" }
    check("a blog setting with no blog is nil, as before", typedValue("blog", "news", res) === null && typedValue("article", "news/post-1", res) === null)
    const blog = liveBlogOf(site)!.object
    check("a blog setting is the website's blog whatever the theme saved", typedValue("blog", "news", { ...res, blog }) === blog && typedValue("blog", "", { ...res, blog }) === blog)
    check("an article setting is that post", (typedValue("article", "news/post-2", { ...res, blog }) as { title?: string } | null)?.title === "Post number 2")
  }

  console.log("\nShopify's objects\n")
  {
    const a = articleObject(POSTS["post-4"], "news")
    const keys = ["id", "handle", "title", "url", "content", "excerpt", "excerpt_or_content", "image", "published_at", "created_at", "updated_at", "author", "user", "tags", "comments", "comments_count", "comments_enabled", "metafields"]
    check("article has Shopify's fields", keys.every((k) => k in a), keys.filter((k) => !(k in a)))
    check("  its image has src, alt, width, height and aspect_ratio", ["src", "alt", "width", "height", "aspect_ratio"].every((k) => k in (a.image as object)))
    check("  comments are off", (a.comments as unknown[]).length === 0 && a.comments_count === 0 && a.comments_enabled === false)
    check("  the user is the author, with their bio and picture", (a.user as { name?: string; bio?: string; image?: unknown }).name === "Ana Lopez" && (a.user as { bio?: string }).bio === "Makes things." && !!(a.user as { image?: unknown }).image)
    const b = blogObject(SETTINGS, CARDS.slice(1), { tag: "recipes" })
    const bkeys = ["id", "handle", "title", "url", "articles", "articles_count", "tags", "all_tags", "comments_enabled", "moderated", "metafields"]
    check("blog has Shopify's fields, narrowed by a tag", bkeys.every((k) => k in b) && b.articles_count === 2 && (b.all_tags as string[]).length === 3, { count: b.articles_count, all: b.all_tags })
  }

  console.log("\nWhat search engines read\n")
  {
    const searchSite = siteOf(dawn, source(CARDS), {
      searchHead: (page, path) => compatSearchHead({ origin: "https://www.posturex.com", storeName: "Posturex", logo: "https://cdn.example.com/logo.png", shareImage: "https://cdn.example.com/share.jpg" }, page, path),
    })
    const html = body(await get(searchSite, "/blogs/news/post-1"))
    const ld = ldOf(html)
    const posting = ld.find((x) => x["@type"] === "BlogPosting") as Record<string, unknown> | undefined
    check("a post is one BlogPosting (the theme's own Article dropped)", !!posting && !ld.some((x) => x["@type"] === "Article") && ld.filter((x) => x["@type"] === "BlogPosting").length === 1, ld.map((x) => x["@type"]))
    check("  published by the store, on the custom domain, with its pictures and dates", (posting?.publisher as { name?: string })?.name === "Posturex" && posting?.url === "https://www.posturex.com/blogs/news/post-1" && JSON.stringify(posting?.image).includes("social-1.jpg") && typeof posting?.datePublished === "string" && typeof posting?.dateModified === "string")
    check("  its author, headline, keywords and word count", (posting?.author as { name?: string })?.name === "Ana Lopez" && posting?.headline === "Own search title" && posting?.wordCount === 420)
    const crumbs = ld.find((x) => x["@type"] === "BreadcrumbList") as { itemListElement?: { name?: string; item?: string }[] } | undefined
    check("Home › News › the post", crumbs?.itemListElement?.length === 3 && crumbs.itemListElement[1].name === "News" && crumbs.itemListElement[1].item === "https://www.posturex.com/blogs/news", crumbs)
    check("og:type article, og:image the post's social picture, its own description", /<meta property="og:type" content="article"/.test(html) && /<meta property="og:image" content="https:\/\/cdn\.example\.com\/social-1\.jpg"/.test(html) && /<meta name="description" content="Own description"/.test(html))
    check("a post is a search result (not the empty template's noindex)", !/name="robots" content="noindex/.test(html))
    const hidden = body(await get(searchSite, "/blogs/news/post-3"))
    check("a post kept out of search is noindex, once", count(hidden, /name="robots" content="noindex/g) === 1)
    const moved = ldOf(body(await get(searchSite, "/blogs/news/post-2"))).find((x) => x["@type"] === "BlogPosting")
    check("a post with its own canonical names it in its structured data", moved?.url === "https://elsewhere.example.com/original")
    const list = body(await get(searchSite, "/blogs/news"))
    const blogLd = ldOf(list).find((x) => x["@type"] === "Blog") as { blogPost?: { url?: string }[]; url?: string } | undefined
    check("the blog is a Blog listing its posts on the custom domain", blogLd?.url === "https://www.posturex.com/blogs/news" && (blogLd?.blogPost?.length ?? 0) >= 4 && blogLd!.blogPost![0].url === "https://www.posturex.com/blogs/news/post-1", blogLd)
    check("  and is a search result", !/name="robots" content="noindex/.test(list))
    const empty = body(await get(siteOf(dawn, source([]), { searchHead: searchSite.searchHead }), "/blogs/news"))
    check("with no posts the blog page stays noindex, as before", /name="robots" content="noindex/.test(empty))
    for (const s of ldOf(html)) check(`  JSON-LD ${String(s["@type"])} names schema.org`, String(s["@context"]).includes("schema.org"))
  }

  console.log("\nA theme with no blog template\n")
  {
    const bare = siteOf(plain, source(CARDS))
    const list = await get(bare, "/blogs/news")
    const html = body(list)
    check("the blog in Storelib's own markup, in the theme's header and footer", list.status === 200 && html.includes(`class="sl-blog page-width"`) && html.includes("Post number 1") && html.includes(`<main id="MainContent"`))
    check("  a page of postsPerPage (4) and a way to the next", count(html, /class="sl-blog__card"/g) === 4 && html.includes(`href="/blogs/news?page=2"`))
    const post = await get(bare, "/blogs/news/post-4")
    check("a post in Storelib's article markup, its styles with it", post.status === 200 && body(post).includes(`class="sl-post page-width"`) && body(post).includes("The whole body of Post number 4.") && body(post).includes(".sl-post{"))
    check("a theme with no blog page keeps its /blogs links when the website has a blog", siteLink("/blogs/news", { pages: ["home"], blog: { handle: "news" } }) === "/blogs/news" && siteLink("shopify://blogs/news/x", { pages: ["home"], blog: { handle: "journal-2" } }) === "/blogs/journal-2/x")
    check("  the blog of the store the theme came from is this one", siteLink("/blogs/old-store", { pages: ["home"], blog: { handle: "news" } }) === "/blogs/news" && siteLink("/blogs", { pages: [], blog: { handle: "news" } }) === "/blogs/news")
  }

  console.log("\nThe sitemap\n")
  {
    const entries = blogSitemapEntries("https://www.posturex.com", {
      handle: "news",
      posts: [
        { slug: "post-1", lastmod: new Date(NOW).toISOString(), images: ["https://cdn.example.com/cover-1.jpg", "/relative.jpg"], noindex: false },
        { slug: "post-3", lastmod: new Date(NOW).toISOString(), images: [], noindex: true },
      ],
      categories: ["guides"],
      newest: new Date(NOW).toISOString(),
    })
    const locs = entries.map((e) => e.loc)
    check("the blog, each indexable post and each category, on the custom domain", JSON.stringify(locs) === JSON.stringify(["https://www.posturex.com/blogs/news", "https://www.posturex.com/blogs/news/post-1", "https://www.posturex.com/blogs/news/category/guides"]), locs)
    check("  with lastmod and the post's cover (full addresses only)", !!entries[0].lastmod && entries[1].images?.length === 1 && entries[1].images[0].loc === "https://cdn.example.com/cover-1.jpg")
    check("  written into the sitemap", sitemapXml(entries).includes("<loc>https://www.posturex.com/blogs/news/post-1</loc>") && sitemapXml(entries).includes("<image:loc>https://cdn.example.com/cover-1.jpg</image:loc>"))
    check("nothing with no live post, or before SQL 355", blogSitemapEntries("https://x.com", { handle: "news", posts: [], categories: ["guides"], newest: null }).length === 0 && blogSitemapEntries("https://x.com", null).length === 0)
    check("the templates are not pages of the sitemap, on either kind of site", !listedPageKeys(["home", "blogs", "article", "about"]).some((k) => k === "blogs" || k === "article") && !listedPageKeys(["home", "blog", "article"], { imported: true }).includes("blog"))
    check("  a creator's own page called blog on a Storelib theme still is", listedPageKeys(["home", "blog"]).includes("blog"))
    const data = read("lib/website-builder/site-seo-data.ts")
    check("siteSeo lists the blog for both kinds, on siteOrigin", /listedBlogEntries\(site\.creatorId\)/.test(data) && /blogSitemapEntries\(origin, blog\)/.test(data) && /const origin = await siteOrigin\(site\.creatorId, name\)/.test(data))
  }

  console.log("\nThe live site's wiring and the canvas\n")
  {
    const cs = read("lib/website-builder/compat-site.ts")
    check("compat-site fills site.blog from blogFor, a post, its preview and its redirect", /blogFor\(creator\.creatorId\)/.test(cs) && /readLivePost\(creatorId, slug\)/.test(cs) && /readPreviewPost\(creatorId, token\)/.test(cs) && /siteBlogRedirect\(creatorId, slug\)/.test(cs))
    check("the stranger hold carries the blog's tag", /\[creatorSiteTag\(creator\.creatorId\), creatorShopTag\(creator\.creatorId\), siteBlogTag\(creator\.creatorId\)\]/.test(read("app/api/site-theme/site/[username]/[[...path]]/route.ts")))
    check("the canvas wants the blog on the Blog and Post templates and with a blog setting", wantsCanvasBlog("blog", []) && wantsCanvasBlog("article", []) && wantsCanvasBlog("index", ["text", "blog"]) && !wantsCanvasBlog("index", ["text"]))
    const data = { settings: SETTINGS, listing: { posts: CARDS.slice(1, 4) }, post: null, sample: true }
    const art = canvasBlogPage(data, "article")
    check("the canvas's Post page shows the newest post when none is asked", art.path === "/blogs/news/post-1" && (art.blogData?.article as { title?: string })?.title === "Post number 1")
    check("  its Blog page the blog at its address", canvasBlogPage(data, "blog").path === "/blogs/news" && (canvasBlogPage(data, "blog").blogData?.blog.articles as unknown[]).length === 3)
    check("  any page the whole blog for a featured blog", !!canvasBlogPage(data, "index").siteBlog && !canvasBlogPage(data, "index").blogData)
    check("  nothing before a blog", JSON.stringify(canvasBlogPage(null, "blog")) === "{}" && canvasBlogSource(null) === undefined)
    const canvas = read("components/website-builder/compat/compat-canvas.tsx")
    check("the canvas reads it (useCanvasBlog) and draws with it", /useCanvasBlog\(installId, blogWanted\)/.test(canvas) && /canvasBlogPage\(blogRef\.current, template\)/.test(canvas))
    const hook = read("components/website-builder/compat/use-canvas-blog.ts")
    check("  from the builder's blog canvas route", /\/api\/website-builder\/themes\/\$\{encodeURIComponent\(installId\)\}\/blog\/canvas/.test(hook))
  }

  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
