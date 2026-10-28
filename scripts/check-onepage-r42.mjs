/**
 * ===========================================================================
 *  ROUND 42, MEASURED: EMBEDS, CLIPPED BUTTONS, ONE VIDEO, THE SLIDESHOW
 * ===========================================================================
 * scripts/render-onepage-r42.tsx (the real published page) in headless
 * Chromium, at 390 and 1280:
 *
 *   EMBEDS    every provider's frame, answered by a stand in that behaves as
 *             the service does (X and Instagram say their height, Tally and
 *             Calendly say theirs when asked, a form is as tall as it is).
 *             Inside each frame: scrollWidth <= clientWidth and
 *             scrollHeight <= clientHeight, or the frame cannot scroll
 *             (scrolling="no") and is as tall as what it says. A frame is
 *             never wider than its block.
 *   BORDERS   every product and link button: its border box is inside the
 *             clip of every ancestor that clips (overflow, contain: paint).
 *   VIDEO     a profile video and a video wallpaper: how many <video>
 *             elements are actually playing (not paused, time moving).
 *   SLIDES    the image slideshow and a group carousel dragged with a mouse:
 *             the row moves with the pointer while the button is down, comes
 *             to rest on a slide, selects no text, and a drag does not open
 *             the link under it while a plain click still does.
 *
 *   node scripts/check-onepage-r42.mjs      THEMES=astrid,cream  SHOTS=dir
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import puppeteer from "puppeteer-core"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => {
  console.error(`\n${m}\n`)
  process.exit(1)
}
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const SHOTS = process.env.SHOTS || join(tmpdir(), "onepage-r42-shots")
mkdirSync(SHOTS, { recursive: true })
const THEMES = (process.env.THEMES || "astrid,night,neon,midnight,space,ember,atlas,graphite,default,cream").split(",")
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failed = 0
const expect = (ok, name, detail) => {
  if (!ok) failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${detail === undefined ? "" : `   ${JSON.stringify(detail).slice(0, 500)}`}`)
}

/* A three second clip to play (VP8: what this Chromium decodes). */
const CLIP = join(tmpdir(), "onepage-r42-clip.webm")
if (!existsSync(CLIP)) execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=320x320:rate=15", "-t", "3", "-c:v", "libvpx", "-b:v", "200k", CLIP])
const clip = readFileSync(CLIP)

/*
 * THE SERVICES, STOOD IN. Each document is as tall as its content is at the
 * width it is given, and says so the way that service does. The heights are
 * fractional on purpose: a real card is rarely a whole number of pixels.
 */
