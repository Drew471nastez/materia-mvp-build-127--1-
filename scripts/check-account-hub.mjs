/**
 * ===========================================================================
 *  THE BUYER'S PROFILE AND ITS SETTINGS, MEASURED AND PHOTOGRAPHED
 * ===========================================================================
 * The real profile (components/account/account-hub.tsx) with the real
 * Overview and the real Settings, rendered by
 * scripts/render-account-hub.tsx in a shell shaped like the layout.
 *
 *   ONE HEADER      the site header draws at 360, 390, 430 and 1280, and
 *                   the profile draws no bar of its own at any of them:
 *                   "The profile page reached from Explore needs to have
 *                   the header on it", one bar and never two stacked. The
 *                   column starts the library's 24px under it.
 *   ONE FACE        one avatar on each screen: the profile's on /account,
 *                   Settings' own on /account/settings, never both.
 *   LAYOUT          nothing sideways, nothing off the edge, every control
 *                   36px or taller, the person on the centre line.
 *   SETTINGS        the top row (a round X out and the word Settings), the
 *                   three section pills, and each section's fields: the
 *                   pressed pill's fill answers at once and is full within
 *                   its 150ms while the old one fades where it is.
 *   FIELDS          the name and the bio, the bio's counter following what
 *                   is typed, and no bio field at all where the column has
 *                   not been added yet.
 *
 * Pictures go to SHOTS_DIR (or a temp folder), and are meant to be looked at.
 *
 *   PROBE_CSS=source node scripts/check-account-hub.mjs
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"
import { sweepScreens } from "./sweep-measure.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const css = await appCss(root)
const stubs = join(root, ".account-hub-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-account-hub-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const URL_BASE = "https://storelib.com/__account_hub_probe"

/** The library's room under the header (app/library/layout.tsx py-6). */
/* The profile center's room under the header (app/account/layout.tsx pt-4 sm:pt-6). */
const HEADER_GAP = 24
const PHONE_GAP = 16

