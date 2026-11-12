/**
 * ===========================================================================
 *  ROUND 3, MEASURED: THE NAME'S AND BIO'S WEIGHTS, THE TIPS BLOCK'S STYLES
 *  AND LAYOUT SETTINGS, AND AN IMAGE BLOCK'S WORDS ON A FADE
 * ===========================================================================
 * Headless Chromium, with the real Google Fonts (through the session's proxy
 * when there is one), the live page's own component, the editor's preview
 * built from the draft, and the real editor:
 *
 *   BEFORE    Inter from the stylesheet the page asked for before this round
 *             (400 to 700): Heavy (800) drew the 700 face, the same ink
 *   WEIGHTS   every family the Design tab offers, every weight option of the
 *             name and the bio: the computed weight is the nearest weight the
 *             face has, a face of exactly that weight is loaded (no fallback,
 *             no faux bold), and each option on offer draws more ink than
 *             the one before it (canvas pixels) and is no narrower
 *   HEADER    on the live page and in the preview, Inter, Lato and Bebas
 *             Neue: the name at Regular, Medium, Bold and Heavy and the bio
 *             at Regular, Medium and Bold, computed weight and width
 *   TIPS      each of the four styles, then every Layout setting (alignment,
 *             title colour, size and weight, description, its colour and
 *             size, background, corners, shadow, padding) and the Settings
 *             switches (Other, a note) on each style: the part the setting is
 *             about changes, the same on the live page and in the preview
 *   IMAGE     plain and on a fade, for one picture, a 2 and 3 column grid and
 *             a carousel at 1 and 1.5 in view: the fade drawn, its words
 *             reading at 4.5:1 on its ground, smaller where the picture is
 *   EDITOR    the real editor at 1440: the tips block's Layout shows the
 *             four styles and each one changes the preview; the image block's
 *             Text: On the picture puts the fade in the preview; the Design
 *             tab's Heavy turns the preview's name to 800
 *   SHOTS     the header, the four tip styles and the faded pictures at 390
 *             and 1440 under several themes, to SHOTS (default
 *             /tmp/op-design-r3-shots) for the visual review
 *
 *   node scripts/check-onepage-design-r3.mjs        REPORT=1 prints without failing
 */
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

process.env.PROBE_CSS ??= "source"
const CHROMIUM = process.env.CHROMIUM ?? ["/opt/pw-browsers/chromium", "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome"].find((p) => existsSync(p))
const SHOTS = process.env.SHOTS || "/tmp/op-design-r3-shots"
const REPORT = !!process.env.REPORT
mkdirSync(SHOTS, { recursive: true })
const fail = (m) => {
  console.error(`\n${m}\n`)
  process.exit(1)
}
if (!CHROMIUM) fail("No Chromium found.")
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const failures = []
const check = (ok, message, detail) => {
  if (!ok) failures.push(message)
  console.log(`${ok ? "ok  " : "FAIL"} ${message}${!ok && detail !== undefined ? `  ${JSON.stringify(detail).slice(0, 400)}` : ""}`)
}

/* The fonts come from Google: through the session's proxy, trusting its certificate, when there is one. */
function reachabilityFlags() {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy
  if (!proxy) return []
  const flags = [`--proxy-server=${proxy}`]
  for (const ca of ["/root/.ccr/agent-proxy-ca.crt", "/root/.ccr/ca-bundle.crt"]) {
    if (!existsSync(ca)) continue
    try {
      const pem = execFileSync("openssl", ["x509", "-in", ca, "-pubkey", "-noout"], { encoding: "buffer" })
      const spki = createHash("sha256").update(execFileSync("openssl", ["pkey", "-pubin", "-outform", "der"], { input: pem })).digest("base64")
      flags.push(`--ignore-certificate-errors-spki-list=${spki}`)
      break
    } catch {
      /* the run says so below when the fonts do not arrive */
    }
  }
  return flags
}

const harness = await serveEditorProbe({ entry: "scripts/render-onepage-design-r3.tsx", fail })
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none", ...reachabilityFlags()], protocolTimeout: 120000 })
const CALM = "*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;transition-delay:0s!important}"

async function open(base, path, width, height = 1000) {
  const page = await browser.newPage()
  const errors = []
  page.on("pageerror", (e) => errors.push(e.message))
  await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: width < 800, hasTouch: width < 800 })
  await page.goto(`${base}${path}`, { waitUntil: "load" })
  await page.addStyleTag({ content: CALM })
  return { page, errors }
}
const settle = (page) => page.evaluate(() => document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))))

