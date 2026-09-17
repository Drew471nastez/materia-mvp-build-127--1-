/**
 * ===========================================================================
 *  THE WAY BACK, FRAME BY FRAME, AND EVERYTHING THAT MOVES WHEN IT LANDS
 * ===========================================================================
 * check-nav-flash.mjs films both directions and reads the header strip. It
 * has now reported the header clean three times while a flash on the way BACK
 * was still being seen on a real phone, so it is not asking enough.
 *
 * Two things it does not do, and both are in here:
 *
 *   IT LOOKS AT THE HEADER. A flash lower down the page — a grid of cards
 *   fading in, an image strip re-decoding, a sticky bar sliding — never
 *   touches the top 53px. This reads the whole frame in four bands.
 *
 *   AND IT ONLY HAS PIXELS. A frame that goes white tells you THAT something
 *   flashed, never WHAT. So the moment the back lands, every running
 *   animation and transition on the page is sampled, twenty times a second,
 *   with the element each one belongs to. That is the list of suspects.
 *
 * It also answers the two questions that decide whether the back was free at
 * all: did the main frame request a document, and did the scroll come back to
 * where it was.
 *
 *   node scripts/check-back-flash.mjs
 *   URL=https://storelib.com/<handle> node scripts/check-back-flash.mjs
 */
import { execFileSync, spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const START = process.env.URL ?? "https://storelib.com/andrewrullz"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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
    } catch { /* fall through */ }
  }
  return flags
}

