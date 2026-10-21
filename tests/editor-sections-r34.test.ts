/**
 * ===========================================================================
 *  ROUND 34: SECTIONS ON A LONG PAGE, THE DRAFT'S SAVES, AND UNDO
 * ===========================================================================
 * Driven with the real code where it is pure, read from the source where it
 * is wiring:
 *
 *   ORDER     one draft write at a time, in the order asked; a newer write
 *             for the same page replaces one still waiting; an older one is
 *             never sent after a newer one; a write equal to the one just
 *             written is not sent again; a failure does not stop the queue
 *   SAVED     the editor says Saved only when nothing was edited after the
 *             write's snapshot was taken, and asks for another save if so
 *   RETRY     a save refused for a reason that passes is tried again on its
 *             own, later each time, and at once when the browser is online
 *   UNDO      forty keys in one field are one step; another field straight
 *             after is a step of its own; a step of its own (a delete) ends
 *             the run; a step holds the page by reference
 *   STABLE    the sidebar's rows and insert lines, and the canvas's insert
 *             strips, are memoised with handlers that do not change; the
 *             canvas's storefront data and live render are keyed on the
 *             header, not the page
 *
 * The same, in a real browser on a page of 44 sections, with every section
 * operation counted and timed: scripts/check-editor-sections.mjs.
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createSaveQueue, retryDelayMs } from "@/lib/website-builder/save-queue"
import { createUndoRun } from "@/lib/website-builder/undo-run"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail)}`}`) }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

type Snap = { page: string; body: string }

console.log("\nORDER: one write at a time, the newest winning")
{
  /* A server that takes a while, and keeps what lands, in the order it lands. */
  const landed: string[] = []
  let inFlight = 0
  let most = 0
  const q = createSaveQueue<Snap, boolean>(async (s) => {
    inFlight++
    most = Math.max(most, inFlight)
    /* The first write is the slow one: sent at once, it would land after the second. */
    await sleep(s.body === "v1" ? 60 : 5)
    landed.push(`${s.page}:${s.body}`)
    inFlight--
    return true
  }, { sameTarget: (a, b) => a.page === b.page, equal: (a, b) => a.body === b.body })

  const a = q.save({ page: "home", body: "v1" })
  const b = q.save({ page: "home", body: "v2" })
  const c = q.save({ page: "home", body: "v3" })
  check("busy while a write is going", q.busy())
  const results = await Promise.all([a, b, c])
  check("never two writes in flight", most === 1, most)
  check("the slow first write lands, then only the newest of those waiting", landed.join() === "home:v1,home:v3", landed)
  check("the one replaced hears how its replacement went", results.every((r) => r === true), results)
  check("and the last write on the server is the newest", landed[landed.length - 1] === "home:v3")
  check("idle once all have landed", !q.busy())

  landed.length = 0
  await Promise.all([q.save({ page: "home", body: "v3" })])
  check("a write equal to the one just written is not sent", landed.length === 0, landed)

  /* Another page in between: the settings go with every page's write, so nothing jumps the queue. */
  landed.length = 0
  const p1 = q.save({ page: "home", body: "h1" })
  const p2 = q.save({ page: "about", body: "a1" })
  const p3 = q.save({ page: "home", body: "h2" })
  await Promise.all([p1, p2, p3])
  check("a newer write for a page never jumps ahead of another page's", landed.join() === "home:h1,about:a1,home:h2", landed)

  let waited = false
  const slow = q.save({ page: "home", body: "h3" })
  await q.idle().then(() => { waited = true })
  await slow
  check("idle() waits for a write on its way", waited)
}

console.log("\nORDER: a write that throws does not stop the ones after it")
{
  const sent: string[] = []
  const q = createSaveQueue<Snap, boolean>(async (s) => {
    sent.push(s.body)
    if (s.body === "bad") throw new Error("dropped")
    return true
  })
  const bad = q.save({ page: "home", body: "bad" }).then(() => "resolved", () => "rejected")
  const good = q.save({ page: "home", body: "good" })
  check("the failed one rejects", (await bad) === "rejected")
  check("and the next is still written", (await good) === true && sent.join() === "bad,good", sent)
}

console.log("\nRETRY: later each time, never past half a minute")
{
  const d = [0, 1, 2, 3, 4, 5, 9].map(retryDelayMs)
  check("2s, 4s, 8s, 16s, then 30s", d.join() === "2000,4000,8000,16000,30000,30000,30000", d)
}

