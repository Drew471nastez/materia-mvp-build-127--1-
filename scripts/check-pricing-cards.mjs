/**
 * ===========================================================================
 *  THE TWO PLAN CARDS, MEASURED
 * ===========================================================================
 * Pricing went from three plans to two, Free and Pro, drawn by one component
 * (components/billing/plan-cards.tsx) on every surface that offers a plan.
 * The brief for how they look is a list of claims about pixels, so they are
 * measured here rather than asserted:
 *
 *   - exactly two cards, side by side on a desktop and stacked on a phone
 *   - equal heights when side by side
 *   - nothing runs off the side of the page
 *   - Pro stands apart by one flat surface: Storelib's near-black (#1a1a2e),
 *     with Free on white; no background image on either, no badge floated
 *     over a corner, and the plan somebody is on marked in line
 *   - each card works one $50 sale through, and the numbers are the fee
 *     table's own (lib/billing/fee-calculator.ts), not typed into the card
 *   - side by side, the price, the sale and the button of both cards sit on
 *     the same lines
 *   - every button is at least 44px tall
 *   - every piece of text reaches 4.5:1 against what it sits on
 *
 * It renders the marketing pricing section, onboarding's plan step (the
 * compact cards, idle and while a plan is being set up) and the in-app
 * upgrade page (for somebody on Free, and for somebody still on the earlier
 * $99 plan) at 390px and 1280px, and writes a screenshot of each.
 *
 *   node scripts/check-pricing-cards.mjs
 *   SHOTS=/some/dir node scripts/check-pricing-cards.mjs   # keep screenshots
 *
 * No production build is needed. The stylesheet is compiled from
 * app/globals.css with the same Tailwind PostCSS plugin the build uses, so
 * the arbitrary values in the cards are always present and current. The page
 * font is next/font's Inter in the real app; here it falls back to the
 * system sans, which moves text by a pixel or two and nothing else.
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import postcss from "postcss"
import tailwind from "@tailwindcss/postcss"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const out = mkdtempSync(join(tmpdir(), "storelib-pricing-"))
const SHOTS = process.env.SHOTS

const fail = (m) => {
  console.error(m)
  process.exit(1)
}
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}. Set CHROMIUM=/path/to/chromium.`)

const cssPath = join(root, "app/globals.css")
const css = (await postcss([tailwind({ base: root })]).process(readFileSync(cssPath, "utf8"), { from: cssPath })).css

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

const bundle = join(out, "probe.js")
try {
  execFileSync(
    "pnpm",
    ["exec", "esbuild", join(root, "scripts/render-pricing-cards-probe.tsx"),
     "--bundle", "--platform=node", "--format=cjs", "--jsx=automatic", "--log-level=error",
     `--outfile=${bundle}`,
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

const PROBE = (W) => `<script>
  const box = (el) => el.getBoundingClientRect()
  /* rgb() gives 0 to 255. A colour with an alpha can come back as
     oklab(L a b / A) or color(srgb r g b / A); both are converted to
     0 to 255 here, or a translucent white reads as black. */
  const parse = (c) => {
    const n = (c.match(/-?[\\d.]+(?:e-?\\d+)?/g) || []).map(Number)
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
  /** The colour actually behind an element: the first ancestor that paints one. */
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
    overflow: Math.max(0, shell.scrollWidth - shell.clientWidth),
    cards: cards.map((el) => {
      const b = box(el), c = getComputedStyle(el)
      return {
        id: el.dataset.planCard,
        left: Math.round(b.left), right: Math.round(${W} - b.right),
        top: Math.round(b.top), bottom: Math.round(b.bottom),
        width: Math.round(b.width), height: Math.round(b.height),
        border: c.borderTopColor, borderWidth: parseFloat(c.borderTopWidth),
        shadow: c.boxShadow, bg: c.backgroundColor, bgImage: c.backgroundImage,
        radius: parseFloat(c.borderTopLeftRadius),
      }
    }),
    buttons: [...document.querySelectorAll("[data-plan-action]")].map((el) => ({
      text: el.textContent.trim(), h: Math.round(box(el).height), w: Math.round(box(el).width),
      bg: getComputedStyle(el).backgroundColor,
    })),
    /* A screen reader's words (sr-only) are positioned out of sight on purpose and draw nothing. */
    positioned: [...document.querySelectorAll("[data-plan-card] *")].filter((el) => getComputedStyle(el).position === "absolute" && !el.classList.contains("sr-only")).length,
    examples: [...document.querySelectorAll("[data-plan-example]")].map((el) => ({ id: el.dataset.planExample, text: el.textContent, top: Math.round(box(el).top) })),
    prices: [...document.querySelectorAll("[data-plan-card]")].map((el) => Math.round(box(el.querySelector("p.flex")).top)),
    actionTops: [...document.querySelectorAll("[data-plan-action]")].map((el) => Math.round(box(el).top)),
    current: [...document.querySelectorAll("[data-plan-current]")].map((el) => el.closest("[data-plan-card]").dataset.planCard),
    contrast: [],
  }

  // Every element that paints its own text, anywhere on the page under test.
  for (const el of shell.querySelectorAll("*")) {
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
    if (!own) continue
    const b = box(el)
    if (!b.width || !b.height) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === "hidden" || cs.display === "none") continue
    const fg = parse(cs.color).slice(0, 3)
    const k = ratio(fg, ground(el))
    r.contrast.push({ text: el.textContent.trim().slice(0, 36), k: Math.round(k * 100) / 100 })
  }

  document.title = JSON.stringify(r)
