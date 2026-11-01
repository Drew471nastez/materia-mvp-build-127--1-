/**
 * ===========================================================================
 *  NO PAGE OF THE BUILDER WAITS FOR GOOD (imported themes, 1 Nov 2026)
 * ===========================================================================
 * The owner (andrewrullz, a 157 section imported theme): every card in Add a
 * section stayed an empty grey box; a section added was not drawn in the
 * canvas; sections already on the page, the footer group among them, were
 * listed but not drawn. Production said "[compat-canvas] the page never said
 * it had drawn", and Supabase Auth and the database were answering the
 * editor's own requests (the theme's files, its stylesheets) in 10s and more.
 *
 * One cause under all three: a stylesheet in the head of a page the builder
 * writes that did not answer.
 *
 *   THE CARDS' PAGE waited for its load event before it drew a single card,
 *   and a stylesheet that never answers holds the load event for good
 *   (scripts/check-compat-stalls.mjs: 0 of 157 drawn after 15s, for a web
 *   font, a theme stylesheet the route draws, or 228 sheets with a few
 *   hanging). It now takes its document by the tag its srcdoc wrote, and
 *   after SHEET_WAIT_MS lets go of what has not come and draws.
 *   THE CANVAS PAGE's bridge is a script at the end of the page, and a
 *   stylesheet above it holds it: no "ready", so no change ever reached the
 *   page (scripts/check-canvas-stalls.mjs: the canvas never drew; a page
 *   rewritten by a push never came forward). CANVAS_SHEET_GUARD, first in
 *   its head, lets go of a stylesheet still on its way after SHEET_WAIT_MS.
 *   THE CHANGES' QUEUE held every change behind one that never ended. Each
 *   now has STEP_MS.
 *
 * Every wait cut short is said to /api/client-errors.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { runInNewContext } from "node:vm"
import { CANVAS_SHEET_GUARD, SHEET_WAIT_MS, releaseLateSheets, sheetName } from "@/lib/storelib-theme/compat/sheet-guard"
import { CANVAS_BRIDGE } from "@/lib/storelib-theme/compat/canvas-bridge"

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
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/* A document small enough to reason about: links with attributes, a head, insertion after and removal. */
type FakeLink = { tagName: "LINK"; attrs: Map<string, string>; sheet: object | null; __slDone?: boolean; parent: FakeHead | null; getAttribute(n: string): string | null; setAttribute(n: string, v: string): void; hasAttribute(n: string): boolean; readonly attributes: { name: string; value: string }[]; after(x: FakeLink): void; remove(): void; parentNode: FakeHead | null; nextSibling: FakeLink | null }
type FakeHead = { kids: FakeLink[]; insertBefore(x: FakeLink, ref: FakeLink | null): void; removeChild(x: FakeLink): void }
function fakeDoc(links: { href: string; sheet?: boolean; done?: boolean }[]) {
  const head: FakeHead = {
    kids: [],
    insertBefore(x, ref) { const i = ref ? head.kids.indexOf(ref) : -1; x.parent = head; if (i < 0) head.kids.push(x); else head.kids.splice(i, 0, x) },
    removeChild(x) { head.kids = head.kids.filter((k) => k !== x); x.parent = null },
  }
  const make = (): FakeLink => {
    const l: FakeLink = {
      tagName: "LINK", attrs: new Map(), sheet: null, parent: null,
      getAttribute: (n) => l.attrs.get(n) ?? null,
      setAttribute: (n, v) => { l.attrs.set(n, v) },
      hasAttribute: (n) => l.attrs.has(n),
      get attributes() { return [...l.attrs].map(([name, value]) => ({ name, value })) },
      after: (x) => { const i = head.kids.indexOf(l); x.parent = head; head.kids.splice(i + 1, 0, x) },
      remove: () => head.removeChild(l),
      get parentNode() { return l.parent },
      get nextSibling() { const i = head.kids.indexOf(l); return head.kids[i + 1] ?? null },
    }
    return l
  }
  for (const x of links) {
    const l = make()
    l.setAttribute("rel", "stylesheet")
    l.setAttribute("href", x.href)
    if (x.sheet) l.sheet = {}
    if (x.done) l.__slDone = true
    head.insertBefore(l, null)
  }
  const listeners: Record<string, ((e: { target: unknown }) => void)[]> = {}
  const doc = {
    readyState: "loading",
    head,
    createElement: () => make(),
    querySelectorAll: () => head.kids.filter((k) => k.getAttribute("rel") === "stylesheet" && k.getAttribute("href")),
    addEventListener: (t: string, f: (e: { target: unknown }) => void) => { (listeners[t] ??= []).push(f) },
  }
  return { doc, head, listeners }
}

