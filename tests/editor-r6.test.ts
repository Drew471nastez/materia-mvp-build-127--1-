/**
 * ROUND R6, THE WEBSITE BUILDER'S EDITOR
 *
 *   npx tsx tests/editor-r6.test.ts
 *
 * The imported theme's canvas bridge (lib/storelib-theme/compat/canvas-bridge.ts)
 * is run for real in Chromium when one is installed: its outlines give way to
 * a drawer opened over the selected section and come back when it closes, and
 * a section changed from the sidebar is changed in place (the same element,
 * its script's own class kept) unless its shape changed. The rest is held to
 * its source and to pure functions. The whole editor is driven by the scratch
 * harnesses described in the round's report.
 */
import { existsSync, readFileSync } from "node:fs"
import { CANVAS_BRIDGE } from "../lib/storelib-theme/compat/canvas-bridge"
import { canvasInsets } from "../lib/storelib-theme/compat/canvas-network"
import { themeSchemeList } from "../lib/storelib-theme/compat/scheme-list"
import { fontHandle, shopifyFont } from "../components/website-builder/editor/controls/font-picker-control"
import { canSaveBeforeLeaving, leaveLines } from "../components/website-builder/leave-confirm"
import { typedValue } from "../lib/storelib-theme/compat/objects"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 300)}`}`)
}
const read = (p: string) => readFileSync(p, "utf8")
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

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
    await page.setViewport({ width: 600, height: 700 })
    const section = (id: string, inner: string) => `<div class="shopify-section" id="shopify-section-${id}" data-section-id="${id}">${inner}</div>`
    /* A header with its own fixed drawer inside it, as Posturex's phone menu is, and a section with a script that adds a class of its own. */
    await page.setContent(`<!doctype html><html><head></head><body style="margin:0;font:16px sans-serif">
      ${section("header", `<header style="height:120px;background:#eee"><button id="burger">Menu</button><nav id="drawer" style="position:fixed;inset:0;background:#111;color:#fff;transform:translateX(-100%);transition:transform .15s">Menu drawer</nav></header>`)}
      ${section("banner", `<style>.pad{padding-top:10px}</style><div class="pad box" style="height:200px;background:#cde" data-speed="3"><h2 class="title">Old words</h2></div>`)}
      ${section("tail", `<div style="height:900px">Tail</div>`)}
      <script>
        window.__name = function (f) { return f };
        document.getElementById("burger").addEventListener("click", function (e) { e.stopPropagation(); document.getElementById("drawer").style.transform = "none" });
        document.querySelector("#shopify-section-banner .box").classList.add("is-visible");
        window.__slInspect = true;
        ${CANVAS_BRIDGE}
      </script></body></html>`)
    const send = (m: Record<string, unknown>) => page.evaluate((m) => window.postMessage({ storelib: 1, ...m }, "*"), m)
    const sectionBox = () => page.evaluate(() => { const b = document.querySelector<HTMLElement>("[data-sl-box=section]"); return b ? { display: getComputedStyle(b).display, top: b.style.top, height: b.style.height } : null })

    await send({ type: "select", sectionId: "header", blockId: null, inspect: true, scroll: false })
    await wait(150)
    const shown = await sectionBox()
    check("the selected header is outlined", shown?.display === "block" && shown.height === "120px", shown)
    await page.evaluate(() => (document.getElementById("burger") as HTMLElement).click())
    await wait(700)
    const covered = await sectionBox()
    check("its own drawer opened over it: the outline goes, rather than staying drawn across the drawer", covered?.display === "none", covered)
    await page.evaluate(() => { (document.getElementById("drawer") as HTMLElement).style.transform = "translateX(-100%)" })
    await wait(700)
    check("and the drawer closed, it comes back", (await sectionBox())?.display === "block")

    /* A sticky bar over the top of the selected section shortens the outline to what is seen. */
    await page.evaluate(() => {
      const bar = document.createElement("div")
      bar.id = "bar"
      bar.style.cssText = "position:fixed;top:0;left:0;right:0;height:60px;background:#000"
      document.body.appendChild(bar)
    })
    await wait(700)
    const cut = await sectionBox()
    check("a bar fixed over the top of it: the outline starts below the bar", !!cut && cut.display === "block" && Math.abs(parseFloat(cut.top) - 60) <= 2, cut)
    await page.evaluate(() => document.getElementById("bar")?.remove())

    /* In place: a padding and a heading changed, the element and the theme's own class kept. */
    const prev = await page.evaluate(() => {
      const el = document.getElementById("shopify-section-banner")!
      ;(window as unknown as { __el: Element }).__el = el
      const copy = el.cloneNode(true) as HTMLElement
      copy.querySelector(".box")!.classList.remove("is-visible")
      return copy.outerHTML
    })
    const next = prev.replace("padding-top:10px", "padding-top:40px").replace("Old words", "New words")
    await send({ type: "section", id: "banner", html: next, prev })
    await wait(200)
    const inPlace = await page.evaluate(() => {
      const el = document.getElementById("shopify-section-banner")!
      return { same: el === (window as unknown as { __el: Element }).__el, words: el.querySelector(".title")?.textContent, pad: getComputedStyle(el.querySelector(".pad")!).paddingTop, kept: el.querySelector(".box")!.classList.contains("is-visible") }
    })
    check("a value changed from the sidebar is changed where it is: same element, new words, new padding", inPlace.same && inPlace.words === "New words" && inPlace.pad === "40px", inPlace)
    check("  and what the theme's script did to it (a class it added) is kept", inPlace.kept, inPlace)
    /* Many values in a burst: only the last is drawn. */
    for (let i = 1; i <= 6; i++) await send({ type: "section", id: "banner", html: next.replace("New words", `Words ${i}`), prev })
    await wait(200)
    check("a burst of values ends on the last one", (await page.evaluate(() => document.querySelector("#shopify-section-banner .title")?.textContent)) === "Words 6")
    /* A shape change (a block added) swaps the section, as before. */
    const shaped = next.replace("New words", "Words 6").replace("</h2>", "</h2><p>Added</p>")
    await send({ type: "section", id: "banner", html: shaped, prev })
    await wait(300)
    const swapped = await page.evaluate(() => ({ same: document.getElementById("shopify-section-banner") === (window as unknown as { __el: Element }).__el, added: !!document.querySelector("#shopify-section-banner p") }))
    check("a change of shape is swapped in whole, as before", !swapped.same && swapped.added, swapped)
    /* A setting a script reads once (a data- attribute) is drawn in place, then the section is swapped once the changes stop. */
    await page.evaluate(() => { (window as unknown as { __el: Element }).__el = document.getElementById("shopify-section-banner")! })
    const now = await page.evaluate(() => document.getElementById("shopify-section-banner")!.outerHTML)
    await send({ type: "section", id: "banner", html: shaped.replace('data-speed="3"', 'data-speed="5"'), prev: now })
    await wait(150)
    const quick = await page.evaluate(() => ({ same: document.getElementById("shopify-section-banner") === (window as unknown as { __el: Element }).__el, speed: document.querySelector("#shopify-section-banner .box")?.getAttribute("data-speed") }))
    await wait(900)
    const settled = await page.evaluate(() => ({ same: document.getElementById("shopify-section-banner") === (window as unknown as { __el: Element }).__el, speed: document.querySelector("#shopify-section-banner .box")?.getAttribute("data-speed") }))
    check("a data- setting is drawn in place at once, and the section starts again with it once the changes stop", quick.same && quick.speed === "5" && !settled.same && settled.speed === "5", { quick, settled })
  } finally {
    await browser.close()
  }
}

