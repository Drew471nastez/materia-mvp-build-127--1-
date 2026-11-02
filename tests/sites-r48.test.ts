/**
 * ===========================================================================
 *  ROUND 48: LIVE WEBSITES UNDER A SPIKE, AND AN IMPORTED THEME'S SCRIPTS
 * ===========================================================================
 *   HOST       a connected domain's lookup: one read per host however many
 *              visitors ask at once, served stale while it refreshes, kept
 *              through a failed read (lib/website-builder/held-lookup.ts,
 *              proxy.ts resolveCustomDomain)
 *   STRANGERS  an imported theme's page for strangers arriving together:
 *              one draw, not one per visitor (lib/storelib-theme/compat/
 *              stranger-hold.ts)
 *   ONCE       the same deferred theme script written twice runs once
 *              (lib/storelib-theme/compat/script-order.ts)
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import * as nextCache from "../scripts/speed18/shims/next-cache"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else {
    failed++
    failures.push(name)
  }
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${!ok && detail !== undefined ? `   (${JSON.stringify(detail)})` : ""}`)
}
const section = (s: string) => console.log(`\n${s}`)
const code = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const tick = () => new Promise((r) => setTimeout(r, 0))

async function host() {
  section("A connected domain's lookup (held-lookup.ts)")
  const { heldLookup } = await import("@/lib/website-builder/held-lookup")
  const held = heldLookup<string | null>({ freshMs: 60_000, staleMs: 600_000, max: 3 })
  let reads = 0
  let release: (v: { value: string | null; failed: boolean }) => void = () => {}
  const slow = () => {
    reads++
    return new Promise<{ value: string | null; failed: boolean }>((r) => (release = r))
  }
  const crowd = Array.from({ length: 200 }, () => held.get("www.shop.com", slow, 0))
  release({ value: "maya", failed: false })
  const answers = await Promise.all(crowd)
  check("200 visitors at once on a cold server: one read", reads === 1, { reads })
  check("and all 200 get its answer", answers.every((a) => a.value === "maya" && !a.failed))

  const fresh = await held.get("www.shop.com", slow, 30_000)
  check("inside the minute: no read", reads === 1 && fresh.value === "maya")

  const stale = held.get("www.shop.com", slow, 61_000)
  const staleAgain = held.get("www.shop.com", slow, 61_500)
  const [s1, s2] = await Promise.all([stale, staleAgain])
  check("past the minute: the held answer at once, with one refresh behind", s1.value === "maya" && s2.value === "maya" && reads === 2, { reads })
  release({ value: "lena", failed: false })
  await tick()
  const after = await held.get("www.shop.com", slow, 62_000)
  check("the refresh's answer is the next visitor's", after.value === "lena" && reads === 2, after)

  const failing = () => {
    reads++
    return Promise.resolve({ value: null, failed: true })
  }
  const blink = await held.get("www.shop.com", failing, 62_000 + 60_000 + 600_001)
  check("a failed read past the stale window keeps the last answer (a blink is not 'not connected')", blink.value === "lena" && !blink.failed, blink)
  const cold = await held.get("www.never.com", failing, 0)
  check("a failed read with nothing held says failed (the proxy's 'One moment')", cold.failed && cold.value === null)
  const thrown = await held.get("www.throws.com", () => Promise.reject(new Error("socket")), 0)
  check("a read that throws is a failed read", thrown.failed)

  for (const h of ["a", "b", "c", "d"]) await held.get(h, () => Promise.resolve({ value: h, failed: false }), 0)
  const before = held.reads
  await held.get("a", () => Promise.resolve({ value: "a", failed: false }), 1)
  check("at most `max` hosts held: the oldest let go first", held.reads === before + 1)

  const proxy = code("proxy.ts")
  check("the proxy asks it for every connected domain", /const domainHeld = heldLookup<ConnectedDomain \| null>\(\{ freshMs: 60_000, staleMs: 10 \* 60_000/.test(proxy) && /await domainHeld\.get\(key, \(\) => resolveCustomDomainFresh\(host\)\)/.test(proxy))
  check("and still says 'unavailable' when nothing could be read", /return answer\.failed \? "unavailable" : answer\.value/.test(proxy))
}

async function strangers() {
  section("Strangers arriving together on an imported theme's page (stranger-hold.ts)")
  const { heldStrangerPage, strangerKey } = await import("@/lib/storelib-theme/compat/stranger-hold")
  nextCache.resetCache()
  let draws = 0
  const draw = async () => {
    draws++
    await new Promise((r) => setTimeout(r, 20))
    return { status: 200, headers: [["content-type", "text/html"]] as [string, string][], body: "<p>page</p>", share: true }
  }
  const key = strangerKey("maya", ["~anon~maya.storelib.com~US~_~_"], "", true)
  const pages = await Promise.all(Array.from({ length: 50 }, () => heldStrangerPage(key, ["published-site:c1"], draw)))
  check("50 strangers at once on a cold server: one draw", draws === 1, { draws })
  check("every one gets the page", pages.every((p) => p.status === 200 && p.body === "<p>page</p>"))
  check("one says it drew, the rest that they were handed it", pages.filter((p) => !p.held).length === 1)

  nextCache.resetCache()
  let mine = 0
  const own = async () => {
    mine++
    await new Promise((r) => setTimeout(r, 10))
    return { status: 200, headers: [["set-cookie", "x=1"]] as [string, string][], body: `mine ${mine}`, share: false }
  }
  const privateKey = strangerKey("maya", ["~anon~maya.storelib.com~US~_~_", "x"], "")
  const answers = await Promise.all(Array.from({ length: 5 }, () => heldStrangerPage(privateKey, ["published-site:c1"], own)))
  check("a page that may not be shared is still drawn for each visitor", mine === 5 && answers.every((a) => !a.held), { mine })
}

async function once() {
  section("The same deferred theme script, once (script-order.ts)")
  const { calmerScripts } = await import("@/lib/storelib-theme/compat/script-order")
  const a = `<script src="/api/site-theme/assets/i/h-1/product-offers.js" defer="defer"></script>`
  const page = `<!doctype html><html><head>${a}</head><body><div>one</div>${a}<div>two</div><script src="/api/site-theme/assets/i/h-1/product-offers.js" defer></script></body></html>`
  const out = calmerScripts(page)
  check("two later copies dropped", out.dropped === 2 && (out.html.match(/product-offers\.js/g) ?? []).length === 1, out.dropped)
  check("the first copy, in the head, stays where it was", out.html.indexOf("product-offers.js") < out.html.indexOf("<body>"))
  check("the page's markup is otherwise untouched", out.html === `<!doctype html><html><head>${a}</head><body><div>one</div><div>two</div></body></html>`, out.html)

  const own = `<!doctype html><html><head></head><body>${a}<script src="/api/site-theme/assets/i/h-1/product-offers.js" defer data-section="b"></script></body></html>`
  check("a copy with an attribute of its own stays", calmerScripts(own).dropped === 0)
  const blocking = `<!doctype html><html><head></head><body><script src="/x.js"></script><p>a</p><script src="/x.js"></script></body></html>`
  check("blocking copies are never dropped (each ran with a different page read so far)", calmerScripts(blocking).html.match(/\/x\.js/g)?.length === 2)
  const asyncCopies = `<!doctype html><html><head></head><body><script src="/y.js" async></script><script src="/y.js" async></script></body></html>`
  check("async copies stay", calmerScripts(asyncCopies).dropped === 0)
  const withText = `<!doctype html><html><head></head><body>${a}<script src="/api/site-theme/assets/i/h-1/product-offers.js" defer="defer">/* x */</script></body></html>`
  check("a copy with text between its tags stays", calmerScripts(withText).dropped === 0)
  const kept = `<!doctype html><html data-storelib-scripts="as-written"><head></head><body>${a}${a}</body></html>`
  check("a theme that keeps its scripts as written keeps both", calmerScripts(kept).dropped === 0)
  const caseOnly = `<!doctype html><html><head></head><body><script src="/A.js" defer></script><script src="/a.js" defer></script></body></html>`
  check("addresses that differ only in case are two files", calmerScripts(caseOnly).dropped === 0)
  const route = code("app/api/site-theme/site/[username]/[[...path]]/route.ts")
  check("the live page says how many it dropped (X-Storelib-Scripts once=)", /once=\$\{scripts\.dropped\}/.test(route))
}

async function main() {
  await host()
  await strangers()
  await once()
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

void main()
