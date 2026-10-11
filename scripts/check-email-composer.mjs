/**
 * ===========================================================================
 *  THE EMAIL COMPOSER, MEASURED AT 360, 390, 430 AND 1280
 * ===========================================================================
 * The real composer (components/email/compose) inside the shell and its
 * route's layer (scripts/render-email-composer.tsx), with the app's
 * stylesheet, in Chromium. What it has to be:
 *
 *   full screen   on a phone the layer covers the window: the /app header
 *                 and the nav pill are not painted; from 768px it is a page
 *                 under the header
 *   one surface   no horizontal overflow; exactly one formatting bar on the
 *                 page, however many text blocks the email has, and none of
 *                 the old per-block toolbars
 *   the keyboard  on a phone the bar is hidden until a text has the caret,
 *                 then sits exactly on a simulated 300px keyboard (the page's
 *                 --kb-inset from visualViewport), and the line being typed
 *                 stays above it; from 768px it is stuck to the top of the
 *                 email while the email scrolls under it
 *   writing       bold, a link, a list and centring from the bar, with the
 *                 caret kept in the text; a paste arrives cleaned; a button
 *                 added at the caret lands between the two halves of the text
 *   the button    drawn as the email draws it: the brand's fill, 12px by
 *                 24px, 16px semibold words, 8px corners, its words typed on
 *                 it
 *   layouts       an empty new email offers five; picking one fills the
 *                 email, the subject and the preview text
 *   preview       beside the writing from 1024px; below that a screen that
 *                 rises from the bottom edge on transform only, with several
 *                 part-way frames each way and no long task, and goes again
 *   the email     its logo has no border, padding, background or radius,
 *                 in light and in dark mode
 *
 *   node scripts/check-email-composer.mjs     (SHOTS_DIR=... keeps screenshots)
 *
 * No build needed: the stylesheet comes from scripts/probe-css.mjs.
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) {
  console.error(`No browser at ${CHROMIUM}.`)
  process.exit(1)
}
const stubs = join(root, ".email-composer-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-email-composer-")), "shots")
mkdirSync(shots, { recursive: true })

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ORIGIN = "https://storelib.test"
const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64")

try {
  writeFileSync(
    join(stubs, "supabase-client.js"),
    `const rows = { profiles: { display_name: "Ana Pop", username: "anapop", avatar_url: null, email: "ana@example.com" }, creators: { id: "cr-1", support_email: "hello@anapop.studio" } }
function from(table) {
  const q = { select() { return q }, eq() { return q }, order() { return q }, limit() { return q },
    maybeSingle() { return Promise.resolve({ data: rows[table] ?? null, error: null }) },
    then(res, rej) { return Promise.resolve({ data: [], error: null }).then(res, rej) } }
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
      "scripts/render-email-composer.tsx",
      "--bundle",
      "--format=iife",
      "--jsx=automatic",
      '--define:process.env.NODE_ENV="production"',
      "--define:process.env.NEXT_PUBLIC_MAIN_DOMAIN=undefined",
      /* The preview now fills fields through lib/email-variables, which reads the app's address from process.env: a browser has no process. */
      '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
      "--alias:@=.",
      "--alias:@/lib/supabase/client=./.email-composer-probe/supabase-client.js",
      "--alias:next/navigation=./.email-composer-probe/navigation.js",
      `--outfile=${join(stubs, "app.js")}`,
      "--log-level=error",
    ],
    { cwd: root, stdio: "inherit", env: { ...process.env, NODE_PATH: join(root, "node_modules") } },
  )
  const css = await appCss(root)
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  const page = `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
  const sizes = [
    ["phone 360", { width: 360, height: 740, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
    ["phone 390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
    ["phone 430", { width: 430, height: 932, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
    ["tablet 768", { width: 768, height: 1024, isMobile: true, hasTouch: true }],
    ["desktop 1280", { width: 1280, height: 860 }],
  ]
  for (const [label, vp] of sizes) {
    console.log(`\n${label}`)
    const tag = label.replace(/\s/g, "-")
    const phone = vp.width < 768
    /* From 768px to 1023px the page is the shell's, and the preview is a screen of its own raised from the bar. */
    const tablet = !phone && vp.width < 1024
    const p = await browser.newPage()
    await p.setViewport(vp)
    await p.setRequestInterception(true)
    p.on("request", (r) => (r.url().startsWith(ORIGIN) ? r.respond({ status: 200, contentType: "text/html", body: page }) : r.url().startsWith("https://") ? r.respond({ status: 200, contentType: "image/gif", body: GIF }) : r.continue()))
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e)))
    await p.goto(`${ORIGIN}/app/emails/new`)
    await p.waitForSelector("[data-email-editor] [data-email-text]", { timeout: 15000 }).catch((e) => { console.log("page errors:", errors.slice(0, 3)); throw e })
    await sleep(400)

    /* ── The frame ── */
    const frame = await p.evaluate(() => {
      const pane = document.querySelector("[data-compose]")
      const layer = document.querySelector("[data-page-layer]").getBoundingClientRect()
      const header = document.querySelector("[data-probe-header]")
      const pill = document.querySelector("[data-app-nav-pill]")
      const top = document.elementFromPoint(innerWidth / 2, 20)
      const bottom = document.elementFromPoint(innerWidth / 2, innerHeight - 30)
      return {
        sideways: pane.scrollWidth - pane.clientWidth,
        doc: document.documentElement.scrollWidth - innerWidth,
        layer: [Math.round(layer.left), Math.round(layer.top), Math.round(layer.width), Math.round(layer.height)],
        headerShown: getComputedStyle(header).visibility !== "hidden" && !!top?.closest("[data-probe-header]"),
        pillShown: getComputedStyle(pill).visibility !== "hidden" && getComputedStyle(pill).display !== "none" && !!bottom?.closest("[data-app-nav-pill]"),
        bars: document.querySelectorAll('[role="toolbar"][aria-label="Formatting"]').length,
        oldBars: document.querySelectorAll(".rich-text-toolbar").length,
      }
    })
    expect(frame.sideways <= 0 && frame.doc <= 0, "nothing scrolls sideways", [frame.sideways, frame.doc])
    if (phone) {
      expect(frame.layer[0] === 0 && frame.layer[1] === 0 && frame.layer[2] === vp.width && frame.layer[3] === vp.height, "the page is a layer over the whole window", frame.layer)
      expect(!frame.headerShown, "the /app header is not shown")
      expect(!frame.pillShown, "the nav pill is not shown")
    } else {
      expect(frame.headerShown, "from 768px the page sits under the app's header")
    }
    expect(frame.bars === 1 && frame.oldBars === 0, "one formatting bar on the page, none of the old per-block toolbars", [frame.bars, frame.oldBars])
    const starters = await p.$$eval("[data-starter]", (els) => els.map((e) => e.getAttribute("data-starter")))
    expect(starters.join(",") === "letter,announcement,product,newsletter,sale", "an empty new email offers five layouts", starters)
    await p.screenshot({ path: join(shots, `${tag}-empty.png`) })
    if (phone) {
      const shut = await p.$eval('[data-format-bar]', (b) => ({ open: b.dataset.open, opacity: getComputedStyle(b).opacity }))
      expect(shut.open === "false" && shut.opacity === "0", "on a phone the bar is away until a text has the caret", shut)
      const foot = await p.$eval("[data-compose-foot]", (f) => { const r = f.getBoundingClientRect(); return { bottom: Math.round(r.bottom), shown: f.dataset.hidden === "false" } })
      expect(foot.shown && Math.abs(foot.bottom - vp.height) <= 1, "Preview and Send are at the foot of the screen", foot)
      const frames = await p.$$eval("iframe", (f) => f.length)
      expect(frames === 0, "and no preview is drawn while writing, until it is asked for", frames)
    }

    /* ── Writing, with the keyboard up on a phone ── */
    const text = "[data-email-editor] [data-email-text]"
    await p.click(text)
    if (phone) await p.evaluate(() => window.__keyboard(300))
    await sleep(320)
    if (phone) {
      const docked = await p.$eval('[data-format-bar]', (b) => { const r = b.getBoundingClientRect(); return { open: b.dataset.open, bottom: Math.round(r.bottom), height: Math.round(r.height), kb: getComputedStyle(document.documentElement).getPropertyValue("--kb-inset").trim() } })
      expect(docked.open === "true" && Math.abs(docked.bottom - (vp.height - 300)) <= 1, "with a text focused the bar sits exactly on the keyboard", docked)
      const foot = await p.$eval("[data-compose-foot]", (f) => f.dataset.hidden)
      expect(foot === "true", "and Preview and Send step aside for it", foot)
      const buttons = await p.$$eval('[data-format-bar] button', (bs) => bs.filter((b) => b.getBoundingClientRect().width > 0).map((b) => [Math.round(b.getBoundingClientRect().width), Math.round(b.getBoundingClientRect().height)]))
      expect(buttons.every(([w, h]) => w >= 44 && h >= 44), "every control on the bar is a 44px target", buttons.filter(([w, h]) => w < 44 || h < 44))
    }
    await p.keyboard.type("Hello from the studio")
    const html = () => p.$eval(text, (el) => el.innerHTML)
    const inText = () => p.evaluate(() => !!document.activeElement?.closest?.("[data-email-text]"))
    const tool = async (name) => {
      const ok = await p.evaluate((n) => {
        const b = document.querySelector(`[data-format-bar] button[aria-label="${n}"]`)
        if (!b) return false
        b.scrollIntoView({ block: "nearest", inline: "nearest" })
        return true
      }, name)
      if (!ok) return false
      await p.click(`[data-format-bar] button[aria-label="${name}"]`)
      await sleep(80)
      return true
    }
    await p.keyboard.down("Shift")
    for (let i = 0; i < 6; i++) await p.keyboard.press("ArrowLeft")
    await p.keyboard.up("Shift")
    await tool("Bold")
    expect(/<(b|strong)>studio<\/(b|strong)>/.test(await html()), "Bold makes the selected word bold", await html())
    expect(await inText(), "and the caret is still in the text")
    await tool("Link")
    await p.waitForSelector('input[aria-label="Link address"]', { timeout: 2000 }).catch(() => null)
    await p.type('input[aria-label="Link address"]', "example.com/new")
    await p.screenshot({ path: join(shots, `${tag}-link.png`) })
    if (phone) {
      const linkRow = await p.evaluate(() => ({ foot: document.querySelector("[data-compose-foot]").dataset.hidden, bar: document.querySelector("[data-format-bar]").dataset.open }))
      expect(linkRow.foot === "true" && linkRow.bar === "true", "typing the link's address keeps the bar on the keyboard and the foot away", linkRow)
    }
    await p.keyboard.press("Enter")
    await sleep(120)
    expect(/href="https:\/\/example\.com\/new"/.test(await html()), "Link links it, https added", await html())
    expect(await inText(), "and the caret is back in the text")
    await p.keyboard.press("End")
    await p.keyboard.press("Enter")
    await p.keyboard.type("First point")
    await tool("Bulleted list")
    expect(/<ul><li>First point/.test(await html()), "Bulleted list makes the line a list", await html())
    await tool("Bulleted list")
    await tool("Alignment: left")
    expect(/text-align: center/.test(await html()), "Alignment centres the line", await html())
    await tool("Alignment: center")
    await tool("Alignment: right")
    await p.keyboard.press("End")
    await p.keyboard.press("Enter")
    await p.evaluate((sel) => {
      const el = document.querySelector(sel)
      const data = new DataTransfer()
      data.setData("text/html", '<p style="color:red;font-family:Comic Sans" onclick="steal()">Pasted <b>words</b><script>bad()</script><img src="x" onerror="bad()"></p>')
      data.setData("text/plain", "Pasted words")
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }))
    }, text)
    await sleep(100)
    const pasted = await html()
    expect(/Pasted <(b|strong)>words<\/(b|strong)>/.test(pasted) && !/script|onclick|onerror|color:|Comic/.test(pasted), "a paste keeps its words and bold, and nothing else", pasted.slice(-160))

    /* The caret stays above the bar while the text grows. */
    for (let i = 0; i < 14; i++) {
      await p.keyboard.press("Enter")
      await p.keyboard.type(`Line ${i + 1}`)
    }
    await sleep(200)
    const caret = await p.evaluate(() => {
      const r = document.getSelection().getRangeAt(0).getBoundingClientRect()
      const bar = document.querySelector("[data-format-bar]").getBoundingClientRect()
      const top = document.querySelector("[data-orders-bar]").getBoundingClientRect()
      return { caretTop: Math.round(r.top), caretBottom: Math.round(r.bottom), barTop: Math.round(bar.top), barBottom: Math.round(bar.bottom), pageBar: Math.round(top.bottom) }
    })
    if (phone) expect(caret.caretBottom <= caret.barTop && caret.caretTop >= caret.pageBar, "the line being typed stays between the page's bar and the formatting bar", caret)
    else {
      const pane = await p.evaluate(async () => {
        const pane = document.querySelector("[data-compose]")
        pane.scrollTop = 420
        await new Promise((r) => setTimeout(r, 120))
        const bar = document.querySelector("[data-format-bar]").getBoundingClientRect()
        return { barTop: Math.round(bar.top), pageBar: Math.round(document.querySelector("[data-orders-bar]").getBoundingClientRect().bottom) }
      })
      expect(Math.abs(pane.barTop - pane.pageBar) <= 1, "from 768px the bar holds under the page's bar while the email scrolls", pane)
    }
    await p.screenshot({ path: join(shots, `${tag}-writing.png`) })

    /* A button at the caret: the text splits around it. */
    await p.evaluate(() => {
      const el = document.querySelector("[data-email-editor] [data-email-text]")
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      let node = null
      while (walk.nextNode()) if (walk.currentNode.nodeValue === "Line 7") node = walk.currentNode
      const r = document.createRange()
      r.setStart(node, 6)
      r.collapse(true)
      const s = document.getSelection()
      s.removeAllRanges()
      s.addRange(r)
    })
    await sleep(60)
    await p.click("[data-bar-add]")
    await sleep(80)
    await p.screenshot({ path: join(shots, `${tag}-add.png`) })
    await p.evaluate(() => [...document.querySelectorAll("[data-format-bar] button")].find((b) => b.textContent.trim() === "Button")?.click())
    await sleep(250)
    const order = await p.evaluate(() => [...document.querySelectorAll("[data-email-editor] [data-block-id]")].map((b) => `${b.dataset.blockType}:${(b.textContent || "").trim().slice(-8)}`))
    expect(order.length === 3 && order[0].startsWith("rich:") && order[0].endsWith("Line 7") && order[1].startsWith("button") && order[2].startsWith("rich:"), "a button added at the caret lands between the two halves of the text", order)
    if (phone) {
      /* Round R8: on a phone a button is edited in its own bottom sheet, which opens as it is added; the keyboard goes down for it. */
      await sleep(500)
      const sheet = await p.evaluate(() => ({ sheet: !!document.querySelector('[data-sheet-panel] [data-block-panel="button"]'), caretInText: !!document.activeElement?.closest?.("[data-email-text]") }))
      expect(sheet.sheet && !sheet.caretInText, "and its settings open in a sheet on a phone, the keyboard down", sheet)
      await p.evaluate(() => document.querySelector("[data-button-label-field]").focus())
      await p.keyboard.type("Get the pack")
      await p.evaluate(() => document.querySelector('[data-sheet-panel] [data-block-panel="button"] input[inputmode=url]').focus())
      await p.keyboard.type("storelib.com/anapop/autumn")
      await p.evaluate(() => document.querySelector("[data-button-sheet-done]").click())
      await sleep(500)
    } else {
      const focusedLabel = await p.evaluate(() => document.activeElement?.hasAttribute?.("data-button-label"))
      expect(focusedLabel, "and its words are ready to type, on the button")
      await p.keyboard.type("Get the pack")
      const url = await p.$('[data-block-panel="button"] input')
      await url.type("storelib.com/anapop/autumn")
    }
    const button = await p.evaluate(() => {
      const b = document.querySelector('[data-block-type="button"] [data-button-label]').parentElement
      const s = getComputedStyle(b)
      return { bg: s.backgroundColor, pad: `${s.paddingTop} ${s.paddingLeft}`, radius: s.borderTopLeftRadius, size: getComputedStyle(b.querySelector("input")).fontSize, weight: getComputedStyle(b.querySelector("input")).fontWeight }
    })
    expect(button.bg === "rgb(15, 118, 110)" && button.pad === "12px 24px" && button.radius === "8px" && button.size === "16px" && button.weight === "600", "the button is the email's button: brand fill, 12px by 24px, 8px corners, 16px semibold", button)
    const bars = await p.$$eval('[role="toolbar"][aria-label="Formatting"]', (x) => x.length)
    expect(bars === 1, "still one formatting bar with two text blocks and a button", bars)
    if (phone) await p.evaluate(() => { document.activeElement?.blur?.(); window.__keyboard(0) })
    await sleep(350)
    await p.screenshot({ path: join(shots, `${tag}-button.png`) })

    /* ── The preview ── */
    if (phone) {
      await p.evaluate(() => {
        window.__frames = []
        window.__long = 0
        window.__longMs = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) { window.__long++; window.__longMs.push(Math.round(e.duration)) } }).observe({ type: "longtask" }) } catch {}
      })
      await p.click('[data-open-preview="foot"]')
      const rise = await p.evaluate(async () => {
        const out = []
        const props = new Set()
        const t0 = performance.now()
        while (performance.now() - t0 < 460) {
          await new Promise((r) => requestAnimationFrame(r))
          const el = document.querySelector("[data-preview-layer]")
          if (!el) continue
          for (const a of el.getAnimations()) for (const k of a.effect.getKeyframes()) for (const x of Object.keys(k)) if (!["offset", "easing", "composite", "computedOffset"].includes(x)) props.add(x)
          const m = new DOMMatrix(getComputedStyle(el).transform)
          out.push(Math.round(m.m42))
        }
        return { ys: out, props: [...props] }
      })
      const between = rise.ys.filter((y) => y > 0 && y < vp.height)
      expect(between.length >= 5 && rise.ys.at(-1) === 0, "Preview rises from the bottom edge with several part-way frames", { partway: between.length, first: rise.ys.slice(0, 4), last: rise.ys.at(-1) })
      await sleep(300)
      const shown = await p.evaluate(() => {
        const layer = document.querySelector("[data-preview-layer]").getBoundingClientRect()
        const f = document.querySelector("[data-preview-layer] iframe")
        const body = f?.contentDocument?.body?.innerHTML ?? ""
        return { layer: [Math.round(layer.top), Math.round(layer.height)], words: /Hello from the/.test(body), button: /bgcolor="#0f766e"[\s\S]*Get the pack/.test(body), width: Math.round(f.getBoundingClientRect().width) }
      })
      expect(shown.layer[0] === 0 && shown.layer[1] === vp.height && shown.words && shown.button, "it covers the screen with the email: the words and the button in the brand's colour", shown)
      expect(Math.abs(shown.width - vp.width) <= 1, "life size, as wide as the phone", shown.width)
      await p.screenshot({ path: join(shots, `${tag}-preview.png`) })
      await p.click("[data-preview-done]")
      const fall = await p.evaluate(async () => {
        const out = []
        const t0 = performance.now()
        while (performance.now() - t0 < 400) {
          await new Promise((r) => requestAnimationFrame(r))
          const el = document.querySelector("[data-preview-layer]")
          if (!el) { out.push("gone"); break }
          out.push(Math.round(new DOMMatrix(getComputedStyle(el).transform).m42))
        }
        return { ys: out, long: window.__long, longMs: window.__longMs }
      })
      const down = fall.ys.filter((y) => typeof y === "number" && y > 0 && y < vp.height)
      expect(down.length >= 4 && fall.ys.at(-1) === "gone", "Done takes it down the same way, then it is gone", { partway: down.length, end: fall.ys.at(-1) })
      expect(fall.long === 0, "no long task while it comes and goes", fall.longMs)
      expect(rise.props.length > 0 && rise.props.every((x) => x === "transform" || x === "opacity"), "the move animates transform and opacity only", rise.props)
    } else if (tablet) {
      await p.click('[data-open-preview="bar"]')
      await sleep(600)
      const shown = await p.evaluate(() => {
        const layer = document.querySelector("[data-preview-layer]")?.getBoundingClientRect()
        const f = document.querySelector("[data-preview-layer] iframe")
        const body = f?.contentDocument?.body?.innerHTML ?? ""
        return { layer: layer ? [Math.round(layer.top), Math.round(layer.width), Math.round(layer.height)] : null, words: /Hello from the/.test(body), width: f ? Math.round(f.getBoundingClientRect().width) : 0, aside: !!document.querySelector('aside[aria-label="Preview"] iframe') }
      })
      expect(!!shown.layer && shown.layer[0] === 0 && shown.layer[1] === vp.width && shown.layer[2] === vp.height && shown.words && shown.width > 0 && shown.width <= vp.width && !shown.aside, "on a tablet Preview in the bar raises the email on a screen of its own, fitted to it", shown)
      await p.screenshot({ path: join(shots, `${tag}-preview.png`) })
      await p.click("[data-preview-done]")
      await sleep(500)
    } else {
      await sleep(400)
      const aside = await p.evaluate(() => {
        const a = document.querySelector('aside[aria-label="Preview"]')
        const body = a?.querySelector("iframe")?.contentDocument?.body?.innerHTML ?? ""
        return { shown: !!a && a.getBoundingClientRect().width > 300, words: /Hello from the/.test(body), button: /bgcolor="#0f766e"[\s\S]*Get the pack/.test(body), openButtons: [...document.querySelectorAll("[data-open-preview]")].filter((b) => b.getBoundingClientRect().width > 0).length }
      })
      expect(aside.shown && aside.words && aside.button && aside.openButtons === 0, "from 1024px the preview is beside the writing, with no switch", aside)
    }

    /* ── The logo, as the email is sent, light and dark ── */
    for (const scheme of ["light", "dark"]) {
      await p.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }])
      if (phone || tablet) {
        await p.click(phone ? '[data-open-preview="foot"]' : '[data-open-preview="bar"]')
        await sleep(500)
      }
      const logo = await p.evaluate(() => {
        const f = [...document.querySelectorAll("iframe")].find((x) => x.contentDocument?.querySelector(".sl-logo"))
        const img = f?.contentDocument?.querySelector(".sl-logo")
        if (!img) return null
        const s = f.contentWindow.getComputedStyle(img)
        return { border: s.borderTopWidth, padding: s.paddingTop + " " + s.paddingLeft, bg: s.backgroundColor, radius: s.borderTopLeftRadius, shadow: s.boxShadow }
      })
      expect(!!logo && logo.border === "0px" && logo.padding === "0px 0px" && logo.bg === "rgba(0, 0, 0, 0)" && logo.radius === "0px" && logo.shadow === "none", `the logo in the email has no frame (${scheme})`, logo)
      if (phone || tablet) {
        if (scheme === "dark") await p.screenshot({ path: join(shots, `${tag}-preview-dark.png`) })
        await p.click("[data-preview-done]")
        await sleep(400)
      }
    }
    await p.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }])

    /* ── Saved ── */
    await sleep(1300)
    const saved = await p.evaluate(() => window.__requests.filter((r) => /\/api\/email\/campaigns/.test(r.url) && (r.method === "POST" || r.method === "PATCH")).map((r) => String(r.body.body ?? "")))
    expect(saved.length > 0 && saved.at(-1).includes('data-sl-block="rich"') && saved.at(-1).includes('data-sl-block="button"') && saved.at(-1).includes("Get the pack"), "the draft was saved with its text and its button", saved.length)
    expect(errors.length === 0, "no errors on the page", errors.slice(0, 3))
    await p.close()

    /* ── A layout, on a fresh page ── */
    const q = await browser.newPage()
    await q.setViewport(vp)
    await q.setRequestInterception(true)
    q.on("request", (r) => (r.url().startsWith(ORIGIN) ? r.respond({ status: 200, contentType: "text/html", body: page }) : r.url().startsWith("https://") ? r.respond({ status: 200, contentType: "image/gif", body: GIF }) : r.continue()))
    await q.goto(`${ORIGIN}/app/emails/new`)
    await q.waitForSelector("[data-starter]")
    await sleep(300)
    await q.click('[data-starter="sale"]')
    await sleep(300)
    const sale = await q.evaluate(() => ({
      subject: document.querySelector("#compose-subject").value,
      preview: document.querySelector("#compose-preview").value,
      blocks: [...document.querySelectorAll("[data-email-editor] [data-block-id]")].map((b) => b.dataset.blockType).join(","),
      centred: getComputedStyle(document.querySelector("[data-email-editor] [data-email-text] h2")).textAlign,
      starters: document.querySelectorAll("[data-starters]").length,
      bars: document.querySelectorAll('[role="toolbar"][aria-label="Formatting"]').length,
      sideways: document.querySelector("[data-compose]").scrollWidth - document.querySelector("[data-compose]").clientWidth,
    }))
    expect(sale.subject === "20% off until Sunday" && sale.preview === "Use the code at checkout." && sale.blocks === "rich,button,rich" && sale.centred === "center", "Sale fills the subject, the preview text and the email, centred", sale)
    expect(sale.starters === 0 && sale.bars === 1 && sale.sideways <= 0, "then the layouts go, one bar stays, and nothing overflows", sale)
    await q.screenshot({ path: join(shots, `${tag}-sale.png`), fullPage: false })

    /* ── Switching layouts, editing one, and going back to blank ── */
    const state = () =>
      q.evaluate(() => {
        const bar = document.querySelector("[data-layout-bar]")
        const pane = document.querySelector("[data-compose]")
        return {
          bar: bar ? bar.querySelector("[data-layout-name]").textContent : null,
          edited: bar ? /edited/.test(bar.textContent) : null,
          subject: document.querySelector("#compose-subject").value,
          preview: document.querySelector("#compose-preview").value,
          blocks: [...document.querySelectorAll("[data-email-editor] [data-block-id]")].map((b) => b.dataset.blockType).join(","),
          words: [...document.querySelectorAll("[data-email-editor] [data-email-text]")].map((t) => t.textContent).join(" ").replace(/\s+/g, " ").trim().slice(0, 40),
          starters: document.querySelectorAll("[data-starters]").length,
          dialog: document.querySelector('[role="dialog"]')?.textContent?.replace(/\s+/g, " ").trim().slice(0, 60) ?? null,
          sideways: Math.max(pane.scrollWidth - pane.clientWidth, document.documentElement.scrollWidth - innerWidth),
        }
      })
    const settle = () => sleep(phone ? 650 : 350)
    /*
      The keyboard goes first, as it does when a finger leaves the text for
      the page (the formatting bar docked on it goes with it), then the
      target is scrolled to the middle: at the top edge the page's own stuck
      bar would take the tap.
    */
    const tap = async (sel) => {
      if (await q.evaluate(() => !!document.activeElement?.closest?.("[data-email-text]"))) {
        await q.evaluate(() => document.activeElement.blur())
        await sleep(phone ? 320 : 60)
      }
      await q.$eval(sel, (el) => el.scrollIntoView({ block: "center" }))
      await sleep(60)
      await q.click(sel)
    }
    const pickInDialog = async (id) => {
      await q.waitForSelector(`[role="dialog"] [data-starter="${id}"]`, { timeout: 3000 }).catch(async (e) => { await q.screenshot({ path: join(shots, `${tag}-FAILED-pick.png`) }); console.log(await state()); throw e })
      await sleep(phone ? 450 : 150)
      await q.click(`[role="dialog"] [data-starter="${id}"]`)
      await settle()
    }
    let st = await state()
    expect(st.bar === "Sale" && st.edited === false, "the line above the email names the layout, not edited", st)
    /* Into each text and out again, typing nothing: still the layout as it came. */
    for (const el of await q.$$("[data-email-editor] [data-email-text]")) {
      await el.click()
      await sleep(40)
    }
    await q.evaluate(() => document.activeElement?.blur?.())
    await sleep(200)
    st = await state()
    expect(st.edited === false, "clicking in and out of its texts does not count as an edit", st)

    await tap("[data-layout-change]")
    await sleep(phone ? 500 : 200)
    const picker = await q.evaluate(() => {
      const d = document.querySelector('[role="dialog"]')
      const rows = [...d.querySelectorAll("[data-starter]")]
      const r = d.getBoundingClientRect()
      return { rows: rows.map((x) => x.dataset.starter).join(","), ticked: rows.filter((x) => x.getAttribute("aria-current") === "true").map((x) => x.dataset.starter), left: Math.round(r.left), right: Math.round(r.right), heights: rows.map((x) => Math.round(x.getBoundingClientRect().height)) }
    })
    expect(picker.rows === "blank,letter,announcement,product,newsletter,sale" && picker.ticked.join() === "sale", "Change opens the layouts, Blank first and Sale ticked", picker)
    expect(picker.left >= 0 && picker.right <= vp.width && picker.heights.every((h) => h >= 44), "the picker fits the screen and every row is a 44px target", picker)
    await q.screenshot({ path: join(shots, `${tag}-layout-picker.png`) })
    await pickInDialog("newsletter")
    st = await state()
    expect(st.bar === "Newsletter" && st.blocks === "rich,divider,rich,divider,rich" && st.subject === "What is new this month" && st.preview === "A few things from this month." && !st.dialog, "an unedited layout switches at once, with its own subject and preview text", st)

    /* Written over: now a switch asks first. */
    await q.click("[data-email-editor] [data-email-text]")
    await q.keyboard.press("End")
    await q.keyboard.type(" And one more thing.")
    await sleep(150)
    st = await state()
    expect(st.edited === true, "typing into the layout marks it edited", st)
    await tap("[data-layout-change]")
    await sleep(phone ? 500 : 200)
    await pickInDialog("letter")
    st = await state()
    expect(/Use the Letter layout\?/.test(st.dialog ?? "") && st.bar === "Newsletter", "switching an edited layout asks first, and has not changed anything yet", st)
    await q.screenshot({ path: join(shots, `${tag}-layout-confirm.png`) })
    const keep = await q.$$('[role="dialog"] button')
    for (const btn of keep) if ((await btn.evaluate((x) => x.textContent)).trim() === "Keep my email") await btn.click()
    await settle()
    st = await state()
    expect(st.bar === "Newsletter" && st.edited === true && /one more thing/.test(await q.$eval("[data-email-editor]", (e) => e.textContent)), "Keep my email leaves it as it was", st)
    await tap("[data-layout-change]")
    await sleep(phone ? 500 : 200)
    await pickInDialog("letter")
    await q.click("[data-layout-confirm]")
    await settle()
    st = await state()
    expect(st.bar === "Letter" && st.blocks === "rich" && st.subject === "" && st.preview === "" && /^Hi \{\{first_name\}\},/.test(st.words), "Replace puts the Letter in, and the Newsletter's subject and preview go with it", st)

    /* A subject of your own is yours, whatever the layout does. */
    await tap("#compose-subject")
    await q.keyboard.type("Studio news")
    await tap("[data-layout-remove]")
    await settle()
    st = await state()
    expect(st.bar === null && st.blocks === "rich" && st.words === "" && st.subject === "Studio news" && st.starters === 1, "Remove on an unedited layout goes straight back to a blank email, keeps the typed subject, and offers the layouts again", st)
    await tap('[data-starters] [data-starter="announcement"]')
    await settle()
    st = await state()
    expect(st.bar === "Announcement" && st.subject === "Studio news" && st.preview === "What is new, and when.", "starting again from a layout keeps the typed subject and fills the empty preview text", st)
    await q.click("[data-email-editor] [data-email-text]")
    await q.keyboard.press("End")
    await q.keyboard.type(" Doors open at nine.")
    await sleep(150)
    await tap("[data-layout-remove]")
    await sleep(phone ? 500 : 200)
    st = await state()
    expect(/Start from blank\?/.test(st.dialog ?? ""), "Remove on an edited layout asks first", st)
    await q.click("[data-layout-confirm]")
    await settle()
    st = await state()
    expect(st.bar === null && st.words === "" && st.subject === "Studio news" && st.preview === "" && st.sideways <= 0, "Clear it leaves a blank email with the typed subject, and nothing overflows at any step", st)
    await q.screenshot({ path: join(shots, `${tag}-layout-blank.png`) })
    await sleep(1300)
    const last = await q.evaluate(() => window.__requests.filter((r) => /\/api\/email\/campaigns/.test(r.url) && (r.method === "POST" || r.method === "PATCH")).at(-1)?.body ?? null)
    expect(!!last && last.subject === "Studio news" && !/Doors open/.test(String(last.body ?? "")), "and that is what was saved", last && { subject: last.subject, body: String(last.body).slice(0, 60) })
    await q.close()
  }
  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}

console.log(`\nShots in ${shots}`)
if (broken) {
  console.log(`\n${broken} check(s) failed`)
  process.exit(1)
}
console.log("\nAll checks passed")
