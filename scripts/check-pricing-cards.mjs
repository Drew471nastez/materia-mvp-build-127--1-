/**
 * ===========================================================================
 *  THE TWO PLAN CARDS, MEASURED
 * ===========================================================================
 * Free and Pro, drawn by one component (components/billing/plan-cards.tsx)
 * on every surface that offers a plan, to the owner's reference: a tall
 * header in the plan's colour carrying the owner's picture, white text on it,
 * round checks, a full width button and a line of small print. What that
 * brief claims about pixels is measured here rather than asserted:
 *
 *   - exactly two cards, side by side from 768px and stacked on a phone
 *   - equal heights side by side, with the headers, the first lines and the
 *     buttons level across the two
 *   - nothing runs off the side of the page, and no text out of its card
 *   - each header picture loads, through the image optimizer, at a width
 *     near what is drawn: a phone is not sent the 1672px original
 *   - the white text on the pictures reaches 4.5:1, measured on the pixels
 *     actually behind it, and every other text reaches 4.5:1 on its ground
 *   - corners of 22px, scaled with the card
 *   - every button 44px or taller, in capitals, with its arrow
 *
 * It renders the marketing pricing section, the onboarding step's compact
 * cards and the in-app upgrade page (for somebody on Free, and for somebody
 * still on the earlier $99 plan) at 390px, 1280px and 1920px, serves them
 * from a small local server that stands in for /_next/image, and writes a
 * screenshot of each.
 *
 *   node scripts/check-pricing-cards.mjs
 *   SHOTS=/some/dir node scripts/check-pricing-cards.mjs   # keep screenshots
 *
 * No production build is needed. The stylesheet is compiled from
 * app/globals.css with the same Tailwind PostCSS plugin the build uses. The
 * two pictures are downloaded once per run with curl (which goes through the
 * machine's proxy; the headless browser cannot).
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"
import nextConfig from "../next.config.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const out = mkdtempSync(join(tmpdir(), "storelib-pricing-"))
const SHOTS = process.env.SHOTS

const fail = (m) => {
  console.error(m)
  process.exit(1)
}
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}. Set CHROMIUM=/path/to/chromium.`)

const css = await appCss(root)

/* The pictures the cards name, fetched once. */
const cardsSource = readFileSync(join(root, "components/billing/plan-cards.tsx"), "utf8")
const base = /const PICTURE_BASE = "([^"]+)"/.exec(cardsSource)?.[1]
const names = [...cardsSource.matchAll(/picture: `\$\{PICTURE_BASE\}\/([^`]+)`/g)].map((m) => m[1])
if (!base || names.length !== 2) fail("Could not find the two header pictures in plan-cards.tsx.")
const pictures = new Map()
for (const [i, name] of names.entries()) {
  const url = `${base}/${name}`
  const file = join(out, `picture-${i}.png`)
  try {
    execFileSync("curl", ["-sSf", "-o", file, url], { stdio: ["ignore", "ignore", "inherit"], timeout: 60_000 })
  } catch {
    fail(`Could not download ${url}. The header pictures have to load for this probe to mean anything.`)
  }
  pictures.set(url, file)
}

/** Stubs live inside the project so esbuild can resolve `react` from them. */
const stubs = join(root, ".pricing-probe")
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) {
  return React.createElement("a", { href, ...rest }, children)
}
`)
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/pricing"
export const useRouter = () => ({ push() {}, replace() {}, refresh() {}, prefetch() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
`)
writeFileSync(join(stubs, "dynamic.js"), `export default function dynamic() { return () => null }
`)

/* next/image as the build configures it: the app's own remote hosts and qualities. */
const imageOpts = {
  deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
  imageSizes: [32, 48, 64, 96, 128, 256, 384],
  path: "/_next/image",
  loader: "default",
  loaderFile: "",
  domains: [],
  disableStaticImages: false,
  minimumCacheTTL: nextConfig.images.minimumCacheTTL,
  formats: nextConfig.images.formats,
  dangerouslyAllowSVG: false,
  contentSecurityPolicy: "script-src 'none'; frame-src 'none'; sandbox;",
  contentDispositionType: "attachment",
  remotePatterns: nextConfig.images.remotePatterns,
  qualities: nextConfig.images.qualities,
  unoptimized: false,
}

const bundle = join(out, "probe.js")
try {
  execFileSync(
    "pnpm",
    ["exec", "esbuild", join(root, "scripts/render-pricing-cards-probe.tsx"),
     "--bundle", "--platform=node", "--format=cjs", "--jsx=automatic", "--log-level=error",
     `--outfile=${bundle}`,
     `--define:process.env.__NEXT_IMAGE_OPTS=${JSON.stringify(imageOpts)}`,
     `--alias:next/link=${join(stubs, "link.jsx")}`,
     `--alias:next/navigation=${join(stubs, "navigation.js")}`,
     `--alias:next/dynamic=${join(stubs, "dynamic.js")}`,
     `--alias:@=${root}`],
    { stdio: ["ignore", "ignore", "inherit"] },
  )
} catch {
  rmSync(stubs, { recursive: true, force: true })
  fail("The probe did not bundle. The error above is esbuild's.")
}
execFileSync("node", [bundle], { env: { ...process.env, OUT_DIR: out }, stdio: ["ignore", "ignore", "inherit"] })

/**
 * AnimateOnScroll starts its children at opacity 0 and waits for an
 * IntersectionObserver that a static render never runs. The page under test
 * is the settled one, so that starting state is overridden here.
 */
const SETTLED = `[data-probe-shell] div[style*="opacity"]{opacity:1!important;transform:none!important}`

/* A stand-in for /_next/image: the downloaded original, whatever width is asked, and a note of the width. */
let asked = []
const pagesHtml = new Map()
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://probe")
  if (url.pathname === "/_next/image") {
    const file = pictures.get(url.searchParams.get("url") ?? "")
    asked.push({ url: url.searchParams.get("url"), w: Number(url.searchParams.get("w")), q: Number(url.searchParams.get("q")) })
    if (!file) {
      res.writeHead(400).end()
      return
    }
    res.writeHead(200, { "Content-Type": "image/png" }).end(readFileSync(file))
    return
  }
  const html = pagesHtml.get(url.pathname)
  if (!html) {
    res.writeHead(404).end()
    return
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`

let broken = 0
const expect = (ok, what, got = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${typeof got === "string" ? got : JSON.stringify(got)}`}`)
  if (!ok) broken++
}

/** Everything measured on one page, in the page. */
const MEASURE = () => {
  const box = (el) => el.getBoundingClientRect()
  const parse = (c) => {
    const n = (c.match(/-?[\d.]+(?:e-?\d+)?/g) || []).map(Number)
    if (c.startsWith("color(srgb")) return [n[0] * 255, n[1] * 255, n[2] * 255, ...(n.length > 3 ? [n[3]] : [])]
    if (c.startsWith("oklab(")) {
      const [L, A, B] = n
      const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
      const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
      const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3
      const lin = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s]
      const enc = (v) => 255 * Math.min(1, Math.max(0, v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055))
      return [...lin.map(enc), ...(n.length > 3 ? [n[3]] : [])]
    }
    return n
  }
  const lum = ([r, g, b]) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
  const ground = (el) => {
    for (let n = el; n; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor)
      if (c.length >= 3 && (c.length === 3 || c[3] > 0.5)) return c.slice(0, 3)
    }
    return [255, 255, 255]
  }
  const shell = document.querySelector("[data-probe-shell]")
  const cards = [...document.querySelectorAll("[data-plan-card]")]
  const r = {
    overflow: Math.max(0, shell.scrollWidth - shell.clientWidth, document.documentElement.scrollWidth - window.innerWidth),
    cards: cards.map((el) => {
      const b = box(el), c = getComputedStyle(el)
      const header = el.querySelector("[data-plan-header]")
      const hb = box(header)
      const img = header.querySelector("img[data-plan-picture]")
      const ib = img ? box(img) : null
      const firstLine = el.querySelector("ul > li")
      const button = [...el.querySelectorAll("[data-plan-action]")].find((b) => !b.closest('[data-morph="off"]'))
      const lines = [...el.querySelectorAll("ul > li")]
      const spill = [...el.querySelectorAll("*")].filter((n) => { const x = box(n); return x.width && (x.left < b.left - 0.5 || x.right > b.right + 0.5) }).length
      return {
        id: el.dataset.planCard,
        left: Math.round(b.left), right: Math.round(innerWidth - b.right),
        top: Math.round(b.top + scrollY), bottom: Math.round(b.bottom + scrollY),
        width: Math.round(b.width), height: Math.round(b.height),
        bg: c.backgroundColor, radius: parseFloat(c.borderTopLeftRadius),
        headerH: Math.round(hb.height), headerTop: Math.round(hb.top + scrollY),
        firstLineTop: Math.round(box(firstLine).top + scrollY),
        buttonTop: Math.round(box(button).top + scrollY),
        picture: img && {
          loaded: img.complete && img.naturalWidth > 0,
          natural: img.naturalWidth,
          current: img.currentSrc,
          sizes: img.getAttribute("sizes"),
          covers: Math.round(ib.left) === Math.round(hb.left) && Math.round(ib.right) === Math.round(hb.right) && Math.round(ib.top) === Math.round(hb.top) && Math.round(ib.bottom) === Math.round(hb.bottom),
        },
        lines: lines.map((li) => ({ text: li.textContent.trim(), grey: getComputedStyle(li).color })),
        pill: header.querySelector("span")?.textContent.trim(),
        texts: [...header.querySelectorAll("h3, p, span")].filter((n) => [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())).map((n) => n.textContent.trim()),
        spill,
      }
    }),
    /* The buttons on screen: where monthly and yearly differ both are drawn in one cell (plan-cards Morph) and only one is shown. */
    buttons: [...document.querySelectorAll("[data-plan-action]")].filter((el) => !el.closest('[data-morph="off"]')).map((el) => ({
      text: el.textContent.trim(), h: Math.round(box(el).height), w: Math.round(box(el).width),
      caps: getComputedStyle(el).textTransform === "uppercase", arrow: !!el.querySelector("svg"),
      settled: el.disabled && !el.getAttribute("aria-busy"),
      cardInner: Math.round(box(el.closest("[data-plan-card]")).width),
    })),
    contrast: [],
    headerText: [],
  }
  /* Text on a plain ground: the colour behind it. */
  for (const el of shell.querySelectorAll("*")) {
    if (el.closest("[data-plan-header]")) continue
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
    if (!own) continue
    const b = box(el)
    if (!b.width || !b.height) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === "hidden" || cs.display === "none" || el.closest(".sr-only")) continue
    const k = ratio(parse(cs.color).slice(0, 3), ground(el))
    r.contrast.push({ text: el.textContent.trim().slice(0, 36), k: Math.round(k * 100) / 100 })
  }
  /* Text on the pictures: its box and colour, for the pixels behind it. */
  for (const el of document.querySelectorAll("[data-plan-header] *")) {
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
    if (!own) continue
    const range = document.createRange()
    range.selectNodeContents(el)
    for (const rect of range.getClientRects()) {
      if (!rect.width || !rect.height) continue
      r.headerText.push({ text: el.textContent.trim().slice(0, 30), color: parse(getComputedStyle(el).color), x: rect.left + scrollX, y: rect.top + scrollY, w: rect.width, h: rect.height })
    }
  }
  return r
}

