/**
 * ===========================================================================
 *  THE RICH TEXT FIELD, MEASURED AT 390 AND 1280
 * ===========================================================================
 * Mounts the real field (components/app/rich-text-editor.tsx), the Emails
 * body that uses it, and the description renderer
 * (scripts/render-rich-text-probe.tsx), and checks what they claim:
 *
 *   geometry     every toolbar control 44px square on a phone and 32px on a
 *                desktop; the toolbar one row that scrolls inside itself on
 *                a phone; nothing makes the page scroll sideways; the text
 *                at 16px or more on a phone, so iOS does not zoom; focusing
 *                the field does not move or resize anything; the field grows
 *                with its text to a limit and then scrolls inside itself
 *   the row      on a phone the end with more controls past it fades, with a
 *                chevron, and both go when that end is reached; a finger that
 *                moves more than 8px presses nothing, a tap presses, and a
 *                swipe scrolls the row
 *   resizing     the bar at the foot has a 32px or taller target on a phone,
 *                follows a finger from its first pixel without scrolling the
 *                page, darkens while held, and stops at 70% of the screen
 *   editing      typing, bold and a list produce the HTML they should; the
 *                toolbar shows what the caret is in; headings and quotes
 *                toggle; a link refuses javascript: and accepts a web
 *                address; undo undoes; a value from outside replaces the text
 *   pasting      Google Docs markup arrives as headings, bold and a list,
 *                with no styles, classes or fonts
 *   pictures     the Picture control opens the file picker; the photo shows
 *                at once, dimmed, while a stubbed upload runs, and nothing
 *                of it is saved until it has its storage address; then it is
 *                saved with its size, alt text is written in place, and it
 *                can be removed; a failed upload says so and leaves nothing;
 *                it is never wider than the text, in the editor or the page;
 *                its bar is one short row centred on it, fades in without
 *                sliding sideways, and its menus are short
 *   limits       a description over 200 KB says so while it is typed
 *   rendering    a description the old editor saved draws without its
 *                handlers, buttons or scripts, its YouTube embed at 16:9;
 *                the server's markup hydrates with no mismatch and nothing
 *                in the console
 *
 *   node scripts/check-rich-text.mjs            (SHOTS_DIR=... keeps screenshots)
 *
 * Runs without a build: the stylesheet comes from scripts/probe-css.mjs.
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) {
  console.error(`No browser at ${CHROMIUM}.`)
  process.exit(1)
}
const dir = join(root, ".rich-text-probe")
mkdirSync(dir, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-rich-text-")), "shots")
mkdirSync(shots, { recursive: true })

let server
let browser
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const DOCS = `<meta charset='utf-8'><b style="font-weight:normal;" id="docs-internal-guid-1"><h2 dir="ltr" style="line-height:1.38"><span style="font-size:16pt;font-family:Arial;color:#000000;font-weight:400">What you get</span></h2><p dir="ltr"><span style="font-size:11pt;font-family:Arial;font-weight:700">Forty</span><span style="font-size:11pt;font-family:Arial;font-weight:400"> templates.</span></p><ul><li dir="ltr"><p dir="ltr"><span style="font-size:11pt">One</span></p></li><li dir="ltr"><p dir="ltr"><span style="font-size:11pt">Two</span></p></li></ul></b>`

try {
  const css = await appCss(root)
  /* Inter from the build, served from here: a page on http cannot read file:// fonts. */
  const fontDir = /url\(file:\/\/([^)]*\/media)\//.exec(interFaces(root))?.[1] ?? null
  const faces = fontDir ? interFaces(root).split(`file://${fontDir}/`).join("/__font/") : ""
  const bundle = join(dir, "probe.js")
  execFileSync(
    join(root, "node_modules/.bin/esbuild"),
    [
      join(root, "scripts/render-rich-text-probe.tsx"),
      "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${bundle}`,
      '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true,versions:{},platform:"browser",cwd:function(){return "/"},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;',
      '--define:process.env.NODE_ENV="production"',
      `--alias:@=${root}`, "--loader:.css=empty",
    ],
    { cwd: root, stdio: ["ignore", "ignore", "inherit"] },
  )
  const js = readFileSync(bundle)
  const html = `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${faces}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script src="/probe.js"></script></body></html>`
  server = createServer((req, res) => {
    if (fontDir && req.url.startsWith("/__font/")) {
      const file = join(fontDir, req.url.slice(8).replace(/[^\w.-]/g, ""))
      if (existsSync(file)) {
        res.writeHead(200, { "content-type": "font/woff2" })
        return res.end(readFileSync(file))
      }
    }
    if (req.url.startsWith("/probe.js")) {
      res.writeHead(200, { "content-type": "text/javascript" })
      return res.end(js)
    }
    res.writeHead(200, { "content-type": "text/html" })
    res.end(html)
  })
  await new Promise((r) => server.listen(0, "127.0.0.1", r))
  const origin = `http://127.0.0.1:${server.address().port}`
  browser = await puppeteer.launch({
    executablePath: CHROMIUM,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--blink-settings=availableHoverTypes=2,primaryHoverType=2,availablePointerTypes=4,primaryPointerType=4"],
  })

  const open = async (vp, query) => {
    const p = await browser.newPage()
    const errors = []
    p.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text())
    })
    p.on("pageerror", (e) => errors.push(String(e)))
    /* Nothing leaves the machine: an embed's frame gets an empty page. */
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      if (r.url().startsWith(origin)) return r.continue()
      /* The stubbed upload's address in this project's storage. */
      if (r.url().includes("supabase.co/storage/")) return r.respond({ status: 200, contentType: "image/png", body: photo })
      return r.respond({ status: 200, contentType: "text/html", body: "" })
    })
    await p.setViewport(vp)
    await p.goto(`${origin}/?${query}`)
    await p.waitForFunction(() => window.__ready === true)
    await sleep(200)
    return { p, errors }
  }
  const sideways = (p) => p.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth)
  const value = (p) => p.evaluate(() => window.__value)
  const tool = (p, label) => p.click(`[role=toolbar] button[aria-label="${label}"]`)
  const pressed = (p, label) => p.$eval(`[role=toolbar] button[aria-label="${label}"]`, (b) => b.getAttribute("aria-pressed"))
  const field = "[role=textbox][contenteditable=true]"
  const box = (p, sel) => p.$eval(sel, (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) } })

  /* A 1600 by 900 photo to upload, drawn by the browser itself. */
  let photo
  const photoPath = join(dir, "photo.png")
  {
    const p = await browser.newPage()
    const b64 = await p.evaluate(() => {
      const c = document.createElement("canvas")
      c.width = 1600
      c.height = 900
      const g = c.getContext("2d")
      g.fillStyle = "#d9cbb4"
      g.fillRect(0, 0, 1600, 900)
      g.fillStyle = "#1a1a2e"
      g.fillRect(600, 250, 400, 400)
      return c.toDataURL("image/png").split(",")[1]
    })
    photo = Buffer.from(b64, "base64")
    writeFileSync(photoPath, photo)
    await p.close()
  }

  const viewports = [
    ["phone", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
    ["desktop", { width: 1280, height: 900 }],
  ]

  for (const [label, vp] of viewports) {
    const phone = label === "phone"
    console.log(`\nThe field, ${label} (${vp.width}px)`)
    const { p, errors } = await open(vp, "view=editor")

    const buttons = await p.$$eval("[role=toolbar] button", (bs) => bs.map((b) => { const r = b.getBoundingClientRect(); return { l: b.getAttribute("aria-label"), w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) } }))
    const want = phone ? 44 : 32
    expect(buttons.length === 16, "sixteen controls: two headings, four marks, two lists, quote, link, picture, emoji, divider, clear, undo, redo", buttons.length)
    expect(buttons.every((b) => b.w === want && b.h === want), `every control is ${want}px square`, [...new Set(buttons.map((b) => `${b.w}x${b.h}`))])
    const rows = new Set(buttons.map((b) => b.top)).size
    /* The row of controls is the scroller, inside the toolbar: the toolbar
       itself stays put so it can stick, and so a slot at its end (a block's
       own menu in the email composer) never scrolls away. */
    const bar = await p.$eval("[role=toolbar]", (bar) => { const t = bar.querySelector("[data-more]") ?? bar; return { scroll: t.scrollWidth, client: t.clientWidth, overflowX: getComputedStyle(t).overflowX } })
    if (phone) {
      expect(rows === 1, "one row", rows)
      expect(bar.scroll > bar.client && bar.overflowX === "auto", "that scrolls sideways inside itself", bar)
    } else {
      expect(rows === 1 && bar.scroll <= bar.client, "one row that fits without scrolling", { rows, ...bar })
    }
    expect((await sideways(p)) <= 0, "the page itself never scrolls sideways", await sideways(p))
    const card = await box(p, "[data-card]")
    const wrap = await box(p, ".rich-text-field")
    expect(wrap.x >= card.x && wrap.x + wrap.w <= card.x + card.w, "the field stays inside its card", { card, wrap })
    const look = await p.$eval(".rich-text-field", (el) => { const s = getComputedStyle(el); return { radius: s.borderTopLeftRadius, border: s.borderTopWidth, color: s.borderTopColor, bg: s.backgroundColor } })
    expect(look.radius === "12px" && look.border === "1px" && look.bg === "rgb(255, 255, 255)", "a white field, a hairline border, 12px corners", look)
    const fontSize = await p.$eval(field, (el) => parseFloat(getComputedStyle(el).fontSize))
    expect(phone ? fontSize >= 16 : fontSize >= 14, phone ? "the text is 16px or more, so iOS does not zoom on focus" : "the text is 15px", fontSize)
    const placeholderShown = await p.$eval(".rich-text-field p[aria-hidden]", (el) => el.textContent).catch(() => null)
    expect(!!placeholderShown, "an empty field shows its placeholder", placeholderShown)

    const before = await box(p, ".rich-text-field")
    await p.click(field)
    await sleep(150)
    const after = await box(p, ".rich-text-field")
    expect(before.h === after.h && before.y === after.y, "focusing it moves and resizes nothing", { before, after })
    const ring = await p.$eval(".rich-text-field", (el) => ({ shadow: getComputedStyle(el).boxShadow, border: getComputedStyle(el).borderTopColor }))
    /* "I don't like that blue line when I select the description": a soft grey halo and a slightly darker border, no blue. */
    const drawn = ring.shadow.split(/,(?![^(]*\))/).map((x) => x.trim()).find((x) => /^rgba\(17, 17, 19, 0\.06\)/.test(x) && /\b(2\.9\d*|3)px$/.test(x))
    const blue = (c) => { const m = /rgba?\((\d+), (\d+), (\d+)/.exec(c); return !!m && Number(m[3]) > Number(m[1]) + 40 }
    expect(!!drawn && !blue(ring.border) && !ring.shadow.split(/,(?![^(]*\))/).some((x) => blue(x) && !/, 0\)/.test(x)), "and draws a soft grey halo, not a blue ring", ring)

    /* The row's ends: a fade and a chevron where there is more, and none where there is not. */
    const ends = () => p.evaluate(() => {
      const strip = document.querySelector("[data-toolbar-strip]")
      const wrap = strip.parentElement
      const op = (side) => getComputedStyle(wrap.querySelector(`[data-toolbar-hint=${side}]`)).opacity
      const cs = getComputedStyle(strip)
      return { fade: strip.dataset.fade, mask: cs.maskImage || cs.webkitMaskImage, start: op("start"), end: op("end"), x: Math.round(strip.scrollLeft) }
    })
    const atStart = await ends()
    if (phone) {
      expect(atStart.fade === "end" && /gradient/.test(atStart.mask) && atStart.end === "1" && atStart.start === "0", "the row's far end fades, with a chevron, and its near end does not", atStart)
      await p.evaluate(() => { const s = document.querySelector("[data-toolbar-strip]"); s.scrollLeft = s.scrollWidth })
      await sleep(250)
      const atEnd = await ends()
      expect(atEnd.fade === "start" && atEnd.end === "0" && atEnd.start === "1", "scrolled to the end, that fade and chevron go and the other end's come", atEnd)
      await p.evaluate(() => { document.querySelector("[data-toolbar-strip]").scrollLeft = 0 })
      await sleep(250)
      expect((await ends()).fade === "end", "and back at the start, back as they were", await ends())

      /* A finger that moves presses nothing; one that stays put does. Pointer events as a phone sends them. */
      const press = (label, dx, detail = 1) => p.evaluate((label, dx, detail) => {
        const b = document.querySelector(`[role=toolbar] button[aria-label="${label}"]`)
        const r = b.getBoundingClientRect()
        const x = r.left + r.width / 2
        const y = r.top + r.height / 2
        const at = (type, d) => b.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 11, pointerType: "touch", isPrimary: true, clientX: x + d, clientY: y }))
        at("pointerdown", 0)
        at("pointermove", dx / 2)
        at("pointermove", dx)
        at("pointerup", dx)
        b.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail, clientX: x + dx, clientY: y }))
      }, label, dx, detail)
      await press("Italic", -12)
      await sleep(80)
      expect((await pressed(p, "Italic")) === "false", "a finger that moves 12px across a control before it lifts does not press it", await pressed(p, "Italic"))
      await press("Italic", 3)
      await sleep(80)
      expect((await pressed(p, "Italic")) === "true", "one that moves 3px is a tap, and presses it", await pressed(p, "Italic"))
      await press("Italic", -12, 0)
      await sleep(80)
      expect((await pressed(p, "Italic")) === "false", "and a keyboard press always goes through", await pressed(p, "Italic"))
      await sleep(200)
      expect(!(await p.$("[role=toolbar] [data-pressing]")), "no control is left shaded afterwards")

      /* The same with a real finger: a swipe scrolls the row and presses nothing, a tap presses. */
      const cdp = await p.target().createCDPSession()
      const finger = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] })
      const it = await box(p, '[role=toolbar] button[aria-label="Underline"]')
      const fx = it.x + it.w / 2
      const fy = it.y + it.h / 2
      await finger("touchStart", fx, fy)
      for (let i = 1; i <= 10; i++) { await finger("touchMove", fx - i * 12, fy); await sleep(16) }
      await finger("touchEnd")
      await sleep(400)
      const swiped = await p.evaluate(() => Math.round(document.querySelector("[data-toolbar-strip]").scrollLeft))
      expect(swiped > 0 && (await pressed(p, "Underline")) === "false", "a swipe across the row scrolls it and presses nothing on the way", { scrolled: swiped, underline: await pressed(p, "Underline") })
      await p.evaluate(() => { document.querySelector("[data-toolbar-strip]").scrollLeft = 0 })
      await sleep(100)
      await p.touchscreen.tap(fx, fy)
      await sleep(120)
      expect((await pressed(p, "Underline")) === "true", "a tap presses it", await pressed(p, "Underline"))
      await p.touchscreen.tap(fx, fy)
      await sleep(120)
      await cdp.detach()
    } else {
      expect(atStart.fade === "none" && atStart.start === "0" && atStart.end === "0", "a row that fits has no fade and no chevrons", atStart)
    }

    await p.keyboard.type("Hello ")
    await tool(p, "Bold")
    await p.keyboard.type("world")
    expect((await pressed(p, "Bold")) === "true", "Bold shows as pressed while typing bold text")
    await tool(p, "Bold")
    expect((await pressed(p, "Bold")) === "false", "and pressing it again turns it off")
    await p.keyboard.press("Enter")
    await tool(p, "Bulleted list")
    await p.keyboard.type("Item one")
    await sleep(100)
    const v1 = await value(p)
    expect(/^<p>Hello <(b|strong)>world<\/(b|strong)><\/p><ul><li>Item one<\/li><\/ul>$/.test(v1), "typing, bold and a list make exactly that HTML", v1)
    expect((await pressed(p, "Bulleted list")) === "true" && (await pressed(p, "Bold")) === "false", "in the list: Bulleted list pressed, Bold not", { list: await pressed(p, "Bulleted list"), bold: await pressed(p, "Bold") })
    expect(!(await p.$(".rich-text-field p[aria-hidden]")), "the placeholder is gone once there is text")

    await p.keyboard.press("Enter")
    await p.keyboard.press("Enter")
    await p.keyboard.type("A heading")
    await tool(p, "Heading")
    await sleep(80)
    expect(/<h2>A heading<\/h2>$/.test(await value(p)) && (await pressed(p, "Heading")) === "true", "Heading turns the line into an h2, and shows it", await value(p))
    await tool(p, "Heading")
    await sleep(80)
    expect(/<p>A heading<\/p>$/.test(await value(p)), "and pressing it again turns it back", await value(p))
    await tool(p, "Quote")
    await sleep(80)
    expect(/<blockquote>A heading<\/blockquote>$/.test(await value(p)) && (await pressed(p, "Quote")) === "true", "Quote makes a blockquote", await value(p))
    await tool(p, "Quote")
    await sleep(80)
    expect(/<p>A heading<\/p>$/.test(await value(p)), "and takes it away again", await value(p))

    /* A link: refused, then accepted. */
    await p.keyboard.down("Shift")
    for (let k = 0; k < 7; k++) await p.keyboard.press("ArrowLeft")
    await p.keyboard.up("Shift")
    await tool(p, "Link")
    await sleep(120)
    await p.type("[aria-label='Link address']", "javascript:alert(1)")
    await p.keyboard.press("Enter")
    await sleep(80)
    const refusal = await p.$eval("[role=alert]", (el) => el.textContent).catch(() => null)
    expect(!!refusal && !/javascript/.test(await value(p)), "a javascript: address is refused, with a reason", refusal)
    await p.$eval("[aria-label='Link address']", (el) => { el.select() })
    await p.type("[aria-label='Link address']", "example.com/guide")
    await p.keyboard.press("Enter")
    await sleep(120)
    expect(/<p>A <a href="https:\/\/example\.com\/guide" target="_blank" rel="noopener noreferrer nofollow">heading<\/a><\/p>$/.test(await value(p)), "a typed address becomes an https link on the selected words", await value(p))

    await tool(p, "Undo")
    await sleep(80)
    expect(/<p>A heading<\/p>$/.test(await value(p)), "Undo takes the link off again and leaves the words", await value(p))
    await tool(p, "Redo")
    await sleep(80)
    expect(/<a href="https:\/\/example\.com\/guide"[^>]*>heading<\/a><\/p>$/.test(await value(p)), "Redo puts it back", await value(p))

    await p.keyboard.press("End")
    await tool(p, "Divider")
    await sleep(80)
    expect(/heading<\/a><\/p><hr>/.test(await value(p)), "Divider adds a rule after the line", await value(p))
    await p.screenshot({ path: join(shots, `field-${label}.png`), fullPage: true })

    /* Paste from Google Docs. */
    await p.click("[data-reset]")
    await sleep(100)
    expect((await p.$eval(field, (el) => el.innerHTML)) === "<p>Reset from outside</p>", "a value from outside replaces the text")
    await p.click(field)
    await p.evaluate((docs) => {
      const el = document.querySelector("[role=textbox][contenteditable=true]")
      const r = document.createRange()
      r.selectNodeContents(el)
      r.collapse(false)
      const sel = getSelection()
      sel.removeAllRanges()
      sel.addRange(r)
      const dt = new DataTransfer()
      dt.setData("text/html", docs)
      dt.setData("text/plain", "What you get\nForty templates.\nOne\nTwo")
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }))
    }, DOCS)
    await sleep(120)
    const pasted = await value(p)
    expect(/<h2>What you get<\/h2><p><(b|strong)>Forty<\/(b|strong)> templates\.<\/p><ul><li>One<\/li><li>Two<\/li><\/ul>/.test(pasted), "a Docs paste arrives as a heading, bold and a list", pasted)
    expect(!/style=|class=|font|dir=|docs-internal/.test(pasted), "with no styles, classes, fonts or Docs ids", pasted)

    /* Grows, then scrolls inside itself. */
    await p.evaluate(() => {
      const el = document.querySelector("[role=textbox][contenteditable=true]")
      el.focus()
    })
    for (let k = 0; k < 30; k++) {
      await p.keyboard.type(`Line ${k}`)
      await p.keyboard.press("Enter")
    }
    await sleep(100)
    const grown = await p.$eval(field, (el) => ({ h: Math.round(el.getBoundingClientRect().height), scroll: el.scrollHeight, client: el.clientHeight, max: getComputedStyle(el).maxHeight }))
    const limit = phone ? 320 : 480
    expect(grown.h === limit && grown.scroll > grown.client, `it grows to ${limit}px, then scrolls inside itself`, grown)
    expect((await sideways(p)) <= 0, "and the page still never scrolls sideways", await sideways(p))
    expect(errors.length === 0, "nothing in the console", errors)
    await p.close()
  }

  const OWN = "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/product-images/creator-1/product-1/1_description_probe.webp"
  const esc = (x) => x.replace(/[./?]/g, "\\$&")
  const status = (p) => p.$eval(".rich-text-field [role=status]", (el) => el.textContent).catch(() => "")

  for (const [label, vp] of viewports) {
    const phone = label === "phone"
    console.log(`\nA picture, ${label} (${vp.width}px)`)
    const { p, errors } = await open(vp, "view=editor&uploadMs=900&value=" + encodeURIComponent("<p>Before the picture.</p>"))
    const control = await box(p, '[role=toolbar] button[aria-label="Picture"]')
    expect(control.w === (phone ? 44 : 32) && control.h === (phone ? 44 : 32), `the Picture control is ${phone ? 44 : 32}px square`, control)
    await p.click(field)
    await p.keyboard.press("End")
    const [chooser] = await Promise.all([p.waitForFileChooser({ timeout: 3000 }), tool(p, "Picture")])
    expect(!!chooser && !chooser.isMultiple(), "it opens the file picker from the tap, one photo at a time")
    await chooser.accept([photoPath])
    await sleep(200)
    const during = await p.evaluate(() => {
      const img = document.querySelector("[role=textbox] img[data-uploading]")
      return img ? { opacity: getComputedStyle(img).opacity, scheme: img.getAttribute("src").split(":")[0] } : null
    })
    expect(!!during && during.opacity === "0.55" && during.scheme === "blob", "the photo shows at once, dimmed, from the file itself", during)
    expect(/Uploading the picture/.test(await status(p)), "and the field says it is uploading", await status(p))
    expect(!/<img/.test(await value(p)), "nothing of it is saved while it uploads", await value(p))
    await sleep(1100)
    const v = await value(p)
    expect(new RegExp(`^<p>Before the picture\\.</p><p><img src="${esc(OWN)}" alt="" width="1600" height="900" loading="lazy">(<br>)?</p>$`).test(v),
      "then it is saved with its storage address and its size, in a paragraph of its own", v)
    const shown = await p.$eval("[role=textbox] img", (img) => {
      const r = img.getBoundingClientRect()
      const box = img.closest("[role=textbox]")
      const pad = parseFloat(getComputedStyle(box).paddingLeft) + parseFloat(getComputedStyle(box).paddingRight)
      return { w: Math.round(r.width), h: Math.round(r.height), room: Math.round(box.clientWidth - pad), radius: getComputedStyle(img).borderTopLeftRadius, loaded: img.complete && img.naturalWidth === 1600 }
    })
    expect(shown.loaded && shown.w <= shown.room && Math.abs(shown.w / shown.h - 16 / 9) < 0.02 && shown.radius === "10px",
      "it fills the width of the text at most, keeps its shape, and has the page's rounded corners", shown)
    expect((await sideways(p)) <= 0, "the page does not scroll sideways", await sideways(p))
    /* Picked the moment it lands: a frame with four handles, and the picture's bar over it. */
    const picked = await p.evaluate(() => {
      const img = document.querySelector("[role=textbox] img").getBoundingClientRect()
      const frame = document.querySelector("[data-picture-frame]")?.getBoundingClientRect()
      const bar = document.querySelector("[data-picture-bar]")?.getBoundingClientRect()
      return {
        frame: frame ? Math.abs(frame.left - img.left) + Math.abs(frame.top - img.top) + Math.abs(frame.width - img.width) : null,
        handles: document.querySelectorAll("[data-picture-handle]").length,
        bar: bar ? { w: Math.round(bar.width), h: Math.round(bar.height) } : null,
        tools: [...document.querySelectorAll("[data-picture-bar] button")].map((b) => b.getAttribute("aria-label")),
      }
    })
    expect(picked.frame !== null && picked.frame <= 3 && picked.handles === 4 && !!picked.bar, "the new picture is picked: a frame on it with four corner handles, and its bar", picked)
    expect(picked.tools.length === 9 && picked.tools[0].startsWith("Position") && ["Small, a third of the width", "Medium, half the width", "Large, three quarters of the width", "Full width", "Shape", "Alt text", "Remove picture", "More"].every((t) => picked.tools.includes(t)),
      "the bar places it, sizes it, shapes it, describes it and removes it, and keeps moving it in a menu", picked.tools)
    const barButtons = await p.$$eval("[data-picture-bar] button", (bs) => bs.map((b) => Math.round(b.getBoundingClientRect().height)))
    expect(barButtons.every((h) => h >= 28) && barButtons.filter((h) => h >= (phone ? 36 : 32)).length >= 5, `its buttons are ${phone ? 36 : 32}px tall, the sizes a little less inside their group`, barButtons)
    const row = await p.evaluate(() => {
      const bar = document.querySelector("[data-picture-bar]").getBoundingClientRect()
      const img = document.querySelector("[role=textbox] img").getBoundingClientRect()
      const field = document.querySelector("[role=textbox]").getBoundingClientRect()
      return { h: Math.round(bar.height), w: Math.round(bar.width), off: Math.round(bar.left + bar.width / 2 - (img.left + img.width / 2)), inside: bar.left >= field.left && bar.right <= field.right, above: bar.bottom <= img.top, overflow: document.querySelector("[data-picture-bar]").scrollWidth - document.querySelector("[data-picture-bar]").clientWidth }
    })
    expect(row.h <= (phone ? 46 : 42) && row.inside && row.overflow <= 0 && Math.abs(row.off) <= 2, "one short row, all of it showing, centred on the picture and inside the text", row)
    expect(!(await p.$("[data-picture-dock]")), "on a phone as well: nothing docked under the toolbar")

    /* Let go and picked again: it fades in where it will stay, never sliding in from a side. */
    const para = await box(p, "[role=textbox] p")
    await p.mouse.click(para.x + 8, para.y + 8)
    await sleep(350)
    expect(!(await p.$("[data-picture-bar]")), "a tap in the text lets the picture go, and its bar fades out")
    const frames = await p.evaluate(() => new Promise((done) => {
      document.querySelector("[role=textbox] img").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
      const out = []
      const tick = () => {
        const bar = document.querySelector("[data-picture-bar]")
        if (bar && getComputedStyle(bar.parentElement).visibility === "visible") {
          const r = bar.getBoundingClientRect()
          out.push({ cx: Math.round(r.left + r.width / 2), o: +(+getComputedStyle(bar).opacity).toFixed(2) })
        }
        if (out.length < 14) requestAnimationFrame(tick)
        else done(out)
      }
      requestAnimationFrame(tick)
    }))
    const xs = new Set(frames.map((f) => f.cx))
    expect(xs.size === 1 && frames[0].o < 1 && frames[frames.length - 1].o === 1, "picked again, the bar fades in on the spot: no frame of it anywhere else", frames.map((f) => `${f.cx}@${f.o}`).join(" "))

    const room = shown.room
    const measure = () => p.$eval("[role=textbox] img", (img) => { const r = img.getBoundingClientRect(); const box = img.closest("[role=textbox]").getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), left: Math.round(r.left - box.left), right: Math.round(box.right - r.right) } })

    /* Medium: half the width, centred. */
    await p.click('[data-picture-bar] button[aria-label="Medium, half the width"]')
    await sleep(120)
    let m = await measure()
    expect(Math.abs(m.w - room / 2) <= 2 && Math.abs(m.left - m.right) <= 2, "Medium makes it half the width, centred", { ...m, room })
    expect(/<img [^>]*style="width: 50%" data-align="center"/.test(await value(p)), "and that is what is saved", await value(p))

    /* A corner handle, dragged: wider, from both sides while it is centred. */
    const h = await box(p, '[data-picture-handle="br"]')
    await p.mouse.move(h.x + h.w / 2, h.y + h.h / 2)
    await p.mouse.down()
    const dx = Math.round(room * 0.1)
    for (let i = 1; i <= 6; i++) { await p.mouse.move(h.x + h.w / 2 + (dx * i) / 6, h.y + h.h / 2 + i); await sleep(16) }
    await p.mouse.up()
    await sleep(150)
    m = await measure()
    const dragged = /style="width: (\d+)%"/.exec(await value(p))?.[1]
    expect(dragged && Number(dragged) >= 66 && Number(dragged) <= 74 && Math.abs(m.w - room * Number(dragged) / 100) <= 3, "dragging a corner resizes it, saved as its share of the width", { dragged, w: m.w, room })

    /* A shape: square. */
    await p.click('[data-picture-bar] button[aria-label="Shape"]')
    await sleep(220)
    const shapes = await p.evaluate(() => {
      const menu = document.querySelector("[role=menu][aria-label=Shape]")
      const r = menu.getBoundingClientRect()
      const field = document.querySelector("[role=textbox]").getBoundingClientRect()
      return { labels: [...menu.querySelectorAll("[role=menuitemradio]")].map((b) => b.textContent.trim()), w: Math.round(r.width), inside: r.left >= field.left && r.right <= field.right, o: getComputedStyle(menu).opacity }
    })
    expect(shapes.labels.join(",") === "Original,16:9,4:3,1:1,3:4" && shapes.w <= 180 && shapes.inside && shapes.o === "1", "the shapes open as a short list with short names, inside the text", shapes)
    await p.evaluate(() => [...document.querySelectorAll("[role=menuitemradio]")].find((b) => b.textContent.startsWith("1:1")).click())
    await sleep(120)
    m = await measure()
    expect(Math.abs(m.w - m.h) <= 2 && /aspect-ratio: 1 \/ 1; object-fit: cover/.test(await value(p)), "a shape cuts it to that ratio, and is saved", { ...m })

    /* Right, then up above the words. */
    const position = await p.$eval("[data-picture-bar] button[data-picture-position]", (b) => b.getAttribute("data-picture-position"))
    expect(position === "center", "the position button says where it is: centred, after Medium", position)
    await p.click("[data-picture-bar] button[data-picture-position]")
    await sleep(120)
    m = await measure()
    expect(m.right <= 16 && m.left > m.right && /data-align="right"/.test(await value(p)), "a second tap moves it right, against the right edge of the text", m)
    await p.click('[data-picture-bar] button[aria-label="More"]')
    await sleep(220)
    await p.evaluate(() => [...document.querySelectorAll("[role=menu][aria-label=More] [role=menuitem]")].find((b) => b.textContent.trim() === "Move up").click())
    await sleep(150)
    expect(/^<p><img [^>]+><\/p><p>Before the picture\.<\/p>$/.test(await value(p)), "Move up, from the More menu, puts it before the paragraph above it", await value(p))
    expect((await sideways(p)) <= 0, "the page does not scroll sideways with the bar out", await sideways(p))
    await p.screenshot({ path: join(shots, `picture-controls-${label}.png`), fullPage: true })

    /* Its description. */
    await p.click('[data-picture-bar] button[aria-label="Alt text"]')
    await sleep(120)
    const altBox = await p.$eval("[aria-label='Picture description']", (el) => ({ fs: parseFloat(getComputedStyle(el).fontSize), h: Math.round(el.getBoundingClientRect().height) }))
    expect(altBox.fs >= (phone ? 16 : 14) && altBox.h >= (phone ? 44 : 36), "Alt opens its description field under the toolbar", altBox)
    await p.type("[aria-label='Picture description']", "A mug on a desk")
    await sleep(80)
    expect(/<img [^>]*alt="A mug on a desk"/.test(await value(p)), "the description is saved as its alt text", await value(p))
    await p.screenshot({ path: join(shots, `picture-${label}.png`), fullPage: true })
    await p.keyboard.press("Enter")
    await sleep(80)
    await p.click('[data-picture-bar] button[aria-label="Remove picture"]')
    await sleep(350)
    expect(!/<img/.test(await value(p)) && !(await p.$("[role=textbox] img")) && !(await p.$("[data-picture-bar]")), "Remove takes it out, and its bar with it", await value(p))

    /* An emoji, where the caret was. */
    await p.click(field)
    await p.keyboard.press("End")
    await tool(p, "Emoji")
    await sleep(phone ? 600 : 200)
    const panel = await p.evaluate(() => { const el = document.querySelector("[data-emoji-panel]"); if (!el) return null; const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), cells: el.querySelectorAll("button[aria-label]").length } })
    expect(!!panel && panel.cells > 60 && panel.w <= vp.width, `the Emoji control opens the picker ${phone ? "in a sheet" : "under it"}`, panel)
    await p.screenshot({ path: join(shots, `emoji-${label}.png`) })
    /* The groups further down are made as the list comes to them. */
    for (let k = 0; k < 12; k++) {
      await p.evaluate(() => { const l = document.querySelector("[data-emoji-panel] .overflow-y-auto"); l.scrollTop = l.scrollHeight })
      await sleep(80)
    }
    const all = await p.evaluate(() => ({ cells: document.querySelectorAll("[data-emoji-panel] [data-emoji]").length, lazy: [...document.querySelectorAll("[data-emoji-panel] [data-emoji-group]")].every((s) => getComputedStyle(s).contentVisibility === "auto") }))
    expect(all.cells >= 491 && all.lazy, "scrolled to the end, every group is there, each drawn only while on screen", all)
    await p.evaluate(() => { document.querySelector("[data-emoji-panel] .overflow-y-auto").scrollTop = 0 })
    await p.type("[aria-label='Search emoji']", "fire")
    await sleep(120)
    await p.evaluate(() => document.querySelector('[data-emoji-panel] button[aria-label="🔥"]').click())
    await sleep(phone ? 500 : 150)
    expect(/Before the picture\.\s?🔥<\/p>$/.test(await value(p)), "a search finds it and a pick goes in where the caret was", await value(p))
    expect(errors.length === 0, "nothing in the console", errors)
    await p.close()
  }

  console.log("\nA picture that does not upload, phone")
  {
    const { p, errors } = await open(viewports[0][1], "view=editor&upload=fail&uploadMs=300&value=" + encodeURIComponent("<p>Words</p>"))
    await p.click(field)
    const [chooser] = await Promise.all([p.waitForFileChooser({ timeout: 3000 }), tool(p, "Picture")])
    await chooser.accept([photoPath])
    await sleep(700)
    expect(!(await p.$("[role=textbox] img")) && !/<img/.test(await value(p)), "leaves no picture behind", await value(p))
    expect(/did not upload/.test(await status(p)), "and says what happened", await status(p))
    expect(errors.length === 0, "nothing in the console", errors)
    await p.close()
  }

  console.log("\nThe size limit, desktop")
  {
    const { p } = await open(viewports[1][1], "view=editor")
    await p.click(field)
    await p.evaluate(() => {
      const el = document.querySelector("[role=textbox][contenteditable=true]")
      const dt = new DataTransfer()
      dt.setData("text/plain", "word ".repeat(42000))
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }))
    })
    await sleep(200)
    expect(/over the 200 KB limit/.test(await status(p)), "a description over 200 KB says so under the text", await status(p))
    await p.close()
  }

  console.log("\nA picture on the page")
  for (const [label, vp] of viewports) {
    const { p, errors } = await open(vp, "view=render&value=" + encodeURIComponent(`<p>Look.</p><p><img src="${OWN}" alt="A mug" width="1600" height="900"></p><p><img src="https://evil.example.com/pixel.png"></p>`))
    await sleep(200)
    const drawn = await p.$$eval("[data-rendered] img", (imgs) => imgs.map((img) => { const r = img.getBoundingClientRect(); return { src: img.getAttribute("src"), lazy: img.getAttribute("loading"), w: Math.round(r.width), h: Math.round(r.height), room: Math.round(img.closest("[data-rendered]").clientWidth - 32), radius: getComputedStyle(img).borderTopLeftRadius } }))
    expect(drawn.length === 1 && drawn[0].src === OWN && drawn[0].lazy === "lazy", `${label}: our picture is drawn, lazily, and the other site's is not`, drawn.map((d) => d.src))
    expect(drawn[0] && drawn[0].w === drawn[0].room && Math.abs(drawn[0].w / drawn[0].h - 16 / 9) < 0.02 && drawn[0].radius === "10px", `${label}: the width of the text, its own shape, rounded`, drawn[0])
    expect((await sideways(p)) <= 0 && errors.length === 0, `${label}: no sideways scroll, nothing in the console`, { sideways: await sideways(p), errors })
    await p.screenshot({ path: join(shots, `render-picture-${label}.png`), fullPage: true })
    await p.close()
  }

  console.log("\nThe link form, phone")
  {
    const { p } = await open(viewports[0][1], "view=editor&value=" + encodeURIComponent("<p>Words</p>"))
    await p.click(field)
    await tool(p, "Link")
    await sleep(120)
    const inputs = await p.$$eval(".rich-text-field [role=group][aria-label=Link] input", (xs) => xs.map((x) => ({ l: x.getAttribute("aria-label"), fs: parseFloat(getComputedStyle(x).fontSize), h: Math.round(x.getBoundingClientRect().height) })))
    expect(inputs.length === 2 && inputs.every((i) => i.fs >= 16 && i.h >= 44), "with nothing selected it asks for the address and the words, 16px and 44px tall", inputs)
    const focused = await p.evaluate(() => document.activeElement?.getAttribute("aria-label"))
    expect(focused === "Link address", "and the address field has the focus", focused)
    await p.screenshot({ path: join(shots, "link-phone-open.png") })
    await p.type("[aria-label='Link address']", "hello@example.com")
    await p.type("[aria-label='Text to show']", "Email me")
    await p.keyboard.press("Enter")
    await sleep(120)
    expect(/<a href="mailto:hello@example\.com">Email me<\/a>/.test(await value(p)), "an email address becomes a mailto link with the words given", await value(p))
    await p.screenshot({ path: join(shots, "link-phone.png") })
    await p.close()
  }

  console.log("\nThe resize bar, phone")
  {
    const { p, errors } = await open(viewports[0][1], "view=editor&resizable=1&value=" + encodeURIComponent("<p>Words</p>"))
    await p.evaluate(() => window.scrollTo(0, 0))
    const bar = await p.evaluate(() => {
      const h = document.querySelector("[data-rich-text-resize]")
      const r = h.getBoundingClientRect()
      const above = -parseFloat(getComputedStyle(h, "::before").top)
      const pill = h.querySelector("span").getBoundingClientRect()
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top - above + 2)
      return { h: Math.round(r.height), reach: Math.round(r.height + above), pill: { w: Math.round(pill.width), h: Math.round(pill.height) }, hitTop: hit === h, touch: getComputedStyle(h).touchAction }
    })
    expect(bar.reach >= 32 && bar.hitTop && bar.pill.h <= 4 && bar.touch === "none", "a small pill with a 32px or taller target, taken right to its top edge", bar)
    const cdp = await p.target().createCDPSession()
    const finger = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] })
    const h0 = await box(p, field)
    const hb = await box(p, "[data-rich-text-resize]")
    const x = hb.x + hb.w / 2
    const y = hb.y + hb.h / 2
    const pillColour = () => p.$eval("[data-rich-text-resize] span", (s) => getComputedStyle(s).backgroundColor)
    const restColour = await pillColour()
    await finger("touchStart", x, y)
    await finger("touchMove", x, y + 2)
    await sleep(40)
    const first = await box(p, field)
    for (let i = 1; i <= 8; i++) { await finger("touchMove", x, y + 2 + i * 15); await sleep(20) }
    await sleep(200)
    const held = { dragging: await p.$eval("[data-rich-text-resize]", (h) => h.hasAttribute("data-dragging")), colour: await pillColour() }
    await finger("touchEnd")
    await sleep(150)
    const h1 = await box(p, field)
    const scrolled = await p.evaluate(() => window.scrollY)
    expect(Math.abs(first.h - h0.h) <= 3, "no jump when the drag starts: two pixels of finger, two pixels of field", { before: h0.h, first: first.h })
    expect(Math.abs(h1.h - h0.h - 122) <= 4 && scrolled === 0, "a finger drags it 122px taller, one to one, and the page does not scroll", { before: h0.h, after: h1.h, scrolled })
    expect(held.dragging && held.colour !== restColour, "the pill darkens while it is held", { rest: restColour, held: held.colour })
    expect(!(await p.$("[data-rich-text-resize][data-dragging]")), "and goes back when it is let go")
    const hb2 = await box(p, "[data-rich-text-resize]")
    await finger("touchStart", x, hb2.y + hb2.h / 2)
    for (let i = 1; i <= 10; i++) { await finger("touchMove", x, hb2.y + hb2.h / 2 + i * 200); await sleep(16) }
    await finger("touchEnd")
    await sleep(150)
    const h2 = await box(p, field)
    expect(h2.h <= Math.round(844 * 0.7) + 1 && h2.h >= Math.round(844 * 0.7) - 1, "and stops at 70% of the screen", h2.h)
    await cdp.detach()
    await p.screenshot({ path: join(shots, "resize-phone.png") })
    expect(errors.length === 0, "nothing in the console", errors)
    await p.close()
  }

  console.log("\nThe Emails body, phone")
  {
    const { p, errors } = await open(viewports[0][1], "view=email&value=" + encodeURIComponent("<p>Hi {{first_name}},</p>"))
    const labels = await p.$$eval("[role=toolbar] button", (bs) => bs.map((b) => b.getAttribute("aria-label") || b.textContent.trim()))
    expect(labels.join(",") === "Heading,Bold,Italic,Bulleted list,Link,Button,First name", "its own short toolbar, plus Button and First name", labels)
    const sizes = await p.$$eval("[role=toolbar] button", (bs) => bs.map((b) => Math.round(b.getBoundingClientRect().height)))
    expect(sizes.every((h) => h === 44), "all 44px tall", sizes)
    await p.click(field)
    await p.keyboard.press("End")
    await p.keyboard.type(" thanks")
    await p.click("[role=toolbar] button[aria-label=Button]")
    await sleep(100)
    await p.type("[aria-label='Button link']", "example.com/start")
    await p.keyboard.press("Enter")
    await sleep(120)
    const v = await value(p)
    expect(/^<p>Hi \{\{first_name\}\}, thanks<\/p><p><a href="https:\/\/example\.com\/start" style="display: ?inline-block;[^"]*background-color: ?(#1a1a2e|rgb\(26, 26, 46\))/.test(v), "the email keeps its token, and the button goes in on its own line after the caret, with its inline styles", v)
    expect((await sideways(p)) <= 0 && errors.length === 0, "no sideways scroll, nothing in the console", { sideways: await sideways(p), errors })
    await p.screenshot({ path: join(shots, "email-phone.png") })
    await p.close()
  }

  console.log("\nA description the old editor saved, drawn for a visitor")
  for (const [label, vp] of viewports) {
    const { p, errors } = await open(vp, "view=render")
    const drawn = await p.$eval("[data-rendered]", (el) => ({
      handlers: [...el.querySelectorAll("*")].flatMap((n) => [...n.attributes].map((a) => a.name)).filter((n) => /^on/.test(n)),
      buttons: el.querySelectorAll("button, svg, script").length,
      h1: !!el.querySelector("h1"),
      frame: (() => { const f = el.querySelector("[data-embed-type=youtube]"); if (!f) return null; const r = f.getBoundingClientRect(); return +(r.width / r.height).toFixed(3) })(),
      buttonColour: el.querySelector("a[style*=background]") ? getComputedStyle(el.querySelector("a[style*=background]")).backgroundColor : null,
      prose: el.firstElementChild?.className ?? "",
    }))
    await p.$$eval("[data-rendered] *", (els) => els.forEach((e) => e.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }))))
    const ran = await p.evaluate(() => window.__ran ?? 0)
    expect(drawn.handlers.length === 0 && drawn.buttons === 0 && ran === 0, `${label}: no handlers, no delete buttons, no scripts, and nothing ran`, { handlers: drawn.handlers, buttons: drawn.buttons, ran })
    expect(drawn.h1 && drawn.frame === 1.778 && drawn.buttonColour === "rgb(22, 163, 74)", `${label}: its heading, its 16:9 video and its green button are still there`, drawn)
    expect(/storelib-prose/.test(drawn.prose), `${label}: in the same prose styles as the editor`, drawn.prose)
    expect((await sideways(p)) <= 0 && errors.length === 0, `${label}: no sideways scroll, nothing in the console`, { sideways: await sideways(p), errors })
    await p.screenshot({ path: join(shots, `render-${label}.png`), fullPage: true })
    await p.close()
  }

  console.log("\nThe server's markup, hydrated")
  {
    const { p, errors } = await open(viewports[1][1], "view=hydrate")
    await sleep(300)
    const hydrationErrors = await p.evaluate(() => window.__errors)
    expect(hydrationErrors.length === 0 && errors.length === 0, "the field and the renderer hydrate with no mismatch and nothing in the console", { hydrationErrors, errors })
    const filled = await p.$eval(field, (el) => el.innerHTML.length)
    expect(filled > 100, "the field arrives filled from the server's markup", filled)
    await p.close()
  }

  console.log(`\nScreenshots: ${shots}`)
} finally {
  await browser?.close()
  server?.close()
  rmSync(dir, { recursive: true, force: true })
}
console.log(broken ? `\n${broken} failed` : "\nall passed")
process.exit(broken ? 1 : 0)