/* The ink a face draws: dark pixels of "Satori Studio" at 48px on a canvas, in exactly that face. */
const INK = `(family, weight) => {
  const c = document.createElement("canvas"); c.width = 700; c.height = 80
  const x = c.getContext("2d"); x.font = weight + " 48px \\"" + family + "\\", monospace"; x.fillStyle = "#000"; x.textBaseline = "top"; x.fillText("Satori Studio", 4, 10)
  const d = x.getImageData(0, 0, c.width, c.height).data; let n = 0
  for (let i = 3; i < d.length; i += 4) if (d[i] > 127) n++
  return n
}`
/* Whether a face of this family at exactly this weight has loaded. */
const LOADED = `(family, weight) => [...document.fonts].some((f) => f.family.replace(/["']/g, "") === family && f.status === "loaded" && String(f.weight).split(" ").map(Number).some((w, i, a) => a.length === 2 ? weight >= a[0] && weight <= a[1] : w === weight))`

/* ── BEFORE ────────────────────────────────────────────────────────────── */
{
  console.log("\nBEFORE: Inter as the page asked for it before this round (400 to 700)")
  const { page } = await open(harness.base, "/app/onepage?before", 900)
  await page.evaluate(() => Promise.all([...document.querySelectorAll("[data-before]")].map(() => document.fonts.load("700 40px Inter"))))
  await settle(page)
  const before = await page.evaluate(`(() => { const ink = ${INK}; const loaded = ${LOADED}; return { ink700: ink("Inter", 700), ink800: ink("Inter", 800), face800: loaded("Inter", 800), w700: document.querySelector("[data-before='700'] span").getBoundingClientRect().width, w800: document.querySelector("[data-before='800'] span").getBoundingClientRect().width } })()`)
  console.log(`     ${JSON.stringify(before)}`)
  check(!before.face800 && before.ink700 === before.ink800 && Math.abs(before.w700 - before.w800) < 0.5, "before: no 800 face was loaded, so Heavy drew exactly Bold's letters (the bug)", before)
  /* A face with one weight asked for Bold: the browser thickens the 400 itself (faux bold). The name's h1 is font-bold, so a Bebas Neue name was drawn that way. */
  await page.evaluate(() => { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = "https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap"; document.head.appendChild(l); return new Promise((r) => (l.onload = r)) })
  await page.evaluate(() => document.fonts.load('400 40px "Bebas Neue"'))
  const faux = await page.evaluate(`(() => { const ink = ${INK}; return { ink400: ink("Bebas Neue", 400), ink700: ink("Bebas Neue", 700) } })()`)
  console.log(`     Bebas Neue ${JSON.stringify(faux)}`)
  check(faux.ink700 > faux.ink400 * 1.05, "before: Bebas Neue (one weight) asked for 700 is smeared thicker by the browser, the faux bold a name drew", faux)
  await page.close()
}

/* ── WEIGHTS ───────────────────────────────────────────────────────────── */
const weightRows = []
{
  console.log("\nWEIGHTS: every family, every option of the name and the bio")
  const { page, errors } = await open(harness.base, "/app/onepage?weights", 1400, 1200)
  /* Every face the rows draw, asked for and awaited (a link's faces load when text in them is laid out). */
  await page.evaluate(async () => {
    const rows = [...document.querySelectorAll("[data-w-family]")]
    for (let i = 0; i < 40; i++) {
      await document.fonts.ready
      const pending = rows.filter((r) => !document.fonts.check(`${getComputedStyle(r).fontWeight} 40px "${r.dataset.wFamily}"`))
      if (!pending.length) break
      await Promise.all(pending.map((r) => document.fonts.load(`${getComputedStyle(r).fontWeight} 40px "${r.dataset.wFamily}"`, "Satori Studio, posters")))
      await new Promise((r) => setTimeout(r, 250))
    }
  })
  await settle(page)
  const rows = await page.evaluate(`(() => {
    const ink = ${INK}; const loaded = ${LOADED}
    return [...document.querySelectorAll("[data-w-family]")].map((el) => {
      const cs = getComputedStyle(el); const w = Number(cs.fontWeight); const family = el.dataset.wFamily
      return { family, which: el.dataset.wWhich, option: Number(el.dataset.wOption), expected: Number(el.dataset.wExpected), computed: w, synthesis: cs.fontSynthesisWeight, loaded: loaded(family, w), width: Math.round(el.firstElementChild.getBoundingClientRect().width * 10) / 10, ink: ink(family, w) }
    })
  })()`)
  const families = await page.evaluate(() => window.__families)
  check(errors.length === 0, "no errors drawing the weights", errors.slice(0, 2))
  check(rows.every((r) => r.computed === r.expected), "every option's computed weight is the nearest weight its face has", rows.filter((r) => r.computed !== r.expected).slice(0, 4))
  check(rows.every((r) => r.loaded), "a face of exactly that weight is loaded for every option (no fallback face, nothing synthesised)", [...new Set(rows.filter((r) => !r.loaded).map((r) => `${r.family} ${r.computed}`))].slice(0, 10))
  check(rows.filter((r) => r.computed !== (r.which === "title" ? 700 : 400)).every((r) => r.synthesis === "none"), "a weight the page writes has synthesis off", rows.filter((r) => r.computed !== (r.which === "title" ? 700 : 400) && r.synthesis !== "none").slice(0, 3))
  const bad = []
  for (const f of families) {
    for (const which of ["title", "bio"]) {
      const opts = f[which].map((o) => rows.find((r) => r.family === f.family && r.which === which && r.option === o))
      for (let i = 1; i < opts.length; i++) {
        const [a, b] = [opts[i - 1], opts[i]]
        if (!(b.ink > a.ink && b.width >= a.width - 0.5)) bad.push(`${f.family} ${which} ${a.computed}->${b.computed}: ink ${a.ink}->${b.ink}, width ${a.width}->${b.width}`)
      }
      weightRows.push({ family: f.family, which, options: opts.map((o) => `${o.option}=>${o.computed} ink ${o.ink} w ${o.width}`) })
    }
  }
  check(bad.length === 0, "each option on offer draws more ink than the one before it, and is no narrower", bad.slice(0, 8))
  const heavy = rows.filter((r) => r.which === "title" && r.option === 800)
  const bold = rows.filter((r) => r.which === "title" && r.option === 700)
  const heavier = heavy.filter((h) => h.computed > bold.find((b) => b.family === h.family).computed)
  console.log(`     Heavy is heavier than Bold for ${heavier.length} of ${heavy.length} families; the rest have no weight above Bold (${heavy.filter((h) => !heavier.includes(h)).map((h) => h.family).join(", ")})`)
  for (const name of ["Inter", "Lato", "Playfair Display", "Source Serif Pro", "Crimson Text", "Bebas Neue", "JetBrains Mono"]) {
    for (const r of weightRows.filter((w) => w.family === name)) console.log(`     ${name.padEnd(17)} ${r.which.padEnd(5)} ${r.options.join(" | ")}`)
  }
  await page.close()
}

