/**
 * The Hanging rail section (theme-packages/materia/base/sections/hanging-rail.liquid)
 * and the Streetwear drop template built around it (templates/rail, Sixth Ward;
 * Boutique rail by Hanger Lane until round 25).
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
 *   in Chromium  pointing at a garment turns it from its side view to the
 *                front; clicking lifts it into the focus view (the garment
 *                flies there, its hanger stays empty) with the product's
 *                sizes, an add to cart form on the theme's cart and buttons,
 *                and the pieces it is worn with; the back view is downloaded
 *                only after Back is pressed; Add to cart adds it and the
 *                cart count follows; Escape closes it the same way back: the
 *                page scrolls at once and the garment lands on its hanger
 *                with nothing left over
 *   colours      the rail and its focus view take a colour scheme; the
 *                focus view's backdrop is solid or frosted, never see-through
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
  /* Changed on purpose (templates round 25): the focus view adds to the cart itself, asking the theme's cart the way its product form does (the same drawer sections, the same count, the same cartUpdate event), so it can stay open and say it is added instead of the drawer opening over it. */
  check("  Add to cart asks the theme's cart as its product form does: the drawer's sections, the count, the cartUpdate event, the theme's buttons", /class="hr-focus__form"/.test(source) && /name="id"/.test(source) && /getSectionsToRender\(\)/.test(source) && /materiaPatchDrawerCart/.test(source) && /publish\(PUB_SUB_EVENTS\.cartUpdate/.test(source) && /\.cart-count/.test(source) && /data-theme-button="primary"/.test(source))
  check("  colours, fonts, buttons and corners come from the theme: a colour scheme, the heading and body fonts, the button radius, the corner radius", /"type": "color_scheme", "id": "color_scheme"/.test(source) && /var\(--heading-font/.test(source) && /var\(--body-font/.test(source) && /var\(--btn-radius/.test(source) && /var\(--rounded-radius/.test(source) && /render 'scheme-color'/.test(source))
  check("  the focus view's backdrop is the scheme's background, solid or frosted (blurred), never the page showing through", /\.hr-focus\.is-open \.hr-focus__backdrop \{ opacity: 1; \}/.test(source) && /backdrop-filter: blur\(26px\)/.test(source) && /\.hr-focus\[class\] \{ background: none; \}/.test(source))
  const help = readFileSync("lib/help/articles.ts", "utf8")
  check("the guide is a help article creators can open, with a good and a bad cut-out pictured", /slug: "hanging-rail",\s*category: "website-builder"/.test(help) && ["rail", "cutout-good", "cutout-bad"].every((f) => existsSync(`public/help/hanging-rail/${f}.webp`) && help.includes(`/help/hanging-rail/${f}.webp`)))

  /* ── The schema ───────────────────────────────────────────────────── */
  const imported = await importTemplate(`${CODE_THEME_PACKAGE}/${TEMPLATE}`)
  const { schema, errors } = editorSchemaOf(imported, "hanging-rail")
  check("the section has an editor panel", !!schema, errors)
  if (!schema) return
  const ids = new Set(schema.fields.map((f) => f.id))
  const WANT = ["color_scheme", "focus_backdrop", "after_add", "button_style", "image_blur", "text_glass", "glass_opacity", "with_heading", "garment_height", "garment_height_mobile", "garment_width", "turn_speed", "hover_gap", "swing", "gap", "rail_top", "rail_thickness", "overflow", "click_action", "background_style", "background_colour", "background_image", "overlay_opacity", "overlay_colour", "eyebrow", "eyebrow_2", "heading", "text_below", "button_label", "button_link"]
  check("  every setting asked for is there", WANT.every((w) => ids.has(w)), WANT.filter((w) => !ids.has(w)))
  check("  each has a label", schema.fields.filter((f) => f.id).every((f) => typeof f.label === "string" && f.label.length > 2))
  const field = (id: string) => schema.fields.find((f) => f.id === id) as { options?: { value: string; label: string }[]; info?: string } | undefined
  check("  scroll mode and click behaviour say what they do", (field("overflow")?.options ?? []).some((o) => /drop garments into the row to scroll/i.test(o.label)) && (field("click_action")?.options ?? []).some((o) => /lift garment on the rail into focus view/i.test(o.label)))
  const info = JSON.stringify(schema)
  check("  the info says transparent PNG or WebP cut-outs on a hanger, how to make them and where the guide is", /transparent PNG or WebP cut-outs of the garment on its hanger/.test(info) && /remove the background/i.test(info) && /storelib\.com\/help\/website-builder\/hanging-rail/.test(info))
  check("  and the sizes the pictures should be", /400 x 1000 px/.test(info) && /1000 x 1300 px/.test(info))
  const garment = schema.blocks?.find((b) => b.type === "garment")
  const bf = new Map((garment?.fields ?? []).map((f) => [f.id, String(f.type)]))
  check("a Garment block: product picker, side, front and back views, tag text, the products it is worn with", bf.get("product") === "product" && bf.get("side_image") === "image_picker" && bf.get("front_image") === "image_picker" && bf.get("back_image") === "image_picker" && bf.get("tag_text") === "text" && bf.get("wear_with") === "product_list", Object.fromEntries(bf))
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
  /* Changed on purpose (templates round 25): every garment of the template hangs side on, as in the owner's video; the turned front view is still what a garment with no side view shows (checked below). */
  check("every garment hangs side on: its side view asked for at its drawn size, its front view waiting", (html.match(/<img class="hr__side" src="[^"]+" srcset="[^"]+ \d+w, [^"]+ \d+w" sizes="\(max-width: 749px\) \d+px, \d+px"/g) ?? []).length === linked.length && (html.match(/<img class="hr__front" data-src="/g) ?? []).length === linked.length)
  const withData = [...html.matchAll(/<script type="application\/json" data-hr-data>([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]) as { with: { title: string; variant: string; url: string }[] })
  check("  each carries the pieces it is worn with, each with a variant to add", withData.every((d) => d.with.length >= 1 && d.with.every((q) => !!q.title && !!q.variant && !!q.url)), withData[0])
  check("  every picture has a width and height or a fixed box, so nothing moves while they load", /width="\d+" height="\d+"/.test(html) && /\.hr__item \{[^}]*height: calc\(var\(--hr-ghx\)/.test(source))
  check("  each garment carries its size on the rail (tees shorter than hoodies)", /--hr-k: 0\.86/.test(html) && /--hr-k: 1(\.0)?;/.test(html))

  /* A garment with a back view, and one with no side view. */
  const withBack = JSON.parse(JSON.stringify(home)) as Stored[]
  const r2 = withBack.find((s) => s.id === rail.id)!
  r2.blocks![0].settings = { ...r2.blocks![0].settings, back_image: "/__media/a-back-view.webp" }
  r2.blocks![1].settings = { ...r2.blocks![1].settings, side_image: "/__media/a-side-view.webp", tag_text: "Two for $80" }
  r2.blocks![2].settings = { ...r2.blocks![2].settings, side_image: "" }
  built.site.pages.home = withBack as never
  const html2 = sectionMarkup(await get(), rail.id) ?? ""
  check("a back view is never an <img> on the page, only an address in the garment's data", /a-back-view\.webp/.test(html2) && !/<img[^>]+a-back-view/.test(html2))
  check("  a garment with a side view shows it on the rail at its drawn size, and its front view waits (no src until the page has loaded or the pointer comes)", /<img class="hr__side" src="[^"]*a-side-view[^"]*" srcset="[^"]+ \d+w, [^"]+ \d+w"/.test(html2) && /<img class="hr__front" data-src="/.test(html2) && !/<img class="hr__front" src=/.test(html2))
  check("  the tag text replaces the price when it is set", /<span class="hr__tag"><span>Two for \$80<\/span>/.test(html2))
  check("  a garment without a side view hangs its front view turned, asked for at its drawn size", /<img class="hr__front hr__front--rest" src="[^"]+" srcset="[^"]+ \d+w, [^"]+ \d+w" sizes="\(max-width: 749px\) \d+px, \d+px"/.test(html2))
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
  /* Changed on purpose (templates round 25): Boutique rail is now Streetwear drop, by Sixth Ward. */
  check("Streetwear drop is a fashion template in the marketplace", CODE_TEMPLATES.some((t) => t.template === TEMPLATE && t.slug === "streetwear-drop" && t.name === "Streetwear drop" && t.category === "fashion"))

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
    const focus = await p.evaluate(() => { const r = document.querySelector(".hr-focus") as HTMLElement | null; return r ? { open: !r.hidden, title: r.querySelector(".hr-focus__title")?.textContent, sizes: r.querySelectorAll(".hr-focus__value").length, form: !!r.querySelector(".hr-focus__form [name=id]"), id: (r.querySelector(".hr-focus__form [name=id]") as HTMLInputElement | null)?.value, locked: document.documentElement.classList.contains("hr-locked"), lifted: document.querySelectorAll(".hr__item.is-lifted").length, backdrop: +getComputedStyle(r.querySelector(".hr-focus__backdrop")!).opacity, bg: getComputedStyle(r.querySelector(".hr-focus__backdrop")!).backgroundColor, pairs: r.querySelectorAll(".hr-focus__pair").length, flies: document.querySelectorAll(".hr-fly").length } : null })
    check("  clicking opens the focus view with the product, its sizes and an add to cart form", !!focus?.open && focus.title === linked[0]!.settings.title && focus.sizes >= 3 && focus.form && !!focus.id && focus.locked, focus)
    check("  the garment is lifted off its hanger (the hanger stays empty) and its flight has landed", focus?.lifted === 1 && focus.flies === 0, focus)
    check("  the backdrop is opaque, in the scheme's background (nothing of the page shows through)", focus?.backdrop === 1 && !/rgba\(0, 0, 0, 0\)|transparent/.test(focus.bg), focus)
    check("  the pieces it is worn with are listed, each with its own add button", (focus?.pairs ?? 0) >= 1 && (await p.$$(".hr-focus__plus")).length === focus!.pairs)
    /* The fixture server keeps no cart, so the store's answers are played here: what a cart sends back for an add, and the cart after it. */
    const before = await p.evaluate(() => document.querySelector(".cart-count")?.textContent?.trim() ?? "")
    let sent = ""
    await p.setRequestInterception(true)
    const play = (r: import("puppeteer-core").HTTPRequest) => {
      const u = new URL(r.url())
      if (r.method() === "POST" && /\/cart\/add\.js$/.test(u.pathname)) { sent = r.postData() ?? ""; void r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ id: focus!.id, quantity: 1, title: focus!.title }) }); return }
      if (u.pathname === "/cart.json") { void r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ item_count: 1, items: [{ id: focus!.id, quantity: 1 }], total_price: 9800 }) }); return }
      void r.continue()
    }
    p.on("request", play)
    await p.click(".hr-focus__add")
    await new Promise((r) => setTimeout(r, 1200))
    p.off("request", play)
    await p.setRequestInterception(false)
    check("  it asks the cart for the chosen size: one of it, as JSON to /cart/add.js", (() => { try { const b = JSON.parse(sent) as { id: string; quantity: number }; return String(b.id) === String(focus!.id) && b.quantity === 1 } catch { return false } })(), sent)
    const added = await p.evaluate(() => ({ cls: document.querySelector(".hr-focus__add")?.className ?? "", count: document.querySelector(".cart-count")?.textContent?.trim() ?? "", link: document.querySelector(".hr-focus__cart")?.classList.contains("is-shown"), err: document.querySelector(".hr-focus__error")?.textContent ?? "", open: !(document.querySelector(".hr-focus") as HTMLElement).hidden }))
    check("  Add to cart adds it: the button says so, the cart link shows, the count goes up and the view stays open", /is-added/.test(added.cls) && !!added.link && added.count !== before && added.open && !added.err, { before, ...added })
    check("  the back view was not downloaded before Back was pressed", !asked.some((u) => u.includes("a-back-view")))
    await p.click(".hr-focus__views [data-hr-view=back]")
    await new Promise((r) => setTimeout(r, 500))
    check("  pressing Back downloads it", asked.some((u) => u.includes("a-back-view")))
    await p.click(".hr-focus__nav--next")
    await new Promise((r) => setTimeout(r, 400))
    check("  the arrow steps to the next garment", (await p.$eval(".hr-focus__title", (e) => e.textContent)) === linked[1]!.settings.title)
    await p.keyboard.press("Escape")
    await new Promise((r) => setTimeout(r, 60))
    const closing = await p.evaluate(() => ({ locked: document.documentElement.classList.contains("hr-locked"), blocks: getComputedStyle(document.querySelector(".hr-focus")!).pointerEvents !== "none" }))
    check("  closing gives the page back at once: it scrolls and takes clicks while the garment flies back", !closing.locked && !closing.blocks, closing)
    await new Promise((r) => setTimeout(r, 900))
    check("  Escape closes it and the garment is back on its hanger, with nothing left over", await p.evaluate(() => (document.querySelector(".hr-focus") as HTMLElement).hidden && !document.documentElement.classList.contains("hr-locked") && document.querySelectorAll(".hr__item.is-lifted").length === 0 && document.querySelectorAll(".hr-fly").length === 0))
    /* Interrupted: closed while it is still flying in, then opened again while it is flying back. */
    const g3 = await (await p.$$(`#shopify-section-${rail.id} .hr__g`))[3].boundingBox()
    await p.mouse.click(g3!.x + g3!.width / 2, g3!.y + g3!.height / 2)
    await new Promise((r) => setTimeout(r, 150))
    await p.keyboard.press("Escape")
    await new Promise((r) => setTimeout(r, 150))
    await p.mouse.click(g3!.x + g3!.width / 2, g3!.y + g3!.height / 2)
    await new Promise((r) => setTimeout(r, 1100))
    const again = await p.evaluate(() => ({ open: !(document.querySelector(".hr-focus") as HTMLElement).hidden && document.querySelector(".hr-focus")!.classList.contains("is-open"), flies: document.querySelectorAll(".hr-fly").length, lifted: document.querySelectorAll(".hr__item.is-lifted").length, img: getComputedStyle(document.querySelector(".hr-focus__img")!).visibility }))
    check("  closing and opening interrupt each other cleanly: open, one garment lifted, no copy left flying", again.open && again.flies === 0 && again.lifted === 1 && again.img === "visible", again)
    await p.keyboard.press("Escape")
    await new Promise((r) => setTimeout(r, 900))
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
