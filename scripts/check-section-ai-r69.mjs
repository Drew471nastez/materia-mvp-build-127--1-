/**
 * ===========================================================================
 *  ROUND 69: EDIT OR NEW SECTION, SAID BEFORE ENTER, IN A REAL BROWSER
 * ===========================================================================
 * Mounts the real ThemeChat the way the editor does (scripts/render-ask-ai.tsx)
 * at 1280 (the dock) and 390 (the phone's sheet), with the network stubbed,
 * types requests into the real box and measures what the chip says, what a
 * tap does, what each request carries to the router and the run, and that a
 * finished change is offered as Keep and Discard. Screenshots at
 * deviceScaleFactor 2 go to SHOTS_DIR.
 *
 *   SHOTS_DIR=/some/dir node scripts/check-section-ai-r69.mjs
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) { console.error(`No browser at ${CHROMIUM}.`); process.exit(1) }
const css = await appCss(root)
const inter = interFaces(root)
const stubs = join(root, ".section-ai-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-section-ai-")), "shots")
mkdirSync(shots, { recursive: true })

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* The router answers as the real one does for an aim (agent/router.ts); the run streams one change and a reply. */
const PRELUDE = `
window.__decides = []; window.__posts = [];
(function () {
  var json = function (body, status) { return Promise.resolve(new Response(JSON.stringify(body), { status: status || 200, headers: { "content-type": "application/json" } })) };
  var enc = new TextEncoder();
  window.fetch = function (input, init) {
    var url = String(input && input.url ? input.url : input);
    var method = (init && init.method) || "GET";
    if (url.indexOf("/api/website-builder/transcribe") === 0) return json({ available: false });
    if (url.indexOf("/chat/conversations") >= 0) return json({ conversations: [], earlier: null });
    if (url.indexOf("/chat") >= 0 && method === "GET") return json({ conversation: null, earlier: false, history: "ready", messages: [] });
    if (url.indexOf("/agent/decide") >= 0) {
      var asked = JSON.parse(init.body);
      window.__decides.push(asked);
      var isNew = asked.aim && asked.aim.kind === "new";
      return json({ agent: "page", target: isNew ? "section" : asked.scoped ? "section" : "page", lock: !isNew && !!asked.scoped, codeFocus: false });
    }
    if (url.indexOf("/agent") >= 0) {
      var body = JSON.parse(init.body);
      window.__posts.push({ prompt: body.prompt, aim: body.aim || null, lockToSelection: body.lockToSelection, selectedSectionId: body.selectedSectionId });
      var isNew = body.aim && body.aim.kind === "new";
      var lines = [
        { type: "conversation", id: "33333333-3333-4333-8333-333333333333", title: body.prompt },
        { type: "recorded", messageId: "44444444-4444-4444-8444-444444444441" },
        { type: "step", id: "t1", label: "Read the page", state: "running" },
        { type: "step", id: "t1", label: "Read the page", state: "done" },
        isNew
          ? { type: "op", op: { kind: "add_section", id: "newsletter-new-1", sectionType: "newsletter", index: 2 }, label: "Added a signup" }
          : { type: "op", op: { kind: "update_section", id: "s2", settings: { heading: "Slow mornings, handmade" } }, label: "Shortened the heading" },
        { type: "progress", phase: "done", label: "Done", sections: [isNew ? "Newsletter" : "Hero"] },
        { type: "message", text: isNew ? "Added a signup below the hero, in your colours." : "Shortened the hero heading to five words." }
      ];
      return new Promise(function (resolve) {
        setTimeout(function () {
          var stream = new ReadableStream({ start: function (c) { var i = 0; var next = function () { if (i >= lines.length) { c.close(); return } c.enqueue(enc.encode(JSON.stringify(lines[i++]) + "\\n")); setTimeout(next, 90) }; next() } });
          resolve(new Response(stream, { status: 200, headers: { "content-type": "application/x-ndjson" } }));
        }, 200);
      });
    }
    return json({});
  };
  window.SpeechRecognition = undefined; window.webkitSpeechRecognition = undefined;
})();
`

