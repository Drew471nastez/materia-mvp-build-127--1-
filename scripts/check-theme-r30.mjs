/**
 * ===========================================================================
 *  MATERIA ON EVERY TEMPLATE (round 30)
 * ===========================================================================
 * Measures every template's prerendered website (public/theme-previews, run
 * scripts/build-template-previews.ts first) in headless Chromium, so each
 * class of problem the owner reported on one template is caught on any:
 *
 *   POPOVERS  every filter dropdown in a row of filters, the sort list and
 *             a language or currency list: opened, the points across it are
 *             its own (nothing, a product card least of all, draws over it)
 *   GLUE      a button and a picture stacked in one section keep 16px or
 *             more between them, on a phone and on a computer
 *   HOVER     a product card's picture under the pointer: the page's
 *             background does not show through it (a see-through second
 *             picture or a fade), and its picture keeps 8px or more from the
 *             card's title, at rest and hovered
 *   ICONS     no empty outlined box where an icon belongs (a ::before with a
 *             border and nothing drawn in it), no icon svg that draws nothing
 *   MOTION    the template's own reveal (Theme settings > Animations) plays
 *             on the sections below the first screen, moves transform and
 *             opacity only (clip-path on Mask reveal pictures), ends fully
 *             shown with nothing held, keeps the first screen still, and
 *             shows everything at once for reduced motion
 *
 *   node scripts/check-theme-r30.mjs [slug ...]     (all templates)
 *
 * tests/theme-r30.test.ts checks the rules these measure in the files.
 */
import puppeteer from "puppeteer-core"
import sharp from "sharp"
import { createServer } from "node:http"
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { extname, join, normalize } from "node:path"

const root = process.cwd()
const PUBLIC = join(root, "public")
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".webp": "image/webp", ".woff2": "font/woff2", ".woff": "font/woff", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".json": "application/json", ".gif": "image/gif", ".mp3": "audio/mpeg", ".mp4": "video/mp4" }
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "")
  const file = join(PUBLIC, path)
  if (!file.startsWith(PUBLIC) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); return res.end() }
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" })
  res.end(readFileSync(file))
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const BASE = `http://127.0.0.1:${server.address().port}/theme-previews`

