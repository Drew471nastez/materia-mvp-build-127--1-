/**
 * ===========================================================================
 *  A SECTION DRAWN WITH ITS SCHEME AS VARIABLES LOOKS AS IT DOES WITH COLOURS
 * ===========================================================================
 * Round 36 (lib/storelib-theme/scheme-vars.ts): the builder's canvas draws a
 * .storelib section's scheme colours as `var(--scheme-*)`, the variables its
 * root holds, where its template allows; the published page prints the
 * colours. This holds the two to the same picture, measured: every section
 * the library adds, under every built-in scheme, a scheme with a gradient, a
 * section with its own colours over its scheme, each drawn both ways into
 * headless Chromium with the app's stylesheet and the theme's variables, and
 * every computed style of every element compared.
 *
 *   npx tsx --conditions=react-server scripts/check-scheme-vars.ts
 *   ONLY=<regexp>   only the section types that match
 */
import puppeteer from "puppeteer-core"
import { renderStorelibSection } from "../lib/website-builder/storelib-runtime"
import { STORELIB_SCHEMAS } from "../lib/website-builder/storelib-schemas"
import { ADDABLE_SECTIONS } from "../lib/website-builder/section-schemas"
import { THEME_SETTINGS_GROUPS } from "../lib/website-builder/theme-settings-schema"
import { themeVars } from "../lib/website-builder/theme-css"
import { BUILT_IN_SCHEME_KEYS } from "../lib/storelib-theme/color-schemes"
import type { SectionInstance, ThemeSettingsValues } from "../lib/website-builder/types"

const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null
const base = Object.fromEntries(THEME_SETTINGS_GROUPS.flatMap((g) => (g.fields ?? []).filter((f) => f.default !== undefined).map((f) => [f.id, f.default]))) as Record<string, unknown>

/** What Add Section puts on the page: the preset over the schema's defaults (tests/storelib-parity.test.ts asAdded). */
function asAdded(type: string, extra: Record<string, unknown> = {}): SectionInstance {
  const id = `${type}-1`
  const schema = STORELIB_SCHEMAS[type]
  const settings: Record<string, unknown> = {}
  for (const f of schema.fields ?? []) if (f.default !== undefined) settings[f.id] = f.default
  const preset = schema.presets?.[0]
  Object.assign(settings, preset?.settings ?? {}, extra)
  const blocks = (preset?.blocks ?? []).map((b, i) => {
    const def = (schema.blocks ?? []).find((d) => d.type === b.type)
    const bs: Record<string, unknown> = {}
    for (const f of def?.fields ?? []) if (f.default !== undefined) bs[f.id] = f.default
    Object.assign(bs, b.settings ?? {})
    return { id: `${id}-b${i}`, type: b.type, settings: bs }
  })
  return { id, type, settings, blocks } as unknown as SectionInstance
}

const GRADIENT = { white: { gradient: "linear-gradient(135deg, #fde68a 0%, #f472b6 100%)" } }
const CASES: { name: string; theme: Record<string, unknown>; settings: Record<string, unknown> }[] = [
  ...BUILT_IN_SCHEME_KEYS.map((k) => ({ name: k, theme: base, settings: { color_scheme: k } })),
  { name: "white with a gradient", theme: { ...base, color_schemes: GRADIENT }, settings: { color_scheme: "white" } },
  { name: "dark with its own colours", theme: base, settings: { color_scheme: "dark", color_overrides: { background: "#123456", heading: "#fedcba", primary_button_background: "#ff5500" } } },
]

/** Every element's computed style, every property, in document order. */
const READ = String.raw`(() => {
  const out = []
  for (const el of document.body.querySelectorAll("*")) {
    const cs = getComputedStyle(el)
    const props = {}
    for (let i = 0; i < cs.length; i++) props[cs[i]] = cs.getPropertyValue(cs[i])
    for (const pseudo of ["::before", "::after", "::placeholder", "::marker"]) {
      const ps = getComputedStyle(el, pseudo)
      props[pseudo + " color"] = ps.color; props[pseudo + " background"] = ps.background; props[pseudo + " border-color"] = ps.borderColor; props[pseudo + " content"] = ps.content
    }
    out.push({ tag: el.tagName, props })
  }
  return out
})()`

async function main() {
  const { appCss } = (await import("./probe-css.mjs")) as { appCss: (root?: string) => Promise<string> }
  const css = await appCss(process.cwd())
  const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox", "--disable-gpu"] })
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 900 })
  let types = 0, drawn = 0, asVars = 0, elements = 0
  const differ: string[] = []
  const literal: string[] = []
  try {
    for (const type of ADDABLE_SECTIONS) {
      if (ONLY && !ONLY.test(type)) continue
      if (!STORELIB_SCHEMAS[type]) continue
      types++
      for (const c of CASES) {
        const instance = asAdded(type, c.settings)
        const theme = c.theme as unknown as ThemeSettingsValues
        const page0 = { template: "index", in_editor: true }
        const pub = renderStorelibSection(instance, theme, page0, {})
        const can = renderStorelibSection(instance, theme, page0, {}, undefined, undefined, undefined, { schemeVariables: true })
        if (pub.ok === false || can.ok === false) continue
        drawn++
        if (!can.html.includes("data-scheme-vars")) { if (c.name === "white") literal.push(type); continue }
        asVars++
        const vars = Object.entries(themeVars(theme)).map(([k, v]) => `${k}:${v}`).join(";")
        const doc = (r: { html: string; css: string }) => `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style><style>${r.css}</style></head><body><div data-theme-root style="${vars.replace(/"/g, "&quot;")}">${r.html.replace(/\sdata-scheme-vars(?=[\s>])/, "")}</div></body></html>`
        const read = async (html: string) => {
          await page.setContent(html, { waitUntil: "load" })
          return (await page.evaluate(READ)) as { tag: string; props: Record<string, string> }[]
        }
        const a = await read(doc(pub))
        /* SABOTAGE=1: the heading drawn with the text's variable, to see the comparison catch it. */
        const b = await read(doc(process.env.SABOTAGE ? { ...can, html: can.html.split("var(--scheme-heading)").join("var(--scheme-text)") } : can))
        elements += a.length
        if (a.length !== b.length) { differ.push(`${type} (${c.name}): ${a.length} elements against ${b.length}`); continue }
        for (let i = 0; i < a.length; i++) {
          const pa = a[i].props, pb = b[i].props
          const bad = Object.keys({ ...pa, ...pb }).filter((k) => pa[k] !== pb[k])
          if (bad.length) { differ.push(`${type} (${c.name}): <${a[i].tag.toLowerCase()}> #${i} ${bad.slice(0, 3).map((k) => `${k}: ${pa[k]} / ${pb[k]}`).join("; ")}`); break }
        }
      }
    }
  } finally {
    await browser.close()
  }
  console.log(`\n${types} section types of the library drawn from .storelib files, ${CASES.length} cases each: ${drawn} drawings, ${asVars} with their scheme as variables, ${elements} elements compared`)
  console.log(`types that print their colours (a template that works one out): ${literal.length ? literal.join(", ") : "none"}`)
  if (differ.length) {
    console.log(`\nDIFFERENT, ${differ.length}:\n  ${differ.slice(0, 20).join("\n  ")}`)
    process.exit(1)
  }
  console.log("every computed style of every element the same both ways")
}
main().catch((e) => { console.error(e); process.exit(1) })