/** The worst contrast of each header text against the pixels under it, text hidden. */
const PIXELS = async ({ shot, boxes }) => {
  const img = new Image()
  img.src = `data:image/png;base64,${shot}`
  await img.decode()
  const canvas = document.createElement("canvas")
  canvas.width = img.width
  canvas.height = img.height
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  ctx.drawImage(img, 0, 0)
  const dpr = img.width / document.documentElement.scrollWidth
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
  const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  return boxes.map((b) => {
    const [tr, tg, tb, ta = 1] = b.color
    const x = Math.floor(b.x * dpr), y = Math.floor(b.y * dpr), w = Math.max(1, Math.floor(b.w * dpr)), h = Math.max(1, Math.floor(b.h * dpr))
    const data = ctx.getImageData(x, y, w, h).data
    let worst = Infinity
    for (let i = 0; i < data.length; i += 4) {
      const [gr, gg, gb] = [data[i], data[i + 1], data[i + 2]]
      const fr = tr * ta + gr * (1 - ta), fg = tg * ta + gg * (1 - ta), fb = tb * ta + gb * (1 - ta)
      const a = lum(fr, fg, fb), c = lum(gr, gg, gb)
      const k = (Math.max(a, c) + 0.05) / (Math.min(a, c) + 0.05)
      if (k < worst) worst = k
    }
    return { text: b.text, k: Math.round(worst * 100) / 100 }
  })
}

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
try {
  for (const name of ["marketing", "onboarding", "upgrade", "upgrade-legacy", "yearly"]) {
    const body = readFileSync(join(out, `${name}.html`), "utf8")
    for (const W of [390, 1280, 1920]) {
      const phone = W < 768
      const path = `/${name}-${W}.html`
      pagesHtml.set(
        path,
        `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style>
<style>*{box-sizing:border-box}body{margin:0;background:#f8f9fa;font-family:Inter,system-ui,sans-serif}${SETTLED}</style>
</head><body><div data-probe-shell style="overflow-x:auto">${body}</div></body></html>`,
      )
      asked = []
      const page = await browser.newPage()
      await page.setViewport(phone ? { width: W, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { width: W, height: 1000 })
      await page.goto(`${origin}${path}`, { waitUntil: "networkidle0" })
      await page.evaluate(async () => {
        await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r }))))
      })
      const r = await page.evaluate(MEASURE)

      console.log(`\n${name}, at ${W}px`)
      const [free, pro] = r.cards
      expect(r.cards.length === 2 && free?.id === "free" && pro?.id === "growth", "two cards: Free, then Pro (growth)", r.cards.map((c) => c.id).join(", "))
      if (r.cards.length !== 2) { await page.close(); continue }

      if (!phone) {
        expect(free.top === pro.top && free.left < pro.left, "side by side", `tops ${free.top}/${pro.top}, lefts ${free.left}/${pro.left}`)
        expect(Math.abs(free.height - pro.height) <= 1, "equal heights", `${free.height}px and ${pro.height}px`)
        expect(free.headerH === pro.headerH && free.firstLineTop === pro.firstLineTop && free.buttonTop === pro.buttonTop, "headers, first lines and buttons level across the two", { headers: [free.headerH, pro.headerH], lines: [free.firstLineTop, pro.firstLineTop], buttons: [free.buttonTop, pro.buttonTop] })
      } else {
        /* The upgrade page leads with Pro for somebody on Free (PlanCards lead); everywhere else Free comes first. */
        if (name === "upgrade") expect(free.top >= pro.bottom, "stacked, Pro above Free for somebody on Free", `Pro ends ${pro.bottom}, Free starts ${free.top}`)
        else expect(pro.top >= free.bottom, "stacked, Free above Pro", `Free ends ${free.bottom}, Pro starts ${pro.top}`)
        expect(free.width === pro.width, "the same width", `${free.width}px and ${pro.width}px`)
        expect(free.left >= 16 && free.right >= 16, "at least 16px from each edge", `${free.left}/${free.right}px`)
      }
      expect(r.overflow === 0, "the page does not scroll sideways", `${r.overflow}px off the side`)
      expect(free.spill === 0 && pro.spill === 0, "nothing inside a card runs out of it", [free.spill, pro.spill])
      expect(free.bg === "rgb(255, 255, 255)" && pro.bg === "rgb(255, 255, 255)", "white below the header", [free.bg, pro.bg])
      expect(free.radius === 22 && pro.radius === 22, "corners of 22px, scaled with the card", `${free.radius}/${pro.radius}px`)

      for (const card of [free, pro]) {
        const p = card.picture
        const w = Number(new URL(p?.current || "http://x/?w=0").searchParams.get("w"))
        expect(!!p && p.loaded && p.natural > 0, `${card.id}: the header picture loads`, p)
        expect(!!p && p.covers, `${card.id}: and fills the header`, p)
        expect(!!p && /\/_next\/image\?url=/.test(p.current) && w > 0 && w <= (phone ? 828 : 1080), `${card.id}: through the optimizer, at ${w}px wide, not the 1672px original`, p?.current)
      }
      const widths = [...new Set(asked.map((a) => a.w))]
      expect(asked.length >= 2 && asked.every((a) => a.q === 75), `the optimizer is asked for ${widths.join(" and ")}px at quality 75`, asked)

      expect(pro.lines[0]?.text === "Everything in Free", "Pro starts with Everything in Free", pro.lines[0]?.text)
      expect(free.lines.length === pro.lines.length, "the same number of lines on both", [free.lines.length, pro.lines.length])
      const greyed = free.lines.filter((l) => /Not included/.test(l.text))
      expect(greyed.length >= 1 && greyed.every((l) => l.grey === "rgb(107, 114, 128)"), "what Free lacks is greyed, with a cross", greyed)

      const short = r.buttons.filter((b) => b.h < 44)
      expect(r.buttons.length === 2 && short.length === 0, "both buttons are 44px or taller", r.buttons.map((b) => `"${b.text}" ${b.h}px`).join("; "))
      expect(r.buttons.every((b) => b.caps && (b.settled || b.arrow)), "in capitals, with an arrow unless the plan is already yours", r.buttons)

      /* Text on the pictures, against the pixels actually under it. */
      await page.addStyleTag({ content: "[data-plan-header] *{color:transparent!important;text-shadow:none!important}" })
      const shot = await page.screenshot({ fullPage: true, encoding: "base64" })
      const onPicture = await page.evaluate(PIXELS, { shot, boxes: r.headerText })
      const lowPic = onPicture.filter((c) => c.k < 4.5)
      const minPic = Math.min(...onPicture.map((c) => c.k))
      expect(onPicture.length >= 10 && lowPic.length === 0, `white text on the pictures reaches 4.5:1 (${onPicture.length} lines, lowest ${minPic})`, lowPic.slice(0, 5))

      const low = r.contrast.filter((c) => c.k < 4.5)
      const min = Math.min(...r.contrast.map((c) => c.k))
      expect(low.length === 0, `every other text reaches 4.5:1 (${r.contrast.length} checked, lowest ${min})`, low.slice(0, 5).map((c) => `"${c.text}" ${c.k}`).join("; "))

      console.log(
        `    cards ${free.width}x${free.height} / ${pro.width}x${pro.height}px   headers ${free.headerH}/${pro.headerH}px   buttons ${r.buttons.map((b) => `${b.h}px "${b.text}"`).join(", ")}` +
          `\n    pictures asked at ${widths.join(", ")}px   lowest contrast on the pictures ${minPic}:1, elsewhere ${min}:1   overflow ${r.overflow}px`,
      )

      if (SHOTS) {
        mkdirSync(SHOTS, { recursive: true })
        await page.evaluate(() => document.querySelectorAll("style").forEach((s) => { if (s.textContent.includes("color:transparent!important")) s.remove() }))
        await page.screenshot({ path: join(SHOTS, `pricing-${name}-${W}.png`), fullPage: true })
      }

      /* Monthly or yearly: the pill says which, the prices follow, and yearly Pro is shown, not sold, until its price exists. */
      const interval = await page.evaluate(() => {
        const pill = document.querySelector("[data-billing-interval]")
        const pro = document.querySelector('[data-plan-card="growth"]')
        const button = [...(pro?.querySelectorAll("[data-plan-action]") ?? [])].find((el) => !el.closest('[data-morph="off"]'))
        /* What is on screen: both intervals' lines are laid out in the same place (plan-cards Morph), and only the one in force is shown. */
        const shown = (el) => {
          if (!el) return ""
          const copy = el.cloneNode(true)
          copy.querySelectorAll('[data-morph="off"]').forEach((n) => n.remove())
          return copy.textContent.trim()
        }
        return {
          pill: pill?.getAttribute("data-billing-interval") ?? null,
          price: shown(pro?.querySelector("[data-plan-header] p")),
          yearlyNote: shown(pro).includes("billed yearly"),
          button: shown(button),
          disabled: !!button?.hasAttribute("disabled"),
          settled: /Current plan/.test(shown(button)),
        }
      })
      if (name === "yearly") {
        expect(interval.pill === "yearly" && interval.price === "$22" && interval.yearlyNote && interval.disabled && /opens soon/.test(interval.button ?? ""),
          "Yearly: $22 a month billed yearly, and Pro's button does not sell it yet", interval)
      } else {
        expect(interval.pill === "monthly" && (interval.price === "$29" || interval.settled), "the pill starts on Monthly, at the monthly price", interval)
      }
      await page.close()
    }
  }
  if (SHOTS) console.log(`\n  screenshots in ${SHOTS}`)
  console.log(broken === 0 ? "\nall pricing card checks passed\n" : `\n${broken} pricing card checks failed\n`)
  process.exitCode = broken === 0 ? 0 : 1
} finally {
  await browser.close()
  server.close()
  rmSync(out, { recursive: true, force: true })
  rmSync(stubs, { recursive: true, force: true })
}
