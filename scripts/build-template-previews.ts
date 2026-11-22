/**
 * ===========================================================================
 *  THE TEMPLATES' LIVE PREVIEWS: EACH WEBSITE, PRERENDERED TO STATIC FILES
 * ===========================================================================
 *   npx tsx scripts/build-template-previews.ts [template ...]
 *
 * Preview in the theme marketplace (app/(storelib)/app/website-builder/
 * themes/theme-preview.tsx) frames a template's real website. Drawing it per
 * request would import the theme's ~800 files in a function for one look, so
 * it is drawn here instead, once, the way scripts/build-theme-template-covers
 * .ts draws the covers: composed from theme-packages/, imported by the
 * converter Add uses and answered by the compat engine's answer() for the
 * template's sample shop with a catalogue, collections, a blog and policies
 * (scripts/theme-templates/fixtures.ts). No database, no live store.
 *
 * Every page a visitor can reach from the home page is written as HTML:
 * home, each product, each collection and the list of them, the template's
 * pages (about, contact, FAQ, a lookbook ...), the blog and its posts, the
 * policies, the cart and search. Then:
 *
 *   links      to a page written here go to its file; any other link (an
 *              account, a checkout, another site, mail) stays inert
 *   assets     the stylesheets, scripts, pictures and fonts the pages ask for
 *              are written once, named by their content, so the CDN holds
 *              them for a year: the base theme's under public/theme-previews/
 *              _base/a/, the template's own under public/theme-previews/
 *              <slug>/a/. Pictures wider than 1800px are made smaller, and the
 *              fonts are the font library's Latin files, served from here.
 *   repeats    a stylesheet or script written inline on two or more pages is
 *              written once as a file, so each page is mostly its own markup
 *   nothing    no form posts (the preview frame has no allow-forms, and a
 *   real       shim in each page answers the theme's cart, search and section
 *              requests itself: Add to cart says it is a preview), no
 *              analytics, no prefetch, no new window, and the old platform's
 *              name is not in any file
 *
 * Only rendered output is public, the same a published website serves; the
 * theme's liquid and its package stay in theme-packages/. The frame loads
 * public/theme-previews/<slug>/index.html (templatePreviewPath in
 * lib/themes/marketplace-shared.ts); next.config.mjs gives the folder its
 * headers and proxy.ts leaves it to the CDN.
 *
 * Idempotent: a template's folder is replaced whole. With no template named,
 * the whole of public/theme-previews is written again (_base included); with
 * some named, only theirs, and _base only gains files.
 *
 * Rebuild with the covers: whoever runs build-theme-template-covers.ts runs
 * this too. tests/theme-template-previews.test.ts checks the output.
 */
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync, statSync } from "node:fs"
import { dirname, extname, join, posix } from "node:path"
import sharp from "sharp"

import { CODE_TEMPLATES, CODE_THEME_PACKAGE, TEMPLATE_PREVIEW_ROOT } from "../lib/themes/marketplace-shared"
import { templateDirs } from "../lib/themes/template-packages"
import { answer, themeAsset } from "../lib/storelib-theme/compat/site"
import { importTemplate, MEDIA_PREFIX, type BuiltSite } from "./theme-templates/site"
import { auditSite } from "./theme-templates/fixtures"

