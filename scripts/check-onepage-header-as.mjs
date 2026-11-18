/**
 * ROUND AS: THE OnePage SHELL AS THE PAGE SCROLLS, MEASURED FRAME BY FRAME.
 *
 * The real PublicOnePage (scripts/render-onepage-header-as.tsx) at 390x844 with touch
 * and at 1440x900 with a mouse, and the real editor preview frame at 390.
 *
 *   bar        the page scrolled down 6px a frame through the profile and back up: the
 *              bar's opacity only rises going down and only falls going up, by no more
 *              than a step's share a frame (no jump), 0 at the top and 1 past the name;
 *              the verified badge is in it; on a phone it spans the width, on a computer
 *              it sits inside the card (no side cut off) with its corner concentric.
 *   avatar     back up to the top, every frame: the profile picture's place in the page,
 *              its opacity, its node, and how many times React committed (classic, cover,
 *              hero; the hero's dark layer and lag only ever falling).
 *   corners    Share and Subscribe: hidden after travel down, back after travel up, in
 *              one transition per layer with the opacity only rising, no layout shift,
 *              no ancestor fading over the frosted button; a wobble never flips them; on
 *              a phone each sits on the bar's row.
 *   fade       the fade layout's picture (8/9 on a phone, 5/4 on a computer, round R3;
 *              eased mask, the name over its melted part) and
 *              the own cover's fade, on by default and off with cover_fade false.
 *   rows       every sideways row reaches the column's edge (the screen, or the card),
 *              its first card in line with the column, room above and below, nothing
 *              painted of its own.
 *   width      the computer's card is 550px.
 *
 *   ROOT=<checkout> CHROMIUM=... node scripts/check-onepage-header-as.mjs
 *   REPORT=1 prints without failing. SHOTS=<dir> saves screenshots. ONLY=bar,rows picks.
 */
