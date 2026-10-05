/**
 * ===========================================================================
 *  A COMMUNITY'S ABOUT PAGE, ROUND 11 (asks 22 to 27), MEASURED
 * ===========================================================================
 * The real components (scripts/render-community-about.tsx, ?case=video and
 * ?case=paid; scripts/render-community-about11-settings.tsx) at 1440x900
 * and on a 390x844 phone:
 *
 *   CHECKS      each tick of What members get in a filled 20px circle with
 *               a hairline and a 1px shadow
 *   FIGURES     one panel, the real figures from the fixture (members,
 *               active this week, posts in 30 days, courses), no icon line
 *   WHO RUNS IT View profile at the card's right and centred on the person
 *               at 1440; under the line at 390
 *   LEAVE       nothing under Open community; Your membership's Leave opens
 *               a confirm, Leave there answers on the next frames with
 *               Leaving, one POST however many presses, then a refresh
 *   SWIPE       a finger drag on the phone: the strip follows the finger
 *               frame by frame (within a few pixels), and on release it
 *               settles on the next picture, exactly one width along
 *   ARROWS      at 1440 the arrows show on hover, Previous hidden at the
 *               first picture; Next slides over several frames
 *   VIDEOS      a YouTube cover first: its still with a play button; a press
 *               makes the youtube-nocookie player, autoplay, in place; a
 *               Vimeo video the same with player.vimeo.com
 *   SETTINGS    the cover field takes a YouTube link (the video first in
 *               the gallery, marked as the cover) and refuses a bad link
 *               with a line; the gallery takes a Vimeo link
 *   OG STILL    the still a shared link of a YouTube cover is cut from:
 *               fetched for real when the network allows (sharp, 1200x630)
 *
 *   PROBE_CSS=source node scripts/check-community-about11.mjs
 *   Pictures go to SHOTS_DIR (a temp folder by default).
 */
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const css = await appCss(root)
const swiperCss = readFileSync(join(realpathSync(join(root, "node_modules/swiper")), "swiper.css"), "utf8")
const fonts = interFaces(root)
const stubs = join(root, ".community-about11-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-about11-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ORIGIN = "https://storelib.com"

/* The still YouTube would answer, drawn here: a 4:3 frame with the letterbox bars a real hqdefault has. */
const STILL = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 360" width="480" height="360"><rect width="480" height="360" fill="#000"/><rect y="45" width="480" height="270" fill="#4a6b8a"/><circle cx="330" cy="150" r="60" fill="#e9c46a"/><rect x="40" y="220" width="400" height="60" rx="8" fill="#2a3d4f"/></svg>`
const PLAYER = (name) => `<!doctype html><html><body style="margin:0;background:#111;color:#fff;font:16px sans-serif;display:grid;place-items:center;height:100vh">${name} player</body></html>`

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
  const bundle = async (entry, out) => {
    await build({
      entryPoints: [join(root, entry)],
      bundle: true,
      format: "iife",
      jsx: "automatic",
      define: { "process.env.NODE_ENV": '"production"' },
      alias: { "@": ".", "next/navigation": "./.community-about11-probe/navigation.js", "next/link": "./.community-about11-probe/link.jsx", "next/image": "./.community-about11-probe/image.jsx" },
      plugins: [{ name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })) } }],
      banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
      loader: { ".css": "empty" },
      outfile: join(stubs, out),
      logLevel: "error",
      absWorkingDir: root,
      nodePaths: [join(root, "node_modules")],
    })
    const js = readFileSync(join(stubs, out), "utf8")
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${fonts}${css}</style><style>${swiperCss}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
  }
  const aboutHtml = await bundle("scripts/render-community-about.tsx", "about.js")
  const settingsHtml = await bundle("scripts/render-community-about11-settings.tsx", "settings.js")

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--hide-scrollbars"] })
  const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
  const DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }

  async function open(path, vp, opts = {}) {
    const p = await browser.newPage()
    await p.setViewport(vp)

    const errors = []
    const posts = []
    const frames = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
    await p.setRequestInterception(true)
    p.on("request", async (r) => {
      const url = r.url()
      if (url.startsWith("https://www.youtube-nocookie.com/") || url.startsWith("https://player.vimeo.com/")) {
        frames.push(url)
        return void r.respond({ status: 200, contentType: "text/html", body: PLAYER(url.includes("vimeo") ? "Vimeo" : "YouTube") })
      }
      if (url.startsWith(`${ORIGIN}/_next/image`) || url.startsWith("https://i.ytimg.com/")) return void r.respond({ status: 200, contentType: "image/svg+xml", body: STILL })
      if (url.startsWith(`${ORIGIN}/api/`)) {
        const short = url.replace(ORIGIN, "")
        if (r.method() === "POST") {
          posts.push(short)
          await sleep(opts.postMs ?? 300)
          return void r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ state: "left" }) })
        }
        let body = {}
        if (short.startsWith("/api/me/places")) body = { signedIn: true, communitiesOn: true, isCreator: false, hasSellerAccess: false, communities: [] }
        else if (short.startsWith("/api/notifications")) body = { unread: 0, items: [], nextCursor: null }
        return void r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) })
      }
      if (url.startsWith(`${ORIGIN}/`)) return r.respond({ status: 200, contentType: "text/html", body: opts.html ?? aboutHtml })
      if (url.startsWith("data:")) return r.continue()
      return r.respond({ status: 204, body: "" })
    })
    await p.goto(`${ORIGIN}${path}`, { waitUntil: "load" })
    /*
      A MOUSE THAT CAN HOVER. Headless Chromium answers (hover: none) even at 1440 (and no flag or emulation here changes
      that), while Tailwind's hover styles live in @media (hover: hover). On a desktop page those rules are lifted out of
      their media block, which is what a real computer's browser applies.
    */
    if (!vp.hasTouch)
      await p.evaluate(() => {
        const lifted = []
        const full = (sel, parent) => (!parent ? sel : sel.includes("&") ? sel.replaceAll("&", `:is(${parent})`) : `:is(${parent}) ${sel}`)
        const walk = (rules, parent, inHover) => {
          for (const r of rules) {
            if (r instanceof CSSMediaRule) walk(r.cssRules, parent, inHover || /\(hover: ?hover\)/.test(r.conditionText))
            else if (r instanceof CSSStyleRule) {
              const sel = full(r.selectorText, parent)
              if (inHover && r.style.length) lifted.push(`${sel} { ${r.style.cssText} }`)
              if (r.cssRules?.length) walk(r.cssRules, sel, inHover)
            } else if (inHover && parent && r.style?.length) lifted.push(`${parent} { ${r.style.cssText} }`)
            else if (r.cssRules) walk(r.cssRules, parent, inHover)
          }
        }
        for (const sheet of document.styleSheets) walk(sheet.cssRules, null, false)
        const style = document.createElement("style")
        style.textContent = lifted.join("\n")
        document.head.appendChild(style)
        window.__lifted = lifted.length
      })
    await p.evaluate(() => document.fonts.ready)
    await sleep(500)
    return { p, errors, posts, frames }
  }
  const sideways = (p) => p.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  const clipOf = (p, sel, pad = 0) => p.evaluate((s, pad) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: Math.max(0, r.left - pad), y: r.top + scrollY - pad, width: r.width + pad * 2, height: r.height + pad * 2 } }, sel, pad)
  const wrapperX = (p) => p.evaluate(() => { const w = document.querySelector("[data-community-gallery] .swiper-wrapper"); return Math.round(new DOMMatrix(getComputedStyle(w).transform).m41) })

  /* ── 1440: checks, figures, who runs it, the card, arrows ───────────── */
  {
    console.log("\n1440, a member on a community with a YouTube cover")
    const { p, errors } = await open("/community/clay-studio/about?case=video", DESK)
    const look = await p.evaluate(() => {
      const dot = document.querySelector("[data-check-dot]")
      const ds = dot ? getComputedStyle(dot) : null
      const r = (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), b: Math.round(b.bottom), cy: Math.round(b.top + b.height / 2) } }
      return {
        dots: document.querySelectorAll("[data-benefit] [data-check-dot]").length,
        benefits: document.querySelectorAll("[data-benefit]").length,
        dot: ds ? { w: Math.round(dot.getBoundingClientRect().width), radius: ds.borderRadius, bg: ds.backgroundColor, shadow: ds.boxShadow } : null,
        figures: [...document.querySelectorAll("[data-community-stats] [data-stat]")].map((s) => `${s.getAttribute("data-stat")}=${s.querySelector("dd").textContent}`),
        panelShadow: getComputedStyle(document.querySelector("[data-community-stats]")).boxShadow,
        facts: [...document.querySelectorAll("[data-community-info] [data-info]")].map((e) => e.textContent.replace(/\s+/g, " ").trim()).join(" · "),
        factIcons: document.querySelectorAll("[data-community-info] svg").length,
        row: r("[data-creator-row]"),
        avatar: r("[data-creator-row] > :first-child"),
        button: r("[data-creator-page]"),
        sheet: r("[data-community-creator-card]"),
        cardLinks: [...document.querySelectorAll("[data-join-card] a, [data-join-card] button")].map((e) => e.textContent.trim()),
        membership: document.querySelector("[data-membership-row]")?.textContent ?? null,
        leaveButton: r("[data-membership-leave]"),
      }
    })
    expect(look.dots === look.benefits && look.benefits === 4, "every benefit has its check in a circle", look.dots)
    expect(look.dot && look.dot.w === 20 && look.dot.radius !== "0px" && look.dot.bg !== "rgba(0, 0, 0, 0)" && /rgba\(16, 24, 40, 0\.08\) 0px 0px 0px 1px/.test(look.dot.shadow) && /0px 1px 1px/.test(look.dot.shadow), "the check circle: 20px, filled, a hairline and a 1px shadow", look.dot)
    expect(look.figures.join() === "members=1,284,active=402,posts=186,courses=9", "the figures are the fixture's real ones: members, active this week, posts, courses", look.figures)
    expect(/1px/.test(look.panelShadow), "the figures sit in one panel with a hairline and a 1px shadow", look.panelShadow)
    expect(look.facts === "Public community · Since Mar 2025 · ByMara Lindqvist" && look.factIcons === 0, "the facts line: quiet words, no price, no icons", look.facts)
    const rightGap = look.sheet.r - look.button.r
    expect(rightGap >= 28 && rightGap <= 36 && Math.abs(look.button.cy - look.avatar.cy) <= 2, "View profile at the card's right (the sheet's padding from its edge), centred on the avatar", { rightGap, button: look.button.cy, avatar: look.avatar.cy })
    expect(!look.cardLinks.some((t) => /leave/i.test(t)), "nothing about leaving under Open community", look.cardLinks)
    expect(/You're a member of Clay Studio/.test(look.membership || "") && look.leaveButton && look.leaveButton.b - look.leaveButton.t >= 36, "Your membership: the row with Leave community", look.membership)
    await p.screenshot({ path: join(shots, "desktop-video-top.png") })
    await p.screenshot({ path: join(shots, "desktop-who-runs-it.png"), clip: await clipOf(p, "[data-community-creator-card]") })
    await p.screenshot({ path: join(shots, "desktop-benefits.png"), clip: await clipOf(p, '[aria-labelledby="community-benefits"]') })
    await p.screenshot({ path: join(shots, "desktop-membership.png"), clip: await clipOf(p, "[data-community-your-membership]") })

    /* ARROWS: hidden until the pointer is on the frame, Previous hidden at the first picture; Next slides over several frames. */
    const before = await p.evaluate(() => [...document.querySelectorAll("[data-gallery-arrow]")].map((a) => [a.getAttribute("data-gallery-arrow"), getComputedStyle(a).opacity, getComputedStyle(a).display]))
    const frame = await clipOf(p, "[data-community-gallery] [role=region]")
    await p.mouse.move(frame.x + frame.width / 2, frame.y - (await p.evaluate(() => scrollY)) + frame.height / 2)
    await sleep(350)
    const hover = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll("[data-gallery-arrow]")].map((a) => [a.getAttribute("data-gallery-arrow"), getComputedStyle(a).opacity])))
    expect(before.every(([, o, d]) => o === "0" && d === "flex") && hover.right === "1" && hover.left === "0", "arrows: shown on hover, Previous hidden at the first picture", { before, hover })
    await p.screenshot({ path: join(shots, "desktop-gallery-hover.png"), clip: await clipOf(p, "[data-community-gallery]", 8) })
    const slide = await p.evaluate(async () => {
      const w = document.querySelector("[data-community-gallery] .swiper-wrapper")
      const xs = []
      let run = true
      const tick = () => { if (!run) return; xs.push(Math.round(new DOMMatrix(getComputedStyle(w).transform).m41)); requestAnimationFrame(tick) }
      requestAnimationFrame(tick)
      document.querySelector('[data-gallery-arrow="right"]').click()
      await new Promise((r) => setTimeout(r, 600))
      run = false
      return { steps: new Set(xs).size, end: xs.at(-1), width: Math.round(document.querySelector("[data-community-gallery] .swiper-slide").getBoundingClientRect().width), index: document.querySelector("[data-gallery-index]").getAttribute("data-gallery-index") }
    })
    expect(slide.index === "1" && slide.end === -slide.width && slide.steps >= 6, "Next slides to the second picture over several frames", slide)
    const left = await p.evaluate(() => getComputedStyle(document.querySelector('[data-gallery-arrow="left"]')).opacity)
    expect(left === "1", "Previous shows once there is a picture before", left)

    /* VIDEOS: back to the YouTube cover, press play: the privacy player in place. */
    await p.click('[data-gallery-arrow="left"]')
    await sleep(500)
    await p.mouse.move(5, 5)
    await sleep(250)
    const poster = await p.evaluate(() => ({ play: document.querySelector('[data-gallery-play="youtube"]') !== null, poster: !!document.querySelector('[data-gallery-play="youtube"] [data-gallery-poster]')?.complete }))
    expect(poster.play && poster.poster, "the YouTube cover shows its still with a play button first", poster)
    await p.screenshot({ path: join(shots, "desktop-youtube-poster.png"), clip: await clipOf(p, "[data-community-gallery]", 8) })
    await p.click('[data-gallery-play="youtube"]')
    await sleep(600)
    const yt = await p.evaluate(() => { const f = document.querySelector('[data-gallery-embed="youtube"]'); return f ? { src: f.src, allow: f.getAttribute("allow"), inSlide: !!f.closest(".swiper-slide-active"), noSwipe: f.classList.contains("swiper-no-swiping") } : null })
    expect(yt && /^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?/.test(yt.src) && /autoplay=1/.test(yt.src) && /playsinline=1/.test(yt.src) && yt.inSlide && yt.noSwipe && /autoplay/.test(yt.allow), "pressed, it plays in place: youtube-nocookie, autoplay, inline, never swiped away", yt)
    await p.screenshot({ path: join(shots, "desktop-youtube-playing.png"), clip: await clipOf(p, "[data-community-gallery]", 8) })
    /* Vimeo: the third picture, from the strip. */
    await p.evaluate(() => document.querySelectorAll("[data-gallery-thumb]")[2].click())
    await sleep(500)
    const stopped = await p.evaluate(() => !document.querySelector('[data-gallery-embed="youtube"]'))
    await p.click('[data-gallery-play="vimeo"]')
    await sleep(600)
    const vm = await p.evaluate(() => document.querySelector('[data-gallery-embed="vimeo"]')?.src ?? null)
    expect(stopped && /^https:\/\/player\.vimeo\.com\/video\/76979871\?/.test(vm || "") && /dnt=1/.test(vm || "") && /autoplay=1/.test(vm || ""), "moving on stops YouTube; Vimeo plays in place, do not track", { stopped, vm })
    await p.screenshot({ path: join(shots, "desktop-vimeo-playing.png"), clip: await clipOf(p, "[data-community-gallery]", 8) })
    expect((await sideways(p)) <= 0, "nothing scrolls sideways")
    expect(errors.length === 0, "no page errors", errors)
    await p.close()
  }

  /* ── 1440 paid: the round 10 page still whole, the checks in the pricing card too ── */
  {
    console.log("\n1440, a visitor on a paid community")
    const { p, errors } = await open("/community/clay-studio/about?case=paid", DESK)
    const r = await p.evaluate(() => ({ pricingDots: document.querySelectorAll("[data-pricing-includes] [data-check-dot]").length, membership: !!document.querySelector("[data-community-your-membership]") }))
    expect(r.pricingDots === 4 && !r.membership, "the pricing card's ticks are the same circles; a visitor has no Your membership", r)
    await p.screenshot({ path: join(shots, "desktop-paid.png") })
    await p.screenshot({ path: join(shots, "desktop-paid-full.png"), fullPage: true })
    expect(errors.length === 0, "no page errors", errors)
    await p.close()
  }

  /* ── 390: swipe, who runs it, leave ─────────────────────────────────── */
  {
    console.log("\n390, the same member on a phone")
    const { p, errors, posts } = await open("/community/clay-studio/about?case=video&tabs=1", PHONE, { postMs: 400 })
    await p.screenshot({ path: join(shots, "phone-video-top.png") })
    expect(await p.evaluate(() => getComputedStyle(document.querySelector("[data-gallery-arrow]")).display) === "none", "no arrows on a touch screen")

    /* SWIPE: a real touch drag (CDP), the strip read every step. */
    const box = await p.evaluate(() => { const r = document.querySelector("[data-community-gallery] [role=region]").getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height } })
    const cdp = await p.createCDPSession()
    const y = box.y + box.h / 2
    const x0 = box.x + box.w * 0.8
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y }] })
    const track = []
    for (let i = 1; i <= 16; i++) {
      const x = x0 - i * 14
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] })
      await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())))
      track.push({ finger: Math.round(x - x0), strip: await wrapperX(p) })
    }
    /* Mid gesture, straight from the page's own capture (puppeteer's screenshot resizes the page, which ends a touch). */
    writeFileSync(join(shots, "phone-swipe-mid.png"), Buffer.from((await cdp.send("Page.captureScreenshot", { format: "png" })).data, "base64"))
    /*
      THE SETTLE. Headless Chromium paints no frame while it handles a synthetic touchEnd (the CDP call returns after the
      whole settle), so the frames cannot be sampled here; what the engine was told is read instead: on the release a
      slideTo with the gallery's speed (a transition, not a jump), and its end that long after.
    */
    await p.evaluate(() => {
      const sw = document.querySelector("[data-community-gallery] .swiper").swiper
      window.__swlog = []
      const orig = sw.setTransition.bind(sw)
      sw.setTransition = (ms, ...rest) => { window.__swlog.push([ms, performance.now()]); return orig(ms, ...rest) }
    })
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
    await sleep(900)
    const log = await p.evaluate(() => window.__swlog.map(([ms, t]) => [ms, Math.round(t)]))
    const go = log.findIndex(([ms]) => ms > 0)
    const settleMs = go >= 0 && log[go + 1] ? log[go + 1][1] - log[go][1] : null
    const settle = [await wrapperX(p)]
    const lag = Math.max(...track.slice(1).map((t) => Math.abs(t.finger - t.strip)))
    const width = Math.round(box.w)
    const index = await p.evaluate(() => document.querySelector("[data-gallery-index]").getAttribute("data-gallery-index"))
    expect(lag <= 3, "the picture follows the finger: at most 3px behind on every step", { lag, track: track.map((t) => `${t.finger}/${t.strip}`).join(" ") })
    expect(index === "1" && settle.at(-1) === -width && go >= 0 && log[go][0] >= 250 && settleMs >= 250, "released, it settles on the next picture, one width along, with the engine's transition (not a jump)", { index, end: settle.at(-1), width, transition: go >= 0 ? log[go][0] : null, settleMs, log })
    await p.screenshot({ path: join(shots, "phone-swipe-settled.png"), clip: await clipOf(p, "[data-community-gallery]", 6) })

    /* Who runs it: the button under the line on a phone. */
    const who = await p.evaluate(() => { const b = document.querySelector("[data-creator-page]").getBoundingClientRect(); const bio = document.querySelector("[data-creator-bio]").getBoundingClientRect(); return { buttonTop: Math.round(b.top), bioBottom: Math.round(bio.bottom), h: Math.round(b.height) } })
    expect(who.buttonTop >= who.bioBottom && who.h >= 40, "on a phone View profile sits under the line, 40px tall", who)
    await p.evaluate(() => document.querySelector("[data-community-creator-card]").scrollIntoView({ block: "center" }))
    await sleep(200)
    await p.screenshot({ path: join(shots, "phone-who-runs-it.png") })

    /* LEAVE: the row, the confirm, Leaving on the next frames, one POST for two presses, then a refresh. */
    await p.evaluate(() => document.querySelector("[data-membership-leave]").scrollIntoView({ block: "center" }))
    await sleep(200)
    await p.screenshot({ path: join(shots, "phone-membership.png") })
    await p.tap("[data-membership-leave]")
    await sleep(450)
    const dialog = await p.evaluate(() => ({ open: !!document.querySelector("[data-leave-dialog]"), title: document.querySelector("[data-leave-dialog] h2")?.textContent ?? null }))
    expect(dialog.open && /Leave Clay Studio\?/.test(dialog.title || ""), "Leave asks first", dialog)
    await p.screenshot({ path: join(shots, "phone-leave-confirm.png") })
    await p.evaluate(() => {
      window.__lf = []
      window.__pressAt = null
      document.addEventListener("pointerdown", () => { if (window.__pressAt === null) window.__pressAt = performance.now() }, { capture: true })
      const tick = () => { const b = document.querySelector("[data-leave-confirm]"); window.__lf.push([performance.now(), b ? b.textContent.trim() : "gone"]); if (window.__lf.length < 120) requestAnimationFrame(tick) }
      requestAnimationFrame(tick)
    })
    await p.tap("[data-leave-confirm]")
    await sleep(60)
    await p.tap("[data-leave-confirm]").catch(() => {})
    await sleep(700)
    const lf = await p.evaluate(() => ({ frames: window.__lf.filter(([t]) => t >= window.__pressAt).map(([t, w]) => [Math.round(t - window.__pressAt), w]), router: (window.__router || []).map(([k]) => k) }))
    const firstLeaving = lf.frames.findIndex(([, t]) => t === "Leaving")
    expect(firstLeaving >= 0 && firstLeaving <= 2 && posts.filter((x) => /\/leave$/.test(x)).length === 1 && lf.router.includes("refresh"), "Leaving within a few frames, one POST for two presses, then the page reads again", { firstLeaving, ms: lf.frames[firstLeaving]?.[0], posts, router: lf.router })
    expect(errors.length === 0, "no page errors", errors)
    expect((await sideways(p)) <= 0, "nothing scrolls sideways")
    await p.close()
  }

  /* ── The creator's fields ───────────────────────────────────────────── */
  for (const vp of [DESK, PHONE]) {
    const tag = vp === DESK ? "desktop" : "phone"
    console.log(`\nSettings, ${tag}: the cover and the gallery take a link`)
    const { p, errors } = await open("/app/community/x/settings?tab=page", vp, { html: settingsHtml })
    const state = () => p.evaluate(() => JSON.parse(document.querySelector("[data-probe-state]").textContent))
    await p.click("[data-cover-use-link]")
    await sleep(150)
    await p.type("[data-video-link] input", "https://evil.example/watch?v=dQw4w9WgXcQ")
    await p.click("[data-video-link-add]")
    await sleep(150)
    const refused = await p.evaluate(() => document.querySelector("[data-video-link-error]")?.textContent ?? null)
    expect(refused === "That is not a YouTube or Vimeo video link." && (await state()).gallery.length === 1, "a bad link is refused with a line, nothing added", refused)
    await p.screenshot({ path: join(shots, `settings-${tag}-refused.png`) })
    await p.evaluate(() => { const i = document.querySelector("[data-video-link] input"); i.select() })
    await p.keyboard.press("Backspace")
    await p.type("[data-video-link] input", "https://youtu.be/dQw4w9WgXcQ")
    await p.keyboard.press("Enter")
    await sleep(200)
    const s1 = await state()
    expect(s1.gallery[0]?.type === "embed" && s1.gallery[0].provider === "youtube" && s1.gallery[0].cover === true && s1.gallery[0].thumb === "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg" && s1.gallery.length === 2 && s1.coverUrl === null, "a YouTube link becomes the cover: first in the gallery, marked, its still kept", s1)
    expect(await p.evaluate(() => document.querySelector("[data-cover-video]")?.getAttribute("data-cover-video")) === "youtube", "the cover field shows the video")
    await p.click("[data-gallery-add-link]")
    await sleep(150)
    await p.type("[data-gallery] ~ [data-video-link] input, [data-gallery] [data-video-link] input", "https://vimeo.com/76979871")
    await p.keyboard.press("Enter")
    await sleep(200)
    const s2 = await state()
    expect(s2.gallery.length === 3 && s2.gallery[2].type === "embed" && s2.gallery[2].provider === "vimeo" && s2.gallery[0].cover === true, "the gallery takes a Vimeo link after the cover video", s2.gallery.map((g) => g.type + (g.provider ? `:${g.provider}` : "")))
    await p.screenshot({ path: join(shots, `settings-${tag}-added.png`), fullPage: true })
    expect((await sideways(p)) <= 0, "nothing scrolls sideways")
    expect(errors.length === 0, "no page errors", errors)
    await p.close()
  }

  await browser.close()

  /* ── The OG still: what a shared link of a YouTube cover is cut from ── */
  {
    console.log("\nThe still a shared link shows for a YouTube cover (network permitting)")
    const { default: sharp } = await import("sharp")
    const tryFetch = async (url) => {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
        return res.ok ? Buffer.from(await res.arrayBuffer()) : null
      } catch {
        return null
      }
    }
    /* The same order cover.jpg uses (seo.ts coverSources): the large still, then the stored one. */
    const sources = ["https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg", "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"]
    let used = null
    let bytes = null
    for (const s of sources) {
      bytes = await tryFetch(s)
      if (bytes) {
        used = s
        break
      }
    }
    if (!bytes) {
      console.log("        (no network to YouTube's picture host here: cut the probe's own 480x360 still instead)")
      bytes = await sharp(Buffer.from(STILL)).png().toBuffer()
      used = "probe still"
    }
    const out = await sharp(bytes, { failOn: "none" }).rotate().resize(1200, 630, { fit: "cover", position: "centre" }).flatten({ background: "#ffffff" }).jpeg({ quality: 84, mozjpeg: true }).toBuffer()
    const meta = await sharp(out).metadata()
    writeFileSync(join(shots, "og-youtube-cover.jpg"), out)
    expect(meta.width === 1200 && meta.height === 630 && meta.format === "jpeg", `the still cut to 1200x630 JPEG, from ${used}`, { width: meta.width, height: meta.height })
  }
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
console.log(`\nScreenshots: ${shots}`)
if (broken) {
  console.log(`\n${broken} check(s) failed`)
  process.exit(1)
}
console.log("\nall checks passed")