const OUT = join("public", TEMPLATE_PREVIEW_ROOT.replace(/^\//, ""))
const FONT_CACHE = join("node_modules", ".cache", "template-previews-fonts")
const MAX_PAGES = 64
const MAX_IMAGE_WIDTH = 1800
/** Inline blocks this long or longer that appear on two pages or more become files. */
const HOIST_BYTES = 1024
/** What the old platform's name becomes in the theme's own code: the same everywhere, so its scripts still find each other. */
const VENDOR_RENAME = "SlTheme"

/* The sample blog's dates count back from now: a fixed now, so a build with nothing changed writes the same files. */
const BUILT_AT = Date.parse("2026-11-21T12:00:00Z")
Date.now = () => BUILT_AT

const args = process.argv.slice(2)
const names = args.filter((a) => !a.startsWith("--"))

const MIME_EXT: Record<string, string> = { "text/css": "css", "text/javascript": "js", "application/javascript": "js", "application/json": "json", "image/svg+xml": "svg" }

const sha = (b: string | Uint8Array) => createHash("sha256").update(b).digest("hex").slice(0, 12)
const decodeAmp = (s: string) => s.replace(/&amp;/g, "&").replace(/\\u0026/g, "&").replace(/\\\//g, "/")

/* ── Where a page is written ───────────────────────────────────────────── */

/** The addresses a visitor browses; everything else (account, checkout, a product's .js) is not a page here. */
const PAGE_PATH = /^\/(?:|products\/[^/.?#]+|collections|collections\/[^/.?#]+|pages\/[^/.?#]+|blogs\/[^/.?#]+|blogs\/[^/.?#]+\/[^/.?#]+|policies\/[^/.?#]+|cart|search)$/
/** "/collections/x/products/y" is the product's page. */
const canonical = (path: string) => path.replace(/^\/collections\/[^/]+(?=\/products\/)/, "").replace(/\/+$/, "") || "/"
const fileOf = (path: string) => (path === "/" ? "index.html" : `${path.slice(1)}.html`)

/* ── Text the theme serves, made safe and static ───────────────────────── */

function vendorless(text: string): string {
  return text
    .replace(/window\.self\s*!==\s*window\.top/g, "false")
    .replace(/Shopify/g, VENDOR_RENAME)
}

/* ── One template ─────────────────────────────────────────────────────── */

/** A file under public/theme-previews. One in _base that is there already is the same file: its name is its content. */
function write(rel: string, body: string | Uint8Array) {
  const to = join(OUT, rel)
  if (rel.startsWith("_base/") && existsSync(to)) return
  mkdirSync(dirname(to), { recursive: true })
  writeFileSync(to, body)
}

/** Google's stylesheet for these families, with only the Latin files, from this folder. Null when the font library cannot be reached. */
const fontSheets = new Map<string, string | null>()
async function fontSheet(href: string): Promise<string | null> {
  if (fontSheets.has(href)) return fontSheets.get(href)!
  let out: string | null = null
  try {
    mkdirSync(FONT_CACHE, { recursive: true })
    const cached = join(FONT_CACHE, `${sha(href)}.css`)
    const css = existsSync(cached)
      ? readFileSync(cached, "utf8")
      : await fetch(href, { headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36" } }).then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
    if (!existsSync(cached)) writeFileSync(cached, css)
    const blocks = css.split(/(?=\/\* [a-z-]+ \*\/)/).filter((b) => /^\/\* (latin|latin-ext) \*\//.test(b))
    let sheet = ""
    for (const b of blocks) {
      let block = b
      for (const m of b.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)) {
        const local = join(FONT_CACHE, `${sha(m[1])}${extname(new URL(m[1]).pathname) || ".woff2"}`)
        if (!existsSync(local)) writeFileSync(local, new Uint8Array(await (await fetch(m[1])).arrayBuffer()))
        const bytes = readFileSync(local)
        const rel = `_base/a/${sha(bytes)}${extname(local)}`
        write(rel, bytes)
        block = block.replace(m[1], `${TEMPLATE_PREVIEW_ROOT}/${rel}`)
      }
      sheet += block
    }
    const rel = `_base/a/fonts.${sha(sheet)}.css`
    write(rel, sheet)
    out = `${TEMPLATE_PREVIEW_ROOT}/${rel}`
  } catch (e) {
    console.log(`  the font library did not answer for ${href.slice(0, 90)}: ${String(e).slice(0, 80)}; the page keeps its link`)
  }
  fontSheets.set(href, out)
  return out
}

async function buildTemplate(t: (typeof CODE_TEMPLATES)[number]) {
  const id = `${CODE_THEME_PACKAGE}/${t.template}`
  const slug = t.slug
  const imported = await importTemplate(id)
  const built: BuiltSite = auditSite(imported, t.template, false)
  /* The address the pages print for themselves; taken out below. */
  built.site.host = "preview.invalid"
  const { overlay, base } = templateDirs(id)
  const productsDir = join("scripts", "theme-templates", "products", t.template)
  rmSync(join(OUT, slug), { recursive: true, force: true })
  const own = (rel: string) => `${slug}/a/${rel}`
  const url = (rel: string) => `${TEMPLATE_PREVIEW_ROOT}/${rel}`

  /* ── Pictures and the theme's files, once each ── */
  const assetUrls = new Map<string, string | null>()
  /** Theme files being made, by the name their source gives them, and those asked for while being made. */
  const making = new Map<string, string>()
  const cyclic = new Set<string>()
  const settingsCtx = () => built.theme.pageContext({ template: "index", path: "/", designMode: false, products: [], collections: [], menus: {}, shop: { name: "" } })

  async function picture(bytes: Uint8Array, name: string, shared: boolean): Promise<string> {
    const ext = extname(name).toLowerCase()
    let out: Uint8Array = bytes
    let outExt = ext
    if ([".webp", ".jpg", ".jpeg", ".png"].includes(ext)) {
      const meta = await sharp(bytes).metadata().catch(() => null)
      if (meta?.width && meta.width > MAX_IMAGE_WIDTH) {
        out = new Uint8Array(await sharp(bytes).resize({ width: MAX_IMAGE_WIDTH }).webp({ quality: 80 }).toBuffer())
        outExt = ".webp"
      }
    }
    const stem = name.replace(/\.[^.]+$/, "").replace(/shopify/gi, "sl").replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 60)
    const rel = `${shared ? "_base/a" : `${slug}/a`}/${stem}.${sha(out)}${outExt}`
    write(rel, out)
    return url(rel)
  }

  /** "/__media/x", "/__product/x" or "/__asset/x", as the static file it now is; null when the site has no such file. */
  async function asset(address: string): Promise<string | null> {
    const clean = decodeAmp(address).split(/[?#]/)[0]
    if (making.has(clean)) {
      cyclic.add(clean)
      return url(making.get(clean)!)
    }
    if (assetUrls.has(clean)) return assetUrls.get(clean)!
    const name = decodeURIComponent(clean.split("/").pop() ?? "")
    const inBase = existsSync(join(base, "assets", name)) && !existsSync(join(overlay, "assets", name))
    let out: string | null = null
    if (clean.startsWith(MEDIA_PREFIX) || clean.startsWith("/__product/")) {
      const media = imported.media.get(name)
      const safe = name.replace(/[^A-Za-z0-9._-]/g, "")
      const file = [join(productsDir, safe), join(overlay, "assets", safe)].find((f) => existsSync(f))
      if (media) out = await picture(media, name, inBase)
      else if (file) out = await picture(readFileSync(file), name, false)
    } else if (clean.startsWith("/__asset/")) {
      const media = imported.media.get(name)
      if (media) out = await picture(media, name, inBase)
      else {
        const a = themeAsset(built.theme, name, settingsCtx)
        if (a) {
          const type = a.type.split(";")[0].trim()
          const ext = MIME_EXT[type] ?? (extname(name).slice(1) || "bin")
          const stem = name.replace(/\.(liquid|scss)$/, "").replace(/\.[^.]+$/, "").replace(/shopify/gi, "sl").replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 60)
          const dir = inBase ? "_base/a" : `${slug}/a`
          if (/^image\/(?!svg)/.test(type) && typeof a.body !== "string") out = await picture(a.body, name, inBase)
          else {
            let body: string | Uint8Array = a.body
            if (typeof body === "string" || /^(text\/|application\/(javascript|json)|image\/svg)/.test(type)) {
              /*
                Named by what it says once its addresses are static. Two
                scripts that import each other cannot both be: the one asked
                for again while it is being made is named by its source.
              */
              const source = typeof body === "string" ? body : Buffer.from(body).toString("utf8")
              making.set(clean, `${dir}/${stem}.s${sha(source)}.${ext}`)
              let text = vendorless(source)
              if (ext === "css") text = await cssUrls(text, "/__asset/")
              text = await assetRefs(text)
              body = text
            }
            const bySource = cyclic.has(clean) ? making.get(clean) : undefined
            making.delete(clean)
            const rel = bySource ?? `${dir}/${stem}.${sha(body)}.${ext}`
            write(rel, body)
            out = url(rel)
          }
        }
      }
    }
    if (!out) missing.add(clean)
    assetUrls.set(clean, out)
    return out
  }

  /** A stylesheet's url(...)s, read against where it was served from. */
  async function cssUrls(css: string, from: string): Promise<string> {
    const found = [...css.matchAll(/url\(\s*(["']?)([^"')]+)\1\s*\)/g)]
    const map = new Map<string, string>()
    for (const m of found) {
      const ref = m[2].trim()
      if (/^(data:|#|https?:|\/\/|\/theme-previews\/)/.test(ref) || map.has(ref)) continue
      const abs = ref.startsWith("/") ? ref : posix.join(from, ref)
      if (!/^\/(__asset|__media|__product)\//.test(abs)) continue
      const to = await asset(abs)
      if (to) map.set(ref, to + (ref.includes("#") ? ref.slice(ref.indexOf("#")) : ""))
    }
    let out = css.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/g, (m, q, ref) => (map.has(ref.trim()) ? `url(${q}${map.get(ref.trim())}${q})` : m))
    for (const m of out.matchAll(/@import\s+url\((["']?)(https:\/\/fonts\.googleapis\.com\/[^"')]+)\1\);?/g)) {
      const sheet = await fontSheet(decodeAmp(m[2]))
      if (sheet) out = out.replace(m[0], `@import url("${sheet}");`)
    }
    return out
  }

  /** Every address of a picture or a theme file in a text (markup, a script, JSON in an attribute), as its static file. */
  async function assetRefs(text: string): Promise<string> {
    /* The website's image optimizer: the picture itself, once. */
    const IMG = /\/_next\/image\?url=([^"'\s,)<>\\&]+)(?:(?:&amp;|&|\\u0026)(?:w|q)=\d+)*/g
    const imgs = new Map<string, string | null>()
    for (const m of text.matchAll(IMG)) {
      const inner = decodeURIComponent(m[1])
      if (!imgs.has(m[0])) imgs.set(m[0], /^\/(__asset|__media|__product)\//.test(inner) ? await asset(inner) : null)
    }
    let out = text.replace(IMG, (m) => imgs.get(m) ?? m)
    const DIRECT = /(?:\\?\/)(?:__asset|__media|__product)\\?\/[^"'\s)<>\\&?#,]+(?:\?v=\d+)?/g
    const direct = new Map<string, string | null>()
    for (const m of out.matchAll(DIRECT)) if (!direct.has(m[0])) direct.set(m[0], await asset(m[0].replace(/\\\//g, "/")))
    out = out.replace(DIRECT, (m) => direct.get(m) ?? m)
    /* A module's import of its neighbour ("./cart-components.js"), and new URL("./x.js", import.meta.url): the neighbour's file. */
    const NEAR = /(["'])\.\/([\w-]+(?:\.[\w-]+)*\.(?:m?js|css))\1/g
    const near = new Map<string, string | null>()
    for (const m of out.matchAll(NEAR)) {
      if (near.has(m[2])) continue
      const known = existsSync(join(base, "assets", m[2])) || existsSync(join(overlay, "assets", m[2])) || existsSync(join(base, "assets", `${m[2]}.liquid`)) || existsSync(join(overlay, "assets", `${m[2]}.liquid`))
      near.set(m[2], known ? await asset(`/__asset/${m[2]}`) : null)
    }
    out = out.replace(NEAR, (m, q: string, n: string) => (near.get(n) ? `${q}${near.get(n)}${q}` : m))
    return out
  }

  /* ── The pages, as the site answers them ── */
  const missing = new Set<string>()
  const pages = new Map<string, string>()
  const seeds = ["/", "/collections", "/collections/all", "/cart", "/search", "/blogs/news", "/pages/about", "/pages/contact", "/pages/faqs"]
  for (const p of built.site.products) seeds.push(`/products/${p.settings.slug}`)
  for (const c of built.site.collections) seeds.push(`/collections/${c.handle}`)
  for (const c of built.site.blog?.cards ?? []) seeds.push(c.path)
  for (const p of built.site.shop.policies ?? []) seeds.push(`/policies/${p.handle}`)
  const SYSTEM = new Set(["404", "article", "blog", "cart", "collection", "home", "collections", "page", "password", "product", "search"])
  for (const key of Object.keys(built.site.pages)) if (!SYSTEM.has(key)) seeds.push(`/pages/${key}`)
  const queue = [...new Set(seeds)]
  const refused = new Set<string>()
  while (queue.length && pages.size < MAX_PAGES) {
    const path = queue.shift()!
    if (pages.has(path) || refused.has(path)) continue
    const res = await answer(built.site, { method: "GET", path, query: new URLSearchParams(), body: null, cart: [] })
    if (res.status !== 200 || typeof res.body !== "string" || !/html/.test(res.type)) {
      refused.add(path)
      continue
    }
    pages.set(path, res.body)
    for (const m of res.body.matchAll(/\bhref=["'](\/[^"'#?]*)/g)) {
      const to = canonical(m[1])
      if (PAGE_PATH.test(to) && !pages.has(to) && !refused.has(to)) queue.push(to)
    }
  }

  /* ── Each page made static ── */
  const pageUrl = (path: string) => url(`${slug}/${fileOf(path)}`)
  /** An internal address as the page it now is, or null. */
  const pageOf = (href: string): string | null => {
    const raw = decodeAmp(href).replace(/^https?:\/\/preview\.invalid/, "") || "/"
    if (!raw.startsWith("/") || raw.startsWith("//")) return null
    const hash = raw.includes("#") ? raw.slice(raw.indexOf("#")) : ""
    const path = canonical(raw.split(/[?#]/)[0])
    return pages.has(path) ? pageUrl(path) + hash : null
  }

  const html = new Map<string, string>()
  for (const [path, raw] of pages) {
    let page = raw
    /* The page's own address on a host it is not on: canonical, alternates, its social card. */
    page = page.replace(/<link\b[^>]*\brel=["']?(?:canonical|alternate|preconnect|dns-prefetch|prefetch|prerender)\b[^>]*>/gi, "")
    page = page.replace(/<meta\b[^>]*\b(?:property|name)=["'](?:og:url|og:image|og:image:secure_url|twitter:image)["'][^>]*>/gi, "")
    /* Prefetching, and the structured data search engines read (a preview is never indexed, and it names the build's host). */
    page = page.replace(/<script\b[^>]*type=["'](?:speculationrules|application\/ld\+json)["'][^>]*>[\s\S]*?<\/script>/gi, "")
    page = vendorless(page)
    /* The font library's stylesheets, from here. */
    for (const m of [...page.matchAll(/<link\b[^>]*href=["'](https:\/\/fonts\.googleapis\.com\/css2?[^"']+)["'][^>]*>/gi)]) {
      const sheet = await fontSheet(decodeAmp(m[1]))
      if (sheet) page = page.replace(m[0], m[0].replace(m[1], sheet))
    }
    page = await assetRefs(page)
    page = await inlineStyleUrls(page)
    page = linksAndForms(page, pageOf)
    page = page.replace(/https?:\/\/preview\.invalid/g, "").replace(/preview\.invalid/g, "preview")
    page = page.replace(/<head\b[^>]*>/i, (h) => `${h}<script data-template-preview>${SHIM}</script>`)
    html.set(path, page)
  }

  /* Inline <style> url(...)s that point at the theme's files. */
  async function inlineStyleUrls(page: string): Promise<string> {
    const parts: string[] = []
    let last = 0
    for (const m of page.matchAll(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi)) {
      parts.push(page.slice(last, m.index!), `<style${m[1]}>${await cssUrls(m[2], "/__asset/")}</style>`)
      last = m.index! + m[0].length
    }
    parts.push(page.slice(last))
    return parts.join("")
  }

  /* ── What two pages or more write inline, written once ── */
  const BLOCK = /<(script|style)\b([^>]*)>([\s\S]*?)<\/\1>/gi
  const seen = new Map<string, number>()
  for (const page of html.values()) for (const m of page.matchAll(BLOCK)) if (m[3].length >= HOIST_BYTES && hoistable(m[1], m[2])) seen.set(sha(m[3]), (seen.get(sha(m[3])) ?? 0) + 1)
  for (const [path, page] of html) {
    const out = page.replace(BLOCK, (m, tag: string, attrs: string, body: string) => {
      if (body.length < HOIST_BYTES || !hoistable(tag, attrs) || (seen.get(sha(body)) ?? 0) < 2) return m
      const isStyle = tag.toLowerCase() === "style"
      const rel = own(`i.${sha(body)}.${isStyle ? "css" : "js"}`)
      write(rel, body)
      return isStyle ? `<link rel="stylesheet" href="${url(rel)}"${attrs.replace(/\stype=["'][^"']*["']/i, "")}>` : `<script${attrs} src="${url(rel)}"></script>`
    })
    write(`${slug}/${fileOf(path)}`, indentless(out))
  }
  const size = [...walkSizes(join(OUT, slug))].reduce((a, b) => a + b, 0)
  console.log(`${t.name} (${slug}): ${pages.size} pages, ${(size / 1048576).toFixed(2)} MB${missing.size ? `, not found: ${[...missing].slice(0, 8).join(", ")}` : ""}`)
  return { slug, pages: [...pages.keys()], size }
}

/** The markup's indentation, outside what keeps its spaces (pre, textarea, scripts, styles). A tenth of every page. */
function indentless(page: string): string {
  return page
    .split(/(<(?:script|style|pre|textarea)\b[\s\S]*?<\/(?:script|style|pre|textarea)>)/i)
    .map((part, i) => (i % 2 ? part : part.replace(/\n[ \t]+/g, "\n").replace(/\n{2,}/g, "\n")))
    .join("")
}

/** A <style> or a script the browser runs; never JSON, an import map or a template. */
function hoistable(tag: string, attrs: string): boolean {
  if (/\bsrc=|data-template-preview/i.test(attrs)) return false
  if (tag.toLowerCase() === "style") return !/\bmedia=/i.test(attrs)
  const type = /\btype=["']?([^"'\s>]+)/i.exec(attrs)?.[1]?.toLowerCase()
  return !type || type === "text/javascript" || type === "module" || type === "application/javascript"
}

/**
 * Links to pages written here go to their files; every other link is inert.
 * No form posts: each loses its method and its address, so it can only be
 * handled by the theme's script, whose request the shim answers.
 */
function linksAndForms(page: string, pageOf: (href: string) => string | null): string {
  const parts = page.split(/(<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>)/i)
  return parts
    .map((part, i) => {
      if (i % 2 === 1) return part
      return part.replace(/<([a-zA-Z][\w-]*)\b((?:"[^"]*"|'[^']*'|[^'">])*)>/g, (tag, name: string, attrs: string) => {
        const lower = name.toLowerCase()
        let a = attrs
        if (lower === "form") {
          a = a.replace(/\s(?:method|action|enctype|target)=(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
          return `<${name}${a} data-preview-form>`
        }
        a = a.replace(/(\s)(href|data-href|data-url|data-product-url|formaction)=(["'])([^"']*)\3/gi, (m, sp: string, attr: string, q: string, value: string) => {
          const v = value.trim()
          if (attr.toLowerCase() === "formaction") return ""
          if (v === "" || v.startsWith("#") || v.startsWith("/theme-previews/") || /^data:/i.test(v)) return m
          if (lower === "link" && attr.toLowerCase() === "href") return m
          const to = pageOf(v)
          if (to) return `${sp}${attr}=${q}${to}${q}`
          if (attr.toLowerCase() !== "href") return `${sp}${attr}=${q}#${q}`
          return `${sp}href=${q}#${q} data-preview-inert`
        })
        /* A JSON setting in an attribute that names a page ("url":"/products/x"). */
        a = a.replace(/&quot;(\/(?:products|collections|pages|blogs|policies)\/[^&"]*|\/(?:cart|search)?)&quot;/g, (m, v: string) => {
          const to = pageOf(v)
          return to ? `&quot;${to}&quot;` : m
        })
        if (lower === "a") a = a.replace(/\s(?:target|rel)=(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
        return `<${name}${a}>`
      })
    })
    .join("")
}

/**
 * First in every page's head. The frame is sandboxed with scripts only: no
 * storage, no cookies, no forms, no windows. A form the sandbox would refuse
 * to send (and say so in the console) is never sent: a press on its button
 * or Enter in its field hands the theme's scripts a submit event instead. What the theme's scripts ask the
 * store for is answered here, as an empty store would answer it; Add to cart
 * says it is a preview. When the page is drawn, the marketplace is told, so
 * it can take its screenshot away.
 */
const SHIM = `(function(){var W=window,D=document;W.__slTemplatePreview=true;
/* What this script's own build (tsx) leaves in the functions the engine writes into a page. */
W.__name=W.__name||function(f){return f};
/* A phone's scrollbar floats over the page; in the 390px frame a computer's would take 15px of it. */
var ph=D.createElement("style");ph.textContent="@media (max-width: 767.98px){html{scrollbar-width:none}html::-webkit-scrollbar{display:none}}";(D.head||D.documentElement).appendChild(ph);
function mem(){var m={};return{getItem:function(k){return Object.prototype.hasOwnProperty.call(m,k)?m[k]:null},setItem:function(k,v){m[k]=String(v)},removeItem:function(k){delete m[k]},clear:function(){m={}},key:function(i){return Object.keys(m)[i]||null},get length(){return Object.keys(m).length}}}
["localStorage","sessionStorage"].forEach(function(n){try{W[n].getItem("x")}catch(e){try{Object.defineProperty(W,n,{value:mem(),configurable:true})}catch(_){}}});
try{D.cookie}catch(e){var jar="";try{Object.defineProperty(D,"cookie",{get:function(){return jar},set:function(v){var kv=String(v).split(";")[0];jar=jar?jar+"; "+kv:kv},configurable:true})}catch(_){}}
var ROOT="${TEMPLATE_PREVIEW_ROOT}/";
function mine(u){try{var x=new URL(u,location.href);return x.host===location.host&&x.pathname.indexOf(ROOT)===0}catch(e){return false}}
function path(u){try{return new URL(u,location.href).pathname}catch(e){return""}}
var CART={token:"preview",note:"",attributes:{},original_total_price:0,total_price:0,total_discount:0,total_weight:0,item_count:0,items:[],requires_shipping:false,currency:"USD",items_subtotal_price:0,cart_level_discount_applications:[]};
var NO={status:422,message:"Preview",description:"This is a preview of the template. Add it to your library to sell from it."};
function reply(u){var p=path(u);
if(/\\/cart\\/add(\\.js)?$/.test(p))return[422,"application/json",JSON.stringify(NO)];
if(/\\/cart(\\.js|\\.json|\\/(change|update|clear)(\\.js)?)$/.test(p))return[200,"application/json",JSON.stringify(CART)];
if(/\\.(js|json)$/.test(p)||/\\/search\\/suggest/.test(p))return[200,"application/json","{}"];
return[200,"text/html","<!doctype html><html><body></body></html>"]}
var F=W.fetch;if(F)W.fetch=function(i,o){var u=typeof i==="string"?i:(i&&i.url)||String(i);if(mine(u))return F.apply(this,arguments);var r=reply(u);return Promise.resolve(new Response(r[2],{status:r[0],headers:{"Content-Type":r[1]}}))};
var X=W.XMLHttpRequest&&W.XMLHttpRequest.prototype;if(X){var O=X.open;X.open=function(m,u){var a=[].slice.call(arguments);if(!mine(u)){var r=reply(u);a[0]="GET";a[1]="data:"+r[1]+","+encodeURIComponent(r[2])}return O.apply(this,a)}}
if(navigator.sendBeacon)navigator.sendBeacon=function(){return true};
W.open=function(){return null};
var FP=W.HTMLFormElement&&HTMLFormElement.prototype;if(FP){FP.submit=function(){};FP.requestSubmit=function(){this.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}))}}
W.addEventListener("submit",function(e){e.preventDefault()},true);
function submit(f,b){setTimeout(function(){var ev;try{ev=new SubmitEvent("submit",{bubbles:true,cancelable:true,submitter:b||null})}catch(_){ev=new Event("submit",{bubbles:true,cancelable:true})}f.dispatchEvent(ev)},0)}
D.addEventListener("click",function(e){var b=e.target&&e.target.closest&&e.target.closest("button,input[type=submit],input[type=image]");if(!b||!b.form)return;var t=(b.getAttribute("type")||"submit").toLowerCase();if(t!=="submit"&&t!=="image")return;e.preventDefault();submit(b.form,b)},true);
D.addEventListener("keydown",function(e){var i=e.target;if(e.key!=="Enter"||!i||i.tagName!=="INPUT"||!i.form)return;e.preventDefault();submit(i.form,null)},true);
D.addEventListener("click",function(e){var a=e.target&&e.target.closest&&e.target.closest("a[data-preview-inert]");if(a)e.preventDefault()},true);
var told=false;function tell(){if(told)return;told=true;try{parent.postMessage({type:"storelib:template-preview",ready:true,path:location.pathname},"*")}catch(e){}}
W.addEventListener("load",tell);D.addEventListener("DOMContentLoaded",function(){setTimeout(tell,1200)});
/* The page's own background, as soon as it is known: the frame shows it between two pages instead of its own white (a white flash on a dark shop). */
function paint(){try{var c=getComputedStyle(D.documentElement).backgroundColor;if(!c||/rgba\(0, 0, 0, 0\)|transparent/.test(c))c=getComputedStyle(D.body).backgroundColor;if(c&&!/rgba\(0, 0, 0, 0\)|transparent/.test(c))parent.postMessage({type:"storelib:template-preview-background",background:c},"*")}catch(e){}}
D.addEventListener("DOMContentLoaded",paint);
})();`

function* walkSizes(dir: string): Generator<number> {
  if (!existsSync(dir)) return
  for (const n of readdirSync(dir)) {
    const f = join(dir, n)
    const s = statSync(f)
    if (s.isDirectory()) yield* walkSizes(f)
    else yield s.size
  }
}

async function main() {
  const chosen = CODE_TEMPLATES.filter((t) => names.length === 0 || names.includes(t.template) || names.includes(t.slug))
  if (!chosen.length) throw new Error(`no template named ${names.join(", ")}`)
  if (names.length === 0) rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })
  const made = []
  for (const t of chosen) made.push(await buildTemplate(t))
  const baseSize = [...walkSizes(join(OUT, "_base"))].reduce((a, b) => a + b, 0)
  const all = [...walkSizes(OUT)].reduce((a, b) => a + b, 0)
  console.log(`\n_base: ${(baseSize / 1048576).toFixed(2)} MB; everything under ${OUT}: ${(all / 1048576).toFixed(2)} MB`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
