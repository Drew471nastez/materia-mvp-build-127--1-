/**
 * ===========================================================================
 *  A COMMUNITY'S ABOUT PAGE AND ITS JOIN, MEASURED (round 10, asks 32, 33)
 * ===========================================================================
 * The real components (scripts/render-community-about.tsx) at 1440x900 and
 * on a 390x844 phone, with and without the phone's tab bar, for a paid
 * community (monthly and yearly), a free one, one paid once, an invite only
 * one, one that asks for approval and a member on /about:
 *
 *   SHAPE       the pricing card in the page (Monthly / Yearly when both
 *               exist), the classroom's courses, the creator with their
 *               line, the figures under the facts line; nothing scrolls
 *               sideways; on a phone every control is 40px or taller
 *   THE SWITCH  Yearly moves the price in the card, the pricing card and
 *               the button's words; the thumb slides over several frames
 *   STICKY      from 1024px the card stays put while the page scrolls
 *   THE BAR     on a phone the join bar is one white surface down to the
 *               screen's foot: with the tab bar, its button 12px above the
 *               tab bar; without, 12px above the foot; every point between
 *               its top edge and the foot is the bar or the tab bar (no page
 *               showing around it), at the top, the middle and the end of
 *               the page, and the end of the page is above it
 *   THE JOIN    at 4x CPU with stubbed routes: the press shows "Joining"
 *               within a couple of frames, one join request however many
 *               presses, "You're in", then ONE navigation (the address
 *               moved to the community's home with pushState, one
 *               router.refresh, no push) and the inside is on screen well
 *               under 2s; on the home address itself, no pushState at all;
 *               a failed join puts the button back with its line
 *
 *   PROBE_CSS=source node scripts/check-community-about.mjs
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
const stubs = join(root, ".community-about-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-community-about-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ORIGIN = "https://storelib.com"

try {
  writeFileSync(join(stubs, "navigation.js"), `const log = (k, a) => (window.__router ||= []).push([k, a, performance.now(), location.pathname])
const router = { push: (h) => log("push", h), replace: (h) => log("replace", h), prefetch: () => {}, back: () => log("back"), refresh: () => { log("refresh"); window.__onRefresh && window.__onRefresh() } }
export const usePathname = () => location.pathname
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(location.search)
export const redirect = () => {}
export const notFound = () => {}
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, unstable_dynamicOnHover, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) { e.preventDefault(); (window.__router ||= []).push(["link", href]) } } }, children) })
`)
  writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest }) }
`)
  writeFileSync(join(stubs, "supabase-client.js"), `export function createClient() {
  return {
    channel() { const ch = { on() { return ch }, subscribe(cb) { setTimeout(() => cb && cb("SUBSCRIBED"), 30); return ch }, track: async () => "ok", presenceState: () => ({}) }; return ch },
    removeChannel() {},
    realtime: { setAuth: async () => {} },
    auth: { getSession: async () => ({ data: { session: { user: { id: "u-me" } } } }), getUser: async () => ({ data: { user: { id: "u-me" } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    from() { const q = { select: () => q, eq: () => q, in: () => q, order: () => q, limit: () => q, maybeSingle: async () => ({ data: null }), single: async () => ({ data: null }), then: (f) => f({ data: [] }) }; return q },
  }
}
export const isNativePlatform = () => false
`)
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-community-about.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.community-about-probe/navigation.js", "next/link": "./.community-about-probe/link.jsx", "next/image": "./.community-about-probe/image.jsx" },
    plugins: [{ name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })) } }],
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "app.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${fonts}${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--hide-scrollbars"] })
  const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
  const DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }

  async function open(path, vp, opts = {}) {
    const p = await browser.newPage()
    await p.setViewport(vp)
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
    await p.setRequestInterception(true)
    const joins = []
    p.on("request", async (r) => {
      const url = r.url()
      if (url.startsWith(`${ORIGIN}/api/`)) {
        const short = url.replace(ORIGIN, "")
        if (/\/join$/.test(short) && r.method() === "POST") {
          joins.push(short)
          await sleep(opts.joinMs ?? 300)
          if (opts.joinFails) return void r.respond({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "server", message: "That did not go through. Try again." }) })
          return void r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ state: "member", url: "/community/x" }) })
        }
        let body = {}
        if (short.startsWith("/api/me/places")) body = { signedIn: true, communitiesOn: true, isCreator: false, hasSellerAccess: false, communities: [] }
        else if (short.startsWith("/api/notifications")) body = { unread: 0, items: [], nextCursor: null }
        return void r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) })
      }
      if (url.startsWith(`${ORIGIN}/`)) return r.respond({ status: 200, contentType: "text/html", body: html })
      if (url.startsWith("data:")) return r.continue()
      return r.respond({ status: 204, body: "" })
    })
    await p.goto(`${ORIGIN}${path}`, { waitUntil: "load" })
    await p.evaluate(() => document.fonts.ready)
    await sleep(500)
    return { p, errors, joins }
  }

  const sideways = (p) => p.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  const smallTargets = (p) =>
    p.evaluate(() => {
      const out = []
      for (const el of document.querySelectorAll("[data-community-sales] button, [data-community-sales] a, [data-community-sales] [role=radio], [data-community-sales] summary, [data-join-bar] button, [data-join-bar] a")) {
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0 || el.closest("[data-community-description]")) continue
        if (r.height < 40) out.push({ tag: el.tagName, text: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 28), h: Math.round(r.height) })
      }
      return out
    })

  /* Every point between the bar's top edge and the screen's foot is the bar or the tab bar: no page shows around it. */
  const barCover = (p) =>
    p.evaluate(() => {
      const bar = document.querySelector("[data-join-bar]")
      const row = bar.querySelector("[data-join-bar-row]").getBoundingClientRect()
      const r = bar.getBoundingClientRect()
      const tabs = document.querySelector("[data-buyer-tab-bar]")
      const tabTop = tabs && tabs.getBoundingClientRect().height > 0 ? Math.round(tabs.getBoundingClientRect().top) : null
      const leaks = []
      for (let y = Math.ceil(r.top) + 1; y < innerHeight; y += 5) {
        for (const x of [4, Math.round(innerWidth / 2), innerWidth - 4]) {
          const el = document.elementFromPoint(x, y)
          if (!el || !(el.closest("[data-join-bar]") || el.closest("[data-buyer-tab-bar]"))) leaks.push({ x, y, tag: el ? el.tagName : null })
        }
      }
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), rowBottom: Math.round(row.bottom), vh: innerHeight, tabTop, bg: getComputedStyle(bar).backgroundColor, leaks: leaks.length, sample: leaks.slice(0, 3) }
    })

  const CASES = ["paid", "free", "once", "invite", "approval", "member"]
  const BUTTON = { paid: "Join for $19/month", free: "Join for free", once: "Join for $249", invite: "Invite only", approval: "Request to join", member: "Open community" }

  /* ── 1440: the sheet, the pricing card, the sticky card ─────────────── */
  for (const which of CASES) {
    console.log(`\n1440, ${which}`)
    const { p, errors } = await open(`/community/clay-studio/about?case=${which}`, DESK)
    if (errors.length) console.log("PAGE ERRORS", errors)
    const shape = await p.evaluate(() => ({
      pricing: document.querySelector("[data-pricing-card]")?.getAttribute("data-pricing-card") ?? null,
      switches: document.querySelectorAll("[data-interval-choice]").length,
      classroom: document.querySelectorAll("[data-classroom-course]").length,
      creator: !!document.querySelector("[data-community-creator-card]"),
      bio: document.querySelector("[data-community-creator-card] p.mt-2")?.textContent ?? null,
      stats: [...document.querySelectorAll("[data-community-stats] [data-stat]")].map((s) => s.getAttribute("data-stat")),
      card: document.querySelector("[data-join-card] [data-join-state]")?.textContent?.trim() ?? null,
      since: document.querySelector('[data-info="since"]')?.textContent ?? null,
    }))
    expect(shape.card === BUTTON[which], `the card's button: "${BUTTON[which]}"`, shape.card)
    if (which === "member") expect(shape.pricing === null, "a member sees no pricing card", shape)
    else expect(!!shape.pricing, "the Membership section is a pricing card", shape.pricing)
    if (which === "paid") {
      expect(shape.switches === 2, "Monthly / Yearly in the card and in the pricing card", shape.switches)
      expect(shape.classroom === 4 && shape.creator && /Gothenburg/.test(shape.bio || ""), "the classroom's first four courses, the creator with their line", shape)
      expect(shape.stats.join() === "members,online,posts,courses" && /^Since Mar 2025$/.test(shape.since || ""), "the figures: members, online, posts in 30 days, courses; and since when", shape)
      /* THE SWITCH: Yearly moves every price, and the thumb slides over several frames. */
      const slide = await p.evaluate(async () => {
        const thumb = document.querySelector("[data-pricing-card] [data-interval-thumb]")
        const seen = new Set()
        let run = true
        const tick = () => { if (!run) return; seen.add(getComputedStyle(thumb).translate); requestAnimationFrame(tick) }
        requestAnimationFrame(tick)
        document.querySelector('[data-pricing-card] [data-interval-option="year"]').click()
        await new Promise((r) => setTimeout(r, 420))
        run = false
        return {
          steps: seen.size,
          card: document.querySelector("[data-join-card] [data-join-price]").textContent,
          pricing: document.querySelector("[data-pricing-card] [data-join-price]").textContent,
          button: document.querySelector("[data-pricing-card] [data-join-state]").textContent.trim(),
          checked: document.querySelector('[data-join-card] [data-interval-option="year"]').getAttribute("aria-checked"),
        }
      })
      expect(slide.card === "$190/year" && slide.pricing === "$190/year" && slide.button === "Join for $190/year" && slide.checked === "true", "Yearly moves the price in the card, the pricing card and the button's words", slide)
      expect(slide.steps >= 5, "the thumb slides over several frames, not a jump", slide.steps)
      await p.screenshot({ path: join(shots, "desktop-paid-yearly-pricing.png"), clip: await p.evaluate(() => { const r = document.querySelector("[data-community-membership]").getBoundingClientRect(); return { x: r.left, y: r.top + scrollY, width: r.width, height: r.height } }) })
    }
    if (which === "free") expect(shape.stats.join() === "members,posts,active" && shape.classroom === 0, "no heartbeat known: members, posts and active members, no classroom", shape)
    await p.screenshot({ path: join(shots, `desktop-${which}.png`) })
    const before = await p.evaluate(() => Math.round(document.querySelector("[data-join-card-sticky]").getBoundingClientRect().top))
    await p.evaluate(() => window.scrollTo(0, 900))
    await sleep(200)
    const after = await p.evaluate(() => Math.round(document.querySelector("[data-join-card-sticky]").getBoundingClientRect().top))
    expect(Math.abs(after - (65 + 24)) <= 1 && before >= after, "the card sticks under the bar while the page scrolls", { before, after })
    if (which === "paid") await p.screenshot({ path: join(shots, "desktop-paid-scrolled.png") })
    if (which === "paid") await p.screenshot({ path: join(shots, "desktop-paid-full.png"), fullPage: true })
    expect((await sideways(p)) <= 0, "nothing scrolls sideways")
    expect(errors.length === 0, "no page errors", errors)
    await p.close()
  }

  /* ── 390: the bar, with and without the tab bar ─────────────────────── */
  for (const tabs of [true, false]) {
    for (const which of tabs ? CASES : ["paid", "free"]) {
      const tag = `phone-${which}${tabs ? "" : "-no-tabs"}`
      console.log(`\n390, ${which}, ${tabs ? "with" : "without"} the tab bar`)
      const { p, errors } = await open(`/community/clay-studio/about?case=${which}${tabs ? "&tabs=1" : ""}`, PHONE)
      await p.screenshot({ path: join(shots, `${tag}.png`) })
      const button = await p.evaluate(() => document.querySelector("[data-join-bar] [data-join-state]")?.textContent?.trim())
      /* Beside the price the bar's button says Join alone (the price is already there, at its left). */
      const barWords = ["paid", "free", "once"].includes(which) ? "Join" : BUTTON[which]
      expect(button === barWords, `the bar's button: "${barWords}"`, button)
      for (const where of ["top", "middle", "end"]) {
        await p.evaluate((w) => window.scrollTo(0, w === "top" ? 0 : w === "middle" ? document.documentElement.scrollHeight / 2 : document.documentElement.scrollHeight), where)
        await sleep(150)
        const c = await barCover(p)
        const foot = tabs ? Math.abs(c.rowBottom + 12 - (c.tabTop ?? -999)) <= 1 : Math.abs(c.rowBottom + 12 - c.vh) <= 1
        expect(c.bottom === c.vh && c.bg === "rgb(255, 255, 255)" && foot && c.leaks === 0, `${where}: one white surface to the foot, the button 12px above ${tabs ? "the tab bar" : "the foot"}, no page showing around it`, c)
        if (where === "end") {
          const room = await p.evaluate(() => ({ last: Math.round(document.querySelector("[data-footer-last]").getBoundingClientRect().bottom), barTop: Math.round(document.querySelector("[data-join-bar]").getBoundingClientRect().top) }))
          expect(room.last <= room.barTop, "the end of the page is above the bar", room)
          await p.screenshot({ path: join(shots, `${tag}-end.png`) })
        }
        if (where === "middle" && which === "paid") await p.screenshot({ path: join(shots, `${tag}-middle.png`) })
      }
      if (tabs) {
        const small = await smallTargets(p)
        expect(small.length === 0, "every control 40px or taller", small)
      }
      if (which === "paid" && tabs) await p.screenshot({ path: join(shots, "phone-paid-full.png"), fullPage: true })
      expect((await sideways(p)) <= 0, "nothing scrolls sideways")
      expect(errors.length === 0, "no page errors", errors)
      await p.close()
    }
  }

  /* ── THE JOIN, at 4x CPU ───────────────────────────────────────────── */
  const tapAt = async (p, sel) => {
    const box = await p.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } }, sel)
    const cdp = await p.createCDPSession()
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x, y: box.y, radiusX: 6, radiusY: 6, force: 1 }] })
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  }
  for (const [where, path] of [["about", "/community/night-runners/about?case=free&tabs=1"], ["home", "/community/night-runners?case=free&tabs=1"]]) {
    console.log(`\nJOIN at 4x CPU, from ${where}`)
    const { p, errors, joins } = await open(path, PHONE, { joinMs: 300 })
    await p.emulateCPUThrottling(4)
    await p.evaluate(() => {
      window.__frames = []
      window.__pressAt = null
      window.__clickAt = null
      document.addEventListener("pointerdown", () => { if (window.__pressAt === null) window.__pressAt = performance.now() }, { capture: true })
      document.addEventListener("click", () => { if (window.__clickAt === null) window.__clickAt = performance.now() }, { capture: true })
      const tick = () => {
        const b = document.querySelector("[data-join-bar] [data-join-phase]")
        window.__frames.push([performance.now(), b ? b.getAttribute("data-join-phase") : "gone"])
        if (window.__frames.length < 900) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    await tapAt(p, "[data-join-bar] [data-join-state]")
    await sleep(40)
    await tapAt(p, "[data-join-bar] [data-join-state]")
    await p.waitForSelector("[data-probe-inside]", { timeout: 6000 }).catch(() => null)
    await sleep(100)
    const r = await p.evaluate(() => {
      const press = window.__pressAt
      const frames = window.__frames.filter(([t]) => t >= press)
      const joining = frames.findIndex(([, ph]) => ph === "joining")
      const joined = frames.find(([, ph]) => ph === "joined")
      return {
        framesToJoining: joining,
        msToJoining: joining >= 0 ? Math.round(frames[joining][0] - press) : null,
        msToClick: Math.round(window.__clickAt - press),
        framesAround: frames.slice(0, 4).map(([t, ph]) => [Math.round(t - press), ph]),
        msToJoined: joined ? Math.round(joined[0] - press) : null,
        msToInside: window.__insideAt ? Math.round(window.__insideAt - press) : null,
        router: (window.__router || []).map(([k, h, , path]) => [k, h ?? null, path]),
        path: location.pathname,
        top: Math.round(scrollY),
      }
    })
    expect(r.framesToJoining >= 0 && r.framesToJoining <= 2, "the press shows Joining within two frames", { frames: r.framesToJoining, ms: r.msToJoining })
    expect(joins.length === 1, "one join request for two presses", joins.length)
    expect(r.msToJoined !== null, "then You're in", r.msToJoined)
    const refreshes = r.router.filter(([k]) => k === "refresh")
    const pushes = r.router.filter(([k]) => k === "push" || k === "link")
    expect(refreshes.length === 1 && pushes.length === 0 && refreshes[0][2] === "/community/night-runners" && r.path === "/community/night-runners", `one navigation: ${where === "about" ? "the address moved home with pushState, then" : "already home, so only"} one refresh, no push`, r.router)
    expect(r.msToInside !== null && r.msToInside < 2000, "inside in under 2s from the press (stubbed: 300ms join, 350ms server)", r.msToInside)
    console.log(`        press to click ${r.msToClick}ms, to Joining ${r.msToJoining}ms (${r.framesToJoining} frames), to You're in ${r.msToJoined}ms, to inside ${r.msToInside}ms`, JSON.stringify(r.framesAround))
    await p.screenshot({ path: join(shots, `join-${where}-inside.png`) })
    expect(errors.length === 0, "no page errors", errors)
    await p.close()
  }
  {
    console.log("\nJOIN that fails")
    const { p, errors, joins } = await open("/community/night-runners/about?case=free&tabs=1", PHONE, { joinMs: 200, joinFails: true })
    await tapAt(p, "[data-join-bar] [data-join-state]")
    await sleep(80)
    const mid = await p.evaluate(() => document.querySelector("[data-join-bar] [data-join-phase]")?.getAttribute("data-join-phase"))
    await sleep(500)
    const after = await p.evaluate(() => ({ phase: document.querySelector("[data-join-bar] [data-join-phase]")?.getAttribute("data-join-phase"), error: document.querySelector("[data-join-error]")?.textContent ?? null, router: (window.__router || []).length }))
    expect(mid === "joining" && after.phase === "idle" && /did not go through/.test(after.error || "") && after.router === 0 && joins.length === 1, "Joining, then the button back with its line, no navigation", { mid, ...after })
    await p.screenshot({ path: join(shots, "join-failed.png") })
    expect(errors.length === 0, "no page errors", errors)
    await p.close()
  }

  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
console.log(`\nScreenshots: ${shots}`)
if (broken) {
  console.log(`\n${broken} check(s) failed`)
  process.exit(1)
}
console.log("\nall checks passed")