import puppeteer from "puppeteer-core"
import { existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"

const root = process.env.ROOT || process.cwd()
const { serveEditorProbe } = await import(join(root, "scripts/onepage-probe-server.mjs"))
const report = !!process.env.REPORT
const shots = process.env.SHOTS || null
const only = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null
if (shots) mkdirSync(shots, { recursive: true })
const chromium = process.env.CHROMIUM || ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium"].find((p) => existsSync(p))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const failures = []
const check = (ok, message) => {
  if (!ok) failures.push(message)
  console.log(`${ok ? "ok  " : "FAIL"} ${message}`)
}
const want = (k) => !only || only.has(k)

const SHELF = ["Film presets", "Studio guide", "Print pack", "Brush set"].map((title, i) => ({ id: `s${i}`, kind: "digital", title, href: `/p/${i}`, image: i % 2 ? "/images/onepage-themes/fusion.webp" : "/images/onepage-themes/nature.webp", price_cents: 900 * (i + 1) }))
const api = (req, body) => {
  if (req.url.startsWith("/api/onepage/blocks-live")) {
    const blocks = JSON.parse(body || "{}").blocks || []
    return { body: { blocks: blocks.map((b) => ({ ...b, data: { ...b.data, items: SHELF } })) } }
  }
  return null
}

const { base, server } = await serveEditorProbe({ root, entry: "scripts/render-onepage-header-as.tsx", api })
const browser = await puppeteer.launch({ executablePath: chromium, args: ["--no-sandbox", "--disable-gpu"] })
const vp390 = { width: 390, height: 844 }
const vp1440 = { width: 1440, height: 900 }

async function open(viewport, query, { touch = viewport.width < 768 } = {}) {
  const page = await browser.newPage()
  page.on("pageerror", (e) => console.log("   pageerror", String(e).slice(0, 200)))
  await page.setViewport({ ...viewport, deviceScaleFactor: 1, isMobile: touch, hasTouch: touch })
  await page.setRequestInterception(true)
  page.on("request", (r) => {
    const u = new URL(r.url())
    /* The cover's address must be https (lib/onepage/theme-layout coverImageOf): served from the probe's own folder. */
    if (u.hostname === "probe.storelib.test") return void r.continue({ url: base + u.pathname })
    if (u.hostname !== "127.0.0.1") return void r.respond({ status: 404, body: "" })
    void r.continue()
  })
  await page.goto(`${base}/app?${query}`, { waitUntil: "domcontentloaded" })
  await page.waitForSelector("[data-op-block]")
  await sleep(1400)
  return page
}

/* In the page: scroll through `ys`, one position a frame, and read `sample` after each frame has drawn. */
const STEP = `async (ys, sampleSrc) => {
  const sample = new Function("return (" + sampleSrc + ")()")
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()))
  const out = []
  for (const y of ys) {
    window.scrollTo(0, y)
    await frame()
    await frame()
    out.push({ y: Math.round(window.scrollY), ...sample() })
  }
  return out
}`
const run = (target, ys, sample) => target.evaluate(`(${STEP})(${JSON.stringify(ys)}, ${JSON.stringify(String(sample))})`)
const range = (from, to, step) => {
  const out = []
  if (from <= to) for (let y = from; y <= to; y += step) out.push(y)
  else for (let y = from; y >= to; y -= step) out.push(y)
  return out
}

const BAR_SAMPLE = () => {
  const bar = document.querySelector("[data-op-topbar]")
  const vis = (s) => [...document.querySelectorAll(s)].find((e) => e.getClientRects().length)
  const name = vis("[data-op-bar-anchor]")
  const foot = bar.getBoundingClientRect().bottom
  /* What lib/onepage/feel barMorph says for where the name is on this frame (80px of travel). */
  const nb = name ? name.getBoundingClientRect().bottom : null
  const want = nb === null ? null : Math.round(Math.min(1, Math.max(0, (foot + 80 - nb) / 80)) * 1000) / 1000
  return { o: Math.round(parseFloat(getComputedStyle(bar).opacity) * 1000) / 1000, want, css: bar.hasAttribute("data-op-topbar-css"), state: bar.getAttribute("data-op-topbar"), name: nb === null ? null : Math.round(nb) }
}

try {
  /* ── bar ── */
  if (want("bar")) {
    console.log("\n── bar")
    for (const [label, vp] of [["390", vp390], ["1440", vp1440]]) {
      for (const layout of ["classic", "cover", "hero"]) {
        const page = await open(vp, `layout=${layout}&verified`)
        const anchorDoc = await page.evaluate(() => { const n = [...document.querySelectorAll("[data-op-bar-anchor]")].find((e) => e.getClientRects().length); return Math.round(n.getBoundingClientRect().bottom + scrollY) })
        const end = anchorDoc + 40
        const down = await run(page, range(0, end, 6), BAR_SAMPLE)
        const up = await run(page, range(end, 0, 6), BAR_SAMPLE)
        const rises = down.every((s, i) => i === 0 || s.o >= down[i - 1].o - 0.01)
        const falls = up.every((s, i) => i === 0 || s.o <= up[i - 1].o + 0.01)
        const jump = Math.max(...[...down, ...up].map((s, i, a) => (i ? Math.abs(s.o - a[i - 1].o) : 0)))
        const formed = down.filter((s) => s.o > 0.02 && s.o < 0.98).length
        check(down[0].o === 0 && down.at(-1).o > 0.98 && down.at(-1).state === "shown", `${label} ${layout}: the bar is nothing at the top and whole past the name (${down[0].o} -> ${down.at(-1).o}, ${down.at(-1).state})`)
        check(rises && falls, `${label} ${layout}: its opacity only rises going down and only falls going up (${down.length} + ${up.length} frames)`)
        check(jump <= 0.2 && formed >= 6, `${label} ${layout}: it forms over ${formed} frames, at most ${jump} a frame (no jump)`)
        check(up.at(-1).o === 0 && up.at(-1).state === "hidden", `${label} ${layout}: back at the top it is gone (${up.at(-1).o})`)
        /* Round R3: drawn from the name's own timeline, so on every frame it is exactly where the scroll puts it, no frame behind. */
        const lag = Math.max(...[...down, ...up].map((s) => (s.want === null ? 1 : Math.abs(s.o - s.want))))
        check(down.every((s) => s.css) && lag <= 0.02, `${label} ${layout}: drawn by the compositor from the name's place, on every frame within ${Math.round(lag * 1000) / 1000} of where the scroll puts it`)
        await page.evaluate((y) => scrollTo(0, y), end + 200)
        await sleep(400)
        const geo = await page.evaluate(() => {
          const bar = document.querySelector("[data-op-topbar]")
          const r = bar.getBoundingClientRect()
          const card = document.querySelector("[data-onepage-drag-scope].rounded-\\[40px\\]")
          const c = card && card.getClientRects().length ? card.getBoundingClientRect() : null
          const cs = getComputedStyle(bar)
          const after = getComputedStyle(bar, "::after")
          return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), height: Math.round(r.height), radius: cs.borderTopLeftRadius, foot: cs.borderBottomLeftRadius, shadow: cs.boxShadow, fade: after.backgroundImage.startsWith("linear-gradient") ? Math.round(parseFloat(after.height)) : 0, clip: card ? getComputedStyle(card).clipPath : null, cardTop: c ? Math.round(c.top) : null, card: c ? { left: Math.round(c.left), right: Math.round(c.right), width: Math.round(c.width) } : null, badge: !!bar.querySelector("[data-op-topbar-badge] svg"), name: bar.querySelector("[data-op-topbar-name]")?.textContent, face: !!bar.querySelector("[data-op-topbar-face]") }
        })
        console.log(`   ${label} ${layout} bar ${JSON.stringify(geo)}`)
        check(geo.badge && geo.name === "Ana Studio" && geo.face, `${label} ${layout}: the bar carries the picture, the name and the verified badge`)
        if (label === "390") check(geo.left === 0 && geo.right === 390 && geo.top === 0 && geo.height === 60, `390 ${layout}: the bar spans the phone, 60px (${geo.left}..${geo.right}, ${geo.height})`)
        else {
          /* Round R3: the card's own top, not a pill floating in it. */
          check(geo.card && geo.left === geo.card.left && geo.right === geo.card.right && geo.top === 0 && geo.height === 56 && geo.radius === "40px" && geo.foot === "0px", `1440 ${layout}: the bar is the ${geo.card?.width}px card's own top, edge to edge, its 40px corners at the top of the window (${geo.left}..${geo.right} in ${geo.card?.left}..${geo.card?.right}, top ${geo.top}, ${geo.radius})`)
          /* The card is cut at the top of the window with the same corners, so the wallpaper, not the content, shows round the bar's. */
          const m = /inset\(([\d.]+)px/.exec(geo.clip || "")
          check(m && Math.abs(parseFloat(m[1]) + geo.cardTop) <= 1 && /40px/.test(geo.clip), `1440 ${layout}: the card keeps its 40px corners at the top of the window (${geo.clip}, card top ${geo.cardTop})`)
        }
        check(geo.shadow === "none" && geo.fade >= 10, `${label} ${layout}: no ring and no shadow, a ${geo.fade}px fade of the page's colour at its foot`)
        if (shots) await page.screenshot({ path: join(shots, `bar-${label}-${layout}.png`) })
        await page.close()
      }
    }
  }

  /* ── avatar on the way back to the top ── */
  if (want("avatar")) {
    console.log("\n── avatar")
    for (const [label, vp] of [["390", vp390], ["1440", vp1440]]) {
      for (const layout of ["classic", "cover", "hero"]) {
        const page = await open(vp, `layout=${layout}`)
        await page.evaluate(() => {
          const vis = (s) => [...document.querySelectorAll(s)].find((e) => e.getClientRects().length)
          const img = vis("[data-page-avatar] img") || vis("[data-hero-header] img")
          img.dataset.probeNode = "1"
          window.__probeImg = img
          window.__shifts = 0
          new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__shifts += e.value }).observe({ type: "layout-shift", buffered: false })
        })
        await run(page, range(0, 700, 20), () => ({}))
        await sleep(300)
        const commits0 = await page.evaluate(() => window.__commits)
        const up = await run(page, range(700, 0, 5), () => {
          const img = window.__probeImg
          const box = img.closest("[data-page-avatar]") || img.closest("[data-hero-header]")
          const r = box.getBoundingClientRect()
          const hero = img.closest("[data-hero-header]")
          return {
            doc: Math.round((r.top + scrollY) * 10) / 10,
            o: Math.round(parseFloat(getComputedStyle(img).opacity) * 100) / 100,
            same: img.isConnected && img.dataset.probeNode === "1",
            loaded: img.complete && img.naturalWidth > 0,
            dim: hero ? Math.round(parseFloat(getComputedStyle(hero.querySelector("[data-hero-scrim]")).opacity) * 1000) / 1000 : null,
          }
        })
        const commits = (await page.evaluate(() => window.__commits)) - commits0
        const shifts = await page.evaluate(() => window.__shifts)
        const docs = up.map((s) => s.doc)
        const still = Math.max(...docs) - Math.min(...docs)
        check(still <= 0.5, `${label} ${layout}: the picture holds its place in the page all the way up (moved ${still}px over ${up.length} frames)`)
        check(up.every((s) => s.o === 1 && s.same && s.loaded), `${label} ${layout}: the same picture, loaded and fully opaque on every frame (min ${Math.min(...up.map((s) => s.o))})`)
        check(commits <= 6 && shifts === 0, `${label} ${layout}: ${commits} React commits and a layout shift of ${shifts} on the way up`)
        if (layout === "hero") {
          const dims = up.map((s) => s.dim)
          check(dims.every((d, i) => i === 0 || d <= dims[i - 1] + 0.005) && dims.at(-1) <= 0.06, `${label} hero: the dark layer only lifts on the way up (${dims[0]} -> ${dims.at(-1)}), no bump`)
        }
        await page.close()
      }
    }
  }

  /* ── corners ── */
  if (want("corners")) {
    console.log("\n── corners")
    for (const [label, vp] of [["390", vp390], ["1440", vp1440]]) {
      for (const layout of ["classic", "hero"]) {
        const page = await open(vp, `layout=${layout}`)
        /* Positions inside the page's own length, so nothing is held at its end. */
        const M = await page.evaluate(() => Math.min(900, document.documentElement.scrollHeight - innerHeight - 120))
        const at0 = await page.evaluate(() => [...document.querySelectorAll("[data-onepage-share-button], [data-onepage-bell]")].map((b) => { const r = b.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top) } }))
        await run(page, range(0, M, 12), () => ({}))
        await sleep(400)
        const hidden = await page.evaluate(() => [...document.querySelectorAll("[data-onepage-share-button], [data-onepage-bell]")].map((b) => parseFloat(getComputedStyle(b).opacity)))
        check(hidden.length === 2 && hidden.every((o) => o === 0), `${label} ${layout}: down the page both corner buttons are gone (${hidden.join(", ")})`)
        await page.evaluate(() => {
          window.__runs = []
          window.__shifts = 0
          new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__shifts += e.value }).observe({ type: "layout-shift", buffered: false })
          for (const b of document.querySelectorAll("[data-onepage-share-button], [data-onepage-bell]")) {
            for (const el of [b, b.closest(".fixed")]) el.addEventListener("transitionrun", (e) => { if (e.target === el) window.__runs.push(`${b.hasAttribute("data-onepage-bell") ? "bell" : "share"}:${e.propertyName}`) })
          }
        })
        /* A wobble: 10px up and down, many times. Nothing may move. */
        await run(page, [M - 10, M - 20, M - 10, M - 20, M - 10, M - 16, M - 10, M - 22, M - 10], () => ({}))
        await sleep(300)
        const wobble = await page.evaluate(() => window.__runs.length)
        check(wobble === 0, `${label} ${layout}: a 10px wobble starts no transition (${wobble})`)
        const show = await run(page, range(M - 10, M - 80, 3), () => {
          const b = document.querySelector("[data-onepage-share-button]")
          let n = b.parentElement
          let fadingAncestor = false
          for (; n && n !== document.body; n = n.parentElement) {
            const cs = getComputedStyle(n)
            if (parseFloat(cs.opacity) < 1 || cs.filter !== "none") fadingAncestor = true
          }
          return { o: Math.round(parseFloat(getComputedStyle(b).opacity) * 1000) / 1000, fadingAncestor }
        })
        await sleep(400)
        const runs = await page.evaluate(() => window.__runs)
        const opac = show.map((s) => s.o)
        check(opac.every((o, i) => i === 0 || o >= opac[i - 1] - 0.001) && opac.at(-1) > 0.5, `${label} ${layout}: scrolling up brings them back with the opacity only rising (${opac[0]} -> ${opac.at(-1)}, ${opac.length} frames)`)
        const want2 = ["share:opacity", "share:translate", "bell:opacity", "bell:translate"]
        check(want2.every((w) => runs.filter((r) => r === w).length === 1) && runs.length === 4, `${label} ${layout}: one transition per layer (${runs.join(", ")})`)
        check(show.every((s) => !s.fadingAncestor), `${label} ${layout}: nothing above the frosted button fades or filters while it comes in`)
        await run(page, range(M - 80, 0, 40), () => ({}))
        await sleep(500)
        const shifts = await page.evaluate(() => window.__shifts)
        const back = await page.evaluate(() => [...document.querySelectorAll("[data-onepage-share-button], [data-onepage-bell]")].map((b) => { const r = b.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), o: parseFloat(getComputedStyle(b).opacity) } }))
        check(shifts === 0 && back.every((b, i) => b.x === at0[i].x && b.y === at0[i].y && b.o === 1), `${label} ${layout}: back at the top they are where they began, whole, with no layout shift (${JSON.stringify(back)}, shift ${shifts})`)
        if (label === "390") {
          await run(page, range(0, M, 12), () => ({}))
          await run(page, range(M, M - 60, 3), () => ({}))
          await sleep(400)
          const row = await page.evaluate(() => {
            const bar = document.querySelector("[data-op-topbar]").getBoundingClientRect()
            const kids = [...document.querySelector("[data-op-topbar-button]").querySelectorAll("img, [data-op-topbar-name], [data-op-topbar-badge]")].map((k) => k.getBoundingClientRect())
            const words = { left: Math.min(...kids.map((k) => k.left)), right: Math.max(...kids.map((k) => k.right)) }
            return [...document.querySelectorAll("[data-onepage-share-button], [data-onepage-bell]")].map((b) => { const r = b.getBoundingClientRect(); return { mid: r.top + r.height / 2, barMid: bar.top + bar.height / 2, clear: r.right < words.left || r.left > words.right } })
          })
          check(row.every((r) => Math.abs(r.mid - r.barMid) <= 1 && r.clear), `390 ${layout}: with the bar up, each button sits on its row, clear of the name (${row.map((r) => `${r.mid}/${r.barMid}`).join(", ")})`)
          if (shots) await page.screenshot({ path: join(shots, `corners-390-${layout}.png`) })
        }
        await page.close()
      }
    }
  }

  /* ── fade ── */
  if (want("fade")) {
    console.log("\n── fade")
    for (const [label, vp] of [["390", vp390], ["1440", vp1440]]) {
      for (const dark of ["", "&dark"]) {
        const page = await open(vp, `layout=hero&verified${dark}`)
        const hero = await page.evaluate(() => {
          const h = [...document.querySelectorAll("[data-hero-header]")].find((e) => e.getClientRects().length)
          const media = h.querySelector("[data-hero-media]")
          const r = media.getBoundingClientRect()
          const t = h.querySelector("[data-hero-title] h1").getBoundingClientRect()
          const mask = getComputedStyle(media).maskImage || getComputedStyle(media).webkitMaskImage
          return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), title: Math.round(((t.top - r.top) / r.height) * 100) / 100, stops: (mask.match(/rgba?\(/g) || []).length, shadow: getComputedStyle(h.querySelector("[data-hero-title] h1")).textShadow }
        })
        console.log(`   ${label}${dark} hero ${JSON.stringify(hero)}`)
        const ratio = hero.w / hero.h
        /* Round R3, the owner: it took almost the whole window. 8/9 on a phone (4 to 4.5), 5/4 on a computer (shorter than square). */
        check(label === "390" ? Math.abs(ratio - 8 / 9) < 0.02 : Math.abs(ratio - 1.25) < 0.02, `${label}${dark}: the fade layout's picture is ${label === "390" ? "8/9" : "5/4"} (${hero.w}x${hero.h})`)
        check(hero.h + hero.top <= vp.height * (label === "390" ? 0.55 : 0.55), `${label}${dark}: its foot is in the top ${label === "390" ? 55 : 55}% of the window, so the links show on the first screen (${hero.top + hero.h} of ${vp.height})`)
        check(hero.top === (label === "390" ? 0 : 32), `${label}${dark}: it starts at the top of the ${label === "390" ? "screen" : "card"}, nothing of it above (${hero.top})`)
        check(hero.stops >= 7 && hero.title >= 0.6, `${label}${dark}: it melts on an eased mask (${hero.stops} stops) with the name over the melted part (${hero.title} down)`)
        check(!/rgba\(0, 0, 0/.test(hero.shadow), `${label}${dark}: the name's halo is the page's colour, not black (${hero.shadow.slice(0, 60)})`)
        if (shots) await page.screenshot({ path: join(shots, `fade-${label}${dark}.png`) })
        await page.close()
      }
      for (const q of ["layout=cover", "layout=cover&dark", "layout=cover&nofade"]) {
        const page = await open(vp, q)
        const band = await page.evaluate(() => {
          const b = [...document.querySelectorAll("[data-cover-band]")].find((e) => e.getClientRects().length)
          return { fade: b.hasAttribute("data-cover-fade"), mask: (getComputedStyle(b).maskImage || "none").slice(0, 30), bg: getComputedStyle(b).backgroundColor }
        })
        const off = q.includes("nofade")
        check(off ? !band.fade && band.mask === "none" : band.fade && band.mask.startsWith("linear-gradient") && band.bg === "rgba(0, 0, 0, 0)", `${label} ${q}: the own cover ${off ? "keeps its band when the fade is off" : "fades into the page, no tint left behind"} (${JSON.stringify(band)})`)
        if (shots) await page.screenshot({ path: join(shots, `cover-${label}-${q.replace(/[=&]/g, "_")}.png`) })
        await page.close()
      }
    }
  }

  /* ── rows ── */
  if (want("rows")) {
    console.log("\n── rows")
    for (const [label, vp] of [["390", vp390], ["1440", vp1440]]) {
      for (const dark of ["", "&dark"]) {
        const page = await open(vp, `layout=classic&rows${dark}`)
        await page.evaluate(() => document.querySelector("[data-op-block='shelf-simple']").scrollIntoView({ block: "center" }))
        await sleep(700)
        const rows = await page.evaluate(() => {
          const card = document.querySelector("[data-onepage-drag-scope].rounded-\\[40px\\]")
          const edge = card && card.getClientRects().length ? card.getBoundingClientRect() : { left: 0, right: innerWidth }
          const column = [...document.querySelectorAll("[data-op-block='l1']")].find((e) => e.getClientRects().length).getBoundingClientRect()
          return [...document.querySelectorAll(".op-rail")].filter((e) => e.getClientRects().length).map((rail) => {
            const r = rail.getBoundingClientRect()
            const first = [...rail.querySelectorAll(":scope > *, :scope > * > *")].find((c) => c.getBoundingClientRect().width > 40)
            const f = first.getBoundingClientRect()
            const cs = getComputedStyle(rail)
            return { block: rail.closest("[data-op-block]")?.getAttribute("data-op-block"), left: Math.round(r.left - edge.left), right: Math.round(edge.right - r.right), first: Math.round(f.left - column.left), padTop: parseFloat(cs.paddingTop), padBottom: parseFloat(cs.paddingBottom), bg: cs.backgroundColor, border: cs.borderTopWidth, outline: cs.outlineStyle, scrolls: rail.scrollWidth > rail.clientWidth }
          })
        })
        console.log(`   ${label}${dark} ${JSON.stringify(rows)}`)
        check(rows.length >= 4, `${label}${dark}: ${rows.length} sideways rows drawn`)
        for (const r of rows) {
          check(Math.abs(r.left) <= 1 && Math.abs(r.right) <= 1, `${label}${dark} ${r.block}: the row reaches the ${label === "390" ? "screen's" : "card's"} edges (${r.left}, ${r.right})`)
          check(Math.abs(r.first) <= 1, `${label}${dark} ${r.block}: its first card is in line with the column (${r.first})`)
          check(r.padTop >= 10 && r.padBottom >= 10 && r.bg === "rgba(0, 0, 0, 0)" && r.border === "0px" && r.outline === "none" && r.scrolls, `${label}${dark} ${r.block}: room above and below for a shadow, nothing painted of its own, and it scrolls`)
        }
        if (shots) await page.screenshot({ path: join(shots, `rows-${label}${dark}.png`) })
        await page.close()
      }
    }
  }

  /* ── width ── */
  if (want("width")) {
    console.log("\n── width")
    const page = await open(vp1440, "layout=classic")
    const w = await page.evaluate(() => Math.round(document.querySelector("[data-onepage-drag-scope].rounded-\\[40px\\]").getBoundingClientRect().width))
    check(w === 550, `1440: the card is 550px, a tenth wider than 500 (${w})`)
    await page.close()
  }

  /* ── the editor's preview ── */
  if (want("preview")) {
    console.log("\n── preview")
    const page = await browser.newPage()
    page.on("pageerror", (e) => console.log("   pageerror", String(e).slice(0, 200)))
    await page.setViewport({ ...vp390, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
    await page.goto(`${base}/app?host&layout=classic&verified`, { waitUntil: "domcontentloaded" })
    await page.waitForSelector("iframe[data-host-frame]")
    let frame = null
    for (let i = 0; i < 100 && !frame; i++) {
      frame = page.frames().find((f) => f.url().includes("/onepage-preview"))
      if (frame && !(await frame.$("[data-op-bar-anchor]"))) frame = null
      if (!frame) await sleep(100)
    }
    check(!!frame, "the preview frame draws the page")
    if (frame) {
      await sleep(800)
      const down = await run(frame, range(0, 360, 6), BAR_SAMPLE)
      const up = await run(frame, range(360, 0, 6), BAR_SAMPLE)
      check(down[0].o === 0 && down.at(-1).o > 0.98 && up.at(-1).o === 0, `preview: the bar forms over the name and goes again at the top (${down[0].o} -> ${down.at(-1).o} -> ${up.at(-1).o})`)
      check(down.every((s, i) => i === 0 || s.o >= down[i - 1].o - 0.01) && up.every((s, i) => i === 0 || s.o <= up[i - 1].o + 0.01), "preview: no jump either way")
      const badge = await frame.evaluate(() => !!document.querySelector("[data-op-topbar-badge] svg"))
      check(badge, "preview: the verified badge rides in the bar")
    }
    await page.close()
  }
} finally {
  await browser.close()
  server.close()
}

console.log(failures.length ? `\n${failures.length} failed` : "\nall passed")
if (failures.length && !report) process.exit(1)
