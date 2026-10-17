/**
 * ===========================================================================
 *  ROUND 26 (W4), MEASURED: THE ABOUT PAGE AND THE COMMUNITY'S INFO CARD
 * ===========================================================================
 * The real public frame, About page and member card (scripts/render-about26.tsx) in headless Chromium, for a free, a
 * paid, a trial and an invite only community, at 1440x900, 820x1180 (tablet) and 390x844 (touch, 4x CPU), light and
 * dark:
 *
 *   ONE h1, no sideways scroll
 *   THE ROW UNDER THE NAME   faces, members, price; no admins, no social icons in it or under it
 *   THE CARD (1280px up)     the short description, clamped with More/Less; the social icons; the admins as a fact;
 *                            the button's words from the configuration; Share on the cover when it may be shared;
 *                            "Powered by" and the Storelib logo under it, light grey, linking to storelib.com
 *   THE PHONE'S BAR          the same words as the card's button
 *   THE SHEET                "What's inside", no Membership block, no "Other ways to join", Privacy and Terms links
 *   SHARE                    a menu with Copy link (and a QR code), the pill toast after a copy
 *   DARK                     no light box around the gallery's thumbnails, the card and the sheet dark
 *   MEMBER CARD              the summary, the icons and Share on the member's card
 *
 *   node scripts/check-about26.mjs            SHOTS_DIR=dir keeps the pictures (.about26-shots by default)
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const stubs = join(root, ".about26-probe")
const shots = process.env.SHOTS_DIR || join(root, ".about26-shots")
const ORIGIN = "https://storelib.com"
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
/* PART=pages|desk-share|shrink|phone-share|member runs one part (a busy machine times a long run out). */
const PART = process.env.PART || "all"
const part = (name) => PART === "all" || PART === name
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

