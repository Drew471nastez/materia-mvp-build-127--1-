/**
 * ===========================================================================
 *  ROUND 45: THE BLOG ADMIN
 * ===========================================================================
 * SANITISER  what a post may carry as HTML (lib/blog/sanitize.ts): the
 *            inline tags of lib/blog/blocks.ts and nothing else, links that
 *            may be followed, target=_blank with noopener, well formed.
 * SCHEDULE   a post is live when it is published and its date has come
 *            (lib/blog/schedule.ts), and every public read asks that.
 * REDIRECTS  an old slug followed to the post's new one, one hop or a few,
 *            never round a loop (lib/blog/redirects.ts), and the public
 *            post's layout answering it with a 308.
 * 409        a save made from an old version is refused, the compare and the
 *            write one step (lib/blog/save-rules.ts, lib/blog/admin-store.ts
 *            savePost against an in-memory table).
 * ROUTES     the snippet routes and the preview are admin checked and
 *            noindex; the preview token is signed and runs out.
 *
 * Run with:  npm run test:push
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs"
import { join } from "node:path"

import { stripComments } from "./_source"
import { safeHref, safeMediaUrl, sanitizeBlocks, sanitizeInlineHtml, uniqueAnchors } from "@/lib/blog/sanitize"
import { detectEmbedProvider, embedFrameSrc, parseChapter, youtubeIdFrom } from "@/lib/blog/embed"
import { isPostLive, liveDateFilter, postStatus } from "@/lib/blog/schedule"
import { followBlogRedirect, isBlogSlug } from "@/lib/blog/redirects"
import { REVISION_CAP, isStaleSave, postVersion, revisionsToPrune, slugChangePlan } from "@/lib/blog/save-rules"
import { editorStateFromRow, liveColumns, metaFromRow, normalizeMeta, readTimeFor, slugify } from "@/lib/blog/editor-model"
import { signPreviewToken, verifyPreviewToken } from "@/lib/blog/preview-token"
import { savePost, type SaveResult, type Supa } from "@/lib/blog/admin-store"

type Refused = Extract<SaveResult, { ok: false }>
import { blocksFromPlainText, pastedUrl } from "@/lib/blog/paste"

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
    console.log(`  FAIL  ${name}${detail !== undefined ? `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`)
  }
}
const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8")
const code = (f: string) => stripComments(read(f))

async function main() {
  /* ── The sanitiser ───────────────────────────────────────────────────── */
  console.log("\nWhat a post may carry as HTML (lib/blog/sanitize.ts)\n")
  {
    const s = sanitizeInlineHtml
    check("the inline tags stay", s("<b>a</b> <i>b</i> <u>c</u> <s>d</s> <code>e</code> f<br>g") === "<b>a</b> <i>b</i> <u>c</u> <s>d</s> <code>e</code> f<br>g", s("<b>a</b> <i>b</i> <u>c</u> <s>d</s> <code>e</code> f<br>g"))
    check("strong, em, strike and del fold into b, i and s", s("<strong>a</strong><em>b</em><strike>c</strike><del>d</del>") === "<b>a</b><i>b</i><s>c</s><s>d</s>")
    check("script and style go with what is in them", s('a<script>alert(1)</script>b<style>p{}</style>c<iframe src="x"></iframe>d') === "abcd", s('a<script>alert(1)</script>b<style>p{}</style>c'))
    check("any other tag is unwrapped, its words kept", s('<span style="color:red" class="x">red</span> <font>f</font>') === "red f")
    check("attributes go: no on*, no style, no class", !/onclick|onerror|style|class/i.test(s('<b onclick="x()" style="a" class="c">t</b><img src=x onerror=alert(1)>')))
    check("an img is not inline HTML at all", !/img/i.test(s('<img src="x.png" onerror="alert(1)">t')))
    check("a link keeps its address", s('<a href="https://storelib.com/pricing">p</a>') === '<a href="https://storelib.com/pricing">p</a>')
    check("a site path, a fragment and mailto are links", s('<a href="/pricing">a</a><a href="#x">b</a><a href="mailto:a@b.co">c</a>') === '<a href="/pricing">a</a><a href="#x">b</a><a href="mailto:a@b.co">c</a>')
    check("javascript: loses its link and keeps its words", s('<a href="javascript:alert(1)">click</a>') === "click", s('<a href="javascript:alert(1)">click</a>'))
    check("  however it is spelled", ["JaVaScRiPt:alert(1)", " javascript:alert(1)", "java\tscript:alert(1)", "jav&#x61;script:alert(1)", "&#106;avascript:alert(1)", "javascript&colon;alert(1)"].every((h) => !/href/.test(s(`<a href="${h}">x</a>`))))
    check("data:, vbscript: and file: lose theirs too", ["data:text/html,<script>alert(1)</script>", "vbscript:msgbox", "file:///etc/passwd"].every((h) => !/href/.test(s(`<a href="${h}">x</a>`))))
    check("a protocol-relative address is refused", !/href/.test(s('<a href="//evil.example/x">x</a>')))
    check('target="_blank" brings rel="noopener noreferrer"', s('<a href="https://x.com" target="_blank">x</a>') === '<a href="https://x.com" target="_blank" rel="noopener noreferrer">x</a>')
    check("  and any other target is dropped", s('<a href="https://x.com" target="_top">x</a>') === '<a href="https://x.com">x</a>')
    check("nofollow, sponsored and ugc are kept on rel; nothing else is", s('<a href="https://x.com" rel="sponsored evil">x</a>') === '<a href="https://x.com" rel="sponsored">x</a>')
    check("an attribute cannot break out of its quotes", !/"\s*onmouseover/.test(s('<a href="https://x.com/&quot; onmouseover=&quot;alert(1)">x</a>')) && s('<a href=\'https://x.com/"x\'>x</a>').includes('href="https://x.com/&quot;x"'))
    check("no link inside a link", (s('<a href="/a">1<a href="/b">2</a>3</a>').match(/<a /g) ?? []).length === 1)
    check("unclosed tags are closed, in order", s("<b><i>x") === "<b><i>x</i></b>")
    check("a stray closing tag is dropped", s("x</b></i>y") === "xy")
    check("overlapping tags come out nested", s("<b>1<i>2</b>3</i>") === "<b>1<i>2</i></b>3")
    check("stray < > & in the text are escaped, entities kept", s("a < b && c > d &amp; &eacute; &#169;") === "a &lt; b &amp;&amp; c &gt; d &amp; &eacute; &#169;")
    check("comments and doctypes vanish", s("a<!-- <script>x</script> -->b<!DOCTYPE html>c") === "abc")
    check("an unterminated tag is text, not markup", s("a <b onclick=") === "a &lt;b onclick=")
    check("a line of tags and spaces is empty", s("<b> </b><br>") === "" && s("") === "" && s(null) === "")
    check("the output is a fixed point", (() => {
      const nasty = '<p>Hi <span style="font-weight:700">there</span> <a href="javascript:x">j</a> <a href="https://a.b" target="_blank">ok</a><script>bad()</script> 1 < 2</p>'
      const once = s(nasty)
      return s(once) === once
    })())
    check("safeHref: http(s), mailto, tel, paths; a bare host gets https", safeHref("https://a.b/c") === "https://a.b/c" && safeHref("tel:+40") === "tel:+40" && safeHref("/x") === "/x" && safeHref("storelib.com/pricing") === "https://storelib.com/pricing" && safeHref("javascript:1") === null && safeHref("") === null)
    check("safeMediaUrl: http(s) and site paths only", safeMediaUrl("https://cdn.x/a.png") === "https://cdn.x/a.png" && safeMediaUrl("/images/a.png") === "/images/a.png" && safeMediaUrl("javascript:1") === null && safeMediaUrl("data:image/png;base64,AA") === null && safeMediaUrl('https://x/"onerror=1') === null)

    const blocks = sanitizeBlocks([
      { id: "a", type: "p", html: '<b>x</b><script>y</script>' },
      { id: "b", type: "nope", html: "z" },
      { id: "c", type: "img", url: "javascript:alert(1)", alt: "<b>alt</b>" },
      { id: "d", type: "embed", url: "https://evil.example/frame" },
      { id: "e", type: "embed", url: "https://vimeo.com/76979871", provider: "loom" },
      { id: "f", type: "youtube", videoId: "https://youtu.be/dQw4w9WgXcQ?t=3" },
      { id: "g", type: "cta", url: "javascript:x", label: "Go" },
      { id: "h", type: "callout", tone: "danger", html: "n" },
      { id: "i", type: "ul", items: ["<a href='vbscript:x'>a</a>", "<i>b</i>"] },
      { id: "j", type: "snippet", snippetId: "not-a-uuid" },
      { id: "a", type: "h2", html: "dup id" },
      "garbage",
    ])
    check("blocks: unknown types and junk dropped", blocks.length === 10 && !blocks.some((b) => (b.type as string) === "nope"))
    check("blocks: inline HTML sanitized", blocks[0].html === "<b>x</b>")
    check("blocks: a picture's bad address emptied, its alt plain text", blocks[1].url === "" && blocks[1].alt === "alt")
    check("blocks: an embed from no provider has no provider (drawn as a link)", blocks[2].provider === undefined && embedFrameSrc(blocks[2]) === null)
    check("blocks: an embed's provider comes from its address, never from the browser", blocks[3].provider === "vimeo")
    check("blocks: a YouTube address becomes its id", blocks[4].videoId === "dQw4w9WgXcQ")
    check("blocks: a CTA's javascript: address emptied", blocks[5].url === "")
    check("blocks: a callout tone not on the list is a note", blocks[6].tone === "note")
    check("blocks: list items sanitized", blocks[7].items?.[0] === "a" && blocks[7].items?.[1] === "<i>b</i>")
    check("blocks: a snippet id that is not one is emptied", blocks[8].snippetId === "")
    check("blocks: two blocks never share an id", new Set(blocks.map((b) => b.id)).size === blocks.length)
    check("headings get unique anchors", (() => {
      const u = uniqueAnchors([{ id: "1", type: "h2", html: "Fees" }, { id: "2", type: "h2", html: "Fees" }, { id: "3", type: "h3", html: "Fées!" }])
      return u[0].anchor === undefined && u[1].anchor === "fees-2" && u[2].anchor === "fees-3"
    })())
    check("the save routes run every field through it", /normalizeBlocks\(body\.blocks\)/.test(code("lib/blog/admin-store.ts")) && /normalizeMeta\(body\.meta/.test(code("lib/blog/admin-store.ts")) && /uniqueAnchors\(sanitizeBlocks\(input\)\)/.test(code("lib/blog/editor-model.ts")))
    check("snippets are sanitized on save too", /normalizeBlocks\(body\?\.blocks\)/.test(code("app/api/admin/blog/snippets/route.ts")) && /normalizeBlocks\(body\.blocks\)/.test(code("app/api/admin/blog/snippets/[id]/route.ts")))
    check("the sanitiser is pure: no DOM, no import but the block types and embeds", !/document\.|window\.|from "(?!\.\/(blocks|embed)")/.test(code("lib/blog/sanitize.ts")))
  }

  /* ── Embeds, chapters, slugs ─────────────────────────────────────────── */
  console.log("\nEmbeds, chapters and slugs\n")
  {
    check("YouTube ids from every address shape", ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://youtu.be/dQw4w9WgXcQ", "https://www.youtube.com/embed/dQw4w9WgXcQ", "https://www.youtube.com/shorts/dQw4w9WgXcQ", "https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=1", "dQw4w9WgXcQ"].every((u) => youtubeIdFrom(u) === "dQw4w9WgXcQ"))
    check("  and none from somewhere else", youtubeIdFrom("https://evil.example/watch?v=dQw4w9WgXcQ") === null && youtubeIdFrom("not a video") === null)
    check("providers on the list are found", detectEmbedProvider("https://vimeo.com/76979871") === "vimeo" && detectEmbedProvider("https://www.loom.com/share/0123456789abcdef0123") === "loom" && detectEmbedProvider("https://x.com/storelib/status/1234567890") === "x" && detectEmbedProvider("https://open.spotify.com/episode/4rOoJ6Egrf8K2IrywzwOMk") === "spotify" && detectEmbedProvider("https://www.figma.com/design/abcdefghij1234/Name") === "figma" && detectEmbedProvider("https://codepen.io/team/pen/abcDEF") === "codepen")
    check("a lookalike host is not a provider", detectEmbedProvider("https://vimeo.com.evil.example/76979871") === null && detectEmbedProvider("https://evilvimeo.com/76979871") === null)
    check("the frame's address is built, not copied", embedFrameSrc({ url: "https://vimeo.com/76979871?x=<script>", provider: "vimeo" }) === "https://player.vimeo.com/video/76979871")
    check("a chapter line is m:ss Title", JSON.stringify(parseChapter("1:30 Setting up")) === JSON.stringify({ seconds: 90, title: "Setting up" }) && parseChapter("1:02:03 Long")?.seconds === 3723 && parseChapter("intro") === null)
    check("slugify: ASCII, hyphens, 80 characters", slugify("Ça va? Pricing & Fees — 2026!") === "ca-va-pricing-and-fees-2026" && slugify("x".repeat(200)).length === 80)
    check("read time from the words", readTimeFor([{ id: "a", type: "p", html: "word ".repeat(460) }]) === "2 min read" && readTimeFor([]) === "1 min read")
    check("a paste of plain text is paragraphs with line breaks", JSON.stringify(blocksFromPlainText("one\ntwo\n\nthree <b>", () => "x").map((b) => b.html)) === JSON.stringify(["one<br>two", "three &lt;b&gt;"]))
    check("a pasted address on its own is recognised", pastedUrl(" https://youtu.be/dQw4w9WgXcQ ") === "https://youtu.be/dQw4w9WgXcQ" && pastedUrl("see https://x.com") === null)
  }

  /* ── When a post is live ─────────────────────────────────────────────── */
  console.log("\nA post is live when it is published and its date has come (lib/blog/schedule.ts)\n")
  {
    const now = Date.parse("2026-10-31T12:00:00Z")
    check("published, date passed: live", isPostLive({ is_published: true, published_at: "2026-10-31T11:59:59Z" }, now) && postStatus({ is_published: true, published_at: "2026-10-01T00:00:00Z" }, now) === "published")
    check("published, date exactly now: live", isPostLive({ is_published: true, published_at: "2026-10-31T12:00:00Z" }, now))
    check("published, date to come: scheduled, not live", !isPostLive({ is_published: true, published_at: "2026-10-31T12:00:01Z" }, now) && postStatus({ is_published: true, published_at: "2026-11-02T09:00:00Z" }, now) === "scheduled")
    check("not published: never live, whatever the date", !isPostLive({ is_published: false, published_at: "2020-01-01T00:00:00Z" }, now) && postStatus({ is_published: false, published_at: null }, now) === "draft")
    check("a published row with no date is live, as it always was", isPostLive({ is_published: true, published_at: null }, now))
    check("the filter says the same to PostgREST", liveDateFilter(now) === "published_at.is.null,published_at.lte.2026-10-31T12:00:00.000Z")
    const post = code("lib/blog/post.ts")
    check("the post page's read asks it", /\.eq\("is_published", true\)\s*\.or\(liveDateFilter\(\)\)/.test(post))
    check("  and hands no draft column to the page", /for \(const c of DRAFT_COLUMNS\) delete/.test(post) && /"draft_content", "draft_meta", "draft_saved_at"/.test(post))
    check("the lists and the feed ask it (lib/blog/read.ts, read by /blog/rss.xml)", /\.eq\("is_published", true\)\.or\(liveDateFilter\(\)\)/.test(code("lib/blog/read.ts")) && /readBlogPosts\(\)/.test(code("app/(storelib)/(marketing)/blog/rss.xml/route.ts")))
    check("the sitemap asks it", /\.eq\("is_published", true\)\.or\(liveDateFilter\(\)\)\.order\("slug"\)/.test(code("lib/seo/sitemaps.ts")))
    check("  and leaves out noindex posts and posts canonical elsewhere", /blogSlugsNotInSitemap\(\)/.test(code("lib/seo/sitemaps.ts")) && /noindex\.eq\.true,canonical_url\.not\.is\.null/.test(code("lib/blog/read.ts")))
    check("the cron that runs every ten minutes rebuilds and announces a post whose hour came", /announceScheduledBlogPosts\(\)/.test(code("app/api/cron/seo-index/route.ts")) && /"\*\/10 \* \* \* \*"/.test(read("vercel.json")) && /\.lte\("published_at"/.test(code("lib/blog/went-live.ts")))
    check("a scheduled post is not announced when it is saved", /if \(isPostLive\(data\)\) after\(/.test(code("app/api/admin/blog/posts/route.ts")) && /if \(isPostLive\(data\) \|\| isPostLive\(before\)\)/.test(code("app/api/admin/blog/posts/[id]/route.ts")))
    const sql = read("supabase/sql/run-now/345_blog_editor.sql")
    check("the public key's own policy says the same", /USING \(is_published = true AND \(published_at IS NULL OR published_at <= now\(\)\)\)/.test(sql))
  }

  /* ── Old slugs ───────────────────────────────────────────────────────── */
  console.log("\nAn old slug is a 308 to the post's new one (lib/blog/redirects.ts)\n")
  {
    const table: Record<string, string> = { "old-name": "new-name", "older-name": "old-name", "loop-a": "loop-b", "loop-b": "loop-a", "bad-target": "Not A Slug!" }
    let asked = 0
    const lookup = async (s: string) => {
      asked++
      return table[s] ?? null
    }
    check("one hop", (await followBlogRedirect("old-name", lookup)) === "new-name")
    check("a chain is followed to its end", (await followBlogRedirect("older-name", lookup)) === "new-name")
    check("a slug that never moved is no redirect", (await followBlogRedirect("never-moved", lookup)) === null)
    check("a loop is no redirect", (await followBlogRedirect("loop-a", lookup)) === null)
    check("a target that is not a slug is not followed", (await followBlogRedirect("bad-target", lookup)) === null)
    asked = 0
    check("a slug that is not one is not even looked up", (await followBlogRedirect("../etc", lookup)) === null && asked === 0)
    check("five hops at most", await (async () => {
      const long: Record<string, string> = { a0: "a1", a1: "a2", a2: "a3", a3: "a4", a4: "a5", a5: "a6", a6: "a7" }
      return (await followBlogRedirect("a0", async (s) => long[s] ?? null)) === "a5"
    })())
    check("slugs: lower case, digits, single hyphens inside", isBlogSlug("how-to-2026") && !isBlogSlug("-x") && !isBlogSlug("A") && !isBlogSlug("a/b"))
    const plan = slugChangePlan("old", "new")
    check("a rename records old to new, repoints anything that pointed at old, and frees new", JSON.stringify(plan) === JSON.stringify({ upsert: { from_slug: "old", to_slug: "new" }, repointFrom: "old", deleteFrom: "new" }) && slugChangePlan("same", "same") === null && slugChangePlan("", "x") === null)
    const post = code("lib/blog/post.ts")
    check("blogRedirectFor is exported from lib/blog/post.ts and reads blog_redirects", /export const blogRedirectFor = cache\(async \(slug: string\)/.test(post) && /\.from\("blog_redirects"\)\.select\("to_slug"\)\.eq\("from_slug", from\)/.test(post) && /followBlogRedirect\(slug,/.test(post))
    const layout = code("app/(storelib)/(marketing)/blog/[slug]/layout.tsx")
    check("the post's layout asks it only for a slug that is not a post, and answers 308", /const movedTo = \(await blogPostExists\(slug\)\) \? null : await blogRedirectFor\(slug\)/.test(layout) && /if \(movedTo\) permanentRedirect\(`\/blog\/\$\{movedTo\}`\)/.test(layout))
    check("  before the 404 it gave before", layout.indexOf("permanentRedirect(") < layout.indexOf("notFound()") && /if \(!\(await blogPostExists\(slug\)\)\) notFound\(\)/.test(layout))
    check("a live post's slug change writes the redirect, a draft's does not", /if \(full && liveChanged && wasLive && row\.slug !== oldSlug\) await recordSlugChange/.test(code("lib/blog/admin-store.ts")))
  }

  /* ── Two tabs ────────────────────────────────────────────────────────── */
  console.log("\nA save from an old version is a 409 (lib/blog/save-rules.ts)\n")
  {
    const row = { draft_saved_at: "2026-10-31T12:00:00.123456+00:00", updated_at: "2026-10-30T09:00:00+00:00" }
    check("the version is draft_saved_at, else updated_at", postVersion(row) === row.draft_saved_at && postVersion({ updated_at: "u" }) === "u" && postVersion(null) === null)
    check("the same version saves", !isStaleSave(row.draft_saved_at, row))
    check("an older version is stale", isStaleSave("2026-10-31T11:59:00+00:00", row))
    check("a microsecond apart is a different save", isStaleSave("2026-10-31T12:00:00.123455+00:00", row))
    check("no version at all is stale", isStaleSave(null, row) && isStaleSave(undefined, row))
    check("Keep mine (force) is the only way past", !isStaleSave("old", row, true))
    check("a row with no version yet takes any save", !isStaleSave(null, {}))
    check("about fifty revisions are kept, the oldest go", REVISION_CAP === 50 && revisionsToPrune(Array.from({ length: 53 }, (_, i) => `r${i}`)).join() === "r50,r51,r52" && revisionsToPrune(["a", "b"]).length === 0)

    /* savePost, end to end, against one row in memory. */
    const db = fakeBlogTable({
      id: "11111111-1111-4111-8111-111111111111",
      slug: "hello",
      title: "Hello",
      excerpt: "",
      content: [{ id: "p1", type: "p", html: "Live words" }],
      category: "Growth",
      read_time: "1 min read",
      author_name: "Storelib Team",
      is_published: true,
      published_at: "2026-01-01T00:00:00+00:00",
      updated_at: "2026-10-01T00:00:00.000001+00:00",
      draft_saved_at: "2026-10-31T10:00:00.000001+00:00",
      draft_content: null,
      draft_meta: null,
    })
    const id = "11111111-1111-4111-8111-111111111111"
    const v1 = "2026-10-31T10:00:00.000001+00:00"
    const meta = { ...metaFromRow(db.row), title: "Hello again" }
    const first = await savePost(db.client, id, { action: "autosave", version: v1, meta, blocks: [{ id: "p1", type: "p", html: "Draft words <script>x</script>" }] }, true)
    check("an autosave on a live post goes to the draft copy, not the live columns", first.ok && db.row.title === "Hello" && (db.row.content as { html: string }[])[0].html === "Live words" && (db.row.draft_meta as { title: string }).title === "Hello again", first)
    check("  sanitized on the way in", (db.row.draft_content as { html: string }[])[0].html === "Draft words ")
    check("  and it moves the version", first.ok && db.row.draft_saved_at !== v1)
    const stale = (await savePost(db.client, id, { action: "autosave", version: v1, meta: { ...meta, title: "Other tab" }, blocks: [] }, true)) as Refused
    check("a second tab still holding the first version gets 409 stale, with the row as it is now", !stale.ok && stale.status === 409 && stale.code === "stale" && stale.current?.meta.title === "Hello again", stale)
    check("  and nothing is written", (db.row.draft_meta as { title: string }).title === "Hello again" && db.updates === 1)
    db.raceNextUpdate = true
    const raced = (await savePost(db.client, id, { action: "autosave", version: postVersion(db.row), meta, blocks: [] }, true)) as Refused
    check("two saves at once from one version: the one that lands second finds no row and is 409", !raced.ok && raced.status === 409 && raced.code === "stale")
    check("  because the update names the version it read", db.lastUpdateFilters.some((f) => f[0] === "draft_saved_at"))
    const forced = await savePost(db.client, id, { action: "autosave", version: "anything", meta: { ...meta, title: "Mine" }, blocks: [], force: true }, true)
    check("Keep mine writes over it", forced.ok && (db.row.draft_meta as { title: string }).title === "Mine")
    const update = await savePost(db.client, id, { action: "update", version: postVersion(db.row), meta: { ...meta, title: "Live now", slug: "hello-world" }, blocks: [{ id: "p1", type: "p", html: "New live words" }] }, true)
    check("Update makes the draft live and clears it", update.ok && db.row.title === "Live now" && db.row.draft_content === null && db.row.draft_meta === null, update.ok ? db.row : update)
    check("  and the old slug is recorded as a redirect", JSON.stringify(db.redirects) === JSON.stringify([{ from_slug: "hello", to_slug: "hello-world", post_id: id }]), db.redirects)
    check("  and a revision is kept", db.revisions.length === 1 && db.revisions[0].kind === "update")
    const draftSave = editorStateFromRow(db.row)
    check("the editor opens the live post when there is no draft", draftSave.meta.title === "Live now" && !draftSave.hasDraft)
    const route = code("app/api/admin/blog/posts/[id]/route.ts")
    check("the route answers the 409 with its code and the current row", /if \(!saved\.ok\) return blogJson\(\{ error: saved\.error, code: saved\.code, current: saved\.current \}, saved\.status\)/.test(route))
    check("the editor sends the version it was given and stops on a stale 409", /version: versionRef\.current/.test(code("app/(storelib)/admin/blog/posts/_editor-client.tsx")) && /res\.status === 409 && data\.code === "stale"/.test(code("app/(storelib)/admin/blog/posts/_editor-client.tsx")))
    check("the editor saves 1.5 s after typing stops, and warns on leaving with something unsaved", /const AUTOSAVE_MS = 1500/.test(code("app/(storelib)/admin/blog/posts/_editor-client.tsx")) && /addEventListener\("beforeunload"/.test(code("app/(storelib)/admin/blog/posts/_editor-client.tsx")))
    check("before 345, only the columns the table always had are written", Object.keys(liveColumns(normalizeMeta({ title: "t" }), [], false)).every((k) => ["title", "slug", "excerpt", "content", "category", "read_time", "author_name", "cover_image_url", "seo_title", "seo_description", "seo_keywords"].includes(k)))
  }

  /* ── The routes ──────────────────────────────────────────────────────── */
  console.log("\nThe snippet routes and the preview: admin checked, never indexed\n")
  {
    for (const f of ["app/api/admin/blog/snippets/route.ts", "app/api/admin/blog/snippets/[id]/route.ts", "app/api/admin/blog/posts/[id]/preview/route.ts"]) {
      const src = code(f)
      const handlers = (src.match(/export async function (GET|POST|PATCH|DELETE)/g) ?? []).length
      const gates = (src.match(/if \(!\(await isAdminAuthenticated\(\)\)\) \{\s*return blogJson\(\{ error: "Unauthorized" \}, 401\)/g) ?? []).length
      check(`${f}: every handler asks for the admin session first`, handlers > 0 && gates === handlers, { handlers, gates })
      check(`${f}: answers through blogJson, noindex and no-store`, /blogJson\(/.test(src) && !/NextResponse\.json\(/.test(src))
    }
    const http = code("lib/blog/admin-http.ts")
    check("blogJson says noindex and no-store on every answer", /"X-Robots-Tag": "noindex, nofollow"/.test(http) && /"Cache-Control": "no-store"/.test(http) && /headers: ADMIN_BLOG_HEADERS/.test(http))
    const preview = code("app/(storelib)/admin/blog/preview/[token]/page.tsx")
    check("the preview page is noindex, nofollow, nocache", /robots: \{ index: false, follow: false, nocache: true/.test(preview))
    check("  is drawn per request", /export const dynamic = "force-dynamic"/.test(preview))
    check("  opens only for a token this server signed, else 404", /const postId = verifyPreviewToken\(decodeURIComponent\(token\)\)\s*if \(!postId\) notFound\(\)/.test(preview))
    check("  and asks for the admin session (for the way back to the editor)", /await isAdminAuthenticated\(\)/.test(preview))
    check("  under /admin, which robots.txt disallows and no sitemap lists", !/admin\/blog\/preview/.test(read("lib/seo/sitemaps.ts")) && /"admin"/.test(read("lib/seo/indexing.ts")))
    process.env.BLOG_ADMIN_SECRET = "a-test-signing-key-long-enough-xyz"
    const pid = "22222222-2222-4222-8222-222222222222"
    const t = signPreviewToken(pid, Date.parse("2026-10-31T00:00:00Z"))!
    check("a preview token opens its post", verifyPreviewToken(t, Date.parse("2026-11-01T00:00:00Z")) === pid)
    check("  for seven days", verifyPreviewToken(t, Date.parse("2026-11-08T00:00:01Z")) === null)
    check("  and not with its post id changed", verifyPreviewToken(t.replace(pid, "33333333-3333-4333-8333-333333333333"), Date.parse("2026-11-01T00:00:00Z")) === null)
    check("  nor its expiry moved", verifyPreviewToken(t.replace(/\.([0-9a-z]+)\./, (_, e) => `.${(parseInt(e, 36) + 1).toString(36)}.`), Date.parse("2026-11-01T00:00:00Z")) === null)
    process.env.BLOG_ADMIN_SECRET = "another-test-signing-key-long-enough"
    check("  and a new key ends every one", verifyPreviewToken(t, Date.parse("2026-11-01T00:00:00Z")) === null)
    delete process.env.BLOG_ADMIN_SECRET
    check("no key, no token", signPreviewToken(pid) === null || Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY))

    /* Every new route under app/api/admin/blog asks first (tests/admin-routes.test.ts walks them all; this names the new ones). */
    const routes = walk("app/api/admin/blog").filter((f) => f.endsWith("route.ts") && !f.endsWith("auth/route.ts"))
    const ungated = routes.filter((f) => {
      const src = code(f)
      const handlers = (src.match(/export async function (GET|POST|PATCH|DELETE|PUT)/g) ?? []).length
      return (src.match(/if \(!\(await isAdminAuthenticated\(\)\)\)/g) ?? []).length < handlers
    })
    check("every blog admin route asks on every method", routes.length >= 14 && ungated.length === 0, ungated)
  }

  /* ── SQL part 345 and running without it ─────────────────────────────── */
  console.log("\nSQL part 345, and the admin without it\n")
  {
    const sql = read("supabase/sql/run-now/345_blog_editor.sql")
    check("byte-identical migration copy", existsSync("supabase/migrations/20271103_blog_editor.sql") && read("supabase/migrations/20271103_blog_editor.sql") === sql)
    check("the tables", ["blog_categories", "blog_authors", "blog_post_revisions", "blog_redirects", "blog_snippets"].every((t) => sql.includes(`CREATE TABLE IF NOT EXISTS public.${t}`)))
    check("the columns", ["draft_content jsonb", "draft_meta jsonb", "draft_saved_at timestamptz", "canonical_url text", "og_image_url text", "noindex boolean", "tags text[]", "author_id uuid"].every((c) => sql.includes(c)))
    check("the eight categories seeded", ["getting-started", "creator-tips", "growth", "strategy", "product-updates", "case-studies", "tutorials", "announcements"].every((s) => sql.includes(`('${s}'`)))
    check("authors seeded from the bylines, and linked", /INSERT INTO public\.blog_authors[\s\S]*author_name[\s\S]*ON CONFLICT \(slug\) DO NOTHING/.test(sql) && /UPDATE public\.blog_posts p SET author_id = a\.id/.test(sql))
    check("row level security on every table", ["blog_categories", "blog_authors", "blog_post_revisions", "blog_redirects", "blog_snippets", "blog_posts"].every((t) => sql.includes(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY`)))
    check("revisions and snippets are server only", /REVOKE ALL ON public\.blog_post_revisions, public\.blog_snippets FROM anon, authenticated/.test(sql) && !/POLICY [^;]*blog_(post_revisions|snippets)/.test(sql))
    check("the public key never reads the draft columns", /column_name NOT IN \('draft_content', 'draft_meta', 'draft_saved_at'\)/.test(sql) && /REVOKE SELECT ON public\.blog_posts FROM anon, authenticated/.test(sql))
    check("a view or a draft save no longer moves updated_at", /ARRAY\['views', 'updated_at', 'draft_content', 'draft_meta', 'draft_saved_at'\]/.test(sql))
    check("one statement per line, idempotent", sql.trim().split("\n").slice(1).every((l) => /;\s*$/.test(l)) && !/CREATE TABLE (?!IF NOT EXISTS)/.test(sql) && !/CREATE INDEX (?!IF NOT EXISTS)/.test(sql))
    check("listed in the README and checked after", /`345_blog_editor\.sql`/.test(read("supabase/sql/run-now/README.md")) && /as p345_blog_editor/.test(read("supabase/sql/run-now/99_check_after.sql")))
    const store = code("lib/blog/admin-store.ts")
    check("the admin looks for 345 and works without it", /export async function blogSchema/.test(store) && /isMissingSchema\(col\.error\)/.test(store) && /liveColumns\(meta, blocks, full\)/.test(store))
    check("and says which part turns a feature on", /Run SQL part 345/.test(store) && /note345/.test(code("app/(storelib)/admin/blog/posts/_editor-client.tsx")))
  }

  /* ── The editor ──────────────────────────────────────────────────────── */
  console.log("\nThe editor writes lib/blog/blocks.ts\n")
  {
    const ed = code("components/admin/blog-editor.tsx")
    check("its Block is the shared one", /import type \{ Block, BlockType \} from "@\/lib\/blog\/blocks"/.test(ed) && !/export (interface|type) Block\b/.test(ed))
    check("every block type can be inserted from the / menu", ["p", "h2", "h3", "ul", "ol", "quote", "callout", "code", "table", "hr", "img", "youtube", "video", "embed", "cta", "snippet"].every((t) => new RegExp(`type: "${t}", label:`).test(ed)))
    check("the keyboard: Enter, Backspace, Cmd B I K, Alt arrows", /e\.key === "Enter" && !e\.shiftKey/.test(ed) && /e\.key === "Backspace" && caretAtEdge\(el, "start"\)/.test(ed) && /k === "b" \|\| k === "i" \|\| k === "u"/.test(ed) && /k === "k"/.test(ed) && /e\.altKey && !e\.metaKey && !e\.ctrlKey && \(e\.key === "ArrowUp" \|\| e\.key === "ArrowDown"\)/.test(ed))
    check("a paste is cleaned (lib/blog/paste.ts) and a lone address becomes a link or a block", /blocksFromHtmlDocument\(new DOMParser\(\)\.parseFromString\(html, "text\/html"\)/.test(ed) && /youtubeIdFrom\(url\)/.test(ed) && /createLink/.test(ed))
    check("Google Docs' outer bold is not bold", /font-weight/.test(code("lib/blog/paste.ts")) && /if \(w === "normal" \|\| w === "lighter"\) return false/.test(code("lib/blog/paste.ts")))
    check("alt text is asked for on every picture", /altMissing \? "Required" : null/.test(ed))
    check("pictures go through the existing upload route", /fetch\("\/api\/admin\/blog\/upload"/.test(code("app/(storelib)/admin/blog/posts/_editor-client.tsx")))
    check("no client file imports a server module", ["components/admin/blog-editor.tsx", "app/(storelib)/admin/blog/posts/_editor-client.tsx", "app/(storelib)/admin/blog/_list-client.tsx", "app/(storelib)/admin/blog/library/_library-client.tsx"].every((f) => !/^import (?!type)[^\n]*from "@\/lib\/(supabase|blog\/(admin-store|post|read|went-live|admin-http))"/m.test(read(f))))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

/**
 * blog_posts, blog_redirects and blog_post_revisions in memory, with the
 * part of the query builder savePost uses: select, eq, is, neq, like, in,
 * order, range, limit, maybeSingle, single, update, insert, upsert, delete.
 * Every update is a compare-and-set on its filters, as PostgREST's is.
 */
function fakeBlogTable(initial: Record<string, unknown>) {
  const state = {
    row: { ...initial } as Record<string, unknown>,
    redirects: [] as Record<string, unknown>[],
    revisions: [] as Record<string, unknown>[],
    updates: 0,
    raceNextUpdate: false,
    lastUpdateFilters: [] as [string, unknown][],
    client: null as unknown as Supa,
  }
  let clock = Date.parse("2026-10-31T11:00:00Z")
  const stamp = () => new Date((clock += 1000)).toISOString().replace("Z", "123+00:00")
  const builder = (table: string) => {
    let op: "select" | "update" | "insert" | "upsert" | "delete" = "select"
    let payload: Record<string, unknown> | Record<string, unknown>[] | null = null
    const filters: [string, string, unknown][] = []
    const rows = () => (table === "blog_posts" ? [state.row] : table === "blog_redirects" ? state.redirects : state.revisions)
    const matches = (r: Record<string, unknown>) =>
      filters.every(([c, k, v]) => (k === "eq" ? r[c] === v : k === "is" ? r[c] === v : k === "neq" ? r[c] !== v : k === "in" ? (v as unknown[]).includes(r[c]) : k === "like" ? String(r[c]).startsWith(String(v).replace(/%$/, "")) : true))
    const exec = () => {
      if (op === "select") return { data: rows().filter(matches).map((r) => ({ ...r })), error: null }
      if (op === "update") {
        if (table === "blog_posts") {
          state.lastUpdateFilters = filters.map(([c, , v]) => [c, v])
          if (state.raceNextUpdate) {
            state.raceNextUpdate = false
            state.row.draft_saved_at = stamp()
          }
          if (!matches(state.row)) return { data: [], error: null }
          state.updates++
          Object.assign(state.row, payload, { updated_at: stamp() })
          return { data: [{ ...state.row }], error: null }
        }
        const hit = rows().filter(matches)
        for (const r of hit) Object.assign(r, payload)
        return { data: hit, error: null }
      }
      if (op === "delete") {
        const keep = rows().filter((r) => !matches(r))
        if (table === "blog_redirects") state.redirects = keep
        else if (table === "blog_post_revisions") state.revisions = keep
        return { data: null, error: null }
      }
      const list = Array.isArray(payload) ? payload : [payload!]
      for (const p of list) {
        if (table === "blog_redirects") {
          state.redirects = state.redirects.filter((r) => r.from_slug !== p.from_slug)
          state.redirects.push({ ...p })
        } else if (table === "blog_post_revisions") state.revisions.unshift({ id: `rev${state.revisions.length}`, created_at: stamp(), ...p })
      }
      return { data: list, error: null }
    }
    const b: Record<string, unknown> = {
      select: () => b,
      eq: (c: string, v: unknown) => (filters.push([c, "eq", v]), b),
      is: (c: string, v: unknown) => (filters.push([c, "is", v]), b),
      neq: (c: string, v: unknown) => (filters.push([c, "neq", v]), b),
      in: (c: string, v: unknown) => (filters.push([c, "in", v]), b),
      like: (c: string, v: unknown) => (filters.push([c, "like", v]), b),
      order: () => b,
      range: () => b,
      limit: () => b,
      update: (p: Record<string, unknown>) => ((op = "update"), (payload = p), b),
      insert: (p: Record<string, unknown>) => ((op = "insert"), (payload = p), b),
      upsert: (p: Record<string, unknown>) => ((op = "upsert"), (payload = p), b),
      delete: () => ((op = "delete"), b),
      maybeSingle: async () => {
        const r = exec()
        return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error }
      },
      single: async () => {
        const r = exec()
        return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error }
      },
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(exec()).then(res, rej),
    }
    return b
  }
  state.client = { from: builder } as unknown as Supa
  return state
}

main()
