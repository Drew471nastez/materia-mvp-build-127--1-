/**
 * ===========================================================================
 *  THE SEARCH STRIP ON THE WAY BACK: EXPLORE -> PRODUCT -> BACK
 * ===========================================================================
 * Every probe before this one drove a CREATOR page (storelib.com/<handle>)
 * and reported the transition clean, while a screen recording off a real
 * phone showed a white flash on every navigation. Both were right. The
 * recording is of /explore -- the marketplace, with the platform's own black
 * header and a "< Explore" link -- which is a different surface with a
 * different header, and nothing here had ever driven it.
 *
 * Measured off that recording, 60fps, three navigations:
 *
 *      784ms   88.9% of the screen white, header gone
 *     2934ms   89.0% white, every label washed out to grey
 *     4251ms   66.1% white
 *
 * So this samples the header itself -- is it in the DOM, how tall is it, what
 * colour, and what OPACITY is its page -- every frame across a navigation in
 * both directions, and films the pixels alongside.
 *
 *   node scripts/check-explore-flash.mjs
 */
import { execFileSync, spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const START = process.env.URL ?? "https://storelib.com/explore"
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
  const THROTTLE = Number(process.env.CPU ?? 1)
  if (THROTTLE > 1) await send("Emulation.setCPUThrottlingRate", { rate: THROTTLE })

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
     THE MARKETPLACE, SCROLLED, THE WAY THE RECORDING STARTS
     --------------------------------------------------------------------- */
  await send("Page.navigate", { url: START })
  await sleep(10000)
  const LEAVE_AT = Number(process.env.SCROLL ?? 600)
  await evaluate(`window.scrollTo(0, ${LEAVE_AT}); "ok"`)
  await sleep(1200)
  const leftAt = await evaluate(`Math.round(window.scrollY)`)

  /*
    WHAT THE HEADER IS, ASKED THE SAME WAY EVERY TIME.

    Three separate things can each read as "the header flashed": the element
    leaving the DOM, the element staying but losing its height, and the whole
    page being painted at reduced opacity with the header still in place. They
    are different bugs with different fixes, so they are measured apart.
  */
  const PROBE = `(() => {
    const hdr = document.querySelector("#platform-header-root, header")
    const hr = hdr ? hdr.getBoundingClientRect() : null
    /* The phone's search strip: the fixed, md:hidden bar the header grows once
       the hero's own field has scrolled off. Found by what it is rather than by
       a class name, so a restyle cannot silently retire the probe. */
    const strip = [...document.querySelectorAll("div")].find((d) => {
      const cs = getComputedStyle(d)
      return cs.position === "fixed" && d.querySelector("input") && d.getBoundingClientRect().width > 200
    }) || null
    const sr = strip ? strip.getBoundingClientRect() : null
    const scs = strip ? getComputedStyle(strip) : null
    const anchor = document.querySelector("[data-explore-search-anchor]")
    const ar = anchor ? anchor.getBoundingClientRect() : null
    return {
      path: location.pathname,
      y: Math.round(window.scrollY),
      hdrH: hr ? Math.round(hr.height) : 0,
      hdrTop: hr ? Math.round(hr.top) : null,
      hdrOpacity: hdr ? getComputedStyle(hdr).opacity : "",
      strip: !!strip,
      stripTop: sr ? Math.round(sr.top) : null,
      stripH: sr ? Math.round(sr.height) : 0,
      stripOpacity: scs ? scs.opacity : "",
      anchor: !!anchor,
      anchorTop: ar ? Math.round(ar.top) : null,
      anims: document.getAnimations()
        .filter((a) => a.playState === "running")
        .slice(0, 6)
        .map((a) => {
          const t = a.effect && a.effect.target
          return { what: a.transitionProperty || a.animationName || "", cls: t ? String(t.className || "").slice(0, 60) : "" }
        }),
    }
  })()`

  const settledBefore = await evaluate(PROBE)

  const target = await evaluate(`(() => {
    /* A product card on the marketplace links to /<handle>/<slug>, not /p/<slug>
       — the /p/ form is the canonical route, the cards use the pretty one. An
       earlier version of this asked for a[href^="/p/"] and found none on a page
       showing dozens of products. */
    const links = [...document.querySelectorAll("a[href]")].filter((a) => {
      const p = new URL(a.href, location.href).pathname.split("/").filter(Boolean)
      if (p.length !== 2 || p[1] === "links") return false
      if (["explore", "blog", "legal", "u", "c", "l"].includes(p[0])) return false
      const b = a.getBoundingClientRect()
      return b.width > 80 && b.bottom > 120 && b.top < window.innerHeight - 80
    })
    if (!links.length) return null
    const b = links[0].getBoundingClientRect()
    const top = Math.max(b.top, 100)
    const bottom = Math.min(b.bottom, window.innerHeight - 60)
    return { href: links[0].getAttribute("href"), x: Math.round(b.left + b.width / 2), y: Math.round((top + bottom) / 2) }
  })()`)
  if (!target) { reap(); fail("No product card on the marketplace.") }

  const tap = async (x, y) => {
    for (const type of ["touchStart", "touchEnd"]) {
      await send("Input.dispatchTouchEvent", {
        type,
        touchPoints: type === "touchEnd" ? [] : [{ x, y, radiusX: 12, radiusY: 12, force: 1 }],
      })
    }
  }

  /*
    ONE SAMPLE PER FRAME, TAKEN INSIDE THE PAGE.

    A CDP Runtime.evaluate per tick is a round trip, and the thing being
    looked for is two frames long. The recorder runs in requestAnimationFrame
    and the result is read out afterwards, so nothing is missed.
  */
  const RECORDER = `(() => {
    window.__film = []
    const t0 = performance.now()
    const step = () => {
      const hdr = document.querySelector("#platform-header-root, header")
      const hr = hdr ? hdr.getBoundingClientRect() : null
      const strip = [...document.querySelectorAll("div")].find((d) => {
        const cs = getComputedStyle(d)
        return cs.position === "fixed" && d.querySelector("input") && d.getBoundingClientRect().width > 200
      })
      const sr = strip ? strip.getBoundingClientRect() : null
      window.__film.push({
        at: Math.round(performance.now() - t0),
        path: location.pathname,
        y: Math.round(window.scrollY),
        hdr: !!hdr,
        hdrH: hr ? Math.round(hr.height) : 0,
        hdrTop: hr ? Math.round(hr.top) : null,
        hdrPos: hdr ? getComputedStyle(hdr).position : "",
        strip: !!strip,
        stripOp: strip ? Number(getComputedStyle(strip).opacity).toFixed(2) : "",
        stripTop: sr ? Math.round(sr.top) : null,
        /* What the first content under the header is, which is how a missing
           header shows up as content sliding to the top of the window. */
        firstCardTop: (() => {
          const m = document.querySelector("main")
          if (!m) return null
          const el = m.querySelector("a[href], img")
          return el ? Math.round(el.getBoundingClientRect().top) : null
        })(),
      })
      if (performance.now() - t0 < 3000) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
    return "recording"
  })()`

  const watch = async (label, act, ms) => {
    frames.length = 0
    t0 = performance.now()
    filming = true
    await send("Page.startScreencast", { format: "jpeg", quality: 80, everyNthFrame: 1 })
    await evaluate(RECORDER)
    await act()
    await sleep(ms)
    filming = false
    await send("Page.stopScreencast")
    const samples = (await evaluate(`JSON.stringify(window.__film || [])`)) ?? "[]"
    const dir = mkdtempSync(join(tmpdir(), `storelib-${label}-`))
    for (const f of frames) writeFileSync(join(dir, `${label}-${String(f.t).padStart(5, "0")}ms.jpg`), Buffer.from(f.data, "base64"))
    return { dir, samples: JSON.parse(samples), frames: frames.length }
  }

  const forward = await watch("fwd", () => tap(target.x, target.y), 3000)

  /*
    PATHNAME AGAINST PATHNAME. A marketplace card's href carries the query that
    puts the product page in discover mode —

      /negruw/trapsodia-trap-pack?layout=discover&recommended=1

    — and comparing that whole string to `location.pathname` fails on a
    navigation that worked perfectly. The query is the point of the link, not
    noise, so it is kept on the link and dropped for the comparison.
  */
  const wantPath = target.href.split("?")[0]
  const landedOn = await evaluate(`location.pathname`)
  if (landedOn !== wantPath) { reap(); fail(`The tap did not open ${wantPath}; on ${landedOn}.`) }
  await sleep(4000)

  const beforeDocs = docRequests.length
  /* With MANUAL restoration the browser does not scroll the outgoing page;
     whoever else restores it has to be the router. Set by env so the same
     probe answers both questions. */
  if (process.env.MANUAL === "1") await evaluate(`history.scrollRestoration = "manual"; history.scrollRestoration`)
  /*
    SAFARI SCROLLS THE PAGE YOU ARE LEAVING, AND CHROMIUM DOES NOT.
    On the recording the window is already at the destination's offset while
    the outgoing page is still on screen, which is what takes a `relative`
    header off the top. Chromium restores at commit instead, so the failure
    cannot be filmed here without asking for it. EARLY=1 asks for it: the same
    scroll, one tick before the pop.
  */
  const back = await watch("back", () => evaluate(
    process.env.EARLY === "1"
      ? `window.scrollTo(0, ${LEAVE_AT}); history.back(); "ok"`
      : `history.back(); "ok"`,
  ), 3000)
  const landedBack = await evaluate(`Math.round(window.scrollY)`)

  /* Only the moments where the answer CHANGED — a run of identical samples is
     not evidence, it is noise with a timestamp on it. */
  const changes = (samples) => {
    const out = []
    let last = ""
    for (const s of samples) {
      const key = `${s.path}|${s.hdr}|${s.hdrH}|${s.hdrTop}|${s.hdrPos}|${s.strip}|${s.stripOp}|${s.stripTop}`
      if (key !== last) { out.push(s); last = key }
    }
    return out
  }

  console.log(JSON.stringify({
    start: START,
    target: target.href,
    settledBefore,
    scroll: { leftAt, landedBack, restoredExactly: leftAt === landedBack },
    mainFrameDocumentRequests: docRequests.slice(beforeDocs).filter((d) => d.isMain).length,
    forward: { dir: forward.dir, frames: forward.frames, changes: changes(forward.samples) },
    back: { dir: back.dir, frames: back.frames, changes: changes(back.samples) },
  }, null, 2))
  reap()
  process.exit(0)
}

main().catch((e) => fail(String(e?.stack || e)))
