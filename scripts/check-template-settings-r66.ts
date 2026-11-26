/**
 * ===========================================================================
 *  EVERY SECTION'S SETTINGS AT THEIR ENDS, AND THE REST OF THE PAGE STILL THERE (round 66)
 * ===========================================================================
 * The owner, round 66: "in the Night shop template, when I adjust the night
 * sky (star size, how many stars, twinkling stars, or anything), it bugs the
 * whole template and view. Even if I reload it's bugged. There are many
 * issues like this across multiple templates."
 *
 * For every Materia template (theme-packages/materia/templates/*), its home
 * page is drawn the way the builder's canvas draws it (drawPage with the
 * canvas's head and bridge, in a frame sandboxed as the editor's is). Every
 * section on it with range, number, select or colour settings has each one
 * set, one at a time, to its minimum, its maximum and its middle (a select:
 * each option, up to six; a colour: cleared), drawn again by drawSection
 * and sent to the frame exactly as the canvas sends a changed section
 * ({ type: "section", id, html, prev }), then put back. After each value:
 *
 *   COLLAPSED   another section that had height before has none now
 *   COVERED     the middle of another section is no longer hit inside that
 *               section (pointer events on everywhere): something is over it
 *   ERRORS      the page threw while the section was drawn again
 *   STUCK       put back to its own value, the page is not as it was
 *
 * A section type is tried once, in the first template whose home page has
 * it. Measurements, not opinions; exits 1 on any finding.
 *
 *   npx tsx scripts/check-template-settings-r66.ts
 *     ONLY=space,clothing     only these templates
 *     BRIDGE=<file>           canvas-bridge.ts from another commit (before/after)
 *     JOBS=4                  pages measured at once
 *     OUT=<dir>               where findings.json and screenshots go
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { createServer } from "node:http"
import { join } from "node:path"
import JSZip from "jszip"
import puppeteer, { type Browser, type Frame } from "puppeteer-core"
import { convertShopifyTheme } from "../lib/storelib-theme/shopify/convert"
import { composeTemplateZip } from "../lib/themes/template-packages"
import { drawPage, drawSection, pageContextFor, sectionIndexIn, themeOfInstall, type StoredSection } from "../lib/storelib-theme/compat/page"
import { themeAsset } from "../lib/storelib-theme/compat/site"
import { compatMenus } from "../lib/storelib-theme/compat/menus"
import { CANVAS_SHOWN, canvasInsets } from "../lib/storelib-theme/compat/canvas-network"
import { CANVAS_SHEET_GUARD } from "../lib/storelib-theme/compat/sheet-guard"
import { shop } from "./check-builder-nav19"

const CHROME = process.env.CHROME ?? "/opt/pw-browsers/chromium"
const OUT = process.env.OUT ?? "/tmp/template-settings-r66"
const JOBS = Number(process.env.JOBS ?? 4)
mkdirSync(OUT, { recursive: true })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const within = <T,>(p: Promise<T>, ms = 4000): Promise<T> => Promise.race([p, new Promise<T>((_, no) => setTimeout(() => no(new Error("no answer")), ms))])

/* As compat-canvas.tsx markDrawnStyles (not imported: that module is the canvas's client component). */
function markDrawnStyles(html: string): string {
  const end = html.search(/<\/head\s*>/i)
  if (end < 0) return html
  return html.slice(0, end).split(/(<script\b[\s\S]*?<\/script\s*>)/i).map((part) => (/^<script\b/i.test(part) ? part : part.replace(/<(style|meta|link|title|base)(?=[\s>])/gi, "<$1 data-sl-d"))).join("") + html.slice(end)
}

type Setting = { id: string; type: string; min?: number; max?: number; step?: number; options?: { value: string }[] }
type Finding = { template: string; section: string; type: string; setting: string; value: unknown; kind: "collapsed" | "covered" | "errors" | "stuck"; detail: string }

const ERRORS_HEAD = `<script>window.__probeErrors=[];addEventListener("error",function(e){__probeErrors.push(String(e.message||e.error||"error").slice(0,160))});addEventListener("unhandledrejection",function(e){__probeErrors.push("rejection: "+String(e.reason&&e.reason.message||e.reason).slice(0,160))});</script>`

function valuesFor(s: Setting): unknown[] {
  if (s.type === "range" || s.type === "number") {
    const min = typeof s.min === "number" ? s.min : 0
    const max = typeof s.max === "number" ? s.max : s.type === "number" ? 1000 : 100
    const step = typeof s.step === "number" && s.step > 0 ? s.step : 1
    const mid = min + Math.round((max - min) / 2 / step) * step
    return [...new Set([min, max, mid])]
  }
  if (s.type === "select" || s.type === "radio") return (s.options ?? []).slice(0, 6).map((o) => o.value)
  if (s.type === "color" || s.type === "color_background") return [""]
  return []
}

