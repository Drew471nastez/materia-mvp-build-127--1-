/**
 * ===========================================================================
 *  "APPLICATION ERROR: A CLIENT-SIDE EXCEPTION HAS OCCURRED"
 * ===========================================================================
 * That sentence is what a visitor sees when a React component throws while
 * rendering in their browser. It replaces the whole page with a blank screen
 * and a line of text, and it is the worst failure this product has, because:
 *
 *   - it happens in the BROWSER, so the server is fine, the deploy is READY,
 *     and every log Vercel keeps is green;
 *   - `pnpm build` cannot catch it, because the build renders on the server
 *     where the crashing code path may never run;
 *   - the test suite cannot catch it, because the suite imports modules and
 *     does not paint pages.
 *
 * So there was no gate between "it compiles" and "a visitor sees a blank
 * page". This is that gate. It drives a REAL Chromium at REAL pages through
 * the DevTools protocol and fails on anything the browser would have logged:
 * an uncaught exception, a React error boundary firing, a failed chunk.
 *
 *   node scripts/check-client-errors.mjs                    # production
 *   BASE=http://localhost:3000 node scripts/check-client-errors.mjs
 *   PATHS=/,/pricing node scripts/check-client-errors.mjs
 *
 * Node 22 has a WebSocket client built in, so driving CDP needs no package.
 */

import { spawn } from "node:child_process"
import { existsSync } from "node:fs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const BASE = (process.env.BASE ?? "https://storelib.com").replace(/\/$/, "")
const PORT = Number(process.env.CDP_PORT ?? 9333)

/** The pages a visitor actually lands on. A crash on any of them is a crash. */
const PATHS = (process.env.PATHS ?? "/,/discover,/login,/signup").split(",").map((p) => p.trim()).filter(Boolean)

if (!existsSync(CHROMIUM)) {
  console.error(`No browser at ${CHROMIUM}. Set CHROMIUM.`)
  process.exit(1)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * The sentence Next.js paints over the page when a client render throws. If
 * this is in the DOM, a visitor is looking at a blank screen right now.
 */
const NEXT_CRASH = /Application error: a client-side exception has occurred/i

async function main() {
  const chrome = spawn(
    CHROMIUM,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      `--remote-debugging-port=${PORT}`,
      "--remote-allow-origins=*",
      "--window-size=1280,900",
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  )
  let stderr = ""
  chrome.stderr.on("data", (d) => (stderr += String(d)))

  /** The port takes a moment. Poll rather than guess a delay. */
  let version = null
  for (let i = 0; i < 60 && !version; i++) {
    try {
      version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()
    } catch {
      await sleep(250)
    }
  }
  if (!version) {
    chrome.kill()
    console.error(`Chromium never opened a debugging port.\n${stderr.slice(-800)}`)
    process.exit(1)
  }

  const failures = []
  try {
    for (const path of PATHS) {
      const url = `${BASE}${path}`
      const found = await visit(version.webSocketDebuggerUrl, url)
      const bad = found.errors.length > 0 || found.crashed
      console.log(`\n${bad ? "✗" : "ok"}  ${url}${found.status ? `  (${found.status})` : ""}`)
      if (found.crashed) {
        failures.push(`${url}: the page is showing "Application error: a client-side exception has occurred"`)
        console.log(`    the page rendered Next's client-crash screen`)
      }
      for (const e of found.errors) {
        failures.push(`${url}: ${e.split("\n")[0]}`)
        console.log(`    ${e.split("\n").slice(0, 6).join("\n    ")}`)
      }
    }
  } finally {
    chrome.kill()
  }

  if (failures.length) {
    console.log(`\n  ${failures.length} client-side ${failures.length === 1 ? "error" : "errors"}. A visitor sees these.\n`)
    process.exit(1)
  }
  console.log(`\n  ${PATHS.length} pages loaded with nothing thrown in the browser.\n`)
}

/**
 * One page, in its own tab, with the browser's own error channels open.
 *
 * `Runtime.exceptionThrown` is every uncaught throw and every unhandled
 * rejection. `Log.entryAdded` adds what the platform itself reports: a script
 * that 404s, a CSP refusal, a failed fetch. Between them there is nothing a
 * visitor would see in their console that does not reach here.
 */
async function visit(browserWsUrl, url) {
  const ws = new WebSocket(browserWsUrl)
  await once(ws, "open")

  let id = 0
  const pending = new Map()
  const errors = []
  let status = null
  let sessionId = null

  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg.result ?? {})
      pending.delete(msg.id)
      return
    }
    if (msg.method === "Runtime.exceptionThrown") {
      const d = msg.params?.exceptionDetails ?? {}
      const text = d.exception?.description || d.exception?.value || d.text || "Uncaught exception"
      errors.push(String(text))
    }
    if (msg.method === "Log.entryAdded") {
      const e = msg.params?.entry ?? {}
      /**
       * Only what a visitor's page is actually broken by. A console.error a
       * developer left behind is noise; a script that failed to load, a
       * blocked request and a security refusal are not.
       */
      if (e.level === "error" && /network|security|javascript/i.test(e.source ?? "")) {
        errors.push(`${e.source}: ${e.text}${e.url ? ` (${e.url})` : ""}`)
      }
    }
    if (msg.method === "Network.responseReceived" && msg.params?.type === "Document") {
      if (status === null) status = msg.params.response?.status ?? null
    }
  })

  const send = (method, params = {}, session = sessionId) =>
    new Promise((resolve) => {
      const n = ++id
      pending.set(n, resolve)
      ws.send(JSON.stringify({ id: n, method, params, ...(session ? { sessionId: session } : {}) }))
    })

  const { targetId } = await send("Target.createTarget", { url: "about:blank" }, null)
  const attached = await send("Target.attachToTarget", { targetId, flatten: true }, null)
  sessionId = attached.sessionId

  await send("Runtime.enable")
  await send("Log.enable")
  await send("Network.enable")
  await send("Page.enable")
  await send("Page.navigate", { url })

  /**
   * A client-side crash happens during hydration, which is AFTER the HTML has
   * arrived and after load fires. Waiting on load alone reports a clean page
   * and then it goes blank a moment later, which is exactly the failure mode
   * this is here to catch. So: settle, then read the DOM.
   */
  await sleep(6_000)

  const { result } = await send("Runtime.evaluate", {
    expression: "document.body ? document.body.innerText.slice(0, 4000) : ''",
    returnByValue: true,
  })
  const crashed = NEXT_CRASH.test(String(result?.value ?? ""))

  await send("Target.closeTarget", { targetId }, null)
  ws.close()
  return { errors, crashed, status }
}

function once(target, type) {
  return new Promise((resolve, reject) => {
    target.addEventListener(type, resolve, { once: true })
    target.addEventListener("error", reject, { once: true })
  })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
