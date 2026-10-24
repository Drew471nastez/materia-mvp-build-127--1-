/**
 * ===========================================================================
 *  EVERY BUTTON STYLE, ITS HOVER, AND THE SAME IN PREVIEW AND LIVE
 * ===========================================================================
 * scripts/render-onepage-buttons.tsx, served by ./onepage-probe-server.mjs:
 * the real editor, its real preview frame and the real published page, in
 * each of the button looks below (?v=N). At 1440 and at 390, in a browser
 * that hovers (Blink's hover settings with defaultViewport null and the
 * window size, since setViewport would reset them):
 *
 *   every look is pictured, at rest and with the first button hovered;
 *   a saved page with none of the new fields draws its buttons exactly as
 *   before (21.5px padding and 15px type on a computer, the icon 36px at 20px);
 *   each hover does what it says, with translate/scale/opacity only:
 *     lift: up 2px, the shadow layer and the tint in;   zoom: scale 1.03;
 *     fade: opacity 0.8;   glow: the glow layer in, no movement;
 *     fill: the fill layer in, the text colour changes;
 *     underline: the line under the label grows to full width;
 *     none: nothing;
 *   a featured (Pro) link hovers as a card: the ring in, no movement, its
 *   picture zoomed a little;
 *   the preview frame draws every button and social icon as the live page does;
 *   on a touch phone (no hover) nothing moves.
 * Then the Social links sheet: the "@" in front, a messy Instagram paste
 * saved as https://instagram.com/<name>, a TikTok handle, a bad email's hint.
 *
 *   PROBE_CSS=source node scripts/check-onepage-buttons.mjs
 *   SHOTS=/some/dir PROBE_CSS=source node scripts/check-onepage-buttons.mjs
 */
import { existsSync, mkdirSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const shots = process.env.SHOTS || mkdtempSync(join(tmpdir(), "storelib-onepage-buttons-"))
mkdirSync(shots, { recursive: true })

const VARIANTS = [
  { name: "saved-default", theme: {} },
  { name: "saved-midnight-glass-zoom", theme: { background_type: "solid", background_color: "#0b1220", text_color: "#ffffff", button_style: "glass", button_color: "rgba(255, 255, 255, 0.1)", button_text_color: "#ffffff", button_border_radius: 10, button_border_width: 1, button_border_color: "#182b49", button_shadow: "subtle", button_hover_animation: "zoom" } },
  { name: "solid-rounded-lift", theme: { background_color: "#f6f5f2", text_color: "#1a1a2e", button_style: "filled", button_color: "#1a1a2e", button_text_color: "#ffffff", button_border_radius: 12, button_border_width: 0, button_shadow: "subtle", button_hover_animation: "lift" } },
  { name: "soft-pill-large-glow", theme: { background_color: "#ffffff", text_color: "#1a1a2e", button_style: "soft", button_color: "#2f6f4f", button_text_color: "#2f6f4f", button_border_radius: 999, button_border_width: 0, button_shadow: "none", button_size: "large", button_hover_animation: "glow" } },
  { name: "outline-square-compact-left-iconright-fill", theme: { background_color: "#f3efe6", text_color: "#2340c7", button_style: "outline", button_color: "#2340c7", button_text_color: "#2340c7", button_border_radius: 0, button_border_width: 2, button_border_color: "#2340c7", button_shadow: "none", button_size: "compact", button_text_align: "left", button_icon_position: "right", button_hover_animation: "fill" } },
  { name: "solid-hard-shadow-lift", theme: { background_color: "#ffd84d", text_color: "#111111", button_style: "filled", button_color: "#ffffff", button_text_color: "#111111", button_border_radius: 0, button_border_width: 2, button_border_color: "#111111", button_shadow: "hard", button_shadow_color: "#111111", button_hover_animation: "lift" } },
  { name: "glass-pill-underline", theme: { background_type: "gradient", background_gradient: "linear-gradient(160deg, #1a1a2e 0%, #3a4a5e 100%)", background_color: "#1a1a2e", text_color: "#ffffff", button_style: "glass", button_color: "rgba(255, 255, 255, 0.15)", button_text_color: "#ffffff", button_border_radius: 999, button_border_width: 1, button_border_color: "rgba(255, 255, 255, 0.3)", button_shadow: "none", button_hover_animation: "underline" } },
  { name: "solid-strong-left-none", theme: { background_color: "#eef0f2", text_color: "#111113", button_style: "filled", button_color: "#111113", button_text_color: "#ffffff", button_border_radius: 8, button_shadow: "strong", button_text_align: "left", button_hover_animation: "none" } },
  { name: "soft-rounded-fade", theme: { background_color: "#fff8f2", text_color: "#8a3320", button_style: "soft", button_color: "#8a3320", button_text_color: "#8a3320", button_border_radius: 16, button_shadow: "none", button_hover_animation: "fade" } },
]

const { base, server } = await serveEditorProbe({ root, fail, entry: "scripts/render-onepage-buttons.tsx" })

const HOVER_ARGS = ["--blink-settings=availableHoverTypes=2,primaryHoverType=2,availablePointerTypes=4,primaryPointerType=4"]
const TOUCH_ARGS = ["--blink-settings=availableHoverTypes=1,primaryHoverType=1,availablePointerTypes=2,primaryPointerType=2"]
const launch = (w, h, extra) => puppeteer.launch({ executablePath: CHROMIUM, defaultViewport: null, args: ["--no-sandbox", "--disable-gpu", `--window-size=${w},${h}`, "--hide-scrollbars", ...extra] })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}

