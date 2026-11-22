/**
 * ===========================================================================
 *  CREATOR BLOGS, THE SCREEN: WEBSITE SETTINGS › CONTENT › BLOG
 * ===========================================================================
 * Package 2 of the creator blog (the blueprint's §D):
 *
 *   PLACEMENT   one "Blog" item in Website Settings, directly below Pages, and
 *               no link anywhere else: not in the app's sidebar, not a tab on
 *               the Website page.
 *   THE LIST    the query the posts route reads, selecting across a page,
 *               which bulk actions a selection can take, a row's menu.
 *   SAVING      blog/save-queue.ts driven with its own clock: 1.5s after the
 *               last edit, one request at a time, each naming its version; a
 *               409 stops autosave until the person chooses; retries back off.
 *   THE EDITOR  components/admin/blog-editor.tsx only gained optional props:
 *               storelib.com's admin passes none and gets the same menu,
 *               every word the creator's editor translates is in the
 *               catalogs, and gallery and button are offered only when asked.
 *   SQL 355     the screen and the editor say the blog turns on after it.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs"
import { join } from "node:path"

import { stripComments } from "./_source"
import { untt } from "./i18n-source"
import { SETTINGS_SECTIONS, settingsSectionFrom } from "@/components/website-builder/website-settings/types"
import { BlogApiError, POSTS_PER_PAGE, isSqlMissing, postsQueryString, refusalMessage, savePostDraft } from "@/components/website-builder/website-settings/blog/api"
import {
  BULK_MAX,
  addTags,
  bulkAvailability,
  bulkOutcome,
  cleanSlugInput,
  countFor,
  instantFromInputs,
  pageCount,
  pageSelection,
  rowActions,
  slugFollowsTitle,
  statusTone,
  tidyTag,
  toggleAllOnPage,
  toggleOne,
  zonedInputs,
} from "@/components/website-builder/website-settings/blog/model"
import { AUTOSAVE_MS, createSaveQueue, type SaveState, type Timers } from "@/components/website-builder/website-settings/blog/save-queue"
import { EDITOR_WORDS, editorLabel } from "@/components/website-builder/website-settings/blog/editor-words"
import { blogImagePath, blogImageProblem } from "@/components/website-builder/website-settings/blog/upload"
import { keepAllowedBlocks, menuSetup, blankBlock } from "@/components/admin/blog-editor"
import { SITE_BLOCK_TYPES } from "@/lib/site-blog/blocks"
import type { AdminPost } from "@/lib/site-blog/types"
import type { SaveAnswer } from "@/components/website-builder/website-settings/blog/api"

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
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail)}`}`)
  }
}

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
const code = (p: string) => stripComments(read(p))
const SETTINGS = "components/website-builder/website-settings"

function post(over: Partial<AdminPost> = {}): AdminPost {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    status: "draft",
    title: "Hello",
    slug: "hello",
    excerpt: "",
    coverImageUrl: "",
    categoryId: null,
    tags: [],
    authorId: null,
    featured: false,
    publishedAt: null,
    updatedAt: "2026-11-01T00:00:00Z",
    hasUnpublishedChanges: false,
    livePath: null,
    meta: { title: "Hello", slug: "hello", excerpt: "", coverImageUrl: "", coverAlt: "", categoryId: null, tags: [], authorId: null, seoTitle: "", seoDescription: "", canonicalUrl: "", ogTitle: "", ogDescription: "", ogImageUrl: "", noindex: false, featured: false, publishedAt: null },
    blocks: [],
    version: 1,
    liveSlug: null,
    createdAt: "2026-11-01T00:00:00Z",
    firstPublishedAt: null,
    wordCount: 0,
    readingMinutes: 1,
    ...over,
  }
}

/** A clock the queue runs on: timers fire only when the test moves time. */
function fakeTimers() {
  let now = 0
  let seq = 0
  const pending = new Map<number, { at: number; fn: () => void }>()
  const timers: Timers = {
    set: (fn, ms) => {
      const id = ++seq
      pending.set(id, { at: now + ms, fn })
      return id
    },
    clear: (h) => void pending.delete(h as number),
  }
  async function advance(ms: number) {
    const until = now + ms
    for (;;) {
      const next = [...pending.entries()].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at)[0]
      if (!next) break
      pending.delete(next[0])
      now = next[1].at
      next[1].fn()
      await settle()
    }
    now = until
    await settle()
  }
  return { timers, advance, now: () => now, size: () => pending.size }
}
const settle = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

