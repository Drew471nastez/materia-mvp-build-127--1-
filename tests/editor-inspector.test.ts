/**
 * THE INSPECTOR OFF IS OFF, ON IS ON, AND THE EDITOR OPENS ON ONE WAIT
 *
 *   npx tsx tests/editor-inspector.test.ts
 *
 * The imported theme's bridge (lib/storelib-theme/compat/canvas-bridge.ts)
 * is run for real in Chromium when one is installed, on a page of three
 * sections, with the messages the editor sends; the rest is held to the
 * source. The whole editor is driven by scripts/check-editor-inspector.ts.
 */
import { existsSync, readFileSync } from "node:fs"
import { CANVAS_BRIDGE } from "../lib/storelib-theme/compat/canvas-bridge"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 300)}`}`)
}
const read = (p: string) => readFileSync(p, "utf8")

async function bridgeInBrowser() {
  const chrome = process.env.CHROME ?? "/opt/pw-browsers/chromium"
  if (!existsSync(chrome)) {
    console.log("  --    no Chromium here: the bridge is held to its source only")
    return
  }
  const puppeteer = (await import("puppeteer-core")).default
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-sandbox"] })
  try {
    const page = await browser.newPage()
    const section = (id: string) => `<div class="shopify-section" id="shopify-section-${id}" data-section-id="${id}" style="height:200px"><p data-block-id="${id}-b">Words</p></div>`
    /* Off from the first paint, as a page drawn while the inspector is off is. */
    await page.setContent(`<!doctype html><html><head></head><body style="margin:0">${section("a")}${section("b")}${section("c")}<script>
      /* tsx names the functions it compiles with a helper the page does not have. */
      window.__name = function (f) { return f };
      window.__picks = 0; window.__events = [];
      addEventListener("message", function (e) { if (e.data && e.data.type === "pick") window.__picks++ });
      ["shopify:section:select", "shopify:section:deselect"].forEach(function (n) { document.addEventListener(n, function (e) { window.__events.push(n.split(":")[2] + " " + e.detail.sectionId) }) });
      window.__slInspect = false;
      ${CANVAS_BRIDGE}
    </script></body></html>`)
    const state = () => page.evaluate(() => {
      const shown = (k: string) => { const b = document.querySelector<HTMLElement>(`[data-sl-box=${k}]`); return !!b && getComputedStyle(b).display !== "none" && Number(getComputedStyle(b).opacity) > 0.05 }
      const w = window as unknown as { __picks: number; __events: string[] }
      return { hover: [...document.querySelectorAll("[data-sl-hover]")].map((e) => e.id.slice(16)), selected: [...document.querySelectorAll("[data-sl-selected]")].map((e) => e.id.slice(16)), hoverBox: shown("hover"), sectionBox: shown("section"), picks: w.__picks, events: w.__events.join(",") }
    })
    const send = (m: Record<string, unknown>) => page.evaluate((m) => window.postMessage({ storelib: 1, ...m }, "*"), m)
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

    await page.mouse.move(40, 100)
    await page.mouse.click(40, 100)
    await wait(100)
    let s = await state()
    check("drawn off: pointing at a section outlines nothing, a click picks nothing", s.hover.length === 0 && !s.hoverBox && s.picks === 0, s)

    await send({ type: "select", sectionId: "a", blockId: null, inspect: true })
    await wait(150)
    s = await state()
    check("switched on with a selection: it is outlined, and the theme hears it once", s.selected.join() === "a" && s.sectionBox && s.events === "select a", s)
    await page.mouse.move(40, 300)
    await wait(100)
    s = await state()
    check("on: hover outlines the section under the pointer", s.hover.join() === "b" && s.hoverBox, s)
    await page.mouse.click(40, 300)
    await wait(100)
    check("on: a click picks", (await state()).picks === 1)

    await send({ type: "select", sectionId: null, blockId: null, inspect: false })
    await wait(30)
    s = await state()
    check("off: the hover goes at once", s.hover.length === 0, s)
    await wait(350)
    s = await state()
    check("off: after the fade nothing is outlined or boxed", s.selected.length === 0 && !s.sectionBox && !s.hoverBox, s)
    check("  and the theme was not told anything was deselected", s.events === "select a", s)
    await page.mouse.move(40, 500)
    await page.mouse.click(40, 500)
    await wait(100)
    s = await state()
    check("off: moving and clicking outline and pick nothing", s.hover.length === 0 && !s.hoverBox && s.picks === 1, s)

    await send({ type: "select", sectionId: "a", blockId: null, inspect: true, scroll: false })
    await wait(150)
    s = await state()
    check("on again: the selection is outlined again without being selected again", s.selected.join() === "a" && s.sectionBox && s.events === "select a", s)
    check("  and the section under the still pointer is outlined at once", s.hover.join() === "c" && s.hoverBox, s)
    await send({ type: "select", sectionId: "b", blockId: null, inspect: true })
    await wait(100)
    s = await state()
    check("a new selection is still announced to the theme", s.selected.join() === "b" && s.events === "select a,deselect a,select b", s)
  } finally {
    await browser.close()
  }
}

