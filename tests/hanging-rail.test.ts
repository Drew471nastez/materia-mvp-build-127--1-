/**
 * The Hanging rail section (theme-packages/materia/base/sections/hanging-rail.liquid),
 * Materia 1.3.2's Boutique Rail and Try the look (boutique-rail.liquid,
 * try-the-look.liquid) and the Redline template built around them
 * (templates/rail, Kurb Club; Sixth Ward in round 25, Boutique rail by Hanger
 * Lane before). Changed on purpose (templates round 26): the template's home
 * opens on the Boutique Rail now, so the Hanging rail checks run on the rail
 * of its Lookbook page, put on the home page for them.
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
  const realHome = (built.site.pages.home ?? []) as unknown as Stored[]
  /* Changed on purpose (templates round 26): the home page opens on the Boutique Rail; the Hanging rail is the Lookbook page's, drawn here on a home page of its own. */
  check("the template's home page opens on the Boutique Rail", realHome.filter((s) => !(s as { group?: string }).group)[0]?.type === "boutique-rail")
  const rail = ((built.site.pages as unknown as Record<string, Stored[]>).lookbook ?? []).find((s) => s.type === "hanging-rail")
  check("the Lookbook page keeps the Hanging rail (existing sites keep theirs)", !!rail)
  if (!rail) return
  const home = realHome.map((s) => (s.type === "boutique-rail" ? rail : s))
  built.site.pages.home = home as never
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
  /* Changed on purpose (templates round 26): Streetwear drop by Sixth Ward is now Redline, by Kurb Club (same slug). */
  check("Redline is a fashion template in the marketplace", CODE_TEMPLATES.some((t) => t.template === TEMPLATE && t.slug === "streetwear-drop" && t.name === "Redline" && t.category === "fashion"))

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
    /* Settled, not timed: under load the re-open can still be flying at a fixed 1.1 s; wait (up to 5 s) for the open, lifted, no-copy state the check asserts. */
    await p.waitForFunction(() => { const f = document.querySelector(".hr-focus") as HTMLElement | null; return !!f && !f.hidden && f.classList.contains("is-open") && document.querySelectorAll(".hr-fly").length === 0 && document.querySelectorAll(".hr__item.is-lifted").length === 1 }, { timeout: 5000 }).catch(() => undefined)
    const again = await p.evaluate(() => ({ open: !(document.querySelector(".hr-focus") as HTMLElement).hidden && document.querySelector(".hr-focus")!.classList.contains("is-open"), flies: document.querySelectorAll(".hr-fly").length, lifted: document.querySelectorAll(".hr__item.is-lifted").length, img: getComputedStyle(document.querySelector(".hr-focus__img")!).visibility }))
    check("  closing and opening interrupt each other cleanly: open, one garment lifted, no copy left flying", again.open && again.flies === 0 && again.lifted === 1 && again.img === "visible", again)
    await p.keyboard.press("Escape")
    await new Promise((r) => setTimeout(r, 900))
    check("  no script errors", errs.length === 0, errs)
    await p.close()
  } finally {
    await browser.close()
    served.server.close()
    built.site.pages.home = realHome as never
  }
  await boutiqueAndLook()
}

main()
  .catch((e) => { failed++; console.error(e) })
  .finally(() => {
    console.log(`\n${passed} passed, ${failed} failed`)
    process.exit(failed ? 1 : 0)
  })

/*
 * Templates round 26: Materia 1.3.2's Boutique Rail and Try the look, as the
 * Redline template uses them (its home page opens on the rail, Try the look
 * follows), with what the owner asked for on top of the port:
 *
 *   boutique rail   the eyebrow (Fleece | Jersey) switches between two
 *                   collections and can be plain text or links instead; the
 *                   line under the rail and the hovered garment's name share
 *                   one cell, so hovering never moves the section (measured
 *                   every frame); the focus view's background is set in the
 *                   section, it scrolls with no scroll bar, opens with the
 *                   garment flying off its hanger and closes as the exact
 *                   reverse; arrows slide between garments; Add to cart and
 *                   the pieces it is worn with go to the store's cart
 *   try the look    a product per pin (piece_1..4, never product_N, which the
 *                   engine fills with the first product when empty) or a
 *                   collection; drag moves the looks 1:1 with the pointer and
 *                   the View / Drag circle sits on the pointer; a dot opens
 *                   its piece; Add full look to bag puts every piece in the
 *                   Storelib cart
 */
