/**
 * A push reaches an open editor without a reload, and a pile of them lands
 * once, and the screens that waited on a slow server always end.
 *
 *   The follow loop's decisions (lib/website-builder/live-follow.ts): a tick
 *   that ran long after it was due is an absence even with no
 *   visibilitychange, a full page reads the next in the same pass, the
 *   cursor never goes back or past a page that failed, an apply that never
 *   answers has a ceiling, and nothing connected is asked about again.
 *
 *   The loop itself, driven against an in-memory log the way the editor
 *   reads it: a lid closed for an hour over 95 lines is one pass, applied
 *   once, not five reloads of the canvas.
 *
 *   The wiring, read from the source: online, pageshow and the native app's
 *   return wake the loop; every read a push waits on has an end; a failed
 *   draft read still lands the push; a dropped Storelib AI stream reads the
 *   theme back; the session recovery and the stalled OnePage load both end
 *   in something to press.
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  ACTIVITY_PAGE,
  APPLY_CEILING_MS,
  BRIEF_RECHECK_MS,
  BRIEF_WAKE_GAP_MS,
  CATCH_UP_AWAY_MS,
  CATCH_UP_PAGES,
  LATE_WINDOW_MS,
  SEEN_MAX,
  briefDue,
  isPile,
  lateRows,
  mergeLines,
  nextCursor,
  readMore,
  remember,
  slept,
  withinTime,
} from "@/lib/website-builder/live-follow"
import { reloadWhileAway } from "@/lib/ui/new-deploy"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nAn absence the browser did not announce")
{
  const due = 1_000_000
  check("a tick a second late is late, not away", !slept(due, due + 1_000))
  check("a tick an hour late slept through it", slept(due, due + 3_600_000))
  check("the line is the catch-up's own eight seconds", CATCH_UP_AWAY_MS === 8_000 && slept(due, due + CATCH_UP_AWAY_MS) && !slept(due, due + CATCH_UP_AWAY_MS - 1))
  check("nothing scheduled yet is not an absence", !slept(0, due))
}

console.log("\nA pile is read whole, then applied once")
{
  check("a full page reads the next", readMore(ACTIVITY_PAGE, 1))
  check("a short page is the end", !readMore(ACTIVITY_PAGE - 1, 1))
  check("never more than the pass holds", !readMore(ACTIVITY_PAGE, CATCH_UP_PAGES))
  check("one page from a person at the screen is not a pile", !isPile({ pending: false, slept: false, pagesRead: 1 }))
  check("two pages are a pile, however it came", isPile({ pending: false, slept: false, pagesRead: 2 }))
  check("a return after a while is a pile", isPile({ pending: true, slept: false, pagesRead: 1 }) && isPile({ pending: false, slept: true, pagesRead: 1 }))
}

console.log("\nThe cursor")
{
  check("first answer sets it", nextCursor(null, 40, false, 0) === 40)
  check("moves to what was read", nextCursor(40, 60, false, 20) === 60)
  check("never goes back", nextCursor(80, 60, false, 3) === 80)
  check("a failed read with nothing in it stays, so it is asked again", nextCursor(40, 40, true, 0) === 40)
  check("a failed later page keeps the pages read before it", nextCursor(40, 80, true, 40) === 80)
  check("nothing read leaves it", nextCursor(40, null, false, 0) === 40)
}

console.log("\nNothing connected is asked about again")
{
  const t = 5_000_000
  check("once a minute while visible", !briefDue(t, t + BRIEF_RECHECK_MS - 1, "timer") && briefDue(t, t + BRIEF_RECHECK_MS, "timer") && BRIEF_RECHECK_MS === 60_000)
  check("a return asks sooner, but not on every focus", briefDue(t, t + BRIEF_WAKE_GAP_MS, "wake") && !briefDue(t, t + 2_000, "wake"))
}

console.log("\nA line that committed after a later one is applied, once")
{
  const now = Date.parse("2026-10-28T12:00:30Z")
  const at = (s: number) => new Date(now - s * 1000).toISOString()
  const back = [{ id: 102, created_at: at(1) }, { id: 101, created_at: at(2) }, { id: 90, created_at: at(LATE_WINDOW_MS / 1000 + 5) }]
  check("the look back keeps the young rows, oldest first", JSON.stringify(lateRows(back, now).map((r) => r.id)) === "[101,102]")
  check("  and never a row with no time", lateRows([{ id: 5, created_at: null }], now).length === 0)
  const seen = new Set<number>([102])
  const lines = mergeLines([{ id: 101 }, { id: 102 }], [{ id: 103 }], seen, 100)
  check("the late one is taken, the applied one is not, oldest first", JSON.stringify(lines.map((r) => r.id)) === "[101,103]")
  check("nothing at or below where the editor started", mergeLines([{ id: 99 }, { id: 100 }], [], new Set(), 100).length === 0)
  check("a line read twice in one pass is one line", mergeLines([{ id: 7 }], [{ id: 7 }], new Set(), null).length === 1)
  const many = new Set<number>()
  remember(many, Array.from({ length: SEEN_MAX + 50 }, (_, i) => i + 1))
  check("the ids kept are bounded, the newest kept", many.size === SEEN_MAX && many.has(SEEN_MAX + 50) && !many.has(1))
}

/** The editor's loop against an in-memory log: the same decisions in the same order as site-connections.tsx. */
async function drive(log: number[], cursor: number, opts: { pending: boolean; dueAt: number; now: number; applyHangs?: boolean; ceiling?: number }) {
  const applied: { ids: number[]; catchUp: boolean }[] = []
  let stale = 0
  const away = slept(opts.dueAt, opts.now)
  const events: number[] = []
  let after = cursor
  let pages = 0
  while (pages < CATCH_UP_PAGES) {
    const batch = log.filter((id) => id > after).slice(0, ACTIVITY_PAGE)
    if (batch.length) after = batch[batch.length - 1]
    events.push(...batch)
    pages++
    if (!readMore(batch.length, pages)) break
  }
  const catchUp = isPile({ pending: opts.pending, slept: away, pagesRead: pages })
  if (events.length) {
    const applying = opts.applyHangs ? new Promise<void>(() => {}) : Promise.resolve().then(() => { applied.push({ ids: events.slice(), catchUp }) })
    if ((await withinTime(applying, opts.ceiling ?? APPLY_CEILING_MS)) === "late") stale++
  }
  return { applied, stale, cursor: nextCursor(cursor, after, false, events.length) }
}