console.log("\nA stylesheet still on its way is let go of (sheet-guard.ts)")
{
  const { doc, head } = fakeDoc([
    { href: "/api/site-theme/assets/i/edit.PASSPASSPASSPASSPASSPASSPASSPASS/theme.css?v=1", sheet: true },
    { href: "/api/site-theme/assets/i/edit.PASSPASSPASSPASSPASSPASSPASSPASS/drawn.css?v=2" },
    { href: "https://fonts.googleapis.com/css2?family=Poppins" },
    { href: "/api/site-theme/assets/i/edit.PASSPASSPASSPASSPASSPASSPASSPASS/gone.css" },
  ])
  const gone = head.kids[3]
  const late = releaseLateSheets(doc as never, (l) => l === (gone as never))
  check("the ones neither loaded nor failed are let go of, by name", late.join() === "drawn.css,css2", late)
  check("  never a pass or a query in what is said", !late.some((n) => /PASS|\?/.test(n)))
  check("  each put back as a copy in its own place, so the cascade is the same once it arrives", head.kids.map((k) => `${k.getAttribute("href")?.split("/").pop()}${k.hasAttribute("data-sl-released") ? "*" : ""}`).join() === "theme.css?v=1,drawn.css?v=2*,css2?family=Poppins*,gone.css", head.kids.map((k) => k.getAttribute("href")))
  check("  a loaded one and a failed one are left as they are", head.kids[0].sheet !== null && head.kids[3] === gone)
  check("  and nothing is let go of twice", releaseLateSheets(doc as never, (l) => l === (gone as never)).length === 0)
  check("a name is the file's, whatever the address", sheetName("/api/site-theme/assets/x/edit.abc/section-x.css?v=9#y") === "section-x.css")
  check("the wait is a few seconds, not for good", SHEET_WAIT_MS > 0 && SHEET_WAIT_MS <= 5000)
}