mkdirSync(stubs, { recursive: true })
mkdirSync(shots, { recursive: true })
try {
  writeFileSync(
    join(stubs, "navigation.js"),
    `const router = { push: () => {}, replace: () => {}, prefetch: () => {}, refresh: () => {}, back: () => {}, forward: () => {} }
export const usePathname = () => location.pathname
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(location.search)
export const redirect = () => {}
export const permanentRedirect = () => {}
export const notFound = () => {}
`,
  )
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"\nexport default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, unstable_dynamicOnHover, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest }, children) })\n`)
  writeFileSync(join(stubs, "image.jsx"), `import React from "react"\nexport default function Image({ src, alt, fill, sizes, priority, preload, unoptimized, ...rest }) { return React.createElement("img", { src: typeof src === "string" ? src : src?.src, alt, ...rest }) }\n`)
  writeFileSync(
    join(stubs, "supabase-client.js"),
    `export function createClient() { const ch = { on() { return ch }, subscribe() { return ch }, track: async () => "ok", presenceState: () => ({}) }; return { channel: () => ch, removeChannel() {}, realtime: { setAuth: async () => {} }, auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from() { const q = { select: () => q, eq: () => q, in: () => q, order: () => q, limit: () => q, maybeSingle: async () => ({ data: null }), then: (f) => f({ data: [] }) }; return q } } }\nexport const isNativePlatform = () => false\n`,
  )
  const css = await appCss(root)
  const dark = readFileSync(join(root, "app/theme-dark.css"), "utf8")
  const fonts = interFaces(root)
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-about26.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.about26-probe/navigation.js", "next/link": "./.about26-probe/link.jsx", "next/image": "./.about26-probe/image.jsx" },
    plugins: [{ name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })) } }],
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty", ".webp": "dataurl", ".png": "dataurl" },
    outfile: join(stubs, "app.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  const logo = readFileSync(join(root, "public/images/brand/storelib-logo-v2.webp"))
  /* The gallery's swipe engine brings its own stylesheet, which the bundle leaves out (".css": "empty"): put it back. */
  const swiper = readFileSync(join(root, "node_modules/swiper/swiper.css"), "utf8")
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${fonts}${css}</style><style>${swiper}</style><style>${dark}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--hide-scrollbars"], protocolTimeout: 240_000, timeout: 180_000 })
  const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
  const TABLET = { width: 820, height: 1180, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }
  const DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }

  async function open(path, vp) {
    const p = await browser.newPage()
    await p.setViewport(vp)
    if (vp.isMobile && vp.width === 390 && !vp.fast) {
      const cdp = await p.createCDPSession()
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
      p.__cdp = cdp
    }
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      const url = r.url()
      if (url.startsWith(`${ORIGIN}/api/`)) return void r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ questions: [] }) })
      if (url.includes("storelib-logo-v2.webp")) return void r.respond({ status: 200, contentType: "image/webp", body: logo })
      if (url.startsWith(`${ORIGIN}/_next/image`)) {
        /* The optimiser's address around a fixture's data: picture: answer with the picture itself. */
        const src = new URL(url).searchParams.get("url") || ""
        const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(src)
        if (m) return void r.respond({ status: 200, contentType: m[1], body: m[2] ? Buffer.from(m[3], "base64") : decodeURIComponent(m[3]) })
        return void r.respond({ status: 404, body: "" })
      }
      if (url.startsWith(`${ORIGIN}/`)) return void r.respond({ status: 200, contentType: "text/html", body: html })
      if (url.startsWith("data:") || url.startsWith("about:")) return void r.continue()
      return void r.respond({ status: 204, body: "" })
    })
    await p.goto(`${ORIGIN}${path}`, { waitUntil: "load" })
    await p.evaluate(() => document.fonts.ready)
    await sleep(vp === PHONE ? 1200 : 600)
    return { p, errors }
  }

  const measure = (p) =>
    p.evaluate(() => {
      const vis = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden"
      const text = (el) => (el?.textContent || "").replace(/\s+/g, " ").trim()
      const card = document.querySelector("[data-join-card]")
      const cardOn = vis(card)
      const row = document.querySelector("[data-about-row]")
      const bar = document.querySelector("[data-join-bar]")
      const cardButton = card?.querySelector("[data-join-state]")
      const barButton = bar?.querySelector("[data-join-state]")
      const powered = document.querySelector("[data-powered-by]")
      const pr = powered?.getBoundingClientRect()
      const cr = card?.querySelector("[data-join-card-box]")?.getBoundingClientRect()
      const share = [...document.querySelectorAll("[data-community-share]")].filter(vis)
      const summary = card?.querySelector("[data-card-summary]")
      const legal = [...document.querySelectorAll("[data-community-legal] a")].map((a) => a.getAttribute("href"))
      const h2s = [...document.querySelectorAll("[data-community-sales] h2")].map(text)
      const visibleLinks = [...document.querySelectorAll("[data-community-links]")].filter(vis)
      return {
        h1: document.querySelectorAll("h1").length,
        sideways: document.documentElement.scrollWidth - innerWidth,
        rowFacts: [...(row?.querySelectorAll("[data-about-row-fact]") ?? [])].map((li) => li.getAttribute("data-about-row-fact")),
        rowHasFaces: !!row?.querySelector("[data-about-faces]"),
        linksInHeader: !!document.querySelector("[data-community-sheet] header [data-community-links]"),
        linksVisible: visibleLinks.map((l) => (l.closest("[data-join-card]") ? "card" : l.closest("[data-community-creator-card]") ? "creator" : l.closest("[data-wall-card]") ? "left-card" : "other")),
        cardOn,
        cardButton: cardOn ? text(cardButton) : null,
        barButton: vis(bar) ? text(barButton) : null,
        cardFacts: cardOn ? [...card.querySelectorAll("[data-fact]")].map((f) => `${f.getAttribute("data-fact")}:${text(f.querySelector("dd"))}`) : [],
        cardLinks: cardOn ? card.querySelectorAll("[data-community-link]").length : 0,
        summary: cardOn && summary ? { text: text(summary.querySelector("[data-card-summary-text]")).slice(0, 40), clamped: summary.getAttribute("data-clamped"), more: !!summary.querySelector("[data-card-summary-more]") } : null,
        powered: powered ? { on: vis(powered), gapBelowCard: cr && pr ? Math.round(pr.top - cr.bottom) : null, color: getComputedStyle(powered).color, href: powered.querySelector("a")?.getAttribute("href") ?? null, logo: !!powered.querySelector("img") } : null,
        share: share.map((s) => (s.closest("[data-join-card]") ? "card" : s.closest("[data-wall-card]") ? "left-card" : s.closest("[data-share-on]")?.getAttribute("data-share-on") ?? "other")),
        membership: !!document.querySelector("[data-community-membership]"),
        others: /Other ways to join|Ways to join/.test(document.body.textContent || ""),
        h2s,
        legal,
        bodyBg: getComputedStyle(document.querySelector("[data-community-public]") || document.body).backgroundColor,
      }
    })

  const CASES = ["free", "paid", "trial", "invite"]
  const WORDS = { free: "Join free", paid: "Join $24/month", trial: "Start free trial", invite: null }
  const VIEWS = [
    ["desk", DESK],
    ["tablet", TABLET],
    ["phone", PHONE],
  ]
  for (const theme of part("pages") ? ["light", "dark"] : []) {
    for (const which of CASES) {
      for (const [name, vp] of VIEWS) {
        const tag = `${name} ${theme} ${which}`
        console.log(`\n${tag}`)
        const { p, errors } = await open(`/community/clay-studio/about?case=${which}${theme === "dark" ? "&dark=1" : ""}`, vp)
        expect(errors.length === 0, `${tag}: no page errors`, errors.slice(0, 2))
        const m = await measure(p)
        expect(m.h1 === 1, `${tag}: one h1`, m.h1)
        expect(m.sideways <= 0, `${tag}: no sideways scroll`, m.sideways)
        expect(!m.rowFacts.includes("admins") && m.rowFacts.includes("members") && m.rowFacts.includes("price") && m.rowHasFaces, `${tag}: the row under the name has faces, members and the price, no admins`, m.rowFacts)
        expect(!m.linksInHeader, `${tag}: no social icons under the name`)
        expect(!m.membership && !m.others, `${tag}: no Membership block, no "Other ways to join"`)
        expect(m.h2s.includes("What's inside") && !m.h2s.includes("What members get"), `${tag}: "What's inside"`, m.h2s)
        expect(m.legal.some((h) => /\/legal\/privacy$/.test(h)) && m.legal.some((h) => /\/legal\/terms$/.test(h)), `${tag}: Privacy and Terms links`, m.legal)
        if (name === "desk") {
          expect(m.cardOn, `${tag}: the side card`)
          expect(m.linksVisible.length === 1 && m.linksVisible[0] === "card" && m.cardLinks >= 2, `${tag}: the social icons are in the card, only there`, { where: m.linksVisible, n: m.cardLinks })
          expect(m.cardFacts.some((f) => f === "admins:2"), `${tag}: the admin count is in the card`, m.cardFacts)
          expect(!!m.powered?.on && m.powered.href === "https://storelib.com" && m.powered.logo && m.powered.gapBelowCard >= 8 && m.powered.gapBelowCard <= 40, `${tag}: Powered by and the logo under the card, linked`, m.powered)
          expect(!!m.summary?.text, `${tag}: the short description in the card`, m.summary)
          if (WORDS[which]) expect(m.cardButton === WORDS[which], `${tag}: the card's button says ${WORDS[which]}`, m.cardButton)
          else expect(!/^Join/.test(m.cardButton || ""), `${tag}: an invite only community has no Join button`, m.cardButton)
          expect(which === "invite" ? m.share.length === 0 : m.share.length === 1 && m.share[0] === "card", `${tag}: Share on the card's cover ${which === "invite" ? "is not offered" : "is offered, once"}`, m.share)
        } else {
          expect(!m.cardOn && !(m.powered?.on), `${tag}: no side card and no Powered by below 1280px`)
          if (WORDS[which]) expect(m.barButton === WORDS[which], `${tag}: the phone bar says ${WORDS[which]}, as the card does`, m.barButton)
          expect(m.linksVisible.includes("creator"), `${tag}: the social icons sit with who runs it`, m.linksVisible)
          expect(which === "invite" ? m.share.length === 0 : m.share.length === 1 && m.share[0] === "gallery", `${tag}: Share on the page's cover ${which === "invite" ? "is not offered" : "is offered, once"}`, m.share)
        }
        if (theme === "dark") {
          const box = await p.evaluate(() => {
            const strip = document.querySelector("[data-gallery-strip]")
            if (!strip) return null
            const bg = (el) => getComputedStyle(el).backgroundColor
            const on = strip.querySelector("[data-gallery-thumb][aria-selected=true]")
            const sheet = document.querySelector("[data-community-sheet]")
            /* What is painted around the chosen thumbnail, 3px outside it: the sheet's own ground, not a light box. */
            const r = on.getBoundingClientRect()
            const ring = getComputedStyle(on).getPropertyValue("--tw-ring-offset-color") || ""
            return { strip: bg(strip), sheet: bg(sheet), ringOffset: ring.trim(), shadow: getComputedStyle(on).boxShadow.slice(0, 120), w: Math.round(r.width) }
          })
          if (box) {
            const light = (c) => /rgb\((2[0-9]{2}), (2[0-9]{2}), (2[0-9]{2})\)/.test(c)
            expect(!light(box.strip) && !/rgb\(255, 255, 255\)/.test(box.shadow), `${tag}: no light box around the thumbnails`, box)
          }
        }
        /* The measuring is done under the 4x slower CPU; the pictures are taken at full speed so a busy machine does not time them out. */
        if (p.__cdp) await p.__cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
        await p.screenshot({ path: join(shots, `${name}-${theme}-${which}.png`), fullPage: name !== "phone" })
        if (name === "phone") await p.screenshot({ path: join(shots, `${name}-${theme}-${which}-full.png`), fullPage: true })
        if (name === "desk" && which === "paid") {
          const clip = await p.evaluate(() => {
            const r = document.querySelector("[data-join-card]").getBoundingClientRect()
            return { x: r.left - 8, y: r.top + scrollY - 8, width: r.width + 16, height: r.height + 16 }
          })
          await p.screenshot({ path: join(shots, `card-${theme}.png`), clip })
        }
        await p.close()
      }
    }
  }

  /* ── The summary clamps and expands; Share copies and says so ─────────── */
  if (part("desk-share")) {
    console.log("\ninteractions, 1440")
    const { p } = await open("/community/clay-studio/about?case=paid", DESK)
    await p.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", { value: { writeText: async (t) => ((window.__copied = t), undefined) }, configurable: true })
    })
    const before = await p.evaluate(() => {
      const s = document.querySelector("[data-join-card] [data-card-summary]")
      return s ? { h: Math.round(s.querySelector("[data-card-summary-text]").getBoundingClientRect().height), clamped: s.getAttribute("data-clamped") } : null
    })
    const more = await p.$("[data-join-card] [data-card-summary-more]")
    if (more) await more.click()
    await sleep(250)
    const after = await p.evaluate(() => {
      const s = document.querySelector("[data-join-card] [data-card-summary]")
      return s ? { h: Math.round(s.querySelector("[data-card-summary-text]").getBoundingClientRect().height), clamped: s.getAttribute("data-clamped"), label: s.querySelector("[data-card-summary-more]")?.textContent, expanded: s.querySelector("[data-card-summary-more]")?.getAttribute("aria-expanded") } : null
    })
    expect(!!before && before.clamped === "true" && !!after && after.h > before.h && after.expanded === "true", "the summary is clamped, More shows all of it", { before, after })
    const trigger = await p.$("[data-join-card] [data-community-share] button")
    expect(!!trigger, "the Share button is on the card's cover")
    if (trigger) {
      const label = await trigger.evaluate((b) => b.getAttribute("aria-label"))
      expect(label === "Share", "the Share button is named", label)
      await trigger.click()
      await sleep(300)
      const items = await p.evaluate(() => [...document.querySelectorAll("[role=menuitem]")].map((m) => (m.textContent || "").trim()))
      expect(items.includes("Copy link") && items.includes("QR code"), "the menu offers Copy link and a QR code", items)
      await p.screenshot({ path: join(shots, "share-menu.png") })
      const copy = await p.evaluateHandle(() => [...document.querySelectorAll("[role=menuitem]")].find((m) => /Copy link/.test(m.textContent || "")))
      await copy.asElement()?.click()
      await sleep(400)
      const done = await p.evaluate(() => ({ copied: window.__copied ?? null, toast: document.querySelector("[data-pill-toast]")?.textContent ?? null }))
      expect(done.copied === "https://storelib.com/community/clay-studio" && /Link copied/.test(done.toast || ""), "Copy link copies the community's address and says so", done)
      await p.screenshot({ path: join(shots, "share-copied.png") })
      await trigger.click()
      await sleep(300)
      const qr = await p.evaluateHandle(() => [...document.querySelectorAll("[role=menuitem]")].find((m) => /QR code/.test(m.textContent || "")))
      await qr.asElement()?.click()
      await sleep(900)
      const code = await p.evaluate(() => {
        const img = document.querySelector("[data-community-qr] img")
        return img ? { w: Math.round(img.getBoundingClientRect().width), src: (img.getAttribute("src") || "").slice(0, 22) } : null
      })
      expect(!!code && code.w >= 160 && code.src.startsWith("data:image/png"), "the QR code draws", code)
      await p.screenshot({ path: join(shots, "share-qr.png") })
    }
    await p.close()
  }

  /* ── The gallery's slide count changes in place (two to one and back): no error, the frame still draws ─ */
  if (part("shrink")) {
    console.log("\ngallery count changes, 1440")
    const { p, errors } = await open("/community/clay-studio/about?case=paid&shrink=1", DESK)
    await p.waitForFunction(() => window.__shrunk === true, { timeout: 20_000 }).catch(() => null)
    const after = await p.evaluate(() => ({ slides: document.querySelectorAll("[data-gallery-slide]").length, thumbs: document.querySelectorAll("[data-gallery-thumb]").length }))
    expect(errors.length === 0, "the slide count changing in place throws nothing", errors.slice(0, 2))
    expect(after.slides === 4 && after.thumbs === 4, "the gallery ends with its four pictures and four thumbnails", after)
    await p.close()
  }

  /* ── On a phone: Share on the page's cover opens the shared bottom sheet ─ */
  if (part("phone-share")) {
    console.log("\ninteractions, 390")
    const { p } = await open("/community/clay-studio/about?case=paid", { ...PHONE, fast: true })
    const btn = await p.$("[data-share-on=gallery] button")
    const box = btn ? await btn.boundingBox() : null
    expect(!!box && box.width >= 40 && box.height >= 40, "the Share button is a 40px target on a phone", box && { w: Math.round(box.width), h: Math.round(box.height) })
    if (btn) {
      await btn.tap()
      await sleep(700)
      const sheet = await p.evaluate(() => {
        const t = document.body.innerText
        return { copy: /Copy link/.test(t), qr: /QR code/.test(t) }
      })
      expect(sheet.copy && sheet.qr, "a tap opens the sheet with Copy link and QR code", sheet)
      await p.screenshot({ path: join(shots, "share-phone-sheet.png") })
    }
    await p.close()
  }

  /* ── The member's card ─────────────────────────────────────────────────── */
  for (const theme of part("member") ? ["light", "dark"] : []) {
    for (const which of ["paid", "invite"]) {
      const tag = `member card ${theme} ${which}`
      console.log(`\n${tag}`)
      const { p, errors } = await open(`/community/clay-studio?view=member&case=${which}${theme === "dark" ? "&dark=1" : ""}`, DESK)
      expect(errors.length === 0, `${tag}: no page errors`, errors.slice(0, 2))
      const m = await p.evaluate(() => {
        const card = document.querySelector("[data-wall-card]")
        return {
          summary: (card.querySelector("[data-card-summary-text]")?.textContent || "").slice(0, 30),
          links: card.querySelectorAll("[data-community-link]").length,
          share: !!card.querySelector("[data-community-share]"),
          admins: card.querySelector("[data-wall-stat=admins]")?.textContent ?? null,
          bg: getComputedStyle(card).backgroundColor,
        }
      })
      expect(!!m.summary, `${tag}: the short description`, m.summary)
      expect(m.links >= 2, `${tag}: the social icons`, m.links)
      expect(/2/.test(m.admins || ""), `${tag}: the admin count`, m.admins)
      expect(which === "invite" ? !m.share : m.share, `${tag}: Share ${which === "invite" ? "is not offered for a member of a private community" : "is on the cover"}`, m.share)
      const clip = await p.evaluate(() => {
        const r = document.querySelector("[data-wall-card]").getBoundingClientRect()
        return { x: r.left - 12, y: r.top - 12, width: r.width + 24, height: r.height + 24 }
      })
      await p.screenshot({ path: join(shots, `member-card-${theme}-${which}.png`), clip })
      await p.close()
    }
  }

  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
console.log(broken ? `\n${broken} check(s) failed` : "\nall checks passed")
process.exit(broken ? 1 : 0)
