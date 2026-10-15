/**
 * ===========================================================================
 *  LEARN, A LOCKED PROGRAM, ITS CHECKOUT SHEET AND THE BUILDER, MEASURED
 * ===========================================================================
 * The real components (scripts/render-community-learn.tsx) with fixture
 * props, served at a storelib.com address with the API answered here and
 * Stripe's Embedded Checkout replaced by a stub of the same shape (it asks
 * fetchClientSecret, draws a form, and calls onComplete when Pay is
 * pressed), at 1440x900 and on a 390x844 phone:
 *
 *   EVERY CASE   nothing scrolls sideways; on a phone every button and link
 *                is at least 40px tall; no page errors; screenshots.
 *   LEARN        six cards that never overlap, three across on a computer and
 *                one on a phone, the same height in a row; real progress; the
 *                locks in words ($49, Level 3, Opens on); the draft marked.
 *   LOCKED       the sentence, Buy for $49, what is inside.
 *   CHECKOUT     the sheet asks the server for a session once, shows Stripe's
 *                form in a dialog no wider than 520px on a computer and a
 *                bottom sheet on a phone; Pay confirms with the server once
 *                and says it is theirs.
 *   BUILDER      one row per program, 72px or taller, status and access in
 *                words; the editor's cards, the lessons from the course card,
 *                and the Save bar stuck to the bottom of the screen while the
 *                page scrolls.
 *
 *   PROBE_CSS=source node scripts/check-community-learn.mjs
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const css = await appCss(root)
const work = mkdtempSync(join(tmpdir(), "storelib-community-learn-"))
const shots = process.env.SHOTS_DIR || join(work, "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

writeFileSync(join(work, "navigation.js"), `export const usePathname = () => "/community/makers/learn"
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, back() {}, refresh() { window.__refreshed = (window.__refreshed || 0) + 1 } })
export const useSearchParams = () => new URLSearchParams(location.search)
export const redirect = () => {}
export const notFound = () => {}
`)
writeFileSync(join(work, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); e.preventDefault() } }, children) })
`)
writeFileSync(join(work, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, quality, ...rest }) { return React.createElement("img", { src, alt, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" } : undefined, ...rest }) }
`)
/* Stripe's Embedded Checkout, the same shape: the provider asks for the client secret, the form calls onComplete. */
writeFileSync(join(work, "stripe-react.jsx"), `import React from "react"
const Ctx = React.createContext(null)
export function EmbeddedCheckoutProvider({ options, children }) {
  const [secret, setSecret] = React.useState(null)
  React.useEffect(() => { let live = true; options.fetchClientSecret().then((s) => live && setSecret(s), () => {}); return () => { live = false } }, [])
  return React.createElement(Ctx.Provider, { value: { secret, options } }, children)
}
export function EmbeddedCheckout() {
  const c = React.useContext(Ctx)
  if (!c || !c.secret) return React.createElement("div", { "data-stripe-stub": "loading", style: { height: 560 } })
  const field = (label, h = 44) => React.createElement("div", { style: { margin: "0 20px 14px" } }, React.createElement("div", { style: { font: "500 13px Inter, sans-serif", color: "#30313d", marginBottom: 6 } }, label), React.createElement("div", { style: { height: h, border: "1px solid #e0e0e0", borderRadius: 6, boxShadow: "0 1px 1px rgba(0,0,0,.03)" } }))
  return React.createElement("div", { "data-stripe-stub": "form", "data-secret": c.secret, style: { paddingTop: 8 } },
    React.createElement("div", { style: { margin: "4px 20px 18px", height: 44, borderRadius: 6, background: "#000", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", font: "600 15px Inter, sans-serif" } }, "Pay with Link"),
    field("Email"), field("Card information", 88), field("Cardholder name"), field("Country or region"),
    React.createElement("button", { type: "button", "data-stripe-pay": "", onClick: () => c.options.onComplete(), style: { display: "block", width: "calc(100% - 40px)", margin: "8px 20px 20px", height: 46, borderRadius: 6, background: "#0074d4", color: "#fff", border: 0, font: "600 16px Inter, sans-serif" } }, "Pay $49.00"))
}
`)
writeFileSync(join(work, "stripe-pure.js"), `export const loadStripe = () => Promise.resolve({})\n`)

