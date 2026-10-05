/**
 * ===========================================================================
 *  ROUND 13, BLOCKED WORDS (Moderation, Rules), MEASURED AND PHOTOGRAPHED
 * ===========================================================================
 * The real component (scripts/render-community-safety.tsx) at 1440x900 and
 * 390x844:
 *
 *   LAYOUT    nothing scrolls sideways; on a phone every control is 40px or
 *             taller; the row lines up with the slow mode row above it
 *   SAVE      appears only after a change; a star too early is refused in
 *             the page with why, before anything is sent; a good list is
 *             sent cleaned (lower case, repeats gone) with the action
 *   READ      a moderator sees the words as text and no box
 *   LOAD      without `initial` the row keeps its height while it reads the
 *             list (nothing below it moves when the words arrive)
 *
 *   PROBE_CSS=source node scripts/check-community-safety.mjs
 *   Pictures go to SHOTS_DIR (a temp folder by default).
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const css = await appCss(root)
const fonts = interFaces(root)
const stubs = join(root, ".community-safety-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-community-safety-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ORIGIN = "https://storelib.com"

try {
  writeFileSync(join(stubs, "navigation.js"), `const router = { push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} }
export const usePathname = () => location.pathname
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(location.search)
export const redirect = () => {}
export const notFound = () => {}
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest }, children) })
`)
  writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, priority, sizes, quality, placeholder, blurDataURL, unoptimized, loader, ...rest }) { return React.createElement("img", { src: typeof src === "string" ? src : src?.src, alt, ...rest }) }
`)
  writeFileSync(join(stubs, "supabase-client.js"), `export function createClient() { return { storage: { from() { return {} } }, auth: { getSession: async () => ({ data: { session: null } }) } } }
export const isNativePlatform = () => false
`)
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-community-safety.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.community-safety-probe/navigation.js", "next/link": "./.community-safety-probe/link.jsx", "next/image": "./.community-safety-probe/image.jsx" },
    plugins: [{ name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })) } }],
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "app.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fonts}${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--hide-scrollbars"] })
  const DESKTOP = { width: 1440, height: 900, deviceScaleFactor: 1 }
  const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }

  async function open(which, vp, { slowGet = 0 } = {}) {
    const p = await browser.newPage()
    await p.setViewport(vp)
    const errors = []
    const puts = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
    await p.setRequestInterception(true)
    p.on("request", async (r) => {
      const url = r.url()
      if (url.includes("/api/app/community/") && url.endsWith("/words")) {
        if (r.method() === "PUT") {
          const body = JSON.parse(r.postData() || "{}")
          puts.push(body)
          return void r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ words: body.words, action: body.action }) })
        }
        if (slowGet) await sleep(slowGet)
        return void r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ words: ["free followers", "forex"], action: "block", canEdit: true }) }).catch(() => {})
      }
      if (url.startsWith(`${ORIGIN}/`)) return r.respond({ status: 200, contentType: "text/html", body: html })
      if (url.startsWith("data:")) return r.continue()
      return r.respond({ status: 204, body: "" })
    })
    await p.goto(`${ORIGIN}/app/community/x/moderation?case=${which}`, { waitUntil: "load" })
    await p.evaluate(() => document.fonts.ready)
    await sleep(300)
    return { p, errors, puts }
  }
  const shot = (p, name) => p.screenshot({ path: join(shots, `${name}.png`), fullPage: true })
  const sideScroll = (p) => p.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  const smallTargets = (p) =>
    p.evaluate(() => [...document.querySelectorAll("[data-blocked-words] button, [data-blocked-words] textarea")].map((el) => ({ t: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 20), h: Math.round(el.getBoundingClientRect().height) })).filter((x) => x.h && x.h < 40))
  const edges = (p) => p.evaluate(() => {
    const a = document.querySelector("[data-slow-mode] p").getBoundingClientRect()
    const b = document.querySelector("[data-blocked-words] p").getBoundingClientRect()
    return { slow: Math.round(a.left), words: Math.round(b.left) }
  })

  for (const [name, vp] of [["desktop", DESKTOP], ["phone", PHONE]]) {
    console.log(`\nEDIT, ${name}`)
    const { p, errors, puts } = await open("edit", vp)
    expect((await sideScroll(p)) <= 0, "nothing scrolls sideways", await sideScroll(p))
    const e = await edges(p)
    expect(e.slow === e.words, "the title lines up with Slow mode's", e)
    const before = await p.evaluate(() => ({ save: !!document.querySelector("[data-blocked-words-save]"), text: document.querySelector("[data-blocked-words] textarea").value, held: document.querySelector('[data-blocked-words] [role=radio][aria-checked=true]').textContent }))
    expect(!before.save && before.text.split("\n").length === 5 && before.held === "Hold for review", "saved list shown, its action picked, no Save until something changes", before)
    if (name === "phone") expect((await smallTargets(p)).length === 0, "every control is 40px or taller on a phone", await smallTargets(p))
    await shot(p, `${name}-edit`)
    /* A star too early is refused before anything is sent. */
    await p.click("[data-blocked-words] textarea")
    await p.keyboard.press("End")
    await p.evaluate(() => { const t = document.querySelector("[data-blocked-words] textarea"); t.selectionStart = t.selectionEnd = t.value.length })
    await p.keyboard.type("\nab*")
    await sleep(100)
    await p.click("[data-blocked-words-save]")
    await sleep(150)
    const refused = await p.evaluate(() => document.querySelector("[data-blocked-words]").textContent)
    expect(/a star goes at the end/.test(refused) && puts.length === 0, "\"ab*\" is refused in the page with why, nothing sent", refused.slice(0, 160))
    if (name === "phone") await shot(p, `${name}-error`)
    /* Fixed: a repeat in other case, then Save sends the cleaned list. */
    await p.evaluate(() => { const t = document.querySelector("[data-blocked-words] textarea"); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set; set.call(t, t.value.replace("\nab*", "\nFOREX\nScam Link")); t.dispatchEvent(new Event("input", { bubbles: true })) })
    await sleep(100)
    await p.evaluate(() => [...document.querySelectorAll("[data-blocked-words] [role=radio]")].find((b) => b.textContent === "Refuse it").click())
    await sleep(100)
    await p.click("[data-blocked-words-save]")
    await sleep(300)
    expect(puts.length === 1 && JSON.stringify(puts[0].words) === JSON.stringify(["free followers", "crypto signal*", "telegram group", "dm me for*", "forex", "scam link"]) && puts[0].action === "block", "Save sends the list cleaned (lower case, the repeat gone) with Refuse", puts[0])
    const after = await p.evaluate(() => ({ save: !!document.querySelector("[data-blocked-words-save]"), count: document.querySelector("[data-blocked-words] .tabular-nums").textContent }))
    expect(!after.save && after.count === "6 of 200", "saved: Save goes, the count is right", after)
    if (name === "desktop") await shot(p, `${name}-saved`)
    expect(errors.length === 0, "no page errors", errors)
    await p.close()
  }

  console.log("\nREAD, a moderator")
  for (const [name, vp] of [["desktop", DESKTOP], ["phone", PHONE]]) {
    const { p } = await open("read", vp)
    const r = await p.evaluate(() => ({ box: !!document.querySelector("[data-blocked-words] textarea"), radios: document.querySelectorAll("[data-blocked-words] [role=radio]").length, text: document.querySelector("[data-blocked-words]").textContent }))
    expect(!r.box && r.radios === 0 && r.text.includes("free followers, crypto signal*") && r.text.includes("Held for review"), `${name}: the words as text, the action as words, nothing to edit`, r.text.slice(0, 120))
    await shot(p, `${name}-read`)
    await p.close()
  }

  console.log("\nEMPTY and LOAD")
  {
    const { p } = await open("empty", PHONE)
    const t = await p.evaluate(() => document.querySelector("[data-blocked-words] .tabular-nums").textContent)
    expect(/Up to 200/.test(t), "an empty list says the limits", t)
    await shot(p, "phone-empty")
    await p.close()
    const l = await open("load", DESKTOP, { slowGet: 700 })
    const y0 = await l.p.evaluate(() => Math.round(document.querySelector("section > p:last-child").getBoundingClientRect().top))
    await sleep(900)
    const y1 = await l.p.evaluate(() => Math.round(document.querySelector("section > p:last-child").getBoundingClientRect().top))
    const v = await l.p.evaluate(() => document.querySelector("[data-blocked-words] textarea")?.value)
    expect(v === "free followers\nforex", "without initial it reads the list itself", v)
    expect(Math.abs(y1 - y0) <= 2, "what is below does not move when the words arrive", { before: y0, after: y1 })
    await l.p.close()
  }
  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
console.log(`\nshots: ${shots}`)
if (broken) {
  console.log(`${broken} checks failed`)
  process.exit(1)
}
console.log("all checks passed")
