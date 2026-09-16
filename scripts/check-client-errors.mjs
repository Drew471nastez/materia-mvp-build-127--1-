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
 *
 * ---------------------------------------------------------------------------
 * THIS GATE EXISTED AND THE CRASH SHIPPED ANYWAY. THREE REASONS, ALL FIXED.
 * ---------------------------------------------------------------------------
 * A `const` shadowing an import put every page in the product behind its
 * error boundary — the home page, every creator page, every product page —
 * and this file, whose entire job is to catch that, reported four pages green
 * while it happened.
 *
 * 1. IT WAS GRADING A CERTIFICATE WARNING. Outbound HTTPS here goes through a
 *    proxy that re-terminates TLS, and Chromium was started with no proxy and
 *    no trust for it, so every navigation landed on Chromium's own "Privacy
 *    error" page. Nothing throws on that page, so the run passed. Measured:
 *    the same flags this file used returned `<title>Privacy error</title>`.
 *
 * 2. NOTHING MADE THAT IMPOSSIBLE. "No errors" was the whole pass condition,
 *    so any page that never loaded passed. A run now FAILS unless the main
 *    document came back with a real HTTP status, which is the difference
 *    between "nothing was wrong" and "nothing was looked at".
 *
 * 3. IT DID NOT KNOW WHAT THIS APP'S CRASH LOOKS LIKE. It matched Next's
 *    default sentence. Storelib replaced that with its own boundary long ago,
 *    and a caught error does not reach `Runtime.exceptionThrown` — React
 *    handles it — so the boundary's own words were the only signal there was,
 *    and nothing was looking for them. They are read out of lib/client-errors
 *    now rather than copied, so the two cannot drift.
 */