async function loop() {
  console.log("\nAn hour away with the lid closed, 95 lines behind")
  const log = Array.from({ length: 95 }, (_, i) => 101 + i)
  const r = await drive(log, 100, { pending: false, dueAt: 1_000, now: 1_000 + 3_600_000 })
  check("one pass, applied once", r.applied.length === 1, r.applied.length)
  check("  with every line in it, oldest first", r.applied[0]?.ids.length === 95 && r.applied[0].ids[0] === 101 && r.applied[0].ids[94] === 195)
  check("  as the catch-up, though no visibilitychange said so", r.applied[0]?.catchUp === true)
  check("  and the cursor at the last line", r.cursor === 195)

  console.log("\nA long push while somebody watches")
  const busy = Array.from({ length: 45 }, (_, i) => 201 + i)
  const b = await drive(busy, 200, { pending: false, dueAt: 10_000, now: 10_100 })
  check("three pages read and applied together", b.applied.length === 1 && b.applied[0].ids.length === 45 && b.applied[0].catchUp)
  const one = await drive([301, 302], 300, { pending: false, dueAt: 10_000, now: 10_100 })
  check("two lines are drawn as they come, not as a pile", one.applied.length === 1 && one.applied[0].catchUp === false)

  console.log("\nTwo writers at once: 102 is read before 101 commits")
  {
    /* The editor's state across passes, as site-connections.tsx keeps it. */
    const seen = new Set<number>()
    const floor = 100
    const applied: number[] = []
    const t = Date.parse("2026-10-28T12:00:00Z")
    const committed = [{ id: 102, created_at: new Date(t).toISOString() }]
    const pass = (now: number, cursor: number) => {
      const fresh = committed.filter((r) => r.id > cursor).sort((a, b) => a.id - b.id)
      const late = lateRows(committed.filter((r) => r.id <= cursor).sort((a, b) => b.id - a.id).slice(0, 20), now)
      const lines = mergeLines(late, fresh, seen, floor)
      remember(seen, lines.map((r) => r.id))
      applied.push(...lines.map((r) => r.id))
      return nextCursor(cursor, fresh.length ? fresh[fresh.length - 1].id : cursor, false, fresh.length) ?? cursor
    }
    let cursor = pass(t + 500, floor)
    committed.push({ id: 101, created_at: new Date(t - 50).toISOString() })
    cursor = pass(t + 1_500, cursor)
    cursor = pass(t + 6_500, cursor)
    cursor = pass(t + 12_000, cursor)
    check("101 is applied though the cursor had passed it", applied.includes(101), applied)
    check("  every line exactly once", JSON.stringify(applied) === "[102,101]", applied)
    check("  and the cursor stays at the newest", cursor === 102)
  }

  console.log("\nAn apply that never answers")
  const t0 = Date.now()
  const h = await drive([401], 400, { pending: false, dueAt: 10_000, now: 10_100, applyHangs: true, ceiling: 30 })
  check("the loop goes on after the ceiling", Date.now() - t0 < 1_000)
  check("  the theme is read again instead", h.stale === 1)
  check("  and the cursor moves, so the line is not applied twice", h.cursor === 401)
  check("the ceiling is long enough for a slow read and short enough to notice", APPLY_CEILING_MS >= 15_000 && APPLY_CEILING_MS <= 30_000)
  let rejected = false
  await withinTime(Promise.reject(new Error("x")), 1_000).catch(() => { rejected = true })
  check("a throw is still a throw (the editor reads the theme again for it)", rejected)
}