/* What the chip row says and how it sits. */
const chipState = (p) =>
  p.evaluate(() => {
    const rows = [...document.querySelectorAll("[data-ask-scope-row]")]
    const row = rows.find((r) => r.getBoundingClientRect().height > 0)
    if (!row) return null
    const chip = row.querySelector("[data-ask-scope]")
    const r = row.getBoundingClientRect()
    const c = chip ? chip.getBoundingClientRect() : null
    const sw = row.querySelector("[data-ask-aim-switch]")
    const place = row.querySelector("[data-ask-aim-place]")
    return {
      scope: chip ? chip.getAttribute("data-ask-scope") : null,
      text: row.textContent.replace(/\s+/g, " ").trim(),
      rowH: Math.round(r.height),
      chipH: c ? Math.round(c.height) : 0,
      overflow: row.scrollWidth > row.clientWidth + 1,
      inside: r.left >= 0 && r.right <= window.innerWidth,
      switch: sw ? sw.textContent.trim() : null,
      switchH: sw ? Math.round(sw.getBoundingClientRect().height) : 0,
      place: !!place,
    }
  })
const field = (phone) => (phone ? "[data-ask-sheet] textarea" : "[data-ask-pill] textarea")
async function setDraft(p, phone, text) {
  await p.click(field(phone), { clickCount: 3 })
  await p.evaluate((sel) => { const t = document.querySelector(sel); t.focus(); t.select() }, field(phone))
  await p.keyboard.press("Backspace")
  if (text) await p.type(field(phone), text, { delay: 2 })
  await sleep(250)
}

