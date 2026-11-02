/**
 * ===========================================================================
 *  CREATOR WEBSITE BLOGS: THE DATA LAYER (lib/site-blog, SQL part 355)
 * ===========================================================================
 * SANITIZER  a post's blocks and details cleaned on save and again on
 *            render: javascript: links, on* attributes, script and iframe in
 *            text, a frame only from embedFrameSrc, gallery and button.
 * SLUGS      addresses from titles, reserved words, unique with -2, -3.
 * STATUS     draft, scheduled (published, date ahead), published, archived.
 * DATA       the admin functions against the repository's SQL in memory
 *            (tests/_journey/postgrest.ts) through the real supabase-js
 *            client: a save from an old version answered 409, autosave into
 *            the draft of a live post, publish/update/schedule, a live slug
 *            change leaving a redirect, fifty revisions kept, bulk actions,
 *            categories, settings, and one store never reaching another's.
 * LIVENESS   a scheduled post appears when its time comes while the cached
 *            read is still held: liveness is decided outside the cache.
 * BEFORE 355 every read is null or empty and every write a 503 { sql: 355 }.
 * TOKENS     preview links signed, 24 hours, their own namespace.
 * ISOLATION  every `.from("site_blog_…")` in admin.ts and public-read.ts
 *            filters creator_id; no route queries the tables itself.
 *
 * Run with:  npx tsx tests/site-blog-data.test.ts   (and npm run test:push)
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { MemoryDb } from "./_journey/postgrest"
import { stripComments } from "./_source"
import { cleanTag, emptyPostMeta, sanitizeAuthorInput, sanitizeBlogSettingsInput, sanitizeCategoryInput, sanitizePostMeta, sanitizeSiteBlocks } from "@/lib/site-blog/sanitize"
import { SITE_BLOG_ARTICLE_CSS, blocksPlainText, renderBlocksHtml, summaryHtml } from "@/lib/site-blog/render-html"
import { articleJsonLd, blogJsonLd, postSeoDescription, postSeoTitle, postShareImage } from "@/lib/site-blog/seo"
import { SITE_PREVIEW_TTL_MS, signSitePostPreview, verifySitePostPreview } from "@/lib/site-blog/preview-token"
import { signPreviewToken } from "@/lib/blog/preview-token"
import { RESERVED_POST_SLUGS, isBlogHandle, isPostSlug, postSlugFrom, uniqueSlug } from "@/lib/site-blog/slug"
import { isLive, postStatusOf } from "@/lib/site-blog/schedule"
import { blogTemplateKeys, pagedPath, postPath, postPreviewPath, tagPath } from "@/lib/site-blog/urls"
import { SITE_BLOCK_TYPES } from "@/lib/site-blog/blocks"
import { samplePosts } from "@/lib/site-blog/sample"
import { siteBlogTag } from "@/lib/site-blog/cache"
import {
  SiteBlogError,
  allTags,
  archivePost,
  bulkPosts,
  createPost,
  deleteCategory,
  deletePost,
  duplicatePost,
  getAdminPost,
  getBlogSettings,
  listAdminPosts,
  listCategories,
  listRevisions,
  missingTable,
  publishPost,
  restoreRevision,
  saveAuthor,
  saveBlogSettings,
  saveCategory,
  savePostDraft,
  unpublishPost,
} from "@/lib/site-blog/admin"
import { blogFor, listedBlogEntries, liveCards, readBlogListing, readCanvasBlog, readLivePost, readPreviewPost, readPublishedCards, readSiteBlog, relatedPosts, siteBlogReadDeps, siteBlogRedirect } from "@/lib/site-blog/public-read"
import type { PublicPostCard } from "@/lib/site-blog/types"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 600)}`}`)
  }
}
function section(title: string) {
  console.log(`\n${title}`)
}
async function refusal(work: Promise<unknown>): Promise<SiteBlogError | null> {
  try {
    await work
    return null
  } catch (e) {
    return e instanceof SiteBlogError ? e : null
  }
}

process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key-0123456789"
process.env.BLOG_ADMIN_SECRET = "a-different-admin-secret-0123456789"

/* ── Sanitizer ──────────────────────────────────────────────────────────── */