try {
  writeFileSync(join(stubs, "navigation.js"), `import { useSyncExternalStore } from "react"
let path = window.__path || "/account"
const subs = new Set()
const subscribe = (f) => { subs.add(f); return () => subs.delete(f) }
const go = (href) => { path = href.split("?")[0]; window.__arrivedAt = performance.now(); subs.forEach((f) => f()) }
const router = { push: (h) => setTimeout(() => go(h), window.__navMs ?? 60), replace: go, prefetch: () => {}, back: () => {}, refresh: () => {} }
window.__go = go
export const usePathname = () => useSyncExternalStore(subscribe, () => path, () => path)
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams("")
export const redirect = () => {}
export const permanentRedirect = () => {}
export const notFound = () => {}
`)
  /* A link is pressed, its onClick runs, and a prefetched page arrives __navMs later. */
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, ...rest }, ref) {
  return React.createElement("a", { href, ref, ...rest, onClick: (e) => {
    rest.onClick && rest.onClick(e)
    e.preventDefault()
    if (e.defaultPrevented && e.__stop) return
    ;(window.__links ||= []).push(href)
    if (!rest.__noNav) setTimeout(() => window.__go(href), window.__navMs ?? 60)
  } }, children)
})
`)
  writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest }) }
`)
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-account-hub.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.account-hub-probe/navigation.js", "next/link": "./.account-hub-probe/link.jsx", "next/image": "./.account-hub-probe/image.jsx" },
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "app.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  const html = `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] })
  const phone = (width) => ({ width, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  const DESK = { width: 1280, height: 900 }

  const open = async (vp, path, globals = {}) => {
    const p = await browser.newPage()
    await p.setViewport(vp)
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
    await p.setRequestInterception(true)
    p.on("request", (r) => (r.url().startsWith(URL_BASE) ? r.respond({ status: 200, contentType: "text/html", body: html }) : r.url().startsWith("data:") ? r.continue() : r.respond({ status: 404, body: "" })))
    await p.evaluateOnNewDocument((path, globals) => {
      window.__path = path
      Object.assign(window, globals)
    }, path, globals)
    await p.goto(URL_BASE, { waitUntil: "load" })
    await sleep(300)
    return { p, errors }
  }

  const layout = (p) => p.evaluate(() => {
    const column = document.querySelector("[data-probe-account-column]")
    const controls = [...column.querySelectorAll("a, button, input, textarea")].filter((el) => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden"
    })
    const header = document.querySelector("[data-probe-header]")
    const top = column.firstElementChild.getBoundingClientRect()
    const mid = (el) => { const r = el.getBoundingClientRect(); return Math.round((r.left + r.right) / 2) }
    const profile = document.querySelector("[data-profile-hero]")
    return {
      sideways: document.documentElement.scrollWidth - innerWidth,
      /* A pill scrolled out of its own sideways row is not off the page. */
      out: controls.filter((el) => { const r = el.getBoundingClientRect(); return (r.left < -0.5 || r.right > innerWidth + 0.5) && !el.closest("[data-profile-owner-pills], [data-library-tabs]") }).map((el) => el.textContent.trim().slice(0, 20)),
      /* 36px is the library pill's height, and the floor for anything a thumb has to hit. */
      small: controls.filter((el) => el.getBoundingClientRect().height < 35.5).map((el) => `${el.textContent.trim().slice(0, 24) || el.tagName} ${Math.round(el.getBoundingClientRect().height)}`),
      fields: [...column.querySelectorAll("input:not([type=hidden]):not([hidden]), textarea")].filter((el) => el.offsetParent !== null).map((i) => (i.getAttribute("data-account-name") !== null ? "name" : i.getAttribute("data-account-bio-field") !== null ? "bio" : i.type || i.tagName.toLowerCase())),
      h1: document.querySelector("h1")?.textContent,
      cards: [...document.querySelectorAll("[data-account-card]")].map((c) => c.getAttribute("data-account-card")),
      nameClipped: (() => { const h = document.querySelector("h1"); return h.scrollWidth > h.clientWidth })(),
      /* Every circle drawn with a face or initials in it, on the whole page. */
      avatars: [...document.querySelectorAll("[data-app-avatar], [data-account-avatar], [data-profile-photo]")].filter((el) => {
        const r = el.getBoundingClientRect()
        return r.width > 24 && getComputedStyle(el).visibility !== "hidden" && !el.parentElement.closest("[data-account-avatar]")
      }).length,
      /* The site header, and anything the profile might still be drawing over it. */
      headers: header && getComputedStyle(header).display !== "none" ? 1 : 0,
      ownBar: !!document.querySelector("[data-account-bar]"),
      gap: Math.round(top.top - header.getBoundingClientRect().bottom),
      hasProfile: !!profile,
      edit: !!document.querySelector('[data-profile-owner-pill="edit"]'),
      sections: [...document.querySelectorAll("[data-account-section]")].map((t) => `${t.getAttribute("data-account-section")}${t.getAttribute("aria-current") ? "*" : ""}`),
      pillHeight: (() => { const t = document.querySelector("[data-account-section]"); return t ? Math.round(t.getBoundingClientRect().height) : null })(),
      centre: profile
        ? { page: Math.round(innerWidth / 2), avatar: mid(document.querySelector("[data-account-avatar]")), name: mid(document.querySelector("h1")) }
        : null,
    }
  })

  /* ── ONE HEADER, ONE FACE, AND THE LAYOUT ───────────────────────────── */
  for (const w of [360, 390, 430]) {
    console.log(`\nphone ${w}`)
    for (const path of ["/account", "/account/settings"]) {
      const { p, errors } = await open(phone(w), path)
      const l = await layout(p)
      const settings = path.endsWith("settings")
      expect(l.sideways <= 0 && l.out.length === 0, `${path}: nothing sideways, nothing off the edge`, { sideways: l.sideways, out: l.out })
      expect(l.small.length === 0, `${path}: every control 36px or taller`, l.small)
      expect(l.headers === 1 && !l.ownBar, `${path}: the site header, and no bar of the profile's own over it`, { headers: l.headers, ownBar: l.ownBar })
      expect(l.gap === PHONE_GAP, `${path}: the profile's ${PHONE_GAP}px under the header on a phone`, l.gap)
      expect(l.avatars === 1, `${path}: one face on the screen, never two`, l.avatars)
      if (settings) {
        expect(l.h1 === "Settings" && (await p.evaluate(() => !!document.querySelector("[data-account-settings-close]"))), "Settings: the X out and the word Settings", l.h1)
        expect(l.sections.join() === "profile*,account,preferences" && l.pillHeight === 36, "Settings: three section pills, Profile lit, the library's 36px pill", { sections: l.sections, pillHeight: l.pillHeight })
        expect(l.fields.join() === "name,bio" && l.cards.join() === "profile", "Settings opens on the profile's own fields", { fields: l.fields, cards: l.cards })
        expect(!l.hasProfile, "and the profile header is not drawn here, so there is one face and one heading")
      } else {
        expect(l.h1 === "Alex Morgan" && l.hasProfile && l.edit, "the person, and the owner's pills with Edit profile under them", { h1: l.h1, edit: l.edit })
        expect(l.fields.length === 0, "the profile has nothing to type", { fields: l.fields })
        expect(await p.evaluate(() => !!document.querySelector("[data-profile-bio]")), "the bio under the name")
        const off = Object.entries(l.centre).filter(([k, v]) => k !== "page" && Math.abs(v - l.centre.page) > 1)
        expect(off.length === 0, "photo and name on the page's centre line", l.centre)
      }
      if (w === 390 || w === 360) await p.screenshot({ path: join(shots, `${settings ? "settings" : "overview"}-${w}.png`), fullPage: true })
      expect(errors.length === 0, "no errors", errors)
      await p.close()
    }
  }
  {
    const { p } = await open(phone(360), "/account", { __longName: true, __emptyLibrary: true, __bio: false, __username: false })
    const l = await layout(p)
    expect(l.sideways <= 0 && l.out.length === 0 && l.avatars === 1, "a long name, no bio, no handle and an empty library at 360: nothing sideways, one face", { sideways: l.sideways, out: l.out })
    await p.screenshot({ path: join(shots, "overview-360-long-empty.png"), fullPage: true })
    await p.close()
  }

  /* ── SETTINGS: ITS SECTIONS ─────────────────────────────────────────── */
  console.log("\nthe sections, phone 390")
  {
    const { p, errors } = await open(phone(390), "/account/settings", { __photo: true })
    await p.screenshot({ path: join(shots, "settings-profile-390.png"), fullPage: true })

    /* The pressed pill's fill, sampled on every frame. */
    await p.evaluate(() => {
      window.__frames = []
      let t0 = null
      const fill = (k) => { const cs = getComputedStyle(document.querySelector(`[data-account-section="${k}"] [data-account-section-fill]`)); return { o: +cs.opacity, s: cs.scale } }
      const read = (ts) => {
        if (t0 === null) t0 = ts
        window.__frames.push({ t: Math.round(ts - t0), profile: fill("profile"), account: fill("account") })
        if (ts - t0 < 600) requestAnimationFrame(read)
      }
      requestAnimationFrame((ts) => { read(ts); document.querySelector('[data-account-section="account"]').click() })
    })
    await sleep(900)
    const frames = await p.evaluate(() => window.__frames)
    const started = frames.findIndex((f) => f.account.o > 0.02)
    const full = frames.find((f) => f.account.o >= 0.999)
    console.log(`    account fill: ${frames.slice(0, 14).map((f) => `${f.t}:${f.account.o.toFixed(2)}`).join(" ")}`)
    expect(started >= 0 && full && full.t - frames[Math.max(0, started - 1)].t <= 170, "the pressed pill's fill is full within its 150ms", full && { started: frames[Math.max(0, started - 1)].t, full: full.t })
    expect(frames.at(-1).profile.o === 0 && frames.at(-1).account.o === 1, "the old pill's fill is gone, the new one on", { from: frames.at(-1).profile.o, to: frames.at(-1).account.o })

    const acc = await layout(p)
    /* The password card is /app Settings' own and stamps itself data-settings-card. */
    const passwordCard = await p.evaluate(() => !!document.querySelector('[data-settings-card="password"]'))
    expect(acc.cards.join() === "email,leave" && passwordCard && acc.sections.join() === "profile,account*,preferences", "Account: email, password, and leaving in one panel", { cards: acc.cards, passwordCard, sections: acc.sections })
    expect(acc.avatars === 0 && acc.small.length === 0 && acc.out.length === 0 && acc.sideways <= 0, "Account: no second face, nothing small or off the edge", { avatars: acc.avatars, small: acc.small, out: acc.out })
    await p.screenshot({ path: join(shots, "settings-account-390.png"), fullPage: true })

    /* Every flow that was there is still reachable. */
    const flows = await p.evaluate(() => ({
      email: !!document.querySelector("[data-change-email]"),
      password: !!document.querySelector("[data-password-open]"),
      logout: !!document.querySelector("[data-account-logout]"),
      everywhere: !!document.querySelector("[data-account-logout-all]"),
      del: !!document.querySelector("[data-account-delete]"),
    }))
    expect(Object.values(flows).every(Boolean), "change email, set or change password, log out, log out everywhere, delete", flows)
    await p.evaluate(() => document.querySelector("[data-account-delete]").click())
    await sleep(200)
    expect(await p.evaluate(() => document.body.textContent.includes("6 digit code")), "deleting still asks for a code")

    await p.evaluate(() => document.querySelector('[data-account-section="preferences"]').click())
    await sleep(350)
    const pref = await layout(p)
    const switches = await p.evaluate(() => document.querySelectorAll("[data-settings-switch]").length)
    expect(pref.cards.join() === "preferences" && switches === 2, "Preferences: language, and the two switches", { cards: pref.cards, switches })
    expect(pref.small.length === 0 && pref.out.length === 0, "Preferences: nothing small, nothing off the edge", { small: pref.small, out: pref.out })
    await p.screenshot({ path: join(shots, "settings-preferences-390.png"), fullPage: true })
    expect(errors.length === 0, "no errors", errors)
    await p.close()
  }

  /* ── THE FIELDS ─────────────────────────────────────────────────────── */
  console.log("\nthe fields, phone 390")
  {
    const { p } = await open(phone(390), "/account/settings")
    const counter = () => p.evaluate(() => document.querySelector("[data-account-counter]").textContent)
    const start = await counter()
    expect(/^\d+\/240$/.test(start) && start !== "0/240", "the bio's counter starts on what is already written", start)
    await p.click("[data-account-bio-field]")
    await p.keyboard.type("!!")
    await sleep(150)
    const after = await counter()
    expect(Number(after.split("/")[0]) === Number(start.split("/")[0]) + 2, "and follows what is typed", { start, after })
    expect(await p.evaluate(() => !document.querySelector("[data-account-save]").disabled), "Save changes wakes up once something has changed")
    await p.screenshot({ path: join(shots, "settings-fields-390.png") })
    await p.close()
  }
  {
    const { p } = await open(phone(390), "/account/settings", { __noBioColumn: true })
    const l = await layout(p)
    expect(l.fields.join() === "name" && !(await p.evaluate(() => !!document.querySelector("[data-account-counter]"))), "no profiles.bio column: no bio field and no counter, just the name", l.fields)
    await p.close()
  }

  /* ── THE WAY IN AND THE WAY OUT ─────────────────────────────────────── */
  console.log("\nEdit profile, and the X back")
  {
    const { p } = await open(phone(390), "/account")
    await p.evaluate(() => document.querySelector('[data-profile-owner-pill="edit"]').click())
    await sleep(500)
    const l = await layout(p)
    expect(l.h1 === "Settings" && l.sections.join() === "profile*,account,preferences" && l.avatars === 1, "Edit profile opens Settings on the profile's fields, with one face", { h1: l.h1, sections: l.sections, avatars: l.avatars })
    await p.evaluate(() => document.querySelector("[data-account-settings-close]").click())
    await sleep(500)
    const back = await layout(p)
    expect(back.h1 === "Alex Morgan" && back.hasProfile, "and the X closes back to the profile", back.h1)
    await p.close()
  }

  /* ── DESKTOP ────────────────────────────────────────────────────────── */
  console.log("\ndesktop 1280")
  for (const path of ["/account", "/account/settings"]) {
    const { p, errors } = await open(DESK, path, { __seller: true })
    const l = await layout(p)
    const col = await p.evaluate(() => Math.round(document.querySelector("[data-probe-account-column]").getBoundingClientRect().width))
    expect(l.sideways <= 0 && col === 960, `${path}: one 960px column on a computer, the profile's own width, nothing sideways`, { col, sideways: l.sideways })
    expect(l.headers === 1 && !l.ownBar && l.avatars === 1 && l.gap === HEADER_GAP, `${path}: the site header, one face, the library's gap`, { headers: l.headers, bar: l.ownBar, avatars: l.avatars, gap: l.gap })
    expect(l.small.length === 0, `${path}: every control 36px or taller`, l.small)
    await p.screenshot({ path: join(shots, `${path.endsWith("settings") ? "settings" : "overview"}-1280.png`), fullPage: true })
    expect(errors.length === 0, "no errors", errors)
    await p.close()
  }

  /* SWEEP: both screens at six widths (scripts/sweep-measure.mjs). */
  console.log("\nsweep at six widths")
  {
    const paths = { overview: "/account", settings: "/account/settings" }
    const problems = await sweepScreens(Object.keys(paths), async (name, vp) => {
      const { p, errors } = await open(vp, paths[name])
      p.errors = errors
      return p
    }, { shots })
    expect(problems.length === 0, "the profile and its settings read clean at every width", problems)
  }
  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
console.log(`\nshots: ${shots}`)
console.log(broken ? `\n${broken} failed` : "\nall ok")
process.exit(broken ? 1 : 0)