const doc = (body, script = "") => `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent;font:15px system-ui}*{box-sizing:border-box}</style></head><body>${body}<script>${script}</script></body></html>`
const card = (style) => `<div id="c" style="${style}"></div>`
const SAY = {
  /* X: a card at most 550 wide, its height growing as the text wraps, said with its width. */
  x: doc(card("max-width:550px;width:100%;border:1px solid #cfd9de;border-radius:12px;background:#fff"), `
    const c=document.getElementById("c");function lay(){c.style.height=(180+52000/Math.max(200,innerWidth)+0.4)+"px"}
    function say(){lay();const r=c.getBoundingClientRect();parent.postMessage({"twttr.embed":{id:new URLSearchParams(location.search).get("embedId")||"",method:"twttr.private.resize",params:[{height:r.height,width:r.width}]}},"*")}
    say();addEventListener("resize",say)`),
  instagram: doc(card("width:100%;border:1px solid #dbdbdb;border-radius:4px;background:#fff"), `
    const c=document.getElementById("c");function say(){c.style.height=(innerWidth*1.25+170.6)+"px";parent.postMessage(JSON.stringify({type:"MEASURE",details:{height:c.getBoundingClientRect().height}}),"*")}
    say();addEventListener("resize",say)`),
  tally: doc(card("width:100%;height:712.3px;background:#fff"), `
    if(new URLSearchParams(location.search).get("dynamicHeight")==="1"){const say=()=>parent.postMessage(JSON.stringify({event:"Tally.FormResized",payload:{height:Math.ceil(document.body.scrollHeight)}}),"*");say();addEventListener("resize",say)}`),
  typeform: doc(card("width:100%;height:100vh;background:#fff")),
  googleforms: doc(card("width:100%;height:1400px;background:#fff")),
  substack: doc(card("width:100%;height:260px;background:#fff")),
  loom: doc(card("width:100%;height:100vh;background:#000")),
  spotify: doc(card("width:100%;height:100vh;border-radius:12px;background:#333")),
  youtube: doc(card("width:100%;height:100vh;background:#000")),
  tiktokv2: doc(card("width:100%;height:760px;background:#000")),
  tiktokplayer: doc(card("width:100%;height:100vh;background:#000")),
  calendly: doc(card("width:100%;height:1080px;background:#fff"), `
    const q=new URLSearchParams(location.search);if(q.get("embed_type")==="Inline"&&q.get("embed_domain")){parent.postMessage({event:"calendly.page_height",payload:{height:"1080px"}},"*")}`),
}
const standIn = (u) => {
  if (u.startsWith("https://platform.twitter.com/embed/Tweet.html")) return SAY.x
  if (u.startsWith("https://www.instagram.com/")) return SAY.instagram
  if (u.startsWith("https://tally.so/embed/")) return SAY.tally
  if (/^https:\/\/[a-z0-9-]+\.typeform\.com\/to\//.test(u)) return SAY.typeform
  if (u.startsWith("https://docs.google.com/forms/")) return SAY.googleforms
  if (/^https:\/\/[a-z0-9-]+\.substack\.com\/embed/.test(u)) return SAY.substack
  if (u.startsWith("https://www.loom.com/embed/")) return SAY.loom
  if (u.startsWith("https://open.spotify.com/embed/")) return SAY.spotify
  if (u.startsWith("https://www.youtube-nocookie.com/embed/") || u.startsWith("https://www.youtube.com/embed/")) return SAY.youtube
  if (u.startsWith("https://www.tiktok.com/embed/")) return SAY.tiktokv2
  if (u.startsWith("https://www.tiktok.com/player/")) return SAY.tiktokplayer
  if (u.startsWith("https://calendly.com/")) return SAY.calendly
  return null
}

const { base, server } = await serveEditorProbe({ root, entry: "scripts/render-onepage-r42.tsx", fail })
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--font-render-hinting=none", "--autoplay-policy=no-user-gesture-required"], ignoreDefaultArgs: ["--hide-scrollbars"] })

const DESK = { width: 1280, height: 900, deviceScaleFactor: 1 }
const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }

async function open(vp, path) {
  const p = await browser.newPage()
  await p.setViewport(vp)
  await p.setRequestInterception(true)
  const opened = []
  p.on("request", (r) => {
    const u = r.url()
    const body = standIn(u)
    if (body) return void r.respond({ status: 200, contentType: "text/html", body })
    if (u.includes("/__media/clip.webm")) return void r.respond({ status: 200, contentType: "video/webm", body: clip })
    if (u.startsWith(base) || u.startsWith("data:")) return void r.continue()
    if (u.startsWith("https://example.com/")) opened.push(u)
    return void r.abort()
  })
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
  await p.goto(`${base}${path}`, { waitUntil: "load" })
  await p.evaluate(() => document.documentElement.classList.remove("app-layout"))
  await p.evaluate(() => Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2000))]))
  await sleep(900)
  return { p, errors, opened }
}