section("Sanitizer: blocks on save")
{
  const blocks = sanitizeSiteBlocks([
    { id: "p1", type: "p", html: '<a href="javascript:alert(1)" onclick="x()">click</a> <b onmouseover="y()">bold</b><script>alert(2)</script><iframe src="https://evil.example"></iframe>' },
    { id: "p1", type: "p", html: '<a href="jav&#x61;script:alert(1)">entity</a> <a href="https://ok.example/x" target="_blank">ok</a>' },
    { type: "img", url: "javascript:alert(1)", alt: "<img src=x onerror=alert(1)>" },
    { type: "gallery", images: [...Array.from({ length: 30 }, (_, i) => ({ url: `https://cdn.example/${i}.jpg`, alt: `Pic ${i}` })), { url: "data:image/png;base64,AAAA", alt: "" }] },
    { type: "gallery", images: [{ url: "javascript:alert(1)" }, { url: "https://cdn.example/a.jpg", alt: "a", caption: "<b>c</b>" }] },
    { type: "button", label: "Buy now, it's the best button label ever made for anything", url: "javascript:alert(1)", style: "evil" },
    { type: "button", label: "Shop", url: "/collections/all", style: "secondary" },
    { type: "embed", url: "https://evil.example/watch?v=dQw4w9WgXcQ", provider: "youtube" },
    { type: "embed", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
    { type: "snippet", snippetId: "0f8fad5b-d9cb-469f-a165-70867728950e" },
    { type: "script", html: "<script>x</script>" },
    { type: "h2", html: "Same" },
    { type: "h2", html: "Same" },
    null,
    "nope",
  ])
  const p = blocks.filter((b) => b.type === "p")
  check("a javascript: link loses its link and keeps its words", p[0].html?.includes("click") === true && !/javascript/i.test(p[0].html ?? ""), p[0].html)
  check("on* attributes are dropped", !/\son\w+=/i.test(JSON.stringify(blocks)), p[0].html)
  check("script and iframe in text are dropped with their content", !/script|iframe|evil/i.test(p[0].html ?? ""), p[0].html)
  check("an entity-spelled javascript: link is refused too", !/href/.test(p[1].html?.split("entity")[0] ?? "x") && /rel="noopener noreferrer"/.test(p[1].html ?? ""), p[1].html)
  check("two blocks with one id get two ids", p[0].id !== p[1].id)
  const img = blocks.find((b) => b.type === "img")
  check("a picture with a javascript: address has none, its alt is plain text", img?.url === "" && !/[<>]/.test(img?.alt ?? ""), img)
  const galleries = blocks.filter((b) => b.type === "gallery")
  check("a gallery keeps at most 24 pictures, and never a data: address", galleries[0].images?.length === 24 && !JSON.stringify(galleries[0]).includes("data:"), galleries[0].images?.length)
  check("a gallery drops pictures with unsafe addresses and cleans captions", galleries[1].images?.length === 1 && galleries[1].images?.[0].caption === "c", galleries[1])
  const buttons = blocks.filter((b) => b.type === "button")
  check("a button's javascript: link is emptied, its label capped at 40, its style primary", buttons[0].url === "" && (buttons[0].label ?? "").length <= 40 && buttons[0].style === "primary", buttons[0])
  check("a button to a path on the site is kept, secondary", buttons[1].url === "/collections/all" && buttons[1].style === "secondary", buttons[1])
  const embeds = blocks.filter((b) => b.type === "embed")
  check("an embed claiming a provider it is not from loses the provider", embeds[0].provider === undefined, embeds[0])
  check("a real YouTube address keeps its provider", embeds[1].provider === "youtube", embeds[1])
  check("snippets and unknown types are dropped", !blocks.some((b) => (b.type as string) === "snippet" || (b.type as string) === "script"))
  const h2 = blocks.filter((b) => b.type === "h2")
  check("headings get unique anchors", h2.length === 2 && h2[0].anchor !== h2[1].anchor, h2)
  check("anything that is not a list is no blocks", sanitizeSiteBlocks({ type: "p" }).length === 0 && sanitizeSiteBlocks(null).length === 0)
  check("SITE_BLOCK_TYPES has gallery and button and no snippet", SITE_BLOCK_TYPES.includes("gallery") && SITE_BLOCK_TYPES.includes("button") && !SITE_BLOCK_TYPES.includes("snippet"))
}

section("Sanitizer: a post's details")
{
  const m = sanitizePostMeta({
    title: `<b>${"T".repeat(300)}</b>`,
    slug: "My Post!",
    excerpt: "x".repeat(900),
    coverImageUrl: "javascript:alert(1)",
    ogImageUrl: "https://cdn.example/og.png",
    canonicalUrl: "javascript:alert(1)",
    categoryId: "not-a-uuid",
    authorId: "0F8FAD5B-D9CB-469F-A165-70867728950E",
    tags: ["  Hello  World ", "a/b?c#d", "", "dup", "DUP", ...Array.from({ length: 30 }, (_, i) => `t${i}`)],
    seoTitle: "s".repeat(100),
    seoDescription: "d".repeat(500),
    noindex: "yes",
    featured: true,
    publishedAt: "not a date",
  })
  check("title is plain text, at most 200", m.title.length === 200 && !m.title.includes("<"), m.title.length)
  check("slug is cleaned", m.slug === "my-post", m.slug)
  check("excerpt at most 500, seo title 70, seo description 320", m.excerpt.length === 500 && m.seoTitle.length === 70 && m.seoDescription.length === 320)
  check("unsafe addresses are emptied, safe ones kept", m.coverImageUrl === "" && m.canonicalUrl === "" && m.ogImageUrl === "https://cdn.example/og.png")
  check("ids are uuids or null, lower case", m.categoryId === null && m.authorId === "0f8fad5b-d9cb-469f-a165-70867728950e")
  check("tags cleaned, unique, at most 20", m.tags.length === 20 && m.tags[0] === "hello world" && m.tags[1] === "a b c d" && m.tags.filter((t) => t === "dup").length === 1, m.tags)
  check("booleans only from true; a bad date is null", m.noindex === false && m.featured === true && m.publishedAt === null)
  check("a reserved slug is no slug (made from the title on save)", sanitizePostMeta({ slug: "page" }).slug === "" && sanitizePostMeta({ slug: "tagged" }).slug === "")
  const kept = sanitizePostMeta({ title: "New" }, { ...emptyPostMeta(), excerpt: "Kept", tags: ["x"] })
  check("a partial update keeps the fields it does not name", kept.title === "New" && kept.excerpt === "Kept" && kept.tags.join() === "x")
  check("cleanTag", cleanTag("  <i>Summer</i> Sale!! ") === "summer sale!!" && cleanTag("a".repeat(80)).length === 40)
  const cat = sanitizeCategoryInput({ name: " Recipes & Tips ", sortOrder: "3.6" })
  check("a category's address comes from its name", cat.slug === "recipes-and-tips" && cat.sortOrder === 4 && cat.name === "Recipes & Tips", cat)
  const author = sanitizeAuthorInput({ name: "Ana", links: [{ label: "X", url: "javascript:alert(1)" }, { url: "https://example.com/ana" }, { url: "/relative" }] })
  check("an author keeps only http(s) and mailto links", author.links.length === 1 && author.links[0].url === "https://example.com/ana" && author.slug === "ana", author)
  const settings = sanitizeBlogSettingsInput({ handle: "My Journal", postsPerPage: 500, title: "J" })
  check("blog settings: handle cleaned, posts per page capped at 48, only given fields", settings.handle === "my-journal" && settings.postsPerPage === 48 && !("description" in settings), settings)
}

section("Render: cleaned again when drawn")
{
  const raw = [
    { id: "a", type: "p", html: '<a href="javascript:alert(1)">x</a><img src=x onerror="alert(1)"><script>alert(1)</script>' },
    { id: "b", type: "embed", url: "https://evil.example/x", provider: "vimeo" },
    { id: "c", type: "embed", url: "https://vimeo.com/123456789", provider: "vimeo", caption: '"><script>' },
    { id: "d", type: "img", url: 'https://cdn.example/a.jpg" onload="alert(1)', alt: "a" },
    { id: "e", type: "img", url: "https://cdn.example/b.jpg", alt: 'b" onerror="x' },
    { id: "f", type: "youtube", videoId: "dQw4w9WgXcQ" },
    { id: "g", type: "youtube", videoId: '"><script>' },
    { id: "h", type: "code", lang: "js", text: "<script>alert(1)</script>" },
    { id: "i", type: "gallery", images: [{ url: "https://cdn.example/1.jpg", alt: "one" }, { url: "javascript:x", alt: "two" }] },
    { id: "j", type: "button", label: "Go", url: "javascript:alert(1)" },
    { id: "k", type: "button", label: "Shop", url: "https://shop.example" },
    { id: "l", type: "h2", html: "Intro" },
    { id: "m", type: "table", headers: ["<b>H</b>"], rows: [["<i>c</i>"]] },
    { id: "n", type: "cta", title: "Join", body: "Now", label: "Sign up", url: "data:text/html,x" },
  ] as unknown as Parameters<typeof renderBlocksHtml>[0]
  const html = renderBlocksHtml(raw)
  check("no javascript: or data: address survives", !/javascript:|data:text/i.test(html), html.slice(0, 300))
  const tagsOnly = html.replace(/"[^"]*"/g, '""')
  check("no on* attribute survives (outside escaped attribute values)", !/\son[a-z]+\s*=/i.test(tagsOnly), tagsOnly.match(/\son[a-z]+\s*=[^>]*/i)?.[0])
  check("no script tag survives", !/<script/i.test(html))
  const frames = [...html.matchAll(/<iframe src="([^"]+)"/g)].map((m) => m[1])
  check("frames only from embedFrameSrc or YouTube's no-cookie player", frames.length === 2 && frames.every((s) => /^https:\/\/(player\.vimeo\.com|www\.youtube-nocookie\.com)\//.test(s)), frames)
  check("an embed from the wrong host is drawn as a link", /<a class="sl-post__link" href="https:\/\/evil\.example\/x"/.test(html))
  check("pictures load lazily", (html.match(/<img /g) ?? []).length === (html.match(/loading="lazy"/g) ?? []).length - frames.length && /loading="lazy"/.test(html))
  check("a gallery draws only its safe pictures", /data-count="1"/.test(html))
  check("a button with an unsafe link is not drawn; a safe one is", !/>Go</.test(html) && /sl-post__button--primary" href="https:\/\/shop\.example"/.test(html))
  check("headings carry their anchor", /<h2 class="sl-post__h2" id="intro">Intro<\/h2>/.test(html))
  check("code and table text is escaped", html.includes("&lt;script&gt;alert(1)&lt;/script&gt;") && !/<b>H<\/b>/.test(html))
  check("blocksPlainText and summaryHtml", blocksPlainText([{ id: "x", type: "p", html: "Hello <b>there</b> friend" }]) === "Hello there friend" && summaryHtml([{ id: "x", type: "p", html: "one two three four" }], 2) === "<p>one two…</p>")
  check("SITE_BLOG_ARTICLE_CSS is scoped under .sl-post", SITE_BLOG_ARTICLE_CSS.split("}").filter((r) => r.trim() && !r.trim().startsWith("@media")).every((r) => /(^|,|\{)\s*\.sl-post/.test(r.trim()) || r.includes(".sl-post")))
}

section("SEO")
{
  const ld = articleJsonLd({ url: "https://shop.example/blogs/news/a", title: "A", description: "d", images: ["https://cdn.example/a.jpg", "/rel.jpg", "https://cdn.example/x.svg"], published: "2026-10-01T10:00:00Z", modified: null, author: null, publisher: { name: "Ana's Shop", url: "https://shop.example", logo: "https://cdn.example/logo.png" }, tags: ["x"], wordCount: 10 })
  check("BlogPosting published by the store, never Storelib", ld["@type"] === "BlogPosting" && (ld.publisher as { name: string }).name === "Ana's Shop" && !JSON.stringify(ld).includes("Storelib"))
  check("only absolute, non-svg images", JSON.stringify(ld.image) === '["https://cdn.example/a.jpg"]')
  const blog = blogJsonLd({ url: "https://shop.example/blogs/news", name: "News", description: "", posts: [{ url: "https://shop.example/blogs/news/a", title: "A", publishedAt: "2026-10-01" }] })
  check("Blog with blogPost items", blog["@type"] === "Blog" && blog.blogPost.length === 1)
  const post = { title: "Hello", excerpt: "", coverImageUrl: "https://cdn.example/c.jpg", summaryHtml: "<p>Opening &amp; words</p>", seo: { title: "", description: "", ogImageUrl: "" } }
  check("title, description and share picture fall back in order", postSeoTitle(post, "Ana") === "Hello | Ana" && postSeoDescription(post, "site") === "Opening & words" && postShareImage(post, "f") === "https://cdn.example/c.jpg" && postShareImage({ ...post, coverImageUrl: "" }, "f") === "f")
}

/* ── Slugs, status, urls ────────────────────────────────────────────────── */

section("Slugs, status, addresses")
{
  check("postSlugFrom", postSlugFrom("Héllo, Wörld & Friends!") === "hello-world-and-friends")
  check("reserved words are not post slugs", RESERVED_POST_SLUGS.every((s) => !isPostSlug(s)) && isPostSlug("my-post") && !isPostSlug("My Post"))
  check("uniqueSlug adds -2, -3", uniqueSlug("a", new Set(["a", "a-2"])) === "a-3" && uniqueSlug("page", new Set()) === "post")
  check("blog handles", isBlogHandle("news") && !isBlogHandle("-x") && !isBlogHandle("x-"))
  const now = Date.parse("2026-11-01T12:00:00Z")
  check("draft, scheduled, published, archived", postStatusOf({ status: "draft", published_at: null }, now) === "draft" && postStatusOf({ status: "published", published_at: "2026-11-02T00:00:00Z" }, now) === "scheduled" && postStatusOf({ status: "published", published_at: "2026-10-01T00:00:00Z" }, now) === "published" && postStatusOf({ status: "archived", published_at: "2026-10-01T00:00:00Z" }, now) === "archived")
  check("a published post with no date is live", isLive({ status: "published", published_at: null }, now))
  check("native pages in the path, imported themes ?page=", pagedPath("/blogs/news", 2, false) === "/blogs/news/page/2" && pagedPath("/blogs/news", 2, true) === "/blogs/news?page=2" && pagedPath("/blogs/news", 1, false) === "/blogs/news")
  check("addresses", postPath("news", "a") === "/blogs/news/a" && tagPath("news", "summer sale") === "/blogs/news/tagged/summer%20sale" && postPreviewPath("news", "t.x.y") === "/blogs/news/~preview/t.x.y")
  check("template keys: native blogs, compat blog, both article", blogTemplateKeys(false).listing === "blogs" && blogTemplateKeys(true).listing === "blog" && blogTemplateKeys(true).post === "article")
  const samples = samplePosts("news")
  check("three sample posts with html and noindex", samples.length === 3 && samples.every((s) => s.html.length > 0 && s.seo.noindex && s.path.startsWith("/blogs/news/")))
  check("the cache tag", siteBlogTag("abc") === "site-blog:abc")
}

/* ── Preview tokens ─────────────────────────────────────────────────────── */

section("Preview tokens")
{
  const id = "0f8fad5b-d9cb-469f-a165-70867728950e"
  const now = Date.parse("2026-11-01T12:00:00Z")
  const token = signSitePostPreview(id, now)!
  check("a signed token opens its post", !!token && verifySitePostPreview(token, now + 1000) === id)
  check("it runs out after 24 hours", SITE_PREVIEW_TTL_MS === 86_400_000 && verifySitePostPreview(token, now + SITE_PREVIEW_TTL_MS - 1) === id && verifySitePostPreview(token, now + SITE_PREVIEW_TTL_MS + 1) === null)
  const [a, b, c] = token.split(".")
  check("a changed id, expiry or signature opens nothing", verifySitePostPreview(`1${a.slice(1)}.${b}.${c}`, now) === null && verifySitePostPreview(`${a}.${(parseInt(b, 36) + 99999).toString(36)}.${c}`, now) === null && verifySitePostPreview(`${a}.${b}.${c.replace(/^./, c[0] === "0" ? "1" : "0")}`, now) === null)
  check("storelib.com's own blog preview token does not open a creator's post", verifySitePostPreview(signPreviewToken(id, now), now) === null)
  check("garbage is refused", verifySitePostPreview("x", now) === null && verifySitePostPreview("", now) === null && verifySitePostPreview(null, now) === null)
  check("no token without an id", signSitePostPreview("nope", now) === null)
}

/* ── Admin and public reads against the SQL in memory ───────────────────── */

const A = "11111111-1111-4111-8111-111111111111"
const B = "22222222-2222-4222-8222-222222222222"
const USER = "33333333-3333-4333-8333-333333333333"

function memoryClient(db: MemoryDb): SupabaseClient {
  return createClient("https://journey.supabase.co", "service-role", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: ((input: RequestInfo | URL, init?: RequestInit) => db.handle(new Request(input instanceof Request ? input : String(input), init))) as typeof fetch },
  })
}

function freshDb(): { mem: MemoryDb; db: SupabaseClient } {
  const mem = new MemoryDb()
  mem.rows("creators").push({ id: A, user_id: USER }, { id: B, user_id: "44444444-4444-4444-8444-444444444444" })
  return { mem, db: memoryClient(mem) }
}

async function main() {
  section("Schema: part 355 is what the memory database is built from")
  {
    const { mem } = freshDb()
    for (const t of ["site_blog_settings", "site_blog_authors", "site_blog_categories", "site_blog_posts", "site_blog_post_revisions", "site_blog_redirects"]) check(`${t} exists`, mem.model.has(t))
    const sql = readFileSync("supabase/sql/run-now/355_site_blog.sql", "utf8")
    check("the migration is byte-identical", sql === readFileSync("supabase/migrations/20271109_site_blog.sql", "utf8"))
    check("ends with notify pgrst", sql.trimEnd().endsWith("notify pgrst, 'reload schema';"))
    check("every policy is guarded and nothing is granted to anon", (sql.match(/CREATE POLICY/g) ?? []).length === 24 && (sql.match(/IF NOT EXISTS \(SELECT 1 FROM pg_policies/g) ?? []).length === 24 && !/TO anon/.test(sql) && (sql.match(/ENABLE ROW LEVEL SECURITY/g) ?? []).length === 6)
    check("99_check_after has p355_site_blog", readFileSync("supabase/sql/run-now/99_check_after.sql", "utf8").includes("as p355_site_blog;"))
  }

  section("Posts: create, save, 409, publish")
  const { mem, db } = freshDb()
  siteBlogReadDeps.db = () => db
  siteBlogReadDeps.cached = (fn) => fn()
  {
    const post = await createPost(db, A, USER, { meta: { title: "Hello World" }, blocks: [{ type: "p", html: "First words <script>x</script>" }] })
    check("a new post is a draft with its address from the title", post.status === "draft" && post.slug === "hello-world" && post.version === 1 && post.livePath === null, post)
    check("its blocks were cleaned on save", !JSON.stringify(mem.rows("site_blog_posts")).includes("<script>"))
    const second = await createPost(db, A, USER, { meta: { title: "Hello World" } })
    check("a second post with the same title gets -2", second.slug === "hello-world-2", second.slug)
    const otherStore = await createPost(db, B, USER, { meta: { title: "Hello World" } })
    check("another store may use the same address", otherStore.slug === "hello-world")

    const saved = await savePostDraft(db, A, USER, post.id, { meta: { ...post.meta, title: "Hello again" }, blocks: [{ type: "p", html: "Changed" }], version: 1 })
    check("a save with the current version is taken and bumps it", saved.ok && saved.post.version === 2 && saved.post.title === "Hello again", saved)
    const stale = await savePostDraft(db, A, USER, post.id, { meta: { title: "From an old tab" }, blocks: [], version: 1 })
    check("a save from an old version is answered 409 with the post as it is now", !stale.ok && stale.status === 409 && "current" in stale && stale.current.title === "Hello again" && stale.current.version === 2, stale)
    check("…and changed nothing", (await getAdminPost(db, A, post.id))?.title === "Hello again")
    const bad = await savePostDraft(db, A, USER, post.id, { meta: {}, blocks: [], version: Number.NaN })
    check("a save without a version is 400", !bad.ok && bad.status === 400)
    check("another store's post is not found, read or saved", (await getAdminPost(db, B, post.id)) === null && !(await savePostDraft(db, B, USER, post.id, { meta: { title: "x" }, blocks: [], version: 2 })).ok)

    const noTitle = await createPost(db, A, USER, {})
    const refusedTitle = await refusal(publishPost(db, A, USER, noTitle.id, { mode: "publish" }))
    check("publishing needs a title", refusedTitle?.status === 400, refusedTitle?.message)
    const stalePublish = await refusal(publishPost(db, A, USER, post.id, { version: 1, mode: "publish" }))
    check("publishing from an old version is 409", stalePublish?.status === 409 && !!stalePublish.current)

    const live = await publishPost(db, A, USER, post.id, { version: 2, mode: "publish" })
    check("publish: live, a date, first published, a revision, liveChanged", live.status === "published" && !!live.publishedAt && !!live.firstPublishedAt && live.liveChanged && live.livePath === "/blogs/news/hello-world", live)
    const row = mem.rows("site_blog_posts").find((r) => r.id === post.id)!
    check("the live columns hold the draft, the draft columns are cleared, the summary is kept", row.title === "Hello again" && row.draft_meta === null && row.draft_content === null && row.summary === "Changed")

    section("Autosave on a live post")
    const auto = await savePostDraft(db, A, USER, post.id, { meta: { ...live.meta, title: "Draft title", slug: "new-address" }, blocks: [{ type: "p", html: "Draft words" }], version: live.version })
    const after = mem.rows("site_blog_posts").find((r) => r.id === post.id)!
    check("goes to the draft only: visitors still read the live copy", auto.ok && after.title === "Hello again" && after.slug === "hello-world" && after.draft_meta?.title === "Draft title" && after.draft_meta?.slug === "new-address")
    check("the editor sees the draft, flagged as unpublished changes", auto.ok && auto.post.title === "Draft title" && auto.post.hasUnpublishedChanges && auto.post.liveSlug === "hello-world")
    const card = (await readLivePost(A, "hello-world"))!
    check("the public post is still the live copy", card?.title === "Hello again" && card.html.includes("Changed") && !card.html.includes("Draft words"))

    section("Update with a new address")
    const updated = await publishPost(db, A, USER, post.id, { mode: "update" })
    check("update copies the draft over the live copy", updated.title === "Draft title" && updated.slug === "new-address" && !updated.hasUnpublishedChanges)
    const redirects = mem.rows("site_blog_redirects")
    check("the old address redirects to the new one", redirects.length === 1 && redirects[0].from_slug === "hello-world" && redirects[0].to_slug === "new-address" && redirects[0].creator_id === A, redirects)
    check("siteBlogRedirect answers the new slug; another store gets nothing", (await siteBlogRedirect(A, "hello-world")) === "new-address" && (await siteBlogRedirect(B, "hello-world")) === null)
    check("the old address is no live post", (await readLivePost(A, "hello-world")) === null && (await readLivePost(A, "new-address"))?.title === "Draft title")
    const kinds = (await listRevisions(db, A, post.id)).map((r) => r.kind)
    check("revisions: save, publish, update", kinds.includes("publish") && kinds.includes("update") && kinds.includes("save"), kinds)

    section("Revisions: fifty kept")
    for (let i = 0; i < 60; i++) mem.rows("site_blog_post_revisions").push({ id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, post_id: post.id, creator_id: A, kind: "save", meta: { title: `Old ${i}` }, content: [], created_at: new Date(Date.parse("2026-01-01T00:00:00Z") + i * 1000).toISOString() })
    await publishPost(db, A, USER, post.id, { mode: "update" })
    const kept = mem.rows("site_blog_post_revisions").filter((r) => r.post_id === post.id)
    check("after a write, at most 50 remain, the newest", kept.length === 50 && kept.some((r) => r.kind === "update" && Date.parse(r.created_at) > Date.parse("2026-06-01")), kept.length)
    const restoreFrom = (await listRevisions(db, A, post.id)).find((r) => r.title === "Old 59")!
    const restored = await restoreRevision(db, A, USER, post.id, restoreFrom.id)
    check("a restore goes into the draft of a live post", restored.title === "Old 59" && restored.hasUnpublishedChanges && mem.rows("site_blog_posts").find((r) => r.id === post.id)!.title === "Draft title")
    check("another store cannot restore it", (await refusal(restoreRevision(db, B, USER, post.id, restoreFrom.id)))?.status === 404)

    section("Schedule: live when its time comes, with the cache still held")
    const sched = await createPost(db, A, USER, { meta: { title: "Next week", tags: ["Launch"] } })
    const at = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    const scheduled = await publishPost(db, A, USER, sched.id, { mode: "schedule", publishAt: at })
    check("schedule: status scheduled, a schedule revision", scheduled.status === "scheduled" && (await listRevisions(db, A, sched.id))[0].kind === "schedule")
    check("scheduling a time already past is refused", (await refusal(publishPost(db, A, USER, second.id, { mode: "schedule", publishAt: "2020-01-01T00:00:00Z" })))?.status === 400)
    /* A cache that holds every read for good, as unstable_cache does between clears. */
    const held = new Map<string, unknown>()
    let loads = 0
    siteBlogReadDeps.cached = async <T>(fn: () => Promise<T>, key: string[]) => {
      const k = key.join(":")
      if (!held.has(k)) {
        loads++
        held.set(k, await fn())
      }
      return held.get(k) as T
    }
    const later = Date.now() + 2 * 60 * 60 * 1000
    const nowCards = await liveCards(A)
    const laterCards = await liveCards(A, later)
    check("not live before its time, live after, from the same held read", !nowCards.some((c) => c.slug === "next-week") && laterCards.some((c) => c.slug === "next-week") && loads === 1, { loads })
    check("readPublishedCards includes the scheduled one (for the canvas)", (await readPublishedCards(A)).some((c) => c.slug === "next-week"))
    check("the scheduled post itself: null now, the post later", (await readLivePost(A, "next-week")) === null && (await readLivePost(A, "next-week", later))?.title === "Next week")
    check("blogFor gives live cards only", (await blogFor(A))!.cards.every((c) => c.slug !== "next-week") && (await blogFor(A, later))!.cards.some((c) => c.slug === "next-week"))
    siteBlogReadDeps.cached = (fn) => fn()

    section("Listing, tags, categories, related")
    const cat = await saveCategory(db, A, { name: "Recipes" })
    const clash = await refusal(saveCategory(db, A, { name: "Recipes" }))
    check("a category; a second with the same address is refused", cat.slug === "recipes" && clash?.status === 400)
    check("another store cannot edit it", (await refusal(saveCategory(db, B, { id: cat.id, name: "Mine" })))?.status === 404)
    const bulk = await bulkPosts(db, A, USER, [sched.id, second.id, "nope", otherStore.id], "set_category", cat.id)
    check("bulk set_category: done for the store's own, failed for the rest", bulk.done.length === 2 && bulk.failed.length === 2 && bulk.liveChanged, bulk)
    check("another store's post was not touched", mem.rows("site_blog_posts").find((r) => r.id === otherStore.id)!.category_id == null)
    const pub = await bulkPosts(db, A, USER, [second.id], "publish")
    check("bulk publish", pub.done.length === 1 && pub.liveChanged)
    await bulkPosts(db, A, USER, [second.id], "add_tag", "Summer Sale")
    check("allTags", (await allTags(db, A)).includes("summer sale") && (await allTags(db, A)).includes("launch"))
    const listing = (await readBlogListing(A, { page: 1 }))!
    check("the listing has the live posts, newest first, and its categories with counts", listing.total === 2 && listing.posts.length === 2 && listing.categories.find((c) => c.slug === "recipes")?.postCount === 1, listing)
    check("by category, by tag, past the last page", (await readBlogListing(A, { categorySlug: "recipes" }))?.total === 1 && (await readBlogListing(A, { tag: "summer sale" }))?.total === 1 && (await readBlogListing(A, { page: 9 })) === null && (await readBlogListing(A, { categorySlug: "nope" })) === null)
    const cards: PublicPostCard[] = [
      { ...listing.posts[0], id: "x1", category: null, tags: ["a"], publishedAt: "2026-01-03T00:00:00Z" },
      { ...listing.posts[0], id: "x2", category: { slug: "c", name: "C", path: "/" }, tags: [], publishedAt: "2026-01-01T00:00:00Z" },
      { ...listing.posts[0], id: "x3", category: null, tags: ["a", "b"], publishedAt: "2026-01-02T00:00:00Z" },
      { ...listing.posts[0], id: "x4", category: null, tags: [], publishedAt: "2026-01-04T00:00:00Z" },
    ]
    const related = relatedPosts(cards, { id: "me", category: { slug: "c", name: "C", path: "/" }, tags: ["a", "b"] }, 3).map((c) => c.id)
    check("related: category first, then tags in common, then newest", related.join() === "x2,x3,x1", related)
    const entries = await listedBlogEntries(A)
    check("sitemap entries: live posts, used categories, newest", entries.handle === "news" && entries.posts.length === 2 && entries.categories.join() === "recipes" && !!entries.newest)

    section("Settings, unpublish, archive, duplicate, delete")
    const s1 = await saveBlogSettings(db, A, { handle: "Journal", title: "My journal" })
    check("a new handle keeps the old one for its 308", s1.handle === "journal" && s1.previousHandles.join() === "news" && (await getBlogSettings(db, A)).title === "My journal")
    const s2 = await saveBlogSettings(db, A, { handle: "news" })
    check("going back removes it from the old ones", s2.handle === "news" && s2.previousHandles.join() === "journal")
    check("an invalid handle is refused", (await refusal(saveBlogSettings(db, A, { handle: "--" })))?.status === 400)
    check("another store's settings are its own", (await getBlogSettings(db, B)).handle === "news" && (await readSiteBlog(B))?.title === "Blog" && (await readSiteBlog(A))?.title === "My journal")
    const down = await unpublishPost(db, A, USER, second.id)
    check("unpublish: a draft again, liveChanged", down.status === "draft" && down.liveChanged && (await readLivePost(A, second.slug)) === null)
    const arch = await archivePost(db, A, USER, second.id)
    const list = await listAdminPosts(db, A, {})
    check("archive: hidden from All, counted apart", arch.status === "archived" && !list.posts.some((p) => p.id === second.id) && list.counts.archived === 1 && list.counts.scheduled === 1, list.counts)
    check("search by title finds a draft-only title too", (await listAdminPosts(db, A, { search: "old 59" })).posts.length === 1 && (await listAdminPosts(db, A, { search: "next" })).total === 1)
    check("another store's list is its own", (await listAdminPosts(db, B, {})).total === 1)
    const copy = await duplicatePost(db, A, USER, sched.id)
    check("duplicate: a new draft with its own address", copy.status === "draft" && copy.id !== sched.id && copy.slug !== sched.slug && copy.title.endsWith("(copy)") && !copy.liveChanged)
    const gone = await deletePost(db, A, USER, post.id)
    check("delete: gone, its redirects with it, liveChanged", gone.liveChanged && !mem.rows("site_blog_posts").some((r) => r.id === post.id) && mem.rows("site_blog_redirects").length === 0)
    check("another store cannot delete", (await refusal(deletePost(db, B, USER, sched.id)))?.status === 404)
    await deleteCategory(db, A, cat.id)
    check("a category deleted", (await listCategories(db, A)).length === 0)
    const author = await saveAuthor(db, A, { name: "Ana Pop", links: [{ label: "Site", url: "https://ana.example" }] })
    check("an author", author.slug === "ana-pop" && author.links.length === 1)

    section("Preview: the draft, the store's own post only")
    const draft = await savePostDraft(db, A, USER, sched.id, { meta: { title: "Next week, revised" }, blocks: [{ type: "p", html: "Preview words" }], version: (await getAdminPost(db, A, sched.id))!.version })
    const token = signSitePostPreview(sched.id)!
    const preview = await readPreviewPost(A, token)
    check("readPreviewPost shows the draft, noindex", draft.ok && preview?.title === "Next week, revised" && preview.html.includes("Preview words") && preview.seo.noindex)
    check("the same token opens nothing on another store's site", (await readPreviewPost(B, token)) === null)

    section("Canvas")
    const canvas = await readCanvasBlog(db, A, null)
    check("live and scheduled posts, not sample", !!canvas && !canvas.sample && canvas.listing.posts.some((p) => p.slug === "next-week"))
    const empty = await readCanvasBlog(db, B, null)
    check("no published post: the three samples, flagged", !!empty && empty.sample && empty.listing.posts.length === 3 && !!empty.post)
  }

  section("Before SQL part 355")
  {
    const { mem: bare, db: bareDb } = freshDb()
    for (const t of ["site_blog_settings", "site_blog_authors", "site_blog_categories", "site_blog_posts", "site_blog_post_revisions", "site_blog_redirects"]) bare.model.delete(t)
    siteBlogReadDeps.db = () => bareDb
    const write = await refusal(createPost(bareDb, A, USER, { meta: { title: "x" } }))
    const list = await refusal(listAdminPosts(bareDb, A, {}))
    check("writes and admin reads are 503 (the route answers { error, sql: 355 })", write?.status === 503 && list?.status === 503)
    check("missingTable knows the error", missingTable({ code: "PGRST205", message: "Could not find the table 'public.site_blog_posts' in the schema cache" }) && missingTable({ message: 'relation "public.site_blog_posts" does not exist' }) && !missingTable({ message: "timeout" }))
    check("public reads are null or empty", (await readSiteBlog(A)) === null && (await liveCards(A)).length === 0 && (await readBlogListing(A, {})) === null && (await readLivePost(A, "x")) === null && (await blogFor(A)) === null && (await siteBlogRedirect(A, "x")) === null && (await listedBlogEntries(A)).posts.length === 0)
    check("the canvas is null (503)", (await readCanvasBlog(bareDb, A, null)) === null)
  }

  section("Isolation: every query filters creator_id")
  {
    for (const file of ["lib/site-blog/admin.ts", "lib/site-blog/public-read.ts"]) {
      const src = stripComments(readFileSync(file, "utf8"))
      const at = [...src.matchAll(/\.from\("site_blog_/g)].map((m) => m.index!)
      const missing = at.filter((i, n) => {
        const end = Math.min(at[n + 1] ?? src.length, i + 700)
        return !/creator_id/.test(src.slice(i, end))
      })
      check(`${file}: ${at.length} queries, each with creator_id`, at.length > 5 && missing.length === 0, missing.map((i) => src.slice(i, i + 120)))
    }
    const routes: string[] = []
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f)
        if (statSync(p).isDirectory()) walk(p)
        else if (f === "route.ts") routes.push(p)
      }
    }
    walk("app/api/website-builder/themes/[installId]/blog")
    check("fourteen blog routes", routes.length === 14, routes)
    for (const r of routes) {
      const src = readFileSync(r, "utf8")
      const name = r.replace("app/api/website-builder/themes/[installId]/", "")
      check(`${name}: nodejs, dynamic, the caller check, no table query of its own`, src.includes('runtime = "nodejs"') && src.includes('dynamic = "force-dynamic"') && (src.includes("blogCaller(") || /const site = await websiteInstallCaller\(installId\)\n\s*if \(site\.error !== null\)/.test(src)) && !src.includes('.from("site_blog_'))
    }
    const post = readFileSync("app/api/website-builder/themes/[installId]/blog/posts/[postId]/route.ts", "utf8")
    const put = post.slice(post.indexOf("export async function PUT"), post.indexOf("export async function DELETE"))
    check("autosave (PUT) never clears a cache", put.length > 100 && !put.includes("revalidate"))
    const actions = readFileSync("app/api/website-builder/themes/[installId]/blog/posts/[postId]/actions/route.ts", "utf8")
    check("publish-type actions clear the blog's cache", /if \(liveChanged\) await revalidateSiteBlog\(creatorId\)/.test(actions))
    const http = readFileSync("lib/site-blog/http.ts", "utf8")
    check("a missing table is 503 { error, sql: 355 }", /status: 503/.test(http) && /sql: SQL_PART/.test(http))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