console.log("\nUNDO: one step per thing edited, and a step of its own ends the run")
{
  let page = { heading: "Spring", colour: "red", sections: 3 }
  const history: (typeof page)[] = []
  const run = createUndoRun(() => history.push(page), 40)
  const set = (key: keyof typeof page, v: never) => { run.step(`section:hero:${key}`); page = { ...page, [key]: v } }
  for (const v of "Summer days are here, and they are long".split(" ")) set("heading", v as never)
  check("a run of keys in one field is one step", history.length === 1 && history[0].heading === "Spring", history.length)
  set("colour", "blue" as never)
  check("another field straight after is a step of its own", history.length === 2 && history[1].colour === "red" && history[1].heading !== "Spring")
  set("colour", "green" as never)
  check("and the same field again joins it", history.length === 2)
  /* A delete records its own step and cuts the run (pushUndo in the editor). */
  history.push(page)
  run.cut()
  page = { ...page, sections: 2 }
  set("colour", "black" as never)
  check("typing after a delete is a step of its own", history.length === 4 && history[3].sections === 2, history.length)
  /* An edit that names nothing joins whatever run is open. */
  run.step()
  check("an edit that names nothing joins the open run", history.length === 4)
  await sleep(60)
  set("colour", "white" as never)
  check("after a quiet moment the same field is a new step", history.length === 5)
  /* An assistant's run holds its one step, and a cut keeps the hold. */
  run.hold()
  run.cut()
  run.aiStep()
  check("a cut does not end an assistant's hold", run.held() && history.length === 5)
  run.end()
  check("end does", !run.held())
}