async function main() {
  const profile = mkdtempSync(join(tmpdir(), "storelib-film-"))
  const chrome = spawn(CHROMIUM, [
    "--headless=new", "--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage",
    `--user-data-dir=${profile}`, "--remote-debugging-port=0", "--remote-allow-origins=*",
    "--window-size=430,900", ...reachabilityFlags(), "about:blank",
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
  const docRequests = []
  let mainFrameId = null
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result ?? {}); pending.delete(msg.id); return }
    /*
      Navigations of the PAGE, so "was coming back free?" is answered by
      evidence rather than by feel.

      THE MAIN FRAME ONLY. An iframe is a document too, and this creator's page
      embeds three YouTube players — so counting every Document request made
      the probe report a free, 52ms client navigation back as "a full load".
      The page has one main frame and its id does not change across a client
      navigation; everything else is somebody's embed.
    */
    if (msg.method === "Network.requestWillBeSent" && msg.params?.type === "Document") {
      const isMain = mainFrameId && msg.params.frameId === mainFrameId
      docRequests.push({ url: msg.params.request.url, at: Date.now(), isMain: !!isMain })
    }
  })
  let sessionId = null
  const send = (method, params = {}, session = sessionId) =>
    new Promise((resolve) => { const n = ++id; pending.set(n, resolve); ws.send(JSON.stringify({ id: n, method, params, ...(session ? { sessionId: session } : {}) })) })
  const evaluate = async (expr) => {
    const { result } = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })
    return result?.value
  }

  const { targetId } = await send("Target.createTarget", { url: "about:blank" }, null)
  sessionId = (await send("Target.attachToTarget", { targetId, flatten: true }, null)).sessionId
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable")
  mainFrameId = (await send("Page.getFrameTree"))?.frameTree?.frame?.id ?? null
  if (!mainFrameId) { reap(); fail("Could not identify the page's main frame, so a page load could not be told from an embed.") }
  await send("Emulation.setDeviceMetricsOverride", { width: 430, height: 900, deviceScaleFactor: 2, mobile: true })
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 })

  const report = { start: START }
  const frames = []
  let filming = false
  let t0 = 0

  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.method === "Page.screencastFrame") {
      if (filming) frames.push({ t: Math.round(performance.now() - t0), data: msg.params.data })
      send("Page.screencastFrameAck", { sessionId: msg.params.sessionId }).catch(() => {})
    }
  })

  /* ---------------------------------------------------------------------
     THE LISTING, SCROLLED, THE WAY SOMEBODY ACTUALLY LEAVES IT
     --------------------------------------------------------------------- */
  await send("Page.navigate", { url: START })
  await sleep(9000)
  /* HOW FAR DOWN THE VISITOR WAS WHEN THEY LEFT. It is a variable because it
     changes the answer: an entrance animation on something near the top of
     the listing is invisible at 700px and is the whole flash at 150px. */
  const LEAVE_AT = Number(process.env.SCROLL ?? 700)
  await evaluate(`window.scrollTo(0, ${LEAVE_AT}); "ok"`)
  await sleep(1200)
  const leftAt = await evaluate(`Math.round(window.scrollY)`)

  /*
    A CARD THAT IS ACTUALLY ON SCREEN — overlap with the safe band, not
    containment, because a card is taller than the window once the page is
    scrolled. Demanding containment made this filter reject every card.
  */
  const target = await evaluate(`(() => {
    const links = [...document.querySelectorAll("a[href]")].filter((a) => {
      const p = new URL(a.href, location.href).pathname.split("/").filter(Boolean)
      if (p.length !== 2 || p[1] === "links") return false
      const b = a.getBoundingClientRect()
      return b.width > 80 && b.bottom > 120 && b.top < window.innerHeight - 80
    })
    if (!links.length) return null
    const b = links[0].getBoundingClientRect()
    const top = Math.max(b.top, 100)
    const bottom = Math.min(b.bottom, window.innerHeight - 60)
    return { href: links[0].getAttribute("href"), x: Math.round(b.left + b.width / 2), y: Math.round((top + bottom) / 2) }
  })()`)
  if (!target) {
    /* A probe that says "no product card" on a page covered in them has told
       you about itself, not about the page. So it shows its working. */
    const seen = await evaluate(`(() => ({
      url: location.href,
      anchors: document.querySelectorAll("a[href]").length,
      sample: [...document.querySelectorAll("a[href]")].slice(0, 25).map((a) => {
        const b = a.getBoundingClientRect()
        return new URL(a.href, location.href).pathname + " @" + Math.round(b.top) + "x" + Math.round(b.width)
      }),
    }))()`)
    console.error(JSON.stringify(seen, null, 2))
    reap()
    fail("No product card on the creator page.")
  }

  const tap = async (x, y) => {
    for (const type of ["touchStart", "touchEnd"]) {
      await send("Input.dispatchTouchEvent", {
        type,
        touchPoints: type === "touchEnd" ? [] : [{ x, y, radiusX: 12, radiusY: 12, force: 1 }],
      })
    }
  }
  await tap(target.x, target.y)
  /* Long enough that the product page is not merely present but SETTLED —
     images decoded, bars placed. Filming a back out of a page that is still
     arriving measures the wrong journey. */
  await sleep(8000)

  /*
    ═══════════════════════════════════════════════════════════════════════
     THE PRODUCT PAGE WAS ACTUALLY REACHED, OR NOTHING BELOW MEANS ANYTHING
    ═══════════════════════════════════════════════════════════════════════
    A run of this probe reported the whole screen at 255.0 luminance — pure
    white in every band — and it read as the flash being hunted. It was not.
    The tap had missed, the page never left the listing, and `history.back()`
    therefore went back to the about:blank this browser started on. White page,
    scroll 0, no document request: every number consistent, and every one of
    them about a journey no visitor takes.

    Filming a back out of the wrong page is the fourth way this family of
    probes has produced a confident wrong answer, so it is asserted rather
    than assumed.
  */
  const landedOn = await evaluate(`location.pathname`)
  if (landedOn !== target.href) {
    reap()
    fail(`The tap did not open the product page: wanted ${target.href}, on ${landedOn}. Nothing was filmed.`)
  }

  /* ---------------------------------------------------------------------
     ANYTHING PURPLE, ANYWHERE NEAR THE TOP
     --------------------------------------------------------------------- */
  /*
    A violet strip across the top of the product page was reported with a
    screenshot. The component that drew one was deleted, so this asks the
    live page rather than the repository: every element in the top 200px
    whose own background is not transparent, with its colour.
  */
  const topStrip = await evaluate(`(() => {
    const out = []
    for (const el of document.querySelectorAll("body *")) {
      const b = el.getBoundingClientRect()
      if (b.top > 200 || b.bottom < 0 || b.height > 220 || b.width < 100) continue
      const cs = getComputedStyle(el)
      const bg = cs.backgroundColor
      const img = cs.backgroundImage
      const transparent = bg === "rgba(0, 0, 0, 0)" || bg === "transparent"
      if (transparent && (!img || img === "none")) continue
      out.push({
        tag: el.tagName.toLowerCase(),
        cls: String(el.className || "").slice(0, 60),
        top: Math.round(b.top), h: Math.round(b.height),
        bg, img: img && img !== "none" ? img.slice(0, 90) : "",
      })
    }
    return out
  })()`)

  /* ---------------------------------------------------------------------
     FILM THE BACK, AND SAMPLE WHAT IS MOVING WHILE IT HAPPENS
     --------------------------------------------------------------------- */
  const beforeDocs = docRequests.length
  frames.length = 0
  t0 = performance.now()
  filming = true
  await send("Page.startScreencast", { format: "jpeg", quality: 80, everyNthFrame: 1 })

  const animationSamples = []
  const sampler = setInterval(async () => {
    const at = Math.round(performance.now() - t0)
    const running = await evaluate(`(() => {
      try {
        return document.getAnimations().map((a) => {
          const e = a.effect
          const t = e && e.target
          const r = t && t.getBoundingClientRect ? t.getBoundingClientRect() : null
          return {
            kind: a.constructor.name,
            what: a.transitionProperty || a.animationName || "",
            state: a.playState,
            dur: e && e.getTiming ? e.getTiming().duration : null,
            tag: t && t.tagName ? t.tagName.toLowerCase() : "",
            cls: t ? String(t.className || "").slice(0, 60) : "",
            top: r ? Math.round(r.top) : null,
            h: r ? Math.round(r.height) : null,
          }
        })
      } catch { return [] }
    })()`)
    if (running && running.length) animationSamples.push({ at, running })
  }, 50)

  await evaluate(`history.back(); "ok"`)
  await sleep(2600)
  clearInterval(sampler)
  filming = false
  await send("Page.stopScreencast")

  /*
    AND WHAT IS ON SCREEN WHEN THE DUST SETTLES. The screencast only emits a
    frame when something CHANGES, so a film whose last frame is white is
    ambiguous: the page may have stayed white, or the capture may simply have
    ended there. A still taken after the wait settles which it was.
  */
  const settled = await send("Page.captureScreenshot", { format: "jpeg", quality: 80 })
  if (settled?.data) writeFileSync(join(tmpdir(), "storelib-back-settled.jpg"), Buffer.from(settled.data, "base64"))

  const landedAt = await evaluate(`Math.round(window.scrollY)`)
  const mainDocs = docRequests.slice(beforeDocs).filter((d) => d.isMain)

  /* ---------------------------------------------------------------------
     WRITE IT DOWN
     --------------------------------------------------------------------- */
  const dir = mkdtempSync(join(tmpdir(), "storelib-back-"))
  for (const f of frames) writeFileSync(join(dir, `back-${String(f.t).padStart(5, "0")}ms.jpg`), Buffer.from(f.data, "base64"))

  console.log(JSON.stringify({
    dir,
    target: target.href,
    frames: frames.length,
    scroll: { leftAt, landedAt, restoredExactly: leftAt === landedAt },
    mainFrameDocumentRequests: mainDocs.length,
    purpleSuspects: topStrip.filter((e) => /rgb\(\s*1[0-9][0-9],\s*\d+,\s*2[0-9][0-9]/.test(e.bg) || /gradient/.test(e.img)),
    topStrip,
    animationSamples,
  }, null, 2))
  reap()
  process.exit(0)
}

main().catch((e) => fail(String(e?.stack || e)))