/* ── The page: header, tips, image ─────────────────────────────────────── */
const IMG = (hue, w = 1200, h = 900) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},60%,72%)"/><stop offset="1" stop-color="hsl(${hue + 40},55%,30%)"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/><circle cx="${w * 0.65}" cy="${h * 0.38}" r="${h * 0.22}" fill="hsl(${hue + 180},70%,85%)"/><rect y="${h * 0.7}" width="${w}" height="${h * 0.3}" fill="hsl(${hue + 20},30%,18%)"/></svg>`)}`
const header = { id: "header", type: "header", enabled: true, sort_order: 0, data: { show_avatar: true, show_name: true, show_bio: true } }
const tips = (extra = {}, presentation = null) => ({
  id: "tips",
  type: "app",
  enabled: true,
  sort_order: 1,
  data: { provider: "tips", title: "Buy me a coffee", subtitle: "Every tip goes into the next record.", tip_mode: "storelib", tip_amounts: [500, 1000, 2000], tip_custom: true, tip_ready: true, tip_currency: "usd", ...extra },
  ...(presentation ? { style: { presentation } } : {}),
})
const pics = [
  { id: "a", image_url: IMG(20), title: "Night market prints", caption: "Twelve colours on cotton rag, signed.", button_label: "Shop the set", link_url: "https://example.com/a", width: 1200, height: 900 },
  { id: "b", image_url: IMG(200), title: "Studio sale", caption: "Seconds and test prints, this weekend only.", button_label: "See what is left", link_url: "https://example.com/b", width: 1200, height: 900 },
  { id: "c", image_url: IMG(120), title: "Posters", caption: "A2 and A3.", button_label: "Browse", link_url: "https://example.com/c", width: 1200, height: 900 },
]
const image = (extra = {}) => ({ id: "image", type: "image", enabled: true, sort_order: 2, data: { image_url: pics[0].image_url, images: pics, aspect_ratio: "landscape", display_style: "single", border_radius: "lg", image_fit: "cover", clickable: true, image_style: "fade", ...extra } })

const THEMES = {
  light: { background_type: "solid", background_color: "#f6f4ef", text_color: "#1a1a2e", secondary_text_color: "#555566", button_style: "filled", button_color: "#1a1a2e", button_text_color: "#ffffff", button_border_radius: 12, font_family: "'Inter', sans-serif" },
  dark: { background_type: "solid", background_color: "#121216", text_color: "#f4efe9", secondary_text_color: "#b9b4ad", button_style: "filled", button_color: "#f4efe9", button_text_color: "#121216", button_border_radius: 999, font_family: "'DM Sans', sans-serif" },
  gradient: { background_type: "gradient", background_gradient: "linear-gradient(180deg, #ffd7c2 0%, #f39ac6 100%)", background_color: "#ffd7c2", text_color: "#3a1030", button_style: "soft", button_color: "#3a1030", button_text_color: "#3a1030", button_border_radius: 20, font_family: "'Poppins', sans-serif" },
  outline: { background_type: "solid", background_color: "#e9efe6", text_color: "#20321d", button_style: "outline", button_color: "#20321d", button_text_color: "#20321d", button_border_radius: 0, button_border_width: 2, font_family: "'Lora', serif", title_font: "'Bebas Neue', sans-serif" },
}