async function open(browser, path, width = null) {
  const page = await browser.newPage()
  if (width) {
    const cdp = await page.target().createCDPSession()
    await cdp.send("Emulation.setDeviceMetricsOverride", { width, height: 844, deviceScaleFactor: 1, mobile: false })
  }
  await page.evaluateOnNewDocument((v) => { window.PROBE_VARIANTS = v }, VARIANTS.map((v) => v.theme))
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e)))
  await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded", timeout: 120000 })
  await page.waitForSelector(".op-btn, [data-scroll-container]", { timeout: 90000 })
  await sleep(500)
  page.__errors = errors
  return page
}

/** What a button looks like, and its layers, as the browser computes them. */
const measure = (el) => {
  const cs = getComputedStyle(el)
  const before = getComputedStyle(el, "::before")
  const after = getComputedStyle(el, "::after")
  const label = el.querySelector(".op-label")
  const line = label ? getComputedStyle(label, "::after") : null
  const icon = el.querySelector("img, svg")
  const r = el.getBoundingClientRect()
  return {
    hover: el.dataset.hover,
    bg: cs.backgroundColor,
    color: cs.color,
    radius: cs.borderTopLeftRadius,
    border: `${cs.borderTopWidth} ${cs.borderTopColor}`,
    shadow: cs.boxShadow,
    padTop: cs.paddingTop,
    font: cs.fontSize,
    align: el.querySelector(".op-label") ? getComputedStyle(el.querySelector(".op-label")).textAlign : null,
    translate: cs.translate,
    scale: cs.scale,
    opacity: cs.opacity,
    transition: cs.transitionProperty,
    beforeOpacity: before.opacity,
    afterOpacity: after.opacity,
    lineScale: line ? line.scale : null,
    iconLeft: icon ? Math.round(icon.getBoundingClientRect().left - r.left) : null,
    iconRight: icon ? Math.round(r.right - icon.getBoundingClientRect().right) : null,
    iconSize: icon ? Math.round(icon.getBoundingClientRect().width) : null,
    height: Math.round(r.height),
  }
}

const buttonIn = async (page, label) => {
  const handles = await page.$$("a.op-btn, button.op-btn")
  for (const h of handles) if ((await h.evaluate((e) => e.getClientRects().length > 0 && (e.textContent || "").includes(""))) && (await h.evaluate((e) => e.textContent || "")).includes(label)) return h
  return null
}

