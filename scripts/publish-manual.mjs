/**
 * ===========================================================================
 *  THE MANUAL, ONTO THE BLOG
 * ===========================================================================
 * docs/storelib-manual.md is the source. This turns it into the blocks the
 * blog renderer actually draws and publishes it, so the post and the manual
 * never drift: edit the markdown, run this, done.
 *
 * The block vocabulary here is read off app/(storelib)/(marketing)/blog/[slug]/page.tsx
 * and nothing else. An earlier attempt used `heading` and `text` blocks,
 * which that file has no case for, so the post went live as a title, a
 * handful of tables and nothing in between. If you add a block type to the
 * renderer, add it here.
 *
 *   node scripts/publish-manual.mjs --dry     write the payload, publish nothing
 *   node scripts/publish-manual.mjs           publish it
 *
 * The admin cookie comes from STORELIB_BLOG_TOKEN, or from the session token
 * in lib/admin-blog-auth.ts when that variable is not set.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const SOURCE = join(ROOT, "docs/storelib-manual.md")
const PAYLOAD = join(ROOT, "docs/blog/storelib-sections-manual.json")
const SITE = process.env.STORELIB_SITE ?? "https://storelib.com"
const SLUG = "storelib-sections-theme-language-documentation"

/** The eleven the renderer has a case for. Anything else renders as nothing. */
const RENDERED = new Set(["h2", "h3", "p", "quote", "hr", "img", "youtube", "table", "ul", "ol", "code"])

const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
const plain = (s) => s.replace(/`([^`]+)`/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1")
const rich = (s) =>
  escapeHtml(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")

export function blocksFrom(markdown) {
  const lines = markdown.split("\n")
  const blocks = []
  let para = []
  let list = []

  const flushPara = () => {
    const text = para.join(" ").trim()
    para = []
    if (text) blocks.push({ type: "p", html: rich(text) })
  }
  const flushList = () => {
    if (!list.length) return
    const ordered = /^\d+\./.test(list[0])
    blocks.push({ type: ordered ? "ol" : "ul", items: list.map((x) => plain(x.replace(/^(\d+\.|[-*])\s*/, ""))) })
    list = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.trim() === "---") { flushPara(); flushList(); blocks.push({ type: "hr" }); continue }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line)
    if (heading) {
      flushPara(); flushList()
      // The document's own title becomes the post's title, not a block in it.
      if (heading[1].length === 1) continue
      blocks.push({ type: heading[1].length === 2 ? "h2" : "h3", html: escapeHtml(plain(heading[2])) })
      continue
    }

    if (line.startsWith("```")) {
      flushPara(); flushList()
      const lang = line.slice(3).trim() || "code"
      const buf = []
      for (i++; i < lines.length && !lines[i].startsWith("```"); i++) buf.push(lines[i])
      blocks.push({ type: "code", lang, text: buf.join("\n") })
      continue
    }

    if (line.startsWith("|") && /^\|[\s:|-]+\|$/.test(lines[i + 1] ?? "")) {
      flushPara(); flushList()
      const headers = line.trim().replace(/^\||\|$/g, "").split("|").map((c) => plain(c.trim()))
      const rows = []
      for (i += 2; i < lines.length && lines[i].startsWith("|"); i++) {
        const cells = lines[i].trim().replace(/^\||\|$/g, "").split("|").map((c) => plain(c.trim()))
        while (cells.length < headers.length) cells.push("")
        rows.push(cells.slice(0, headers.length))
      }
      i--
      blocks.push({ type: "table", headers, rows })
      continue
    }

    if (/^\s*([-*]|\d+\.)\s+/.test(line)) { flushPara(); list.push(line.trim()); continue }
    if (!line.trim()) { flushPara(); flushList(); continue }
    // An indented line under a list item belongs to it.
    if (list.length && line.startsWith("  ")) { list[list.length - 1] += " " + line.trim(); continue }
    flushList()
    para.push(line.trim())
  }
  flushPara(); flushList()
  return blocks
}

const post = {
  title: "Storelib Sections and Theme Language: The Complete Documentation",
  slug: SLUG,
  excerpt:
    "How a Storelib site is built, end to end: the section file, the template language, the schema, settings resolution, colour schemes and text styles, scripts, packaging and the rules a section has to follow.",
  category: "Getting Started",
  read_time: "45 min read",
  author: "Storelib Team",
  seo_title: "Storelib Sections and Theme Language Documentation",
  seo_description:
    "The complete reference for building Storelib sections: the template language, schema, settings, colour schemes, typography tokens, scripts and packaging.",
  seo_keywords:
    "storelib sections, storelib theme, storelib website builder, storelib template language, storelib schema, how to build a storelib section, storelib documentation, storelib theme development, storelib color schemes, storelib blocks",
  is_published: true,
  content: blocksFrom(readFileSync(SOURCE, "utf8")),
}

const dropped = post.content.filter((b) => !RENDERED.has(b.type))
if (dropped.length) {
  console.error(`${dropped.length} block(s) the renderer would drop: ${[...new Set(dropped.map((b) => b.type))].join(", ")}`)
  process.exit(1)
}

mkdirSync(join(ROOT, "docs/blog"), { recursive: true })
writeFileSync(PAYLOAD, JSON.stringify(post, null, 2) + "\n")
const counts = post.content.reduce((a, b) => ({ ...a, [b.type]: (a[b.type] ?? 0) + 1 }), {})
console.log(`${post.content.length} blocks: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", ")}`)
console.log(`payload written to ${PAYLOAD}`)

if (process.argv.includes("--dry")) process.exit(0)

const token =
  process.env.STORELIB_BLOG_TOKEN ??
  /SESSION_TOKEN = "([^"]+)"/.exec(readFileSync(join(ROOT, "lib/admin-blog-auth.ts"), "utf8"))?.[1]
if (!token) { console.error("no admin token: set STORELIB_BLOG_TOKEN"); process.exit(1) }
const headers = { "Content-Type": "application/json", Cookie: `blog_admin=${token}` }

const list = await fetch(`${SITE}/api/admin/blog/posts`, { headers })
if (!list.ok) { console.error(`listing posts: ${list.status}`); process.exit(1) }
const existing = (await list.json()).find((p) => p.slug === SLUG)

const res = existing
  ? await fetch(`${SITE}/api/admin/blog/posts/${existing.id}`, { method: "PATCH", headers, body: JSON.stringify(post) })
  : await fetch(`${SITE}/api/admin/blog/posts`, { method: "POST", headers, body: JSON.stringify(post) })

const out = await res.json()
if (!res.ok || out.error) { console.error(`publishing: ${res.status} ${out.error ?? ""}`); process.exit(1) }
console.log(`${existing ? "updated" : "created"} ${out.id}`)
console.log(`${SITE}/blog/${out.slug}`)
