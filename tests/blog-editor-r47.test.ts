/**
 * ===========================================================================
 *  ROUND 47: WRITING IN THE BLOG EDITOR
 * ===========================================================================
 * MARKDOWN   "## ", "### ", "- ", "* ", "1. ", "> ", "```" and "---" at the
 *            start of an empty line (lib/blog/editor-tools.ts
 *            markdownShortcut), and the editor using that one function.
 * UNDO       the history: typing in one block is one step until a pause,
 *            anything else a step, redo cleared by a new change, a limit;
 *            Cmd+Z and Shift+Cmd+Z (Ctrl+Y) caught by the editor across
 *            blocks, the browser's own per-field undo left to inputs.
 * CHECKLIST  facts only (seoChecklist): the title as the article renders it
 *            ("| Storelib" counted), the description, the cover and its alt,
 *            every picture's alt, an H2, a clean slug, links to storelib.com
 *            pages, the focus keyword in the title and the first paragraph.
 *            No score anywhere.
 * CMD+S      isSaveShortcut, and the editor saving at once on it.
 * BEFORE 345 a reader's view moves updated_at; the version is then the
 *            content's fingerprint, so an Update on a read post is not a
 *            false 409 (lib/blog/save-rules.ts editVersion, savePost).
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { stripComments } from "./_source"
import type { Block } from "@/lib/blog/blocks"
import { emptyMeta, type PostMeta } from "@/lib/blog/editor-model"
import {
  HISTORY_LIMIT,
  TYPING_PAUSE_MS,
  createHistory,
  internalLinks,
  isFocusShortcut,
  isInternalLink,
  isRedoShortcut,
  isSaveShortcut,
  isUndoShortcut,
  markdownShortcut,
  readMinutes,
  recordChange,
  redoStep,
  searchDescription,
  searchTitle,
  seoChecklist,
  undoStep,
  wordCount,
  type Check,
} from "@/lib/blog/editor-tools"
import { contentFingerprint, editVersion, isStaleSave, postVersion } from "@/lib/blog/save-rules"
import { adminView, savePost, type Supa } from "@/lib/blog/admin-store"

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
const key = (k: string, mods: Partial<{ metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({ key: k, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...mods })

async function main() {
  /* ── Markdown ────────────────────────────────────────────────────────── */
  console.log("\nMarkdown at the start of a line (markdownShortcut)\n")
  {
    const cases: [string, string | null][] = [
      ["## ", "h2"],
      ["### ", "h3"],
      ["- ", "ul"],
      ["* ", "ul"],
      ["1. ", "ol"],
      ["1) ", "ol"],
      ["> ", "quote"],
      ["```", "code"],
      ["---", "hr"],
      ["## ", "h2"],
      ["- ", "ul"],
    ]
    for (const [t, want] of cases) check(`${JSON.stringify(t)} makes ${want}`, markdownShortcut(t) === want, markdownShortcut(t))
    const not = ["##", "#### ", "## a", "a - ", "2. ", "--", "----", "``", " ## ", "-x"]
    check("nothing else does: no space yet, four hashes, words after, other numbers, short or long rules", not.every((t) => markdownShortcut(t) === null), not.map((t) => [t, markdownShortcut(t)]))
    const ed = code("components/admin/blog-editor.tsx")
    check("the editor asks markdownShortcut, only on a paragraph with no formatting in it", /block\.type === "p" && el\.children\.length === 0 \? markdownShortcut\(t\) : null/.test(ed) && !/const MARKDOWN/.test(ed))
    check("a divider is followed by a fresh line, with the caret in it", /if \(shortcut === "hr"\) api\.replaceWith\(block\.id, \[fresh, blankBlock\("p"\)\], "end"\)/.test(ed))
    check("a code block opens with the caret in the code, not in its language", /data-autofocus=""\s+rows=\{Math\.min\(24/.test(ed) && /row\.querySelector<HTMLElement>\("\[data-autofocus\]"\)/.test(ed))
  }

  /* ── Undo ────────────────────────────────────────────────────────────── */
  console.log("\nUndo and redo across blocks (history)\n")
  {
    const h = createHistory<string[]>()
    let doc = ["a"]
    let t = 0
    const change = (next: string[], k: string | null, dt = 100) => {
      t += dt
      recordChange(h, doc, k, t)
      doc = next
    }
    change(["ab"], "p1:html")
    change(["abc"], "p1:html")
    change(["abcd"], "p1:html")
    check("typing in one block without a pause is one step", h.past.length === 1, h.past)
    change(["abcde"], "p1:html", TYPING_PAUSE_MS + 1)
    check("  a pause starts the next", h.past.length === 2)
    change(["abcde", ""], null)
    change(["abcde", "x"], "p2:html")
    check("Enter (a new block) is a step, and typing in the new block another", h.past.length === 4)
    let back = undoStep(h, doc)
    check("undo gives the list before the typing", JSON.stringify(back) === JSON.stringify(["abcde", ""]), back)
    doc = back!
    back = undoStep(h, doc)
    check("  then before the new block: across blocks", JSON.stringify(back) === JSON.stringify(["abcde"]), back)
    doc = back!
    const fwd = redoStep(h, doc)
    check("redo brings the new block back", JSON.stringify(fwd) === JSON.stringify(["abcde", ""]), fwd)
    doc = fwd!
    change(["abcde", "y"], "p2:html")
    check("a new change after an undo clears redo", h.future.length === 0 && redoStep(h, doc) === null)
    const after = undoStep(h, doc)
    change(after!, null)
    check("an undo never joins the typing that follows it", h.lastKey === null)
    const empty = createHistory<number>()
    check("nothing to undo or redo: null, and nothing changes", undoStep(empty, 1) === null && redoStep(empty, 1) === null && empty.past.length === 0)
    const big = createHistory<number>()
    for (let i = 0; i < HISTORY_LIMIT + 25; i++) recordChange(big, i, null, i)
    check(`at most ${HISTORY_LIMIT} steps are kept, the oldest go`, big.past.length === HISTORY_LIMIT && big.past[0] === 25)

    check("Cmd+Z and Ctrl+Z undo", isUndoShortcut(key("z", { metaKey: true })) && isUndoShortcut(key("z", { ctrlKey: true })) && isUndoShortcut(key("Z", { metaKey: true })))
    check("Shift+Cmd+Z and Ctrl+Y redo, and are not undo", isRedoShortcut(key("z", { metaKey: true, shiftKey: true })) && isRedoShortcut(key("y", { ctrlKey: true })) && !isUndoShortcut(key("z", { metaKey: true, shiftKey: true })))
    check("Z alone, Alt+Cmd+Z and Cmd+Y are neither", !isUndoShortcut(key("z")) && !isUndoShortcut(key("z", { metaKey: true, altKey: true })) && !isRedoShortcut(key("y", { metaKey: true })))

    const ed = code("components/admin/blog-editor.tsx")
    check("every change in the editor goes through commit, which records it first", /const commit = React\.useCallback\(\(next: Block\[\], key: string \| null = null\) => \{\s*recordChange\(history\.current, blocksRef\.current, key, Date\.now\(\)\)/.test(ed))
    check("  typing in a field joins its run by the block and field", /commit\(next, `\$\{id\}:\$\{Object\.keys\(patch\)\.sort\(\)\.join\(\)\}`\)/.test(ed))
    check("the editor catches Cmd+Z and Shift+Cmd+Z, leaving inputs their own undo", /if \(\(isUndoShortcut\(e\) \|\| isRedoShortcut\(e\)\) && !isField\(e\.target\)\) \{\s*e\.preventDefault\(\)\s*step\(isRedoShortcut\(e\) \? 1 : -1\)/.test(ed))
    check("  and the Edit menu's Undo (beforeinput historyUndo)", /e\.inputType === "historyUndo" \|\| e\.inputType === "historyRedo"/.test(ed))
    check("an undo rewrites text blocks even where the caret is (the epoch)", /setEpoch\(\(e\) => e \+ 1\)/.test(ed) && /\(forced \|\| document\.activeElement !== el\)/.test(ed))
  }

  /* ── Cmd+S, focus mode ───────────────────────────────────────────────── */
  console.log("\nCmd+S saves now\n")
  {
    check("Cmd+S and Ctrl+S", isSaveShortcut(key("s", { metaKey: true })) && isSaveShortcut(key("s", { ctrlKey: true })) && isSaveShortcut(key("S", { ctrlKey: true })))
    check("not S alone, not Shift+Cmd+S (strike), not Alt", !isSaveShortcut(key("s")) && !isSaveShortcut(key("s", { metaKey: true, shiftKey: true })) && !isSaveShortcut(key("s", { metaKey: true, altKey: true })))
    check("Shift+Cmd+F is focus mode", isFocusShortcut(key("f", { metaKey: true, shiftKey: true })) && !isFocusShortcut(key("f", { metaKey: true })))
    const client = code("app/admin/blog/posts/_editor-client.tsx")
    check("the editor saves at once on it, cancelling the autosave timer", /if \(isSaveShortcut\(e\)\) \{\s*e\.preventDefault\(\)/.test(client) && /queue\("save"\)/.test(client) && /if \(timer\.current\) clearTimeout\(timer\.current\)\s*timer\.current = null/.test(client))
    check("  and before 345 a live post says Update saves it", /if \(!autosaves\) return flash\(/.test(client))
  }

  /* ── Words, the search title ─────────────────────────────────────────── */
  console.log("\nWords and the search result\n")
  {
    const blocks: Block[] = [
      { id: "1", type: "h2", html: "Two words" },
      { id: "2", type: "p", html: "One <b>two</b> three<br>four" },
      { id: "3", type: "ul", items: ["a b", "c"] },
      { id: "4", type: "table", headers: ["h1", "h2"], rows: [["x y", "z"]] },
      { id: "5", type: "img", url: "/a.png", alt: "not counted" },
    ]
    check("words: text, a line break between words, items, table headers and cells, never alt text", wordCount(blocks) === 2 + 4 + 3 + 2 + 3, wordCount(blocks))
    check("read time at 230 a minute, never under 1", readMinutes(0) === 1 && readMinutes(230) === 1 && readMinutes(460) === 2 && readMinutes(1200) === 5)
    check("the search title is the article's: SEO title or title, then | Storelib", searchTitle({ title: "A post", seo_title: "" }) === "A post | Storelib" && searchTitle({ title: "A post", seo_title: "Better | Storelib" }) === "Better | Storelib" && searchTitle({ title: "", seo_title: "" }) === "")
    check("  matching app/layout.tsx's template", /template: "%s \| Storelib"/.test(read("app/layout.tsx")))
    check("the description is the SEO description, else the excerpt", searchDescription({ seo_description: "", excerpt: "E" }) === "E" && searchDescription({ seo_description: "D", excerpt: "E" }) === "D")
  }

  /* ── The checklist ───────────────────────────────────────────────────── */
  console.log("\nThe search checklist states facts (seoChecklist)\n")
  {
    const meta = (p: Partial<PostMeta>): PostMeta => ({ ...emptyMeta(), title: "How to price a course", slug: "how-to-price-a-course", ...p })
    const body: Block[] = [
      { id: "1", type: "p", html: 'Pricing a course starts with <a href="/pricing">what you charge</a> and <a href="https://storelib.com/fees">fees</a>, not <a href="https://example.com">theirs</a>.' },
      { id: "2", type: "h2", html: "The numbers" },
      { id: "3", type: "img", url: "/a.png", alt: "A chart" },
      { id: "4", type: "img", url: "/b.png", alt: "" },
      { id: "5", type: "cta", title: "Start", url: "/signup", label: "Go" },
    ]
    const by = (list: Check[], id: Check["id"]) => list.find((c) => c.id === id)
    const all = seoChecklist(meta({ excerpt: "x".repeat(120), cover_image_url: "/c.png", cover_alt: "Cover", focus_keyword: "pricing" }), body, { full: true })
    check("title: its length with | Storelib, ok under 61", by(all, "title")?.state === "ok" && by(all, "title")!.text.includes(`${"How to price a course | Storelib".length} characters`), by(all, "title"))
    const long = seoChecklist(meta({ title: "x".repeat(55) }), body, { full: true })
    check("  over 60 with the suffix is a warning, said with the number", by(long, "title")?.state === "warn" && /66 characters; about 60 fit/.test(by(long, "title")!.text), by(long, "title"))
    check("description: the excerpt counts when there is no meta description", by(all, "description")?.state === "ok" && /120 characters/.test(by(all, "description")!.text))
    check("  none at all is a warning", by(seoChecklist(meta({}), body, { full: true }), "description")?.state === "warn")
    check("  over 160 is a warning", by(seoChecklist(meta({ seo_description: "d".repeat(161) }), body, { full: true }), "description")?.state === "warn")
    check("cover with alt text: ok; no alt: warn; no cover: warn", by(all, "cover")?.state === "ok" && by(seoChecklist(meta({ cover_image_url: "/c.png" }), body, { full: true }), "cover")?.state === "warn" && by(seoChecklist(meta({}), body, { full: true }), "cover")?.state === "warn")
    check("  before 345 the cover's alt cannot be saved: said, not warned", by(seoChecklist(meta({ cover_image_url: "/c.png" }), body, { full: false }), "cover")?.state === "info")
    check("pictures: how many have no alt text", by(all, "images")?.state === "warn" && by(all, "images")!.text === "1 of 2 pictures has no alt text.", by(all, "images"))
    check("  every one with alt: ok; none at all: info", by(seoChecklist(meta({}), body.filter((b) => b.id !== "4"), { full: true }), "images")?.state === "ok" && by(seoChecklist(meta({}), [], { full: true }), "images")?.state === "info")
    check("H2: counted; none is a warning", by(all, "h2")?.text === "1 H2 heading." && by(seoChecklist(meta({}), body.filter((b) => b.type !== "h2"), { full: true }), "h2")?.state === "warn")
    check("slug: clean is a to z, 0 to 9 and single hyphens, 60 or fewer", by(all, "slug")?.state === "ok" && by(seoChecklist(meta({ slug: "a--b" }), body, { full: true }), "slug")?.state === "warn" && by(seoChecklist(meta({ slug: "Ab" }), body, { full: true }), "slug")?.state === "warn" && by(seoChecklist(meta({ slug: "a".repeat(61) }), body, { full: true }), "slug")?.state === "warn" && by(seoChecklist(meta({ slug: "" }), body, { full: true }), "slug")?.state === "warn")
    check("internal links: relative, storelib.com and a call to action's address; not other sites", internalLinks(body).join() === "/pricing,https://storelib.com/fees,/signup" && by(all, "links")?.text === "3 links to storelib.com pages.", internalLinks(body))
    check("  # anchors, //host, mailto and other hosts are not internal; a relative word is", !isInternalLink("#top") && !isInternalLink("//cdn.x.com/a") && !isInternalLink("mailto:a@b.c") && !isInternalLink("https://storelib.com.evil.io/") && isInternalLink("pricing") && isInternalLink("https://www.storelib.com/"))
    check("  none is a warning", by(seoChecklist(meta({}), [{ id: "p", type: "p", html: "No links" }], { full: true }), "links")?.state === "warn")
    check("focus keyword in the title and in the first paragraph, case and spacing aside", by(all, "keyword-title")?.state === "warn" && by(all, "keyword-intro")?.state === "ok" && by(seoChecklist(meta({ focus_keyword: "Price  A Course" }), body, { full: true }), "keyword-title")?.state === "ok")
    check("  no focus keyword: no keyword lines", !by(seoChecklist(meta({}), body, { full: true }), "keyword-title") && !by(seoChecklist(meta({}), body, { full: true }), "keyword-intro"))
    const tools = code("lib/blog/editor-tools.ts")
    const client = code("app/admin/blog/posts/_editor-client.tsx")
    check("no score: no function or field makes one, and the page shows none", !/export (function|const) \w*score/i.test(tools) && !/score|\d+\s*\/\s*100\b/i.test(client) && Object.keys(all[0]).sort().join() === "id,state,text")
    check("the panel draws seoChecklist, and the publish step counts its warnings", /seoChecklist\(meta, blocks, \{ full \}\)/.test(client) && /checks\(\)\.filter\(\(c\) => c\.state === "warn"\)/.test(client))
    check("the SEO title's counter counts the title as rendered, | Storelib included", /count=\{\{ n: shownTitle\.length, max: TITLE_FITS \}\}/.test(client) && /const shownTitle = searchTitle\(meta\)/.test(client))
  }

  /* ── The page ────────────────────────────────────────────────────────── */
  console.log("\nThe writing page\n")
  {
    const client = code("app/admin/blog/posts/_editor-client.tsx")
    const ed = code("components/admin/blog-editor.tsx")
    check("a new post opens with the caret in the title; Enter and Down go into the body", /<TitleField value=\{meta\.title\} onChange=\{onTitle\} autoFocus=\{!initial\} \/>/.test(client) && /if \(e\.key === "Enter" && !e\.nativeEvent\.isComposing\) \{\s*e\.preventDefault\(\)\s*toBody\(\)/.test(client))
    check("Up from the first line goes back to the title", /onLeaveTop=\{focusTitle\}/.test(client) && /if \(dir < 0 && leaveTopRef\.current\)/.test(ed))
    check("what is worked out from the whole post waits for typing to stop", /const calmBlocks = useCalm\(blocks\)/.test(client) && /externalImagesOf\(meta, calmBlocks\)/.test(client) && /wordCount\(calmBlocks\)/.test(client) && /blocks=\{calmBlocks\}/.test(client) && /const SettingsPanel = React\.memo\(/.test(client))
    check("the settings fold away on a wide screen and are a drawer on a phone", /aria-controls="post-settings"/.test(client) && /!drawer && "max-lg:hidden"/.test(client) && /PANEL_KEY/.test(client))
    check("focus mode keeps the save state", /focusMode \? \(\s*<div[^>]*>\s*<SaveStatus/.test(client))
    check("the save state has a fixed width, so nothing moves when it changes", /block w-\[64px\] truncate text-right text-\[12px\] tabular-nums sm:w-\[150px\]/.test(client))
    check("Publish, Update and Schedule end in a confirmation with the live address and View post", /setDone\(\{ kind: v\.status === "scheduled" \? "scheduled" : action === "publish" \? "published" : "updated"/.test(client) && /data-live-url/.test(client) && /View post/.test(client))
    check("pictures pasted or dropped are uploaded, the first one's alt text waiting", /insertImages: \(id, pos, files\) =>/.test(ed) && /focusReq\.current = \{ id: imgs\[0\]\.id, where: "alt" \}/.test(ed) && /data-alt=""/.test(ed))
    check("a pasted picture address is copied into Storelib through the copy route", /api\.importInto\(img\.id, url\)/.test(ed) && /fetch\("\/api\/admin\/blog\/copy-image"/.test(client))
    check("the selection bar sets the heading level", /aria-label="Heading"/.test(ed) && /aria-label="Subheading"/.test(ed) && /api\.convert\(host\.id, next, true\)/.test(ed))
    check("every icon button has a name", /aria-label=\{settingsOpen \? "Hide post settings" : "Show post settings"\}/.test(client) && ["Bold", "Italic", "Underline", "Strikethrough", "Inline code"].every((n) => ed.includes(`aria-label="${n}"`)))
  }

  /* ── Before 345 ──────────────────────────────────────────────────────── */
  console.log("\nBefore SQL part 345, a reader's view is not an edit (editVersion)\n")
  {
    const row = { id: "11111111-1111-4111-8111-111111111111", slug: "hello", title: "Hello", excerpt: "", content: [{ id: "p1", type: "p", html: "Live" }], category: "Growth", read_time: "1 min read", author_name: "Storelib Team", cover_image_url: null, seo_title: null, seo_description: null, seo_keywords: null, is_published: true, published_at: "2026-01-01T00:00:00+00:00", views: 10, updated_at: "2026-10-01T00:00:00.000001+00:00" }
    const v = editVersion(row)
    check("without the draft columns the version is the content's fingerprint", typeof v === "string" && v.startsWith("c:") && v === contentFingerprint(row))
    check("  a view (views and updated_at) leaves it as it was", editVersion({ ...row, views: 11, updated_at: "2026-11-01T00:00:00+00:00" }) === v)
    check("  an edit to what readers see changes it", editVersion({ ...row, title: "Hello!" }) !== v && editVersion({ ...row, content: [] }) !== v && editVersion({ ...row, is_published: false }) !== v)
    check("  the same time written another way is the same version", editVersion({ ...row, published_at: "2026-01-01T00:00:00Z" }) === v)
    check("with part 345 the version is draft_saved_at, as before", editVersion({ ...row, draft_saved_at: "d1" }) === "d1" && postVersion({ updated_at: "u" }) === "u")
    check("the stale check takes the fingerprint for such a row", !isStaleSave(v, { ...row, views: 99, updated_at: "later" }) && isStaleSave(v, { ...row, title: "Other tab" }))
    check("the editor is handed it", adminView(row).version === v)

    const db = fakePosts(row)
    db.views()
    const saved = await savePost(db.client, row.id, { action: "update", version: v, meta: { ...adminView(row).meta, title: "Hello again" }, blocks: row.content as Block[] }, false)
    check("an Update after somebody read the post is saved, not a 409", saved.ok && db.row.title === "Hello again", saved.ok ? null : saved)
    db.viewDuringNextWrite = true
    const v2 = adminView(db.row).version
    const raced = await savePost(db.client, row.id, { action: "update", version: v2, meta: { ...adminView(db.row).meta, title: "Third" }, blocks: row.content as Block[] }, false)
    check("  a view landing between the read and the write: written again over the new updated_at", raced.ok && db.row.title === "Third" && db.writes === 3, { ok: raced.ok, writes: db.writes })
    db.row.title = "Changed in another tab"
    db.row.updated_at = "2026-11-02T00:00:00+00:00"
    const stale = await savePost(db.client, row.id, { action: "update", version: adminView({ ...db.row, title: "Third" }).version, meta: adminView(db.row).meta, blocks: [] }, false)
    const refused = stale as { ok: boolean; status?: number; code?: string }
    check("  a real edit elsewhere is still a 409", !refused.ok && refused.status === 409 && refused.code === "stale")
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

/** blog_posts before part 345, one row: updated_at moved by every update (the table's first trigger), a view as the track route makes one. */
function fakePosts(initial: Record<string, unknown>) {
  let clock = Date.parse("2026-11-01T10:00:00Z")
  const stamp = () => new Date((clock += 1000)).toISOString().replace("Z", "123+00:00")
  const state = {
    row: { ...initial } as Record<string, unknown>,
    writes: 0,
    viewDuringNextWrite: false,
    client: null as unknown as Supa,
    views() {
      state.row.views = Number(state.row.views) + 1
      state.row.updated_at = stamp()
    },
  }
  const builder = () => {
    let op: "select" | "update" = "select"
    let payload: Record<string, unknown> = {}
    const filters: [string, unknown][] = []
    const matches = () => filters.every(([c, v]) => state.row[c] === v)
    const exec = () => {
      if (op === "select") return matches() ? { ...state.row } : null
      state.writes++
      if (state.viewDuringNextWrite) {
        state.viewDuringNextWrite = false
        state.views()
      }
      if (!matches()) return null
      Object.assign(state.row, payload, { updated_at: stamp() })
      return { ...state.row }
    }
    const b: Record<string, unknown> = {
      select: () => b,
      eq: (c: string, v: unknown) => (filters.push([c, v]), b),
      neq: () => b,
      is: () => b,
      limit: () => b,
      update: (p: Record<string, unknown>) => ((op = "update"), (payload = p), b),
      maybeSingle: async () => ({ data: exec(), error: null }),
      then: (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res),
    }
    return b
  }
  state.client = { from: builder } as unknown as Supa
  return state
}

main()