const results = {}
for (const [w, h, tag] of [[1440, 900, "1440"], [390, 844, "390"]]) {
  console.log(`\nEvery look at ${tag}, at rest and hovered (a browser that hovers)`)
  const browser = await launch(w, h, HOVER_ARGS)
  for (let v = 0; v < VARIANTS.length; v++) {
    const { name, theme } = VARIANTS[v]
    const page = await open(browser, `/app/onepage?live&v=${v}`, w < 500 ? w : null)
    const hoverable = await page.evaluate(() => matchMedia("(hover: hover) and (pointer: fine)").matches)
    if (v === 0) {
      expect(hoverable, `${tag}: the browser hovers`)
      expect((await page.evaluate(() => innerWidth)) === w, `${tag}: the page is ${w} wide`, await page.evaluate(() => innerWidth))
    }
    await page.screenshot({ path: join(shots, `${tag}-${String(v).padStart(2, "0")}-${name}-rest.png`), fullPage: true })
    const first = await buttonIn(page, "Shop the prints")
    const iconed = await buttonIn(page, "Follow on Instagram")
    const rest = await first.evaluate(measure)
    const restIcon = await iconed.evaluate(measure)
    results[`${tag}:${name}`] = { rest, restIcon }
    if (name === "saved-default" || name === "saved-midnight-glass-zoom") {
      const desktop = tag === "1440"
      expect(rest.padTop === (desktop ? "21.5px" : "19.5px") && rest.font === (desktop ? "15px" : "13px"), `${tag} ${name}: the old padding and type`, `${rest.padTop} ${rest.font}`)
      /* 20px inside the border, as before (the mark's own box adds a pixel or two at some sizes). */
      expect(restIcon.iconLeft >= 20 && restIcon.iconLeft <= 23, `${tag} ${name}: the icon at 20px in`, restIcon.iconLeft)
      expect(restIcon.iconSize === (desktop ? 36 : 32), `${tag} ${name}: the icon its old size`, restIcon.iconSize)
      expect(rest.align === "center", `${tag} ${name}: centred`, rest.align)
      expect(rest.hover === (name === "saved-default" ? "lift" : "zoom"), `${tag} ${name}: the saved hover (${name === "saved-default" ? "default reads as Lift" : "Zoom kept"})`, rest.hover)
    }
    if (theme.button_text_align === "left") expect(rest.align === "left", `${tag} ${name}: text on the left`, rest.align)
    if (theme.button_icon_position === "right") expect(restIcon.iconRight !== null && restIcon.iconRight < 30 && restIcon.iconLeft > 100, `${tag} ${name}: the icon on the right`, { left: restIcon.iconLeft, right: restIcon.iconRight })
    if (theme.button_size === "large") expect(rest.height > results[`${tag}:saved-default`].rest.height, `${tag} ${name}: Large is taller than Medium`, rest.height)
    if (theme.button_size === "compact") expect(rest.height < results[`${tag}:saved-default`].rest.height, `${tag} ${name}: Small is shorter than Medium`, rest.height)
    expect(/translate/.test(rest.transition) && /scale/.test(rest.transition) && !/\ball\b/.test(rest.transition), `${tag} ${name}: the transition names translate and scale`, rest.transition)

    /* Hover the first button. */
    await first.evaluate((el) => el.scrollIntoView({ block: "center" }))
    await sleep(150)
    const box = await first.boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await sleep(450)
    const hov = await first.evaluate(measure)
    await page.screenshot({ path: join(shots, `${tag}-${String(v).padStart(2, "0")}-${name}-hover.png`), clip: { x: 0, y: Math.max(0, box.y - 40), width: w, height: Math.min(260, box.height + 120) }, captureBeyondViewport: false })
    const kind = rest.hover
    const moved = hov.translate !== "none" && hov.translate !== "0px" && hov.translate !== "0px 0px"
    if (kind === "lift") expect(/-2px/.test(hov.translate) && Number(hov.beforeOpacity) > 0.9 && Number(hov.afterOpacity) > 0.03, `${tag} ${name}: Lift rises 2px with its shadow and tint`, { t: hov.translate, shadow: hov.beforeOpacity, tint: hov.afterOpacity })
    if (kind === "zoom") expect(hov.scale === "1.03", `${tag} ${name}: Zoom grows 3%`, hov.scale)
    if (kind === "fade") expect(Math.abs(Number(hov.opacity) - 0.8) < 0.02, `${tag} ${name}: Fade dims`, hov.opacity)
    if (kind === "glow") expect(Number(hov.beforeOpacity) > 0.9 && !moved, `${tag} ${name}: Glow lights up and keeps still`, { glow: hov.beforeOpacity, t: hov.translate })
    if (kind === "fill") expect(Number(hov.afterOpacity) > 0.9 && hov.color !== rest.color, `${tag} ${name}: Fill fills and turns the words`, { fill: hov.afterOpacity, from: rest.color, to: hov.color })
    if (kind === "underline") expect(hov.lineScale === "1 1" || hov.lineScale === "1", `${tag} ${name}: the underline grows in`, hov.lineScale)
    if (kind === "none") expect(!moved && hov.scale === "none" && Number(hov.beforeOpacity) === 0, `${tag} ${name}: None does nothing`, hov)

    /* The featured link: a card. */
    const card = (await page.$$("a.op-card")).length ? await page.evaluateHandle(() => [...document.querySelectorAll("a.op-card")].find((e) => e.getClientRects().length > 0) || null) : null
    if (card && (await card.evaluate((e) => !!e))) {
      await card.evaluate((el) => el.scrollIntoView({ block: "center" }))
      await sleep(200)
      const cb = await card.boundingBox()
      await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2)
      await sleep(650)
      const c = await card.evaluate((el) => ({ translate: getComputedStyle(el).translate, ring: getComputedStyle(el, "::after").opacity, img: getComputedStyle(el.querySelector("img")).scale }))
      if (theme.button_border_radius === 999) {
        const r = await card.evaluate((el) => getComputedStyle(el).borderTopLeftRadius)
        expect(r === "28px", `${tag} ${name}: the featured card stays a rounded card on a Pill page`, r)
      }
      expect(c.translate === "none" && Number(c.ring) > 0.9 && c.img === "1.03", `${tag} ${name}: the featured link hovers as a card (ring, no movement, picture zoomed)`, c)
      if (v === 2) await card.screenshot({ path: join(shots, `${tag}-card-hover.png`), captureBeyondViewport: false })
    }
    expect(page.__errors.length === 0, `${tag} ${name}: no errors`, page.__errors.join(" | ").slice(0, 300))
    await page.close()
  }
  await browser.close()
}