const shared = readFileSync(join(root, "lib/themes/marketplace-shared.ts"), "utf8")
const LIST = [...shared.matchAll(/\{ slug: ([^,]+), template: ("[^"]+"|DEFAULT_CODE_TEMPLATE)/g)].map((m) => ({ slug: m[1] === "DEFAULT_LISTING_SLUG" ? "storelib-default" : m[1].replace(/"/g, ""), folder: m[2] === "DEFAULT_CODE_TEMPLATE" ? "default" : m[2].replace(/"/g, "") }))
const args = process.argv.slice(2)
const chosen = args.length ? LIST.filter((t) => args.includes(t.slug)) : LIST
/* A pointer that hovers, as on a computer: the theme draws hover effects for a fine pointer only. */
const browser = await puppeteer.launch({ protocolTimeout: 300000, executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4"] })

const failures = []
const notes = []
let checks = 0
function expect(label, ok, detail) { checks++; if (!ok) failures.push(`${label} ${JSON.stringify(detail ?? "").slice(0, 400)}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* Geometry is measured with reduced motion, so every reveal is already at rest (MOTION measures the reveals themselves). */
async function open(url, width, height = 900, { scroll = true, reduced = true } = {}) {
  const page = await browser.newPage()
  await page.setViewport({ width, height })
  if (reduced) await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
  await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 }).catch(() => {})
  if (scroll) {
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 30)) } window.scrollTo(0, 0) })
    await sleep(500)
  }
  return page
}

/* Points across a box (inset 6px, and clear of its rounded corners) that must all be the box's own. */
const OWN_POINTS = `(el) => { const r = el.getBoundingClientRect(); const k = 6 + (parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0) * 0.35; const xs = [r.left + k, r.left + r.width / 2, r.right - k], ys = [r.top + k, r.top + r.height / 2, r.bottom - k]; const bad = []; for (const x of xs) for (const y of ys) { if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue; const hit = document.elementFromPoint(x, y); if (hit && !el.contains(hit)) bad.push(Math.round(x) + ',' + Math.round(y) + ' ' + hit.tagName + '.' + String(hit.className).slice(0, 40)) } return bad }`

async function popovers(slug, dir) {
  const colls = existsSync(join(dir, "collections")) ? readdirSync(join(dir, "collections")).filter((f) => f.endsWith(".html")).sort() : []
  const picks = [...new Set([colls.includes("all.html") ? "all.html" : colls[0], colls.find((c) => c !== "all.html")].filter(Boolean))]
  for (const coll of picks) {
    for (const width of [1440, 1024]) {
      const page = await open(`${BASE}/${slug}/collections/${coll}`, width)
      const at = `${slug} /collections/${coll} @${width}`
      const groups = await page.$$(".facets-panel--horizontal .facets-group:not(.facets-group--extra) > summary")
      for (let i = 0; i < groups.length; i++) {
        const visible = await groups[i].evaluate((s) => s.getBoundingClientRect().width > 0)
        if (!visible) continue
        await groups[i].evaluate((s) => { s.scrollIntoView({ block: "center" }) })
        await sleep(150)
        await groups[i].click()
        await sleep(350)
        const bad = await page.evaluate(`(${OWN_POINTS})(document.querySelectorAll('.facets-panel--horizontal .facets-group:not(.facets-group--extra)')[${i}].querySelector('.facets-group__content'))`)
        const name = await groups[i].evaluate((s) => s.textContent.trim().replace(/\s+/g, " ").slice(0, 24))
        expect(`${at}: the "${name}" filter list draws over the products`, bad.length === 0, bad)
        await groups[i].click()
        await sleep(200)
      }
      const sort = await page.$(".facets-sort__trigger")
      if (sort && (await sort.evaluate((s) => s.getBoundingClientRect().width > 0))) {
        await sort.evaluate((s) => s.scrollIntoView({ block: "center" }))
        await sleep(150)
        await sort.click()
        await sleep(400)
        const bad = await page.evaluate(`(() => { const p = document.querySelector('.facets-sort__panel'); if (!p || p.getBoundingClientRect().height < 10) return ['not open']; return (${OWN_POINTS})(p) })()`)
        expect(`${at}: the sort list draws over the products`, bad.length === 0, bad)
        await page.keyboard.press("Escape")
        await sleep(250)
      }
      await page.close()
    }
  }
  // A language or currency list, where the template shows one.
  const page = await open(`${BASE}/${slug}/index.html`, 1440)
  const triggers = await page.$$('[aria-haspopup="listbox"][aria-controls]')
  for (const t of triggers.slice(0, 2)) {
    if (!(await t.evaluate((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(b).visibility !== "hidden" }))) continue
    await t.evaluate((b) => b.scrollIntoView({ block: "center" }))
    await sleep(200)
    await t.click().catch(() => {})
    await sleep(400)
    const res = await t.evaluate(`((b) => { const p = document.getElementById(b.getAttribute('aria-controls')); if (!p) return null; const r = p.getBoundingClientRect(); if (r.height < 10 || getComputedStyle(p).visibility === 'hidden' || +getComputedStyle(p).opacity < 0.9) return null; return (${OWN_POINTS})(p) })`)
    if (res) expect(`${slug} home: a language or currency list draws over the page`, res.length === 0, res)
    await page.keyboard.press("Escape")
    await sleep(200)
  }
  await page.close()
}

const GLUE = `() => {
  const R = (e) => e.getBoundingClientRect();
  const vis = (e) => { const r = R(e); if (r.width < 2 || r.height < 2) return false; const cs = getComputedStyle(e); return cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05; };
  const out = [];
  document.querySelectorAll('main [id^=shopify-section], #MainContent > .shopify-section').forEach((sec) => {
    const btns = [...sec.querySelectorAll('a.btn, button.btn, .button, a[class*=button], [data-sl-button]')].filter((x) => vis(x) && !x.closest('.product-item, .swiper-slide, form, [role=dialog], .drawer, [class*=card]') && R(x).height >= 28 && R(x).height < 90);
    if (!btns.length) return;
    const media = [...sec.querySelectorAll('img, video, [class*=__media], [class*=__image]')].filter((m) => vis(m) && R(m).width >= 150 && R(m).height >= 120 && !m.closest('.product-item, [class*=card]'));
    for (const bt of btns) {
      const br = R(bt);
      for (const m of media) {
        if (m.contains(bt) || bt.contains(m)) continue;
        const mr = R(m);
        if (Math.min(br.right, mr.right) - Math.max(br.left, mr.left) < 8) continue;
        if (br.top >= mr.top - 1 && br.bottom <= mr.bottom + 1) continue;
        let gap = null;
        if (mr.top >= br.bottom - 2) gap = mr.top - br.bottom; else if (br.top >= mr.bottom - 2) gap = br.top - mr.bottom;
        if (gap != null && gap < 16) out.push({ sec: sec.id.replace('shopify-section-', '').slice(0, 40), button: bt.textContent.trim().slice(0, 24), media: m.tagName + '.' + String(m.className).slice(0, 30), gap: Math.round(gap) });
      }
    }
  });
  return out;
}`

async function glue(slug, dir) {
  const pages = existsSync(join(dir, "pages")) ? readdirSync(join(dir, "pages")).filter((f) => f.endsWith(".html")).sort().slice(0, 6).map((f) => `pages/${f}`) : []
  for (const path of ["index.html", ...pages]) {
    for (const width of [390, 1440]) {
      const page = await open(`${BASE}/${slug}/${path}`, width, width === 390 ? 844 : 900)
      const found = await page.evaluate(`(${GLUE})()`)
      const seen = new Set()
      for (const g of found) { const k = g.sec + g.button; if (seen.has(k)) continue; seen.add(k); expect(`${slug} /${path} @${width} ${g.sec}: 16px or more between "${g.button}" and the picture`, false, g) }
      checks++
      await page.close()
    }
  }
}

async function shot(page, clip) {
  const buf = await page.screenshot({ captureBeyondViewport: false })
  const meta = await sharp(buf).metadata()
  const box = { left: Math.max(0, Math.round(clip.x)), top: Math.max(0, Math.round(clip.y)) }
  box.width = Math.max(1, Math.min(meta.width - box.left, Math.round(clip.width)))
  box.height = Math.max(1, Math.min(meta.height - box.top, Math.round(clip.height)))
  const { data, info } = await sharp(buf).extract(box).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, n: info.width * info.height }
}

async function hover(slug, dir) {
  const colls = existsSync(join(dir, "collections")) ? readdirSync(join(dir, "collections")).filter((f) => f.endsWith(".html")).sort() : []
  const paths = [colls.includes("all.html") ? "collections/all.html" : colls[0] && `collections/${colls[0]}`, "index.html"].filter(Boolean)
  for (const path of paths) {
    const page = await open(`${BASE}/${slug}/${path}`, 1440)
    const n = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.product-item, [class*=__card], [class*=-card]')].filter((c) => { const r = c.getBoundingClientRect(); const img = c.querySelector('img'); return r.width > 120 && r.width < 700 && img && img.getBoundingClientRect().width > 100 && c.querySelector('h2, h3, h4, [class*=title]') && !c.closest('header, footer, [role=dialog], .drawer') && !c.parentElement.closest('.product-item, [class*=__card], [class*=-card]') })
      const byKind = new Map()
      for (const c of cards) { const k = c.className.split(' ')[0]; if (!byKind.has(k)) byKind.set(k, []); if (byKind.get(k).length < 3) byKind.get(k).push(c) }
      const pick = [...byKind.values()].flat().slice(0, 8)
      pick.forEach((c, i) => c.setAttribute('data-r30-card', String(i)))
      return pick.length
    })
    for (let i = 0; i < n; i++) {
      await page.evaluate((i) => document.querySelector(`[data-r30-card="${i}"]`).scrollIntoView({ block: "center" }), i)
      await page.mouse.move(2, 2)
      await sleep(900)
      const geo = () => page.evaluate((i) => {
        const c = document.querySelector(`[data-r30-card="${i}"]`)
        const img = [...c.querySelectorAll('img')].filter((x) => +getComputedStyle(x).opacity > 0.1 && x.getBoundingClientRect().width > 60).sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0]
        const title = c.querySelector('.product-item__title, h2, h3, h4, [class*=title]')
        const frame = img.closest('.product__media, [class*=__media], [class*=__cover], [class*=__image], a') || img
        const ir = img.getBoundingClientRect(), fr = frame.getBoundingClientRect(), tr = title.getBoundingClientRect()
        const top = Math.max(ir.top, fr.top), bottom = Math.min(ir.bottom, fr.bottom)
        let bg = 'rgb(255, 255, 255)'
        for (let x = frame; x; x = x.parentElement) { const v = getComputedStyle(x).backgroundColor; if (!/rgba\(\d+, \d+, \d+, 0\)|transparent/.test(v)) { bg = v; break } }
        return { kind: c.className.split(' ')[0], clip: { x: Math.max(fr.left, ir.left) + 4, y: top + 4, width: Math.min(fr.right, ir.right) - Math.max(fr.left, ir.left) - 8, height: Math.min(bottom, innerHeight) - top - 8 }, gap: Math.round(tr.top >= ir.top ? tr.top - bottom : top - tr.bottom), bg, hx: ir.left + ir.width / 2, hy: top + (bottom - top) / 2 }
      }, i)
      const rest = await geo()
      if (rest.clip.width < 20 || rest.clip.height < 20) continue
      const bg = rest.bg.match(/\d+/g).slice(0, 3).map(Number)
      const frac = ({ data, n }) => { let k = 0; for (let j = 0; j < n * 3; j += 3) if (Math.abs(data[j] - bg[0]) + Math.abs(data[j + 1] - bg[1]) + Math.abs(data[j + 2] - bg[2]) < 24) k++; return k / n }
      const before = frac(await shot(page, rest.clip))
      await page.mouse.move(rest.hx, rest.hy)
      await sleep(1100)
      const hov = await geo()
      const after = frac(await shot(page, rest.clip))
      const at = `${slug} /${path} card ${rest.kind}#${i}`
      expect(`${at}: the page does not show through the picture on hover`, after - before <= 0.15, { before: +before.toFixed(2), after: +after.toFixed(2) })
      // A title set over the picture (an overlay card) has no gap to keep.
      if (rest.gap >= 0) expect(`${at}: 8px or more from the picture to the title, at rest and hovered`, rest.gap >= 8 && hov.gap >= 8, { rest: rest.gap, hover: hov.gap })
    }
    await page.close()
  }
}

const ICONS = `() => {
  const R = (e) => e.getBoundingClientRect();
  const out = [];
  const visible = (e) => { const r = R(e); if (r.width < 1 || r.height < 1) return false; const cs = getComputedStyle(e); return cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05; };
  const alpha = (c) => { const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return 1; const p = m[1].split(','); return p.length > 3 ? +p[3] : 1; };
  // Where an icon box can be: list items, spans and small boxes (a ::before is drawn inside its element).
  const els = [...document.querySelectorAll('main li, main span, main i, main a, main button, main div:empty, main p, main h3, main h4')].filter((e) => { const r = R(e); return r.width > 0 && r.width < 900 && r.height < 200; }).slice(0, 2500);
  for (const el of els) {
    if (el.closest('form, label, select, input, [role=checkbox], [role=radio], [aria-checked], .facets, .swatch, [class*=swatch], [class*=checkbox], [class*=radio], .placeholder-svg')) continue;
    if (!visible(el)) continue;
    for (const pseudo of ['::before', '::after']) {
      const cs = getComputedStyle(el, pseudo);
      if (cs.content === 'none' || cs.content === 'normal' || cs.display === 'none') continue;
      if (cs.content.replace(/["']/g, '').trim()) continue;
      const w = parseFloat(cs.width), h = parseFloat(cs.height);
      if (!(w >= 10 && h >= 10 && w <= 32 && h <= 32)) continue;
      const border = ['Top', 'Right', 'Bottom', 'Left'].filter((s) => parseFloat(cs['border' + s + 'Width']) > 0.5 && cs['border' + s + 'Style'] !== 'none' && alpha(cs['border' + s + 'Color']) > 0.05).length;
      if (border < 4) continue;
      const drawn = cs.backgroundImage !== 'none' || (cs.maskImage && cs.maskImage !== 'none') || (cs.webkitMaskImage && cs.webkitMaskImage !== 'none') || alpha(cs.backgroundColor) > 0.3;
      if (drawn) continue;
      out.push({ el: el.tagName + '.' + String(el.className).slice(0, 40), pseudo, w, h, text: (el.textContent || '').trim().slice(0, 30) });
    }
  }
  for (const svg of document.querySelectorAll('main svg')) {
    const r = R(svg);
    if (r.width < 10 || r.height < 10 || r.width > 64 || r.height > 64 || !visible(svg)) continue;
    if (svg.closest('.placeholder-svg, [aria-hidden=true][class*=placeholder]')) continue;
    const shapes = svg.querySelectorAll('path, circle, rect, line, polyline, polygon, ellipse, text, image, use');
    let ok = shapes.length > 0;
    for (const u of svg.querySelectorAll('use')) { const href = u.getAttribute('href') || u.getAttribute('xlink:href') || ''; if (href.startsWith('#') && !document.getElementById(href.slice(1))) ok = false; }
    if (ok) { try { const b = svg.getBBox(); ok = b.width > 0 || b.height > 0 } catch {} }
    if (!ok) out.push({ el: 'svg.' + String(svg.getAttribute('class') || '').slice(0, 40), w: Math.round(r.width), h: Math.round(r.height), parent: String(svg.parentElement.className).slice(0, 40) });
  }
  return out;
}`

async function icons(slug, dir) {
  const products = existsSync(join(dir, "products")) ? readdirSync(join(dir, "products")).filter((f) => f.endsWith(".html")).sort().slice(0, 1).map((f) => `products/${f}`) : []
  const pages = existsSync(join(dir, "pages")) ? readdirSync(join(dir, "pages")).filter((f) => f.endsWith(".html")).sort().slice(0, 4).map((f) => `pages/${f}`) : []
  for (const path of ["index.html", ...products, ...pages]) {
    const page = await open(`${BASE}/${slug}/${path}`, 1440)
    const found = await page.evaluate(`(${ICONS})()`)
    expect(`${slug} /${path}: no empty icon boxes`, found.length === 0, found.slice(0, 4))
    await page.close()
  }
}

const settingsOf = (folder) => {
  const read = (p) => { const t = readFileSync(p, "utf8"); return JSON.parse(t.slice(t.indexOf("{"))).current ?? {} }
  return { ...read(join(root, "theme-packages/materia/base/config/settings_data.json")), ...read(join(root, "theme-packages/materia/templates", folder, "config/settings_data.json")) }
}

async function motion(slug, folder) {
  const st = settingsOf(folder)
  const type = st.scroll_animation
  if (!type || type === "none") { notes.push(`${slug}: no scroll reveal`); return }
  const page = await open(`${BASE}/${slug}/index.html`, 1440, 900, { scroll: false, reduced: false })
  await sleep(600)
  // The first screen is still: nothing in it waits or moves.
  const first = await page.evaluate(() => [...document.querySelectorAll('.scroll-trigger')].filter((e) => { const r = e.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0 && r.height > 2 }).map((e) => ({ id: e.id.slice(0, 40), armed: e.classList.contains('scroll-trigger--armed'), op: +getComputedStyle(e).opacity })))
  expect(`${slug}: the first screen shows at once`, first.every((f) => !f.armed && f.op > 0.99), first.filter((f) => f.armed || f.op <= 0.99))
  // Record what animates while the page is scrolled through, a screen at a time.
  await page.evaluate(() => {
    window.__r30 = { props: new Set(), names: new Set(), frames: [] }
    const seen = new WeakSet()
    const grab = () => {
      for (const a of document.getAnimations()) {
        if (seen.has(a) || !a.animationName || !/^reveal/i.test(a.animationName)) continue
        seen.add(a)
        window.__r30.names.add(a.animationName)
        try { for (const k of a.effect.getKeyframes()) for (const p of Object.keys(k)) if (!['offset', 'computedOffset', 'easing', 'composite'].includes(p)) window.__r30.props.add(p) } catch {}
      }
    }
    let last = performance.now()
    const tick = (t) => { window.__r30.frames.push(t - last); last = t; grab(); if (!window.__r30.stop) requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
  })
  const height = await page.evaluate(() => document.body.scrollHeight)
  for (let y = 600; y < height; y += 600) { await page.evaluate((y) => window.scrollTo(0, y), y); await sleep(380) }
  await sleep(Math.round((st.animation_duration ?? 700) * 2.6 + 900))
  const res = await page.evaluate(() => {
    window.__r30.stop = true
    const f = window.__r30.frames.slice(3).sort((a, b) => a - b)
    // Shown on the page: not a slide waiting off to the side in a carousel (clipped by a frame), which reveals when it is swiped to.
    const shown = (e) => { const r = e.getBoundingClientRect(); if (r.height <= 2) return false; let L = Math.max(r.left, 0), Rr = Math.min(r.right, innerWidth); for (let x = e.parentElement; x && x !== document.body; x = x.parentElement) { const cs = getComputedStyle(x); if (cs.overflowX !== 'visible' || cs.overflow !== 'visible') { const q = x.getBoundingClientRect(); L = Math.max(L, q.left); Rr = Math.min(Rr, q.right) } } return Rr - L >= r.width * 0.5 }
    const held = [...document.querySelectorAll('.scroll-trigger')].filter(shown).filter((e) => (e.classList.contains('scroll-trigger--armed') || +getComputedStyle(e).opacity < 0.99 || e.querySelector('[data-reveal-part], .mt-word')))
    const types = new Set([...document.querySelectorAll('.ti-section-reveal')].map((e) => [...e.classList].find((c) => /^(fade_in|fade_up|slide_in|zoom_in|subtle_rise|cinematic|blur_up|blur_in|slide_side|stagger_up|mask_reveal|split_text|editorial)$/.test(c))))
    return { names: [...window.__r30.names], props: [...window.__r30.props], p95: f.length ? Math.round(f[Math.floor(f.length * 0.95)]) : null, median: f.length ? Math.round(f[Math.floor(f.length / 2)]) : null, held: held.slice(0, 3).map((e) => e.id.slice(0, 40)), types: [...types] }
  })
  expect(`${slug}: the sections carry the template's own reveal (${type})`, res.types.length === 1 && res.types[0] === type, res.types)
  expect(`${slug}: the reveal played on the way down`, res.names.length > 0, res)
  const allowed = new Set(["opacity", "transform", "translate", "scale", ...(type === "mask_reveal" ? ["clipPath"] : [])])
  expect(`${slug}: the reveal moves transform and opacity only`, res.props.every((p) => allowed.has(p)), res.props)
  expect(`${slug}: every section ends shown, nothing held`, res.held.length === 0, res.held)
  notes.push(`${slug}: ${type} ${st.animation_duration}ms, stagger ${st.reveal_stagger}ms, keyframes ${res.names.join("+")}, frame median ${res.median}ms p95 ${res.p95}ms`)
  await page.close()
  // Reduced motion: everything is there at once.
  const still = await open(`${BASE}/${slug}/index.html`, 1440, 900, { scroll: false, reduced: true })
  const hidden = await still.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 700) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)) } return [...document.querySelectorAll('.scroll-trigger, [data-reveal-part]')].filter((e) => e.getBoundingClientRect().height > 2 && (+getComputedStyle(e).opacity < 0.99 || getComputedStyle(e).animationName !== 'none')).map((e) => e.id || e.className).slice(0, 3) })
  expect(`${slug}: reduced motion shows everything at once`, hidden.length === 0, hidden)
  await still.close()
}

const only = (process.env.ONLY || "popovers,glue,hover,icons,motion").split(",")
for (const { slug, folder } of chosen) {
  if (folder === "newleaf" && !args.includes(slug)) continue
  const dir = join(PUBLIC, "theme-previews", slug)
  if (!existsSync(dir)) { expect(`${slug}: a preview exists`, false); continue }
  for (const [name, run] of [["popovers", () => popovers(slug, dir)], ["glue", () => glue(slug, dir)], ["hover", () => hover(slug, dir)], ["icons", () => icons(slug, dir)], ["motion", () => motion(slug, folder)]]) {
    if (!only.includes(name)) continue
    try { await run() } catch (e) { expect(`${slug}: the ${name} measurement ran`, false, String(e?.message ?? e).slice(0, 200)); for (const pg of (await browser.pages()).slice(1)) await pg.close().catch(() => {}) }
  }
  process.stdout.write(`${slug} `)
}
await browser.close()
server.close()
console.log(`\n${checks - failures.length} of ${checks} measurements passed`)
for (const n of notes) console.log(`  note ${n}`)
for (const f of failures) console.log(`  FAIL ${f}`)
process.exit(failures.length ? 1 : 0)
