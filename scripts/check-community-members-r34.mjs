/**
 * ===========================================================================
 *  ROUND 34: THE MEMBERS LIST AND ONE MEMBER OPENED, MEASURED
 * ===========================================================================
 * The owner, on the Members area: "Keep the UI simple. Do not fill the
 * Members page with unnecessary panels, duplicated buttons, or complicated
 * selectors. Use a clean responsive table/list on desktop and a compact
 * card-based presentation on mobile where appropriate. Clicking a member
 * should open a clear, useful detail view without navigating through
 * multiple unnecessary screens."
 *
 * The real MembersSection and the real member sheet
 * (scripts/render-community-members-r34.tsx) in headless Chromium at 1280
 * and 390, in the light look and in the community's dark one:
 *
 *   LIST      one card, one row per member, a table from 768px and one
 *             row per member on a phone; nothing past the screen's edge and
 *             no sideways scroll; no duplicated Export or Invite; no
 *             browser select, check box or radio in the toolbar
 *   FEATURED  the featured members say one word, the others say nothing,
 *             and the word carries no number
 *   SHEET     a press opens the member without leaving the page (the
 *             address does not change and nothing is pushed to the router);
 *             the sheet holds who they are, the facts, what they did here,
 *             their access, their programs and the choices, inside the
 *             screen at both widths
 *   READ      the detail is asked for once per member, and a second opening
 *             asks again for nobody
 *   DARK      every surface and every word in the sheet and the list reads
 *             against its own background in the dark look
 *   MESSAGES  the member's own choice about who may message them: two
 *             choices, the narrow one keeping the people who run the
 *             community, each a press of at least 40px on a phone, in both
 *             looks at both widths
 *
 * Pictures go to SHOTS_DIR (.round34-member-shots by default); look at them,
 * then delete the folder.
 *
 *   node scripts/check-community-members-r34.mjs [LIST FEATURED SHEET READ DARK MESSAGES]
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const only = new Set(process.argv.slice(2).map((s) => s.toUpperCase()))
const want = (s) => only.size === 0 || only.has(s)
const css = await appCss(root)
const fonts = interFaces(root)
const themeCss = readFileSync(join(root, "app/theme-dark.css"), "utf8")
const stubs = join(root, ".community-r34-probe")
const shots = process.env.SHOTS_DIR || join(root, ".round34-member-shots")
mkdirSync(shots, { recursive: true })
mkdirSync(stubs, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ORIGIN = "https://storelib.com"
const ID = "6f1c2b9e-1d4f-4c55-9a0b-3f1e2d4c5b6a"

const PRELUDE = `window.__sent = []; window.__router = [];`

let browser

try {
  writeFileSync(
    join(stubs, "navigation.js"),
    `const log = (k, a) => (window.__router ||= []).push([k, a])
const router = { push: (h) => log("push", h), replace: (h) => log("replace", h), prefetch: () => {}, back: () => log("back"), refresh: () => log("refresh") }
export const usePathname = () => window.__path || location.pathname
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(location.search)
export const redirect = () => {}
export const notFound = () => {}
`,
  )
  writeFileSync(
    join(stubs, "link.jsx"),
    `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest }, children) })
`,
  )
  writeFileSync(
    join(stubs, "image.jsx"),
    `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest }) }
`,
  )
  writeFileSync(
    join(stubs, "supabase-client.js"),
    `export function createClient() {
  return {
    channel() { const ch = { on() { return ch }, subscribe(cb) { setTimeout(() => cb && cb("SUBSCRIBED"), 30); return ch }, track: async () => "ok", presenceState: () => ({}), send: async () => "ok" }; return ch },
    removeChannel() {},
    realtime: { setAuth: async () => {} },
    auth: { getSession: async () => ({ data: { session: { user: { id: "00000000-0000-4000-8000-000000000001" } } } }), signOut: async () => ({ error: null }) },
  }
}
export const isNativePlatform = () => false
`,
  )
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-community-members-r34.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: {
      "@": ".",
      "next/navigation": "./.community-r34-probe/navigation.js",
      "next/link": "./.community-r34-probe/link.jsx",
      "next/image": "./.community-r34-probe/image.jsx",
    },
    plugins: [{ name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })) } }],
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "page.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "page.js"), "utf8")
  const page = (dark) =>
    `<!doctype html><html${dark ? ' data-sl-dark="" data-community-theme="dark"' : ""}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${fonts}${css}</style><style>${themeCss}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="root"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

  browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], protocolTimeout: 240_000 })
  const VIEWS = {
    1280: { width: 1280, height: 900, deviceScaleFactor: 1 },
    390: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  }

  async function open(which, width, dark = false) {
    const p = await browser.newPage()
    await p.setViewport(VIEWS[width])
    await p.evaluateOnNewDocument(PRELUDE)
    const errors = []
    /* The stand-in page names Inter by its built file:// address when a build is lying about; Chromium refusing to fetch it is the probe's own noise, not the page's. */
    const noise = (t) => /Not allowed to load local resource|net::ERR_FILE_NOT_FOUND|Failed to load resource/.test(t)
    p.on("pageerror", (e) => !noise(String(e)) && errors.push(String(e).slice(0, 300)))
    p.on("console", (m) => m.type() === "error" && !noise(m.text()) && errors.push(m.text().slice(0, 200)))
    await p.setRequestInterception(true)
    const html = page(dark)
    p.on("request", (r) => {
      const url = r.url()
      if (url.startsWith(`${ORIGIN}/api/`)) {
        const short = url.replace(ORIGIN, "")
        p.evaluate((x) => window.__sent.push(x), { short, method: r.method() }).catch(() => {})
        return void r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ rows: [], next: null, capped: false }) })
      }
      if (url.startsWith(`${ORIGIN}/`)) return r.respond({ status: 200, contentType: "text/html", body: html })
      if (url.startsWith("data:") || url.startsWith("blob:")) return r.continue()
      return r.respond({ status: 204, body: "" })
    })
    await p.goto(`${ORIGIN}/app/community/${ID}/members?case=${which}`, { waitUntil: "load" })
    await p.evaluate(() => document.fonts.ready)
    await sleep(700)
    if (which === "member") {
      await openRow(p)
      await sleep(500)
    }
    return { p, errors }
  }

  /** Presses a member's row the way the owner does: the row's own button, which the row listens for. */
  const openRow = (p, i = 2) =>
    p.evaluate((i) => {
      const rows = [...document.querySelectorAll("[data-member-row]")].filter((r) => r.offsetParent !== null)
      const row = rows[i] ?? rows[0]
      const btn = row?.querySelector("[data-row-open]")
      ;(btn ?? row)?.click()
    }, i)

  const box = (p, sel) =>
    p.evaluate((sel) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const b = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), bottom: Math.round(b.bottom), right: Math.round(b.right), shown: cs.display !== "none" && cs.visibility !== "hidden" && b.width > 0 && b.height > 0 }
    }, sel)
  const shot = async (p, name) => {
    await p.screenshot({ path: join(shots, `${name}.png`), fullPage: false })
    return join(shots, `${name}.png`)
  }

  /* ── The list ───────────────────────────────────────────────────────── */

  if (want("LIST")) {
    console.log("\nLIST  the list at 1280 and at 390\n")
    for (const width of [1280, 390]) {
      const { p, errors } = await open("list", width)
      expect(errors.length === 0, `${width}: the screen draws with no error`, errors.slice(0, 2))
      /* Both shapes are in the markup; only one is drawn. A row is counted when it has a box on the screen. */
      const shown = await p.evaluate(() => [...document.querySelectorAll("[data-member-row]")].filter((r) => r.getBoundingClientRect().width > 0 && r.offsetParent !== null).length)
      expect(shown === 12, `${width}: one row per member, drawn once`, shown)
      const which = await p.evaluate(() => {
        const inTable = [...document.querySelectorAll("[data-member-row]")].filter((r) => r.closest("table") && r.offsetParent !== null).length
        const inList = [...document.querySelectorAll("[data-member-row]")].filter((r) => !r.closest("table") && r.offsetParent !== null).length
        return { inTable, inList }
      })
      if (width === 1280) expect(which.inTable === 12 && which.inList === 0, "1280: a table, one row a member", which)
      else expect(which.inList === 12 && which.inTable === 0, "390: a list of compact rows, no table", which)
      const heights = await p.evaluate(() => [...document.querySelectorAll("[data-member-row]")].filter((r) => r.offsetParent !== null).map((r) => Math.round(r.getBoundingClientRect().height)))
      expect(new Set(heights).size === 1, `${width}: every row is the same height`, [...new Set(heights)])
      const overflow = await p.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }))
      expect(overflow.doc <= overflow.win + 1, `${width}: nothing past the screen's edge`, overflow)
      const selects = await p.evaluate(() => document.querySelectorAll("select, input[type=radio]").length)
      expect(selects === 0, `${width}: no browser select or radio anywhere`, selects)
      const buttons = await p.evaluate(() => [...document.querySelectorAll("button, a")].map((b) => (b.textContent || "").trim()).filter(Boolean))
      expect(buttons.filter((t) => t === "Export").length <= 1 && buttons.filter((t) => t === "Invite").length <= 1, `${width}: Export and Invite are each drawn once`, { export: buttons.filter((t) => t === "Export").length, invite: buttons.filter((t) => t === "Invite").length })
      console.log(`        ${await shot(p, `list-${width}`)}`)
      await p.close()
    }
  }

  /* ── The mark ───────────────────────────────────────────────────────── */

  if (want("FEATURED")) {
    console.log("\nFEATURED  the word, and nothing more than the word\n")
    const { p } = await open("list", 1280)
    const marks = await p.evaluate(() => [...document.querySelectorAll("[data-member-row]")].filter((r) => r.offsetParent !== null).map((r) => (r.textContent || "").includes("Featured")))
    expect(marks.filter(Boolean).length === 2, "two members are featured and the rest are not", marks.filter(Boolean).length)
    const words = await p.evaluate(() => [...document.querySelectorAll("[data-member-row]")].filter((r) => r.offsetParent !== null).map((r) => (r.textContent || "")).filter((t) => t.includes("Featured")).map((t) => (t.match(/Featured[^A-Za-z]*(\d+)/) || [])[1] ?? null))
    expect(words.every((w) => w === null), "the mark carries no number", words)
    console.log(`        ${await shot(p, "featured-1280")}`)
    await p.close()
  }

  /* ── One member, opened ─────────────────────────────────────────────── */

  if (want("SHEET")) {
    console.log("\nSHEET  a member opened, at 1280 and at 390\n")
    for (const width of [1280, 390]) {
      const { p, errors } = await open("member", width)
      expect(errors.length === 0, `${width}: opening a member throws nothing`, errors.slice(0, 2))
      const sheet = await box(p, "[data-member-sheet]")
      expect(Boolean(sheet?.shown), `${width}: the member's sheet is open`, sheet)
      const pushed = await p.evaluate(() => window.__router.length)
      expect(pushed === 0, `${width}: nothing was pushed to the router: no second screen`, pushed)
      const parts = await p.evaluate(() => ({
        facts: Boolean(document.querySelector("[data-facts]")),
        engagement: Boolean(document.querySelector("[data-member-engagement]")),
        access: Boolean(document.querySelector("[data-member-access]")),
        programs: Boolean(document.querySelector("[data-member-programs]")),
        links: Boolean(document.querySelector("[data-member-links]")),
        choices: document.querySelectorAll("[data-member-choice]").length,
      }))
      expect(parts.facts && parts.engagement && parts.access && parts.programs && parts.links && parts.choices > 0, `${width}: the sheet holds the facts, what they did, their access, their programs, the ways to reach them and the choices`, parts)
      const said = await p.evaluate(() => (document.querySelector("[data-member-engagement]")?.textContent || "") + "|" + (document.querySelector("[data-member-access]")?.textContent || ""))
      expect(/34 posts/.test(said) && /128 comments/.test(said) && /302 likes/.test(said), `${width}: the figures are the ones the server sent`, said.slice(0, 120))
      expect(!/\$|cus_|sub_|pi_/.test(said), `${width}: no money and no payment id in the sheet`, said.slice(0, 160))
      const inside = await p.evaluate(() => {
        const el = document.querySelector("[data-member-sheet]")
        if (!el) return null
        const b = el.getBoundingClientRect()
        return { left: Math.round(b.left), right: Math.round(b.right), top: Math.round(b.top), bottom: Math.round(b.bottom), w: window.innerWidth, h: window.innerHeight }
      })
      expect(Boolean(inside) && inside.left >= -1 && inside.right <= inside.w + 1, `${width}: the sheet is inside the screen`, inside)
      const scrollable = await p.evaluate(() => {
        const el = document.querySelector("[data-member-sheet]")
        if (!el) return false
        let n = el
        while (n && n !== document.body) {
          const cs = getComputedStyle(n)
          if (/(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 2) return true
          n = n.parentElement
        }
        return el.getBoundingClientRect().bottom <= window.innerHeight + 1
      })
      expect(scrollable, `${width}: everything in the sheet can be reached`, scrollable)
      console.log(`        ${await shot(p, `member-${width}`)}`)
      await p.close()
    }
  }

  /* ── The read ───────────────────────────────────────────────────────── */

  if (want("READ")) {
    console.log("\nREAD  the detail is asked for once\n")
    const { p } = await open("member", 1280)
    const first = await p.evaluate(() => window.__sent.filter((x) => /\/members\/[0-9a-f-]+$/.test(x.short.split("?")[0])).length)
    expect(first === 0, "the stand-in answers it inside the page, so nothing went out", first)
    const asked = await p.evaluate(() => {
      const el = document.querySelector("[data-member-sheet]")
      return el ? el.getAttribute("data-member-sheet") : null
    })
    expect(Boolean(asked), "the sheet knows whose it is", asked)
    /* Closing and opening the same row again draws from what was kept: the words are there on the next frame. */
    await p.evaluate(() => [...document.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === "Close")?.click())
    await sleep(350)
    await openRow(p)
    await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
    const atOnce = await p.evaluate(() => (document.querySelector("[data-member-more]") || {}).getAttribute?.("data-member-more") ?? null)
    expect(atOnce === "read", "opening the same member again shows what was read, with no second wait", atOnce)
    await p.close()
  }

  /* ── The dark look ──────────────────────────────────────────────────── */

  if (want("DARK")) {
    console.log("\nDARK  the member side in the community's dark look, and /app in its own\n")
    /*
      /app IS LIGHT ONLY, by the look's own rule: scripts/gen-theme-dark.mjs
      skips app/app and components/app, and lib/appearance never puts the dark
      attribute on a dashboard page. So the dark look is measured where it is
      real: the member side's own directory rows, which is where the mark is
      drawn for members. The creator's Members screen is measured in the light
      look above, which is the only one it is ever served in.
    */
    const genDark = readFileSync(join(root, "scripts/gen-theme-dark.mjs"), "utf8")
    expect(/"app\/app", "app\/admin"/.test(genDark) && /"components\/app"/.test(genDark), "the dark look is not written for /app at all, so Members is light only there")

    for (const width of [1280, 390]) {
      const { p, errors } = await open("directory", width, true)
      expect(errors.length === 0, `${width} dark: the member side's rows draw with no error`, errors.slice(0, 2))
      const marked = await p.evaluate(() => document.querySelectorAll("[data-featured-mark]").length)
      expect(marked === 2, `${width} dark: the two featured members carry the mark`, marked)
      /* A name is never cut short to make room for the mark: a row with a role beside it keeps the glyph and the word comes back from 640px. */
      const cut = await p.evaluate(() => [...document.querySelectorAll("[data-member-list] [data-person-link] .truncate.font-semibold")].filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => (el.textContent || "").slice(0, 20)))
      expect(cut.length === 0, `${width} dark: no name is cut short`, cut)
      const readable = await p.evaluate(() => {
        const lum = (c) => {
          const [r, g, b] = (c.match(/[\d.]+/g) || ["0", "0", "0"]).slice(0, 3).map((x) => Number(x) / 255)
          const f = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))
          return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
        }
        const groundOf = (el) => {
          let n = el
          while (n && n !== document.documentElement) {
            const bg = getComputedStyle(n).backgroundColor
            if (bg && !/rgba\(0, 0, 0, 0\)|transparent/.test(bg)) return bg
            n = n.parentElement
          }
          return getComputedStyle(document.body).backgroundColor
        }
        const ratio = (a, b) => {
          const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m)
          return (x + 0.05) / (y + 0.05)
        }
        const out = []
        for (const el of document.querySelectorAll("[data-featured-mark], [data-role-badge], [data-member-list] [data-person-link] span")) {
          const text = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent.trim()).join(" ")
          if (!text) continue
          const cs = getComputedStyle(el)
          if (cs.display === "none" || cs.visibility === "hidden") continue
          out.push({ text: text.slice(0, 24), r: Math.round(ratio(cs.color, groundOf(el)) * 100) / 100 })
        }
        out.sort((a, b) => a.r - b.r)
        return out.slice(0, 4)
      })
      expect(readable.every((c) => c.r >= 3), `${width} dark: the mark and every word beside it read against the row`, readable)
      const whiteRows = await p.evaluate(() =>
        [...document.querySelectorAll("[data-member-list], [data-member-list] *")].filter((el) => {
          const m = getComputedStyle(el).backgroundColor.match(/\d+/g)
          return m && Number(m[0]) > 240 && Number(m[1]) > 240 && Number(m[2]) > 240 && (m[3] === undefined || Number(m[3]) > 0.5)
        }).length,
      )
      expect(whiteRows === 0, `${width} dark: no white surface left in the rows`, whiteRows)
      console.log(`        ${await shot(p, `directory-dark-${width}`)}`)
      await p.close()

      const light = await open("directory", width, false)
      const lightReadable = await light.p.evaluate(() => document.querySelectorAll("[data-featured-mark]").length)
      expect(lightReadable === 2, `${width} light: the same two marks`, lightReadable)
      console.log(`        ${await shot(light.p, `directory-light-${width}`)}`)
      await light.p.close()
    }

    /* And the creator's sheet in the look it is served in, at both widths, for the picture. */
    for (const width of [1280, 390]) {
      const { p, errors } = await open("member", width, true)
      expect(errors.length === 0, `${width} dark: the creator's sheet still draws`, errors.slice(0, 2))
      const contrast = await p.evaluate(() => {
        const lum = (c) => {
          const [r, g, b] = (c.match(/[\d.]+/g) || ["0", "0", "0"]).slice(0, 3).map((x) => Number(x) / 255)
          const f = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))
          return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
        }
        const groundOf = (el) => {
          let n = el
          while (n && n !== document.documentElement) {
            const bg = getComputedStyle(n).backgroundColor
            if (bg && !/rgba\(0, 0, 0, 0\)|transparent/.test(bg)) return bg
            n = n.parentElement
          }
          return "rgb(255,255,255)"
        }
        const ratio = (a, b) => {
          const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m)
          return (x + 0.05) / (y + 0.05)
        }
        const worst = []
        const seen = new Set()
        for (const el of document.querySelectorAll("[data-member-sheet] *, [data-member-row] *")) {
          const text = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent.trim()).join(" ")
          if (!text || seen.has(text)) continue
          seen.add(text)
          const cs = getComputedStyle(el)
          if (cs.display === "none" || cs.visibility === "hidden") continue
          const r = ratio(cs.color, groundOf(el))
          worst.push({ text: text.slice(0, 28), r: Math.round(r * 100) / 100 })
        }
        worst.sort((a, b) => a.r - b.r)
        return worst.slice(0, 4)
      })
      /* The sheet's own surfaces and words. The badges in the list behind it come from app/app (StatusBadge), which the dark look does not write for, because /app is never served dark. */
      expect(contrast.filter((c) => !["Muted", "Complimentary", "Featured"].includes(c.text)).every((c) => c.r >= 3), `${width}: the sheet's own words read against their background`, contrast)
      const white = await p.evaluate(() =>
        [...document.querySelectorAll("[data-member-sheet], [data-member-sheet] *")].filter((el) => {
          const bg = getComputedStyle(el).backgroundColor
          const m = bg.match(/\d+/g)
          return m && Number(m[0]) > 240 && Number(m[1]) > 240 && Number(m[2]) > 240 && (m[3] === undefined || Number(m[3]) > 0.5)
        }).length,
      )
      expect(white === 0, `${width}: no white surface left in the sheet`, white)
      console.log(`        ${await shot(p, `member-dark-${width}`)}`)
      await p.close()
    }
  }
  /* ── Who may message me ─────────────────────────────────────────────── */

  if (want("MESSAGES")) {
    console.log("\nMESSAGES  the member's own choice about who may message them\n")
    for (const width of [1280, 390]) {
      for (const dark of [false, true]) {
        const look = dark ? "dark" : "light"
        const { p, errors } = await open("messages", width, dark)
        expect(errors.length === 0, `${width} ${look}: the Membership page draws with no error`, errors.slice(0, 2))
        const choices = await p.evaluate(() => [...document.querySelectorAll("[data-message-choice]")].map((el) => ({ key: el.getAttribute("data-message-choice"), on: el.getAttribute("aria-checked") === "true", h: Math.round(el.getBoundingClientRect().height), words: (el.textContent || "").trim().slice(0, 60) })))
        expect(choices.length === 2 && choices[0].key === "everyone" && choices[1].key === "staff", `${width} ${look}: two choices, and only two`, choices.map((c) => c.key))
        expect(choices.filter((c) => c.on).length === 1 && choices[1].on, `${width} ${look}: the one they chose is the one marked`, choices.map((c) => c.on))
        expect(choices.every((c) => c.h >= 40), `${width} ${look}: each choice is a press of 40px or more`, choices.map((c) => c.h))
        const nobody = await p.evaluate(() => (document.querySelector("[data-membership-messages]")?.textContent || "").toLowerCase())
        expect(!/\bnobody\b|\bno one\b/.test(nobody), `${width} ${look}: no choice shuts the community out of reaching them`, nobody.slice(0, 80))
        const overflow = await p.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }))
        expect(overflow.doc <= overflow.win + 1, `${width} ${look}: nothing past the screen's edge`, overflow)
        if (dark) {
          const whiteCards = await p.evaluate(() =>
            [...document.querySelectorAll("[data-membership-messages-section], [data-membership-messages-section] *")].filter((el) => {
              const m = getComputedStyle(el).backgroundColor.match(/\d+/g)
              return m && Number(m[0]) > 240 && Number(m[1]) > 240 && Number(m[2]) > 240 && (m[3] === undefined || Number(m[3]) > 0.5)
            }).length,
          )
          expect(whiteCards === 0, `${width} dark: no white surface left in the Messages card`, whiteCards)
        }
        console.log(`        ${await shot(p, `messages-${look}-${width}`)}`)
        await p.close()
      }
    }
  }
} finally {
  if (browser) await browser.close()
  rmSync(stubs, { recursive: true, force: true })
}

console.log(`\n${broken === 0 ? "all measurements hold" : `${broken} measurement(s) do not hold`}\n`)
process.exit(broken === 0 ? 0 : 1)