const live = await open(harness.base, "/app/onepage", 390, 1600)
const prev = await open(harness.base, "/app/onepage", 390, 1600)
await live.page.waitForFunction(() => typeof window.__r3Render === "function")
await prev.page.waitForFunction(() => typeof window.__r3Render === "function")
const draw = async (p, theme, blocks, preview) => {
  await p.bringToFront()
  await p.evaluate((t, b, pv) => window.__r3Render(t, b, pv), theme, blocks, preview)
  await settle(p)
  await sleep(60)
}
const both = async (theme, blocks, read) => {
  await draw(live.page, theme, blocks, false)
  const a = await live.page.evaluate(read)
  await draw(prev.page, theme, blocks, true)
  const b = await prev.page.evaluate(read)
  return [a, b]
}

/* ── HEADER ────────────────────────────────────────────────────────────── */
{
  console.log("\nHEADER: the name and the bio on the live page and in the preview")
  const READ = `(() => { const h = [...document.querySelectorAll("[data-op-header] h1, [data-hero-header] h1")].find((e) => e.getClientRects().length); const span = h && document.createRange(); if (span) span.selectNodeContents(h); const bio = [...document.querySelectorAll("[data-op-header] p, [data-hero-header] p")].find((e) => e.getClientRects().length && e.textContent.includes("Prints")); return { title: h ? Number(getComputedStyle(h).fontWeight) : null, titleW: span ? Math.round(span.getBoundingClientRect().width * 10) / 10 : null, bio: bio ? Number(getComputedStyle(bio).fontWeight) : null, family: h ? getComputedStyle(h).fontFamily.split(",")[0] : null } })()`
  const cases = [
    ["Inter", { font_family: "'Inter', sans-serif" }, { 400: 400, 500: 500, 700: 700, 800: 800 }, { 400: 400, 500: 500, 700: 700 }],
    ["Lato", { font_family: "'Lato', sans-serif" }, { 400: 400, 500: 400, 700: 700, 800: 900 }, { 400: 400, 500: 400, 700: 700 }],
    ["Bebas Neue title", { font_family: "'Inter', sans-serif", title_font: "'Bebas Neue', sans-serif" }, { 400: 400, 500: 400, 700: 400, 800: 400 }, { 400: 400, 500: 500, 700: 700 }],
  ]
  for (const [name, fonts, titleWant, bioWant] of cases) {
    const widths = {}
    for (const w of [400, 500, 700, 800]) {
      const theme = { ...THEMES.light, ...fonts, title_weight: w, bio_weight: w === 800 ? 700 : w }
      const [a, b] = await both(theme, [header], READ)
      widths[w] = a.titleW
      check(a.title === titleWant[w] && b.title === titleWant[w], `${name}: name at ${w} draws ${titleWant[w]} on the live page and in the preview`, { live: a, preview: b })
      if (w !== 800) check(a.bio === bioWant[w] && b.bio === bioWant[w], `${name}: bio at ${w} draws ${bioWant[w]} on both`, { live: a.bio, preview: b.bio })
      check(a.titleW === b.titleW, `${name}: the name at ${w} is the same width on both (${a.titleW}px)`, { live: a.titleW, preview: b.titleW })
    }
    console.log(`     ${name}: name width by option ${JSON.stringify(widths)}`)
  }
}