console.log("\nOn a touch phone nothing moves")
{
  const browser = await launch(390, 844, TOUCH_ARGS)
  const page = await open(browser, `/app/onepage?live&v=2`, 390)
  const client = await page.target().createCDPSession()
  await client.send("Emulation.setCPUThrottlingRate", { rate: 4 })
  const touch = await page.evaluate(() => !matchMedia("(hover: hover)").matches)
  expect(touch, "the phone does not hover")
  const first = await buttonIn(page, "Shop the prints")
  const box = await first.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await sleep(450)
  const m = await first.evaluate(measure)
  expect(m.translate === "none" && Number(m.beforeOpacity) === 0, "a tap or a pass does not leave a button lifted", { t: m.translate, shadow: m.beforeOpacity })
  await browser.close()
}

console.log("\nThe preview frame draws every button and social icon as the live page does")
{
  const browser = await launch(1440, 900, HOVER_ARGS)
  for (const v of [0, 3, 4, 6]) {
    const editor = await open(browser, `/app/onepage?v=${v}#links`)
    let frame = null
    for (let i = 0; i < 80 && !frame; i++) {
      frame = editor.frames().find((f) => f.url().includes("onepage-preview")) || null
      if (frame && !(await frame.$(".op-btn"))) frame = null
      if (!frame) await sleep(150)
    }
    expect(!!frame, `v${v}: the preview frame drew the buttons`)
    if (!frame) { await editor.close(); continue }
    await sleep(600)
    const draw = () => {
      const pick = (el) => {
        const cs = getComputedStyle(el)
        return [el.dataset.hover, el.dataset.align, cs.backgroundColor, cs.color, cs.borderTopLeftRadius, cs.borderTopWidth, cs.borderTopColor, cs.boxShadow, cs.backdropFilter, cs.fontWeight].join(" | ")
      }
      const btns = [...document.querySelectorAll(".op-btn, .op-card")].map(pick)
      const socials = [...document.querySelectorAll("a[href]")].filter((a) => a.querySelector("svg") && !a.classList.contains("op-btn") && !a.classList.contains("op-card")).map((a) => `${a.getAttribute("href")} ${a.querySelector("svg").innerHTML.length}`)
      return { btns, socials }
    }
    const inPreview = await frame.evaluate(draw)
    if (v === 0) {
      const preview = await editor.$("iframe")
      if (preview) await preview.screenshot({ path: join(shots, "preview-frame.png") })
    }
    const live = await open(browser, `/app/onepage?live&v=${v}`)
    const onLive = await live.evaluate(draw)
    expect(inPreview.btns.length === onLive.btns.length && inPreview.btns.every((b, i) => b === onLive.btns[i]), `v${v} ${VARIANTS[v].name}: ${onLive.btns.length} buttons drawn the same`, inPreview.btns.find((b, i) => b !== onLive.btns[i]) || "")
    const socialSame = onLive.socials.length >= 5 && onLive.socials.every((s) => inPreview.socials.includes(s))
    expect(socialSame, `v${v}: ${onLive.socials.length} social icons the same, each with its address`, socialSame ? undefined : { preview: inPreview.socials, live: onLive.socials })
    if (v === 0) await live.screenshot({ path: join(shots, "live-same-look.png") })
    await live.close()
    await editor.close()
  }
  await browser.close()
}