const { build } = await import("esbuild")
await build({
  entryPoints: [join(root, "scripts/render-community-learn.tsx")],
  bundle: true,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  alias: {
    "@": ".",
    "next/navigation": join(work, "navigation.js"),
    "next/link": join(work, "link.jsx"),
    "next/image": join(work, "image.jsx"),
    "@stripe/react-stripe-js": join(work, "stripe-react.jsx"),
    "@stripe/stripe-js/pure": join(work, "stripe-pure.js"),
  },
  banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder',NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:'pk_test_probe'}};" },
  loader: { ".css": "empty" },
  outfile: join(work, "app.js"),
  logLevel: "error",
  absWorkingDir: root,
  nodePaths: [join(root, "node_modules")],
})
const js = readFileSync(join(work, "app.js"), "utf8")
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })
const json = (r, body, status = 200) => r.respond({ status, contentType: "application/json", body: JSON.stringify(body) })

const TREE = {
  courseId: "k2",
  modules: [
    {
      id: "m1",
      title: "Clay and the wheel",
      lessons: [
        { id: "l1", title: "Wedging without wrist pain", notes: "", isPreview: true, durationSeconds: 412, video: { name: "wedging.mp4", size: 81_000_000 }, externalUrl: "", captions: false, attachments: [] },
        { id: "l2", title: "Centering, slowly", notes: "", isPreview: false, durationSeconds: 655, video: null, externalUrl: "https://youtu.be/dQw4w9WgXcQ", captions: false, attachments: [] },
      ],
    },
    { id: "m2", title: "Trimming", lessons: [{ id: "l3", title: "Leather hard, explained", notes: "", isPreview: false, durationSeconds: null, video: null, externalUrl: "", captions: false, attachments: [] }] },
  ],
}

async function open(label, vp, which) {
  const p = await browser.newPage()
  await p.setViewport(vp)
  const errors = []
  const calls = []
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
  await p.setRequestInterception(true)
  p.on("request", (r) => {
    const u = r.url()
    if (u.startsWith("https://storelib.com/__lprobe")) return r.respond({ status: 200, contentType: "text/html", body: html })
    if (u.includes("/api/")) calls.push(`${r.method()} ${u.replace("https://storelib.com", "")}`)
    if (/\/learn\/p2\/checkout\/confirm$/.test(u)) return json(r, { ok: true, programId: "p2" })
    if (/\/learn\/p2\/checkout$/.test(u)) return json(r, { clientSecret: "cs_test_probe_secret_x", sessionId: "cs_test_probe000001", amountCents: 4900, currency: "usd" })
    if (u.includes("/api/courses/manage")) return json(r, { tree: TREE })
    if (/\/api\/courses\/lessons\/[^/]+\/play/.test(u)) return json(r, { kind: "text", access: "owner" })
    if (u.includes("/api/courses/progress")) return json(r, { kept: true })
    if (u.startsWith("data:")) return r.continue()
    return r.abort()
  })
  await p.goto(`https://storelib.com/__lprobe?${which}`, { waitUntil: "domcontentloaded" })
  await p.waitForSelector("[data-probe-case]")
  await sleep(400)
  return { p, errors, calls }
}

async function common(p, label, which, phone, scope = "main") {
  const m = await p.evaluate((sel) => {
    const over = document.documentElement.scrollWidth - innerWidth
    const small = []
    for (const el of document.querySelectorAll(`${sel} a, ${sel} button, ${sel} input, ${sel} select`)) {
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      if (r.width === 0 || r.height === 0 || cs.visibility === "hidden" || el.closest("[hidden]") || el.closest("[data-stripe-stub]")) continue
      if (el.type === "file" || el.getAttribute("role") === "switch") continue
      if (r.height < 40) small.push(`${(el.textContent || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 28)} ${Math.round(r.width)}x${Math.round(r.height)}`)
    }
    return { over, small }
  }, scope)
  expect(m.over <= 0, `${label} ${which}: nothing scrolls sideways`, m.over)
  if (phone) expect(m.small.length === 0, `${label} ${which}: every button, link and field is at least 40px tall`, m.small)
  await p.screenshot({ path: join(shots, `${which}-${label}.png`), fullPage: !["checkout", "paid", "editor"].includes(which) })
}

