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
  if (r.footer?.found && r.footer.offenderCount > 0) {
    problems.push(`${label}: ${r.footer.offenderCount} element(s) inside main overlap the footer — ${r.footer.offenders.join(", ")}. main has overflow-x: clip, which leaves vertical overflow visible, so anything taller than its box paints over the footer.`)
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
