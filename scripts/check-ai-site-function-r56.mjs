/**
 * ===========================================================================
 *  ROUND 56: EVERYTHING A GENERATED WEBSITE CAN PRESS, PRESSED IN CHROMIUM
 * ===========================================================================
 * The sections a generated website holds (scripts/render-ai-function-r56-
 * html.ts: a component written to the runtime contract as the agent engine
 * writes one, and the default theme's contact, promo_newsletter,
 * newsletter_split and hero_product the native engine places) drawn by the
 * real renderer, mounted in the real StorelibSection with the real cart,
 * storefront and section providers (scripts/render-ai-function-r56.tsx), in
 * headless Chromium. Every request the page makes is intercepted and its
 * body read; nothing is sent anywhere.
 *
 * Run twice: as the LIVE site, and as the builder's CANVAS (inEditor,
 * insideEditor, the editor's navigate), where nothing is sent and links move
 * the canvas.
 *
 *   OPTION, QUANTITY  the picked size and the quantity box reach the cart line
 *   DOWNLOAD          a download stays at one whatever the box says
 *   CART, CHECKOUT    the section's own panel opens; Check out hands off to
 *                     the physical checkout (live) or the cart page (canvas)
 *   BUY NOW           a link to the product's own checkout
 *   CONTACT           every field reaches /api/website-builder/contact, the
 *                     others under their labels; honeypot, consent, creator
 *   SIGN UP           /api/website-builder/subscribe with this creator
 *   NOWHERE           a form with no hook says so (role alert / a note)
 *   SEARCH            a search box with no action opens /search?q=
 *   LINKS             a page, mailto:, tel: and #anchor do what they say
 *   PUBLISHED FORM    the booking form island loads and submits (live), is a
 *                     preview that sends nothing (canvas)
 *   NATIVE SECTIONS   contact, two newsletters, the product hero's Buy link
 *
 *   node scripts/check-ai-site-function-r56.mjs      SHOTS=/dir for screenshots
 *   JSON=/file writes the results for the before/after table.
 */
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const SHOTS = process.env.SHOTS
const ORIGIN = "https://shop.example"
const CREATOR = "11111111-1111-4111-8111-111111111111"
const FORM = "6f1f6a3e-2222-4c2b-9a1e-0b6c2d1e3f40"
const stubs = mkdtempSync(join(tmpdir(), "ai-function-r56-"))
const results = []
let broken = 0
const expect = (mode, ok, what, got) => {
  results.push({ mode, what, ok: !!ok })
  console.log(`  ${ok ? "ok  " : "FAIL"}  [${mode}] ${what}${ok || got === undefined ? "" : `   (${JSON.stringify(got).slice(0, 300)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const definition = {
  title: "Book a fitting",
  description: "",
  mode: "form",
  fields: [
    { id: "full_name", type: "name", label: "Your name", required: true },
    { id: "garment", type: "text", label: "What needs fitting", required: false },
  ],
  button_text: "Request a time",
  consent_text: "I agree to be contacted about my fitting.",
  marketing_opt_in: false,
  completion: { message: "Thanks, we will confirm a time." },
}

try {
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, ...rest }, ref) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ref, ...rest }, children) })
`)
  writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, priority, sizes, ...rest }) { return React.createElement("img", { src: typeof src === "string" ? src : "", alt, ...rest }) }
`)
  writeFileSync(join(stubs, "empty.js"), "export {}\n")
  /* The motion islands' 3D code loads only for a section that asks for it; none here does. A stand in, so the probe builds where three is not installed. */
  writeFileSync(join(stubs, "three.js"), "export class RoomEnvironment {}\nexport class RoundedBoxGeometry {}\n")
  const { build } = await import("esbuild")
  await build({ entryPoints: [join(root, "scripts/render-ai-function-r56-html.ts")], bundle: true, platform: "node", format: "cjs", alias: { "@": root }, external: ["server-only"], outfile: join(stubs, "render.cjs"), logLevel: "error", absWorkingDir: root, nodePaths: [join(root, "node_modules")] })
  const rendered = execFileSync(process.execPath, [join(stubs, "render.cjs")], { encoding: "utf8", cwd: root, maxBuffer: 32 << 20 })
  await build({
    entryPoints: [join(root, "scripts/render-ai-function-r56.tsx")],
    bundle: true,
    format: "iife",
    platform: "browser",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"', "process.env.NEXT_PUBLIC_MAIN_DOMAIN": '"storelib.com"', "process.env.NEXT_PUBLIC_SUPABASE_URL": '"https://placeholder.supabase.co"', "process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY": '"placeholder"' },
    alias: { "@": root, "next/navigation": join(root, "scripts/probe-next-navigation.ts"), "next/link": join(stubs, "link.jsx"), "next/image": join(stubs, "image.jsx"), "server-only": join(stubs, "empty.js"), three: join(stubs, "three.js"), "three/examples/jsm/environments/RoomEnvironment.js": join(stubs, "three.js"), "three/examples/jsm/geometries/RoundedBoxGeometry.js": join(stubs, "three.js") },
    banner: { js: 'var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;' },
    loader: { ".css": "empty", ".svg": "dataurl", ".png": "dataurl" },
    outfile: join(stubs, "app.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  const platformCss = JSON.parse(rendered).platformCss
  const page = (mode) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*,*::before,*::after{box-sizing:border-box}body{margin:0;background:#f4f1ea}</style><style>${platformCss.replace(/</g, "\\3c ")}</style></head><body><div id="app"></div><script>window.__SECTIONS__=${rendered.replace(/</g, "\\u003c")};window.__MODE=${JSON.stringify(mode)};window.__CREATOR=${JSON.stringify(CREATOR)};</script><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })

  for (const mode of ["live", "canvas"]) {
    console.log(`\n── ${mode === "live" ? "the live site" : "the builder's canvas"} ──`)
    /* Each run in its own context: the cart is kept in local storage, and the canvas must not start with the live run's. */
    const context = await browser.createBrowserContext()
    const p = await context.newPage()
    await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 })
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e.message || e)))
    const posts = []
    const went = []
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      const u = new URL(r.url())
      const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,OPTIONS" }
      if (r.method() === "OPTIONS") return void r.respond({ status: 204, headers: cors })
      if (r.url() === `${ORIGIN}/`) return void r.respond({ status: 200, contentType: "text/html", body: page(mode) })
      if (r.isNavigationRequest() && r.frame() === p.mainFrame()) {
        went.push(r.url())
        return void r.respond({ status: 200, contentType: "text/html", body: "<p>elsewhere</p>" })
      }
      if (u.pathname === "/api/website-builder/contact" || u.pathname === "/api/website-builder/subscribe") {
        posts.push({ path: u.pathname, body: JSON.parse(r.postData() || "{}") })
        return void r.respond({ status: 200, contentType: "application/json", body: '{"ok":true}' })
      }
      if (u.hostname === "storelib.com" && u.pathname === `/api/forms/${FORM}/public`) return void r.respond({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify({ form: { id: FORM, revision: 2, definition } }) })
      if (u.hostname === "storelib.com" && u.pathname === `/api/forms/${FORM}/submit`) {
        posts.push({ path: u.pathname, body: JSON.parse(r.postData() || "{}") })
        return void r.respond({ status: 201, contentType: "application/json", headers: cors, body: JSON.stringify({ ok: true, message: "Thanks, we will confirm a time.", href: null, action_type: null }) })
      }
      if (u.pathname.startsWith("/api/")) {
        posts.push({ path: u.pathname, body: r.postData() ? JSON.parse(r.postData()) : null })
        return void r.respond({ status: 200, contentType: "application/json", headers: cors, body: "{}" })
      }
      return void r.respond({ status: 204, headers: cors, body: "" })
    })
    await p.goto(`${ORIGIN}/`, { waitUntil: "load" })
    await sleep(500)
    const nav = () => p.evaluate(() => window.__nav.slice())
    const drawnOk = await p.evaluate(() => ["agent", "contact", "promo_newsletter", "newsletter_split", "hero_product"].every((k) => document.querySelector(`[data-probe="${k}"] section, [data-probe="${k}"] form`)))
    expect(mode, drawnOk, "every section is drawn by the real renderer and mounted in StorelibSection")

    /* ── option and quantity ── */
    await p.evaluate(() => {
      const card = document.querySelector('[data-card="linen-shirt"]')
      card.querySelector('input[name="variant"][value="shirt-l"]').click()
      const q = card.querySelector('input[name="quantity"]')
      q.value = "3"
      q.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await p.click('[data-card="linen-shirt"] [data-storelib-add-to-cart]')
    await sleep(200)
    const lines = () => p.evaluate(() => [...document.querySelectorAll("[data-storelib-cart-line-item]")].map((li) => ({ title: li.querySelector("[data-line-title]")?.textContent, variant: li.querySelector("[data-line-variant]")?.textContent, qty: li.querySelector("[data-line-qty]")?.textContent, price: li.querySelector("[data-line-price]")?.textContent })))
    let l = await lines()
    const shirt = l.find((x) => x.title === "Linen shirt")
    expect(mode, shirt?.variant === "Large", "OPTION: the size picked beside the button is the line's option", l)
    expect(mode, shirt?.qty === "3", "QUANTITY: the quantity box beside the button is the line's quantity", l)
    expect(mode, shirt?.price === "$156.00", "the line is priced at the picked option's price times the quantity", l)
    const open = await p.evaluate(() => document.querySelector("[data-storelib-cart-panel]")?.getAttribute("data-open"))
    expect(mode, open === "true", "CART: the add opens the section's own cart panel", open)
    await p.click("[data-storelib-cart-close]")
    await sleep(150)
    await p.evaluate(() => {
      const q = document.querySelector('[data-card="lookbook-pdf"] input[name="quantity"]')
      q.value = "4"
    })
    await p.click('[data-card="lookbook-pdf"] [data-storelib-add-to-cart]')
    await sleep(200)
    l = await lines()
    expect(mode, l.find((x) => x.title === "Lookbook PDF")?.qty === "1", "DOWNLOAD: a download stays at one whatever its box says", l)
    const count = await p.evaluate(() => document.querySelector("[data-storelib-cart-count]")?.textContent)
    expect(mode, count === "4", "the bag's count is every item in the cart (3 + 1)", count)
    const stored = await p.evaluate(() => localStorage.getItem(Object.keys(localStorage).find((k) => k.includes("shop-1")) || ""))
    expect(mode, typeof stored === "string" && stored.includes("shirt-l") && stored.includes("lookbook-pdf"), "the cart is the site's one cart, kept with the option's id", stored?.slice(0, 160))
    if (SHOTS && mode === "live") {
      mkdirSync(SHOTS, { recursive: true })
      await p.screenshot({ path: join(SHOTS, "cart-390.png") })
    }

    /* ── buy now ── */
    const buy = await p.evaluate(() => document.querySelector('[data-card="lookbook-pdf"] a.fx__buy')?.getAttribute("href"))
    expect(mode, buy === "/checkout/lookbook-pdf", "BUY NOW: a link to the product's own checkout", buy)
    const shirtBuy = await p.evaluate(() => !!document.querySelector('[data-card="linen-shirt"] a.fx__buy'))
    expect(mode, !shirtBuy, "a product that needs an option chosen draws no Buy now (its checkout_url is empty)", shirtBuy)

    /* ── forms ── */
    const fill = (sel, values) => p.evaluate((sel, values) => {
      const form = document.querySelector(sel)
      for (const [name, v] of Object.entries(values)) {
        const els = [...form.querySelectorAll(`[name="${name}"]`)]
        for (const el of els) {
          if (el.type === "checkbox" || el.type === "radio") el.checked = Array.isArray(v) ? v.includes(el.value) : v === true
          else el.value = v
        }
      }
    }, sel, values)
    const submit = async (sel) => {
      const ok = await p.evaluate((sel) => {
        const f = document.querySelector(sel)
        if (!f) return false
        f.requestSubmit()
        return true
      }, sel)
      if (!ok) console.log(`        (no form ${sel} on the page: ${await p.evaluate(() => location.href + " " + document.body.innerHTML.slice(0, 200))})`)
    }
    const messageOf = (sel) => p.evaluate((sel) => { const m = document.querySelector(`${sel} [data-storelib-message]`); return m ? { role: m.getAttribute("role"), text: m.textContent } : null }, sel)
    const before = posts.length

    await fill(".fx__contact", { name: "Ana Pop", email: "ana@example.com", phone: "07700 900123", service: "repair", date: "2026-12-01", people: "2", time: ["Morning", "Evening"], message: "The left sleeve is torn.", consent: true })
    await submit(".fx__contact")
    await sleep(300)
    const contact = posts.slice(before).find((x) => x.path === "/api/website-builder/contact")
    if (mode === "live") {
      const m = contact?.body?.message ?? ""
      expect(mode, !!contact && contact.body.creator_id === CREATOR && contact.body.name === "Ana Pop" && contact.body.email === "ana@example.com" && contact.body.consent === true && contact.body.company === "", "CONTACT: sent to /api/website-builder/contact with this creator, the name, the email, the consent, an empty honeypot", contact?.body)
      expect(mode, m.startsWith("The left sleeve is torn.") && m.includes("Phone: 07700 900123") && m.includes("Service: Repair") && m.includes("Preferred date: 2026-12-01") && m.includes("People: 2") && m.includes("Best time: Morning, Evening"), "CONTACT: every other field reaches the creator under its label", m)
      const done = await messageOf(".fx__contact")
      expect(mode, done?.role === "status" && /sent/i.test(done.text), "and the visitor is told it was sent", done)
    } else {
      const note = await messageOf(".fx__contact")
      expect(mode, !contact && /live site/i.test(note?.text ?? ""), "CONTACT: nothing is sent from the canvas, a line says where messages go", { contact, note })
    }

    const b2 = posts.length
    await fill(".fx__news", { email: "reader@example.com" })
    await submit(".fx__news")
    await sleep(300)
    const sub = posts.slice(b2).find((x) => x.path === "/api/website-builder/subscribe")
    if (mode === "live") expect(mode, sub?.body?.email === "reader@example.com" && sub.body.creator_id === CREATOR, "SIGN UP: sent to /api/website-builder/subscribe with this creator", sub?.body)
    else expect(mode, !sub && /Subscribers/.test((await messageOf(".fx__news"))?.text ?? ""), "SIGN UP: nothing is sent from the canvas, a line says where sign-ups go", sub)

    const b3 = posts.length
    const wentBefore = went.length
    await fill(".fx__dead", { name: "Ana" })
    await submit(".fx__dead")
    await sleep(200)
    const dead = await messageOf(".fx__dead")
    expect(mode, posts.length === b3 && went.length === wentBefore, "NOWHERE: a form with no hook sends nothing and does not reload the page", { posts: posts.slice(b3), went: went.slice(wentBefore) })
    if (mode === "live") expect(mode, dead?.role === "alert" && /cannot send/i.test(dead.text), "NOWHERE: and says so to the visitor (role alert)", dead)
    else expect(mode, /not connected/i.test(dead?.text ?? ""), "NOWHERE: and says so to the person designing it", dead)

    /* ── search ── */
    await p.evaluate(() => { const q = document.querySelector("#fx-q"); q.value = "linen shirt" })
    await Promise.all([mode === "live" ? p.waitForNavigation({ timeout: 3000 }).catch(() => null) : sleep(50), submit(".fx__find")])
    await sleep(200)
    if (mode === "live") expect(mode, went.some((u) => u === `${ORIGIN}/search?q=linen%20shirt`), "SEARCH: a search box with no action opens /search?q=", went)
    else expect(mode, (await nav()).includes("/search?q=linen%20shirt"), "SEARCH: in the canvas it opens the search page there", await nav())
    if (mode === "live") {
      await p.goto(`${ORIGIN}/`, { waitUntil: "load" })
      await sleep(400)
    }

    /* ── links ── */
    const clicked = (href) => p.evaluate((href) => {
      const a = [...document.querySelectorAll("a")].find((x) => x.getAttribute("href") === href)
      if (!a) return null
      let prevented = null
      const spy = (e) => { prevented = e.defaultPrevented; e.preventDefault() }
      window.addEventListener("click", spy, { once: true })
      a.click()
      return prevented
    }, href)
    const about = await clicked("/about")
    if (mode === "live") expect(mode, about === false, "LINKS: a page link is followed by the browser", about)
    else expect(mode, about === true && (await nav()).includes("/about"), "LINKS: in the canvas a page link moves the canvas", { about, nav: await nav() })
    const mail = await clicked("mailto:hello@fieldnotes.example")
    const tel = await clicked("tel:+447700900123")
    if (mode === "live") expect(mode, mail === false && tel === false, "LINKS: mailto: and tel: are left to the browser", { mail, tel })
    else expect(mode, mail === true && tel === true, "LINKS: in the canvas mailto: and tel: open nothing", { mail, tel })
    await p.evaluate(() => { window.scrollTo(0, 0); document.querySelector('a[href="#visit"]').click() })
    await sleep(400)
    const anchor = await p.evaluate(() => ({ y: Math.round(document.querySelector("#visit").getBoundingClientRect().top), hash: location.hash, nav: window.__nav.slice() }))
    if (mode === "live") expect(mode, anchor.hash === "#visit" && Math.abs(anchor.y) < 80, "LINKS: #visit scrolls to the section with that id", anchor)
    else expect(mode, anchor.nav.includes("#visit"), "LINKS: in the canvas #visit is handed to the editor's navigate", anchor)

    /* ── published booking form ── */
    await p.waitForSelector(".fx__booking input", { timeout: 4000 }).catch(() => null)
    const island = await p.evaluate(() => [...document.querySelectorAll(".fx__booking input, .fx__booking button")].map((x) => x.getAttribute("aria-label") || x.textContent || x.getAttribute("placeholder") || x.type))
    expect(mode, island.length >= 2, "PUBLISHED FORM: the booking form is drawn into its mark", island)
    const b4 = posts.length
    await p.evaluate(() => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set
      const type = (q, v) => { const i = document.querySelector(`.fx__booking [data-question="${q}"] input`); set.call(i, v); i.dispatchEvent(new Event("input", { bubbles: true })) }
      type("full_name", "Ana Pop")
      type("garment", "A coat")
      document.querySelector('.fx__booking input[type="checkbox"]')?.click()
    })
    /* The form engine refuses an answer sent faster than a person types (its own time check). */
    await sleep(2500)
    await p.evaluate(() => [...document.querySelectorAll(".fx__booking button")].find((b) => /request a time/i.test(b.textContent || ""))?.click())
    await sleep(600)
    const formPost = posts.slice(b4).find((x) => x.path === `/api/forms/${FORM}/submit`)
    if (process.env.DEBUG) console.log(await p.evaluate(() => document.querySelector(".fx__booking").innerHTML.slice(0, 3000)), posts.slice(b4))
    if (mode === "live") expect(mode, !!formPost && JSON.stringify(formPost.body.answers ?? {}).includes("Ana Pop") && formPost.body.source === "website", "PUBLISHED FORM: its answers go to /api/forms/<id>/submit, from the website", formPost?.body)
    else expect(mode, !formPost, "PUBLISHED FORM: a preview in the canvas sends nothing", formPost?.body)

    /* ── native sections ── */
    const b5 = posts.length
    await fill('[data-probe="contact"] form', { name: "Ion", email: "ion@example.com", subject: "Sizes", message: "Do you make tall sizes?" })
    await submit('[data-probe="contact"] form')
    await sleep(300)
    const nc = posts.slice(b5).find((x) => x.path === "/api/website-builder/contact")
    if (mode === "live") expect(mode, nc?.body?.subject === "Sizes" && nc.body.message === "Do you make tall sizes?" && nc.body.creator_id === CREATOR, "NATIVE contact: name, email, subject and message reach the endpoint, the message unchanged", nc?.body)
    else expect(mode, !nc, "NATIVE contact: nothing sent from the canvas", nc)
    for (const k of ["promo_newsletter", "newsletter_split"]) {
      const b6 = posts.length
      await fill(`[data-probe="${k}"] form`, { email: `${k}@example.com` })
      await submit(`[data-probe="${k}"] form`)
      await sleep(300)
      const s = posts.slice(b6).find((x) => x.path === "/api/website-builder/subscribe")
      if (mode === "live") expect(mode, s?.body?.email === `${k}@example.com` && s.body.creator_id === CREATOR, `NATIVE ${k}: the address reaches the creator's Subscribers`, s?.body)
      else expect(mode, !s, `NATIVE ${k}: nothing sent from the canvas`, s)
    }
    const heroBuy = await p.evaluate(() => document.querySelector('[data-probe="hero_product"] a.hero3__buy')?.getAttribute("href"))
    expect(mode, heroBuy === "/products/lookbook-pdf" || /^\/checkout\//.test(heroBuy ?? ""), "NATIVE hero_product: its Buy button goes to the bound product", heroBuy)

    /* ── checkout hand-off, last (the live page leaves) ── */
    await p.click("[data-storelib-cart]")
    await sleep(200)
    const wentBeforeCheckout = went.length
    await Promise.all([mode === "live" ? p.waitForNavigation({ timeout: 4000 }).catch(() => null) : sleep(50), p.click("[data-storelib-checkout]")])
    await sleep(300)
    /* The checkout address carries the lines as base64 JSON ([product, option, quantity]). */
    const itemsOf = (u) => {
      try {
        return JSON.parse(Buffer.from(new URL(u).searchParams.get("items") ?? "", "base64").toString("utf8"))
      } catch {
        return null
      }
    }
    const handoff = went.slice(wentBeforeCheckout).find((u) => /\/checkout/.test(new URL(u).pathname))
    const items = handoff ? itemsOf(handoff) : null
    if (mode === "live") expect(mode, JSON.stringify(items) === JSON.stringify([["linen-shirt", "shirt-l", 3], ["lookbook-pdf", "", 1]]), "CHECKOUT: hands off to the checkout with each line's product, option and quantity", { handoff, items })
    else expect(mode, (await nav()).includes("/cart"), "CHECKOUT: in the canvas it opens the cart page there", await nav())

    expect(mode, errors.length === 0, "no page errors", errors)
    await context.close()
  }

  /* ── screenshots for people: the live page at four widths, forms filled ── */
  if (SHOTS) {
    mkdirSync(SHOTS, { recursive: true })
    const p = await browser.newPage()
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      if (r.url() === `${ORIGIN}/`) return void r.respond({ status: 200, contentType: "text/html", body: page("live") })
      const u = new URL(r.url())
      const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*" }
      if (r.method() === "OPTIONS") return void r.respond({ status: 204, headers: cors })
      if (u.hostname === "storelib.com" && u.pathname.endsWith("/public")) return void r.respond({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify({ form: { id: FORM, revision: 2, definition } }) })
      if (u.pathname.startsWith("/api/")) return void r.respond({ status: 200, contentType: "application/json", headers: cors, body: '{"ok":true}' })
      return void r.respond({ status: 204, headers: cors, body: "" })
    })
    for (const width of [360, 390, 768, 1280]) {
      await p.setViewport({ width, height: 900, deviceScaleFactor: 2 })
      await p.goto(`${ORIGIN}/`, { waitUntil: "load" })
      await sleep(700)
      await p.evaluate(() => {
        const f = document.querySelector(".fx__contact")
        f.querySelector('[name="name"]').value = "Ana Pop"
        f.querySelector('[name="email"]').value = "ana@example.com"
        f.querySelector('[name="message"]').value = "The left sleeve is torn."
        f.requestSubmit()
        document.querySelector(".fx__dead").requestSubmit()
      })
      await sleep(400)
      const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      if (over > 0 && process.env.DEBUG) console.log(await p.evaluate(() => [...document.querySelectorAll("*")].map((e) => ({ e, r: e.getBoundingClientRect() })).filter((x) => x.r.right > window.innerWidth + 1).map((x) => `${x.e.tagName}.${x.e.className} ${Math.round(x.r.right)} in ${x.e.closest("[data-probe]")?.getAttribute("data-probe")}`).slice(0, 12)))
      expect(`shots ${width}`, over <= 0, `no sideways scroll at ${width}px (scrollWidth over by ${over})`, over)
      await p.screenshot({ path: join(SHOTS, `function-${width}.png`), fullPage: true })
    }
    await p.close()
  }
  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
if (process.env.JSON) writeFileSync(process.env.JSON, JSON.stringify(results, null, 1))
const total = results.length
console.log(`\n${total - broken}/${total} checks passed`)
if (broken) process.exit(1)