async function main() {
  /* ── Placement ─────────────────────────────────────────────────────── */
  console.log("\nOne Blog item, in Content, directly below Pages\n")
  {
    const ids = SETTINGS_SECTIONS.map((s) => s.id as string)
    const at = ids.indexOf("blog")
    check("Blog is listed once, right after Pages", at > 0 && ids[at - 1] === "pages" && ids.filter((i) => i === "blog").length === 1, ids)
    check("  under Content, called Blog", SETTINGS_SECTIONS[at]?.group === "content" && SETTINGS_SECTIONS[at]?.label === "Blog")
    check("  ?settings=blog opens it", settingsSectionFrom("blog") === "blog" && settingsSectionFrom("blogs") === null)
    const types = untt(read(`${SETTINGS}/types.ts`), `${SETTINGS}/types.ts`)
    check("  written the way the others are", /\{ id: "pages", label: "Pages", group: "content" \},\n  \{ id: "blog", label: "Blog", group: "content" \},\n  \{ id: "navigation"/.test(types))

    const ps = code("components/website-builder/project-settings.tsx")
    check("project settings draws BlogSettings for it, after Pages", /\{section === "pages" && <PageSettings ctx=\{ctx\} \/>\}\s*\{section === "blog" && <BlogSettings ctx=\{ctx\} \/>\}/.test(ps))
    check("  wider on a big screen as a separate argument, the speed page's own left as it was", /section === "performance" && "xl:max-w-\[1040px\]", section === "blog" && "xl:max-w-\[1040px\]"\)/.test(ps))
    check("  a post open over Settings keeps Escape from closing the page behind it", /* Changed on purpose (templates round 21): Escape is the page's way out, which is Back to the Website page when that sent the creator here (onExit). */ /if \(document\.querySelector\("\[data-site-post-editor\]"\)\) return\s*if \(e\.key === "Escape" && !e\.defaultPrevented\) \(onExit \?\? onClose\)\(\)/.test(ps))

    const sidebar = ["components/app/sidebar.tsx", "components/app/sidebar-desktop-nav.tsx", "components/app/sidebar-mobile-nav.tsx"].map(code).join("\n")
    check("nothing added to the app's sidebar", !/\bblog\b/i.test(sidebar) && !/settings=blog/.test(sidebar))
    const websitePage = readdirSync(join(root, "app/(storelib)/app/website-builder")).filter((f) => /\.tsx?$/.test(f)).map((f) => code(`app/(storelib)/app/website-builder/${f}`)).join("\n")
    check("no tab for it on the Website page", !/settings=blog\b/.test(websitePage) && !/\bBlogSettings\b/.test(websitePage) && !/\btt\("Blog"\)/.test(websitePage))
    const walk = (dir: string): string[] =>
      readdirSync(join(root, dir), { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? (d.name === "node_modules" ? [] : walk(`${dir}/${d.name}`)) : /\.tsx?$/.test(d.name) ? [`${dir}/${d.name}`] : []))
    const users = [...walk("components"), ...walk("app")].filter((f) => /\bBlogSettings\b|website-settings\/blog"/.test(read(f)))
    check("  the Blog screen is drawn from Website Settings alone", users.sort().join() === ["components/website-builder/project-settings.tsx", `${SETTINGS}/blog.tsx`].sort().join(), users)
  }

  /* ── The list ──────────────────────────────────────────────────────── */
  console.log("\nThe posts: query, filters, selection, bulk, a row's menu\n")
  {
    check("the default list asks for page one, newest edit first", postsQueryString({ status: "all", sort: "updated", page: 1 }) === `?perPage=${POSTS_PER_PAGE}`)
    const q = new URLSearchParams(postsQueryString({ search: "  price  ", status: "scheduled", categoryId: "c1", tag: "launch", authorId: "a1", sort: "title", page: 3 }).slice(1))
    check("  every filter as the route names it (q, status, category, tag, author, sort, page)", q.get("q") === "price" && q.get("status") === "scheduled" && q.get("category") === "c1" && q.get("tag") === "launch" && q.get("author") === "a1" && q.get("sort") === "title" && q.get("page") === "3" && q.get("perPage") === String(POSTS_PER_PAGE), Object.fromEntries(q))
    const route = code("app/api/website-builder/themes/[installId]/blog/posts/route.ts")
    check("  and the route reads those names", ["q", "status", "category", "tag", "author", "sort", "page", "perPage"].every((k) => route.includes(`sp.get("${k}")`)))
    check("counts: a number the server gave, else 0", countFor({ all: 4, draft: 2, scheduled: 0, published: 2, archived: 1 }, "draft") === 2 && countFor(null, "all") === 0 && countFor({ draft: Number.NaN } as never, "draft") === 0)
    check("pages: at least one", pageCount(0, 20) === 1 && pageCount(20, 20) === 1 && pageCount(21, 20) === 2)

    const one = toggleOne(new Set(), "a")
    check("a row's box selects and deselects it", one.has("a") && !toggleOne(one, "a").has("a"))
    const page = ["a", "b", "c"]
    const all = toggleAllOnPage(new Set(["x"]), page)
    check("the header's box selects the page, keeping posts picked on other pages", ["a", "b", "c", "x"].every((i) => all.has(i)))
    check("  pressed again with all of them on, it deselects the page only", [...toggleAllOnPage(all, page)].join() === "x")
    check("  with some on, it selects the rest", toggleAllOnPage(new Set(["a"]), page).size === 3)
    check("  and says none, some or all", pageSelection(new Set(), page) === "none" && pageSelection(new Set(["b"]), page) === "some" && pageSelection(all, page) === "all")

    const drafts = bulkAvailability(["draft", "draft"])
    check("two drafts: Publish and Archive, not Unpublish", drafts.publish && drafts.archive && !drafts.unpublish && !drafts.unarchive && drafts.delete)
    const live = bulkAvailability(["published", "scheduled"])
    check("live and scheduled: Unpublish, not Publish", live.unpublish && !live.publish && live.archive)
    const archived = bulkAvailability(["archived"])
    check("archived: back to drafts, not archive again", archived.unarchive && !archived.archive && archived.publish)
    check("a post picked on a page no longer in view can take anything but is still counted", bulkAvailability([undefined]).unpublish && bulkAvailability([undefined]).publish)
    check("nothing selected, or over the route's 200: no action", !Object.values(bulkAvailability([])).some(Boolean) && !bulkAvailability(Array(BULK_MAX + 1).fill("draft")).delete && BULK_MAX === 200)
    check("bulk answers: all done, some not (with the first reason), none", bulkOutcome(3, []).tone === "ok" && bulkOutcome(2, [{ error: "Needs a title." }]).tone === "partial" && /Needs a title\./.test(bulkOutcome(2, [{ error: "Needs a title." }]).text) && bulkOutcome(0, [{ error: "Nope" }]).text === "Nope")

    check("a draft's menu: Edit, Duplicate, Archive, Delete (no View: nothing is live)", rowActions({ status: "draft", livePath: null }).join() === "edit,duplicate,archive,delete")
    check("a live post's: View too, and Unpublish", rowActions({ status: "published", livePath: "/blogs/news/hello" }).join() === "edit,view,duplicate,unpublish,archive,delete")
    check("a scheduled post's: Unpublish (its schedule cancelled), no View yet", rowActions({ status: "scheduled", livePath: "/blogs/news/hello" }).join() === "edit,duplicate,unpublish,archive,delete")
    check("an archived post's: back to drafts", rowActions({ status: "archived", livePath: null }).join() === "edit,duplicate,unarchive,delete")
    check("Delete is last", ["draft", "published", "scheduled", "archived"].every((s) => rowActions({ status: s as never, livePath: "/x" }).at(-1) === "delete"))
    check("the status badge: live green, scheduled amber, the rest neutral", statusTone("published") === "live" && statusTone("scheduled") === "attention" && statusTone("draft") === "neutral" && statusTone("archived") === "neutral")

    const list = code(`${SETTINGS}/blog/post-list.tsx`)
    check("the list has the search, the status pills with counts, and category, tag and author filters", /data-blog-search=""/.test(list) && /<PillRow label=\{tt\("Status"\)\}/.test(list) && /label=\{tt\("Category"\)\}/.test(list) && /label=\{tt\("Tag"\)\}/.test(list) && /label=\{tt\("Author"\)\}/.test(list) && /label=\{tt\("Sort by"\)\}/.test(list))
    check("  each row: a box, its title as the press that opens it, its status, date and category, and a menu", /<CheckBox checked=\{selected\}/.test(list) && /onClick=\{onOpen\}/.test(list) && /statusLabel\(post\.status\)/.test(list) && /rowDate\(post\)/.test(list) && /<ResponsiveActionMenu/.test(list))
    check("  the bulk bar shows once something is selected, and Delete is asked first", /\{selected\.size > 0 && \(\s*<BulkBar/.test(list) && /<BlogDialog\s+destructive/.test(list))
    const bulk = code(`${SETTINGS}/blog/bulk-bar.tsx`)
    check("  it offers Publish, Unpublish, Archive, Move to category, Add tag and Delete", ["Publish", "Unpublish", "Archive", "Move to category", "Add tag", "Delete"].every((w) => bulk.includes(`tt("${w}")`)) && /onRun\("set_category"/.test(bulk) && /onRun\("add_tag"/.test(bulk))
    check("  and stays at the foot of the page while rows are picked", /sticky bottom-/.test(bulk))
  }

  /* ── Saving ────────────────────────────────────────────────────────── */
  console.log("\nAutosave: one at a time, with its version; a 409 stops and asks\n")
  {
    check("1.5 seconds after typing stops", AUTOSAVE_MS === 1500)
    const clock = fakeTimers()
    const sent: number[] = []
    const states: SaveState["kind"][] = []
    let answer: (v: number) => Promise<SaveAnswer> = async (v) => ({ ok: true, post: post({ version: v + 1 }) })
    let inFlight = 0
    let most = 0
    const q = createSaveQueue({
      version: 1,
      timers: clock.timers,
      now: clock.now,
      save: async (v) => {
        sent.push(v)
        inFlight++
        most = Math.max(most, inFlight)
        try {
          return await answer(v)
        } finally {
          inFlight--
        }
      },
      onState: (s) => states.push(s.kind),
    })
    q.touch()
    await clock.advance(1000)
    q.touch()
    await clock.advance(1000)
    check("typing resets the wait: nothing sent 1s after the second keystroke", sent.length === 0 && q.pending())
    await clock.advance(600)
    check("  one save once it stops, naming version 1", sent.join() === "1" && q.version() === 2 && !q.pending(), { sent, v: q.version() })
    check("  said as dirty, saving, saved", states.slice(-3).join() === "dirty,saving,saved", states)

    /* A save slow to answer, typed into meanwhile. */
    let release: () => void = () => {}
    answer = (v) => new Promise((r) => (release = () => r({ ok: true, post: post({ version: v + 1 }) })))
    q.touch()
    await clock.advance(1500)
    check("a second save starts", sent.join() === "1,2")
    q.touch()
    await clock.advance(1500)
    check("  typing while it is in flight does not start another beside it", sent.join() === "1,2" && most === 1)
    answer = async (v) => ({ ok: true, post: post({ version: v + 1 }) })
    release()
    await clock.advance(10)
    check("  when it lands, the next goes, naming the version that one returned", sent.join() === "1,2,3" && most === 1 && q.version() === 4, { sent, most })

    const flushed = await q.flush()
    check("Cmd+S with nothing changed sends nothing and says saved", flushed && sent.length === 3)

    /* A 409. */
    answer = async () => ({ ok: false, conflict: post({ version: 9, title: "Theirs" }) })
    q.touch()
    const ok = await q.flush()
    check("a 409 stops: the save says conflict and is not retried", !ok && states.at(-1) === "conflict" && q.conflicted() && clock.size() === 0)
    q.touch()
    await clock.advance(5000)
    check("  further typing saves nothing until the person chooses", sent.length === 4 && q.conflicted(), sent)
    answer = async (v) => ({ ok: true, post: post({ version: v + 1 }) })
    const mine = await q.resolve("mine", post({ version: 9 }))
    check("  Keep mine saves over theirs, from their version", mine && sent.at(-1) === 9 && q.version() === 10 && !q.conflicted(), sent)
    answer = async () => ({ ok: false, conflict: post({ version: 12 }) })
    q.touch()
    await q.flush()
    const before = sent.length
    const theirs = await q.resolve("theirs", post({ version: 12 }))
    check("  Load theirs sends nothing and takes their version", theirs && sent.length === before && q.version() === 12 && !q.pending() && states.at(-1) === "saved")

    /* Retries. */
    const c2 = fakeTimers()
    let tries = 0
    const r = createSaveQueue({
      version: 1,
      timers: c2.timers,
      now: c2.now,
      save: async (v) => (++tries < 3 ? { ok: false, error: "offline", status: 0, sql: false, retry: true } : { ok: true, post: post({ version: v + 1 }) }),
      onState: () => {},
    })
    r.touch()
    await c2.advance(1500)
    check("nothing answered: tried again by itself", tries === 1 && c2.size() === 1)
    await c2.advance(1000)
    check("  after 1s, then 2s", tries === 2)
    await c2.advance(1999)
    check("  (not before)", tries === 2)
    await c2.advance(1)
    check("  and it lands", tries === 3 && !r.pending())
    const c3 = fakeTimers()
    let refusals = 0
    const s = createSaveQueue({ version: 1, timers: c3.timers, now: c3.now, save: async () => (refusals++, { ok: false, error: "That address is already used by another post.", status: 400, sql: false, retry: false }), onState: () => {} })
    s.touch()
    await c3.advance(1500)
    await c3.advance(60_000)
    check("a refusal is said once and left for the person, not repeated", refusals === 1 && s.pending())
    s.dispose()
    s.touch()
    await c3.advance(5000)
    check("a closed editor's queue sends nothing more", refusals === 1)

    /* The fetch behind it. */
    const realFetch = globalThis.fetch
    const answerWith = (status: number, body: unknown) => (globalThis.fetch = (async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })) as typeof fetch)
    answerWith(409, { error: "This post was changed somewhere else.", current: post({ version: 5 }) })
    const c409 = await savePostDraft("i", "p", { meta: post().meta, blocks: [], version: 4 })
    check("a 409 from the route comes back as a conflict with the post as it is now", !c409.ok && "conflict" in c409 && c409.conflict?.version === 5)
    answerWith(503, { error: "The blog's tables are missing.", sql: 355 })
    const c503 = await savePostDraft("i", "p", { meta: post().meta, blocks: [], version: 4 })
    check("a 503 { sql: 355 } is the database update, not retried", !c503.ok && "sql" in c503 && c503.sql && !c503.retry && /SQL part 355/.test(c503.error))
    answerWith(500, { error: "Something went wrong. Try again." })
    const c500 = await savePostDraft("i", "p", { meta: post().meta, blocks: [], version: 4 })
    check("a 500 is tried again", !c500.ok && "retry" in c500 && c500.retry)
    globalThis.fetch = (async () => {
      throw new TypeError("network")
    }) as typeof fetch
    const off = await savePostDraft("i", "p", { meta: post().meta, blocks: [], version: 4 })
    check("nothing answering is tried again", !off.ok && "retry" in off && off.retry && off.status === 0)
    globalThis.fetch = realFetch
    check("a refusal's own words, else one for its status", refusalMessage(400, { error: "Needs a title." }) === "Needs a title." && /signed out/i.test(refusalMessage(401, null)) && /too many/i.test(refusalMessage(429, {})))
    check("isSqlMissing knows the database update", isSqlMissing(new BlogApiError("x", 503, true)) && !isSqlMissing(new BlogApiError("x", 503)) && !isSqlMissing(new Error("x")))

    const ed = code(`${SETTINGS}/blog/post-editor.tsx`)
    check("the editor saves through the queue, every edit touching it", /createSaveQueue\(\{/.test(ed) && /savePostDraft\(ctx\.installId, initial\.id, \{ meta: metaRef\.current, blocks: blocksRef\.current, version \}\)/.test(ed) && (ed.match(/queueRef\.current\?\.touch\(\)/g) ?? []).length === 2)
    check("  Cmd+S saves now", /if \(isSaveShortcut\(e\)\) \{\s*e\.preventDefault\(\)/.test(ed) && /q\.flush\(\)/.test(ed))
    check("  Publish, Update and Schedule save first and name the version", /if \(!\(await q\.flush\(\)\)\)/.test(ed) && /postAction\(ctx\.installId, post\.id, action, \{ publishAt: publishAt \?\? null, version: q\.version\(\) \}\)/.test(ed))
    check("  a 409 asks: Load theirs or Keep mine", /save\.kind === "conflict"/.test(ed) && /tt\("Load theirs"\)/.test(ed) && /tt\("Keep mine"\)/.test(ed))
    check("  leaving saves first, and asks before going when it cannot", /const ok = await q\.flush\(\)\s*if \(ok\) return onClose\(\)\s*setLeaving\("asking"\)/.test(ed) && /beforeunload/.test(ed))
    check("  the save state has a fixed width", /block w-\[64px\] truncate text-\[12\.5px\] tabular-nums sm:w-\[150px\]/.test(ed))
  }

  /* ── Scheduling in the app's zone, slugs and tags ──────────────────── */
  console.log("\nSchedule in the app's time zone, the slug, the tags\n")
  {
    const iso = "2026-11-02T08:30:00.000Z"
    const waw = zonedInputs(iso, "Europe/Warsaw")
    check("an instant as Warsaw's wall clock", waw.date === "2026-11-02" && waw.time === "09:30", waw)
    check("  and back to the same instant", instantFromInputs(waw.date, waw.time, "Europe/Warsaw")?.toISOString() === iso)
    const ny = instantFromInputs("2026-07-04", "09:00", "America/New_York")
    check("9:00 in New York in July is 13:00 UTC", ny?.toISOString() === "2026-07-04T13:00:00.000Z", ny)
    check("fields that name no time: null", instantFromInputs("", "09:00", "UTC") === null && instantFromInputs("2026-13-01", "09:00", "UTC") === null && instantFromInputs("2026-01-01", "25:00", "UTC") === null)
    const pop = code(`${SETTINGS}/blog/publish-popover.tsx`)
    check("the schedule is read in appTimeZone and sent as an instant", /const zone = appTimeZone\(\)/.test(pop) && /instantFromInputs\(when\.date, when\.time, zone\)/.test(pop) && /go\("schedule", at\.toISOString\(\)\)/.test(pop))
    check("  Publish now, Schedule, Update and Unpublish", ["Publish now", "Schedule", "Update", "Unpublish", "Cancel schedule"].every((w) => pop.includes(`tt("${w}")`)))

    check("a typed slug is kept clean", cleanSlugInput("Héllo  World!!") === "hello-world-" && cleanSlugInput("--a--b") === "a-b")
    check("the slug follows the title until it is published or typed", slugFollowsTitle({ firstPublishedAt: null }, { title: "My post", slug: "my-post" }) && slugFollowsTitle({ firstPublishedAt: null }, { title: "My post", slug: "untitled-2" }) && !slugFollowsTitle({ firstPublishedAt: "2026-01-01" }, { title: "My post", slug: "my-post" }) && !slugFollowsTitle({ firstPublishedAt: null }, { title: "My post", slug: "custom" }))
    check("tags: tidy, once each whatever their case, commas split, 20 at most", tidyTag("  #launch ,  day ") === "launch day" && addTags(["Launch"], "launch, news,  ").join() === "Launch,news" && addTags(Array.from({ length: 20 }, (_, i) => `t${i}`), "more").length === 20)
  }

  /* ── The editor's props ────────────────────────────────────────────── */
  console.log("\ncomponents/admin/blog-editor.tsx gained optional props only\n")
  {
    const ed = read("components/admin/blog-editor.tsx")
    const ORIGINAL_MENU = [
      `  { type: "p", label: "Text", hint: "A paragraph", keys: "paragraph text p" },`,
      `  { type: "h2", label: "Heading", hint: "A section, in the table of contents", keys: "heading h2 title section" },`,
      `  { type: "h3", label: "Subheading", hint: "A smaller heading", keys: "subheading h3" },`,
      `  { type: "ul", label: "Bulleted list", hint: "", keys: "bullet list ul unordered" },`,
      `  { type: "ol", label: "Numbered list", hint: "", keys: "numbered list ol ordered steps" },`,
      `  { type: "quote", label: "Quote", hint: "", keys: "quote blockquote" },`,
      `  { type: "callout", label: "Callout", hint: "A note, a tip or a warning", keys: "callout note tip warning box" },`,
      `  { type: "code", label: "Code", hint: "", keys: "code snippet pre" },`,
      `  { type: "table", label: "Table", hint: "", keys: "table grid rows columns" },`,
      `  { type: "hr", label: "Divider", hint: "", keys: "divider hr line separator" },`,
      `  { type: "img", label: "Image", hint: "Upload or paste an address", keys: "image picture photo img upload" },`,
      `  { type: "youtube", label: "YouTube", hint: "With chapters and a transcript", keys: "youtube video" },`,
      `  { type: "video", label: "Video file", hint: "An mp4 or webm address", keys: "video mp4 webm file" },`,
      `  { type: "embed", label: "Embed", hint: "Vimeo, Loom, X, Spotify, Figma, CodePen", keys: "embed vimeo loom x twitter spotify figma codepen iframe" },`,
      `  { type: "cta", label: "Call to action", hint: "A heading, a line and a button", keys: "cta button call action" },`,
      `  { type: "snippet", label: "Snippet", hint: "A reusable block from the library", keys: "snippet reusable library" },`,
    ]
    check("the admin's menu is word for word what it was, in its order", ed.includes(`const MENU: { type: BlockType; label: string; hint: string; keys: string }[] = [\n${ORIGINAL_MENU.join("\n")}\n]`))
    check("the old props are as they were, the new ones optional", /onUpload: \(file: File\) => Promise<string>/.test(ed) && /onImport\?: \(url: string\) => Promise<string>/.test(ed) && /snippetsNote\?: string \| null/.test(ed) && /types\?: readonly BlockType\[\]/.test(ed) && /label\?: \(english: string\) => string/.test(ed))
    const admin = code("app/(storelib)/admin/blog/posts/_editor-client.tsx")
    check("storelib.com's admin passes none of them", /<BlogEditor/.test(admin) && !/\btypes=\{/.test(admin) && !/\blabel=\{/.test(admin.slice(admin.indexOf("<BlogEditor"), admin.indexOf("/>", admin.indexOf("<BlogEditor")))))
    const plain = menuSetup()
    check("  so its menu has every block it had, and no gallery or button", plain.menu.length === 16 && !plain.menu.some((m) => m.type === "gallery" || m.type === "button") && plain.allows("snippet") && plain.label("Text") === "Text")
    const site = menuSetup(SITE_BLOCK_TYPES, (s) => `«${s}»`)
    check("the website blog's: gallery and button, no snippet", site.menu.some((m) => m.type === "gallery") && site.menu.some((m) => m.type === "button") && !site.menu.some((m) => m.type === "snippet") && !site.allows("snippet") && site.allows("gallery"))
    check("  every one of lib/site-blog's block types can be inserted", SITE_BLOCK_TYPES.every((t) => t === "p" || site.menu.some((m) => m.type === t)) && site.menu.some((m) => m.type === "p"))
    check("  its words through the translator", site.label("Text") === "«Text»")
    check("a pasted block the editor does not offer becomes words, or nothing", JSON.stringify(keepAllowedBlocks([{ id: "a", type: "snippet", snippetId: "s" }, { id: "b", type: "code", text: "a<b" }, { id: "c", type: "p", html: "x" }], (t) => t === "p")) === JSON.stringify([{ id: "b", type: "p", html: "a&lt;b" }, { id: "c", type: "p", html: "x" }]))
    check("  and every block, where every block is offered", keepAllowedBlocks([{ id: "a", type: "snippet", snippetId: "s" }], () => true).length === 1)
    const g = blankBlock("gallery")
    const b = blankBlock("button")
    check("a new gallery has no pictures; a new button is filled", Array.isArray(g.images) && g.images.length === 0 && b.style === "primary" && b.label === "" && b.url === "")
    check("the gallery uploads through onUpload, reorders and asks for alt text", /api\.uploadFile/.test(ed) && /uploadFile: \(file\) => uploadRef\.current\(file\)/.test(ed) && /move\(i, -1\)/.test(ed) && /Add alt text to every picture/.test(ed))
    check("pinned literals kept: aria-labels, commit, paste", ["Bold", "Italic", "Underline", "Strikethrough", "Inline code"].every((n) => ed.includes(`aria-label="${n}"`)) && /blocksFromHtmlDocument\(new DOMParser\(\)\.parseFromString\(html, "text\/html"\)/.test(ed) && /if \(shortcut === "hr"\) api\.replaceWith\(block\.id, \[fresh, blankBlock\("p"\)\], "end"\)/.test(ed))

    /* Every word the editor passes through `label` is translated. */
    const asked = new Set<string>()
    for (const m of ed.matchAll(/\bL\("([^"]+)"\)/g)) asked.add(m[1])
    for (const m of ed.matchAll(/\{ type: "(?:p|h2|h3|ul|ol|quote|callout|code|table|hr|img|youtube|video|embed|cta|gallery|button)", label: "([^"]+)", hint: "([^"]*)"/g)) {
      asked.add(m[1])
      if (m[2]) asked.add(m[2])
    }
    for (const m of ed.slice(ed.indexOf("const PLACEHOLDER"), ed.indexOf("\n", ed.indexOf("const PLACEHOLDER"))).matchAll(/: "([^"]+)"/g)) asked.add(m[1])
    for (const m of ed.slice(ed.indexOf("const BUTTON_STYLES"), ed.indexOf("]", ed.indexOf("const BUTTON_STYLES"))).matchAll(/label: "([^"]+)"/g)) asked.add(m[1])
    asked.add("Bulleted")
    asked.add("Numbered")
    const words = new Set(EDITOR_WORDS)
    const missing = [...asked].filter((w) => !words.has(w))
    check("every word the creator's editor shows is on the translated list", asked.size > 50 && missing.length === 0, missing)
    check("  and the translator leaves anything else as it is", editorLabel("Text") === "Text" && editorLabel("Bold") === "Bold")
    const pe = code(`${SETTINGS}/blog/post-editor.tsx`)
    check("the website's editor passes its blocks and the translator", /types=\{SITE_BLOCK_TYPES\}/.test(pe) && /label=\{editorLabel\}/.test(pe) && /onUpload=\{upload\}/.test(pe) && /onImport=\{importImage\}/.test(pe))
  }

  /* ── The writer ────────────────────────────────────────────────────── */
  console.log("\nThe writer: full screen, dark, its panel a drawer on a phone\n")
  {
    const pe = code(`${SETTINGS}/blog/post-editor.tsx`)
    check("a portal over Settings at z-[160], always dark", /createPortal\(/.test(pe) && /fixed inset-0 z-\[160\]/.test(pe) && /data-ws-look="dark"/.test(pe) && /<SettingsLookContext\.Provider value="dark">/.test(pe) && /document\.body/.test(pe))
    /* Changed on purpose (r51): still its own chunk, never in Settings' bundle, and now fetched while the list is idle so the first post opens without waiting for it. */
    check("its own chunk, fetched when the list is idle, drawn when a post is opened", /const loadWriter = \(\) => import\("\.\/blog\/post-editor"\)/.test(code(`${SETTINGS}/blog.tsx`)) && /dynamic\(\(\) => loadWriter\(\)/.test(code(`${SETTINGS}/blog.tsx`)) && /requestIdleCallback/.test(code(`${SETTINGS}/blog.tsx`)))
    check("Back, the save state, History, Preview, the settings and Publish", /tt\("Posts"\)/.test(pe) && /aria-label=\{tt\("History"\)\}/.test(pe) && /aria-label=\{tt\("Preview"\)\}/.test(pe) && /aria-controls="site-post-settings"/.test(pe) && /<PublishButton/.test(pe))
    check("  Preview opens in the press and is pointed at the signed address", /const w = window\.open\("", "_blank"\)/.test(pe) && /previewPost\(ctx\.installId, post\.id\)/.test(pe) && /w\.opener = null/.test(pe))
    check("  the panel beside the writing from lg, a drawer under it", /matchMedia\("\(min-width: 1024px\)"\)/.test(pe) && /translate-x-full/.test(pe) && /inert=\{!drawer\}/.test(pe))
    check("  History restores into the draft", /<RevisionsDialog/.test(pe) && /restoreRevision\(installId, postId, id\)/.test(code(`${SETTINGS}/blog/revisions.tsx`)))
    const panel = code(`${SETTINGS}/blog/post-panel.tsx`)
    check("the panel: excerpt, featured image (folder blog), alt text, category, tags, author, featured", /tt\("Excerpt"\)/.test(panel) && /<WbImagePicker value=\{meta\.coverImageUrl \|\| undefined\}[\s\S]{0,200}folder="blog"/.test(panel) && /tt\("Image alt text"\)/.test(panel) && /tt\("Category"\)/.test(panel) && /<TagsField/.test(panel) && /tt\("Author"\)/.test(panel) && /tt\("Featured"\)/.test(panel))
    check("  the address with the live address under it, and the publish date in the app's zone", /data-blog-slug=""/.test(panel) && /postPath\(handle, meta\.slug \|\| "…"\)/.test(panel) && /instantFromInputs\(e\.target\.value, date\.time \|\| "09:00", zone\)/.test(panel))
    check("  SEO: the search result, title and description counted, canonical, noindex", /<SearchResultPreview compact address=\{address\}/.test(panel) && /<Counter value=\{meta\.seoTitle\} max=\{SEO_TITLE_FITS\}/.test(panel) && /<Counter value=\{meta\.seoDescription\} max=\{SEO_DESCRIPTION_FITS\}/.test(panel) && /meta\.canonicalUrl/.test(panel) && /set\(\{ noindex: !on \}\)/.test(panel))
    check("  social title, description and image, with the share card", /meta\.ogTitle/.test(panel) && /meta\.ogDescription/.test(panel) && /meta\.ogImageUrl/.test(panel) && /<ShareCard/.test(panel) && /data-share-card=""/.test(panel))
    check("pictures go up the website's own way, into blog/", blogImagePath("owner-1", { name: "a.JPG" }, 5).startsWith("owner-1/blog/5-") && blogImagePath("owner-1", { name: "a.JPG" }, 5).endsWith(".jpg") && blogImageProblem({ name: "a.svg", type: "image/svg+xml", size: 10 }) !== null && blogImageProblem({ name: "a.png", type: "image/png", size: 6 * 1024 * 1024 }) !== null && blogImageProblem({ name: "a.png", type: "image/png", size: 10 }) === null)
    const up = code(`${SETTINGS}/blog/upload.ts`)
    check("  without metadata, in the owner's folder for a team member, signed when storage refuses, recorded", /withoutMetadata\(file\)/.test(up) && /websiteUploadOwner\(\)/.test(up) && /teamSignedUpload\(BLOG_BUCKET, filePath, body, file\.type\)/.test(up) && /confirmUpload\(BLOG_BUCKET, filePath\)/.test(up) && /BLOG_BUCKET = "store-builder-images"/.test(up))
  }

  /* ── Before SQL 355, the rest of the screen, words ─────────────────── */
  console.log("\nBefore SQL part 355, the blog's own card, templates, words\n")
  {
    const blog = code(`${SETTINGS}/blog.tsx`)
    check("before SQL 355 the screen says the blog turns on after it", /data-blog-sql="355"/.test(blog) && /tt\("Blog turns on after the database update \(SQL part 355\)\."\)/.test(blog) && /e instanceof BlogApiError && e\.sql/.test(blog))
    check("  and the writer too", /tt\("Blog turns on after the database update \(SQL part 355\)\."\)/.test(code(`${SETTINGS}/blog/post-editor.tsx`)))
    check("the title and its one action, New post", /<PageTitle/.test(blog) && /tt\("New post"\)/.test(blog) && /tt\("Blog"\)/.test(blog))
    check("Categories, Authors and Blog settings open in place, in one card", /<PartRow\s+label=\{tt\("Categories"\)\}/.test(blog) && /<PartRow\s+label=\{tt\("Authors"\)\}/.test(blog) && /<PartRow label=\{tt\("Blog settings"\)\}/.test(blog) && /<Reveal open=\{open\}/.test(blog))
    const tpl = code(`${SETTINGS}/blog/templates-card.tsx`)
    check("the templates card edits the listing and the post template in the builder", /onEditPage\(templates\.listing\)/.test(tpl) && /onEditPage\(templates\.post\)/.test(tpl) && /<TemplatesCard templates=\{overview\.templates\} onEditPage=\{ctx\.onEditPage\} \/>/.test(blog))
    const opts = code(`${SETTINGS}/blog/blog-options.tsx`)
    check("blog settings: address, name, posts a page, description, search title and description, social image", /isBlogHandle\(d\.handle\)/.test(opts) && /postsPerPage/.test(opts) && /seoTitle/.test(opts) && /seoDescription/.test(opts) && /ogImageUrl/.test(opts) && /<SearchResultPreview/.test(opts))
    for (const lang of ["es", "fr", "de", "pt-BR", "it", "pl"]) {
      const cat = read(`lib/i18n/catalog/${lang}.ts`)
      check(`${lang}: Blog, Blog post and Blog posts (the native templates' names) are translated`, ["Blog", "Blog post", "Blog posts"].every((w) => new RegExp(`\\n "${w}": "[^"]+"`).test(cat)))
    }
    const light = read("scripts/gen-website-settings-light.mjs")
    check("the light look reads the blog's own folder too", /withFileTypes: true/.test(light) && existsSync(join(root, "app/website-settings-light.css")))
    const all = ["blog.tsx", ...readdirSync(join(root, `${SETTINGS}/blog`)).map((f) => `blog/${f}`)].map((f) => read(`${SETTINGS}/${f}`)).join("\n")
    check("no em dash in what the Blog screen writes", !/—/.test(all))
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
