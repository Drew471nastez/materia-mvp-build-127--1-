/**
 * An inline native form inside a section of the site's own takes that
 * section's colours (lib/website-builder/form-islands.ts formSurfaceVars,
 * components/website-builder/sections/form-surface.ts). The report: a booking
 * form on a near black band, its month, dates and title in Storelib's dark
 * navy, unreadable.
 *
 *   1. Pure: the variables for a light ink and a dark one, with and without
 *      a flat ground.
 *   2. In a real browser, the form's own colour expressions (the classes of
 *      components/forms/public-form.tsx and booking-picker.tsx, as CSS) on a
 *      dark band, a light band and a picture: every text at 4.5:1 or better
 *      against what is behind it, the button readable, and a section that
 *      names its own --sheet-ink left alone.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx tests/form-surface.test.ts
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { formSurfaceVars, luminance, rgbOf } from "@/lib/website-builder/form-islands"
import { chromePlatformCss } from "@/lib/website-builder/theme-css"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 700)}`}`) }
}
const root = process.cwd()

/* The form's own colour expressions, as public-form.tsx and booking-picker.tsx write them. */
const FORM = `<div class="f"><h2 class="ink">Book a call</h2><p class="muted">Step 1 of 2</p><p class="body">I agree to be contacted.</p><p class="day">16</p><p class="off">15</p><input class="field" value="Ana"><button class="btn">Continue</button></div>`
const FORM_CSS = `.f{color:var(--sheet-ink,#1a1a2e)}.ink{color:var(--sheet-ink,#1a1a2e)}.muted{color:var(--sheet-muted,#6b7280)}.body{color:var(--sheet-body,#4b5563)}.day{color:var(--sheet-ink,#1a1a2e)}.off{color:color-mix(in srgb,var(--sheet-ink,#1a1a2e) 32%,transparent)}.field{border:1px solid var(--form-line,#dfe2e7);background:var(--form-field,#fff);color:var(--sheet-ink,#1a1a2e)}.btn{background:var(--sheet-ink,#1a1a2e);color:var(--sheet-on-ink,#fff);border:0}`

