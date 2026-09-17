/**
 * ===========================================================================
 *  THE EXPLORE PAGE, ON THE REAL SITE, AT BOTH WIDTHS
 * ===========================================================================
 * Four claims that only the deployed page can settle, because every one of
 * them is about how the header and the page behave TOGETHER and they are
 * different component trees:
 *
 *   THE HEADER IS SMALLER. Measured, not asserted: #platform-header-root's
 *   own height against the number it was before.
 *
 *   THERE IS NO CATEGORY STRIP. The All / Audio & Music / … row is gone.
 *
 *   THE SEARCH IS IN ONE PLACE AT A TIME. At rest the header has none and the
 *   page's hero field does; scrolled past it, the header has one and it is
 *   the only one on screen. This is the piece most likely to be wrong in a
 *   real page, because the header mounts before the hero exists.
 *
 *   PAGING RETURNS TO THE TOP OF THE LIST rather than leaving the visitor at
 *   the bottom of the page they have just read.
 *
 *   node scripts/check-explore-live.mjs
 */
import { execFileSync, spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const URL_UNDER_TEST = process.env.URL ?? "https://storelib.com/explore"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** The same pin the client-error gate uses; see its note. */
function reachabilityFlags() {
  const flags = []
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy
  if (!proxy) return flags
  flags.push(`--proxy-server=${proxy}`)
  for (const ca of ["/root/.ccr/agent-proxy-ca.crt", "/root/.ccr/ca-bundle.crt"]) {
    if (!existsSync(ca)) continue
    try {
      const pem = execFileSync("openssl", ["x509", "-in", ca, "-pubkey", "-noout"], { encoding: "buffer" })
      const spki = createHash("sha256").update(execFileSync("openssl", ["pkey", "-pubin", "-outform", "der"], { input: pem })).digest("base64")
      flags.push(`--ignore-certificate-errors-spki-list=${spki}`)
      break
    } catch { /* let the run fail loudly instead */ }
  }
  return flags
}

const READ = `(() => {
  const header = document.getElementById("platform-header-root")
  const hero = document.querySelector("[data-explore-search-anchor]")
  /*
    A SEARCH PINNED AT THE TOP OF THE SCREEN, which is the claim — not "a
    search inside a particular element". The first version of this counted
    only controls inside #platform-header-root and reported the phone as
    broken when the strip was merely a sibling of it. That was the wrong
    question twice over: it missed a working control, and it would have
    missed the real fault, which is a strip that shows up and then scrolls
    away.

    So: any search control whose box is in the top 160px of the viewport, and
    the hero's own field does not count.
  */
  const near = (el) => {
    const r = el.getBoundingClientRect()
    if (r.width < 40 || r.height < 20) return false
    if (hero && hero.contains(el)) return false
    return r.top >= -4 && r.top < 160
  }
  const headerFields = [...document.querySelectorAll("input")].filter((i) => /search/i.test(i.placeholder || "") && near(i))
  const headerTriggers = [...document.querySelectorAll("button")].filter((b) => /search/i.test(b.textContent || "") && near(b))
  const heroRect = hero ? hero.getBoundingClientRect() : null
  return {
    headerHeight: header ? Math.round(header.getBoundingClientRect().height) : null,
    headerSearches: headerFields.length + headerTriggers.length,
    heroSearchPresent: !!hero,
    heroTop: heroRect ? Math.round(heroRect.top) : null,
    /* The strip that was removed, by the labels it carried. */
    categoryStrip: [...document.querySelectorAll("button")]
      .filter((b) => ["Audio & Music", "Business & Money", "Freebies"].includes((b.textContent || "").trim())).length,
    heading: (document.querySelector("h1") || {}).textContent || null,
    y: Math.round(window.scrollY),
  }
})()`

async function main(width) {
  const profile = mkdtempSync(join(tmpdir(), "storelib-explore-live-"))
  const chrome = spawn(CHROMIUM, [
    "--headless=new", "--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage",
    `--user-data-dir=${profile}`, "--remote-debugging-port=0", "--remote-allow-origins=*",
    `--window-size=${width},900`, ...reachabilityFlags(), "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] })
  const reap = () => { try { chrome.kill("SIGKILL") } catch {} }
  for (const sig of ["exit", "SIGINT", "SIGTERM"]) process.on(sig, reap)

  const portFile = join(profile, "DevToolsActivePort")
  let port = null
  for (let i = 0; i < 80 && !port; i++) {
    if (existsSync(portFile)) {
      const first = readFileSync(portFile, "utf8").split("\n")[0].trim()
      if (first) port = Number(first)
    }
    if (!port) await sleep(250)
  }
  if (!port) { reap(); fail("Chromium never reported a debugging port.") }
  let version = null
  for (let i = 0; i < 40 && !version; i++) {
    try { version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json() } catch { await sleep(250) }
  }
  if (!version) { reap(); fail("Chromium did not answer on its port.") }

  const ws = new WebSocket(version.webSocketDebuggerUrl)
  await new Promise((r, j) => { ws.addEventListener("open", r, { once: true }); ws.addEventListener("error", j, { once: true }) })
  let id = 0
  const pending = new Map()
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result ?? {}); pending.delete(m.id) }
  })
  let sessionId = null
  const send = (method, params = {}, session = sessionId) =>
    new Promise((resolve) => { const n = ++id; pending.set(n, resolve); ws.send(JSON.stringify({ id: n, method, params, ...(session ? { sessionId: session } : {}) })) })
  const ev = async (expr) => {
    const { result } = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })
    return result?.value
  }

  const { targetId } = await send("Target.createTarget", { url: "about:blank" }, null)
  sessionId = (await send("Target.attachToTarget", { targetId, flatten: true }, null)).sessionId
  await send("Page.enable")
  await send("Runtime.enable")
  await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 2, mobile: width < 700 })
  await send("Emulation.setTouchEmulationEnabled", { enabled: width < 700, maxTouchPoints: width < 700 ? 5 : 0 })
  await send("Page.navigate", { url: URL_UNDER_TEST })
  await sleep(11000)

  const r = { width }
  r.atRest = await ev(READ)

  /* Past the hero's field, which is what hands the search over. */
  await ev("window.scrollTo(0, 900); true")
  await sleep(1200)
  r.scrolled = await ev(READ)

  /* And back up, to be sure it hands it back. */
  await ev("window.scrollTo(0, 0); true")
  await sleep(1200)
  r.backAtTop = await ev(READ)

  /*
    ═══════════════════════════════════════════════════════════════════════
     THE PAGE MAY NOT MOVE UNDER THE FINGER WHILE IT IS BEING SCROLLED
    ═══════════════════════════════════════════════════════════════════════
    The search strip appears once the hero's field has gone. While it was
    `sticky` it was IN FLOW, so appearing added its height to the document and
    pushed everything below it down, and scrolling back up took it away again.
    Near the threshold that is a page that jumps under the finger.

    So: crawl across the threshold a few pixels at a time and watch two
    things — the document's height, and where a landmark well below the fold
    sits relative to the scroll position. Either one moving means the strip is
    still shifting the page.
  */
  r.shift = await ev(`(async () => {
    const mark = document.querySelector("[data-gallery-index], main section, main div")
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const readings = []
    for (let y = 300; y <= 900; y += 40) {
      window.scrollTo(0, y)
      await sleep(120)
      readings.push({
        y,
        docHeight: Math.round(document.documentElement.scrollHeight),
        /* The landmark's position in DOCUMENT space. Scrolling must not
           change it; only a reflow can. */
        markTop: mark ? Math.round(mark.getBoundingClientRect().top + window.scrollY) : null,
      })
    }
    return {
      heights: [...new Set(readings.map((x) => x.docHeight))],
      markTops: [...new Set(readings.map((x) => x.markTop))],
    }
  })()`)
  await ev("window.scrollTo(0, 0); true")
  await sleep(600)

  /*
    THE FOOTER MUST BE BELOW THE PAGE, not behind it.

    Reported as "the footer is intergalactic with the product listing": the
    footer's links and the product titles appeared interleaved on a phone.
    `main` carries `overflow-x: clip`, which leaves VERTICAL overflow visible,
    so anything inside it that grows past its box paints straight over the
    footer underneath. So this asks the page directly: does any element inside
    main have a rectangle that intersects the footer's.
  */
  /*
    ═══════════════════════════════════════════════════════════════════════
     THE SHAPE OF THE PAGE, as this round was asked for
    ═══════════════════════════════════════════════════════════════════════
    One card per row in Most popular on a phone, emoji on the category pills,
    and ONE board of categories rather than the two that were on the page.
  */
  r.layout = await ev(`(() => {
    const headings = [...document.querySelectorAll("h1, h2, h3")]
    const popular = headings.find((h) => /most popular/i.test(h.textContent || ""))
    let popularColumns = null
    if (popular) {
      const section = popular.closest("section") || popular.parentElement
      const grid = section && section.querySelector("[class*=grid]")
      if (grid) {
        const kids = [...grid.children].filter((c) => c.getBoundingClientRect().height > 40)
        const firstTop = kids.length ? Math.round(kids[0].getBoundingClientRect().top) : null
        popularColumns = kids.filter((c) => Math.abs(Math.round(c.getBoundingClientRect().top) - firstTop) < 12).length
      }
    }
    /* Pills sit in their own row under the search; count the ones wearing an emoji. */
    const pills = [...document.querySelectorAll("button")].filter((b) => {
      const t = (b.textContent || "").trim()
      return t.length > 0 && t.length < 24 && b.getBoundingClientRect().height < 56
    })
    /* Doubled, because this whole block is a template literal: a single
       backslash is eaten before the browser sees it, and /p{...}/u is a
       SyntaxError that threw this entire reading away without a word. */
    const withEmoji = pills.filter((b) => /\\p{Extended_Pictographic}/u.test(b.textContent || "")).length
    /*
      CENTRED IS A MEASUREMENT, not a class name. The row sits in a track
      that scrolls on a phone and wraps on a desktop, so the question is how
      much empty space it leaves at each end of that track.
    */
    let pillBox = null
    const row = document.querySelector("[data-category-pills-row]")
    if (row && row.parentElement) {
      const r = row.getBoundingClientRect()
      const track = row.parentElement.getBoundingClientRect()
      const left = Math.round(r.left - track.left)
      const right = Math.round(track.right - r.right)
      pillBox = {
        left,
        right,
        count: row.children.length,
        /* Either centred within a few pixels, or wider than its track and
           therefore scrolling, which has no centre to be off. */
        centred: Math.abs(left - right) <= 8 || r.width >= track.width - 2,
      }
    }
    return {
      popularColumns,
      pills: pillBox,
      pillsWithEmoji: withEmoji,
      /* Two headings that both announce categories is the duplicate board. */
      categoryHeadings: headings
        .filter((h) => /categor/i.test(h.textContent || ""))
        .map((h) => (h.textContent || "").trim().slice(0, 48)),
    }
  })()`)

  /*
    AND NO VIOLET HALO WHEN THE FIELD IS TAPPED. Reported as "when input
    focus on the search input make sure no purple glow thing", so this reads
    the computed shadow off the focused element rather than the class list.
  */
  r.focusGlow = await ev(`(() => {
    const anchor = document.querySelector("[data-explore-search-anchor]")
    const field = anchor && anchor.querySelector("input")
    if (!field) return null
    /* Read at rest first, so "focused" has something to be different from.
       A focus rule that changes nothing is dead CSS, and a check that only
       looks at the focused state cannot tell the two apart. */
    const restingCs = getComputedStyle(field)
    const resting = restingCs.boxShadow || "none"
    const restingBorder = restingCs.borderColor || ""
    field.focus()
    const focused = document.activeElement === field
    const cs = getComputedStyle(field)
    const shadow = cs.boxShadow || "none"
    const border = cs.borderColor || ""
    const ink = shadow + " " + border
    /* Violet in this palette is a red channel well under its blue one with
       both above zero: rgb(139,92,246), rgb(91,33,182), rgb(196,181,253). */
    const violet = [...ink.matchAll(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/g)].some((m) => {
      const [red, green, blue] = [Number(m[1]), Number(m[2]), Number(m[3])]
      return blue > 120 && blue - red > 25 && blue - green > 60
    })
    field.blur()
    /*
      TAILWIND v4 COMPOSES box-shadow OUT OF FIVE SLOTS -- inset shadow, inset
      ring, ring offset, ring, shadow -- and every unused one computes to
      "rgba(0, 0, 0, 0) 0px 0px 0px 0px". Printing the first 120 characters
      therefore printed four transparent placeholders and cut off the only
      layer carrying any ink, so the evidence was useless even though the
      check itself reads the whole string. String operations rather than a
      regex: this runs inside a template literal and the escaping is not
      worth the cleverness.
    */
    const EMPTY = "rgba(0, 0, 0, 0) 0px 0px 0px 0px"
    let cleaned = shadow.split(EMPTY).join("")
    while (cleaned.includes(",,")) cleaned = cleaned.split(",,").join(",")
    cleaned = cleaned.split(", ,").join(", ").trim()
    while (cleaned.startsWith(",")) cleaned = cleaned.slice(1).trim()
    while (cleaned.endsWith(",")) cleaned = cleaned.slice(0, -1).trim()
    const tidy = (v) => {
      let c = v.split(EMPTY).join("")
      while (c.includes(",,")) c = c.split(",,").join(",")
      c = c.split(", ,").join(", ").trim()
      while (c.startsWith(",")) c = c.slice(1).trim()
      while (c.endsWith(",")) c = c.slice(0, -1).trim()
      return c || "none"
    }
    return {
      shadow: (cleaned || "none").slice(0, 200),
      resting: tidy(resting).slice(0, 200),
      changedOnFocus: tidy(resting) !== (cleaned || "none"),
      border,
      restingBorder,
      violet,
      focused,
    }
  })()`)
  await sleep(300)

  await ev("window.scrollTo(0, document.documentElement.scrollHeight); true")
  await sleep(1500)
  r.footer = await ev(`(() => {
    const footer = document.querySelector("footer")
    if (!footer) return { found: false }
    const f = footer.getBoundingClientRect()
    const main = document.querySelector("main")
    if (!main) return { found: true, noMain: true }
    const offenders = []
    for (const el of main.querySelectorAll("*")) {
      const r = el.getBoundingClientRect()
      if (r.width < 8 || r.height < 8) continue
      const cs = getComputedStyle(el)
      /* Something that cannot be seen cannot be overlapping anything. */
      if (cs.visibility === "hidden" || cs.display === "none" || parseFloat(cs.opacity) === 0) continue
      /* Nor can something parked off the left edge of the world. */
      if (r.right < 0 || r.left > window.innerWidth) continue
      /* Overlapping the footer's band, not merely touching its top edge. */
      if (r.bottom > f.top + 2 && r.top < f.bottom - 2) {
        const tag = el.tagName.toLowerCase()
        const cls = typeof el.className === "string" ? el.className.split(" ").slice(0, 2).join(".") : ""
        offenders.push(tag + (cls ? "." + cls : "") + " " + Math.round(r.height) + "px")
      }
    }
    return {
      found: true,
      footerTop: Math.round(f.top),
      mainBottom: Math.round(main.getBoundingClientRect().bottom),
      /* Deepest first is noise; the outermost few name the culprit. */
      offenders: offenders.slice(0, 6),
      offenderCount: offenders.length,
    }
  })()`)
  await ev("window.scrollTo(0, 0); true")
  await sleep(600)

  /*
    ═══════════════════════════════════════════════════════════════════════
     AND WITH THE SEARCH OPEN, which is when the footer was reported
    ═══════════════════════════════════════════════════════════════════════
    "When I click on the input to search something there, it bugs with the
    footer." The screenshot shows the footer's links and the product cards
    interleaved. Every reading with the sheet CLOSED says main ends exactly
    where the footer begins, so if it is a layout fault at all it is one the
    sheet causes — a scroll lock, a height collapse, a fixed overlay.

    So the trigger is pressed and the same question asked again.
  */
  await ev("window.scrollTo(0, 900); true")
  await sleep(1200)
  r.searchOpen = await ev(`(() => {
    /* A phone opens a sheet from a button; a desktop focuses the field in
       the bar. Both are "the visitor tapped the search". */
    const near = (el) => {
      const r = el.getBoundingClientRect()
      return r.top >= -4 && r.top < 200 && r.width > 40
    }
    const button = [...document.querySelectorAll("button")].find((b) => /search/i.test(b.textContent || "") && near(b))
    if (button) { button.click(); return { pressed: true, how: "button" } }
    const field = [...document.querySelectorAll("input")].find((i) => /search/i.test(i.placeholder || "") && near(i))
    if (field) { field.focus(); field.click(); return { pressed: true, how: "field" } }
    return { pressed: false }
  })()`)
  await sleep(1400)
  r.withSearchOpen = await ev(`(() => {
    const footer = document.querySelector("footer")
    const main = document.querySelector("main")
    if (!footer || !main) return { found: false }
    const f = footer.getBoundingClientRect()
    const offenders = []
    for (const el of main.querySelectorAll("*")) {
      const rr = el.getBoundingClientRect()
      if (rr.width < 8 || rr.height < 8) continue
      const cs = getComputedStyle(el)
      if (cs.visibility === "hidden" || cs.display === "none" || parseFloat(cs.opacity) === 0) continue
      if (rr.right < 0 || rr.left > window.innerWidth) continue
      if (rr.bottom > f.top + 2 && rr.top < f.bottom - 2) {
        const cls = typeof el.className === "string" ? el.className.split(" ").slice(0, 2).join(".") : ""
        offenders.push(el.tagName.toLowerCase() + (cls ? "." + cls : ""))
      }
    }
    return {
      found: true,
      docHeight: Math.round(document.documentElement.scrollHeight),
      bodyOverflow: getComputedStyle(document.body).overflow,
      scrollLocked: document.body.hasAttribute("data-scroll-locked"),
      footerTop: Math.round(f.top),
      mainBottom: Math.round(main.getBoundingClientRect().bottom),
      offenderCount: offenders.length,
      offenders: offenders.slice(0, 6),
      /*
        AND WHICH END IT CAME FROM. Reported as "it shows the search model
        mobile bottom sheet from the top I want it from the bottom". A sheet
        anchored to the bottom has its own bottom edge on the bottom edge of
        the viewport the keyboard is not covering, so that is what is read
        rather than any class name.
      */
      /*
        NOTHING MAY COVER THE PAGE. The mobile search used to throw a sheet
        over everything; the owner asked for it gone, so the check is no
        longer "which end did the sheet come from" but "is there a sheet at
        all". Anything fixed or absolutely placed that covers more than half
        the screen while the search is open counts.
      */
      covering: (() => {
        const vw = window.innerWidth
        const vh = window.innerHeight
        const found = []
        for (const el of document.body.querySelectorAll("*")) {
          const cs = getComputedStyle(el)
          if (cs.position !== "fixed" && cs.position !== "absolute") continue
          if (cs.visibility === "hidden" || cs.display === "none" || parseFloat(cs.opacity) === 0) continue
          const b = el.getBoundingClientRect()
          if (b.width * b.height < vw * vh * 0.5) continue
          /* The header's own fixed bar is not a sheet. */
          if (el.id === "platform-header-root" || el.closest("#platform-header-root")) continue
          const cls = typeof el.className === "string" ? el.className.split(" ").slice(0, 3).join(".") : ""
          found.push(el.tagName.toLowerCase() + (cls ? "." + cls : "") + " " + Math.round(b.width) + "x" + Math.round(b.height))
        }
        return found.slice(0, 5)
      })(),
      /*
        And the control itself has to be the field, not a button that opens
        one.

        ON A DESKTOP THIS READS "none", AND THAT IS THIS SCRIPT, NOT THE PAGE.
        Pressing the search a moment ago called focus() on it, and focusing an
        input scrolls it into view — which undoes the scroll to 900 that put
        the header's own field on screen in the first place. By the time this
        runs the page is back near the top, the header has handed its search
        back, and the only search input left is the hero's, below the 200px
        band this looks in. The phone path presses the sticky strip's field,
        which is already at the top, so it is unaffected.
      */
      searchControlTag: (() => {
        const near = (el) => {
          const b = el.getBoundingClientRect()
          return b.top >= -4 && b.top < 200 && b.width > 40
        }
        const field = [...document.querySelectorAll("input")].find((i) => /search/i.test(i.placeholder || "") && near(i))
        if (field) return "input"
        const button = [...document.querySelectorAll("button")].find((b) => /search/i.test(b.textContent || "") && near(b))
        if (button) return "button"
        /* "none" on its own is not a finding, it is a question. Say what WAS
           on the page so the next run does not start from nothing. */
        const all = [...document.querySelectorAll("input")].filter((i) => /search/i.test(i.placeholder || ""))
        const tops = all.map((i) => Math.round(i.getBoundingClientRect().top)).join("/")
        return "none (" + all.length + " search input(s), at y=" + (tops || "-") + ")"
      })(),
    }
  })()`)
  /* Shut it again so the rest of the run is not measuring a page with a
     sheet over it. */
  await ev(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); true`)
  await sleep(800)
  await ev("window.scrollTo(0, 0); true")
  await sleep(600)

  /* Paging: press page 2 from the bottom of the list and see where it lands. */
  r.paging = await ev(`(() => {
    const two = [...document.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === "2" && b.className.includes("rounded-full"))
    if (!two) return { found: false }
    two.scrollIntoView({ block: "center" })
    const before = Math.round(window.scrollY)
    two.click()
    return { found: true, before }
  })()`)
  await sleep(1600)
  r.afterPaging = await ev("Math.round(window.scrollY)")

  await send("Target.closeTarget", { targetId }, null)
  ws.close()
  reap()
  return r
}

const desk = await main(1280)
const phone = await main(390)

const problems = []
console.log(`\n${URL_UNDER_TEST}\n`)
for (const r of [desk, phone]) {
  const label = r.width >= 700 ? "desktop" : "phone"
  console.log(`  ${label} (${r.width}px)`)
  console.log(`    header height: ${r.atRest.headerHeight}px`)
  console.log(`    heading: ${JSON.stringify((r.atRest.heading || "").slice(0, 70))}`)
  console.log(`    category strip buttons still present: ${r.atRest.categoryStrip}`)
  console.log(`    at rest      hero search: ${r.atRest.heroSearchPresent}   searches in header: ${r.atRest.headerSearches}`)
  console.log(`    scrolled 900 hero top: ${r.scrolled.heroTop}   searches in header: ${r.scrolled.headerSearches}`)
  console.log(`    back at top  searches in header: ${r.backAtTop.headerSearches}`)
  console.log(`    scrolling across the threshold: ${r.shift.heights.length} document height(s) ${r.shift.heights.join("/")}, ${r.shift.markTops.length} position(s) for the landmark`)
  if (r.footer?.found) console.log(`    footer top ${r.footer.footerTop}, main bottom ${r.footer.mainBottom}, elements overlapping the footer: ${r.footer.offenderCount}${r.footer.offenders?.length ? ` (${r.footer.offenders.join(", ")})` : ""}`)
  if (r.searchOpen?.pressed && r.withSearchOpen?.found) {
    const w = r.withSearchOpen
    console.log(`    search open (${r.searchOpen.how}): document ${w.docHeight}px, body overflow ${w.bodyOverflow}, scroll-locked ${w.scrollLocked}, footer top ${w.footerTop}, main bottom ${w.mainBottom}, overlapping ${w.offenderCount}${w.offenders.length ? ` (${w.offenders.join(", ")})` : ""}`)
  } else {
    console.log(`    search open: the trigger was not found, so this was not tested`)
  }
  if (r.layout) {
    console.log(`    Most popular is ${r.layout.popularColumns} card(s) per row; ${r.layout.pillsWithEmoji} pill(s) carry an emoji`)
    console.log(`    headings that announce categories: ${r.layout.categoryHeadings.length ? r.layout.categoryHeadings.map((h) => JSON.stringify(h)).join(", ") : "none"}`)
  }
  if (r.withSearchOpen?.found) {
    const w = r.withSearchOpen
    console.log(`    with the search open the control is a <${w.searchControlTag}> and ${w.covering.length} element(s) cover half the screen or more${w.covering.length ? ` (${w.covering.join(", ")})` : ""}`)
  }
  if (r.layout?.pills) {
    const pb = r.layout.pills
    console.log(`    the pill row leaves ${pb.left}px on the left and ${pb.right}px on the right of its track (${pb.centred ? "centred" : "NOT centred"})`)
  }
  if (r.focusGlow) {
    console.log(`    the search field at rest:  ${r.focusGlow.resting} / border ${r.focusGlow.restingBorder}`)
    console.log(`    and while focused (${r.focusGlow.focused ? "focus taken" : "FOCUS NOT TAKEN"}, ${r.focusGlow.changedOnFocus ? "shadow changed" : "shadow UNCHANGED"}): ${r.focusGlow.shadow} / border ${r.focusGlow.border}`)
  }
  if (r.paging.found) console.log(`    pressed page 2 at y=${r.paging.before} and landed at y=${r.afterPaging}`)
  else console.log(`    no page 2 control found`)
  console.log("")

  if (!r.atRest.heroSearchPresent) problems.push(`${label}: the hero has no search field.`)
  if (r.atRest.categoryStrip > 0) problems.push(`${label}: ${r.atRest.categoryStrip} category-strip buttons are still on the page.`)
  if (r.atRest.headerSearches !== 0) problems.push(`${label}: the header carries ${r.atRest.headerSearches} search control(s) while the page's own field is on screen. That is the same control twice.`)
  if (r.scrolled.headerSearches < 1) problems.push(`${label}: scrolled past the hero field, the header still has no search. The handoff did not happen.`)
  if (r.backAtTop.headerSearches !== 0) problems.push(`${label}: back at the top, the header kept its search. It should hand it back.`)
  if (r.shift && r.shift.heights.length > 1) {
    problems.push(`${label}: the document was ${r.shift.heights.join(" and ")}px tall at different scroll positions. Something is entering and leaving the flow as the page scrolls, which is the page jumping under the finger.`)
  }
  if (r.shift && r.shift.markTops.length > 1) {
    problems.push(`${label}: a landmark below the fold sat at ${r.shift.markTops.join(", ")} in document space while only the scroll changed. The page is reflowing as it scrolls.`)
  }
  if (r.searchOpen?.pressed && r.withSearchOpen?.found && r.withSearchOpen.offenderCount > 0) {
    problems.push(`${label}: with the search open, ${r.withSearchOpen.offenderCount} element(s) inside main overlap the footer (${r.withSearchOpen.offenders.join(", ")}). That is the reported footer bug.`)
  }
  if (r.footer?.found && r.footer.offenderCount > 0) {
    problems.push(`${label}: ${r.footer.offenderCount} element(s) inside main overlap the footer — ${r.footer.offenders.join(", ")}. main has overflow-x: clip, which leaves vertical overflow visible, so anything taller than its box paints over the footer.`)
  }
  /*
    A READING THAT CAME BACK EMPTY IS A CHECK THAT DID NOT RUN, and that has
    now happened twice in this file: once a selector that matched the wrong
    element and read 0 from both edges, once a regex the template literal ate
    on the way out. Both reported nothing and both looked like a pass.
  */
  if (!r.layout) {
    problems.push(`${label}: the page-shape reading came back empty, so Most popular, the pills and the category headings were not tested at all.`)
  }
  if (label === "phone" && r.withSearchOpen?.searchControlTag !== "input") {
    problems.push(`${label}: tapping search reaches a <${r.withSearchOpen?.searchControlTag}>, not a field you can type in.`)
  }
  if (r.withSearchOpen?.covering?.length) {
    problems.push(`${label}: with the search open, ${r.withSearchOpen.covering.length} element(s) cover half the screen or more (${r.withSearchOpen.covering.join(", ")}). The sheet was meant to be gone.`)
  }
  if (r.layout?.pills && !r.layout.pills.centred) {
    problems.push(`${label}: the pill row leaves ${r.layout.pills.left}px on the left and ${r.layout.pills.right}px on the right of its track, so it is packed against one edge rather than centred.`)
  }
  if (r.focusGlow && r.focusGlow.violet) {
    problems.push(`${label}: focusing the search field paints a violet glow (${r.focusGlow.shadow}).`)
  }
  if (r.focusGlow && !r.focusGlow.focused) {
    problems.push(`${label}: the field never took focus, so what was read back is the resting state and the glow was not tested.`)
  }
  /*
    SOMETHING has to say the field is focused, or a keyboard has no idea where
    it is. It does not have to be the shadow — here it is the border — but if
    neither moves there is no affordance at all.
  */
  if (r.focusGlow && r.focusGlow.focused && !r.focusGlow.changedOnFocus && r.focusGlow.border === r.focusGlow.restingBorder) {
    problems.push(`${label}: focus changes neither the shadow nor the border, so there is nothing to show which field is focused.`)
  }
  if (r.layout && r.layout.categoryHeadings.length > 1) {
    problems.push(`${label}: ${r.layout.categoryHeadings.length} headings announce categories (${r.layout.categoryHeadings.join(" / ")}). There should be one board, not two.`)
  }
  if (label === "phone" && r.layout && r.layout.popularColumns !== null && r.layout.popularColumns > 1) {
    problems.push(`${label}: Most popular is ${r.layout.popularColumns} cards per row. On a phone it should be one.`)
  }
  if (r.layout && r.layout.pillsWithEmoji < 3) {
    problems.push(`${label}: only ${r.layout.pillsWithEmoji} category pill(s) carry an emoji.`)
  }
  if (r.paging.found && r.afterPaging >= r.paging.before) {
    problems.push(`${label}: pressing page 2 from y=${r.paging.before} left the visitor at y=${r.afterPaging}. Paging should return to the top of the list.`)
  }
}
if (desk.atRest.headerHeight >= 84) problems.push(`The desktop header is ${desk.atRest.headerHeight}px; it was 84px and should be about 80px.`)

if (problems.length) {
  console.error(`${problems.length} problem${problems.length > 1 ? "s" : ""}:\n`)
  problems.forEach((p, i) => console.error(`  ${i + 1}. ${p}`))
  console.error("")
  process.exit(1)
}
console.log("  Smaller header, no strip, one search at a time, and paging lands at the top.\n")
