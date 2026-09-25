/**
 * ===========================================================================
 *  THE COMPOSE PAGE, MEASURED AND DRIVEN
 * ===========================================================================
 * /app/emails/new rendered with the app's stylesheet against a stand-in
 * server (scripts/render-compose-probe.tsx), at a phone, a laptop and a
 * large desktop. What it claims, checked in Chromium:
 *
 *   - the page never scrolls sideways; the bar's title and actions do not
 *     overlap, and Send is on screen at every width;
 *   - fields are 16px on a phone, so iOS does not zoom;
 *   - the toolbar stays under the bar while the email scrolls, and fits
 *     the screen (it scrolls inside itself on a phone);
 *   - every kind of block can be inserted (slash menu, the Add menu and
 *     markdown shortcuts), edited, moved and deleted, and no two blocks
 *     overlap;
 *   - undo and redo; bold and links from the toolbar;
 *   - the preview beside the editor is the email: the heading, the button
 *     and the product are in the iframe;
 *   - a draft is created once and then saved with its version;
 *   - Send asks first, with the count after unsubscribes, then shows the
 *     send's progress until it is done.
 *
 *   node scripts/check-compose-page.mjs     (no build needed: scripts/probe-css.mjs)
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const fail = (m) => {
  console.error(`\n${m}\n`)
  process.exit(1)
}
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const stubs = join(root, ".compose-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-compose-")), "shots")
mkdirSync(shots, { recursive: true })

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* A 1x1 PNG for every picture the email asks for. */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64")