function wiring() {
  console.log("\nThe loop wakes for every way back")
  const hook = read("components/website-builder/site-connections.tsx")
  check("back online", /window\.addEventListener\("online", online\)/.test(hook) && /window\.removeEventListener\("online", online\)/.test(hook))
  check("restored from the back and forward cache", /window\.addEventListener\("pageshow", shown\)/.test(hook) && /if \(e\.persisted\)/.test(hook))
  check("the native app back to the front, and going to the back", /App\.addListener\("appStateChange"/.test(hook) && /const offNative = onNativeAppState\(/.test(hook) && /offNative\(\)/.test(hook))
  check("a timer that slept is an absence", /const away = slept\(dueAt, Date\.now\(\), CATCH_UP_AWAY_MS\)/.test(hook) && /dueAt = Date\.now\(\) \+ ms/.test(hook))
  check("a full page reads on in the same pass", /while \(after !== null && pages < CATCH_UP_PAGES\)/.test(hook) && /if \(!readMore\(batch\.length, pages, CATCH_UP_PAGES, ACTIVITY_PAGE\)\) break/.test(hook))
  check("the apply has a ceiling", /withinTime\(run, APPLY_CEILING_MS\)\) === "late"/.test(hook))
  check("the cursor through nextCursor", /cursor\.current = nextCursor\(cursor\.current, after, retry, fresh\.length\)/.test(hook))
  check("nothing connected: the brief is asked again", /setBriefAsk\(\(n\) => n \+ 1\)/.test(hook) && /\[installId, recheck, briefAsk\]/.test(hook) && /if \(!installId \|\| connected \|\| missing \|\| !settled\) return/.test(hook))
  check("the restored page paints, and the browser has a moment, before the pile lands", /requestIdleCallback\(finish, \{ timeout: 800 \}\)/.test(hook) && /if \(catchUp\) await afterPaint\(\)/.test(hook))

  check("the look back every few seconds and on a return, each line once",
    /const look = pages === 0 && \(catchUp \|\| Date\.now\(\) - lookedBack >= LOOKBACK_EVERY_MS\)/.test(hook) && /\$\{look \? "&lookback=1" : ""\}/.test(hook) &&
      /const events = mergeLines\(late, fresh, seen\.current, floor\.current\)/.test(hook) && /remember\(seen\.current, events\.map\(\(ev\) => ev\.id\)\)/.test(hook))
  const route = read("app/api/website-builder/themes/[installId]/agent-activity/route.ts")
  check("  the route looks back down the same index, twenty rows, and a failed look back drops nothing",
    /\.lte\("id", after\)\.order\("id", \{ ascending: false \}\)\.limit\(20\)/.test(route) && /lateRows\(/.test(route) && /back && !back\.error \?/.test(route) && /events, late, sync_at/.test(route))

  console.log("\nThe ground under the editor, and no reload from under it")
  const ground = read("components/website-builder/editor-ground.tsx")
  check("the editor's grey under it however it was opened, never the bar's near black", /EDITOR_GROUND = "#eef1f5"/.test(ground) && /if \(!h\.style\.backgroundColor\) h\.style\.backgroundColor = EDITOR_GROUND/.test(ground) && /useLayoutEffect/.test(ground))
  check("  the same grey the frame and the head script paint", /bg-\[#eef1f5\]/.test(read("components/website-builder/editor-frame.tsx")) && read("app/layout.tsx").includes("_wb.style.backgroundColor='#eef1f5'"))
  check("the app does not reload in the background under the website builder", !reloadWhileAway("/website-builder/editor/0f0c0a5e-0000-4000-8000-000000000000", false) && !reloadWhileAway("/store/ana/themes/abc/editor", false))
  check("  nor under OnePage or checkout", !reloadWhileAway("/app/onepage", false) && !reloadWhileAway("/checkout/site", false))
  check("  nor anywhere with unsaved work", !reloadWhileAway("/app/products", true))
  check("  and elsewhere it still does", reloadWhileAway("/app", false) && reloadWhileAway("/app/products", false) && reloadWhileAway("/app/onepages-help", false))
  check("  the check is the one the listener uses", /reloadWhileAway\(window\.location\.pathname, !!leaveGuard\(\)\)/.test(read("lib/ui/new-deploy.ts")))

  console.log("\nWhat a push waits on has an end, and lands even when the draft read fails")
  const editor = read("app/website-builder/editor/[installId]/page.tsx")
  const texts = editor.slice(editor.indexOf("async function readThemeTexts"), editor.indexOf("async function readThemeTexts") + 1800)
  check("each file read", (texts.match(/signal: AbortSignal\.timeout\(PUSH_READ_MS\)/g) ?? []).length === 2, texts.length)
  check("the theme's sources", /files\?sources=1`, \{ cache: "no-store", signal: AbortSignal\.timeout\(PUSH_READ_MS\) \}/.test(editor))
  const load = editor.slice(editor.indexOf("const loadData = useCallback"), editor.indexOf("const loadData = useCallback") + 2400)
  check("a refused draft read still lands the push's files and lines", /if \(!res\.ok\) \{[\s\S]*?const alongside = afterQuietLoad\.current[\s\S]*?if \(alongside\) startTransition\(alongside\)[\s\S]*?return false\s*\}/.test(load))

  console.log("\nA Storelib AI run whose stream dropped")
  const chat = read("components/website-builder/theme-chat.tsx")
  check("the theme is read back at once and on the next return", /if \(!stopped && \(snapshotTaken \|\| wroteCode\)\) \{\s*onSourcesChanged\?\.\(\)/.test(chat) && /document\.addEventListener\("visibilitychange", again\)/.test(chat))
  check("  and after a refused run that had started", /if \(snapshotTaken \|\| wroteCode\) onSourcesChanged\?\.\(\)/.test(chat))
  check("  a written file counts", /wroteCode = true\s*onSourceWritten\?\.\(event\.path, event\.source\)/.test(chat))

  console.log("\nOnePage never spins for ever")
  const gate = read("components/native-auth-gate.tsx")
  /* Changed on purpose (round net-1028): the trip is a same origin form post (postSessionSync), so the tokens are never in an address Vercel logs. */
  check("the trip through sync-session has an end, and that end is Try again", /postSessionSync\(session, currentPath\)\s*\/\*[^*]*\*\/\s*window\.setTimeout\(\(\) => \{\s*if \(!cancelled\) setStuck\(true\)[\s\S]{0,80}\}, SYNC_NAVIGATION_MS\)/.test(gate) && /SYNC_NAVIGATION_MS = 12_000/.test(gate) && /Try again/.test(gate))
  check("  bounded per tab, so it is never a reload loop", /MAX_RECOVERIES = 2/.test(gate) && /noteRecovery\(\)\s*postSessionSync\(session, currentPath\)/.test(gate))
  const stage = read("components/app/app-stage.tsx")
  check("a press loaded as a document that never finishes gives way", /window\.location\.assign\(nav\.href as string\)[\s\S]{0,900}?timers\.push\(window\.setTimeout\(\(\) => \{\s*if \(getAppNavigation\(\) !== nav\) return\s*try \{ window\.stop\(\) \}[\s\S]{0,300}?\}, DOCUMENT_LOAD_CAP_MS\)\)/.test(stage) && /DOCUMENT_LOAD_CAP_MS = 15_000/.test(stage))
  const page = read("app/app/onepage/page.tsx")
  check("the editor's own reads end in the editor or an error, never a page that waits", /readTwice\(/.test(page) && /throw new Error\("The OnePage could not be made"\)/.test(page) && /if \(!user\) return <SessionRecovery \/>/.test(page))
}

async function main() {
  await loop()
  wiring()
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}
void main()
