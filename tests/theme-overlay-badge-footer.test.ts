/**
 * The owner's round 19 reports on the theme every template is made from
 * (theme-packages/materia/base), held in place:
 *
 *   overlay group  the theme's own Overlay group, whole: the phone tab bar,
 *                  back to top and the eight popups it shipped switched off.
 *                  Every template keeps all ten (one it does not want is
 *                  switched off, never taken out), the import keeps the
 *                  switched off ones as hidden sections the creator can
 *                  switch on, and Add section offers each in the Overlay
 *                  group
 *   count bubble   the cart's and the wishlist's number reads on its bubble
 *                  in every colour scheme of every template: worked out from
 *                  the bubble's fill, never the scheme's background colour
 *                  (white on white, black on black), and measured in
 *                  Chromium when it is there
 *   footer         every page of every template draws its footer, also when
 *                  a page row, or the home page itself, was stored without
 *                  its header and footer
 *   sections       a theme section named like one of Storelib's own is
 *                  stored under another name, so Add section offers it
 *   transparency   a picture with see-through parts keeps them: the image
 *                  optimizer's AVIF and WebP, image_url with a format asked
 *                  for, the upload's own encoders
 *
 *   npx tsx tests/theme-overlay-badge-footer.test.ts
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import sharp from "sharp"

import { CODE_TEMPLATES, CODE_THEME_PACKAGE } from "../lib/themes/marketplace-shared"
import { composeTemplateFiles } from "../lib/themes/template-packages"
import { answer, type SiteData } from "../lib/storelib-theme/compat/site"
import { Ctx, renderString } from "../lib/storelib-theme/compat/runtime"
import { compatFilter } from "../lib/storelib-theme/compat/filters"
import { parseCompat } from "../lib/storelib-theme/compat/parser"
import { sectionGroupsFor } from "../lib/storelib-theme/section-groups"
import { customAddableSections, customSectionSchemas } from "../lib/website-builder/storelib-schemas"
import { mayBeTransparent, rgbaHasTransparency } from "../lib/images/transparency"
import { importTemplate, serve } from "../scripts/theme-templates/site"
import { auditCart, auditPaths, auditSite } from "../scripts/theme-templates/fixtures"
import { BADGE_JS } from "../scripts/theme-templates/badges"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail).slice(0, 900)}` : ""}`) }
}

type O = Record<string, any>
const ROOT = join(process.cwd(), "theme-packages", CODE_THEME_PACKAGE)
/* TEMPLATES=a,b runs only those (while one is being rebuilt); the suite runs them all. */
const TEMPLATES = process.env.TEMPLATES ? process.env.TEMPLATES.split(",") : CODE_TEMPLATES.map((t) => t.template)
const readJson = (path: string): O => JSON.parse(readFileSync(path, "utf8")) as O

/* The theme's Overlay group as it was sold (sections/overlay-group.json of the original theme), by section id and type. */
const OVERLAY: [string, string][] = [
  ["mobile_navigation_bar_GG8UWc", "mobile-navigation-bar"],
  ["promotion_popup_discount", "promobanner"],
  ["promotional_banner_popup_2", "promotionalpopup2"],
  ["promotional_newsletter_popup_2", "promonewsletterpopup-2"],
  ["promotional_image_banner_popup", "Promotional-image-popup"],
  ["spin_wheel_popup", "spin-wheel-popup"],
  ["back_to_top_pro", "Back-to-top-pro"],
  ["countdown_promo_popup", "countdown-promo-popup"],
  ["coupon_promotion_newsletter_popup", "coupon-promotion-newsletter-popup"],
  ["order_notification_pro_1", "fake-order"],
]
const ALWAYS_ON = new Set(["mobile_navigation_bar_GG8UWc", "back_to_top_pro"])

/* ── Colour, as the stylesheet works it out ───────────────────────────── */
const hex = (h: string) => { const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(h.trim()); if (!m) return null; const x = m[1].length === 3 ? m[1].replace(/./g, "$&$&") : m[1]; return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16) / 255) }
const linear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
const luminance = (c: number[]) => 0.2126 * linear(c[0]) + 0.7152 * linear(c[1]) + 0.0722 * linear(c[2])
const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
const css = (f: string) => readFileSync(join(ROOT, "base", "assets", f), "utf8")

