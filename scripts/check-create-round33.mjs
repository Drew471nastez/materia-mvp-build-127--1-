/**
 * ===========================================================================
 *  ROUND 33, MEASURED: THE CREATE WIZARD, THE SETUP PILL, THE DELETE DIALOG
 * ===========================================================================
 * Over the real components (scripts/render-create-round33.tsx) in headless
 * Chromium, at 1440 and 390, every /api request answered here:
 *
 *   WIZARD   1440: the five steps across, the step's card and the preview
 *            beside it, the foot bar with Back and Next; 390: Cancel or Back,
 *            "n of 5" and Next in the bar at the top, fields at 16px (no zoom
 *            on iOS), buttons 40px tall. Both: Next on an empty name says so
 *            under the field and stays; the address follows the name and a
 *            taken one is said; a paid community without a price is stopped
 *            at its step; the welcome post is written for them; a reload
 *            comes back on the same step; Create sends the address, the
 *            space and the welcome, and, with no picture, draws the cover
 *            and the icon from the colour and tries to upload them
 *   PILL     1440: 32px tall at the bottom right, the community's own
 *            percentage; the list opens above it inside the screen; Skip
 *            moves the percentage and is saved; Hide puts it away and is
 *            saved; 390: not drawn (the Overview card is the phone's)
 *   DELETE   a community two members pay for: both ways offered, the date
 *            and the refund said, the button waits for the typed name; a
 *            sheet inside the screen at 390, a dialog at 1440
 * And on every screen: no sideways scroll, no error on the page.
 *
 *   node scripts/check-create-round33.mjs [WIZARD PILL DELETE]
 *   SHOTS_DIR=dir to keep the pictures (.round33-create-shots by default; delete it before committing)
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const only = new Set(process.argv.slice(2).map((s) => s.toUpperCase()))
const want = (s) => only.size === 0 || only.has(s)
const stubs = join(root, ".create-round33-probe")
const shots = process.env.SHOTS_DIR || join(root, ".round33-create-shots")
const ORIGIN = "https://storelib.com"
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const DAY = 86_400_000

const setupList = () => {
  const steps = [
    { id: "group", title: "Set up your group", detail: "Add an icon and a description, so people know what they are joining.", href: "/app/community/makers/settings?tab=page", action: "Edit", done: false, skipped: false },
    { id: "rules", title: "Write the rules", detail: "Members see them before they join and when they post.", href: "/app/community/makers/moderation?tab=rules", action: "Write", done: false, skipped: false },
    { id: "publish", title: "Publish your community", detail: "It is a draft.", href: "/app/community/makers/settings?tab=advanced", action: "Publish", done: true, skipped: false },
    { id: "invite", title: "Invite 3 people", detail: "Send an invite by email or share a link. 1 of 3 so far.", href: "/app/community/makers/members?invite=1", action: "Invite", done: false, skipped: false, progress: { n: 1, of: 3 } },
    { id: "post", title: "Write your first post", detail: "Say who it is for and how to get started.", href: "/app/community/makers/feed?compose=welcome", action: "Write", done: true, skipped: false },
    { id: "app", title: "Download the app", detail: "Get a notification when someone posts, comments or asks to join.", href: "/api/get-app", action: "Get the app", done: false, skipped: false, external: true, links: [{ store: "ios", label: "App Store", href: "https://apps.apple.com/app/id1" }, { store: "android", label: "Google Play", href: "https://play.google.com/store/apps/details?id=com.storelib.app" }] },
    { id: "customize", title: "Customize the page", detail: "Add pictures, a video and what members get.", href: "/app/community/makers/settings?tab=page", action: "Edit", done: false, skipped: false },
    { id: "payouts", title: "Connect payouts", detail: "Members pay you through Stripe.", href: "/app/settings?tab=payments", action: "Connect", done: true, skipped: false },
  ]
  const done = steps.filter((s) => s.done).length
  return { id: "6f1c2b9e-1d4f-4c55-9a0b-3f1e2d4c5b6a", slug: "makers", name: "Makers", steps, done, total: steps.length, percent: Math.round((done / steps.length) * 100), pillHidden: false }
}
const NOW = Date.now()
const plan = { ready: true, paying: 2, lastPaidUntil: new Date(NOW + 25 * DAY).toISOString(), refundEstimateCents: 4500, currency: "usd", scheduled: null }

mkdirSync(stubs, { recursive: true })
mkdirSync(shots, { recursive: true })
try {
  writeFileSync(
    join(stubs, "navigation.js"),
    `import { useMemo } from "react"
const log = (k, a) => (window.__router ||= []).push([k, a])
const router = { push: (h) => log("push", h), replace: (h) => log("replace", h), prefetch: () => {}, refresh: () => log("refresh", location.pathname), back: () => history.back(), forward: () => history.forward() }
export const usePathname = () => location.pathname
export const useSearchParams = () => useMemo(() => new URLSearchParams(location.search), [])
export const useRouter = () => router
export const redirect = () => {}
export const notFound = () => {}
`,
  )
  writeFileSync(
    join(stubs, "link.jsx"),
    `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, ...rest }, ref) {
  return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); e.preventDefault(); (window.__router ||= []).push(["link", href]) } }, children)
})
`,
  )
  writeFileSync(join(stubs, "image.jsx"), `import React from "react"\nexport default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest }) }\n`)
  writeFileSync(join(stubs, "supabase-client.js"), `export function createClient() { const ch = { on() { return ch }, subscribe() { return ch } }; return { channel: () => ch, removeChannel() {}, auth: { getSession: async () => ({ data: { session: null } }) } } }\nexport const isNativePlatform = () => false\n`)
  const css = await appCss(root)
  const fonts = interFaces(root)
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-create-round33.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.create-round33-probe/navigation.js", "next/link": "./.create-round33-probe/link.jsx", "next/image": "./.create-round33-probe/image.jsx" },
    plugins: [{ name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })) } }],
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "create.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "create.js"), "utf8")
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fonts}${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], protocolTimeout: 240_000 })
  const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
  const DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }

  async function open(path, vp, page = null) {
    const p = page ?? (await browser.newPage())
    const sent = []
    if (!page) {
      await p.setViewport(vp)
      p.__errors = []
      p.__sent = sent
      p.on("pageerror", (e) => p.__errors.push(String(e).slice(0, 300)))
      await p.setRequestInterception(true)
      p.on("request", (r) => {
        const url = r.url()
        if (url.startsWith(`${ORIGIN}/api/`)) {
          const path = url.replace(ORIGIN, "")
          let body = null
          try {
            body = r.postData() ? JSON.parse(r.postData()) : null
          } catch {
            body = r.postData()
          }
          p.__sent.push({ method: r.method(), path, body })
          const json = (status, data) => r.respond({ status, contentType: "application/json", body: JSON.stringify(data) })
          if (path.startsWith("/api/app/community?address=")) {
            const slug = decodeURIComponent(path.split("=")[1])
            return json(200, { slug, available: slug !== "makers", reason: slug === "makers" ? "taken" : null })
          }
          if (path === "/api/app/community" && r.method() === "POST") return json(201, { id: "c1", slug: body?.slug || "the-morning-writers" })
          if (path.startsWith("/api/v2/upload/")) return json(400, { error: "no uploads in the probe" })
          if (/\/setup$/.test(path) && r.method() === "GET") return json(200, setupList())
          if (/\/setup$/.test(path)) return json(200, { ok: true })
          if (/\/delete$/.test(path) && r.method() === "GET") return json(200, p.__plan ?? plan)
          return json(200, {})
        }
        if (url.startsWith(`${ORIGIN}/`)) return r.respond({ status: 200, contentType: "text/html", body: html })
        if (url.startsWith("data:") || url.startsWith("blob:")) return r.continue()
        return r.respond({ status: 204, body: "" })
      })
    }
    await p.goto(`${ORIGIN}${path}`, { waitUntil: "load" })
    await p.evaluate(() => document.fonts.ready)
    await sleep(500)
    return p
  }
  const box = (p, sel) =>
    p.evaluate((sel) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const b = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), right: Math.round(b.right), bottom: Math.round(b.bottom), shown: cs.display !== "none" && cs.visibility !== "hidden" && b.width > 0 && b.height > 0 }
    }, sel)
  const sideways = (p) => p.evaluate(() => Math.max(document.documentElement.scrollWidth, ...[...document.querySelectorAll("[data-create-community]")].map((e) => e.scrollWidth)) - innerWidth)
  const at = (p) => p.evaluate(() => document.querySelector("[data-create-community]")?.getAttribute("data-wizard-at"))
  const press = async (p, sel) => {
    const visible = await p.evaluate((sel) => {
      const all = [...document.querySelectorAll(sel)].filter((e) => e.getBoundingClientRect().width > 0 && getComputedStyle(e).visibility !== "hidden")
      if (!all.length) return false
      all[0].click()
      return true
    }, sel)
    await sleep(350)
    return visible
  }
  const typeInto = async (p, sel, text) => {
    await p.focus(sel)
    await p.$eval(sel, (e) => e.select())
    await p.keyboard.press("Backspace")
    await p.type(sel, text)
    await sleep(150)
  }
  const shot = (p, name) => p.screenshot({ path: join(shots, `${name}.png`) })

  /* ── WIZARD ─────────────────────────────────────────────────────────── */
  if (want("WIZARD")) {
    for (const [label, vp] of [["1440", DESK], ["390", PHONE]]) {
      console.log(`\nWIZARD at ${label}`)
      const p = await open("/app/community/new?view=wizard", vp)
      await p.evaluate(() => localStorage.clear())
      await open("/app/community/new?view=wizard", vp, p)
      const desk = label === "1440"
      if (desk) {
        const steps = await p.evaluate(() => [...document.querySelectorAll("[data-wizard-step]")].filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.getAttribute("data-wizard-step")))
        expect(steps.join() === "name,look,access,welcome,review", "the five steps across the top", steps)
        const card = await box(p, "[data-wizard-step-body]")
        const preview = await box(p, "aside [data-wizard-preview]")
        expect(card && card.w >= 600 && card.w <= 760, "the step's card is 600 to 760px wide", card?.w)
        expect(preview?.shown && preview.w === 340 && preview.x >= card.right + 16, "the preview beside it, 340px, 20px off", preview)
        const foot = await box(p, "[data-create-foot]")
        expect(foot?.shown && foot.bottom === 900 && foot.h >= 64, "the foot bar along the bottom", foot)
        expect(!(await box(p, "[data-create-bar]"))?.shown, "no phone bar")
      } else {
        const bar = await p.evaluate(() => {
          const b = document.querySelector("[data-create-bar]")
          const r = b.getBoundingClientRect()
          const cancel = b.querySelector("[data-create-cancel]")?.getBoundingClientRect()
          const next = b.querySelector("[data-wizard-next]")?.getBoundingClientRect()
          const gutter = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--app-gutter"))
          return { top: Math.round(r.top), count: b.querySelector("[data-wizard-count]")?.textContent, cancelH: Math.round(cancel?.height ?? 0), nextH: Math.round(next?.height ?? 0), nextRight: Math.round(next?.right ?? 0), cancelLeft: Math.round(cancel?.left ?? 0), gutter }
        })
        expect(bar.top === 0 && bar.count === "1 of 5", "the bar at the top says 1 of 5", bar)
        expect(bar.cancelH >= 40 && bar.nextH >= 40 && bar.nextRight === 390 - bar.gutter && bar.cancelLeft === bar.gutter, "Cancel and Next 40px tall, on the app's own gutter", bar)
        const font = await p.evaluate(() => ["#c-name", "#c-slug", "#c-description"].map((s) => parseFloat(getComputedStyle(document.querySelector(s)).fontSize)))
        expect(font.every((f) => f >= 16), "every field at 16px or more, so iOS does not zoom", font)
        expect(!(await box(p, "[data-create-foot]"))?.shown && !(await box(p, "aside [data-wizard-preview]"))?.shown, "no foot bar and no side preview on a phone")
      }
      await shot(p, `wizard-${label}-1-name`)
      await press(p, "[data-wizard-next]")
      const nameErr = await p.evaluate(() => document.querySelector("#c-name-error")?.textContent ?? null)
      const nameBox = await box(p, "#c-name")
      const errBox = await box(p, "#c-name-error")
      expect((await at(p)) === "name" && /name/i.test(nameErr ?? ""), "Next on an empty name says so and stays", nameErr)
      expect(errBox && nameBox && errBox.y >= nameBox.bottom && errBox.y - nameBox.bottom <= 12, "the words sit right under the field", { field: nameBox?.bottom, error: errBox?.y })
      expect(await p.evaluate(() => document.activeElement?.id === "c-name"), "and the field has the focus")
      await typeInto(p, "#c-name", "The Morning Writers")
      expect((await p.$eval("#c-slug", (e) => e.value)) === "the-morning-writers", "the address follows the name")
      await sleep(700)
      expect((await p.evaluate(() => document.querySelector("[data-address-state]")?.getAttribute("data-address-state"))) === "free", "and is checked: available")
      await typeInto(p, "#c-slug", "makers")
      await sleep(700)
      const taken = await p.evaluate(() => ({ value: document.querySelector("#c-slug")?.value, state: document.querySelector("[data-address-state]")?.getAttribute("data-address-state"), text: document.querySelector("#c-slug-state")?.textContent }))
      expect(taken.state === "taken" && /Taken/.test(taken.text), "a taken address is said beside it", taken)
      await press(p, "[data-wizard-next]")
      expect((await at(p)) === "name", "and Next waits for another")
      await typeInto(p, "#c-slug", "morning-writers")
      await sleep(700)
      await press(p, "[data-wizard-next]")
      expect((await at(p)) === "look", "a free address goes on to the look")
      const palettes = await p.evaluate(() => [...document.querySelectorAll("[data-palette]")].map((e) => { const r = e.getBoundingClientRect(); return Math.round(Math.min(r.width, r.height)) }))
      expect(palettes.length === 6 && palettes.every((s) => s >= (desk ? 36 : 40)), "six colours, each big enough to press", palettes)
      await press(p, '[data-palette="forest"]')
      const cover = await p.evaluate(() => getComputedStyle([...document.querySelectorAll("[data-wizard-preview-cover]")].find((e) => e.getBoundingClientRect().width > 0)).backgroundImage)
      expect(/linear-gradient/.test(cover) && /23, 63, 49|23,63,49/.test(cover), "the preview's cover is the colour picked", cover.slice(0, 80))
      await shot(p, `wizard-${label}-2-look`)
      await press(p, "[data-wizard-next]")
      expect((await at(p)) === "access", "on to who can join")
      await press(p, '[data-choice="paid"]')
      await press(p, "[data-wizard-next]")
      const priceErr = await p.evaluate(() => document.querySelector("[data-paid-fields] [role=alert]")?.textContent ?? null)
      expect((await at(p)) === "access" && /price/i.test(priceErr ?? ""), "a paid community without a price is stopped here", priceErr)
      await typeInto(p, "#c-price", "19")
      await shot(p, `wizard-${label}-3-access`)
      await press(p, "[data-wizard-next]")
      expect((await at(p)) === "welcome", "on to the first space")
      const welcome = await p.evaluate(() => ({ space: document.querySelector("#c-spaceName").value, title: document.querySelector("#c-welcomeTitle").value, body: document.querySelector("#c-welcomeBody").value }))
      expect(welcome.space === "General" && welcome.title === "Welcome to The Morning Writers" && welcome.body.length > 40, "the welcome post is written for them", welcome)
      await shot(p, `wizard-${label}-4-welcome`)
      await press(p, "[data-wizard-next]")
      expect((await at(p)) === "review", "on to the review")
      const rows = await p.evaluate(() => [...document.querySelectorAll("[data-wizard-review] > div")].map((r) => r.querySelector("dd")?.textContent))
      expect(rows.length === 7 && rows[1] === "storelib.com/community/morning-writers" && /\$19/.test(rows[4] ?? ""), "seven rows, the address and the price as chosen", rows)
      await shot(p, `wizard-${label}-5-review`)
      expect((await sideways(p)) <= 0, "no sideways scroll on any step", await sideways(p))
      /* A reload comes back on the same step. */
      await sleep(400)
      await open("/app/community/new?view=wizard", vp, p)
      const back = await p.evaluate(() => ({ at: document.querySelector("[data-create-community]")?.getAttribute("data-wizard-at"), restored: !!document.querySelector("[data-wizard-restored]") }))
      expect(back.at === "review" && back.restored, "a reload comes back on the review, and says so", back)
      p.__sent.length = 0
      await press(p, "[data-wizard-next]")
      await sleep(7000)
      const posted = p.__sent.find((s) => s.method === "POST" && s.path === "/api/app/community")
      const uploads = p.__sent.filter((s) => s.path === "/api/v2/upload/prepare").map((s) => s.body?.fileName ?? s.body?.name ?? s.body?.filename ?? JSON.stringify(s.body).slice(0, 80))
      expect(!!posted && posted.body.slug === "morning-writers" && posted.body.spaceName === "General" && posted.body.welcomeTitle === "Welcome to The Morning Writers" && posted.body.type === "paid" && posted.body.price === "19", "Create sends the address, the space, the welcome and the price", posted?.body)
      expect(uploads.length >= 2 && uploads.some((u) => /cover-forest\.png/.test(u)) && uploads.some((u) => /icon-forest\.png/.test(u)), "with no picture the cover and the icon are drawn and sent up", uploads)
      expect(posted && posted.body.logoUrl === null && posted.body.coverUrl === null, "an upload that fails never stops the create", posted && [posted.body.logoUrl, posted.body.coverUrl])
      const pushed = await p.evaluate(() => (window.__router || []).filter((c) => c[0] === "push").map((c) => c[1]))
      expect(pushed.includes("/app/community/morning-writers?created=1"), "and opens its Overview", pushed)
      expect((await p.evaluate(() => localStorage.getItem("storelib:new-community:v1"))) === null, "the draft is gone once it is made")
      expect(p.__errors.length === 0, "no error on the page", p.__errors)
      await p.close()
    }
  }

  /* ── PILL ───────────────────────────────────────────────────────────── */
  if (want("PILL")) {
    console.log("\nPILL at 1440")
    const p = await open("/app/community/makers/members?view=pill", DESK)
    const pill = await box(p, "[data-community-setup-pill]")
    const text = await p.evaluate(() => document.querySelector("[data-community-setup-pill]")?.textContent)
    expect(pill?.shown && pill.h === 32 && pill.right === 1440 - 24 && pill.bottom === 900 - 24, "32px tall, 24px from the bottom right", pill)
    expect(text === "Setup38%", "the community's own percentage, 3 of 8", text)
    await press(p, "[data-community-setup-pill]")
    const panel = await box(p, "[data-community-setup-panel]")
    expect(panel?.shown && panel.w === 360 && panel.y >= 0 && panel.right <= 1440 && panel.bottom <= pill.y, "the list opens above it, inside the screen", panel)
    const order = await p.evaluate(() => [...document.querySelectorAll("[data-setup-step]")].map((e) => (e.hasAttribute("data-setup-done") ? "+" : "") + e.getAttribute("data-setup-step")))
    expect(order.join() === "group,rules,invite,app,customize,+publish,+post,+payouts", "what is left first, then what is done", order)
    const stores = await p.evaluate(() => [...document.querySelectorAll("[data-setup-store]")].map((e) => [e.getAttribute("data-setup-store"), e.getAttribute("href")]))
    expect(stores.length === 2 && /apps\.apple\.com/.test(stores[0][1]) && /play\.google\.com/.test(stores[1][1]), "Download the app has both stores", stores)
    expect((await p.evaluate(() => document.querySelector("[data-setup-progress]")?.getAttribute("data-setup-progress"))) === "1/3", "the invite step shows 1 of 3")
    await shot(p, "pill-1440-open")
    p.__sent.length = 0
    await press(p, '[data-setup-step="rules"] [data-setup-skip]')
    await sleep(300)
    const after = await p.evaluate(() => document.querySelector("[data-community-setup-pill]")?.textContent)
    expect(after === "Setup50%" && p.__sent.some((s) => s.method === "POST" && s.body?.step === "skip_rules"), "Skip moves it to 50% and is saved", { after, sent: p.__sent.map((s) => s.body) })
    await press(p, "[data-community-setup-hide]")
    await sleep(300)
    expect(!(await box(p, "[data-community-setup-pill]")) && p.__sent.some((s) => s.body?.step === "pill_hidden"), "Hide puts it away and is saved")
    expect(p.__errors.length === 0, "no error on the page", p.__errors)
    await p.close()

    console.log("\nPILL at 390")
    const q = await open("/app/community/makers/members?view=pill", PHONE)
    expect(!(await box(q, "[data-community-setup-pill]"))?.shown, "not drawn on a phone")
    await q.close()
  }

  /* ── DELETE ─────────────────────────────────────────────────────────── */
  if (want("DELETE")) {
    for (const [label, vp] of [["1440", DESK], ["390", PHONE]]) {
      console.log(`\nDELETE at ${label}`)
      const p = await open("/app/community/makers/settings?view=delete", vp)
      const hint = await p.evaluate(() => document.querySelector("[data-editor-card] p")?.textContent)
      expect(/2 members pay/.test(hint ?? ""), "the card says two members pay", hint)
      await press(p, "[data-delete-open]")
      await sleep(400)
      const d = await p.evaluate(() => {
        const dlg = document.querySelector("[role=dialog]")
        const r = dlg?.getBoundingClientRect()
        const choices = [...document.querySelectorAll("[data-delete-paid] [data-choice]")].map((c) => c.getAttribute("data-choice"))
        const title = [...document.querySelectorAll("[role=dialog] h2")].find((h) => /Delete this community/.test(h.textContent))?.getBoundingClientRect()
        const confirm = document.querySelector("[data-delete-confirm]")?.getBoundingClientRect()
        return { x: Math.round(r?.left ?? -1), w: Math.round(r?.width ?? 0), bottom: Math.round(confirm?.bottom ?? 0), top: Math.round(title?.top ?? 0), choices, text: document.querySelector("[data-delete-paid]")?.textContent ?? "", disabled: document.querySelector("[data-delete-confirm]")?.disabled, button: document.querySelector("[data-delete-confirm]")?.textContent }
      })
      expect(d.choices.join() === "period_end,now", "both ways offered, at period end first", d.choices)
      expect(/until/.test(d.text) && /\$45/.test(d.text), "the date and about what comes back are said", d.text.slice(0, 260))
      expect(d.disabled === true && d.button === "Cancel memberships and delete", "the button waits for the name and says what it does", d)
      if (label === "390") expect(d.x === 0 && d.w === 390 && d.bottom <= 844 && d.top > 200, "a sheet from the bottom, its title and its button inside the screen", { top: d.top, bottom: d.bottom })
      else expect(d.w > 0 && d.w <= 620 && d.x > 0, "a dialog, at most 620px", d)
      await p.type("[data-delete-name]", "Makers")
      await press(p, '[data-delete-paid] [data-choice="now"]')
      const now = await p.evaluate(() => ({ disabled: document.querySelector("[data-delete-confirm]")?.disabled, button: document.querySelector("[data-delete-confirm]")?.textContent }))
      expect(now.disabled === false && now.button === "End memberships and delete", "typed, it can go; now says it ends them", now)
      await shot(p, `delete-${label}`)
      expect((await sideways(p)) <= 0, "no sideways scroll")
      expect(p.__errors.length === 0, "no error on the page", p.__errors)
      if (label === "390") {
        /* Scheduled: the card says when, how far it got, and offers Keep. */
        p.__plan = { ...plan, scheduled: { mode: "period_end", deleteAt: plan.lastPaidUntil, requestedAt: new Date(NOW).toISOString(), stopped: 2, total: 2, failing: 0, canUndo: true } }
        await open("/app/community/makers/settings?view=delete", vp, p)
        const card = await p.evaluate(() => ({ title: document.querySelector("[data-editor-card] h2")?.textContent, hint: document.querySelector("[data-editor-card] p")?.textContent, keep: document.querySelector("[data-delete-keep]")?.getBoundingClientRect().height }))
        expect(/^Deleting on /.test(card.title ?? "") && /2 of 2 memberships stopped/.test(card.hint ?? "") && card.keep >= 40, "scheduled: when, how far, and Keep the community", card)
        p.__sent.length = 0
        await press(p, "[data-delete-keep]")
        await press(p, "[data-delete-keep-confirm]")
        await sleep(300)
        expect(p.__sent.some((x) => x.method === "POST" && x.body?.undo === true), "Keep sends the undo")
        await shot(p, "delete-390-scheduled")
      }
      await p.close()
    }
  }
  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
console.log(`\n${broken ? `${broken} failed` : "all passed"}  (pictures in ${shots})`)
if (broken) process.exit(1)
