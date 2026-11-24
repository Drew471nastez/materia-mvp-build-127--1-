/**
 * The Hanging rail section (theme-packages/materia/base/sections/hanging-rail.liquid)
 * and the Boutique rail template built around it (templates/rail, Hanger Lane).
 *
 *   schema       the settings the owner asked for, each with a label, and
 *                the info that says pictures must be transparent PNG or
 *                WebP cut-outs on a hanger, how to make them, their sizes
 *                and where the guide is (docs/hanging-rail.md, which exists)
 *   blocks       one Garment block per product: a product picker, side,
 *                front and back views and a tag text override
 *   one file     markup, styles and script inline: no script with a src,
 *                no import, no address outside the shop
 *   drawn        each garment is linked to its product (title, price,
 *                variants with ids, the product's address); tags show the
 *                product's price unless overridden; the side view is asked
 *                for at its drawn size (srcset), the front view waits
 *                (data-src), the back view is never an <img>, only an
 *                address the focus view asks for when Back is pressed;
 *                with no side view, the front view stands in, turned
 *   in Chromium  pointing at a garment turns it to the front; clicking
 *                opens the focus view with the product's sizes and the
 *                theme's own <product-form>; the back view is downloaded
 *                only after Back is pressed; Escape closes it
 *
 *   Run: tests/hanging-rail.test.ts (needs Chromium at /opt/pw-browsers/chromium or $CHROMIUM for the last part)
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

import { CODE_THEME_PACKAGE, CODE_TEMPLATES } from "../lib/themes/marketplace-shared"
import { answer } from "../lib/storelib-theme/compat/site"
import { importTemplate, serve } from "../scripts/theme-templates/site"
import { auditSite } from "../scripts/theme-templates/fixtures"
import { editorSchemaOf, homeWith, sectionMarkup } from "../scripts/theme-templates/sections"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok || detail === undefined ? "" : `\n       ${JSON.stringify(detail).slice(0, 400)}`}`)
}

const FILE = "theme-packages/materia/base/sections/hanging-rail.liquid"
const TEMPLATE = "rail"
const RAW = /\{\{|\{%|%\}|Liquid error|Template syntax error/

type Stored = { id: string; type: string; settings: Record<string, unknown>; blocks?: Stored[] }

async function main() {
  /* ── The file ─────────────────────────────────────────────────────── */
  const source = readFileSync(FILE, "utf8")
  const scripts = [...source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
  check("one file: no script with a src, no module import, no fetch of another site", scripts.every((m) => !/\bsrc=/.test(m[1])) && !/\bimport\s*\(|\bimport\s+[\w{*]/.test(source) && !/https?:\/\/(?!www\.w3\.org)/.test(source.replace(/\{% schema %\}[\s\S]*$/, "")))
  check("  its script defines the rail once and has no Liquid in it, so every rail on a page shares it", scripts.some((m) => /customElements\.define\('hanging-rail'/.test(m[2]) && /customElements\.get\('hanging-rail'\)/.test(m[2]) && !/\{\{|\{%/.test(m[2])))
  check("  motion is turned off when the visitor asks for less", /prefers-reduced-motion: reduce/.test(source) && /RM\.matches/.test(source))
  check("  the animation loop stops when nothing moves", /if \(moving\) this\.wake\(\)/.test(source))
  check("  Add to cart is the theme's own <product-form>", /<product-form class="hr-focus__form"/.test(source) && /name="id"/.test(source))
  check("the guide exists", existsSync("docs/hanging-rail.md") && /transparent/i.test(readFileSync("docs/hanging-rail.md", "utf8")))

  /* ── The schema ───────────────────────────────────────────────────── */
  const imported = await importTemplate(`${CODE_THEME_PACKAGE}/${TEMPLATE}`)
  const { schema, errors } = editorSchemaOf(imported, "hanging-rail")
  check("the section has an editor panel", !!schema, errors)
  if (!schema) return
  const ids = new Set(schema.fields.map((f) => f.id))
  const WANT = ["garment_height", "garment_height_mobile", "garment_width", "turn_speed", "hover_gap", "swing", "gap", "rail_top", "rail_thickness", "overflow", "click_action", "background_style", "background_colour", "background_image", "overlay_opacity", "overlay_colour", "eyebrow", "eyebrow_2", "heading", "text_below", "button_label", "button_link"]
  check("  every setting asked for is there", WANT.every((w) => ids.has(w)), WANT.filter((w) => !ids.has(w)))
  check("  each has a label", schema.fields.filter((f) => f.id).every((f) => typeof f.label === "string" && f.label.length > 2))
  const field = (id: string) => schema.fields.find((f) => f.id === id) as { options?: { value: string; label: string }[]; info?: string } | undefined
  check("  scroll mode and click behaviour say what they do", (field("overflow")?.options ?? []).some((o) => /drop garments into the row to scroll/i.test(o.label)) && (field("click_action")?.options ?? []).some((o) => /lift garment on the rail into focus view/i.test(o.label)))
  const info = JSON.stringify(schema)
  check("  the info says transparent PNG or WebP cut-outs on a hanger, how to make them and where the guide is", /transparent PNG or WebP cut-outs of the garment on its hanger/.test(info) && /remove the background/i.test(info) && /docs\/hanging-rail\.md/.test(info))
  check("  and the sizes the pictures should be", /400 x 1000 px/.test(info) && /1000 x 1300 px/.test(info))
  const garment = schema.blocks?.find((b) => b.type === "garment")
  const bf = new Map((garment?.fields ?? []).map((f) => [f.id, String(f.type)]))
  check("a Garment block: product picker, side, front and back views, tag text", bf.get("product") === "product" && bf.get("side_image") === "image_picker" && bf.get("front_image") === "image_picker" && bf.get("back_image") === "image_picker" && bf.get("tag_text") === "text", Object.fromEntries(bf))
  check("  it has a preset with garments, so it can be added from the library", (schema.presets?.[0]?.blocks?.length ?? 0) >= 3)

  /* ── Drawn by the engine, with the sample shop ────────────────────── */
  const built = auditSite(imported, TEMPLATE, false)
  const get = async (path = "/") => String((await answer(built.site, { method: "GET", path, query: new URLSearchParams(), body: null, cart: [] })).body)
  const home = (built.site.pages.home ?? []) as unknown as Stored[]
  const rail = home.find((s) => s.type === "hanging-rail")
  check("the template's home page opens on the rail", !!rail && home.filter((s) => !(s as { group?: string }).group)[0]?.type === "hanging-rail")
  if (!rail) return
  const html = sectionMarkup(await get(), rail.id) ?? ""
  const products = built.site.products as unknown as { settings: { title: string; url: string; price: string; slug: string; variants: { id: string }[] } }[]
  const linked = (rail.blocks ?? []).map((b) => products.find((p) => p.settings.slug === b.settings.product))
  check("every garment is linked to a product of the shop", linked.every(Boolean) && linked.length >= 8, (rail.blocks ?? []).map((b) => b.settings.product))
  const data = [...html.matchAll(/<script type="application\/json" data-hr-data>([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]) as { title: string; url: string; price: string; variants: { id: string; options: string[] }[]; back: string; front: string })
  check("  each carries its product's title, price, address and variants", data.length === linked.length && data.every((d, i) => d.title === linked[i]!.settings.title && d.url === linked[i]!.settings.url && d.price === linked[i]!.settings.price && d.variants.length === linked[i]!.settings.variants.length && d.variants.every((v) => !!v.id)), data[0])
  check("  its link opens the product page when scripts do not run", linked.every((p) => html.includes(`href="${p!.settings.url}"`)))
  check("  the tag shows the product's price", /<span class="hr__tag"><span>\$98<\/span>/.test(html))
  check("  no template code is left", !RAW.test(html.replace(/<script[\s\S]*?<\/script>/g, "")))
  check("side views are asked for at the size they are drawn", /<img class="hr__side" src="[^"]+" srcset="[^"]+ \d+w, [^"]+ \d+w" sizes="\(max-width: 749px\) \d+px, \d+px"/.test(html))
  check("  front views wait: no src until the page has loaded or the pointer comes", /<img class="hr__front" data-src="/.test(html) && !/<img class="hr__front" src=/.test(html))
  check("  every picture has a width and height or a fixed box, so nothing moves while they load", /width="\d+" height="\d+"/.test(html) && /\.hr__item \{[^}]*height: calc\(var\(--hr-ghx\)/.test(source))

  /* A garment with a back view, and one with no side view. */
  const withBack = JSON.parse(JSON.stringify(home)) as Stored[]
  const r2 = withBack.find((s) => s.id === rail.id)!
  r2.blocks![0].settings = { ...r2.blocks![0].settings, back_image: "/__media/a-back-view.webp" }
  r2.blocks![1].settings = { ...r2.blocks![1].settings, side_image: "", tag_text: "Two for $80" }
  built.site.pages.home = withBack as never
  const html2 = sectionMarkup(await get(), rail.id) ?? ""
  check("a back view is never an <img> on the page, only an address in the garment's data", /a-back-view\.webp/.test(html2) && !/<img[^>]+a-back-view/.test(html2))
  check("  a garment without a side view shows its front view turned", /<img class="hr__side hr__side--turned"/.test(html2))
  check("  the tag text replaces the price when it is set", /<span class="hr__tag"><span>Two for \$80<\/span>/.test(html2))
  built.site.pages.home = home as never

  /* The section alone, on another template's page: it draws from its preset. */
  const other = auditSite(await importTemplate(`${CODE_THEME_PACKAGE}/default`), "default", false)
  const preset = editorSchemaOf(other.imported, "hanging-rail").schema
  check("every template has it (it is in the base)", !!preset)
  if (preset) {
    const p = preset.presets![0]
    const s: Stored = { id: "hrX", type: "hanging-rail", settings: { ...(p.settings ?? {}) }, blocks: (p.blocks ?? []).map((b, k) => ({ id: `hrXb${k}`, type: b.type, settings: { ...(b.settings ?? {}), product: String(other.site.products[k]?.settings.slug ?? "") } })) }
    other.site.pages.home = homeWith(other, [s as never])
    const out = sectionMarkup(String((await answer(other.site, { method: "GET", path: "/", query: new URLSearchParams(), body: null, cart: [] })).body), "hrX") ?? ""
    check("  added to the Storelib Default template with its products, it draws a garment for each", (out.match(/class="hr__item"/g) ?? []).length === (p.blocks ?? []).length && !RAW.test(out.replace(/<script[\s\S]*?<\/script>/g, "")))
  }

  /* ── The template is listed ───────────────────────────────────────── */
  check("Boutique rail is a fashion template in the marketplace", CODE_TEMPLATES.some((t) => t.template === TEMPLATE && t.slug === "boutique-rail" && t.category === "fashion"))

  /* ── In Chromium ──────────────────────────────────────────────────── */
  const chrome = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
  if (!existsSync(chrome)) { check("Chromium is there for the browser checks", false, chrome); return }
  built.site.pages.home = withBack as never
  const served = await serve(built, join("scripts", "theme-templates", "products", TEMPLATE))
  const browser = await puppeteer.launch({ executablePath: chrome, args: ["--no-sandbox", "--disable-dev-shm-usage"] })
  try {
    const p = await browser.newPage()
    await p.setViewport({ width: 1440, height: 900 })
    const errs: string[] = []
    p.on("pageerror", (e) => errs.push(String(e)))
    const asked: string[] = []
    p.on("request", (r) => asked.push(r.url()))
    await p.goto(`${served.base}/`, { waitUntil: "networkidle2", timeout: 60000 })
    await new Promise((r) => setTimeout(r, 800))
    const box = await (await p.$$(`#shopify-section-${rail.id} .hr__item`))[2].boundingBox()
    await p.mouse.move(box!.x - 120, box!.y + box!.height / 2)
    await p.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2, { steps: 8 })
    await new Promise((r) => setTimeout(r, 900))
    const front = await p.evaluate((id) => { const f = document.querySelectorAll(`#shopify-section-${id} .hr__front`)[2] as HTMLImageElement; return { o: +getComputedStyle(f).opacity, src: !!f.currentSrc, name: document.querySelector(`#shopify-section-${id} .hr__name`)?.textContent ?? "" } }, rail.id)
    check("in Chromium: pointing at a garment turns it to the front and names it under the rail", front.o > 0.9 && front.src && front.name.includes(linked[2]!.settings.title), front)
    const moved = await p.evaluate((id) => { const li = document.querySelectorAll(`#shopify-section-${id} .hr__item`); return [getComputedStyle(li[1]).transform, getComputedStyle(li[3]).transform] }, rail.id)
    check("  its neighbours move aside", moved.every((t) => t !== "none"), moved)
    const first = await (await p.$$(`#shopify-section-${rail.id} .hr__g`))[0].boundingBox()
    await p.mouse.click(first!.x + first!.width / 2, first!.y + first!.height / 2)
    await new Promise((r) => setTimeout(r, 900))
    const focus = await p.evaluate(() => { const r = document.querySelector(".hr-focus") as HTMLElement | null; return r ? { open: !r.hidden, title: r.querySelector(".hr-focus__title")?.textContent, sizes: r.querySelectorAll(".hr-focus__value").length, form: !!r.querySelector("product-form form [name=id]"), id: (r.querySelector("product-form form [name=id]") as HTMLInputElement | null)?.value, locked: document.documentElement.classList.contains("hr-locked") } : null })
    check("  clicking opens the focus view with the product, its sizes and the theme's product form", !!focus?.open && focus.title === linked[0]!.settings.title && focus.sizes >= 3 && focus.form && !!focus.id && focus.locked, focus)
    check("  the back view was not downloaded before Back was pressed", !asked.some((u) => u.includes("a-back-view")))
    await p.click(".hr-focus__views [data-hr-view=back]")
    await new Promise((r) => setTimeout(r, 500))
    check("  pressing Back downloads it", asked.some((u) => u.includes("a-back-view")))
    await p.click(".hr-focus__nav--next")
    await new Promise((r) => setTimeout(r, 400))
    check("  the arrow steps to the next garment", (await p.$eval(".hr-focus__title", (e) => e.textContent)) === linked[1]!.settings.title)
    await p.keyboard.press("Escape")
    await new Promise((r) => setTimeout(r, 600))
    check("  Escape closes it and the page scrolls again", await p.evaluate(() => (document.querySelector(".hr-focus") as HTMLElement).hidden && !document.documentElement.classList.contains("hr-locked")))
    check("  no script errors", errs.length === 0, errs)
    await p.close()
  } finally {
    await browser.close()
    served.server.close()
    built.site.pages.home = home as never
  }
}

main()
  .catch((e) => { failed++; console.error(e) })
  .finally(() => {
    console.log(`\n${passed} passed, ${failed} failed`)
    process.exit(failed ? 1 : 0)
  })