async function main() {
  /* ── The Overlay group ──────────────────────────────────────────────── */
  console.log("\nThe Overlay group, whole\n")
  const base = readJson(join(ROOT, "base", "sections", "overlay-group.json"))
  check("the theme's Overlay group has the ten sections it was sold with, in its order", JSON.stringify(base.order) === JSON.stringify(OVERLAY.map(([id]) => id)) && OVERLAY.every(([id, type]) => base.sections[id]?.type === type), base.order)
  check("  its eight popups ship switched off; the phone tab bar and back to top are on", OVERLAY.every(([id]) => (base.sections[id].disabled === true) === !ALWAYS_ON.has(id)))
  const words = JSON.stringify(base)
  check("  its words name no vendor and no old store, and carry no dash or banned word", !/materia|prime ?clarity|shopify|red-light/i.test(words) && !/[—–]|\b(unlock|elevate|seamless|powerful|effortless|supercharge|transform|amazing)\b/i.test(words))
  check("  each of its section files is in the theme", OVERLAY.every(([, type]) => existsSync(join(ROOT, "base", "sections", `${type}.liquid`))))

  for (const template of TEMPLATES) {
    const files = composeTemplateFiles(`${CODE_THEME_PACKAGE}/${template}`)
    const group = JSON.parse(files.get("sections/overlay-group.json")!.toString("utf8")) as O
    const missing = OVERLAY.filter(([id, type]) => group.sections?.[id]?.type !== type || !group.order?.includes(id)).map(([id]) => id)
    const popupsOn = OVERLAY.filter(([id]) => !ALWAYS_ON.has(id) && group.sections?.[id] && group.sections[id].disabled !== true).map(([id]) => id)
    check(`${template}: keeps all ten in its Overlay group and its order (${missing.length} missing), every popup switched off`, missing.length === 0 && popupsOn.length === 0, { missing, popupsOn })
  }

  /* The import keeps what is switched off, as hidden sections, and the builder offers each section in the Overlay group. */
  for (const template of ["fitness", "streetwear"]) {
    const imported = await importTemplate(`${CODE_THEME_PACKAGE}/${template}`)
    const home = (imported.theme.pages as O[]).find((p) => p.template === "index") as O
    const overlay = (home.sections as O[]).filter((s) => s.group === "overlay")
    const byId = new Map(overlay.map((s) => [s.id, s]))
    const group = JSON.parse(composeTemplateFiles(`${CODE_THEME_PACKAGE}/${template}`).get("sections/overlay-group.json")!.toString("utf8")) as O
    check(`${template}: the import keeps all ten, each switched off one as a hidden section`, OVERLAY.every(([id]) => byId.has(id) && (byId.get(id)!.hidden === true) === (group.sections[id].disabled === true)), overlay.map((s) => `${s.id}${s.hidden ? " (hidden)" : ""}`))
    const custom = customSectionSchemas(imported.files)
    const addable = customAddableSections(custom)
    const renamed = ((imported.theme.settings as O)?.compat?.renamed ?? {}) as Record<string, string>
    const stored = (type: string) => renamed[type] ?? type
    const offered = OVERLAY.map(([, type]) => stored(type)).filter((t) => addable.includes(t) && sectionGroupsFor(custom[t] as never, { type: t, kind: null }).includes("overlay"))
    check(`${template}: Add section offers each of the ten in the Overlay group, with its own preset (${offered.length} of ${OVERLAY.length})`, offered.length === OVERLAY.length, OVERLAY.map(([, t]) => stored(t)).filter((t) => !offered.includes(t)))
    if (template === "fitness") {
      check("a theme section named like one of Storelib's own (testimonials) is stored under its own name and offered in Add section", !!custom["theme-testimonials"] && addable.includes("theme-testimonials") && renamed.testimonials === "theme-testimonials", Object.keys(renamed))
      check("  and the page that places it draws it", (home.sections as O[]).some((s) => s.type === "theme-testimonials"))
    }
  }

  /* ── The count bubble ───────────────────────────────────────────────── */
  console.log("\nThe count bubble reads on every colour scheme\n")
  const header = css("header-section.css")
  check("the number is worked out from the bubble's fill (its luminance in srgb-linear, under @supports)", /@supports \(color: color\(from red srgb-linear r g b\)\)[\s\S]*?\.h-count[\s\S]*?var\(--cb-text, color\(from var\(--cb-fill[^)]*\)\) srgb-linear var\(--cb-auto\)/.test(header))
  check("  every place that paints a bubble names its fill", ["critical.css", "mobile-navigation-bar.css", "cart-drawer-scheme.css", "navigation.css"].every((f) => /--cb-fill:/.test(css(f))))
  const headerLiquid = readFileSync(join(ROOT, "base", "sections", "header.liquid"), "utf8")
  check("  a number picked in its bubble's own colour is dropped (header.liquid), and the wishlist no longer borrows the scheme's background", /color_contrast/.test(headerLiquid) && !/--count-bubble-wishlist-color: var\(--color-background/.test(headerLiquid))
  const live = readFileSync(join(ROOT, "base", "snippets", "theme-live.liquid"), "utf8")
  check("  the builder's live change no longer paints every number white", !/--count-bubble-color', [^\n]*'var\(--color-white/.test(live) && /'initial'/.test(live))
  /* What the stylesheet does: white under the luminance it names, black at or over it. */
  const threshold = Number(/clamp\(0, \(([0-9.]+) - \(0\.2126 \* r/.exec(header)?.[1])
  const auto = (fill: number[]) => (luminance(fill) < threshold ? 1 : 0)
  let worst = 99
  const low: string[] = []
  for (const template of TEMPLATES) {
    const data = JSON.parse(composeTemplateFiles(`${CODE_THEME_PACKAGE}/${template}`).get("config/settings_data.json")!.toString("utf8")).current as O
    const fills = new Set<string>()
    for (const s of Object.values((data.color_schemes ?? {}) as O)) for (const k of ["primary_color", "btn_primary_background", "background", "text_color", "heading_color"]) if (typeof s.settings?.[k] === "string") fills.add(s.settings[k])
    for (const k of ["bubble_bg", "cart_bubble_bg", "wishlist_bubble_bg"]) if (typeof data[k] === "string" && data[k]) fills.add(data[k])
    for (const f of fills) {
      const c = hex(f)
      if (!c) continue
      const r = ratio(luminance(c), auto(c))
      worst = Math.min(worst, r)
      if (r < 4.5) low.push(`${template} ${f} ${r.toFixed(2)}`)
    }
  }
  check(`every fill any template's schemes could give a bubble gets a number at 4.5 to 1 or more (lowest ${worst.toFixed(2)})`, low.length === 0, low)
  /* Black on black and white on white, the reported pair, and the hard middle. */
  check("  black, white, the theme's lime and a middle grey each read", ["#000000", "#ffffff", "#d7ff3e", "#777777", "#e11b1c", "#2440e6"].every((f) => ratio(luminance(hex(f)!), auto(hex(f)!)) >= 4.5))

  const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
  if (!existsSync(CHROMIUM)) console.log("  skip  measured in Chromium: no Chromium at " + CHROMIUM)
  else {
    const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-dev-shm-usage"] })
    try {
      let measured = 0
      let lowest = 99
      const faint: string[] = []
      for (const template of TEMPLATES) {
        const imported = await importTemplate(`${CODE_THEME_PACKAGE}/${template}`)
        const built = auditSite(imported, template, false)
        const { base: origin, server } = await serve(built, join("scripts", "theme-templates", "products", template), { eager: true, cart: auditCart(built) })
        try {
          const paths = auditPaths(built).filter(([n]) => n === "home" || n === "collection")
          for (const [name, path] of paths) {
            for (const vp of name === "home" ? [{ width: 1440, height: 900 }, { width: 390, height: 844, isMobile: true, hasTouch: true }] : [{ width: 390, height: 844, isMobile: true, hasTouch: true }]) {
              const p = await browser.newPage()
              await p.setViewport(vp)
              await p.evaluateOnNewDocument(`window.__name = (f) => f; try { localStorage.setItem('materia__wishlist-items', JSON.stringify(['a','b'])); localStorage.setItem('materia__cart-count','3') } catch (e) {}`)
              await p.goto(`${origin}${path}`, { waitUntil: "networkidle2", timeout: 60000 }).catch(() => null)
              const rows = (await p.evaluate(BADGE_JS).catch(() => [])) as { ratio: number; text: string; el: string; fg: string; bg: string }[]
              for (const r of rows) {
                measured++
                lowest = Math.min(lowest, r.ratio)
                if (r.ratio < (/h-count|wishlist-count|cart-count/.test(r.el) ? 4.5 : 3)) faint.push(`${template} ${name} ${vp.width}: ${r.ratio} "${r.text}" ${r.el} ${r.fg} on ${r.bg}`)
              }
              await p.close()
            }
          }
        } finally {
          server.close()
        }
      }
      check(`measured in Chromium: ${measured} count bubbles and badges on every template's home and collection, the lowest ${lowest.toFixed(2)} to 1; no count bubble under 4.5 and no other badge under 3`, measured > TEMPLATES.length && faint.length === 0, [...new Set(faint)].slice(0, 12))
    } finally {
      await browser.close()
    }
  }

  /* ── The footer, on every page ──────────────────────────────────────── */
  console.log("\nThe footer, on every page of every template\n")
  const hasFooter = (html: string) => /id="shopify-section-[^"]*footer[^"]*"/.test(html) && /<footer\b|class="[^"]*\bfooter\b/.test(html)
  for (const template of TEMPLATES) {
    const imported = await importTemplate(`${CODE_THEME_PACKAGE}/${template}`)
    const built = auditSite(imported, template, false)
    const cart = auditCart(built)
    const site: SiteData = built.site
    const draw = async (path: string) => {
      const u = new URL(path, "http://x")
      const out = await answer(site, { method: "GET", path: u.pathname, query: u.searchParams, body: null, cart: u.searchParams.has("__cart") ? cart : [] })
      return typeof out.body === "string" ? out.body : ""
    }
    const stored = { ...site.pages }
    const without = (key: string) => (stored[key] ?? []).filter((s) => !s.group)
    const lost: string[] = []
    const paths = auditPaths(built).filter(([n]) => n !== "password")
    for (const [variant, pages] of [
      ["as stored", stored],
      ["each page stored without its chrome", Object.fromEntries(Object.keys(stored).map((k) => [k, k === "home" ? stored[k] : without(k)]))],
      ["home stored without its chrome", Object.fromEntries(Object.keys(stored).map((k) => [k, without(k)]))],
    ] as const) {
      site.pages = pages as SiteData["pages"]
      for (const [name, path] of paths) if (!hasFooter(await draw(path))) lost.push(`${variant}: ${name}`)
    }
    site.pages = stored
    check(`${template}: ${paths.length} page types each draw the footer, stored whole, without a page's chrome, and without home's`, lost.length === 0, lost.slice(0, 10))
  }

  /* ── Transparency ───────────────────────────────────────────────────── */
  console.log("\nA picture with see-through parts keeps them\n")
  const size = 64
  const rgba = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4
    const inside = (x - 32) ** 2 + (y - 32) ** 2 < 20 ** 2
    rgba[i] = 240; rgba[i + 1] = 120; rgba[i + 2] = 40; rgba[i + 3] = inside ? 255 : 0
  }
  const png = await sharp(rgba, { raw: { width: size, height: size, channels: 4 } }).png().toBuffer()
  check("the check finds a cut out product's transparent corners, and none in an opaque picture", rgbaHasTransparency(rgba) && !rgbaHasTransparency(Buffer.alloc(16, 255)))
  check("  PNG, WebP and AVIF are looked at; JPEG, which cannot be see-through, is not", ["image/png", "image/webp", "image/avif"].every(mayBeTransparent) && !mayBeTransparent("image/jpeg"))
  /* Next's own optimizer, as /_next/image runs it (next.config.mjs formats: AVIF, WebP). */
  const { optimizeImage } = (await import("next/dist/server/image-optimizer.js")) as unknown as { optimizeImage: (o: { buffer: Buffer; contentType: string; quality: number; width: number; height?: number }) => Promise<Buffer> }
  for (const contentType of ["image/avif", "image/webp", "image/png"]) {
    const out = await optimizeImage({ buffer: png, contentType, quality: 90, width: 48 })
    const meta = await sharp(out).metadata()
    const { data, info } = await sharp(out).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const corner = data[3]
    const centre = data[((info.height >> 1) * info.width + (info.width >> 1)) * 4 + 3]
    check(`  the image optimizer's ${contentType.slice(6).toUpperCase()} keeps the alpha: a clear corner (${corner}) and a solid middle (${centre}), not flattened`, meta.hasAlpha === true && corner < 10 && centre > 245, { hasAlpha: meta.hasAlpha, corner, centre, format: meta.format })
  }
  const env = { snippet: () => null, filter: compatFilter }
  const drawn = renderString(`{{ 'https://storelib.com/media/p/glow.png' | image_url: width: 600, format: 'pjpg' }}|{{ 'https://storelib.com/media/p/glow.webp' | image_url: width: 400 }}`, new Ctx({}, env))
  const [a, b] = drawn.split("|").map((u) => decodeURIComponent(new URLSearchParams(u.replace(/&amp;/g, "&").split("?")[1] ?? "").get("url") ?? u))
  check("  image_url asks the optimizer for the PNG and the WebP themselves, a format the theme asks for (pjpg) not applied", a === "https://storelib.com/media/p/glow.png" && b === "https://storelib.com/media/p/glow.webp" && !/format|jpg/i.test(drawn.replace(/glow\.png|glow\.webp/g, "")), drawn)
  void parseCompat
  const editor = readFileSync(join(process.cwd(), "app", "(storelib)", "app", "products", "new", "product-editor.tsx"), "utf8")
  check("  the product editor's widescreen copy of a see-through picture is padded with nothing, as WebP (not grey in a JPEG), under a name the cover trim does not hold unseen", /hasTransparency\(img\)/.test(editor) && /if \(!clear\) \{[\s\S]{0,400}fillRect/.test(editor) && /clear \? "image\/webp" : "image\/jpeg"/.test(editor) && /_wide\.webp/.test(editor))
  const compress = readFileSync(join(process.cwd(), "lib", "images", "compress.ts"), "utf8")
  check("  the upload's compressor names a PNG a browser made as a PNG (both keep the alpha)", /blob\.type === "image\/png"/.test(compress) && /toBlob\(resolve, "image\/webp"/.test(compress))

  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
