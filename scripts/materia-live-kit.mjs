/**
 * ===========================================================================
 *  THE OWNER'S REAL MATERIA THEME, FROM ITS PUBLIC PAGES (round 14)
 * ===========================================================================
 * tests/fixtures/shopify-materia is a stand-in: a few hundred lines shaped
 * like Materia. The owner's store runs the real theme live at
 * https://andrewrullz.storelib.com (storelib.com/andrewrullz is the creator
 * page; the website is the subdomain), and every earlier canvas probe missed
 * what the owner feels because it never ran that theme's code.
 *
 * This takes the three public pages (home, a product, the catalog), their
 * stylesheets, scripts and pictures, exactly as any visitor gets them, and:
 *
 *   MIRROR   keeps every file in a cache directory with a manifest
 *            (MATERIA_LIVE_DIR, default <tmp>/storelib-materia-live), fetched
 *            once; nothing private is asked for, nothing is logged in to
 *   THEME    builds a Shopify theme of them for the editor's canvas: the
 *            layout is the page's real <head> and the markup around the
 *            sections, each section is its real drawn markup ({% raw %}, so
 *            nothing is drawn differently), the groups are the page's own
 *            (header, footer, overlay), the assets are the real files. What
 *            Storelib's live renderer adds itself (data-storelib-*, data-sl-*)
 *            is left out: the canvas adds its own; the theme's bundled
 *            {% stylesheet %} and {% javascript %}, its fonts and the store's
 *            style overrides are kept, they are the theme's look.
 *   LIVE     the same page as a visitor's browser gets it, Storelib's live
 *            scripts and all, for "theme cost" against "editor cost"
 *
 *   const kit = await materiaLive()           // fetched or read from the cache
 *   const compat = await kit.theme("home")    // "home" | "product" | "collection"
 *   kit.serve(url)                            // a mirrored file for a request, or null
 *   kit.liveHtml("home")                      // the live page's own HTML
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createHash } from "node:crypto"
import JSZip from "jszip"
import puppeteer from "puppeteer-core"

export const LIVE_ORIGIN = "https://andrewrullz.storelib.com"
export const LIVE_PAGES = { home: "/", product: "/products/pants-down", collection: "/collections/all" }
const DIR = process.env.MATERIA_LIVE_DIR ?? join(tmpdir(), "storelib-materia-live")

const dec = (s) => s.replace(/&amp;/g, "&")
const clean = (u) => u.split("#")[0]
function refs(text, base) {
  const out = []
  for (const m of text.matchAll(/(?:src|href|data-src|poster)="([^"]+)"/g)) out.push(m[1])
  for (const m of text.matchAll(/srcset="([^"]+)"/g)) for (const p of m[1].split(",")) out.push(p.trim().split(/\s+/)[0])
  for (const m of text.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) out.push(m[1])
  return out.map((u) => { try { return clean(new URL(dec(u), base).href) } catch { return null } }).filter(Boolean)
}
/* Files only: the site's assets, its pictures (Storelib's media, Shopify's CDN, the image optimizer), never another page. */
const isFile = (u) => /\/api\/site-theme\/assets\//.test(u) || /\/_next\/image\?/.test(u) || /^https:\/\/storelib\.com\/media\//.test(u) || /^https:\/\/cdn\.shopify\.com\//.test(u)