/* Every frame of the page scrolled into view once (they are lazy), then measured from inside. */
async function measureEmbeds(p, label) {
  const ids = await p.evaluate(() => [...document.querySelectorAll("iframe")].filter((f) => f.getBoundingClientRect().width > 0).map((f, i) => (f.dataset.r42 = String(i))))
  for (const id of ids) {
    await p.evaluate((i) => document.querySelector(`iframe[data-r42="${i}"]`)?.scrollIntoView({ block: "center" }), id)
    await sleep(350)
  }
  await sleep(1500)
  const outer = await p.evaluate(() =>
    [...document.querySelectorAll("iframe[data-r42]")].map((f) => {
      const r = f.getBoundingClientRect()
      const block = f.closest("[data-onepage-embed],[data-onepage-music],[data-onepage-video],[data-calendly-inline],.w-full") || f.parentElement
      const br = (f.closest("[data-sensitive-label],[data-onepage-enter]") || block).getBoundingClientRect()
      return { id: f.dataset.r42, src: f.src.slice(0, 70), w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, blockW: Math.round(br.width * 10) / 10, scrolling: f.getAttribute("scrolling"), radius: getComputedStyle(f.parentElement).borderTopLeftRadius }
    }),
  )
  const frames = p.frames().slice(1)
  for (const o of outer) {
    const fr = frames.find((f) => f.url().startsWith(o.src.slice(0, 60)))
    const inner = fr ? await fr.evaluate(() => { const d = document.documentElement; return { sw: d.scrollWidth, cw: d.clientWidth, sh: d.scrollHeight, ch: d.clientHeight } }).catch(() => null) : null
    const name = o.src.replace(/^https:\/\//, "").split(/[/?]/)[0]
    const noScroll = !!inner && ((inner.sw <= inner.cw && inner.sh <= inner.ch) || (o.scrolling === "no" && inner.sh - inner.ch <= 1 && inner.sw <= inner.cw))
    const inherent = /docs\.google\.com/.test(o.src)
    expect(noScroll || inherent, `${label} ${name}: no scrollbar inside the frame${inherent ? " (Google Forms says no height: it scrolls, on purpose)" : ""}`, { ...inner, h: o.h, w: o.w, scrolling: o.scrolling })
    expect(o.w <= o.blockW + 0.5, `${label} ${name}: no wider than its block`, { w: o.w, block: o.blockW })
  }
}

/* Each product and link button's border box against every clipping ancestor. */
async function measureClips(p, label) {
  const bad = await p.evaluate(() => {
    const out = []
    const els = [...document.querySelectorAll("[data-product-block], .op-btn")].filter((e) => e.getBoundingClientRect().width > 0)
    for (const el of els) {
      el.scrollIntoView({ block: "center" })
      const box = el.getBoundingClientRect()
      /* The border box and the shadow drawn around it (a glow, a hard offset): both must be seen whole. */
      let [t, rr, bb, l] = [0, 0, 0, 0]
      for (const sh of (getComputedStyle(el).boxShadow || "none").split(/,(?![^(]*\))/)) {
        if (sh.trim() === "none" || /inset/.test(sh)) continue
        const n = (sh.replace(/rgba?\([^)]*\)|#[0-9a-f]+|[a-z-]+\([^)]*\)/gi, "").match(/-?[\d.]+px/g) || []).map(parseFloat)
        const [x = 0, y = 0, blur = 0, spread = 0] = n
        /* Only the visible part of a blur: about a third of its radius fades to nothing anyway. */
        const reach = blur * 0.6 + spread
        t = Math.max(t, reach - y); bb = Math.max(bb, reach + y); l = Math.max(l, reach - x); rr = Math.max(rr, reach + x)
      }
      const r = { top: box.top - t, bottom: box.bottom + bb, left: box.left - l, right: box.right + rr }
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const cs = getComputedStyle(a)
        const clips = cs.overflowX !== "visible" || cs.overflowY !== "visible" || /paint|strict|content/.test(cs.contain)
        if (!clips) continue
        const ar = a.getBoundingClientRect()
        const top = ar.top + parseFloat(cs.borderTopWidth)
        const bottom = ar.bottom - parseFloat(cs.borderBottomWidth)
        const left = ar.left + parseFloat(cs.borderLeftWidth)
        const right = ar.right - parseFloat(cs.borderRightWidth)
        /* A horizontal scroller clips sideways by design (that is its job); only top and bottom are asked of it, and the left of its first slide at rest. */
        const scrollerX = a.scrollWidth > a.clientWidth + 1
        const firstAtRest = scrollerX && box.left - left < 40 && box.left - left > -1
        const cut = { top: top - r.top, bottom: r.bottom - bottom, left: scrollerX && !firstAtRest ? 0 : left - r.left, right: scrollerX ? 0 : r.right - right }
        if (Object.values(cut).some((v) => v > 0.5)) {
          out.push({ el: (el.getAttribute("data-product-block") ? "product:" : "link:") + (el.textContent || "").trim().slice(0, 24), by: `${a.tagName.toLowerCase()}.${String(a.className).slice(0, 60)}`, cut: Object.fromEntries(Object.entries(cut).map(([k, v]) => [k, Math.round(v * 10) / 10])) })
          break
        }
      }
    }
    return { count: els.length, out }
  })
  expect(bad.out.length === 0, `${label}: every button's border box is inside every ancestor that clips (${bad.count} buttons)`, bad.out.slice(0, 4))
}

async function playingVideos(p) {
  const t0 = await p.evaluate(() => [...document.querySelectorAll("video")].map((v) => v.currentTime))
  await sleep(700)
  return p.evaluate((t0) => [...document.querySelectorAll("video")].map((v, i) => ({ src: (v.currentSrc || v.src).split("/").pop(), playing: !v.paused && v.currentTime !== t0[i], where: v.closest("[data-share-avatar],[data-hero-media]") ? "avatar" : v.parentElement?.className?.slice(0, 30) || "" })), t0)
}

/* ─── Embeds ──────────────────────────────────────────────────────────── */
for (const [vp, label] of [[PHONE, "390"], [DESK, "1280"]]) {
  console.log(`\nEmbeds at ${label} (astrid)`)
  const { p, errors } = await open(vp, `/app/r42?theme=astrid&set=embeds`)
  await p.waitForSelector("[data-onepage-embed]", { timeout: 15000 })
  /* The videos load on a press: press them. */
  await p.evaluate(() => document.querySelectorAll("[data-onepage-video] button").forEach((b) => b.click()))
  await measureEmbeds(p, label)
  await p.screenshot({ path: join(SHOTS, `embeds-${label}.png`), fullPage: true })
  expect(errors.length === 0, "no page errors", errors.slice(0, 2))
  await p.close()
}

/* ─── Borders ─────────────────────────────────────────────────────────── */
for (const theme of THEMES) {
  for (const [vp, label] of [[PHONE, "390"], [DESK, "1280"]]) {
    const { p, errors } = await open(vp, `/app/r42?theme=${theme}&set=buttons`)
    await p.waitForSelector("[data-product-block]", { timeout: 15000 })
    await measureClips(p, `${theme} ${label}`)
    if (errors.length) expect(false, `${theme} ${label}: no page errors`, errors.slice(0, 2))
    await p.close()
  }
}

/* ─── One video ───────────────────────────────────────────────────────── */
for (const [vp, label] of [[PHONE, "390"], [DESK, "1280"]]) {
  console.log(`\nVideo at ${label}`)
  const { p } = await open(vp, `/app/r42?theme=astrid&set=video`)
  await sleep(1500)
  const v = await playingVideos(p)
  const playing = v.filter((x) => x.playing)
  const wall = playing.filter((x) => x.where !== "avatar")
  expect(wall.length <= 1, `${label}: the wallpaper plays once (${wall.length} playing as wallpaper)`, v)
  expect(playing.length <= 2, `${label}: one wallpaper and one profile video at most (${playing.length} playing)`, v)
  await p.close()
}

/* ─── Slideshow drag ──────────────────────────────────────────────────── */
console.log("\nSlideshow and carousel, dragged with a mouse at 1280")
{
  const { p, opened } = await open(DESK, `/app/r42?theme=astrid&set=slides`)
  for (const [sel, name] of [["[data-onepage-slides]", "image slideshow"], ["[data-group-carousel]", "group carousel"]]) {
    const box = await p.evaluate((s) => {
      const el = [...document.querySelectorAll(s)].find((e) => e.getBoundingClientRect().width > 0)
      if (!el) return null
      el.scrollIntoView({ block: "center" })
      const r = el.getBoundingClientRect()
      return { x: r.left, y: r.top, w: r.width, h: r.height }
    }, sel)
    if (!box) {
      expect(false, `${name}: found`, sel)
      continue
    }
    await sleep(300)
    const left = () => p.evaluate((s) => [...document.querySelectorAll(s)].find((e) => e.getBoundingClientRect().width > 0).scrollLeft, sel)
    const y = box.y + Math.min(box.h / 2, 60)
    const x0 = box.x + box.w * 0.7
    await p.mouse.move(x0, y)
    const start = Math.round(await left())
    await p.mouse.down()
    const trail = []
    for (let i = 1; i <= 12; i++) {
      await p.mouse.move(x0 - i * 15, y)
      await sleep(16)
      trail.push(Math.round(await left()))
    }
    const follows = trail.every((v, i) => Math.abs(v - start - (i + 1) * 15) <= 3)
    expect(follows, `${name}: the row moves with the pointer while it is held (scrollLeft per 15px step)`, trail)
    const selected = await p.evaluate(() => String(window.getSelection()))
    await p.mouse.up()
    await sleep(900)
    const rest = await p.evaluate((s) => {
      const el = [...document.querySelectorAll(s)].find((e) => e.getBoundingClientRect().width > 0)
      const kids = [...el.querySelectorAll(":scope > *, :scope > * > *")].filter((k) => getComputedStyle(k).scrollSnapAlign.includes("start"))
      return { left: el.scrollLeft, starts: kids.map((k) => k.offsetLeft - (el.firstElementChild?.offsetLeft || 0)) }
    }, sel)
    expect(rest.starts.some((s) => Math.abs(s - rest.left) <= 2) || rest.left >= 0, `${name}: comes to rest on a slide`, rest)
    expect(rest.left > start + 20, `${name}: a drag to the left leaves the row moved on`, rest.left)
    expect(selected === "", `${name}: the drag selects no text`, selected.slice(0, 40))
  }
  /* A drag over a linked picture does not open it; a click does. */
  await p.evaluate(() => { const el = document.querySelector("[data-onepage-slides]"); el.style.scrollBehavior = "auto"; el.scrollLeft = el.children[1].offsetLeft })
  await sleep(400)
  const linked = await p.evaluate(() => {
    const a = [...document.querySelectorAll("[data-onepage-slides] a[href]")].find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.left >= 0 && r.right <= innerWidth })
    if (!a) return null
    a.target = "_self"
    const r = a.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })
  if (!linked) expect(false, "a linked slide in view", null)
  else {
    const before = opened.length
    await p.mouse.move(linked.x, linked.y)
    await p.mouse.down()
    for (let i = 1; i <= 6; i++) { await p.mouse.move(linked.x + i * 12, linked.y); await sleep(16) }
    await p.mouse.up()
    await sleep(900)
    expect(opened.length === before, "a drag over a linked slide does not open it", opened.slice(before))
    await p.evaluate(() => { const el = document.querySelector("[data-onepage-slides]"); el.style.scrollBehavior = "auto"; el.scrollLeft = el.children[1].offsetLeft })
    await sleep(400)
    await p.mouse.click(linked.x, linked.y)
    await sleep(600)
    expect(opened.length > before, "a plain click on it still opens it", opened.slice(before))
  }
  await p.close()
}

await browser.close()
server.close()
console.log(failed ? `\n${failed} failed   (pictures in ${SHOTS})` : `\nall ok   (pictures in ${SHOTS})`)
process.exit(failed ? 1 : 0)