async function boutiqueAndLook() {
  const BR = readFileSync("theme-packages/materia/base/sections/boutique-rail.liquid", "utf8")
  const TL = readFileSync("theme-packages/materia/base/sections/try-the-look.liquid", "utf8")
  for (const [name, src, el] of [["Boutique Rail", BR, "boutique-rail"], ["Try the look", TL, "try-the-look"]] as const) {
    const scripts = [...src.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
    check(`${name}: one file, no outside script, its element defined once`, scripts.every((m) => !/\bsrc=/.test(m[1])) && new RegExp(`customElements\\.get\\('${el}'\\)`).test(src))
    check(`  ${name} adds at /cart/add.js, which the Storelib store answers, and can keep the drawer shut`, /\+ '\.js'/.test(src) && /opts\.open !== false/.test(src))
  }
  check("Boutique Rail: the caption and the hovered name share one cell, the name on one line", /\.brail__lines > \* \{ grid-area: 1 \/ 1;/.test(BR) && /\.brail__name \{[^}]*white-space: nowrap/.test(BR) && /-webkit-line-clamp: 2/.test(BR))
  check("  its focus view scrolls with no scroll bar showing", /\.brail__focus \{[^}]*overflow-y: auto[^}]*scrollbar-width: none/.test(BR) && /\.brail__focus::-webkit-scrollbar \{ display: none/.test(BR))
  /* Changed on purpose (templates round 28): close is no longer the open played backwards (which waited out the open's delays and felt laggy); it is its own short movement that starts at once from wherever things are. */
  /* Changed on purpose (r67): the close is still its own movement from where things are, now 140 ms for the words, 260 ms for the background and 300 ms for the garment flying back (the owner: back to its place smoothly, nothing lagging); tests/redline-rail-motion-r67.test.ts measures it frame by frame. */
  check("  close is its own short movement (about a third of a second, transform and opacity) that starts from where things are", /closeMotion\(li\)/.test(BR) && /commitStyles\(\)/.test(BR) && /duration: 260, easing/.test(BR) && /duration: 300, easing/.test(BR) && !/direction: opening \? 'normal' : 'reverse'/.test(BR))
  check("  the focus view wears a colour scheme and the theme's buttons, pills and quantity box (round 28)", /class="brail__focus color-\{\{ focus_scheme \}\}"/.test(BR) && /data-theme-button="primary"/.test(BR) && /<quantity-input class="quantity bf__qty"/.test(BR) && /var\(--btn-primary-bg-color/.test(BR) && /var\(--pill-radius/.test(BR) && /"id": "focus_color_scheme"/.test(BR))
  check("  its picture area is neutral: no hook line, border, shadow or filter on a product photo", !/bf__hook/.test(BR) && /\.bf__slide img \{[^}]*border: 0;[^}]*box-shadow: none; filter: none;/.test(BR))
  check("  a product with several pictures swipes through them (scroll snap) with dots and arrows", /\.bf__slides \{[^}]*scroll-snap-type: x mandatory/.test(BR) && /data-f-dots/.test(BR) && /data-f-inext/.test(BR) && /"images": \[\{\{ img_json \}\}\]/.test(BR))
  check("  the page is locked only after the garment has landed (locking re-lays out the page and held up the first frame)", /await this\.motion\(\);\s*if \(this\.dialog\.open && !this\.dialog\.classList\.contains\('is-closing'\)\) document\.documentElement\.classList\.add\('brail-lock'\)/.test(BR))
  check("Try the look: no pin setting is named product_N (the engine fills those with the first product)", !/"id": "product_\d"/.test(TL) && /"id": "piece_1"/.test(TL) && /"id": "look_collection"/.test(TL))
  check("  the View / Drag circle is drawn at the pointer, its words cross-fade", /translate3d\(' \+ x \+ 'px,' \+ y \+ 'px,0\)/.test(TL) && /\[data-mode='drag'\] \[data-v-view\] \{ opacity: 0;/.test(TL))
  check("  a touch drag is not ended by the look handing its pointer to the stage", /lostpointercapture', e => \{ if \(e\.target === st\) end\(e\); \}/.test(TL))

  const imported = await importTemplate(`${CODE_THEME_PACKAGE}/${TEMPLATE}`)
  const brSchema = editorSchemaOf(imported, "boutique-rail").schema
  const brIds = new Set((brSchema?.fields ?? []).map((f) => f.id))
  const want = ["collection", "collection_2", "eyebrow", "eyebrow_secondary", "eyebrow_clickable", "tab_names", "eyebrow_link", "eyebrow_secondary_link", "caption", "show_hooks", "focus_background", "focus_color", "focus_text", "focus_glass_opacity", "after_add", "with_heading", "garment_height", "turn_speed", "hover_side_gap"]
  check("Boutique Rail: every 1.3.2 setting and the new ones (eyebrow links and tabs, focus view background, after add, hooks)", want.every((w) => brIds.has(w)), want.filter((w) => !brIds.has(w)))
  const gb = new Map((brSchema?.blocks?.find((b) => b.type === "garment")?.fields ?? []).map((f) => [f.id, String(f.type)]))
  check("  a Garment block: product, side, front and back pictures, size on the rail, price tag, worn with", gb.get("product") === "product" && gb.get("side_image") === "image_picker" && gb.get("front_image") === "image_picker" && gb.get("back_image") === "image_picker" && gb.get("rail_size") === "range" && gb.get("tag_text") === "text" && gb.get("wear_with") === "product_list", Object.fromEntries(gb))
  const tlSchema = editorSchemaOf(imported, "try-the-look").schema
  const lb = new Map((tlSchema?.blocks?.find((b) => b.type === "look")?.fields ?? []).map((f) => [f.id, String(f.type)]))
  check("Try the look: a Look block with a model picture, a collection and a product per pin", lb.get("model_image") === "image_picker" && lb.get("look_collection") === "collection" && [1, 2, 3, 4].every((q) => lb.get(`piece_${q}`) === "product" && lb.get(`pin_x_${q}`) === "range"), Object.fromEntries(lb))

  const built = auditSite(imported, TEMPLATE, false)
  const home = (built.site.pages.home ?? []) as unknown as Stored[]
  const get = async () => String((await answer(built.site, { method: "GET", path: "/", query: new URLSearchParams(), body: null, cart: [] })).body)
  const br = home.find((s) => s.type === "boutique-rail")!
  const tl = home.find((s) => s.type === "try-the-look")!
  const products = built.site.products as unknown as { id: string; settings: { title: string; slug: string; variants: { id: string }[] } }[]
  let html = await get()
  let m = sectionMarkup(html, br.id) ?? ""
  const tabs = [...m.matchAll(/<button type="button" class="brail__tab"[^>]*>([^<]*)<\/button>/g)].map((x) => x[1])
  check("Redline's rail: Fleece and Jersey are two tabs, each its collection's garments", tabs.join("|") === "Fleece|Jersey" && (m.match(/<ul class="brail__track"/g) ?? []).length === 2, tabs)
  const tracks = m.split('<ul class="brail__track"').slice(1).map((t) => (t.match(/<li class="brail__item"/g) ?? []).length)
  /* Changed on purpose (templates round 28): Fleece and Jersey are mixed rails (tees, hoodies, jackets, long sleeves), eleven pieces each, so the rail scrolls. */
  check("  eleven pieces hang on each, mixed: tees, hoodies, jackets and long sleeves", tracks[0] === 11 && tracks[1] === 11, tracks)
  const gd = [...m.matchAll(/<script type="application\/json" data-g-data>([\s\S]*?)<\/script>/g)].map((x) => JSON.parse(x[1]) as { title: string; url: string; variants: { id: string }[]; with: { variant: string; title: string }[]; price: string })
  check("  every garment carries its product (title, address, variants with ids, price) and what it is worn with", gd.length === 22 && gd.every((d) => products.some((p) => p.settings.title === d.title) && d.variants.length > 0 && d.variants.every((v) => !!v.id) && !!d.price && d.with.length === 2 && d.with.every((w) => !!w.variant)), gd[0])
  check("  no template code is left", !RAW.test(m.replace(/<script[\s\S]*?<\/script>/g, "")))
  /* The eyebrow as plain text: one rail; as links with no second collection. */
  const variant = (patch: Record<string, unknown>) => { const h = JSON.parse(JSON.stringify(home)) as Stored[]; const s = h.find((x) => x.id === br.id)!; s.settings = { ...s.settings, ...patch }; built.site.pages.home = h as never }
  variant({ eyebrow_clickable: false })
  m = sectionMarkup(await get(), br.id) ?? ""
  check("  eyebrow not clickable: plain text, no tabs, one rail", !/class="brail__tab"/.test(m) && (m.match(/<ul class="brail__track"/g) ?? []).length === 1 && /<p class="brail__eyebrow">/.test(m) && !/<p class="brail__eyebrow">[\s\S]*?<a /.test(m.split("</p>")[0] + "</p>"))
  /* One collection (an empty collection setting is filled with every product by the engine, so the rail always has a collection on Storelib). */
  variant({ collection: "new-arrivals", collection_2: "", eyebrow: "New collection", eyebrow_link: "/pages/lookbook" })
  m = sectionMarkup(await get(), br.id) ?? ""
  check("  with one collection, the eyebrow's parts are links: its own link and the collection's page", /<a href="\/pages\/lookbook">New collection<\/a>/.test(m) && /<a href="\/collections\/new-arrivals">New arrivals<\/a>/.test(m), m.match(/<p class="brail__eyebrow">[\s\S]*?<\/p>/)?.[0])
  built.site.pages.home = home as never

  /* Try the look */
  m = sectionMarkup(html, tl.id) ?? ""
  const looks = (tl.blocks ?? []).map((b) => [1, 2, 3, 4].map((q) => b.settings[`piece_${q}`]).filter(Boolean) as string[])
  const panels = m.split('class="ttl__look"').slice(1)
  check("Try the look: four looks, each with a pin and a listed piece per product picked, and no other", panels.length === 4 && panels.every((pn, i) => (pn.match(/class="ttl__item"/g) ?? []).length === looks[i].length), panels.map((pn) => (pn.match(/class="ttl__item"/g) ?? []).length))
  const all = [...m.matchAll(/data-all="([^"]*)"/g)].map((x) => x[1].split(",").filter(Boolean))
  check("  Add full look to bag carries every piece's variant", all.length === 4 && all.every((ids, i) => ids.length === looks[i].length))
  const look1 = tl.blocks![0]
  const variantTl = (patch: Record<string, unknown>) => { const h = JSON.parse(JSON.stringify(home)) as Stored[]; const s = h.find((x) => x.id === tl.id)!; s.blocks![0].settings = { ...s.blocks![0].settings, ...patch }; built.site.pages.home = h as never }
  variantTl({ piece_1: "", piece_2: "", look_collection: "bottoms" })
  m = sectionMarkup(await get(), tl.id) ?? ""
  const p1 = m.split('class="ttl__look"')[1] ?? ""
  check("  a look with no product picked takes its collection's products, on the same pins", (p1.match(/class="ttl__item"/g) ?? []).length === 4 && /Wide denim, black/.test(p1), (p1.match(/class="ttl__name"[^>]*>([^<]*)</g) ?? []).slice(0, 4))
  built.site.pages.home = home as never
  void look1
  /* The whole look, in the Storelib cart: the store's own answer to the add the button sends. */
  const ids = all[0]
  const added = await answer(built.site, { method: "POST", path: "/cart/add.js", query: new URLSearchParams(), body: { items: ids.map((id) => ({ id, quantity: 1 })) }, cart: [], ajax: true } as never)
  const cart = ((added as { cart?: { v: string | null; q: number }[] }).cart ?? [])
  check("  Add full look to bag: the Storelib cart takes every piece of the look", added.status === 200 && ids.every((id) => cart.some((l) => l.v === id && l.q === 1)), { status: added.status, cart, body: String(added.body).slice(0, 200) })

  /* In Chromium */
  const chrome = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
  if (!existsSync(chrome)) return
  const served = await serve(built, join("scripts", "theme-templates", "products", TEMPLATE))
  const fine = ["--blink-settings=primaryPointerType=4,availablePointerTypes=4,primaryHoverType=2,availableHoverTypes=2"]
  const browser = await puppeteer.launch({ executablePath: chrome, args: ["--no-sandbox", "--disable-dev-shm-usage", ...fine] })
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
  try {
    const p = await browser.newPage()
    await p.setViewport({ width: 1440, height: 900 })
    const errs: string[] = []
    p.on("pageerror", (e) => errs.push(String(e)))
    const posts: string[] = []
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      const u = new URL(r.url())
      if (r.method() === "POST" && /\/cart\/add\.js$/.test(u.pathname)) { posts.push(r.postData() ?? ""); void r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [] }) }); return }
      if (u.pathname === "/cart.json") { void r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ item_count: 1, items: [] }) }); return }
      void r.continue()
    })
    await p.goto(`${served.base}/`, { waitUntil: "networkidle2", timeout: 60000 })
    await sleep(1500)
    /* Hover every garment while every frame measures what is under the rail and the page height. */
    await p.evaluate(() => { const w = window as unknown as { mv: number; on: boolean }; w.mv = 0; w.on = true; const r = document.querySelector("boutique-rail")!; const els = [r.querySelector(".brail__foot")!, r.querySelector("[data-button]")!, r.closest(".shopify-section")!.nextElementSibling!]; const at = () => [...els.map((e) => e.getBoundingClientRect().top), r.getBoundingClientRect().height, document.documentElement.scrollHeight]; const b = at(); const tick = () => { at().forEach((v, i) => { w.mv = Math.max(w.mv, Math.abs(v - b[i])) }); if (w.on) requestAnimationFrame(tick) }; requestAnimationFrame(tick) })
    /* Changed on purpose (templates round 28): the rail holds eleven pieces and scrolls sideways, so the garments on screen are the ones pointed at (the same first ones, so gs[2] is still the third garment). */
    const gsAll = await p.$$("boutique-rail .brail__track:not([hidden]) .brail__g")
    const gs: typeof gsAll = []
    for (const g of gsAll) { const bb = await g.boundingBox(); if (bb && bb.x >= 0 && bb.x + bb.width < 1440 - 80) gs.push(g) }
    for (const g of gs) { const bb = (await g.boundingBox())!; await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height * 0.45, { steps: 5 }); await sleep(320) }
    const named = await p.evaluate(() => ({ on: document.querySelector("boutique-rail")!.classList.contains("is-naming"), name: document.querySelector("boutique-rail [data-name]")!.textContent }))
    await p.mouse.move(4, 4); await sleep(700)
    const moved = await p.evaluate(() => { const w = window as unknown as { mv: number; on: boolean }; w.on = false; return w.mv })
    check("in Chromium: hovering every garment names it under the rail and moves nothing (0 px, every frame)", moved === 0 && named.on && !!named.name, { moved, named })
    const g2 = (await gs[2].boundingBox())!
    await p.mouse.move(g2.x + g2.width / 2, g2.y + g2.height * 0.45, { steps: 4 }); await sleep(500)
    await p.mouse.click(g2.x + g2.width / 2, g2.y + g2.height * 0.45)
    await sleep(1400)
    const open = await p.evaluate(() => { const d = document.querySelector<HTMLDialogElement>("boutique-rail [data-focus-dialog]")!; return { open: d.open, title: d.querySelector(".bf__title")!.textContent, sizes: d.querySelectorAll(".bf__val").length, pairs: d.querySelectorAll(".bf__pair").length, scrollbar: d.offsetWidth - d.clientWidth, lifted: document.querySelectorAll(".brail__item.is-lifted").length, flies: d.querySelectorAll(".bf__fly").length, bg: getComputedStyle(d.querySelector("[data-f-bg]")!).backgroundColor } })
    check("  clicking lifts it into the focus view: its product, sizes, the pieces it is worn with, an empty hanger, no scroll bar, the background chosen", open.open && open.title === gd[2].title && open.sizes >= 3 && open.pairs === 2 && open.lifted === 1 && open.flies === 0 && open.scrollbar === 0 && open.bg === "rgb(252, 252, 252)", open) /* Changed on purpose (templates round 28): the focus view wears its own colour scheme (the template's Default, #fcfcfc), no longer a picked white. */
    await p.click("boutique-rail [data-f-next]"); await sleep(700)
    check("  the arrow slides to the next garment, its hanger empty instead", (await p.$eval("boutique-rail .bf__title", (e) => e.textContent)) === gd[3].title && (await p.evaluate(() => document.querySelectorAll(".brail__item.is-lifted").length)) === 1)
    posts.length = 0
    await p.click("boutique-rail [data-f-atc]"); await sleep(800)
    const atc = await p.evaluate(() => ({ cls: document.querySelector("boutique-rail [data-f-atc]")!.className, cart: !(document.querySelector("boutique-rail [data-f-cart]") as HTMLElement).hidden, open: document.querySelector<HTMLDialogElement>("boutique-rail [data-focus-dialog]")!.open }))
    const sentItems = posts.map((x) => (JSON.parse(x) as { items: { id: string }[] }).items)
    check("  Add to cart sends the chosen variant to /cart/add.js and the view stays open saying so", sentItems.length === 1 && gd[3].variants.some((v) => v.id === sentItems[0][0].id) && /is-added/.test(atc.cls) && atc.cart && atc.open, { sentItems, atc })
    posts.length = 0
    await p.click("boutique-rail .bf__plus"); await sleep(600)
    check("  a piece it is worn with goes to the cart from its own button", posts.length === 1 && (JSON.parse(posts[0]) as { items: { id: string }[] }).items[0].id === gd[3].with[0].variant)
    await p.keyboard.press("Escape"); await sleep(1200)
    const closed = await p.evaluate(() => ({ open: document.querySelector<HTMLDialogElement>("boutique-rail [data-focus-dialog]")!.open, lifted: document.querySelectorAll(".brail__item.is-lifted").length, flies: document.querySelectorAll(".bf__fly").length, lock: document.documentElement.classList.contains("brail-lock") }))
    check("  Escape plays it back: closed, the garment on its hanger, nothing left over", !closed.open && closed.lifted === 0 && closed.flies === 0 && !closed.lock, closed)
    /* Round 28: the pictures swipe (dots and arrows), the quantity is sent, and closing is quick. */
    await p.mouse.click(g2.x + g2.width / 2, g2.y + g2.height * 0.45); await sleep(1200)
    const gal = await p.evaluate(() => { const d = document.querySelector("boutique-rail [data-focus-dialog]")!; return { slides: d.querySelectorAll(".bf__slide").length, dots: d.querySelectorAll(".bf__dot").length } })
    const mb = (await (await p.$("boutique-rail [data-f-media]"))!.boundingBox())!
    await p.mouse.move(mb.x + mb.width / 2, mb.y + mb.height / 2); await sleep(300)
    await p.click("boutique-rail [data-f-inext]"); await sleep(900)
    const at = await p.evaluate(() => { const sl = document.querySelector<HTMLElement>("boutique-rail [data-f-slides]")!; return { k: Math.round(sl.scrollLeft / sl.clientWidth), cur: [...document.querySelectorAll("boutique-rail .bf__dot")].findIndex((x) => x.getAttribute("aria-current") === "true") } })
    check("  the focus view swipes through the product's pictures: the hanging cut-out first, then the photo of it worn (dots and arrows)", gal.slides >= 2 && gal.dots === gal.slides && at.k === 1 && at.cur === 1, { gal, at })
    await p.evaluate(() => { document.querySelector<HTMLElement>("boutique-rail [data-f-slides]")!.scrollLeft = 0 }); await sleep(200)
    posts.length = 0
    await p.click("boutique-rail [data-f-qty] button[name=plus]"); await sleep(80)
    await p.click("boutique-rail [data-f-atc]"); await sleep(700)
    check("  the quantity box adds that many", posts.length === 1 && (JSON.parse(posts[0]) as { items: { quantity: number }[] }).items[0].quantity === 2, posts)
    /* Timed inside the page, from the key press to the dialog closing, so the test's own round trips do not count. The animations last 220 ms; the old close (the open played backwards) took about a second. */
    await p.evaluate(() => { const w = window as unknown as { t0: number; t1: number }; const d = document.querySelector<HTMLDialogElement>("boutique-rail [data-focus-dialog]")!; w.t1 = 0; document.addEventListener("keydown", () => { w.t0 = performance.now() }, { capture: true, once: true }); new MutationObserver((_, o) => { if (!d.open) { w.t1 = performance.now(); o.disconnect() } }).observe(d, { attributes: true, attributeFilter: ["open"] }) })
    await p.keyboard.press("Escape")
    await p.waitForFunction(() => (window as unknown as { t1: number }).t1 > 0, { timeout: 3000 }).catch(() => undefined)
    const closeMs = await p.evaluate(() => { const w = window as unknown as { t0: number; t1: number }; return Math.round(w.t1 - w.t0) })
    /* Its animations last 220 ms; the old close could not end before 714 ms (its longest part reversed), so 650 ms separates the two even on a busy machine. */
    check("  closing is quick: the view is gone well before the old close could end, timed in the page", closeMs > 0 && closeMs < 650 && (await p.evaluate(() => document.querySelectorAll(".bf__fly").length)) === 0, closeMs)
    await sleep(500)
    /* Closed while it is still opening: the opening turns round where it is, and it opens cleanly again after. */
    await p.mouse.click(g2.x + g2.width / 2, g2.y + g2.height * 0.45); await sleep(250)
    await p.keyboard.press("Escape"); await sleep(1100)
    const back = await p.evaluate(() => ({ open: document.querySelector<HTMLDialogElement>("boutique-rail [data-focus-dialog]")!.open, lifted: document.querySelectorAll(".brail__item.is-lifted").length, flies: document.querySelectorAll(".bf__fly").length }))
    await p.mouse.click(g2.x + g2.width / 2, g2.y + g2.height * 0.45); await sleep(1400)
    const again = await p.evaluate(() => ({ open: document.querySelector<HTMLDialogElement>("boutique-rail [data-focus-dialog]")!.open, closing: document.querySelector("boutique-rail [data-focus-dialog]")!.classList.contains("is-closing"), lifted: document.querySelectorAll(".brail__item.is-lifted").length, flies: document.querySelectorAll(".bf__fly").length }))
    check("  closed while opening, it turns back with nothing left over, and opens cleanly again", !back.open && back.lifted === 0 && back.flies === 0 && again.open && !again.closing && again.lifted === 1 && again.flies === 0, { back, again })
    await p.keyboard.press("Escape"); await sleep(1200)
    const tab2 = (await p.$$("boutique-rail [data-tab]"))[1]
    await tab2.click(); await sleep(1500)
    check("  Jersey switches the rail to the jersey pieces", (await p.evaluate(() => document.querySelectorAll("boutique-rail .brail__track:not([hidden]) .brail__item").length)) === 11)

    /* Try the look: drag 1:1, the circle at the pointer, a dot, the whole look */
    await p.evaluate(() => document.querySelector("try-the-look")!.scrollIntoView({ block: "start" })); await sleep(900)
    const stg = (await (await p.$("try-the-look [data-stage]"))!.boundingBox())!
    const i0 = await p.evaluate(() => [...document.querySelectorAll("try-the-look [data-model]")].findIndex((x) => x.classList.contains("is-on")))
    const cx = () => p.evaluate((i) => { const r = document.querySelectorAll("try-the-look [data-model]")[i].getBoundingClientRect(); return r.x + r.width / 2 }, i0)
    const x0 = stg.x + stg.width * 0.82, y0 = stg.y + stg.height / 2, c0 = await cx()
    await p.mouse.move(x0, y0); await p.mouse.down()
    let worst = 0
    for (let dx = -12; dx >= -144; dx -= 12) { await p.mouse.move(x0 + dx, y0); await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); worst = Math.max(worst, Math.abs((await cx()) - c0 - dx)) }
    const circle = await p.evaluate(() => { const v = document.querySelector<HTMLElement>("try-the-look [data-view]")!; const st = v.parentElement!.getBoundingClientRect(); const mm = new DOMMatrix(getComputedStyle(v).transform); return { x: mm.m41 + st.x, y: mm.m42 + st.y, mode: v.dataset.mode } })
    await p.mouse.up()
    const settle = await p.evaluate(() => { const st = document.querySelector<HTMLElement>("try-the-look [data-stage]")!; return { on: st.classList.contains("is-settling"), ms: parseFloat(st.style.getPropertyValue("--settle")), blur: getComputedStyle(document.querySelector("try-the-look .ttl__model:not(.is-on)")!).filter } })
    /* Round 28: the release keeps the drag's speed (a settle as long as the distance left at that speed, eased out) and no blur is redrawn while it moves. */
    check("  Try the look: let go, it glides into place at the speed it was let go (240 to 620 ms), with no blur while it moves", settle.on && settle.ms >= 240 && settle.ms <= 620 && settle.blur === "none", settle)
    await sleep(1200)
    check("  Try the look: dragging moves the looks exactly with the pointer (within 1 px) and the Drag circle sits on it", worst <= 1 && Math.abs(circle.x - (x0 - 144)) <= 1 && Math.abs(circle.y - y0) <= 1 && circle.mode === "drag", { worst, circle, at: [x0 - 144, y0] })
    const fit = (await (await p.$("try-the-look .ttl__model.is-on .ttl__fit"))!.boundingBox())!
    await p.mouse.click(fit.x + fit.width / 2, fit.y + fit.height * 0.4); await sleep(900)
    const pin = await p.$("try-the-look [data-lb] [data-pin='1']")
    const pb = (await pin!.boundingBox())!
    await p.mouse.click(pb.x + pb.width / 2, pb.y + pb.height / 2); await sleep(700)
    const shown = await p.evaluate(() => { const it = document.querySelector("try-the-look [data-lb] [data-item='1']")!; return { hot: it.classList.contains("is-hot"), sizes: it.classList.contains("is-open") } })
    check("  a dot in the opened look marks its piece and opens its sizes", shown.hot && shown.sizes, shown)
    posts.length = 0
    await p.click("try-the-look [data-lb] [data-all]"); await sleep(1200)
    const sentAll = posts.map((x) => (JSON.parse(x) as { items: { id: string }[] }).items.map((i) => i.id))
    const want = await p.evaluate(() => (document.querySelector<HTMLElement>("try-the-look .ttl__look:not([hidden]) [data-all]")!.dataset.all ?? "").split(",").filter(Boolean))
    check("  Add full look to bag sends every piece in one add", sentAll.length === 1 && sentAll[0].length === want.length && want.every((id) => sentAll[0].includes(id)), { sentAll, want })
    check("  no script errors", errs.length === 0, errs)
    await p.close()

    /* A phone: tapping a dot opens the look as a sheet with the piece shown. */
    const q = await browser.newPage()
    await q.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })
    await q.goto(`${served.base}/`, { waitUntil: "networkidle2", timeout: 60000 })
    await q.evaluate(() => document.querySelector("try-the-look")!.scrollIntoView({ block: "start" })); await sleep(1200)
    const dot = (await (await q.$("try-the-look .ttl__stage .ttl__model.is-on [data-pin='2']"))!.boundingBox())!
    await q.touchscreen.tap(dot.x + dot.width / 2, dot.y + dot.height / 2); await sleep(1300)
    const sheet = await q.evaluate(() => { const lb = document.querySelector<HTMLDialogElement>("try-the-look [data-lb]")!; const it = lb.querySelector("[data-item='2']")!; const r = it.getBoundingClientRect(); const c = lb.querySelector(".ttl__card")!.getBoundingClientRect(); return { open: lb.open, bottom: Math.round(innerHeight - c.bottom), sizes: it.classList.contains("is-open"), inView: r.top >= 0 && r.top < innerHeight } })
    check("  on a phone, a dot opens the look as a sheet from the bottom, its piece in view with its sizes", sheet.open && sheet.bottom === 0 && sheet.sizes && sheet.inView, sheet)
    await q.close()
  } finally {
    await browser.close()
    served.server.close()
  }
}