async function run(browser, { width, height, phone }) {
  const label = phone ? "phone-390" : `desktop-${width}`
  console.log(`\n${label}`)
  const p = await browser.newPage()
  const errors = []
  p.on("pageerror", (e) => errors.push(e.message))
  if (process.env.DEBUG) p.on("console", (m) => console.log("  console:", m.text().slice(0, 300)))
  await p.setViewport({ width, height, deviceScaleFactor: 2, ...(phone ? { isMobile: true, hasTouch: true } : {}) })
  await p.goto(`file://${join(stubs, "index.html")}${phone ? "#phone" : "#desktop"}`)
  await p.waitForSelector(phone ? "[data-ask-sheet] textarea" : "[data-ask-pill] textarea", { timeout: 30000 }).catch(() => {})
  await sleep(800)
  if (errors.length) console.log("  page errors:", errors.slice(0, 3))
  if (process.env.DEBUG) console.log(await p.evaluate(() => String(typeof window.__runs) + " app:" + (document.getElementById("app")?.innerHTML.length) + " scripts:" + document.scripts.length + " " + [...new Set([...document.querySelectorAll("*")].flatMap((e) => e.getAttributeNames().filter((n) => n.startsWith("data-ask"))))].join(" ") + " | " + document.body.innerHTML.length))
  if (!phone) {
    await p.click("[data-ask-pill] textarea")
    await sleep(600)
  }
  const shot = async (name) => p.screenshot({ path: join(shots, `section-ai-r69-${label}-${name}.png`) })

  /* 1. A section open, nothing typed: Editing: Hero, and the switch beside it. */
  let s = await chipState(p)
  expect(s?.scope === "locked" && /^Editing: Hero/.test(s.text) && s.switch === "New section instead", "Hero open: Editing: Hero, with New section instead beside it", s)
  expect(!!s && !s.overflow && s.inside, "the row fits, nothing sideways", s)
  if (phone) expect(!!s && s.chipH >= 36, "on a phone the chip is the phone's 36px row and the switch reaches 44px through its box", s)
  await shot("1-editing")

  /* 2. Words that ask for a new one. */
  await setDraft(p, phone, "add a newsletter signup below this")
  s = await chipState(p)
  expect(s?.scope === "new" && /New section below Hero/.test(s.text) && s.switch === "Edit Hero instead" && s.place, "typed a new section: New section below Hero, the place button, Edit Hero instead", s)
  const placeholder = await p.$eval(field(phone), (t) => t.getAttribute("placeholder"))
  await shot("2-new-below")

  /* 3. The place flips. */
  await p.click("[data-ask-aim-place]")
  await sleep(200)
  s = await chipState(p)
  expect(/New section above Hero/.test(s?.text ?? ""), "a tap on the arrows: above Hero", s?.text)
  await shot("3-new-above")
  await p.click("[data-ask-aim-place]")
  await sleep(150)

  /* 4. Edit Hero instead, then back. */
  await p.click("[data-ask-aim-switch]")
  await sleep(200)
  s = await chipState(p)
  expect(s?.scope === "locked" && /^Editing: Hero/.test(s.text), "Edit Hero instead: back to Editing: Hero, the words unchanged", s)
  await p.click("[data-ask-aim-switch]")
  await sleep(200)
  s = await chipState(p)
  expect(s?.scope === "new", "and New section instead again", s?.scope)

  /* 5. Send it: the router and the run are told a new section, never locked to the hero. */
  await p.focus(field(phone))
  await p.keyboard.press("Enter")
  await sleep(2200)
  const sentNew = await p.evaluate(() => ({ decide: window.__decides[window.__decides.length - 1], post: window.__posts[window.__posts.length - 1] }))
  expect(sentNew.decide?.aim?.kind === "new" && sentNew.post?.aim?.kind === "new" && sentNew.post?.aim?.index === 2 && sentNew.post?.lockToSelection === false, "sent: aim new at index 2 to the router and the run, not locked", sentNew)
  const review = await p.evaluate(() => {
    const keep = [...document.querySelectorAll("[data-ask-keep]")].pop()
    const discard = [...document.querySelectorAll("[data-ask-discard]")].pop()
    const b = (el) => (el ? { text: el.textContent.trim(), h: Math.round(el.getBoundingClientRect().height), bg: getComputedStyle(el).backgroundColor } : null)
    return { keep: b(keep), discard: b(discard) }
  })
  expect(review.keep?.text === "Keep" && review.discard?.text === "Discard", "the change is offered as Keep and Discard", review)
  expect(review.keep?.bg === "rgb(26, 26, 46)", "Keep is the builder's near black #1a1a2e", review.keep?.bg)
  s = await chipState(p)
  expect(s?.scope === "locked", "after sending, the chip reads the next message afresh (Editing: Hero)", s?.scope)
  await shot("4-keep-discard")
  await p.click("[data-ask-discard]")
  await sleep(300)
  const undone = await p.evaluate(() => ({ undone: window.__undone.length, runs: window.__runs.length, review: document.querySelectorAll("[data-ask-review]").length }))
  expect(undone.undone === 1 && undone.review === 0, "Discard takes the run back through the editor's undo, and the choice goes", undone)

  /* 6. An edit, sent: locked, aim edit. */
  await setDraft(p, phone, "make the heading shorter")
  s = await chipState(p)
  expect(s?.scope === "locked", "an edit reads as Editing: Hero", s?.scope)
  await p.focus(field(phone))
  await p.keyboard.press("Enter")
  await sleep(2200)
  const sentEdit = await p.evaluate(() => window.__posts[window.__posts.length - 1])
  expect(sentEdit?.aim?.kind === "edit" && sentEdit?.lockToSelection === true, "sent: aim edit, locked to the hero", sentEdit)
  await p.click("[data-ask-keep]")
  await sleep(250)
  const kept = await p.evaluate(() => ({ review: document.querySelectorAll("[data-ask-review]").length, undo: !!document.querySelector("[data-ask-undo]") }))
  expect(kept.review === 0 && kept.undo, "Keep closes the choice, and Undo stays in the line under it", kept)

  /* 7. Nothing selected: a section asked for is placed at the top, and the arrows send it to the end. */
  await p.evaluate(() => window.__setSelected(undefined))
  await sleep(300)
  await setDraft(p, phone, "add a section with our opening hours")
  s = await chipState(p)
  expect(s?.scope === "new" && /New section at the top of the page/.test(s.text), "nothing selected: New section at the top of the page", s)
  await shot("5-nothing-selected")
  await p.click("[data-ask-aim-place]")
  await sleep(200)
  s = await chipState(p)
  expect(/at the end of the page/.test(s?.text ?? ""), "the arrows: at the end of the page", s?.text)
  await setDraft(p, phone, "what fonts does this site use?")
  s = await chipState(p)
  expect(s === null, "a question with nothing selected shows no chip", s)

  expect(errors.length === 0, "no page errors", errors)
  console.log(`  measures ${JSON.stringify({ placeholder })}`)
  await p.close()
}

try {
  writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/"
export const useRouter = () => ({ push() {}, prefetch() {}, replace() {}, refresh() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({})
export const redirect = () => {}
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest }, children) })
`)
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-ask-ai.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.section-ai-probe/navigation.js", "next/link": "./.section-ai-probe/link.jsx" },
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "app.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  writeFileSync(join(stubs, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${inter}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style><script>${PRELUDE}</script></head><body><div id="app"></div><script src="app.js"></script></body></html>`)
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
  try {
    await run(browser, { width: 1280, height: 800, phone: false })
    await run(browser, { width: 390, height: 844, phone: true })
  } finally {
    await browser.close()
  }
} finally {
  if (!process.env.KEEP) rmSync(stubs, { recursive: true, force: true })
}
console.log(`\nscreenshots in ${shots}`)
if (broken) { console.error(`\n${broken} check(s) failed\n`); process.exit(1) }
console.log("\nall checks passed\n")