async function main() {
  const { CANVAS_BRIDGE, CANVAS_HEAD } = (await import(process.env.BRIDGE ?? "../lib/storelib-theme/compat/canvas-bridge")) as { CANVAS_BRIDGE: string; CANVAS_HEAD: string }
  const only = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null
  const templates = readdirSync(join(process.cwd(), "theme-packages/materia/templates")).filter((d) => existsSync(join(process.cwd(), "theme-packages/materia/templates", d, "templates/index.json")) && (!only || only.has(d)))
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--hide-scrollbars"] })
  const findings: Finding[] = []
  /* Each section type belongs to the first template (by name) whose home page or groups use it, so a run is the same whatever order the workers finish in. */
  const owner = new Map<string, string>()
  for (const t of [...templates].sort()) {
    for (const f of ["templates/index.json", "sections/header-group.json", "sections/footer-group.json"]) {
      const p = join(process.cwd(), "theme-packages/materia/templates", t, f)
      if (!existsSync(p)) continue
      try {
        const j = JSON.parse(readFileSync(p, "utf8").replace(/^\s*\/\*[\s\S]*?\*\/\s*/, "")) as { sections?: Record<string, { type?: string }> }
        for (const sec of Object.values(j.sections ?? {})) if (sec?.type && !owner.has(sec.type)) owner.set(sec.type, t)
      } catch { /* a file that does not parse: its types go to whoever draws them first */ }
    }
  }
  const triedTypes = { owner, seen: new Set<string>() }
  let tried = 0
  let changes = 0
  const queue = [...templates]
  const worker = async () => {
    for (let name = queue.shift(); name; name = queue.shift()) {
      try {
        const r = await sweepTemplate(browser, name, CANVAS_BRIDGE, CANVAS_HEAD, triedTypes)
        findings.push(...r.findings)
        tried += r.sections
        changes += r.changes
        console.log(`${name.padEnd(14)} sections ${String(r.sections).padStart(3)}  values ${String(r.changes).padStart(4)}  findings ${r.findings.length}`)
      } catch (e) {
        console.log(`${name.padEnd(14)} could not be swept: ${String(e).slice(0, 200)}`)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(JOBS, templates.length) }, worker))
  await browser.close()
  writeFileSync(join(OUT, "findings.json"), JSON.stringify(findings, null, 2))
  const byKind = (k: Finding["kind"]) => findings.filter((f) => f.kind === k).length
  const sectionsHit = new Set(findings.map((f) => `${f.type}`))
  console.log(`\n${templates.length} templates, ${tried} section types, ${changes} values`)
  console.log(`findings ${findings.length}: collapsed ${byKind("collapsed")}, covered ${byKind("covered")}, errors ${byKind("errors")}, stuck ${byKind("stuck")}; section types with a finding ${sectionsHit.size}`)
  for (const f of findings.slice(0, 80)) console.log(`  ${f.kind.padEnd(9)} ${f.template}/${f.type}.${f.setting}=${JSON.stringify(f.value)}  ${f.detail}`)
  process.exit(findings.length ? 1 : 0)
}