/* ── TIPS ──────────────────────────────────────────────────────────────── */
const TIP_READ = `(() => {
  const root = document.querySelector("[data-onepage-app=tips]")
  if (!root) return null
  const title = root.querySelector("[data-block-title]")
  const frame = root.closest("[data-block-presentation]")
  const card = root
  const cs = getComputedStyle(card)
  const ts = title ? getComputedStyle(title) : null
  const rr = root.getBoundingClientRect(), tr = title ? title.getBoundingClientRect() : null
  /* Where the title sits in the block: its middle against the block's, -1 left to 1 right. */
  const range = document.createRange(); if (title) range.selectNodeContents(title); const words = title ? range.getBoundingClientRect() : null
  const place = words ? Math.round(((words.left + words.width / 2) - (rr.left + rr.width / 2)) / (rr.width / 2) * 100) / 100 : null
  const desc = (frame || root.parentElement).querySelector("[data-block-subtitle]")
  const sub = root.querySelector("[data-tip-subtitle]")
  const surface = root.querySelector("[data-tip-open]") || (root.dataset.tipStyle === "pills" && !root.style.background ? root.querySelector("[data-tip-pills] .op-btn") : null) || card
  const ss = getComputedStyle(surface)
  return {
    style: root.dataset.tipStyle, place,
    titleColor: ts && ts.color, titleSize: ts && ts.fontSize, titleWeight: ts && ts.fontWeight,
    bg: ss.backgroundColor, radius: ss.borderTopLeftRadius, shadow: ss.boxShadow, pad: root.querySelector("[data-tip-open]") ? ss.paddingTop : cs.paddingTop, bgRoot: cs.backgroundColor,
    desc: desc ? { text: desc.textContent, color: getComputedStyle(desc).color, size: getComputedStyle(desc).fontSize } : null,
    subSize: sub ? getComputedStyle(sub).fontSize : null,
    other: !!root.querySelector("[data-tip-amount=other]"),
    amounts: root.querySelectorAll("[data-tip-amount]:not([data-tip-amount=other])").length,
    pills: root.querySelectorAll("[data-tip-pills] .op-btn").length,
    open: !!root.querySelector("[data-tip-open]"), value: root.querySelector("[data-tip-value]")?.dataset.tipValue ?? null,
    frameBg: frame ? getComputedStyle(frame).backgroundColor : null, framePad: frame ? getComputedStyle(frame).paddingTop : null,
    h: Math.round(rr.height),
  }
})()`
{
  console.log("\nTIPS: each style, and every Layout setting on each")
  const styles = ["card", "pills", "button", "amount"]
  const seen = {}
  for (const s of styles) {
    const [a, b] = await both(THEMES.light, [header, tips({ tip_style: s })], TIP_READ)
    seen[s] = a
    check(a?.style === s && b?.style === s, `${s}: drawn on the live page and in the preview`, { live: a?.style, preview: b?.style })
  }
  check(seen.card.amounts === 3 && seen.card.other && !seen.card.open, "card: three amounts and Other as choices", seen.card)
  check(seen.pills.pills === 4 && seen.pills.amounts === 3, "pills: one page button per amount, and Other", seen.pills)
  check(seen.button.open && seen.button.amounts === 0, "button: one button that opens the sheet", seen.button)
  check(seen.amount.value === "1000", "big amount: the middle amount, large", seen.amount)
  check(new Set(styles.map((s) => seen[s].h)).size === 4, "the four styles are four different blocks (heights)", styles.map((s) => seen[s].h))

  const SETTINGS = [
    ["Alignment left", { align: "left" }, (x, y) => y.place < x.place - 0.1 || (x.place <= -0.2 && y.place <= -0.2 && x.style === "card"), "place"],
    ["Alignment right", { align: "right" }, (x, y) => y.place > 0.2, "place"],
    ["Alignment center", { align: "center" }, (x, y) => Math.abs(y.place) < 0.15, "place"],
    /* The page's legibility guard may move the colour until it reads on the card; it must still change. */
    ["Title colour", { title_color: "#c2410c" }, (x, y) => y.titleColor !== x.titleColor, "titleColor"],
    ["Title size", { title_size: 24 }, (x, y) => y.titleSize === "24px", "titleSize"],
    ["Title weight", { title_weight: 400 }, (x, y) => y.titleWeight === "400" && x.titleWeight !== "400", "titleWeight"],
    ["Description", { subtitle: "Thank you for keeping the studio open." }, (x, y) => !x.desc && !!y.desc, "desc"],
    ["Description colour", { subtitle: "Thank you.", subtitle_color: "#0e7490" }, (x, y) => y.desc?.color === "rgb(14, 116, 144)", "desc"],
    ["Description size", { subtitle: "Thank you.", subtitle_size: 18 }, (x, y) => y.desc?.size === "18px" && y.subSize === "18px", "desc"],
    ["Background", { background: "#fde68a" }, (x, y) => y.bg === "rgb(253, 230, 138)" || y.bgRoot === "rgb(253, 230, 138)", "bg"],
    ["Corners", { radius: 2 }, (x, y) => y.radius === "2px" && x.radius !== "2px", "radius"],
    ["Shadow", { shadow: "lifted" }, (x, y) => y.shadow !== x.shadow && y.shadow !== "none", "shadow"],
    ["Padding", { padding: 30 }, (x, y) => y.pad !== x.pad, "pad"],
  ]
  for (const s of styles) {
    const [base] = await both(THEMES.light, [header, tips({ tip_style: s })], TIP_READ)
    for (const [name, pres, ok, key] of SETTINGS) {
      /* The pills sit on the page, not on a card: their padding, background and corners are those of the row's own panel and buttons. */
      const [a, b] = await both(THEMES.light, [header, tips({ tip_style: s }, pres)], TIP_READ)
      const changed = ok(base, a)
      check(changed && JSON.stringify(a) === JSON.stringify(b), `${s}: ${name} changes the block, the same in the preview`, { before: base[key], live: a[key], preview: b[key] })
    }
    /* Never a card inside a card: the block's own frame draws no panel round the tip card. */
    const [boxed] = await both(THEMES.light, [header, tips({ tip_style: s }, { background: "#fde68a", padding: 30 })], TIP_READ)
    check(boxed.frameBg === "rgba(0, 0, 0, 0)" && boxed.framePad === "0px", `${s}: a background lands on the tips block itself, with no panel round it`, { frameBg: boxed.frameBg, framePad: boxed.framePad })
    const [noOther] = await both(THEMES.light, [header, tips({ tip_style: s, tip_custom: false })], TIP_READ)
    if (s === "card" || s === "pills") check(!noOther.other && base.other, `${s}: "Let them choose the amount" off takes Other away`, { on: base.other, off: noOther.other })
  }

  /* Pay from each style: the amount sent, and with a note asked for, the sheet. */
  for (const s of styles) {
    /* A fresh page each: a sheet left open from the one before holds the page inert. */
    const { page: payPage } = await open(harness.base, "/app/onepage", 390, 1200)
    await payPage.waitForFunction(() => typeof window.__r3Render === "function")
    await draw(payPage, THEMES.light, [header, tips({ tip_style: s })], false)
    const sent = await payPage.evaluate(async (s) => {
      const root = document.querySelector("[data-onepage-app=tips]")
      const sheetOpen = () => !!document.querySelector("[data-tip-sheet]")
      if (s === "card") root.querySelector("[data-tip-amount='2000']").click()
      if (s === "amount") root.querySelector("[data-tip-plus]").click()
      await new Promise((r) => setTimeout(r, 120))
      const go = s === "pills" ? root.querySelector("[data-tip-amount='2000']") : s === "button" ? root.querySelector("[data-tip-open]") : root.querySelector("[data-tip-send]")
      const label = go.textContent
      go.click()
      await new Promise((r) => setTimeout(r, 300))
      return { label, sheet: sheetOpen(), value: document.querySelector("[data-tip-sheet] [data-tip-value]")?.dataset.tipValue ?? null }
    }, s)
    if (s === "button") check(sent.sheet && sent.value === "1000", "button: opens the amount sheet on the middle amount", sent)
    else if (s === "pills") check(/\$20/.test(sent.label), "pills: a tap on $20 tips $20", sent)
    else if (s === "card") check(/Tip \$20/.test(sent.label), "card: picking $20 makes the button Tip $20", sent)
    else check(/Tip \$11/.test(sent.label), "big amount: + moves $10 to $11 (a dollar a step under $20) and the button follows", sent)
    await payPage.close()
  }
}

