/**
 * ===========================================================================
 *  THE OWNER'S MATERIA THEME, AS ITS STORE SERVES IT (round 14)
 * ===========================================================================
 * The probes before round 14 ran a stand-in: tests/fixtures/shopify-materia,
 * a hundred lines of Liquid with a few lines of script. The owner's store
 * (https://andrewrullz.storelib.com, the imported Materia theme) loads 50
 * files of its own: 1.8MB of CSS and JS (theme.js alone is 350KB, Swiper,
 * Motion, a cart drawer, popups), and its home page is 900KB of markup in 26
 * sections. A freeze that only shows with that weight was never measured.
 *
 * tests/fixtures/materia-live holds the store's public home page and every
 * theme file it loads, as fetched (REFRESH=1 fetches them again). They are
 * made into a Shopify theme here and imported through the real converter:
 *
 *   layout/theme.liquid   the page's own <head> and the markup around its
 *                         sections, with each theme file by `asset_url`
 *   sections/<id>.liquid  each section's markup as served, kept whole in
 *                         {% raw %}, its wrapper tag and classes in its
 *                         schema, plus two text settings printed in a hidden
 *                         mark, `probe` as its text and `probe_attr` as a
 *                         data- attribute (one the theme's scripts could
 *                         read, which the canvas starts the section again
 *                         for), so an edit can be read in the canvas; the header, footer and overlay groups and
 *                         templates/index.json as the page orders them
 *   config                one theme colour (`probe_color`) printed as a CSS
 *                         variable, and one text (`probe_text`)
 *
 * What Storelib itself adds to a served page (data-storelib and data-sl
 * scripts and styles, its import map) is left out: the canvas adds its own.
 * Same shape as canvas-probe-kit.mjs importedTheme(): { settings, pages,
 * sources, files, all }. scripts/materia-live-kit.mjs (the canvas scroll
 * probe's) mirrors the live pages into a temporary directory at each run;
 * this one is committed, so a run measures the same files every time, and
 * carries the settings an incoming change writes.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import JSZip from "jszip"

const root = process.cwd()
export const LIVE_DIR = join(root, "tests/fixtures/materia-live")
const STORE = "https://andrewrullz.storelib.com"
const ASSET = /\/api\/site-theme\/assets\/[^/"'\s)]+\/[^/"'\s)]+\/([A-Za-z0-9._-]+)/g

/** The store's home page and the theme files it loads, fetched again (public, signed out). */
export async function refreshLive() {
  mkdirSync(join(LIVE_DIR, "assets"), { recursive: true })
  const html = await (await fetch(STORE, { headers: { "user-agent": "Mozilla/5.0" } })).text()
  writeFileSync(join(LIVE_DIR, "home.html"), html)
  const urls = [...new Set([...html.matchAll(ASSET)].map((m) => m[0]))]
  const seen = new Set()
  for (let i = 0; i < urls.length; i++) {
    const u = urls[i]
    const r = await fetch(STORE + u)
    if (!r.ok) continue
    const body = Buffer.from(await r.arrayBuffer())
    writeFileSync(join(LIVE_DIR, "assets", u.split("/").pop()), body)
    /* A module's own imports (theme.js imports ./cart-components.js): without them the module never runs. */
    if (u.endsWith(".js")) for (const m of String(body).matchAll(/(?:import|from)\s*\(?\s*["']\.\/([A-Za-z0-9._-]+\.js)["']/g)) {
      const next = u.replace(/[^/]+$/, m[1])
      if (!seen.has(next)) { seen.add(next); urls.push(next) }
    }
  }
}

/* Text kept as text by the theme's Liquid, with each theme file's address made by asset_url. */
const rawWithAssets = (text) => `{% raw %}${text.replace(/\{%-?\s*endraw\s*-?%\}/g, "").replace(ASSET, (_, name) => `{% endraw %}{{ '${name}' | asset_url }}{% raw %}`)}{% endraw %}`

/* Storelib's own additions to a served page: left out, the canvas adds its own. */
const STORELIB_OWN = /<(script|style)\b[^>]*\b(data-storelib|data-sl-|type="importmap")[^>]*>[\s\S]*?<\/\1>|<link\b[^>]*\b(data-storelib|id="sl-render-blocker")[^>]*>/g

/** Where the element opened at `start` closes (its tag name counted, scripts, styles and comments skipped). */
function closeOf(html, start, tag) {
  const re = new RegExp(`<!--[\\s\\S]*?-->|<script\\b[\\s\\S]*?<\\/script>|<style\\b[\\s\\S]*?<\\/style>|<(\\/?)${tag}\\b[^>]*>`, "gi")
  re.lastIndex = start
  let depth = 0
  for (let m; (m = re.exec(html)); ) {
    if (m[1] === undefined) continue
    depth += m[1] === "/" ? -1 : 1
    if (depth === 0) return m.index + m[0].length
  }
  return html.length
}

export async function materiaLiveTheme({ edit = null } = {}) {
  if (process.env.REFRESH === "1" || !existsSync(join(LIVE_DIR, "home.html"))) await refreshLive()
  const page = readFileSync(join(LIVE_DIR, "home.html"), "utf8")
  const zip = new JSZip()
  for (const n of readdirSync(join(LIVE_DIR, "assets"))) zip.file(`assets/${n}`, readFileSync(join(LIVE_DIR, "assets", n)))

  const bodyAt = page.indexOf("<body")
  const bodyOpenEnd = page.indexOf(">", bodyAt) + 1
  const head = page.slice(page.indexOf("<meta charset"), page.lastIndexOf("</head>", bodyAt)).replace(STORELIB_OWN, "")
  const bodyTag = page.slice(bodyAt, bodyOpenEnd)
  const bodyEnd = page.lastIndexOf("</body>")
  const body = page.slice(bodyOpenEnd, bodyEnd)

  /* Each section: its markup, its wrapper and its group. */
  const found = []
  const open = /<(div|section) id="shopify-section-([^"]+)" class="([^"]*)"[^>]*>/g
  for (let m; (m = open.exec(body)); ) {
    const end = closeOf(body, m.index, m[1])
    const inner = body.slice(m.index + m[0].length, end - `</${m[1]}>`.length)
    const classes = m[3].split(/\s+/).filter(Boolean)
    const group = classes.find((c) => c.startsWith("shopify-section-group-"))?.replace("shopify-section-group-", "").replace("-group", "") ?? null
    found.push({ start: m.index, end, tag: m[1], id: m[2], classes: classes.filter((c) => c !== "shopify-section" && !c.startsWith("shopify-section-group-")), group, inner })
    open.lastIndex = end
  }
  const typeOf = (s) => `live-${s.id.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`.slice(0, 60)
  for (const s of found) {
    const schema = { name: s.id, tag: s.tag, ...(s.classes.length ? { class: s.classes.join(" ") } : {}), settings: [{ type: "text", id: "probe", label: "Probe", default: "" }, { type: "text", id: "probe_attr", label: "Probe attribute", default: "" }], presets: [{ name: s.id }] }
    zip.file(`sections/${typeOf(s)}.liquid`, `<i hidden class="probe-mark" data-probe-attr="{{ section.settings.probe_attr | default: '-' }}">{{ section.settings.probe | default: '-' }}</i>${rawWithAssets(s.inner)}\n{% schema %}\n${JSON.stringify(schema)}\n{% endschema %}\n`)
  }
  const groupFile = (g) => {
    const list = found.filter((s) => s.group === g)
    return JSON.stringify({ type: g, name: g, sections: Object.fromEntries(list.map((s) => [s.id, { type: typeOf(s), settings: {} }])), order: list.map((s) => s.id) })
  }
  for (const g of ["header", "footer", "overlay"]) zip.file(`sections/${g}-group.json`, groupFile(g))
  const main = found.filter((s) => !s.group)
  zip.file("templates/index.json", JSON.stringify({ sections: Object.fromEntries(main.map((s) => [s.id, { type: typeOf(s), settings: {} }])), order: main.map((s) => s.id) }))

  /* The markup around the sections, as served: each group where its first section was, the template's in <main>. */
  let around = ""
  let at = 0
  const placed = new Set()
  for (const s of found) {
    around += rawWithAssets(body.slice(at, s.start).replace(STORELIB_OWN, ""))
    const slot = s.group ? `{% sections '${s.group}-group' %}` : "{{ content_for_layout }}"
    if (!placed.has(slot)) { around += slot; placed.add(slot) }
    at = s.end
  }
  around += rawWithAssets(body.slice(at).replace(STORELIB_OWN, ""))
  zip.file("layout/theme.liquid", `<!doctype html>
<html lang="en">
<head>
{{ content_for_header }}
${rawWithAssets(head)}
<style>:root{--probe-color:{{ settings.probe_color }};}</style>
</head>
${bodyTag}<i hidden data-probe-text="{{ settings.probe_text }}"></i>${around}
</body>
</html>
`)
  zip.file("config/settings_schema.json", JSON.stringify([
    { name: "theme_info", theme_name: "Materia", theme_version: "live", theme_author: "owner" },
    { name: "Probe", settings: [{ type: "color", id: "probe_color", label: "Probe colour", default: "#111111" }, { type: "text", id: "probe_text", label: "Probe text", default: "" }] },
  ]))
  zip.file("config/settings_data.json", JSON.stringify({ current: { probe_color: "#111111", probe_text: "" } }))
  zip.file("locales/en.default.json", "{}")
  if (edit) await edit(zip)

  const { convertShopifyTheme } = await import("../lib/storelib-theme/shopify/convert.ts")
  const r = await convertShopifyTheme(zip)
  if (!r.ok) throw new Error(r.error)
  const t = r.theme
  const sources = Object.fromEntries(Object.entries(t.files).filter(([p]) => p.endsWith(".storelib")))
  const files = Object.fromEntries(Object.entries(t.files).filter(([p, x]) => p.startsWith("shopify/") && !x.startsWith("base64:") && !/^shopify\/locales\/(?!.*\.default(\.schema)?\.json$)/.test(p)))
  const pages = Object.fromEntries(t.pages.map((p) => [p.page_key, p.sections]))
  return { settings: t.settings, pages, sources, files, all: t.files, sectionIds: found.map((s) => s.id) }
}