async function mirror() {
  mkdirSync(join(DIR, "files"), { recursive: true })
  const at = join(DIR, "manifest.json")
  if (existsSync(at)) return JSON.parse(readFileSync(at, "utf8"))
  const manifest = {}
  const seen = new Set()
  const queue = []
  const get = async (u) => {
    if (seen.has(u)) return
    seen.add(u)
    const r = await fetch(u, { headers: { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) Chrome/130 storelib-canvas-probe" } })
    const buf = Buffer.from(await r.arrayBuffer())
    const type = r.headers.get("content-type") || ""
    const file = createHash("sha1").update(u).digest("hex").slice(0, 16)
    writeFileSync(join(DIR, "files", file), buf)
    manifest[u] = { file, type, status: r.status, size: buf.length }
    if (/css|html/.test(type)) for (const x of refs(buf.toString("utf8"), u)) if (isFile(x) && !seen.has(x)) queue.push(x)
  }
  for (const p of Object.values(LIVE_PAGES)) await get(LIVE_ORIGIN + p)
  while (queue.length) await Promise.all(queue.splice(0, 8).map((u) => get(u).catch(() => {})))
  writeFileSync(at, JSON.stringify(manifest))
  return manifest
}

/* The page split as a browser parses it (DOMParser: nothing of it runs). */
async function split(html) {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] })
  try {
    const page = await browser.newPage()
    return await page.evaluate((html) => {
      const d = new DOMParser().parseFromString(html, "text/html")
      /* Storelib's own, left out: what the canvas adds itself. Kept: the theme's {% stylesheet %} and {% javascript %} as the renderer bundles them, its fonts and the store's own style overrides, which are the theme's look. */
      const kept = (el) => el.hasAttribute("data-storelib-bundle") || el.hasAttribute("data-storelib-font") || el.hasAttribute("data-storelib-overrides")
      const own = (el) => !kept(el) && ([...el.attributes].some((a) => /^data-(storelib|sl)(-|$)/.test(a.name)) || el.id === "sl-render-blocker" || el.id === "sl-page-end")
      const attrs = (el) => [...el.attributes].filter((a) => !/^data-sl(-|$)/.test(a.name)).map((a) => ` ${a.name}="${a.value.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"`).join("")
      const head = [...d.head.children].filter((el) => !own(el) && el.tagName !== "TITLE").map((el) => el.outerHTML).join("\n")
      const groupOf = (el) => { const m = /shopify-section-group-([a-z0-9_-]+?)(-group)?(\s|$)/.exec(el.className); return m ? m[1] : "" }
      const section = (el) => ({
        kind: "section", id: el.id.replace(/^shopify-section-/, ""), tag: el.tagName.toLowerCase(), group: groupOf(el),
        cls: el.className.split(/\s+/).filter((c) => c && c !== "shopify-section" && !/^shopify-section-group-/.test(c)).join(" "),
        html: el.innerHTML,
      })
      const body = []
      for (const el of d.body.children) {
        if (own(el)) continue
        if (el.classList.contains("shopify-section")) body.push(section(el))
        else if (el.tagName === "MAIN") body.push({ kind: "main", attrs: attrs(el), sections: [...el.children].filter((c) => c.classList.contains("shopify-section")).map(section) })
        else body.push({ kind: "raw", html: el.outerHTML })
      }
      return { htmlAttrs: attrs(d.documentElement), bodyAttrs: attrs(d.body), head, body }
    }, html)
  } finally {
    await browser.close()
  }
}