/* ── IMAGE ─────────────────────────────────────────────────────────────── */
const IMG_READ = `(() => {
  const parse = (c) => { const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2]] }
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100 }
  const fades = [...document.querySelectorAll("[data-image-fade]")].filter((e) => e.getClientRects().length)
  return {
    fades: fades.length,
    plainCaptions: [...document.querySelectorAll("[data-op-block] p")].filter((p) => /Night market|Studio sale/.test(p.textContent)).length,
    items: fades.slice(0, 3).map((f) => {
      const ground = hex(f.dataset.fadeGround)
      const t = f.querySelector("[data-image-fade-title]"), c = f.querySelector("[data-image-fade-caption]"), b = f.querySelector("[data-image-fade-button]")
      const box = f.getBoundingClientRect()
      return {
        size: f.dataset.fadeSize, ground: f.dataset.fadeGround, w: Math.round(box.width),
        /* The words start where the fade has reached its full ground (the box's top padding is the fade). */
        solidUnder: t ? t.getBoundingClientRect().top - box.top >= parseFloat(getComputedStyle(f).paddingTop) - 0.5 : null,
        cover: Math.round((box.height / f.parentElement.getBoundingClientRect().height) * 100),
        title: t ? { px: getComputedStyle(t).fontSize, contrast: contrast(parse(getComputedStyle(t).color), ground), inside: t.getBoundingClientRect().bottom <= box.bottom + 0.5 } : null,
        caption: c ? { px: getComputedStyle(c).fontSize, contrast: contrast(parse(getComputedStyle(c).color), ground) } : null,
        button: b ? { text: b.textContent, h: Math.round(b.getBoundingClientRect().height) } : null,
        stops: (getComputedStyle(f).backgroundImage.match(/color-mix|color\\(|rgba?\\(/g) || []).length,
      }
    }),
  }
})()`
{
  console.log("\nIMAGE: words on a fade")
  const [plain] = await both(THEMES.light, [header, image({ image_style: undefined, show_captions: true })], IMG_READ)
  check(plain.fades === 0 && plain.plainCaptions === 1, "plain (every block saved before): the caption under the picture, no fade", plain)
  const cases = [
    ["one picture", { display_style: "single" }, "full", 1],
    ["grid of 2", { display_style: "grid", grid_columns: 2 }, "small", 3],
    ["grid of 3", { display_style: "grid", grid_columns: 3 }, "tiny", 3],
    ["carousel, 1 in view", { display_style: "carousel", carousel_view: "1", carousel_autoplay: false }, "full", 3],
    ["carousel, 1.5 in view", { display_style: "carousel", carousel_view: "1.5", carousel_autoplay: false }, "compact", 3],
  ]
  for (const [themeName, theme] of Object.entries(THEMES)) {
    for (const [name, extra, size, count] of cases) {
      const [a, b] = await both(theme, [header, image(extra)], IMG_READ)
      const first = a.items[0]
      check(a.fades === count && JSON.stringify(a) === JSON.stringify(b), `${themeName}, ${name}: ${count} faded picture(s), the same in the preview`, { live: a.fades, preview: b.fades })
      check(first?.size === size && first.title?.inside, `${themeName}, ${name}: words sized ${size}, inside the picture`, first)
      check(a.items.every((i) => i.title.contrast >= 4.5 && (!i.caption || i.caption.contrast >= 4.5)), `${themeName}, ${name}: title and caption read at 4.5:1 on the fade's ground (${first?.title?.contrast}${first?.caption ? `, ${first.caption.contrast}` : ""} on ${first?.ground})`, a.items)
      if (size === "full") check(!!first.button && first.button.h >= 34 && !!first.caption, `${themeName}, ${name}: caption and button shown`, first)
      if (size === "tiny" || size === "small") check(!first.button && !first.caption, `${themeName}, ${name}: a tile keeps only the title`, first)
      if (size === "compact") check(!!first.button && !first.caption, `${themeName}, ${name}: a slide beside others keeps the title and the button`, first)
      check(a.items.every((i) => i.cover <= 72), `${themeName}, ${name}: the words and their fade cover at most 72% of the picture (${a.items.map((i) => i.cover).join(", ")}%)`, a.items.map((i) => i.cover))
      check(first?.stops >= 8 && a.items.every((i) => i.solidUnder), `${themeName}, ${name}: a smooth fade (${first?.stops} stops) that is solid under the words; words and fade cover ${first?.cover}% of the picture`, first)
    }
  }
  const [noLink] = await both(THEMES.light, [header, image({ clickable: false })], IMG_READ)
  check(noLink.items[0] && !noLink.items[0].button, "a picture with no link draws no button", noLink.items[0])
}