console.log("\nThe Social links sheet: a prefix, a messy paste tidied, a hint")
{
  const browser = await launch(1440, 900, HOVER_ARGS)
  const page = await open(browser, `/app/onepage?v=2#links`)
  await page.waitForSelector("div.w-7.h-7.rounded-full", { timeout: 15000 })
  const sheetField = async () => page.waitForSelector("[data-social-prefix] + input", { visible: true, timeout: 8000 })
  const prefix = () => page.$eval("[data-social-prefix]", (e) => e.textContent.trim())
  const clickText = async (sel, text) => {
    const ok = await page.evaluate((s, t) => {
      const el = [...document.querySelectorAll(s)].find((e) => e.offsetParent !== null && e.textContent.trim() === t)
      if (el) el.click()
      return !!el
    }, sel, text)
    if (!ok) throw new Error(`no ${sel} reading ${text}`)
  }
  /* Instagram, already saved: the field shows the handle after an @. */
  await page.click("div.w-7.h-7.rounded-full")
  let input = await sheetField()
  await sleep(400)
  expect((await prefix()) === "@", "Instagram has an @ in front", await prefix())
  expect((await input.evaluate((e) => e.value)) === "satori", "the saved link shows as its handle", await input.evaluate((e) => e.value))
  await page.screenshot({ path: join(shots, "social-instagram.png") })
  await input.evaluate((e) => { e.focus(); e.select() })
  await page.keyboard.press("Backspace")
  await page.keyboard.type("https://www.instagram.com/mara.studio/?igsh=MWQ1ZGUxMzBkMA%3D%3D")
  await sleep(150)
  expect((await prefix()) === "URL", "a pasted link turns the prefix to URL", await prefix())
  await page.screenshot({ path: join(shots, "social-instagram-pasted.png") })
  await clickText("button", "Update")
  await sleep(900)
  const frame = page.frames().find((f) => f.url().includes("onepage-preview"))
  const hrefs = frame ? await frame.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href"))) : []
  expect(hrefs.includes("https://instagram.com/mara.studio"), "the paste was saved as https://instagram.com/mara.studio, and the preview links it", hrefs.filter((h) => /instagram/.test(h)))

  /* TikTok from the list: a bare handle. */
  await page.click("button.w-7.h-7.rounded-full.bg-gray-100")
  await sleep(500)
  await clickText("button p", "TikTok")
  input = await sheetField()
  await sleep(300)
  expect((await prefix()) === "@", "TikTok has an @ in front", await prefix())
  expect((await input.evaluate((e) => e.value)) === "satori", 'an old "@satori" shows as satori', await input.evaluate((e) => e.value))
  await input.evaluate((e) => { e.focus(); e.select() })
  await page.keyboard.press("Backspace")
  await page.keyboard.type("@satori.makes")
  await clickText("button", "Update")
  await sleep(900)
  const hrefs2 = await frame.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")))
  expect(hrefs2.includes("https://tiktok.com/@satori.makes"), "a TikTok handle was saved as https://tiktok.com/@satori.makes", hrefs2.filter((h) => /tiktok/.test(h)))

  /* Email: the word Email in front, and a short hint for a bad address. */
  await page.click("button.w-7.h-7.rounded-full.bg-gray-100")
  await sleep(500)
  await clickText("button p", "Email")
  input = await sheetField()
  await sleep(300)
  expect((await prefix()) === "Email", "Email has Email in front", await prefix())
  await input.evaluate((e) => { e.focus(); e.select() })
  await page.keyboard.press("Backspace")
  await page.keyboard.type("hi@satori")
  await clickText("button", "Update")
  await sleep(300)
  const hint = await page.evaluate(() => [...document.querySelectorAll("p.text-red-600")].map((p) => p.textContent.trim()).find(Boolean) || "")
  expect(/email address/i.test(hint), "a bad address shows a short hint", hint)
  await page.screenshot({ path: join(shots, "social-email-hint.png") })

  /* LinkedIn: the path prefix. */
  await page.keyboard.press("Escape")
  await sleep(500)
  await page.click("button.w-7.h-7.rounded-full.bg-gray-100")
  await sleep(500)
  await clickText("button p", "LinkedIn")
  await sheetField()
  await sleep(300)
  expect((await prefix()) === "linkedin.com/in/", "LinkedIn has linkedin.com/in/ in front", await prefix())
  await page.screenshot({ path: join(shots, "social-linkedin.png") })
  expect(page.__errors.length === 0, "no errors in the editor", page.__errors.join(" | ").slice(0, 300))
  await browser.close()
}