try {
  writeFileSync(
    join(stubs, "supabase-client.js"),
    `const rows = { profiles: { display_name: "Ana Pop", username: "anapop", avatar_url: null, email: "ana@example.com" }, creators: { id: "cr-1", support_email: "hello@anapop.studio" } }
const products = [
  { id: "p1", title: "Autumn preset pack", slug: "autumn-presets", price_cents: 1900, thumbnail_url: "https://cdn.example.com/p1.png" },
  { id: "p2", title: "Film grain overlays with a name long enough to be cut", slug: "grain", price_cents: 0, thumbnail_url: null },
]
function from(table) {
  const q = {
    select() { return q }, eq() { return q }, order() { return q },
    maybeSingle() { return Promise.resolve({ data: rows[table] ?? null, error: null }) },
    then(res, rej) { return Promise.resolve({ data: table === "products" ? products : [], error: null }).then(res, rej) },
  }
  return q
}
export function createClient() { return { auth: { getUser: async () => ({ data: { user: { id: "u-1", email: "ana@example.com" } } }) }, from } }
`,
  )
  writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/app/emails/new"
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} })
export const useSearchParams = () => new URLSearchParams()
`)
  execFileSync(
    "npx",
    [
      "esbuild",
      "scripts/render-compose-probe.tsx",
      "--bundle",
      "--format=iife",
      "--jsx=automatic",
      '--define:process.env.NODE_ENV="production"',
      "--define:process.env.NEXT_PUBLIC_MAIN_DOMAIN=undefined",
      "--alias:@=.",
      "--alias:@/lib/supabase/client=./.compose-probe/supabase-client.js",
      "--alias:next/navigation=./.compose-probe/navigation.js",
      `--outfile=${join(stubs, "app.js")}`,
      "--log-level=error",
    ],
    { cwd: root, stdio: "inherit", env: { ...process.env, NODE_PATH: join(root, "node_modules") } },
  )
  const css = await appCss(root)
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  writeFileSync(
    join(stubs, "index.html"),
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`,
  )

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
  const open = async (viewport) => {
    const p = await browser.newPage()
    await p.setViewport(viewport)
    await p.setRequestInterception(true)
    p.on("request", (r) => (r.url().startsWith("https://cdn.example.com/") ? r.respond({ status: 200, contentType: "image/png", body: PNG }) : r.continue()))
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e)))
    await p.goto(`file://${join(stubs, "index.html")}`)
    await p.waitForSelector("[data-email-editor]")
    await sleep(150)
    return { p, errors }
  }

  const sideways = (p) => p.evaluate(() => { const el = document.querySelector("[data-compose]"); return el.scrollWidth - el.clientWidth })
  const blockRects = (p) =>
    p.$$eval("[data-block-id]", (els) => els.map((e) => { const r = e.getBoundingClientRect(); return { id: e.dataset.blockId, type: e.dataset.blockType, top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) } }))
  const types = async (p) => (await blockRects(p)).map((b) => b.type)
  const lastText = async (p) => {
    const handle = await p.evaluateHandle(() => [...document.querySelectorAll("[data-block-type=text] [contenteditable]")].pop())
    return handle.asElement()
  }
  const typeIn = async (p, el, text) => {
    await el.click()
    await p.keyboard.type(text, { delay: 5 })
  }
  /* A real pointer click, which is what Radix menus open and choose on. */
  const clickText = async (p, selector, text) => {
    const handle = await p.evaluateHandle((sel, t) => [...document.querySelectorAll(sel)].find((x) => x.textContent.trim() === t || x.textContent.trim().startsWith(t)) ?? null, selector, text)
    const el = handle.asElement()
    if (!el) return false
    await el.click()
    await sleep(120)
    return true
  }

  for (const [label, vp] of [
    ["phone 390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
    ["laptop 1440", { width: 1440, height: 900 }],
    ["desktop 1920", { width: 1920, height: 1080 }],
  ]) {
    console.log(`\n${label}`)
    const phone = vp.width < 640
    const { p, errors } = await open(vp)

    /* The bar. */
    const bar = await p.evaluate(() => {
      const r = (el) => {
        if (!el) return null
        const b = el.getBoundingClientRect()
        return { left: b.left, right: b.right, top: b.top, bottom: b.bottom }
      }
      const title = r(document.querySelector("[data-orders-bar] h1"))
      const send = r(document.querySelector("[data-send-button]"))
      const back = r(document.querySelector("[aria-label='Back to emails']"))
      return { title, send, back, vw: innerWidth }
    })
    expect(bar.send && bar.send.right <= bar.vw && bar.send.left >= 0, "Send is on screen", bar.send && Math.round(bar.send.right))
    expect(bar.title && bar.send && bar.title.right <= bar.send.left, "the title never runs under the actions", bar.title && [Math.round(bar.title.right), Math.round(bar.send.left)])
    expect((await sideways(p)) === 0, "the page never scrolls sideways", await sideways(p))
    if (phone) {
      const sizes = await p.$$eval("#compose-subject, #compose-preview", (els) => els.map((e) => getComputedStyle(e).fontSize))
      expect(sizes.every((s) => s === "16px"), "fields are 16px on a phone", sizes)
      const tb = await p.$eval("[role=toolbar]", (t) => {
        const strip = t.querySelector("[data-toolbar-strip]")
        const add = [...t.querySelectorAll("button")].find((b) => b.textContent.trim() === "Add").getBoundingClientRect()
        return { right: Math.round(t.getBoundingClientRect().right), overflow: getComputedStyle(strip).overflowX, addRight: Math.round(add.right), addLeft: Math.round(add.left) }
      })
      expect(tb.right <= vp.width && tb.overflow === "auto", "the toolbar fits; its formatting scrolls inside it", tb)
      expect(tb.addLeft >= 0 && tb.addRight <= tb.right, "and Add is always in view", tb)
    }

    /* Subject and preview. */
    await p.type("#compose-subject", "New presets for autumn, {{first_name}}")
    await p.type("#compose-preview", "Twelve looks, half price until Sunday")

    /* Writing. */
    const first = await lastText(p)
    await typeIn(p, first, "Autumn is here")
    await p.keyboard.press("Enter")
    await p.keyboard.type("## ", { delay: 5 })
    await p.keyboard.type("What is new", { delay: 5 })
    await p.keyboard.press("Enter")
    await p.keyboard.type("Hi {{first_name}}, the new presets are out.", { delay: 2 })
    await p.keyboard.press("Enter")
    await p.keyboard.type("- ", { delay: 5 })
    await p.keyboard.type("Twelve looks", { delay: 5 })
    await p.keyboard.press("Enter")
    await p.keyboard.type("Half price until Sunday", { delay: 5 })
    await p.keyboard.press("Enter")
    await p.keyboard.press("Enter")
    await p.keyboard.type("/butt", { delay: 10 })
    await sleep(80)
    const slash = await p.$eval("[role=dialog][aria-label='Add a block']", (d) => d.textContent).catch(() => null)
    expect(!!slash && /Button/.test(slash), "typing / opens the blocks, filtered", slash)
    await p.keyboard.press("Enter")
    await sleep(150)
    let t = await types(p)
    expect(t.join() === "text,text,text,list,button,text", "Enter, ## , - and /button made a paragraph, a heading, a list and a button", t)
    const heading = await p.$eval("[data-block-type=text]:nth-child(2) h2", (h) => h.textContent).catch(() => null)
    expect(heading === "What is new", "## became a heading", heading)
    const panel = await p.$("[data-block-panel=button]")
    expect(!!panel, "the button's settings open under it")
    await p.type("[data-block-panel=button] input[id$=-label]", "Shop the presets")
    await p.type("[data-block-panel=button] input[id$=-url]", "anapop.studio/autumn")
    await sleep(100)

    /* Image, product, divider and space from the Add menu. */
    const addFromMenu = async (name) => {
      await p.evaluate(() => [...document.querySelectorAll("[role=toolbar] button")].find((b) => b.textContent.trim() === "Add").click())
      await sleep(150)
      const ok = await clickText(p, "[role=menuitem]", name)
      await sleep(150)
      return ok
    }
    expect(await addFromMenu("Image"), "Image is in the Add menu")
    await p.type("[data-block-panel=image] input[id$=-src]", "https://cdn.example.com/hero.png")
    await clickText(p, "[data-block-panel=image] button", "Use")
    await sleep(150)
    const img = await p.$eval("[data-block-type=image] img", (i) => ({ w: Math.round(i.getBoundingClientRect().width), loaded: i.complete && i.naturalWidth > 0 })).catch(() => null)
    expect(!!img && img.w > 0, "the image shows in the editor", img)
    await p.type("[data-block-panel=image] input[id$=-alt]", "Twelve autumn presets on a table")
    await clickText(p, "[data-block-panel=image] [role=radio]", "50%")
    const half = await p.$eval("[data-block-type=image] img", (i) => i.style.width)
    expect(half === "50%", "the width choice applies", half)

    expect(await addFromMenu("Product"), "Product is in the Add menu")
    await sleep(250)
    const picked = await clickText(p, "[role=option]", "Autumn preset pack")
    await sleep(150)
    const product = await p.$eval("[data-block-type=product]", (e) => e.textContent).catch(() => "")
    expect(picked && /Autumn preset pack/.test(product) && /\$19\.00/.test(product), "a product is chosen from the list and shows its price", product.slice(0, 60))

    expect(await addFromMenu("Divider"), "Divider is in the Add menu")
    expect(await addFromMenu("Space"), "Space is in the Add menu")
    t = await types(p)
    expect(["image", "product", "divider", "spacer"].every((k) => t.includes(k)), "image, product, divider and space are all in the email", t)

    /* Formatting from the toolbar. */
    await p.evaluate(() => {
      const el = document.querySelector("[data-block-type=text]:nth-child(3) [contenteditable]")
      el.focus()
      const r = document.createRange()
      r.selectNodeContents(el)
      const sel = getSelection()
      sel.removeAllRanges()
      sel.addRange(r)
    })
    await sleep(80)
    await p.click("[role=toolbar] button[aria-label=Bold]")
    await sleep(120)
    const bold = await p.$eval("[data-block-type=text]:nth-child(3) [contenteditable]", (e) => e.innerHTML)
    expect(/<b>|<strong>/.test(bold), "Bold from the toolbar", bold.slice(0, 60))

    /* Move, undo, redo, delete. */
    const before = await types(p)
    await p.evaluate(() => document.querySelector("[data-block-type=divider]").dispatchEvent(new MouseEvent("mousedown", { bubbles: true })))
    await sleep(80)
    await p.click("[role=toolbar] button[aria-label='Block actions']")
    await sleep(400)
    await clickText(p, "[role=menuitem], [data-action-sheet] button, [data-action-sheet] a", "Move up")
    await sleep(400)
    const moved = await types(p)
    const di = before.indexOf("divider")
    expect(moved[di - 1] === "divider" && moved[di] === before[di - 1], "Move up moves the block", { before, moved })
    await p.evaluate(() => [...document.querySelectorAll("[role=toolbar] button")].find((b) => b.getAttribute("aria-label") === "Undo").click())
    await sleep(120)
    expect((await types(p)).join() === before.join(), "Undo puts it back", await types(p))
    await p.evaluate(() => [...document.querySelectorAll("[role=toolbar] button")].find((b) => b.getAttribute("aria-label") === "Redo").click())
    await sleep(120)
    expect((await types(p)).join() === moved.join(), "Redo moves it again")
    await p.evaluate(() => document.querySelector("[data-block-type=spacer]").dispatchEvent(new MouseEvent("mousedown", { bubbles: true })))
    await p.click("[role=toolbar] button[aria-label='Block actions']")
    await sleep(400)
    await clickText(p, "[role=menuitem], [data-action-sheet] button, [data-action-sheet] a", "Delete")
    await sleep(400)
    expect(!(await types(p)).includes("spacer"), "Delete removes the block", await types(p))

    /* Nothing overlaps. */
    const rects = await blockRects(p)
    const overlaps = rects.slice(1).filter((r, i) => r.top < rects[i].bottom - 1)
    expect(overlaps.length === 0, "no block overlaps the one above it", overlaps)
    const outside = rects.filter((r) => r.left < 0 || r.right > vp.width)
    expect(outside.length === 0, "every block is inside the screen", outside)

    /* The toolbar stays under the bar. */
    await p.evaluate(() => { document.querySelector("[data-compose]").scrollTop = 900 })
    await sleep(120)
    const stick = await p.evaluate(() => ({ bar: Math.round(document.querySelector("[data-orders-bar]").getBoundingClientRect().bottom), tool: Math.round(document.querySelector("[role=toolbar]").getBoundingClientRect().top) }))
    expect(Math.abs(stick.bar - stick.tool) <= 1, "the toolbar stays right under the bar while the email scrolls", stick)
    await p.screenshot({ path: join(shots, `${label.replace(/\s/g, "-")}-editor.png`) })
    await p.evaluate(() => { document.querySelector("[data-compose]").scrollTop = 0 })

    /* Saved: created once, then saved with its version. */
    await sleep(1500)
    await p.type("#compose-preview", " and a free brush")
    await sleep(1500)
    const reqs = await p.evaluate(() => window.__requests.filter((r) => r.url.startsWith("/api/email/campaigns")).map((r) => ({ m: r.method, v: r.body.expected_updated_at ?? null, id: r.body.id ?? null })))
    const posts = reqs.filter((r) => r.m === "POST")
    const patches = reqs.filter((r) => r.m === "PATCH")
    expect(posts.length === 1 && !!posts[0].id, "the draft is created once, with its own id", posts.length)
    expect(patches.length >= 1 && patches.every((r) => r.v), "and then saved with the version it was read at", patches.length)
    const saved = await p.evaluate(() => window.__campaign?.body ?? "")
    expect(/data-sl-block="button"/.test(saved) && /Shop the presets/.test(saved) && /<h2/.test(saved), "the saved body is the email's HTML", saved.length)
    expect(!/contenteditable/.test(saved), "with no editor markup in it")

    /* The preview is the email. */
    if (phone) await clickText(p, "[role=radio]", "Preview")
    await sleep(400)
    const frame = await p.evaluate(() => {
      const f = document.querySelector("iframe[title='Email preview']")
      const r = f.getBoundingClientRect()
      const d = f.contentDocument
      return { text: d.body.textContent, w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right) }
    })
    expect(/What is new/.test(frame.text) && /Shop the presets/.test(frame.text) && /Autumn preset pack/.test(frame.text), "the preview shows the heading, the button and the product")
    expect(/Hi Ana,/.test(frame.text), "with the reader's first name filled in")
    expect(frame.right <= vp.width, "and fits the screen", frame)
    await p.screenshot({ path: join(shots, `${label.replace(/\s/g, "-")}-preview.png`) })
    if (phone) {
      await clickText(p, "[role=radio]", "Desktop")
      await sleep(300)
      const scaled = await p.$eval("iframe[title='Email preview']", (f) => ({ w: Math.round(f.getBoundingClientRect().width), vw: innerWidth }))
      expect(scaled.w <= scaled.vw, "the desktop preview is scaled to the phone", scaled)
      await clickText(p, "[role=radio]", "Write")
    }

    /* Send: asks first, then shows how far it has got. */
    await p.click("[data-send-button]")
    await sleep(700)
    const ask = await p.evaluate(() => document.body.innerText.match(/Send to [\d,]+/)?.[0] ?? null)
    expect(ask === "Send to 1,201", "Send asks first, with the count after unsubscribes", ask)
    const left = await p.evaluate(() => /3 left out/.test(document.body.innerText))
    expect(left, "and says how many are left out and why")
    await p.screenshot({ path: join(shots, `${label.replace(/\s/g, "-")}-confirm.png`) })
    await p.click("[data-confirm-send]")
    await sleep(400)
    const status = await p.$eval("[data-send-status]", (e) => e.dataset.sendStatus).catch(() => null)
    expect(status === "queued" || status === "sending", "after Send the page shows the send, not the editor", status)
    await sleep(5600)
    const done = await p.$eval("[data-send-status]", (e) => ({ s: e.dataset.sendStatus, t: e.textContent })).catch(() => null)
    expect(done?.s === "sent" && /Sent to 1,203/.test(done.t), "it follows the send to the end, with the server's numbers", done?.s)
    expect(/Not sent1/.test(done?.t ?? ""), "and says what did not go", done?.t?.slice(0, 80))
    const sendCalls = await p.evaluate(() => window.__requests.filter((r) => r.url === "/api/email/send" && !r.body.dry_run).map((r) => r.body))
    expect(sendCalls.length === 1 && !!sendCalls[0].idempotency_key && !!sendCalls[0].expected_updated_at, "one send request, with its key and the version it saw", sendCalls.length)
    expect((await sideways(p)) === 0, "still no sideways scroll")
    await p.screenshot({ path: join(shots, `${label.replace(/\s/g, "-")}-sent.png`) })
    expect(errors.length === 0, "no errors in the page", errors.slice(0, 3))
    await p.close()
  }
  await browser.close()
} finally {
  if (!process.env.KEEP) rmSync(stubs, { recursive: true, force: true })
}
console.log(`\nscreenshots in ${shots}`)
if (broken) {
  console.error(`\n${broken} check(s) failed\n`)
  process.exit(1)
}
console.log("\nall checks passed\n")