import { execFileSync, spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const BASE = (process.env.BASE ?? "https://storelib.com").replace(/\/$/, "")

/**
 * The pages a visitor actually lands on. A crash on any of them is a crash.
 *
 * The first four were the whole list, and the pages that broke were none of
 * them: a creator page, a product page and the creator page editor. A handle
 * is needed to name the last three, so it is a variable with a default rather
 * than a fixture — HANDLE=someone to point the run at a different creator.
 */
const HANDLE = process.env.HANDLE ?? "andrewrullz"
const PRODUCT = process.env.PRODUCT ?? "men-s-white-t-shirt"
const DEFAULT_PATHS = [
  "/",
  "/discover",
  "/login",
  "/signup",
  `/${HANDLE}`,
  `/${HANDLE}/links`,
  `/${HANDLE}/${PRODUCT}`,
  "/creator-page",
]
const PATHS = (process.env.PATHS ?? DEFAULT_PATHS.join(",")).split(",").map((p) => p.trim()).filter(Boolean)

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  BEING ABLE TO REACH THE SITE AT ALL
 * ═══════════════════════════════════════════════════════════════════════════
 * Outbound HTTPS in this environment goes through a proxy that re-terminates
 * TLS. Chromium reads neither the proxy setting nor the CA bundle the rest of
 * the tooling uses, so without these two flags every navigation ends on
 * Chromium's own certificate warning — a page with no errors on it, which is
 * why this gate used to pass while the whole site was down.
 *
 * The second flag is a PIN, not a blanket. It names the SHA-256 of one public
 * key — the proxy CA this environment documents at /root/.ccr — so anything
 * not signed by that key is still rejected exactly as before.
 *
 * Both are skipped when there is no proxy, so a normal machine and CI are
 * unaffected.
 */
function reachabilityFlags() {
  const flags = []
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy
  if (!proxy) return flags
  flags.push(`--proxy-server=${proxy}`)
  for (const ca of ["/root/.ccr/agent-proxy-ca.crt", "/root/.ccr/ca-bundle.crt"]) {
    if (!existsSync(ca)) continue
    try {
      const der = execFileSync("openssl", ["x509", "-in", ca, "-pubkey", "-noout"], { encoding: "buffer" })
      const spki = createHash("sha256")
        .update(execFileSync("openssl", ["pkey", "-pubin", "-outform", "der"], { input: der }))
        .digest("base64")
      flags.push(`--ignore-certificate-errors-spki-list=${spki}`)
      break
    } catch {
      /* No openssl, or an unreadable CA: fall through and let the run fail
         loudly on the status check rather than passing on a warning page. */
    }
  }
  return flags
}

if (!existsSync(CHROMIUM)) {
  console.error(`No browser at ${CHROMIUM}. Set CHROMIUM.`)
  process.exit(1)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * WHAT A CRASH LOOKS LIKE TO A VISITOR.
 *
 * Two sentences, and the one that matters is the app's own. Storelib catches
 * render errors in its own boundary, so Next's default sentence — the only
 * thing this file used to look for — never appears, and a boundary that
 * CATCHES an error means `Runtime.exceptionThrown` never fires either. The
 * words on the screen were the only evidence there was.
 *
 * Read out of lib/client-errors rather than copied, so editing the copy
 * cannot quietly blind the gate. If the read fails the run stops: a matcher
 * that silently matches nothing is how this went unnoticed the first time.
 */
const APP_CRASH_TITLE = (() => {
  const src = readFileSync(new URL("../lib/client-errors.ts", import.meta.url), "utf8")
  /* The generic branch of describeForUser, which is every crash that is not a
     stale chunk. The stale-chunk title is a reload prompt, not a fault, and
     the function's LAST return is the generic one. Scoped to the function:
     `lastIndexOf("return {")` across the whole file found a later one in a
     different function and came back with nothing. */
  const fn = src.slice(src.indexOf("export function describeForUser"))
  const generic = fn.slice(0, fn.indexOf("\n}")).lastIndexOf("return {")
  const title = generic < 0 ? undefined : fn.slice(generic).match(/title:\s*"([^"]+)"/)?.[1]
  if (!title) {
    console.error("Could not read the error boundary's title out of lib/client-errors.ts.")
    console.error("That string is the only signal a caught render error leaves, so this gate is blind without it.")
    process.exit(1)
  }
  return title
})()

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  WHAT THE PROBE'S OWN ENVIRONMENT BREAKS, WHICH NO VISITOR EVER SEES
 * ═══════════════════════════════════════════════════════════════════════════
 * A gate that reports things nobody can act on gets ignored, and an ignored
 * gate is the same as no gate. Exactly one class is filtered here, and only
 * because it is a fact about the machine rather than about the page:
 *
 *   WebGL. Headless Chromium runs with --disable-gpu and cannot create a
 *   context, so any page with a 3D element throws here and nowhere else.
 *
 * Nothing else is filtered. In particular a chunk that fails to load is NOT
 * ignored, because in production that is a genuinely broken page — it is
 * handled by retrying instead, below.
 */
function isProbeNoise(text) {
  return /WebGL|webgl|GPU stall|Error creating WebGL context/.test(text)
}

const CRASH_SCREENS = [
  { what: "Next's client-crash screen", re: /Application error: a client-side exception has occurred/i },
  { what: `Storelib's error boundary ("${APP_CRASH_TITLE}")`, re: new RegExp(APP_CRASH_TITLE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") },
]

async function main() {
  /**
   * ═════════════════════════════════════════════════════════════════════════
   *  ITS OWN BROWSER, ON A PORT NOBODY ELSE CAN OWN
   * ═════════════════════════════════════════════════════════════════════════
   * This used to hard-code port 9333 and then fetch /json/version from it. A
   * Chromium left behind by an earlier run — killed with a timeout, which
   * does not reap the child — goes on holding that port, the new spawn fails
   * to bind and exits, and the fetch succeeds against the OLD browser. The
   * run then drives a browser it did not configure and cannot see.
   *
   * That is not hypothetical: it happened here while this very gate was being
   * fixed. The new flags printed correctly and every page still came back as
   * Chromium's certificate warning, because the browser answering on 9333 had
   * been started twenty minutes earlier without them. Four orphans were alive
   * at once.
   *
   * So: port 0, which makes Chromium choose a free one and write it into
   * DevToolsActivePort inside a user-data-dir of our own. Reading the port
   * out of the directory we just created is what makes it OUR browser, and a
   * fresh profile keeps one run from inheriting another's state.
   */
  const profile = mkdtempSync(join(tmpdir(), "storelib-client-errors-"))
  const chrome = spawn(
    CHROMIUM,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      `--user-data-dir=${profile}`,
      "--remote-debugging-port=0",
      "--remote-allow-origins=*",
      "--window-size=1280,900",
      ...reachabilityFlags(),
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  )
  let stderr = ""
  chrome.stderr.on("data", (d) => (stderr += String(d)))
  /* A timeout on the parent must not leave another orphan behind. */
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
  if (!port) {
    reap()
    console.error(`Chromium never reported a debugging port.\n${stderr.slice(-800)}`)
    process.exit(1)
  }

  let version = null
  for (let i = 0; i < 40 && !version; i++) {
    try {
      version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()
    } catch {
      await sleep(250)
    }
  }
  if (!version) {
    reap()
    console.error(`Chromium opened port ${port} and then did not answer on it.\n${stderr.slice(-800)}`)
    process.exit(1)
  }

  const failures = []
  try {
    for (const path of PATHS) {
      const url = `${BASE}${path}`
      /**
       * ═══════════════════════════════════════════════════════════════════
       *  A FAILURE HAS TO HAPPEN TWICE
       * ═══════════════════════════════════════════════════════════════════
       * Run against a real host over a real network, a page occasionally
       * reports a chunk that returned 502 and then a MIME refusal for the
       * same file. Fetched directly, that chunk is 200 application/javascript
       * every time; the 502 comes from the hop between this container and the
       * internet, under the load of a browser opening thirty requests at once.
       *
       * Ignoring chunk failures outright would be wrong — in production a
       * chunk that will not load IS a broken page, and it is a real class of
       * bug. So nothing is ignored; it just has to reproduce. A fault in the
       * code fails every time and is reported. Flake between here and the
       * host does not, and is not.
       *
       * The repeat only costs anything on a page that already looks broken.
       */
      let found = await visit(version.webSocketDebuggerUrl, url)
      if (found.errors.length > 0 || found.crashed || found.status === null) {
        const again = await visit(version.webSocketDebuggerUrl, url)
        const persisted = found.errors.filter((e) => again.errors.some((f) => sameFault(e, f)))
        found = {
          status: again.status ?? found.status,
          crashed: again.crashed && found.crashed ? found.crashed : null,
          errors: persisted,
          flaked: found.errors.length - persisted.length,
        }
        if (found.flaked > 0) {
          console.log(`\n    (${found.flaked} error${found.flaked === 1 ? "" : "s"} on ${url} did not happen again, so not reported)`)
        }
      }
      /**
       * ═══════════════════════════════════════════════════════════════════
       *  A PAGE THAT NEVER LOADED IS A FAILURE, NOT A PASS
       * ═══════════════════════════════════════════════════════════════════
       * "Nothing threw" used to be the whole condition, and nothing throws on
       * a certificate warning, a proxy error or a DNS failure either. So this
       * gate spent its life grading Chromium's own error pages and reporting
       * the site healthy — including on the day every page in the product was
       * behind its error boundary.
       *
       * The main document has to have come back with a real status. It is one
       * line, and it is the difference between "nothing was wrong" and
       * "nothing was looked at".
       */
      const unreachable =
        found.status === null
          ? "the main document never returned an HTTP status, so the browser was looking at its own error page, not at Storelib"
          : found.status >= 400
            ? `the main document returned ${found.status}`
            : null
      const bad = found.errors.length > 0 || found.crashed || unreachable
      console.log(`\n${bad ? "✗" : "ok"}  ${url}${found.status ? `  (${found.status})` : ""}`)
      if (unreachable) {
        failures.push(`${url}: ${unreachable}`)
        console.log(`    ${unreachable}`)
      }
      if (found.crashed) {
        failures.push(`${url}: the page is showing ${found.crashed}`)
        console.log(`    the page rendered ${found.crashed}`)
      }
      for (const e of found.errors) {
        failures.push(`${url}: ${e.split("\n")[0]}`)
        console.log(`    ${e.split("\n").slice(0, 6).join("\n    ")}`)
      }
    }
  } finally {
    reap()
  }

  if (failures.length) {
    console.log(`\n  ${failures.length} client-side ${failures.length === 1 ? "error" : "errors"}. A visitor sees these.\n`)
    process.exit(1)
  }
  console.log(`\n  ${PATHS.length} pages answered, rendered, and threw nothing in the browser.\n`)
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
      if (!isProbeNoise(String(text))) errors.push(String(text))
    }
    if (msg.method === "Log.entryAdded") {
      const e = msg.params?.entry ?? {}
      /**
       * Only what a visitor's page is actually broken by. A console.error a
       * developer left behind is noise; a script that failed to load, a
       * blocked request and a security refusal are not.
       */
      if (e.level === "error" && /network|security|javascript/i.test(e.source ?? "")) {
        const line = `${e.source}: ${e.text}${e.url ? ` (${e.url})` : ""}`
        if (!isProbeNoise(line)) errors.push(line)
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
  const text = String(result?.value ?? "")
  const crashed = CRASH_SCREENS.find((c) => c.re.test(text))?.what ?? null

  await send("Target.closeTarget", { targetId }, null)
  ws.close()
  return { errors, crashed, status }
}

/**
 * Two reports of the same fault.
 *
 * Compared on the message rather than the whole stack: a chunk URL carries a
 * deploy id and a line offset, and two runs of the same fault can differ in
 * both while being the same thing. The first line without its parenthesised
 * URL is what identifies it.
 */
function sameFault(a, b) {
  const key = (s) => s.split("\n")[0].replace(/\s*\(https?:\/\/[^)]*\)\s*$/, "").trim()
  return key(a) === key(b)
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