</script>`

/**
 * AnimateOnScroll starts its children at opacity 0 and waits for an
 * IntersectionObserver that a static render never runs. The page under test
 * is the settled one, so that starting state is overridden here.
 */
const SETTLED = `[data-probe-shell] div[style*="opacity"]{opacity:1!important;transform:none!important}`

let broken = 0
const expect = (ok, what, got = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${got}`}`)
  if (!ok) broken++
}

try {
  for (const name of ["marketing", "onboarding", "onboarding-loading", "upgrade", "upgrade-legacy"]) {
    const body = readFileSync(join(out, `${name}.html`), "utf8")
    for (const W of [390, 1280]) {
      const html = join(out, `${name}-${W}.html`)
      writeFileSync(
        html,
        `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style>
<style>*{box-sizing:border-box}body{margin:0;width:${W}px;background:#f8f9fa;font-family:Inter,system-ui,sans-serif}${SETTLED}</style>
</head><body><div data-probe-shell style="width:${W}px;overflow-x:auto">${body}</div>${PROBE(W)}</body></html>`,
      )

      const dom = execFileSync(
        CHROMIUM,
        ["--headless=new", "--no-sandbox", "--disable-gpu", `--window-size=${W},1000`,
         "--force-prefers-reduced-motion", "--virtual-time-budget=2000", "--dump-dom", `file://${html}`],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      )
      const raw = /<title>([\s\S]*?)<\/title>/.exec(dom)?.[1]
      if (!raw) fail(`${name} at ${W}px did not render.`)
      const r = JSON.parse(raw.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"))

      if (SHOTS) {
        mkdirSync(SHOTS, { recursive: true })
        const shot = join(SHOTS, `${process.env.SHOTS_PREFIX ?? "pricing-"}${name}-${W}.png`)
        execFileSync(
          CHROMIUM,
          ["--headless=new", "--no-sandbox", "--disable-gpu", `--window-size=${W},${W < 640 ? 2000 : 1250}`,
           "--force-prefers-reduced-motion", "--virtual-time-budget=2000", "--hide-scrollbars",
           `--screenshot=${shot}`, `file://${html}`],
          { stdio: "ignore" },
        )
      }

      console.log(`\n${name}, at ${W}px`)
      const [free, pro] = r.cards
      expect(r.cards.length === 2 && free?.id === "free" && pro?.id === "growth", "two cards: Free, then Pro (growth)", r.cards.map((c) => c.id).join(", "))
      if (r.cards.length !== 2) continue

      if (W >= 768) {
        expect(free.top === pro.top && free.left < pro.left, "side by side", `tops ${free.top}/${pro.top}, lefts ${free.left}/${pro.left}`)
        expect(Math.abs(free.height - pro.height) <= 1, "equal heights", `${free.height}px and ${pro.height}px`)
      } else {
        if (name === "upgrade") expect(free.top >= pro.bottom, "stacked, Pro first for somebody on Free (what they came for)", `Pro ends ${pro.bottom}, Free starts ${free.top}`)
        else expect(pro.top >= free.bottom, "stacked, Free above Pro", `Free ends ${free.bottom}, Pro starts ${pro.top}`)
        expect(free.width === pro.width, "the same width", `${free.width}px and ${pro.width}px`)
        expect(free.left >= 16 && free.right >= 16, "at least 16px from each edge", `${free.left}/${free.right}px`)
      }
      expect(r.overflow === 0, "the page does not scroll sideways", `${r.overflow}px off the side`)

      expect(free.bg === "rgb(255, 255, 255)" && pro.bg === "rgb(26, 26, 46)", "Free on white, Pro on Storelib's near-black", `${free.bg} / ${pro.bg}`)
      expect(free.bgImage === "none" && pro.bgImage === "none", "one flat colour each, no background image", `${free.bgImage} / ${pro.bgImage}`)
      expect(free.borderWidth === pro.borderWidth && pro.borderWidth <= 1, "the same 1px border weight", `${free.borderWidth}/${pro.borderWidth}`)
      expect(free.shadow !== pro.shadow, "Pro sits a little higher than Free", `${pro.shadow} vs ${free.shadow}`)

      const [exFree, exPro] = r.examples
      expect(/6% \+ \$0\.25/.test(exFree?.text ?? "") && /\$46\.75/.test(exFree?.text ?? ""), "Free works a $50 sale through: 6% + $0.25, you keep $46.75", exFree?.text)
      expect(/3% \+ \$0\.25/.test(exPro?.text ?? "") && /\$48\.25/.test(exPro?.text ?? "") && /\+\$1\.50/.test(exPro?.text ?? ""), "Pro: 3% + $0.25, you keep $48.25, $1.50 more", exPro?.text)
      if (W >= 768) {
        expect(r.prices[0] === r.prices[1] && exFree.top === exPro.top && r.actionTops[0] === r.actionTops[1],
          "price, sale and button on the same lines across both cards", `prices ${r.prices}, sales ${exFree.top}/${exPro.top}, buttons ${r.actionTops}`)
      }
      if (name === "upgrade") expect(r.current.length === 1 && r.current[0] === "free", "the plan somebody is on is marked, in line", JSON.stringify(r.current))
      if (name === "marketing") expect(r.current.length === 0, "a visitor's cards mark no plan as theirs", JSON.stringify(r.current))
      if (name === "onboarding-loading") {
        const busy = r.buttons.find((b) => /Processing/.test(b.text))
        expect(Boolean(busy) && r.buttons.every((b) => b.h === r.buttons[0].h), "a plan being set up says so, and the button keeps its size", r.buttons.map((b) => `"${b.text}" ${b.h}px`).join("; "))
      }
      expect(r.positioned === 0, "no badge floated over a card", `${r.positioned} absolutely positioned`)
      expect(free.radius <= 16 && pro.radius <= 16, "corners no rounder than the app's cards (16px)", `${free.radius}/${pro.radius}px`)

      const short = r.buttons.filter((b) => b.h < 44)
      expect(r.buttons.length === 2 && short.length === 0, "both buttons are 44px or taller", r.buttons.map((b) => `"${b.text}" ${b.h}px`).join("; "))

      const low = r.contrast.filter((c) => c.k < 4.5)
      const min = Math.min(...r.contrast.map((c) => c.k))
      expect(low.length === 0, `every text reaches 4.5:1 (${r.contrast.length} checked, lowest ${min})`, low.slice(0, 5).map((c) => `"${c.text}" ${c.k}`).join("; "))

      console.log(
        `    cards ${free.width}x${free.height} / ${pro.width}x${pro.height}px   buttons ${r.buttons.map((b) => `${b.h}px "${b.text}"`).join(", ")}` +
          `\n    Free border ${free.border}   Pro border ${pro.border}   lowest contrast ${min}:1   overflow ${r.overflow}px`,
      )
    }
  }
  if (SHOTS) console.log(`\n  screenshots in ${SHOTS}`)
  console.log(broken === 0 ? "\nall pricing card checks passed\n" : `\n${broken} pricing card checks failed\n`)
  process.exitCode = broken === 0 ? 0 : 1
} finally {
  rmSync(out, { recursive: true, force: true })
  rmSync(stubs, { recursive: true, force: true })
}