/* ── SHOTS ─────────────────────────────────────────────────────────────── */
{
  console.log("\nSHOTS")
  for (const width of [390, 1440]) {
    const { page } = await open(harness.base, "/app/onepage", width, 1400)
    await page.waitForFunction(() => typeof window.__r3Render === "function")
    for (const [themeName, theme] of Object.entries(THEMES)) {
      const blocks = [
        header,
        ...["card", "pills", "button", "amount"].map((s, i) => ({ ...tips({ tip_style: s }), id: `tips_${s}`, sort_order: 1 + i })),
        { ...image({ display_style: "single" }), id: "img1", sort_order: 6 },
        { ...image({ display_style: "carousel", carousel_view: "1.5", carousel_autoplay: false }), id: "img2", sort_order: 7 },
        { ...image({ display_style: "grid", grid_columns: 2 }), id: "img3", sort_order: 8 },
      ]
      await draw(page, { ...theme, title_weight: 800 }, blocks, false)
      await sleep(250)
      const file = join(SHOTS, `design-r3-${themeName}-${width}.png`)
      await page.screenshot({ path: file, fullPage: true })
      console.log(`     ${file}`)
    }
    await page.close()
  }
}

/* ── EDITOR ────────────────────────────────────────────────────────────── */
{
  console.log("\nEDITOR at 1440: the real editor and its preview")
  const editor = await serveEditorProbe({ fail, theme: THEMES.light, blocks: [header, tips(), { ...image(), sort_order: 2, data: { ...image().data, image_style: undefined } }] })
  const { page, errors } = await open(editor.base, "/app/onepage#links", 1440, 1000)
  await page.waitForSelector("[data-onepage-loader]", { hidden: true }).catch(() => {})
  await page.waitForSelector('[data-block-open="tips"]', { visible: true, timeout: 20000 })
  const frame = async () => {
    for (let i = 0; i < 40; i++) {
      const f = page.frames().find((x) => x.url().includes("/onepage-preview"))
      if (f && (await f.evaluate(() => !!document.querySelector("[data-op-header]")).catch(() => false))) return f
      await sleep(250)
    }
    return null
  }
  const openLayout = async (id) => {
    await page.$eval(`[data-block-open="${id}"]`, (e) => e.scrollIntoView({ block: "center" }))
    await page.$eval(`[data-block-open="${id}"]`, (e) => e.focus())
    await page.keyboard.press("Enter")
    const card = `[data-block-id="${id}"] [data-block-tabs]`
    await page.waitForSelector(card, { visible: true, timeout: 8000 })
    /* A Radix tab turns on the press, not the click. */
    await page.$eval(`${card} [data-block-tab="layout"]`, (e) => {
      e.scrollIntoView({ block: "center" })
      e.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }))
      e.click()
    })
    await sleep(400)
  }
  let f = await frame()
  check(!!f, "the preview frame draws the page")
  await openLayout("tips")
  const choices = await page.$$eval("[data-tip-style-choice]", (els) => els.filter((e) => e.getClientRects().length).map((e) => e.dataset.tipStyleChoice))
  check(JSON.stringify(choices) === JSON.stringify(["card", "pills", "button", "amount"]), "the tips block's Layout shows its four styles (not a tip link's Classic, Card, Featured)", choices)
  for (const s of ["pills", "button", "amount", "card"]) {
    await page.$eval(`[data-tip-style-choice="${s}"]`, (e) => e.click())
    let drawn = null
    for (let i = 0; i < 20 && drawn !== s; i++) {
      await sleep(150)
      f = await frame()
      drawn = await f?.evaluate(() => document.querySelector("[data-onepage-app=tips]")?.dataset.tipStyle ?? null)
    }
    check(drawn === s, `editor: picking ${s} draws it in the preview`, drawn)
  }
  /* Alignment from the shared rows below the styles. */
  const aligned = await page.evaluate(() => {
    const seg = [...document.querySelectorAll("[role=radiogroup]")].find((g) => g.getClientRects().length && g.querySelector("[data-segment=right]"))
    seg?.querySelector("[data-segment=right]")?.click()
    return !!seg
  })
  await sleep(600)
  f = await frame()
  const align = await f?.evaluate(() => document.querySelector("[data-onepage-app=tips]")?.dataset.tipAlign ?? null)
  check(aligned && align === "right", "editor: Alignment Right reaches the tips card in the preview", { aligned, align })

  await openLayout("image")
  const faded = await page.evaluate(() => {
    const seg = [...document.querySelectorAll("[role=radiogroup]")].find((g) => g.getClientRects().length && g.querySelector("[data-segment=fade]"))
    seg?.querySelector("[data-segment=fade]")?.click()
    return !!seg
  })
  let fades = 0
  for (let i = 0; i < 20 && !fades; i++) {
    await sleep(150)
    f = await frame()
    fades = (await f?.evaluate(() => document.querySelectorAll("[data-image-fade]").length)) ?? 0
  }
  check(faded && fades > 0, "editor: Text, On the picture draws the fade in the preview", { faded, fades })
  await page.screenshot({ path: join(SHOTS, "design-r3-editor-image-1440.png") })

  await page.evaluate(() => { location.hash = "design" })
  await sleep(800)
  const heavy = await page.evaluate(() => {
    const rows = document.querySelector("[data-type-rows=title]")
    const seg = rows && [...rows.querySelectorAll("[role=radiogroup]")].find((g) => g.querySelector("[data-segment='800']"))
    seg?.querySelector("[data-segment='800']")?.scrollIntoView({ block: "center" })
    seg?.querySelector("[data-segment='800']")?.click()
    return !!seg
  })
  let weight = null
  for (let i = 0; i < 20 && weight !== "800"; i++) {
    await sleep(150)
    f = await frame()
    weight = await f?.evaluate(() => { const h = [...document.querySelectorAll("[data-op-header] h1")].find((e) => e.getClientRects().length); return h ? getComputedStyle(h).fontWeight : null })
  }
  check(heavy && weight === "800", "editor: Design, Title, Heavy draws the preview's name at 800", { heavy, weight })
  const bioOptions = await page.evaluate(() => [...(document.querySelector("[data-type-rows=bio]")?.querySelectorAll("[data-segment]") ?? [])].map((e) => e.textContent.trim()).filter((t) => /Regular|Medium|Bold|Semibold/.test(t)))
  check(JSON.stringify(bioOptions) === JSON.stringify(["Regular", "Medium", "Bold"]), "editor: the bio's weights are Regular, Medium and Bold", bioOptions)
  await page.screenshot({ path: join(SHOTS, "design-r3-editor-design-1440.png") })
  check(errors.length === 0, "editor: no errors", errors.slice(0, 3))
  await page.close()
  editor.server.close()
}

await browser.close()
harness.server.close()
console.log(`\n${failures.length ? `${failures.length} failed` : "all passed"}`)
if (failures.length && !REPORT) process.exit(1)