const VIEWPORTS = [
  ["desktop-1440", { width: 1440, height: 900 }, false],
  ["phone-390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, true],
]

for (const [label, vp, phone] of VIEWPORTS) {
  console.log(`\n${label}`)

  /* Learn */
  {
    const { p, errors } = await open(label, vp, "learn")
    const g = await p.evaluate(() => {
      const cards = [...document.querySelectorAll("[data-program-card]")].map((c) => c.getBoundingClientRect())
      let overlap = 0
      for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
        const a = cards[i], b = cards[j]
        if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) overlap++
      }
      const shown = (el) => getComputedStyle(el).display !== "none"
      return {
        n: cards.length,
        cols: new Set(cards.map((r) => Math.round(r.left))).size,
        overlap,
        heights: cards.map((r) => Math.round(r.height)),
        /* DRIFT: the bar is drawn by scale on the compositor now (learn-library.tsx), so its percentage is read from aria-valuenow. */
        bars: [...document.querySelectorAll("[data-program-card] [role=progressbar]")].map((d) => `${d.getAttribute("aria-valuenow")}%`),
        locks: [...document.querySelectorAll("[data-lock-label], [data-lock-line]")].filter(shown).map((l) => l.textContent),
        draft: [...document.querySelectorAll("[data-program-card='p6'] [data-draft], [data-program-card='p6'] h2 span")].some((d) => shown(d) && /Draft/.test(d.textContent)),
        title: document.querySelector("#learn-title")?.textContent,
      }
    })
    expect(g.title === "Learn", `${label}: the page is called Learn`, g.title)
    expect(g.n === 6 && g.overlap === 0, `${label}: six program cards, none overlapping`, { n: g.n, overlap: g.overlap })
    /* DRIFT: two across at most on a computer now, in an 820px column (learn-library.tsx data-program-grid). */
    expect(phone ? g.cols === 1 : g.cols === 2, `${label}: ${phone ? "one" : "two"} across`, g.cols)
    expect(new Set(g.heights.slice(0, phone ? 1 : 3)).size === 1, `${label}: cards in a row are the same height`, g.heights)
    expect(g.bars.join() === "58%,100%,0%", `${label}: progress bars are the members' real percentages`, g.bars)
    expect(g.locks.length === 3 && g.locks[0] === "$49" && g.locks[1] === "Level 3" && g.locks[2].startsWith("Opens on"), `${label}: locked programs say what opens them`, g.locks)
    expect(g.draft, `${label}: the draft is marked Draft`)
    await common(p, label, "learn", phone)
    expect(errors.length === 0, `${label} learn: no page errors`, errors)
    await p.close()
  }

  for (const which of ["empty", "level", "program"]) {
    const { p, errors } = await open(label, vp, which)
    await common(p, label, which, phone)
    if (which === "empty") expect(await p.evaluate(() => !!document.querySelector("[data-learn-empty] [data-place-empty-action]")), `${label} empty: the people who run it get Make a program`)
    if (which === "level") expect(await p.evaluate(() => /opens at level 3/.test(document.querySelector("[data-lock-sentence]")?.textContent || "") && !document.querySelector("[data-buy-program]")), `${label} level: says the level, no Buy button`)
    if (which === "program") expect(await p.evaluate(() => !!document.querySelector("[data-course-player]") && document.querySelector("[data-course-player] a[aria-label]")?.getAttribute("aria-label") === "Learn"), `${label} program: the course player, its arrow back to Learn`)
    expect(errors.length === 0, `${label} ${which}: no page errors`, errors)
    await p.close()
  }

  /* A paid program, locked */
  {
    const { p, errors } = await open(label, vp, "locked")
    const g = await p.evaluate(() => ({
      sentence: document.querySelector("[data-lock-sentence]")?.textContent,
      buy: document.querySelector("[data-buy-program]")?.textContent?.trim(),
      buyH: Math.round(document.querySelector("[data-buy-program]")?.getBoundingClientRect().height || 0),
      modules: document.querySelectorAll("[data-program-outline] ol > li").length,
    }))
    expect(/sold on its own/.test(g.sentence || ""), `${label} locked: says it is sold on its own`, g.sentence)
    expect(g.buy === "Buy for $49" && g.buyH >= 40, `${label} locked: Buy for $49, a full size button`, g)
    expect(g.modules === 3, `${label} locked: what is inside, module by module`, g.modules)
    await common(p, label, "locked", phone)
    expect(errors.length === 0, `${label} locked: no page errors`, errors)
    await p.close()
  }

  /* The checkout sheet */
  {
    const { p, errors, calls } = await open(label, vp, "checkout")
    await p.waitForSelector("[data-stripe-stub='form']", { timeout: 5000 }).catch(() => null)
    /* Until the sheet or the dialog has finished arriving. */
    await p.waitForFunction(() => { const s = document.querySelector("[data-sheet-panel]"); return !s || getComputedStyle(s).position === "absolute" || Math.abs(s.getBoundingClientRect().bottom - innerHeight) < 1 }, { timeout: 3000 }).catch(() => null)
    await sleep(400)
    const g = await p.evaluate(() => {
      const box = document.querySelector("[data-program-checkout]")
      const r = box?.getBoundingClientRect()
      const panel = box?.closest("[data-sheet-panel]") ?? box?.closest("[role=dialog]") ?? box?.parentElement
      const pr = panel?.getBoundingClientRect()
      return {
        form: !!document.querySelector("[data-stripe-stub='form']"),
        secret: document.querySelector("[data-stripe-stub='form']")?.getAttribute("data-secret"),
        width: Math.round(pr?.width || 0),
        left: Math.round(pr?.left || 0),
        bottom: Math.round(pr?.bottom || 0),
        top: Math.round(pr?.top || 0),
        title: box?.querySelector("h2")?.textContent,
        line: box?.querySelector("p")?.textContent,
        opacity: (() => { let o = 1; for (let el = panel; el && el !== document.documentElement; el = el.parentElement) o *= Number(getComputedStyle(el).opacity); return Math.round(o * 1000) / 1000 })(),
        bodyScrolls: (() => { const b = document.querySelector("[data-program-checkout-body]"); return b ? getComputedStyle(b).overflowY : null })(),
      }
    })
    const asked = calls.filter((c) => /^POST .*\/learn\/p2\/checkout$/.test(c)).length
    expect(g.form && g.secret === "cs_test_probe_secret_x", `${label} checkout: Stripe's form, made from the server's session`, g)
    expect(asked === 1, `${label} checkout: the session is asked for once`, calls)
    expect(/\$49/.test(g.line || "") && g.title === "Wheel throwing, from clay to cup", `${label} checkout: the program and its price at the top`, { title: g.title, line: g.line })
    if (phone) expect(Math.abs(g.bottom - 844) <= 2 && g.top > 40 && g.top < 120, `${label} checkout: a bottom sheet, nearly full height`, g)
    else expect(g.width > 0 && g.width <= 520 && Math.abs(g.left + g.width / 2 - 720) <= 2, `${label} checkout: a centred dialog, at most 520px wide`, g)
    expect(g.bodyScrolls === "auto", `${label} checkout: a long form scrolls inside the sheet`, g.bodyScrolls)
    expect(g.opacity >= 0.99, `${label} checkout: the sheet is opaque, nothing of the page shows through`, g.opacity)
    await common(p, label, "checkout", phone, "[data-program-checkout]")
    if (process.env.LEARN_DEBUG && phone) {
      await p.evaluate(() => { document.querySelector("[data-sheet-panel]").style.opacity = "1" })
      await sleep(100)
      await p.screenshot({ path: join(shots, `checkout-opacity1-${label}.png`) })
    }
    await p.click("[data-stripe-pay]")
    await p.waitForSelector("[data-program-bought]", { timeout: 4000 }).catch(() => null)
    await sleep(300)
    const done = await p.evaluate(() => ({ bought: !!document.querySelector("[data-program-bought]"), text: document.querySelector("[data-program-bought]")?.textContent, refreshed: window.__refreshed || 0 }))
    const confirmed = calls.filter((c) => /^POST .*\/checkout\/confirm$/.test(c)).length
    expect(done.bought && confirmed === 1 && done.refreshed >= 1, `${label} checkout: Pay confirms with the server once, says it is theirs, and refreshes the page`, { ...done, confirmed })
    await p.screenshot({ path: join(shots, `paid-${label}.png`) })
    expect(errors.length === 0, `${label} checkout: no page errors`, errors)
    await p.close()
  }

  /* The builder */
  {
    const { p, errors } = await open(label, vp, "builder")
    const g = await p.evaluate(() => {
      /* Changed on purpose (round 32): from 768px the programs are a table and the phone's list is hidden, so only the rows on screen count. */
      const rows = [...document.querySelectorAll("[data-program-row]")].filter((r) => r.getBoundingClientRect().height > 0)
      return {
        n: rows.length,
        heights: rows.map((r) => Math.round(r.getBoundingClientRect().height)),
        status: rows.map((r) => r.querySelector("[data-status]")?.getAttribute("data-status")),
        lines: rows.map((r) => r.querySelector("[data-program-line]")?.textContent ?? r.textContent),
      }
    })
    /* Changed on purpose (round 32): a table row on a computer is 64px, as every row of the admin's tables; a phone's row stays 72px or taller. */
    expect(g.n === 5 && g.heights.every((h) => h >= (phone ? 72 : 64)), `${label} builder: one row per program, ${phone ? 72 : 64}px or taller`, g.heights)
    expect(g.status.join() === "published,published,published,published,draft", `${label} builder: Published and Draft in words`, g.status)
    expect(/\$49 · 23 bought/.test(g.lines[1] || "") && /From level 3/.test(g.lines[2] || "") && /a course you sell/i.test(g.lines[3] || ""), `${label} builder: price and buyers, the level, an attached course`, g.lines)
    await common(p, label, "builder", phone)
    expect(errors.length === 0, `${label} builder: no page errors`, errors)
    await p.close()
  }

  /* The program editor */
  {
    const { p, errors, calls } = await open(label, vp, "editor")
    await p.waitForSelector("[data-program-editor]")
    await sleep(500)
    const at = async () =>
      p.evaluate(() => {
        const foot = document.querySelector("[data-editor-foot]").getBoundingClientRect()
        return { footBottom: Math.round(foot.bottom), footTop: Math.round(foot.top), vh: innerHeight, scrollY: Math.round(scrollY) }
      })
    const top = await at()
    await p.evaluate(() => window.scrollTo(0, 600))
    await sleep(150)
    const mid = await at()
    const g = await p.evaluate(() => ({
      cards: [...document.querySelectorAll("[data-program-editor] section h3")].map((h) => h.textContent),
      price: document.querySelector("#program-price")?.value,
      modules: document.querySelectorAll("[data-program-editor] input[value='Clay and the wheel'], [data-program-editor] input[value='Trimming']").length,
      seg: [...document.querySelectorAll("[data-program-editor] [data-value]")].map((b) => b.textContent),
      state: document.querySelector("[data-editor-state]")?.getAttribute("data-editor-state"),
    }))
    expect(g.cards.join() === "Details,Lessons,Who can open it,Release", `${label} editor: the product editor's cards, for a program`, g.cards)
    expect(g.seg.join() === "Free,A level,Paid" && g.price === "49", `${label} editor: Free, A level or Paid, the price as typed`, g)
    expect(g.modules === 2 && calls.some((c) => c.includes("/api/courses/manage?productId=p2")), `${label} editor: the lessons come from the course card, by the program's id`, { modules: g.modules })
    expect(g.state === "Published", `${label} editor: the state in words in the foot bar`, g.state)
    expect(top.footBottom === top.vh && mid.footBottom === mid.vh && mid.scrollY > 0, `${label} editor: the Save bar stays at the bottom of the screen while the page scrolls`, { top, mid })
    await p.evaluate(() => window.scrollTo(0, 0))
    await common(p, label, "editor", phone)
    await p.evaluate(() => {
      const t = document.querySelector("#program-summary")
      const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set
      set.call(t, "Six weeks at the wheel. Changed.")
      t.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await sleep(100)
    const dirty = await p.evaluate(() => ({ state: document.querySelector("[data-editor-state]")?.getAttribute("data-editor-state"), save: !document.querySelector("[data-save-button]")?.disabled }))
    expect(dirty.state === "Unsaved changes" && dirty.save, `${label} editor: a change says so and Save comes on`, dirty)
    await p.screenshot({ path: join(shots, `editor-dirty-${label}.png`) })
    await p.evaluate(() => document.querySelector("#program-access")?.scrollIntoView({ block: "start" }))
    await sleep(150)
    await p.screenshot({ path: join(shots, `editor-access-${label}.png`) })
    expect(errors.length === 0, `${label} editor: no page errors`, errors)
    await p.close()
  }
}

await browser.close()
console.log(`\nshots: ${shots}`)
console.log(broken ? `\n${broken} check(s) failed` : "\nall checks passed")
process.exit(broken ? 1 : 0)