async function main() {
  console.log("\n1. Pure")
  const dark = formSurfaceVars("rgb(245, 245, 243)", "rgb(17, 17, 17)")
  check("light ink on a dark ground: the ink is the section's, what sits on it is the ground", dark["--sheet-ink"] === "rgb(245, 245, 243)" && dark["--sheet-on-ink"] === "rgb(17, 17, 17)")
  check("  lines, fields and quiet text are mixed from the ink, never a fixed grey", ["--sheet-muted", "--sheet-body", "--form-line", "--form-field"].every((k) => dark[k].includes("rgb(245, 245, 243)")))
  check("  the error colour reads on dark", dark["--sheet-error"] !== "#b42318")
  check("dark ink keeps Storelib's error red", formSurfaceVars("rgb(17, 17, 17)", "rgb(255, 255, 255)")["--sheet-error"] === "#b42318")
  check("no flat ground (a picture): what sits on the ink is the colour that reads on it", formSurfaceVars("rgb(255, 255, 255)", null)["--sheet-on-ink"] === "#111111" && formSurfaceVars("rgb(20, 20, 20)", null)["--sheet-on-ink"] === "#ffffff")
  check("rgbOf reads rgb, rgba and the slash form, and nothing else", rgbOf("rgb(1, 2, 3)")?.b === 3 && rgbOf("rgba(1, 2, 3, 0.5)")?.a === 0.5 && rgbOf("rgb(1 2 3 / 50%)")?.a === 0.5 && rgbOf("oklch(0.5 0.1 20)") === null)
  check("luminance: white 1, black 0", Math.abs(luminance("rgb(255, 255, 255)") - 1) < 0.001 && luminance("rgb(0, 0, 0)") === 0)

  check("the form's own title keeps its size inside a section, whatever that section's h2 rule says", /\[data-storelib-native-form\] h2\{font-size:1\.25rem!important;/.test(chromePlatformCss("[data-storelib-theme]")))

  console.log("\n2. In a real browser")
  const chrome = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium"
  if (!existsSync(chrome)) { check("Chromium is here", false, chrome); return done() }
  const dir = join(root, ".form-surface-probe")
  mkdirSync(dir, { recursive: true })
  try {
    writeFileSync(join(dir, "entry.ts"), `import { dressFormSurface } from "@/components/website-builder/sections/form-surface"\n;(window as any).dress = dressFormSurface\n`)
    const { build } = await import("esbuild")
    await build({ entryPoints: [join(dir, "entry.ts")], bundle: true, format: "iife", alias: { "@": "." }, outfile: join(dir, "app.js"), logLevel: "error", absWorkingDir: root })
    const js = readFileSync(join(dir, "app.js"), "utf8")
    const band = (id: string, style: string, attrs = "") => `<section id="${id}" style="${style};padding:40px"><div class="mark" data-presentation="inline" ${attrs}>${FORM}</div></section>`
    const html = `<!doctype html><html><head><style>body{margin:0;font:16px Arial}${FORM_CSS}</style></head><body>
${band("dark", "background:#111111;color:#f5f5f3")}
${band("light", "background:#f5f5f3;color:#14201a")}
${band("green", "background:#1f3d2f;color:#ffffff")}
${band("own", "background:#111111;color:#f5f5f3;--sheet-ink:#ffd400")}
<script>${js}</script></body></html>`
    const puppeteer = (await import("puppeteer-core")).default
    const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-sandbox"] })
    try {
      const p = await browser.newPage()
      await p.setContent(html)
      /* tsx names the functions it compiles with a helper the page does not have. */
      await p.evaluate("window.__name = (f) => f")
      const measure = (dress: boolean) => p.evaluate((dress) => {
        /* A mixed colour computes as color(srgb r g b / a), channels 0 to 1; a plain one as rgb(). */
        const parse = (c: string) => {
          const srgb = /color\(srgb\s+([^)]+)\)/.exec(c)
          if (srgb) { const v = srgb[1].split(/[\s/]+/).filter(Boolean).map(Number); return { r: v[0] * 255, g: v[1] * 255, b: v[2] * 255, a: v[3] ?? 1 } }
          const m = /rgba?\(([^)]+)\)/.exec(c)
          if (!m) throw new Error(`unread colour ${c}`)
          const v = m[1].split(/[\s,/]+/).filter(Boolean).map(Number)
          return { r: v[0], g: v[1], b: v[2], a: v[3] ?? 1 }
        }
        const over = (top: { r: number; g: number; b: number; a: number }, under: { r: number; g: number; b: number }) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a) })
        const lum = (c: { r: number; g: number; b: number }) => { const l = (v: number) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }; return 0.2126 * l(c.r) + 0.7152 * l(c.g) + 0.0722 * l(c.b) }
        const ratio = (a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
        const out: Record<string, Record<string, number | string>> = {}
        for (const s of document.querySelectorAll<HTMLElement>("section")) {
          const mark = s.querySelector<HTMLElement>(".mark")!
          if (dress) (window as unknown as { dress: (el: HTMLElement, inline: boolean) => void }).dress(mark, true)
          const ground = parse(getComputedStyle(s).backgroundColor)
          const text = (sel: string) => +ratio(over(parse(getComputedStyle(s.querySelector(sel)!).color), ground), ground).toFixed(2)
          const btn = getComputedStyle(s.querySelector(".btn")!)
          const btnGround = over(parse(btn.backgroundColor), ground)
          out[s.id] = { ink: text(".ink"), muted: text(".muted"), body: text(".body"), day: text(".day"), field: text(".field"), button: +ratio(over(parse(btn.color), btnGround), btnGround).toFixed(2), buttonOnBand: +ratio(btnGround, ground).toFixed(2), marked: String(mark.hasAttribute("data-storelib-form-surface")), inkColor: getComputedStyle(s.querySelector(".ink")!).color }
        }
        return out
      }, dress)
      const before = await measure(false)
      check("before: on the dark band the title, dates and field text fail contrast (the report)", (before.dark.ink as number) < 1.5 && (before.dark.day as number) < 1.5, before.dark)
      const after = await measure(true)
      for (const id of ["dark", "light", "green"]) {
        const m = after[id]
        check(`${id} band: title, dates, body and field text at 4.5:1 or better`, [m.ink, m.day, m.body, m.field].every((v) => (v as number) >= 4.5), m)
        check(`${id} band:   quiet text at 4.5:1 or better`, (m.muted as number) >= 4.5, m)
        check(`${id} band:   the button reads on itself and stands off the band`, (m.button as number) >= 4.5 && (m.buttonOnBand as number) >= 3, m)
      }
      check("a section that names its own --sheet-ink is left alone", after.own.marked === "false" && after.own.inkColor === "rgb(255, 212, 0)", after.own)
      const again = await measure(true)
      check("dressing again changes nothing", JSON.stringify(again) === JSON.stringify(after))
    } finally {
      await browser.close()
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  done()
}
function done() {
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}
main().catch((e) => { console.error(e); process.exit(1) })
