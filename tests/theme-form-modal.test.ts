/**
 * The Form popup (theme-packages/materia/base/sections/form-modal.liquid) and
 * the product information extras (snippets/product-info-extras.liquid).
 *
 *   drawn        on the website the form waits in a closed <dialog>, posts to
 *                /contact as the theme's newsletter or contact form does
 *                (form_type customer or contact, placement popup); in the
 *                builder it is drawn open in the page, with its link named
 *   in Chromium  a link to #open-form-<name> opens it as a modal, the focus
 *                goes in, the page stops scrolling; sending posts to
 *                /contact in the background with the fields (a message's
 *                extra fields written into it) and shows the thank you;
 *                Escape closes it, the page scrolls again and the focus goes
 *                back to the link; on a phone it is a sheet at the bottom
 *   product      the nine extra blocks are offered in Main product and in
 *                Featured product, and each draws on a product page with no
 *                template code left; the offer timer draws nothing without
 *                a date
 *
 *   Run: tests/theme-form-modal.test.ts (needs Chromium at /opt/pw-browsers/chromium or $CHROMIUM)
 */
import { existsSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

import { CODE_THEME_PACKAGE } from "../lib/themes/marketplace-shared"
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

const TEMPLATE = "default"
const EXTRAS = ["delivery_estimate", "stock_level", "offer_timer", "guarantee_row", "whats_included", "comparison_table", "faq_accordion", "quote_card", "link_button"]
const RAW = /\{\{|\{%|%\}|Liquid error|Template syntax error/

type Stored = { id: string; type: string; settings: Record<string, unknown>; blocks?: Stored[] }

async function main() {
  const imported = await importTemplate(`${CODE_THEME_PACKAGE}/${TEMPLATE}`)
  const { schema } = editorSchemaOf(imported, "form-modal")
  check("the Form popup has a panel and four presets", !!schema && (schema.presets?.length ?? 0) === 4)
  const presetSection = (i: number, id: string): Stored => {
    const p = schema!.presets![i]
    return { id, type: "form-modal", settings: { ...(p.settings ?? {}) }, blocks: (p.blocks ?? []).map((b, k) => ({ id: `${id}b${k}`, type: b.type, settings: { ...b.settings } })) }
  }
  const opener = (key: string): Stored => ({ id: "opener", type: "custom-html", settings: { html_custom: `<p style="padding:40px"><a id="opener" href="#open-form-${key}">Open</a></p>` } })

  /* ── Drawn by the engine ───────────────────────────────────────────── */
  const built = auditSite(imported, TEMPLATE, false)
  const signup = presetSection(0, "fmA")
  const contact = presetSection(1, "fmB")
  built.site.pages.home = homeWith(built, [opener(String(signup.settings.form_key)), signup as never, contact as never])
  const get = async (path = "/") => String((await answer(built.site, { method: "GET", path, query: new URLSearchParams(), body: null, cart: [] })).body)
  let html = await get()
  const a = sectionMarkup(html, "fmA") ?? ""
  const b = sectionMarkup(html, "fmB") ?? ""
  check("the sign up is a closed dialog with its form name", /<dialog\b[^>]*data-form-modal="guide"/.test(a) && !/<dialog\b[^>]*\sopen\b/.test(a))
  check("  it posts to /contact as a newsletter sign up, from a popup", /<form[^>]*action="\/contact#[^"]*"/.test(a) && /name="form_type" value="customer"/.test(a) && /name="storelib_placement" value="popup"/.test(a))
  check("  the contact one posts as a message with a subject", /name="form_type" value="contact"/.test(b) && /name="contact\[subject\]" value="Send us a message"/.test(b) && /name="contact\[body\]"/.test(b))
  check("  no template code is left in either", !RAW.test(a) && !RAW.test(b), (a + b).match(/.{0,60}(\{\{|\{%|Template syntax error).{0,60}/)?.[0])
  built.site.designMode = true
  html = await get()
  const canvas = sectionMarkup(html, "fmA") ?? ""
  check("in the builder it is drawn open in the page, saying which link opens it", /data-fm-canvas/.test(canvas) && !/<dialog/.test(canvas) && /#open-form-guide/.test(canvas))
  built.site.designMode = false

  /* ── The product extras ───────────────────────────────────────────── */
  for (const type of ["main-product", "featured-product"]) {
    const s = editorSchemaOf(imported, type).schema
    const offered = new Set((s?.blocks ?? []).map((x) => x.type))
    check(`${type} offers the nine extra blocks`, EXTRAS.every((t) => offered.has(t)), EXTRAS.filter((t) => !offered.has(t)))
  }
  const mp = editorSchemaOf(imported, "main-product").schema!
  const defaults = (t: string) => Object.fromEntries((mp.blocks?.find((x) => x.type === t)?.fields ?? []).filter((f) => f.default !== undefined).map((f) => [f.id, f.default]))
  const pages = built.site.pages as unknown as Record<string, Stored[]>
  const main = pages.product.find((s) => s.type === "main-product")!
  const kept = main.blocks
  main.blocks = [...(kept ?? []), ...EXTRAS.map((t, i) => ({ id: `x${i}`, type: t, settings: { ...defaults(t), ...(t === "offer_timer" ? { end_date: "2099-01-01" } : {}) } }))]
  const slug = String(built.site.products[0].settings.slug)
  const page = await get(`/products/${slug}`)
  const drawn = EXTRAS.filter((t) => new RegExp(`data-pib-type="${t}"`).test(page))
  check("each extra draws on a product page", drawn.length === EXTRAS.length, EXTRAS.filter((t) => !drawn.includes(t)))
  const visible = page.replace(/<(script|style|template)\b[\s\S]*?<\/\1\s*>/gi, " ").replace(/<[^>]+>/g, " ")
  check("  with no template code", !RAW.test(visible), visible.match(/.{0,60}(\{\{|\{%|%\}|Template syntax error|Liquid error).{0,60}/)?.[0])
  check("  the stock level reads the product's own variants", /data-pix-stock[\s\S]{0,2000}<script type="application\/json">\{"/.test(page))
  main.blocks = [...(kept ?? []), { id: "t0", type: "offer_timer", settings: { ...defaults("offer_timer") } }]
  check("  an offer timer without a date draws nothing", !/data-pix-timer=/.test(await get(`/products/${slug}`)))
  main.blocks = kept

  /* ── In Chromium ──────────────────────────────────────────────────── */
  const chrome = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
  if (!existsSync(chrome)) {
    check("Chromium is there for the browser checks", false, chrome)
  } else {
    const served = await serve(built, join("scripts", "theme-templates", "products", TEMPLATE))
    const browser = await puppeteer.launch({ executablePath: chrome, args: ["--no-sandbox", "--disable-dev-shm-usage"] })
    try {
      for (const [w, phone] of [[1280, false], [390, true]] as const) {
        const p = await browser.newPage()
        await p.setViewport({ width: w, height: 860 })
        const errors: string[] = []
        p.on("pageerror", (e) => errors.push(String(e)))
        const posts: { body: string; ajax: string | undefined }[] = []
        await p.setRequestInterception(true)
        p.on("request", (r) => {
          if (r.method() === "POST" && new URL(r.url()).pathname === "/contact") {
            posts.push({ body: r.postData() ?? "", ajax: r.headers()["x-requested-with"] })
            void r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) })
          } else void r.continue()
        })
        await p.goto(`${served.base}/`, { waitUntil: "networkidle2", timeout: 60000 })
        const tag = phone ? "on a phone" : "on a computer"
        await p.click("#opener")
        await new Promise((r) => setTimeout(r, 600))
        const open = await p.evaluate(() => {
          const d = document.querySelector('dialog[data-form-modal="guide"]') as HTMLDialogElement
          const panel = d.querySelector("[data-fm-panel]")!.getBoundingClientRect()
          return { open: d.open, modal: d.matches(":modal"), state: d.getAttribute("data-state"), inside: d.contains(document.activeElement), locked: getComputedStyle(document.documentElement).overflow === "hidden", bottom: Math.round(innerHeight - panel.bottom), left: Math.round(panel.left), width: Math.round(panel.width) }
        })
        check(`${tag}: the link opens it as a modal, with the focus inside and the page held`, open.open && open.modal && open.state === "open" && open.inside && open.locked, open)
        if (phone) check(`${tag}: it is a sheet at the foot of the screen`, open.bottom <= 1 && open.left <= 1, open)
        else check(`${tag}: it is a window in the middle`, open.bottom > 40 && open.width <= 520, open)
        await p.type('dialog[data-form-modal="guide"] input[type="email"]', "reader@example.com")
        await p.type('dialog[data-form-modal="guide"] input[name="contact[name]"]', "Ada")
        await p.click('dialog[data-form-modal="guide"] .fm__submit')
        await new Promise((r) => setTimeout(r, 700))
        const post = posts[0]
        const fields = post ? decodeURIComponent(post.body) : ""
        check(`${tag}: sending posts to /contact in the background with the address`, !!post && post.ajax === "XMLHttpRequest" && /reader@example\.com/.test(fields) && /name="form_type"\r?\n\r?\ncustomer/.test(fields), fields.slice(0, 300))
        const sent = await p.evaluate(() => { const d = document.querySelector('dialog[data-form-modal="guide"]')!; const done = d.querySelector("[data-fm-done]") as HTMLElement; return { sent: d.hasAttribute("data-sent"), shown: done.getBoundingClientRect().height > 0, focus: d.contains(document.activeElement) } })
        check(`${tag}: the thank you shows in the window`, sent.sent && sent.shown && sent.focus, sent)
        await p.keyboard.press("Escape")
        await new Promise((r) => setTimeout(r, 600))
        const closed = await p.evaluate(() => ({ open: (document.querySelector('dialog[data-form-modal="guide"]') as HTMLDialogElement).open, focus: document.activeElement?.id, locked: getComputedStyle(document.documentElement).overflow === "hidden" }))
        check(`${tag}: Escape closes it, the page scrolls and the focus is back on the link`, !closed.open && closed.focus === "opener" && !closed.locked, closed)
        if (!phone) {
          /* The contact one: opened by its own name, a message written, closed by its button. */
          await p.evaluate(() => (window as unknown as { StorelibFormModal: { open: (k: string) => void } }).StorelibFormModal.open("contact"))
          await new Promise((r) => setTimeout(r, 500))
          await p.type('dialog[data-form-modal="contact"] input[name="contact[name]"]', "Ada Lovelace")
          await p.type('dialog[data-form-modal="contact"] input[type="email"]', "ada@example.com")
          await p.type('dialog[data-form-modal="contact"] textarea', "Do you ship to Norway?")
          await p.click('dialog[data-form-modal="contact"] .fm__submit')
          await new Promise((r) => setTimeout(r, 700))
          const msg = posts[1] ? decodeURIComponent(posts[1].body) : ""
          check("a message posts as contact with the words written", /name="form_type"\r?\n\r?\ncontact/.test(msg) && /name="contact\[body\]"\r?\n\r?\nDo you ship to Norway\?/.test(msg), msg.slice(0, 400))
          await p.click('dialog[data-form-modal="contact"] .fm__close')
          await new Promise((r) => setTimeout(r, 600))
          check("  its close button closes it", !(await p.evaluate(() => (document.querySelector('dialog[data-form-modal="contact"]') as HTMLDialogElement).open)))
        }
        check(`${tag}: no script errors`, errors.length === 0, errors)
        await p.close()
      }
    } finally {
      await browser.close()
      served.server.close()
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(1) })