export async function materiaLive() {
  const manifest = await mirror()
  const read = (u) => { const m = manifest[u]; return m ? readFileSync(join(DIR, "files", m.file)) : null }
  const liveHtml = (key) => read(LIVE_ORIGIN + LIVE_PAGES[key])?.toString("utf8") ?? ""
  /* The assets by file name, as the theme's asset_url names them. */
  const assets = {}
  for (const u of Object.keys(manifest)) {
    const m = /\/api\/site-theme\/assets\/[^/]+\/[^/]+\/([^?#]+)$/.exec(u)
    if (m && manifest[u].status === 200) assets[decodeURIComponent(m[1])] = read(u).toString("utf8")
  }
  /* `key`: the page drawn as the home page; "all": the home page with the product and the catalog as pages of their own (going between pages). */
  async function theme(key = "home") {
    const all = key === "all"
    if (all) key = "home"
    const parts = await split(liveHtml(key))
    const zip = new JSZip()
    const raw = (s) => `{% raw %}${s}{% endraw %}`
    const groups = { header: [], footer: [], overlay: [] }
    const types = []
    const sectionFile = (s) => {
      const type = `live-${s.id.toLowerCase().replace(/[^a-z0-9_-]/g, "-")}`.slice(0, 60)
      const schema = { name: s.id, settings: [], ...(s.cls ? { class: s.cls } : {}), ...(s.tag !== "div" ? { tag: s.tag } : {}), presets: [{ name: s.id }] }
      zip.file(`sections/${type}.liquid`, `${raw(s.html)}\n{% schema %}\n${JSON.stringify(schema)}\n{% endschema %}\n`)
      types.push(type)
      return type
    }
    let layoutBody = ""
    const placed = new Set()
    for (const part of parts.body) {
      if (part.kind === "raw") layoutBody += raw(part.html)
      else if (part.kind === "main") {
        const order = [], sections = {}
        for (const s of part.sections) { sections[s.id] = { type: sectionFile(s), settings: {} }; order.push(s.id) }
        zip.file(`templates/${key === "home" ? "index" : key}.json`, JSON.stringify({ sections, order }))
        layoutBody += `<main${part.attrs}>{{ content_for_layout }}</main>`
      } else {
        const g = groups[part.group] ? part.group : "overlay"
        groups[g].push(part)
        if (!placed.has(g)) { placed.add(g); layoutBody += `{% sections '${g}-group' %}` }
      }
    }
    for (const [g, list] of Object.entries(groups)) {
      const sections = {}, order = []
      for (const s of list) { sections[s.id] = { type: sectionFile(s), settings: {} }; order.push(s.id) }
      zip.file(`sections/${g}-group.json`, JSON.stringify({ type: g === "overlay" ? "custom.overlay" : g, name: g, sections, order }))
    }
    /* The home template is the one the canvas opens: a product or the catalog is drawn as the home page, so each is measured the same way. */
    if (key !== "home") zip.file("templates/index.json", await zip.file(`templates/${key}.json`).async("string"))
    if (all) {
      for (const other of ["product", "collection"]) {
        const main = (await split(liveHtml(other))).body.find((x) => x.kind === "main")
        const order = [], sections = {}
        for (const sct of main?.sections ?? []) { sections[sct.id] = { type: sectionFile(sct), settings: {} }; order.push(sct.id) }
        zip.file(`templates/${other}.json`, JSON.stringify({ sections, order }))
      }
    }
    zip.file("layout/theme.liquid", `<!doctype html>\n<html${parts.htmlAttrs}>\n<head>\n<title>{{ page_title }}</title>\n{{ content_for_header }}\n${raw(parts.head)}\n</head>\n<body${parts.bodyAttrs}>\n${layoutBody}\n</body>\n</html>\n`)
    zip.file("config/settings_schema.json", JSON.stringify([{ name: "theme_info", theme_name: "Materia", theme_version: "live" }]))
    zip.file("config/settings_data.json", JSON.stringify({ current: {} }))
    zip.file("locales/en.default.json", "{}")
    for (const [name, text] of Object.entries(assets)) zip.file(`assets/${name}`, text)
    const { convertShopifyTheme } = await import("../lib/storelib-theme/shopify/convert.ts")
    const r = await convertShopifyTheme(zip)
    if (!r.ok) throw new Error(r.error)
    const t = r.theme
    const sources = Object.fromEntries(Object.entries(t.files).filter(([p]) => p.endsWith(".storelib")))
    const files = Object.fromEntries(Object.entries(t.files).filter(([p, x]) => p.startsWith("shopify/") && !x.startsWith("base64:") && !/^shopify\/locales\/(?!.*\.default(\.schema)?\.json$)/.test(p)))
    const pages = Object.fromEntries(t.pages.map((p) => [p.page_key, p.sections]))
    return { settings: t.settings, pages, sources, files, all: t.files, sectionCount: types.length }
  }
  /* A request answered from the mirror: the live origin's own paths, and absolute addresses. */
  const serve = (url) => {
    let u
    try { u = new URL(url) } catch { return null }
    const keys = [clean(url), LIVE_ORIGIN + u.pathname + u.search, clean(dec(url))]
    for (const k of keys) {
      const m = manifest[k]
      if (m && m.status === 200) return { status: 200, contentType: m.type || "application/octet-stream", body: readFileSync(join(DIR, "files", m.file)) }
    }
    return null
  }
  return { theme, serve, liveHtml, assets, dir: DIR }
}
