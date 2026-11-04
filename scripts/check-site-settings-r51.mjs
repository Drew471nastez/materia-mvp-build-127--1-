/**
 * ===========================================================================
 *  WEBSITE SETTINGS, ROUND 51, MEASURED IN A BROWSER
 * ===========================================================================
 * The real components (scripts/render-site-settings-r51.tsx) with the app's
 * own stylesheet, in headless Chromium, at 390 and 1280:
 *
 *   APPS        every installed app has a mark that drew: a logo that
 *               loaded (its natural width), or Storelib's own tile
 *   BLOG        the filters beyond search and status are folded; New post
 *               opens the writer with no "Opening the post" step; Back
 *               leaves the list on screen; a category is made from the post
 *   BACKUPS     Preview shows what a restore would change, page by page;
 *               Back up now says what it did, twice
 *   GITHUB      before a repository, one line and a button; picking one,
 *               branch and folder folded
 *   DATABASE    "Coming soon" and nothing to press
 *   DOMAINS     a certificate being issued is checked again by itself
 *   TEAM        "What they can do" only once an address is typed
 *
 *   node scripts/check-site-settings-r51.mjs     SHOTS_DIR=/dir for screenshots
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, extname } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) { console.error(`No browser at ${CHROMIUM}.`); process.exit(1) }
const css = (await appCss(root)) + "\n" + interFaces(root)
const out = mkdtempSync(join(tmpdir(), "storelib-r51-settings-"))
const shots = process.env.SHOTS_DIR || join(out, "shots")
mkdirSync(shots, { recursive: true })
const stubs = join(root, ".settings-probe")
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/website-builder/editor/install-1"
export const useRouter = () => ({ push() {}, prefetch() {}, replace() {}, refresh() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
`)
writeFileSync(join(stubs, "dynamic.jsx"), `import React from "react"
export default function dynamic(load) { const L = React.lazy(() => load().then((C) => ({ default: C }))); return function D(p) { return React.createElement(React.Suspense, { fallback: null }, React.createElement(L, p)) } }
`)
writeFileSync(join(stubs, "r51.tsx"), `import { createRoot } from "react-dom/client"
import { boot } from "${join(root, "scripts/render-site-settings-r51.tsx")}"
window.__errors = []
window.addEventListener("error", (e) => window.__errors.push(String(e.message)))
boot((el) => createRoot(document.getElementById("app")).render(el))
`)
execFileSync("npx", [
  "esbuild", join(stubs, "r51.tsx"), "--bundle", "--format=iife", `--outfile=${join(out, "probe.js")}`,
  `--alias:next/link=${join(stubs, "link.jsx")}`, `--alias:next/navigation=${join(stubs, "navigation.js")}`, `--alias:next/dynamic=${join(stubs, "dynamic.jsx")}`, `--alias:@=${root}`,
  "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--jsx=automatic",
  '--define:process.env.NODE_ENV="production"', '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co"', '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder"',
  "--log-level=error",
], { cwd: root, stdio: "inherit" })
const bundle = readFileSync(join(out, "probe.js"))
const html = (light) => `<!doctype html><html class="${light ? "light" : ""}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;background:${light ? "#f8f9fa" : "#fff"}}</style></head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}}</script><script src="/probe.js"></script></body></html>`
const TYPES = { ".png": "image/png", ".svg": "image/svg+xml", ".jpg": "image/jpeg" }
const server = createServer((req, res) => {
  const path = req.url.split("?")[0]
  if (path === "/probe.js") { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(bundle) }
  if (path.startsWith("/integrations/") && existsSync(join(root, "public", path))) { res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" }); return res.end(readFileSync(join(root, "public", path))) }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(html(req.url.includes("team=1")))
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })
const open = async (query, width = 1280) => {
  const p = await browser.newPage()
  p.on("pageerror", (e) => console.log(`        page error: ${String(e).slice(0, 300)}`))
  await p.setViewport({ width, height: 900 })
  await p.goto(`${origin}/?${query}`, { waitUntil: "load" })
  await sleep(700)
  return p
}
const shot = (p, name) => p.screenshot({ path: join(shots, `${name}.png`) })
const clickText = (p, text, sel = "button") => p.evaluate((t, s) => { const b = [...document.querySelectorAll(s)].find((x) => x.textContent.trim() === t); if (b) b.click(); return !!b }, text, sel)

try {
  for (const width of [1280, 390]) {
    console.log(`\nApps and integrations, ${width}px`)
    {
      const p = await open("section=apps", width)
      await sleep(500)
      const marks = await p.evaluate(() => [...document.querySelectorAll("[data-website-apps] [data-integration-mark]")].map((m) => ({ kind: m.getAttribute("data-integration-mark"), loaded: m.tagName === "IMG" ? m.complete && m.naturalWidth > 0 : null, w: Math.round(m.getBoundingClientRect().width) })))
      expect(marks.length === 3, "three installed apps, three marks", marks)
      expect(marks.filter((m) => m.kind === "logo").every((m) => m.loaded === true) && marks.filter((m) => m.kind === "logo").length === 2, "  both logos loaded (natural width > 0)", marks)
      expect(marks.some((m) => m.kind === "storelib"), "  Storelib Reviews drawn as its own tile, not a letter", marks.map((m) => m.kind))
      await shot(p, `apps-${width}`)
      await p.close()
    }

    console.log(`\nBlog, ${width}px`)
    {
      const p = await open(`section=blog&posts=3${process.env.EXISTING ? "&existing=1" : ""}`, width)
      await p.waitForSelector("[data-blog-post]", { timeout: 5000 }).catch(() => null)
      const folded = await p.evaluate(() => ({ more: document.querySelector("[data-blog-more-filters]")?.getAttribute("data-blog-more-filters") ?? null, selects: [...document.querySelectorAll("[data-blog-filters] select")].filter((s) => s.getClientRects().length && s.closest("[data-blog-more]")?.getAttribute("aria-hidden") !== "true" && getComputedStyle(s.closest("[data-blog-more]") ?? s).visibility !== "hidden").length, words: (document.querySelector("[data-website-settings-main], main")?.innerText ?? "").split(/\s+/).filter(Boolean).length }))
      expect(folded.more === "closed", "category, tag, author and order folded under Filters", folded)
      await shot(p, `blog-list-${width}`)
      const opened = await p.evaluate(async () => {
        const t0 = performance.now()
        if (window.location.search.includes("existing")) document.querySelector("[data-blog-post] button")?.click()
        else document.querySelector("[data-blog-new]").click()
        let sawOpening = false
        let at = null
        for (let i = 0; i < 80; i++) {
          await new Promise((r) => setTimeout(r, 25))
          if (/Opening the post/.test(document.body.innerText)) sawOpening = true
          if (document.querySelector("[data-site-post-editor] textarea")) { at = Math.round(performance.now() - t0); break }
        }
        return { at, sawOpening }
      })
      expect(opened.at !== null && !opened.sawOpening, "New post opens the writer with no Opening the post step", opened)
      await sleep(300)
      await shot(p, `blog-new-post-${width}`)
      /* Post settings: the author is the owner by default; a category made in place. */
      const panel = await p.evaluate(async () => {
        const author = [...document.querySelectorAll("[data-post-panel] select")].find((s) => s.getAttribute("aria-label") === "Author")
        const cat = [...document.querySelectorAll("[data-post-panel] select")].find((s) => s.getAttribute("aria-label") === "Category")
        if (!cat) return { found: false }
        const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set
        set.call(cat, "__new")
        cat.dispatchEvent(new Event("change", { bubbles: true }))
        await new Promise((r) => setTimeout(r, 80))
        const box = document.querySelector("[data-blog-new-category] input")
        if (!box) return { found: true, box: false }
        const setIn = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set
        setIn.call(box, "News")
        box.dispatchEvent(new Event("input", { bubbles: true }))
        await new Promise((r) => setTimeout(r, 50))
        ;[...document.querySelectorAll("[data-blog-new-category] button")].find((b) => b.textContent.trim() === "Add")?.click()
        await new Promise((r) => setTimeout(r, 200))
        const after = [...document.querySelectorAll("[data-post-panel] select")].find((s) => s.getAttribute("aria-label") === "Category")
        return { found: true, box: true, owner: author?.options[0]?.textContent, picked: after ? after.options[after.selectedIndex]?.textContent : null }
      })
      expect(panel.box === true && panel.picked === "News", "a new category is made from the post and picked for it", panel)
      expect(!!panel.owner && panel.owner !== "No author", "  the author list starts with the owner, not No author", panel.owner)
      const back = await p.evaluate(async () => {
        document.querySelector("[data-blog-back]").click()
        const seen = []
        for (let i = 0; i < 12; i++) {
          await new Promise((r) => setTimeout(r, 40))
          seen.push({ editor: !!document.querySelector("[data-site-post-editor]"), rows: document.querySelectorAll("[data-blog-post]").length })
        }
        return seen
      })
      expect(back.every((s) => s.rows > 0), "Back: the list stays on screen the whole time (no empty frame)", back.map((s) => s.rows))
      expect(!back[back.length - 1].editor, "  and the writer is gone", back[back.length - 1])
      await p.close()
    }

    console.log(`\nBackups, ${width}px`)
    {
      const p = await open("section=backups", width)
      await p.waitForSelector("[data-backup-open]", { timeout: 5000 }).catch(() => null)
      await p.evaluate(() => document.querySelector("[data-backup-open]").click())
      await sleep(80)
      const loading = await p.evaluate(() => { const b = document.querySelector("[data-backup-preview]"); return { state: b?.getAttribute("data-backup-preview"), h: b ? Math.round(b.getBoundingClientRect().height) : null } })
      await sleep(600)
      const ready = await p.evaluate(() => { const b = document.querySelector("[data-backup-preview]"); return { state: b?.getAttribute("data-backup-preview"), h: b ? Math.round(b.getBoundingClientRect().height) : null, pages: [...document.querySelectorAll("[data-backup-page]")].map((r) => `${r.getAttribute("data-backup-page")}:${r.getAttribute("data-change")}`), settings: document.querySelector("[data-backup-settings]")?.getAttribute("data-backup-settings") ?? null } })
      expect(loading.state === "loading" && ready.state === "ready", "Preview reads what a restore would change", { loading, ready: ready.state })
      expect(ready.pages.join() === "home:changed,about:same,lookbook:comes back,faq:stays" && ready.settings === "3", "  page by page, and the settings", ready)
      await shot(p, `backups-preview-${width}`)
      await clickText(p, "Cancel")
      await sleep(200)
      await clickText(p, "Back up now")
      await sleep(700)
      const first = await p.evaluate(() => ({ said: document.querySelector("[data-backup-result]")?.textContent ?? null, kind: document.querySelector("[data-backup-result]")?.getAttribute("data-backup-result") ?? null, rows: document.querySelectorAll("[data-backup-row]").length }))
      await clickText(p, "Back up now")
      await sleep(700)
      const second = await p.evaluate(() => ({ said: document.querySelector("[data-backup-result]")?.textContent ?? null, kind: document.querySelector("[data-backup-result]")?.getAttribute("data-backup-result") ?? null }))
      expect(first.kind === "new" && first.rows === 3, "Back up now: a new restore point, said and listed", first)
      expect(second.kind === "same", "  pressed again with nothing changed: it says so", second)
      await shot(p, `backups-${width}`)
      await p.close()
    }

    console.log(`\nConnections, ${width}px`)
    {
      const p = await open("section=connections&github=connect", width)
      await p.evaluate(() => document.querySelector('[data-connection="github"] > div:first-child button')?.click())
      await sleep(500)
      const setup = await p.evaluate(() => { const s = document.querySelector("[data-github-setup]"); return { state: s?.getAttribute("data-github-setup") ?? null, words: (s?.innerText ?? "").split(/\s+/).filter(Boolean).length, text: s?.innerText.replace(/\s+/g, " ").trim() } })
      expect(setup.state === "connect" && setup.words <= 22, "GitHub before a repository: one line and the button", setup)
      const db = await p.evaluate(() => { const r = document.querySelector("[data-own-db]"); return { soon: /Coming soon/.test(r?.innerText ?? ""), buttons: r ? r.querySelectorAll("button, a, input").length : null } })
      expect(db.soon && db.buttons === 0, "Your own database: Coming soon, nothing to press", db)
      await shot(p, `connections-${width}`)
      await p.close()
      const q2 = await open("section=connections&github=pick", width)
      await q2.evaluate(() => document.querySelector('[data-connection="github"] > div:first-child button')?.click())
      await sleep(500)
      const pick = await q2.evaluate(() => ({ state: document.querySelector("[data-github-setup]")?.getAttribute("data-github-setup"), folded: document.querySelector("[data-github-more]")?.open === false, branchSeen: [...document.querySelectorAll("[data-github-setup] input")].some((i) => i.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true })) }))
      expect(pick.state === "pick" && pick.folded && !pick.branchSeen, "picking a repository: branch and folder folded", pick)
      await shot(q2, `github-pick-${width}`)
      await q2.close()
    }

    console.log(`\nTeam, ${width}px`)
    {
      const p = await open("team=1", width)
      await p.waitForSelector("[data-team-invite]", { timeout: 5000 }).catch(() => null)
      const before = await p.evaluate(() => ({ state: document.querySelector("[data-team-invite-access]")?.getAttribute("data-team-invite-access") ?? "absent", visible: /What they can do/.test(document.querySelector("[data-team-invite]")?.innerText ?? "") }))
      expect(before.visible === false, "What they can do: not shown before an invite is started", before)
      await shot(p, `team-before-${width}`)
      await p.type("#team-invite-email", "sam@example.com")
      await sleep(350)
      const after = await p.evaluate(() => ({ state: document.querySelector("[data-team-invite-access]")?.getAttribute("data-team-invite-access") ?? "absent", visible: /What they can do/.test(document.querySelector("[data-team-invite]")?.innerText ?? "") }))
      expect(after.visible === true, "  shown once an address is typed, to choose for this invite", after)
      await shot(p, `team-invite-${width}`)
      await p.close()
    }
  }

  console.log("\nDomains, a certificate being issued")
  {
    const p = await open("section=domains&domain=securing", 1280)
    const first = await p.evaluate(() => [...document.querySelectorAll("main span")].map((s) => s.textContent.trim()).find((t) => t === "Securing" || t === "Connected") ?? null)
    await shot(p, "domains-securing-1280")
    await sleep(13_000)
    const later = await p.evaluate(() => ({ verify: window.__verifyCalls, badge: [...document.querySelectorAll("main span")].map((s) => s.textContent.trim()).find((t) => t === "Securing" || t === "Connected") ?? null }))
    expect(first === "Securing" && later.verify >= 1 && later.badge === "Connected", "checked again by itself, and turns Connected without a press", { first, ...later })
    await shot(p, "domains-connected-1280")
    await p.close()
  }
} finally {
  await browser.close()
  server.close()
}
console.log(`\nScreenshots: ${shots}`)
console.log(broken ? `\n${broken} failed\n` : "\nall measured\n")
process.exit(broken ? 1 : 0)