async function sweepTemplate(browser: Browser, name: string, bridge: string, head: string, triedTypes: { owner: Map<string, string>; seen: Set<string> }) {
  const zip = await JSZip.loadAsync(await composeTemplateZip(`materia/${name}`))
  const r = await convertShopifyTheme(zip)
  if (!r.ok) throw new Error("did not convert")
  const t = r.theme
  const files = t.files
  const theme = themeOfInstall(files, t.settings, {
    assetUrl: (n) => `/api/site-theme/assets/x/1/${encodeURIComponent(n)}`,
    assetText: (n) => files[`shopify/assets/${n}`] ?? null,
  })
  const home = t.pages.find((p) => p.page_key === "home")
  if (!home) throw new Error("no home page")
  const list = home.sections as unknown as StoredSection[]
  const { products, collections, menus } = shop()
  const page = {
    template: "index", path: "/", designMode: true, themeDesignMode: false, host: "",
    products: products as never, collections: collections as never, menus: compatMenus(menus, t.pages.map((p) => p.page_key)) as never,
    shop: { name: "Probe shop", currency: "USD", moneyFormat: "${{amount}}" },
  }
  const extra = { extraHead: "<style data-storelib-gutter>html{scrollbar-gutter:stable}</style>", extraBodyEnd: `<script>window.__slSite="";window.__slInspect=true;${bridge}</script>` }
  const drawn = drawPage(theme, page as never, list, { scripts: true, ...extra })
  const seed = `<script>window.__slPath="/";window.__slSeed={};</script>`
  const html = markDrawnStyles(canvasInsets(drawn.html).replace(/<head\b[^>]*>/i, (m) => `${m}${ERRORS_HEAD}${CANVAS_SHEET_GUARD}${seed}${head}${CANVAS_SHOWN}`))
  const ctx = pageContextFor(theme, page as never, list)
  const sectionHtml = (s: StoredSection) => canvasInsets(drawSection(theme, ctx, s, sectionIndexIn(list, s), s.group === "header" || s.group === "footer" ? s.group : undefined).html)

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1")
    if (url.pathname === "/") { res.writeHead(200, { "Content-Type": "text/html" }); res.end("<!doctype html><html><body style='margin:0'></body></html>"); return }
    if (url.pathname.startsWith("/api/site-theme/assets/")) {
      const n = decodeURIComponent(url.pathname.split("/").pop() ?? "")
      const a = themeAsset(theme, n, () => ctx)
      if (!a) { res.writeHead(404); res.end(); return }
      res.writeHead(200, { "Content-Type": a.type, "Access-Control-Allow-Origin": "*" })
      res.end(a.body)
      return
    }
    res.writeHead(404); res.end()
  })
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok))
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  const tab = await browser.newPage()
  await tab.setViewport({ width: 1280, height: 900 })
  await tab.setRequestInterception(true)
  tab.on("request", (q) => (q.url().startsWith(base) || q.url().startsWith("data:") || q.url().startsWith("about:") ? q.continue() : q.respond({ status: 404, body: "" })))
  const findings: Finding[] = []
  let sections = 0
  let changes = 0
  try {
    const open = async (): Promise<Frame> => {
      await tab.goto(base, { waitUntil: "load" })
      await tab.evaluate((doc) => {
        const f = document.createElement("iframe")
        f.setAttribute("sandbox", "allow-scripts allow-forms allow-popups")
        f.style.cssText = "border:0;width:1280px;height:900px;display:block"
        f.srcdoc = doc
        document.body.appendChild(f)
      }, html)
      for (let i = 0; i < 100; i++) {
        const fr = tab.frames().find((x) => x !== tab.mainFrame())
        if (fr && (await within(fr.evaluate(() => document.readyState === "complete" && !!document.querySelector(".shopify-section")), 2000).catch(() => false))) { await sleep(2500); return fr }
        await sleep(100)
      }
      throw new Error("the page never drew")
    }
    let frame = await open()
    const measure = (f: Frame) => within(f.evaluate(() => {
      const st = document.createElement("style")
      st.textContent = "*{pointer-events:auto!important}"
      document.head.appendChild(st)
      const out: Record<string, { h: number; hit: string }> = {}
      for (const sec of Array.from(document.querySelectorAll<HTMLElement>(".shopify-section"))) {
        const id = sec.id.replace(/^shopify-section-/, "")
        const h = Math.round(sec.getBoundingClientRect().height)
        let hit = "none"
        if (h > 40 && getComputedStyle(sec).display !== "none") {
          const top = sec.getBoundingClientRect().top + scrollY
          window.scrollTo(0, Math.max(0, top - 200))
          const b = sec.getBoundingClientRect()
          const y = Math.min(b.top + Math.min(b.height / 2, 300), innerHeight - 10)
          const el = y > 0 ? document.elementFromPoint(b.left + b.width / 2, y) : null
          hit = !el ? "nothing" : sec.contains(el) ? "inside" : `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}.${String(el.className).split(/\s+/).slice(0, 2).join(".")} in ${(el.closest(".shopify-section") as HTMLElement | null)?.id || el.parentElement?.tagName.toLowerCase()}`
        }
        out[id] = { h, hit }
      }
      st.remove()
      window.scrollTo(0, 0)
      return { secs: out, errors: ((window as unknown as { __probeErrors: string[] }).__probeErrors || []).length, last: ((window as unknown as { __probeErrors: string[] }).__probeErrors || []).slice(-2) }
    }), 6000)
    let baseline = await measure(frame)
    const send = async (id: string, h: string, prev: string) => {
      await tab.evaluate((id, h, prev) => { document.querySelector("iframe")!.contentWindow!.postMessage({ storelib: 1, type: "section", id, html: h, prev, now: true }, "*") }, id, h, prev)
      await sleep(350)
    }
    for (const s of list) {
      if (s.hidden) continue
      const typeKey = String(s.type)
      const ownerOf = triedTypes.owner.get(typeKey)
      if (ownerOf ? ownerOf !== name : triedTypes.seen.has(typeKey)) continue
      if (triedTypes.seen.has(`${name}:${typeKey}`)) continue
      triedTypes.seen.add(typeKey)
      triedTypes.seen.add(`${name}:${typeKey}`)
      const schema = theme.schemaOf("sections", theme.typeOf(s.type)) as { settings?: Setting[] }
      const settings = (schema.settings ?? []).filter((x) => x && x.id && valuesFor(x).length)
      if (!settings.length) continue
      if (!baseline.secs[s.id]) continue
      sections++
      let own = sectionHtml(s)
      for (const set of settings) {
        for (const value of valuesFor(set)) {
          if (JSON.stringify((s.settings as Record<string, unknown> | undefined)?.[set.id]) === JSON.stringify(value)) continue
          changes++
          const changed = { ...s, settings: { ...(s.settings as Record<string, unknown>), [set.id]: value } } as StoredSection
          let next: string
          try { next = sectionHtml(changed) } catch (e) { findings.push({ template: name, section: s.id, type: typeKey, setting: set.id, value, kind: "errors", detail: `drawSection threw: ${String(e).slice(0, 120)}` }); continue }
          /* Measured again just before: a popup on a timer or a late picture is the page's own, not this value's. */
          baseline = await measure(frame).catch(() => baseline)
          const errs0 = baseline.errors
          let after
          try {
            await send(s.id, next, own)
            after = await measure(frame)
          } catch (e) {
            findings.push({ template: name, section: s.id, type: typeKey, setting: set.id, value, kind: "errors", detail: `the page stopped answering: ${String(e).slice(0, 80)}` })
            frame = await open(); baseline = await measure(frame); own = sectionHtml(s)
            continue
          }
          const add = (kind: Finding["kind"], detail: string) => findings.push({ template: name, section: s.id, type: typeKey, setting: set.id, value, kind, detail })
          for (const [id, b] of Object.entries(baseline.secs)) {
            if (id === s.id) continue
            const a = after.secs[id]
            if (b.h > 20 && (!a || a.h < 2)) add("collapsed", `${id} ${b.h}px -> ${a ? a.h : "gone"}`)
            /* Covered by the section changed, or by something of no section's (a layer a script took out of its section): another section's own popup is not this value's doing. */
            else if (b.hit === "inside" && a && a.hit !== "inside" && a.h > 40 && (a.hit.endsWith(` in shopify-section-${s.id}`) || !/ in shopify-section-/.test(a.hit))) add("covered", `${id} under ${a.hit}`)
          }
          if (after.errors > errs0) add("errors", after.last.join(" | "))
          /* Put back, and the page must be as it was. */
          await send(s.id, own, next)
          const offFrom = (m: typeof baseline) => Object.entries(baseline.secs).filter(([id, b]) => { const a = m.secs[id]; return !a || Math.abs(a.h - b.h) > 4 || (b.hit === "inside" && a.hit !== "inside" && (a.hit.endsWith(` in shopify-section-${s.id}`) || !/ in shopify-section-/.test(a.hit))) })
          let back = await measure(frame)
          let off = offFrom(back)
          /* A moment more to settle (a slider, a picture; a swapped section is held at its height up to 3s for its pictures), then judged. */
          if (off.length) { await sleep(3300); back = await measure(frame); off = offFrom(back) }
          if (off.length) {
            const why = await within(frame.evaluate((id) => {
              const el = document.getElementById(`shopify-section-${id}`)
              if (!el) return "gone"
              const styled = Array.from(el.querySelectorAll<HTMLElement>("[style]")).slice(0, 3).map((x) => `${x.tagName.toLowerCase()}.${String(x.className).split(" ")[0]}{${x.getAttribute("style")!.slice(0, 80)}}`)
              return `minHeight=${el.style.minHeight || "-"} styled=${styled.join(",")}`
            }, s.id), 3000).catch(() => "?")
            add("stuck", off.slice(0, 3).map(([id, b]) => `${id} ${b.h}/${b.hit} -> ${back.secs[id]?.h}/${back.secs[id]?.hit}`).join("; ") + `  [${why}]`)
            await tab.screenshot({ path: join(OUT, `stuck-${name}-${set.id}.png`) }).catch(() => {})
            frame = await open(); baseline = await measure(frame); own = sectionHtml(s)
          } else baseline = { ...baseline, errors: back.errors }
        }
      }
    }
  } finally {
    await tab.close().catch(() => {})
    server.close()
  }
  return { findings, sections, changes }
}

void main().catch((e) => { console.error(e); process.exit(2) })