console.log("\nWIRED: the editor's saves")
{
  const editor = read("app/website-builder/editor/[installId]/page.tsx")
  const save = editor.slice(editor.indexOf("const saveDraft = async"), editor.indexOf("const publishChanges = async"))
  const publish = editor.slice(editor.indexOf("const publishChanges = async"), editor.indexOf("const handleSave = async"))
  check("every edit is counted", /const setIsDirty = useCallback\(\(dirty: boolean\) => \{\s*if \(dirty\) editRev\.current\+\+/.test(editor))
  check("a save takes its snapshot when asked, and goes through the queue", /const snap: DraftSnapshot = \{ page: currentPage, sections, settings: settingsDraft, rev: editRev\.current \}\s*\n\s*const result = await draftQueue\.save\(snap\)/.test(save))
  check("the queue keeps one target per page and skips a write of the same objects", /sameTarget: \(a, b\) => a\.page === b\.page/.test(editor) && /equal: \(a, b\) => a\.sections === b\.sections && a\.settings === b\.settings/.test(editor))
  check("Saved only for what is on screen, else another save is asked for", /if \(writtenIsCurrent\(snap\)\) setIsDirty\(false\)\s*\n\s*else retryTimer\.current = setTimeout\(retrySaveNow, AUTOSAVE_DELAY_MS\)/.test(save))
  check("and the edit count, the sections and the settings must all be the ones written", /editRev\.current === snap\.rev && sectionsRef\.current === snap\.sections && settingsRef\.current === snap\.settings/.test(editor))
  check("a failure says why and is tried again when the reason passes", /setSaveProblem\(result\.problem\)\s*\n\s*scheduleRetry\(result\.problem\)/.test(save) && /if \(problem\.action !== "retry"\) return/.test(editor) && /retryDelayMs\(retryAttempt\.current\+\+\)/.test(editor))
  check("the retry keeps autosave's holds", /if \(!isDirtyRef\.current \|\| syncConflictRef\.current \|\| switchingPage\.current \|\| restoreHold\.current\) return/.test(editor))
  check("back online, it is tried at once; the listener and the timer go with the editor", /window\.addEventListener\("online", online\)/.test(editor) && /window\.removeEventListener\("online", online\)\s*\n\s*if \(retryTimer\.current\) clearTimeout\(retryTimer\.current\)/.test(editor))
  check("Publish writes through the same queue, and keeps an edit made while it ran unsaved", /const written = await draftQueue\.save\(snap\)/.test(publish) && /if \(writtenIsCurrent\(snap\)\) \{\s*setIsDirty\(false\)\s*setUnpublished\(false\)\s*\}/.test(publish))
  check("the settings, and the header and footer, are sent only when not the ones last written", /settingsSame \? Promise\.resolve\(new Response\(null, \{ status: 200 \}\)\) : putJsonWithRetry/.test(editor) && /chromeSame \? Promise\.resolve\(true\) : syncHeaderFooterToAllPages/.test(editor) && /if \(settingsRes\.ok\) last\.settings = settingsKey\s*\n\s*if \(chromeOk\) last\.chrome = chromeKey/.test(editor))
  check("  a deleted header or footer counts as a change", /\.\.\.g\.overlay, "\|", gone\.header, gone\.footer, gone\.overlay\]/.test(editor))
  check("the header and footer copy is of the snapshot's page", /syncHeaderFooterToAllPages\("draft", snap\.sections, snap\.page\)/.test(editor) && /current_page: page,/.test(editor))
  check("leaving still asks while something is unsaved", /if \(isDirty \|\| codeDirty \|\| saving \|\| publishing\) \{ e\.preventDefault\(\); e\.returnValue = "" \}/.test(editor))
}

console.log("\nWIRED: undo by reference, keyed by what is edited")
{
  const editor = read("app/website-builder/editor/[installId]/page.tsx")
  check("a step holds the page itself, not a JSON copy", /sections: sectionsRef\.current,\s*\n\s*settings: settingsRef\.current,/.test(editor) && !/JSON\.parse\(JSON\.stringify\(sectionsRef\.current\)\)/.test(editor))
  check("a step of its own cuts the run", /const pushUndo = useCallback\(\(\) => \{[\s\S]{0,500}cutUndoRun\.current\(\)/.test(editor) && /cutUndoRun\.current = undoRun\.cut/.test(editor))
  check("theme, section and block settings name what they edit", /debouncedPushUndo\(`theme:\$\{key\}`\)/.test(editor) && /debouncedPushUndo\(`section:\$\{sectionId\}:\$\{key\}`\)/.test(editor) && (editor.match(/debouncedPushUndo\(`block:\$\{sectionId\}:\$\{blockKey\}:\$\{key\}`\)/g) ?? []).length === 2)
}

console.log("\nSTABLE: what draws again when one section changes")
{
  const list = read("components/website-builder/editor/sections-list.tsx")
  const editor = read("app/website-builder/editor/[installId]/page.tsx")
  const reorder = read("components/website-builder/editor/controls/use-reorder.ts")
  check("a sidebar row is memoised on what it shows", /const ListRow = React\.memo\(/.test(list) && /a\.section === b\.section &&\s*\n\s*a\.displayName === b\.displayName &&\s*\n\s*a\.isSelected === b\.isSelected/.test(list) && /a\.index === b\.index/.test(list))
  check("with handlers made once, reading the latest props", /const handlers = React\.useMemo<RowHandlers>\(/.test(list) && /select: \(id\) => latest\.current\.onSelect\(id\)/.test(list) && /\n\s*\[\],\n\s*\)/.test(list))
  check("both lists of rows use it, keyed by the section's id", (list.match(/<ListRow\s/g) ?? []).length === 2 && (list.match(/key=\{s\.id\} data-section-row-wrap=\{s\.id\}/g) ?? []).length === 1 && /key=\{s\.id\}\s*\n\s*data-section-row-wrap=\{s\.id\}/.test(list))
  check("the insert lines are memoised on their place", /const InsertSectionDivider = React\.memo\(function InsertSectionDivider\(\{ at, h \}/.test(list) && /<InsertSectionDivider at=\{i \+ 1\} h=\{handlers\} \/>/.test(list))
  check("a grip reads the list's length when pressed", /countRef\.current < 2/.test(reorder) && /to >= countRef\.current/.test(reorder))
  check("the canvas's insert strips are memoised on their place", /const CanvasInsertStrip = memo\(function CanvasInsertStrip\(\{ at, onAdd \}/.test(editor) && /<CanvasInsertStrip at=\{gap\} onAdd=\{onAddSectionAt\} \/>/.test(editor))
  check("the canvas's header logo is keyed on the header", /const canvasHeaderLogo = useMemo\(\(\) => headerLogoOf\(canvasHeader \? \[canvasHeader\] : \[\]\), \[canvasHeader\]\)/.test(editor))
  check("and the menus too", /const canvasMenus = useMemo\(\(\) => siteMenus\(activeThemeSettings, menuHeader \? \[menuHeader\] : \[\]\), \[activeThemeSettings, menuHeader\]\)/.test(editor))
  check("the stuck layer net sends a resize only for a lock that moved the layout", /if \(cleared\.some\(\(what\) => !\/overscroll-behavior\|touch-action\/\.test\(what\)\)\) window\.dispatchEvent\(new Event\("resize"\)\)/.test(editor))
  check("canvas sections keep their id as their key", (editor.match(/<SectionRenderer\s*\n\s*key=\{section\.id\}/g) ?? []).length >= 2)
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