async function main() {
  console.log("The bridge, in a browser")
  await bridgeInBrowser()

  console.log("The bridge, its source")
  let reads = true
  try { new Function(CANVAS_BRIDGE) } catch { reads = false }
  check("the bridge reads as JavaScript", reads)
  check("it knows the inspector's state before its first paint", /var inspect = window\.__slInspect !== false;/.test(CANVAS_BRIDGE))
  check("off, hover and pick do nothing", /if \(inspect\) hover\(sectionOf\(e\.target\)\);/.test(CANVAS_BRIDGE) && /if \(!s \|\| !inspect\) return;/.test(CANVAS_BRIDGE))
  check("off, the toolbar's box is let go", /var el = inspect && selected\.section \?/.test(CANVAS_BRIDGE))

  console.log("The imported theme's canvas")
  const canvas = read("components/website-builder/compat/compat-canvas.tsx")
  check("the page it draws carries the switch", /window\.__slInspect=\$\{inspecting\.current \? "true" : "false"\}/.test(canvas))
  check("every ready page hears a change, not only the one in front", /slotsRef\.current\.forEach\(\(slot, i\) => \{\s*if \(!slot\.ready\) return/.test(canvas) && /inspect: props\.inspectorEnabled/.test(canvas))
  check("the toolbar's stand-in goes with the inspector", /ghost && props\.inspectorEnabled && props\.selectedSectionId === ghost\.id/.test(canvas))
  check("it says when its first page has painted, 250ms after ready at the most", /const FIRST_PAINT_MS = 250/.test(canvas) && /onPainted\.current\?\.\(\)/.test(canvas))

  console.log("The editor")
  const editor = read("app/website-builder/editor/[installId]/page.tsx")
  check("the frame gets the switch itself", /inspectorEnabled=\{inspectorEnabled && !fullView\}\s*\n\s*onSelect=\{selectFromCompatCanvas\}/.test(editor))
  check("the name chip and outline go on the press", /<CanvasHover enabled=\{inspectorEnabled && canvasInspecting && /.test(editor))
  check("the add-a-section strip fades with the rings", /<div className="wb-ring relative isolate z-20 h-0 w-full">/.test(editor))
  const css = read("app/globals.css")
  check("nothing faded takes a press", /\[data-wb-inspect="off"\] \.wb-ring \{ opacity: 0 !important; pointer-events: none !important; \}/.test(css))
  check("the toolbar's buttons are one component made once, not remade on every render", /^function ToolbarItem\(/m.test(editor) && /const Item = ToolbarItem/.test(editor) && !/const Item = \(\{/.test(editor))
  const hover = read("components/website-builder/canvas-hover.tsx")
  check("the hover marks stay in the page and are hidden, never put in and taken out", !/if \(!mounted \|\| !box\) return null/.test(hover) && /const HIDDEN = \{ display: "none" \}/.test(hover))
  check("the AI panel is measured as the conversation and the pill, not the full-canvas layer", /\[data-ask-dock\]\[data-state="open"\] \[data-ask-card\]/.test(hover) && !/querySelectorAll<HTMLElement>\("\[data-ask-dock\]"\)/.test(hover))
  const library = read("components/website-builder/editor/section-library.tsx")
  check("previews are drawn ahead only once input has been still, unless the library is open", /const INPUT_QUIET_MS = 1200/.test(library) && /if \(busyFor\(\) > 0\) \{\s*pump\(\)\s*return/.test(library) && /urgent = true/.test(library))

  console.log("Opening")
  const asked = editor.indexOf("const sectionsAsked = Promise.all([")
  /* Asked with an end and tried again on a 5xx (lib/website-builder/load-guard.ts), still after the sections are asked for. */
  const installFetch = editor.indexOf("const r = await fetchWithin(`/api/website-builder/themes/${installId}`, {}, SECTIONS_WAIT_MS)")
  check("the sections are asked for beside the install, not after it", asked > 0 && installFetch > asked && /const asked = await sectionsAsked/.test(editor))
  check("an imported theme's files are asked for as soon as it is known to be one", /importedTheme\.current = true\s*\n[^\n]*\n\s*void loadCompatFiles\(installId\)/.test(editor) && /getItem\(`wb-compat:\$\{installId\}`\) === "1"\) void loadCompatFiles\(installId\)/.test(editor))
  check("an imported theme is one wait: the loader stays until its page has painted, capped", /const canvasLoaderUp = canvasBusy \|\| compatFirstPaint/.test(editor) && /const COMPAT_PAINT_CAP_MS = 8000/.test(editor) && /onPainted=\{onCompatPainted\}/.test(editor))
  check("the loaders wait half a second, the top bar a fifth", /useDelayedFlag\(canvasLoaderUp, SPINNER_WAIT_MS\)/.test(editor) && /const BAR_AFTER_MS = 220/.test(editor))
  const route = read("app/api/website-builder/themes/[installId]/route.ts")
  const get = route.slice(route.indexOf("export async function GET"), route.indexOf("export async function PATCH"))
  check("the install route reads what does not hang on the row beside it", get.indexOf("const besides = Promise.all([") > 0 && get.indexOf("const besides") < get.indexOf("ensurePolicyPages(") && /besides\.catch\(\(\) => \{\}\)/.test(get))
  check("  and asks who is signed in once", (get.match(/auth\.getUser\(\)/g) ?? []).length === 0 && /userId: user\.id/.test(route))
  const workspace = read("components/app/creator-page-workspace.tsx")
  check("the creator page shows its loader only for a slow load", /const loaderShown = useDelayedFlag\(firstLoad, SPINNER_WAIT_MS\)/.test(workspace) && /\{loaderShown && <BuilderLoader/.test(workspace))
  check("  and shows the page once it can paint, not once its last picture is in", /doc\.readyState !== "loading"/.test(workspace) && /every\(\(l\) => !!l\.sheet\)/.test(workspace))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(1) })