async function main() {
  console.log("\nThe canvas bridge, in a browser")
  await bridgeInBrowser()
  let reads = true
  try { new Function(CANVAS_BRIDGE) } catch { reads = false }
  check("the bridge reads as JavaScript", reads)

  console.log("\nThe canvas, on a phone")
  const css = `.bar{padding-bottom:calc(6px + env(safe-area-inset-bottom, 0px));bottom:env(safe-area-inset-bottom)}.x{margin:constant(safe-area-inset-top)}.y{padding:max(8px, env(safe-area-inset-left, calc(2px + 1px)))}`
  const out = canvasInsets(css)
  check("no safe-area inset in the canvas: a tab bar is not padded for a home bar it is nowhere near", !/safe-area/.test(out) && out.includes("calc(6px + 0px)") && out.includes("bottom:0px") && out.includes("max(8px, 0px)"), out)
  const canvas = read("components/website-builder/compat/compat-canvas.tsx")
  check("  on the page drawn and on every section drawn again", /canvasInsets\(drawn\.html\)/.test(canvas) && /canvasInsets\(drawSection\(/.test(canvas))
  check("a section is drawn at most once a frame, with the markup it was drawn from", /syncFrame\.current = requestAnimationFrame/.test(canvas) && /prev: slot\.shape\.sections\.get\(s\.id\)/.test(canvas))

  console.log("\nAn imported theme's own settings")
  const dawn = { color_schemes: { "scheme-1": { settings: { background: "#FFFFFF", text: "#121212", button: "#121212" } }, "scheme-2": { settings: { background: "#F3F3F3", text: "#121212", button: "#121212" } } } }
  const list = themeSchemeList(dawn)
  check("a section's colour scheme lists the theme's own schemes, numbered, with their colours", list.map((s) => `${s.id}:${s.name}:${s.background}`).join() === "scheme-1:Scheme 1:#FFFFFF,scheme-2:Scheme 2:#F3F3F3", list)
  const posturex = themeSchemeList({ color_schemes: { default: { settings: { background: "#fff", text_color: "#1f1f1f", btn_primary_background: "#4162f8" } } } })
  check("  a theme's own colour names read too (text_color, btn_primary_background), and its default is Default", posturex[0]?.name === "Default" && posturex[0].text === "#1f1f1f" && posturex[0].accent === "#4162f8", posturex)
  check("  none saved, none listed", themeSchemeList({}).length === 0)
  const controls = read("components/website-builder/editor/controls/index.tsx")
  check("  drawn by the controls folder for every color_scheme setting", /case "color_scheme":\s*\n\s*return <ColorSchemeControl/.test(controls))
  const editor = read("app/website-builder/editor/[installId]/page.tsx")
  check("  the editor hands an imported theme's schemes to the controls", /colorSchemes: compatSchemes/.test(editor) && /themeSchemeList\(compatShopify\)/.test(editor))
  check("Storelib's own design panel (its schemes, heading and body style, animation) is not offered for an imported section, which reads none of it", /\{!compatInstall && <SectionDesignPanel/.test(editor) && /filter\(f => compatInstall \|\|/.test(editor))
  const r = { products: [], collections: [], menus: {}, schemes: {}, imageUrl: (v: string) => v, currentPath: "/" } as unknown as Parameters<typeof typedValue>[2]
  const picked = typedValue("page", "/pages/about-us", r) as { handle?: string; url?: string; title?: string } | null
  check("a page setting is the page at that address, picked in the sidebar or saved by the theme", picked?.handle === "about-us" && picked.url === "/pages/about-us" && picked.title === "About us" && (typedValue("page", "shopify://pages/faq", r) as { handle?: string })?.handle === "faq" && typedValue("page", "", r) === null, picked)
  check("  and the sidebar's page picker shows a theme's saved handle as the page it names", /options\.some\(t => t\.href === `\/pages\/\$\{saved\}`\)/.test(editor))
  check("a Shopify font handle reads as its family, and a family picked keeps its weight and style", JSON.stringify(shopifyFont("work_sans_i7")) === JSON.stringify({ family: "Work Sans", variant: "i7" }) && fontHandle("Playfair Display", "n7") === "playfair_display_n7" && shopifyFont("Inter") === null)

  console.log("\nLeaving")
  const leave = read("components/website-builder/leave-confirm.tsx")
  check("Save, Discard and Keep editing", /Keep editing/.test(leave) && /data-leave-save/.test(leave) && /data-leave-discard/.test(leave) && /data-leave-cancel/.test(leave))
  check("a draggable sheet on a phone, Storelib's window on a computer", /<BottomSheet isOpen=\{open\}/.test(leave) && /matchMedia\("\(max-width: 639px\)"\)/.test(leave) && /bg-white p-6/.test(leave))
  check("  which leaves the way it came, and is taken away when its exit ends", /data-state=\{open \? "open" : "closed"\}/.test(leave) && /onAnimationEnd=/.test(leave) && /\.wb-leave-card\[data-state="closed"\]/.test(read("app/globals.css")))
  check("  and says what is at stake", leaveLines({ draft: true }).length === 1 && canSaveBeforeLeaving({ draft: true }) && !canSaveBeforeLeaving({ code: true }))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}
void main()