console.log("\nThe canvas page lets go of one too (CANVAS_SHEET_GUARD)")
{
  const body = CANVAS_SHEET_GUARD.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, "")
  let parses = true
  try { new Function(body) } catch { parses = false }
  check("the guard is a script that parses", parses)
  const { doc, head, listeners } = fakeDoc([{ href: "/a/edit.p/theme.css", sheet: true }, { href: "/a/edit.p/materia.css" }, { href: "/a/edit.p/answered-404.css" }])
  const timers: { f: () => void; ms: number }[] = []
  const posted: unknown[] = []
  runInNewContext(body, { document: doc, setTimeout: (f: () => void, ms: number) => timers.push({ f, ms }), parent: { postMessage: (m: unknown, to: string) => posted.push({ m, to }) }, window: {}, Array, String })
  /* The 404's own error event, heard in the capture phase as the page reads. */
  for (const f of listeners.error ?? []) f({ target: head.kids[2] })
  check("  it waits SHEET_WAIT_MS", timers.length === 1 && timers[0].ms === SHEET_WAIT_MS, timers.map((t) => t.ms))
  timers[0]?.f()
  check("  then lets go of the one still on its way, not one that answered or failed", head.kids.map((k) => k.hasAttribute("data-sl-released")).join() === "false,true,false", head.kids.map((k) => k.getAttribute("href")))
  check("  and tells the builder which", JSON.stringify(posted) === JSON.stringify([{ m: { storelib: 1, type: "slow-sheets", names: ["materia.css"] }, to: "*" }]), posted)
  const done = fakeDoc([{ href: "/a/x.css" }])
  done.doc.readyState = "complete"
  const t2: (() => void)[] = []
  runInNewContext(body, { document: done.doc, setTimeout: (f: () => void) => t2.push(f), parent: { postMessage: () => { throw new Error("said") } }, window: {}, Array, String })
  t2[0]?.()
  check("  a page already loaded is left alone", !done.head.kids[0].hasAttribute("data-sl-released"))
  const canvas = read("components/website-builder/compat/compat-canvas.tsx")
  check("it is the first thing in the canvas page's head, before the theme's stylesheets and scripts", /replace\(\/<head\\b\[\^>\]\*>\/i, \(m\) => `\$\{m\}\$\{CANVAS_SHEET_GUARD\}\$\{seed\}\$\{CANVAS_HEAD\}\$\{CANVAS_SHOWN\}`\)/.test(canvas))
  check("the editor says it to the error log", /m\.type === "slow-sheets"\) reportLoadProblem\("compat-canvas", `stylesheets did not answer/.test(canvas) && /m\.type === "slow-step"/.test(canvas))
  check("  from a frame of its own only", /\(slot \|\| keptRef\.current\.some\(\(x\) => frames\.current\.get\(x\.n\)\?\.contentWindow === e\.source\)\)/.test(canvas))
}

console.log("\nThe cards' page draws without its load event (compat-section-preview.tsx)")
{
  const src = read("components/website-builder/compat/compat-section-preview.tsx")
  const attach = src.slice(src.indexOf("  attach(frame: HTMLIFrameElement)"), src.indexOf("  setOpen(open: boolean)"))
  check("a document read but not loaded is not turned away", /doc\.readyState === "loading"\) return/.test(attach) && !/readyState !== "complete"\) return/.test(attach))
  check("  it is this sheet's by the tag its srcdoc wrote, not by its load event", /if \(!this\.isMine\(doc\)\) return/.test(attach) && !/loadedFrom/.test(src))
  check("  its stylesheets are waited for SHEET_WAIT_MS, then let go of", /if \(now - seen < SHEET_WAIT_MS\) return/.test(attach) && /const late = releaseLateSheets\(doc\)/.test(attach))
  check("  and the error log is told", /reportLoadProblem\("section-preview", `the cards' page did not load/.test(attach))
  check("  a stylesheet that comes after the cards are drawn has them measured again", /link\.addEventListener\("load", this\.sheetLoaded, \{ once: true \}\)/.test(attach) && /private readonly sheetLoaded = \(\) => \{[\s\S]{0,200}this\.fontsLoaded\(\)/.test(read("components/website-builder/compat/compat-section-preview.tsx")))
  check("the frame is looked at again until the sheet has its document, not only at its load event", /if \(sheet\.attached\) return window\.clearInterval\(t\)/.test(src) && /if \(frame\.current\) sheet\.attach\(frame\.current\)\n    \}, 250\)/.test(src))
  check("a kept theme is one drawn with the same asset version (the pass)", /const key = `\$\{installId\}\|\$\{assets\}\|/.test(src))
}

console.log("\nNo change holds the ones after it for good (canvas-bridge.ts)")
{
  const B = CANVAS_BRIDGE
  const at = B.indexOf("var STEP_MS")
  const code = B.slice(at, B.indexOf("};", B.indexOf("var bounded", at)) + 2)
  const timers: { f: () => void; ms: number }[] = []
  const said: unknown[] = []
  const ctx = { setTimeout: (f: () => void, ms: number) => { timers.push({ f, ms }); return timers.length }, clearTimeout: () => {}, post: (m: unknown) => said.push(m), Promise, out: null as unknown }
  runInNewContext(`${code}; out = { bounded: bounded, STEP_MS: STEP_MS };`, ctx)
  const { bounded, STEP_MS } = ctx.out as { bounded: (p: Promise<unknown>, w: string) => Promise<unknown>; STEP_MS: number }
  let ended = false
  void bounded(new Promise(() => {}), "patch").then(() => { ended = true })
  timers[0]?.f()
  await Promise.resolve()
  await Promise.resolve()
  check("a change that never ends lets the next go on after STEP_MS", ended && timers[0]?.ms === STEP_MS && STEP_MS <= 5000)
  check("  and says so", JSON.stringify(said) === JSON.stringify([{ type: "slow-step", what: "patch" }]), said)
  let failedWith: unknown = null
  await bounded(Promise.reject(new Error("x")), "section").catch((e) => { failedWith = e })
  check("  one that fails still fails (the page is drawn again)", failedWith instanceof Error)
  check("the patch, the section swaps and a restart are bounded", /return bounded\(Promise\.resolve\(patch\(m\)\), "patch"\)/.test(B) && (B.match(/bounded\(Promise\.resolve\(swap\(/g) ?? []).length === 2 && /return bounded\(swap\(id, html\), "restart"\)/.test(B))
  let parses = true
  try { new Function(B) } catch { parses = false }
  check("the bridge still parses", parses)
}

console.log("\nThe pass is known before the first draw (compat-files.ts)")
{
  const files = read("components/website-builder/compat/compat-files.ts")
  check("the pass is kept before the files are handed on, so no address is drawn without it and then moved", files.indexOf("passes.set(installId, d.asset_pass)") > 0 && files.indexOf("passes.set(installId, d.asset_pass)") < files.indexOf("return d.files ?? {}"))
  const route = read("app/api/site-theme/assets/[installId]/[version]/[...name]/route.ts")
  check("a draft version without its pass is still the published file, never the draft (9f71fbb3c kept)", /const draft = asked\.draft && isDraftAssetPass\(installId, asked\.pass\)/.test(route))
}

console.log("\nA page rewritten by a push lands whole (GitHub's version used)")
{
  const editor = read("app/website-builder/editor/[installId]/page.tsx")
  check("home rewritten whole is read again from the draft, header and footer with it", /page === null \|\| page === currentPageRef\.current \|\| page === "home"/.test(editor) && /if \(await loadData\(\{ quiet: true \}\) === false\) throw new Error\("Could not read the updated page"\)/.test(editor))
  check("  and the canvas draws a fresh document of it", /if \(importedNow && \(themeCode \|\| replacedHere \|\| \(many && !catchUp\)\)\) setReplaceDocument/.test(editor))
  const probe = read("scripts/check-canvas-stalls.mjs")
  check("  measured with a stylesheet of the new page that never answers (check-canvas-stalls.mjs replace-hang)", /replace-hang/.test(probe) && /replaced: true/.test(probe))
}

console.log("\nThe probes")
{
  const a = read("scripts/check-compat-stalls.mjs")
  const b = read("scripts/check-canvas-stalls.mjs")
  check("the cards: a hanging web font, a hanging and a 404 stylesheet, 228 sheets, slow files with their pass", ["font-hang", "asset-hang", "asset-404", "section-hang", "pass-late", "many-sheets"].every((s) => a.includes(`"${s}"`)))
  check("the canvas: a hanging head stylesheet, a hanging section stylesheet, a rewritten page", ["head-hang", "section-hang", "replace-hang"].every((s) => b.includes(s)))
  check("scripts/run-push-tests.mjs runs this file", /"tests\/compat-stalls\.test\.ts"/.test(read("scripts/run-push-tests.mjs")))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"))
  process.exit(1)
}