console.log("\nThe Design tab's Buttons panel: every choice drawn as a small button")
for (const [w, h, tag] of [[1440, 900, "1440"], [390, 844, "390"]]) {
  const browser = await launch(w, h, HOVER_ARGS)
  const page = await open(browser, `/app/onepage?v=2#design`, w < 500 ? w : null)
  await page.waitForSelector('[data-nav-row="buttons"]', { visible: true, timeout: 15000 })
  await page.click('[data-nav-row="buttons"]')
  await sleep(900)
  const groups = await page.evaluate(() => [...document.querySelectorAll("h3")].filter((e) => e.getClientRects().length).map((e) => e.textContent.trim()))
  expect(["Style", "Shape", "Size", "Text and icon", "Shadow", "Border", "Colours", "On hover"].every((g) => groups.includes(g)), `${tag}: the panel's groups`, groups.join(", "))
  const samples = await page.$$eval("[data-choice] .op-btn", (els) => els.length)
  expect(samples >= 24, `${tag}: each choice shows its own button`, samples)
  await page.screenshot({ path: join(shots, `${tag}-design-buttons-top.png`) })
  /* Point at the Glow choice: its sample glows. */
  const glow = await page.evaluateHandle(() => [...document.querySelectorAll("[data-choice='Glow']")].find((e) => e.getClientRects().length))
  await glow.evaluate((e) => e.scrollIntoView({ block: "center" }))
  await sleep(300)
  const gb = await glow.boundingBox()
  await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2)
  await sleep(450)
  const lit = await glow.evaluate((e) => getComputedStyle(e.querySelector(".op-btn"), "::before").opacity)
  expect(Number(lit) > 0.9, `${tag}: pointing at Glow shows the glow in its card`, lit)
  await page.screenshot({ path: join(shots, `${tag}-design-buttons-hover.png`), captureBeyondViewport: false })
  expect(page.__errors.length === 0, `${tag}: no errors in the panel`, page.__errors.join(" | ").slice(0, 300))
  await browser.close()
}

server.close()
console.log(`\nScreenshots: ${shots}`)
console.log(broken ? `\n${broken} check(s) failed.\n` : "\nAll checks passed.\n")
process.exit(broken ? 1 : 0)
