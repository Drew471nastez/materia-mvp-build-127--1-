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
  const profile = mkdtempSync(join(tmpdir(), "storelib-sitenav-"))
  const chrome = spawn(CHROMIUM, [
    "--headless=new", "--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage",
    `--user-data-dir=${profile}`, "--remote-debugging-port=0", "--remote-allow-origins=*",
    "--window-size=402,874", ...reachabilityFlags(), "about:blank",
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
  const consoleLines = []
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result ?? {}); pending.delete(msg.id); return }
    if (msg.method === "Runtime.consoleAPICalled") {
      consoleLines.push((msg.params.args ?? []).map((a) => a.value ?? a.description ?? "").join(" "))
    }
  })
  let sessionId = null
  const send = (method, params = {}, session = sessionId) =>
    new Promise((resolve) => { const n = ++id; pending.set(n, resolve); ws.send(JSON.stringify({ id: n, method, params, ...(session ? { sessionId: session } : {}) })) })
  const evaluate = async (expr) => {
    const { result, exceptionDetails } = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })
    if (exceptionDetails) return { __error: exceptionDetails.exception?.description ?? exceptionDetails.text }
    return result?.value
  }

  const { targetId } = await send("Target.createTarget", { url: "about:blank" }, null)
  sessionId = (await send("Target.attachToTarget", { targetId, flatten: true }, null)).sessionId
  await send("Page.enable"); await send("Runtime.enable")
  await send("Emulation.setDeviceMetricsOverride", { width: 402, height: 874, deviceScaleFactor: 3, mobile: true })
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 })

  const SITE = process.env.SITE ?? "https://andrewrullz.storelib.com/"
  await send("Page.navigate", { url: SITE })
  await sleep(6000)

  const tap = async (x, y) => {
    for (const type of ["touchStart", "touchEnd"]) {
      await send("Input.dispatchTouchEvent", {
        type,
        touchPoints: type === "touchEnd" ? [] : [{ x, y, radiusX: 10, radiusY: 10, force: 1 }],
      })
    }
    await sleep(400)
  }

  const report = { site: SITE }

  /* ── the hamburger ──────────────────────────────────────────────── */
  const burger = await evaluate(`(() => {
    const candidates = [...document.querySelectorAll("button, [role='button']")]
      .filter((b) => {
        const label = (b.getAttribute("aria-label") || "").toLowerCase()
        const r = b.getBoundingClientRect()
        return r.top < 140 && r.width > 20 && (label.includes("menu") || label.includes("nav") || b.querySelector("svg"))
      })
    const first = candidates.find((b) => (b.getAttribute("aria-label") || "").toLowerCase().includes("menu")) || candidates[0]
    if (!first) return null
    const r = first.getBoundingClientRect()
    return { label: first.getAttribute("aria-label"), x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  })()`)
  report.hamburger = burger
  if (!burger || burger.__error) {
    const what = await evaluate(`(() => ({
      buttons: [...document.querySelectorAll("button")].slice(0, 12).map((b) => {
        const r = b.getBoundingClientRect()
        return { label: b.getAttribute("aria-label"), cls: String(b.className || "").slice(0, 50),
                 top: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }
      }),
      headerHtml: (document.querySelector("header, [data-chrome]") || document.body).outerHTML.slice(0, 1200),
    }))()`)
    console.log(JSON.stringify(what, null, 2))
    reap(); fail("No hamburger found; the page is printed above.")
  }
  await tap(burger.x, burger.y)

  /* ── what the drawer shows ──────────────────────────────────────── */
  const drawer = await evaluate(`(() => {
    const panel = document.querySelector("aside[role='dialog'][aria-label='Menu']")
    if (!panel) return { open: false }
    const pr = panel.getBoundingClientRect()
    const links = [...panel.querySelectorAll("a[href]")].map((a) => {
      const r = a.getBoundingClientRect()
      const cs = getComputedStyle(a)
      return {
        text: (a.textContent || "").trim().slice(0, 30),
        href: a.getAttribute("href"),
        x: Math.round(r.left + r.width / 2),
        y: Math.round(r.top + r.height / 2),
        w: Math.round(r.width), h: Math.round(r.height),
        pointer: cs.pointerEvents,
        /* What is actually on top at the link's own middle: if it is not the
           link or one of its children, the tap never reaches it. */
        topmost: (() => {
          const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
          if (!el) return "nothing"
          if (el === a || a.contains(el)) return "the link"
          return el.tagName.toLowerCase() + "." + String(el.className || "").slice(0, 40)
        })(),
      }
    })
    return {
      open: true,
      hidden: panel.getAttribute("aria-hidden"),
      transform: getComputedStyle(panel).transform,
      pointer: getComputedStyle(panel).pointerEvents,
      rect: { x: Math.round(pr.left), w: Math.round(pr.width) },
      bodyPosition: getComputedStyle(document.body).position,
      links,
    }
  })()`)
  report.drawer = drawer

  /* ── tap the first real link ────────────────────────────────────── */
  const before = await evaluate(`location.pathname`)
  /* A link to the page you are already on proves nothing, and neither does
     one that is not on screen. LINK= names one by its text, for the rows
     whose own topmost element is not the link — the thing worth proving
     there is whether a finger reaches them at all. */
  const wanted = process.env.LINK
  const target = wanted
    ? (drawer.links ?? []).find((l) => l.text.toLowerCase().includes(wanted.toLowerCase()) && l.h > 10)
    : (drawer.links ?? []).find(
        (l) => l.href && l.href.startsWith("/") && l.href !== before && l.h > 10 && l.topmost === "the link",
      )
  report.tapped = target ?? null
  if (target) {
    await tap(target.x, target.y)
    await sleep(2500)
  }
  report.navigation = {
    before,
    after: await evaluate(`location.pathname`),
    wanted: target ? target.href : null,
  }
  report.drawerAfter = await evaluate(`(() => {
    const panel = document.querySelector("aside[role='dialog'][aria-label='Menu']")
    return panel ? { transform: getComputedStyle(panel).transform, hidden: panel.getAttribute("aria-hidden") } : "gone"
  })()`)
  report.bodyAfter = await evaluate(`({ position: getComputedStyle(document.body).position, top: document.body.style.top })`)

  /* ── the logo ───────────────────────────────────────────────────── */
  await send("Page.navigate", { url: SITE })
  await sleep(5000)
  /* EVERY candidate, with its size, because the header renders a desktop one
     and a mobile one and only one of them is on screen. A probe that takes
     the first finds a 0x0 element and reports a working link as broken, or
     the other way round. */
  const logos = await evaluate(`(() => {
    const all = [...document.querySelectorAll("a[aria-label='Go to the home page'], header a[href='/'], [data-chrome] a[href='/']")]
    return all.map((a) => {
      const r = a.getBoundingClientRect()
      return {
        href: a.getAttribute("href"),
        kind: a.querySelector("img") ? "image" : "text",
        text: (a.textContent || "").trim().slice(0, 24),
        x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2),
        w: Math.round(r.width), h: Math.round(r.height),
        onScreen: r.width > 0 && r.height > 0 && r.top < innerHeight,
        topmost: (() => {
          if (r.width === 0) return "not rendered"
          const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
          if (!el) return "nothing"
          if (el === a || a.contains(el)) return "the logo"
          return el.tagName.toLowerCase() + "." + String(el.className || "").slice(0, 40)
        })(),
      }
    })
  })()`)
  report.logos = logos

  /* And tap the one a finger would actually hit. */
  const visibleLogo = (logos ?? []).find((l) => l.onScreen)
  if (visibleLogo) {
    await evaluate(`history.pushState({}, "", "/about"); location.assign("/about")`)
    await sleep(4000)
    const atAbout = await evaluate(`location.pathname`)
    const again = await evaluate(`(() => {
      const all = [...document.querySelectorAll("a[aria-label='Go to the home page'], header a[href='/']")]
      const a = all.find((x) => { const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0 })
      if (!a) return null
      const r = a.getBoundingClientRect()
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
    })()`)
    if (again) {
      await tap(again.x, again.y)
      await sleep(2500)
    }
    report.logoTap = { from: atAbout, to: await evaluate(`location.pathname`), tappedAt: again }
  }

  console.log(JSON.stringify(report, null, 2))
  if (consoleLines.length) console.log("\nconsole:", consoleLines.slice(0, 8))
  reap()
  process.exit(0)
}

main().catch((e) => fail(String(e?.stack || e)))
