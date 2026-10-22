/**
 * ===========================================================================
 *  A LIVE WEBSITE OVER THE NETWORK: WHERE ITS FIRST BYTE GOES, AND WHO HOLDS IT
 * ===========================================================================
 *   node scripts/check-live-speed.mjs https://andrewrullz.storelib.com
 *   node scripts/check-live-speed.mjs --runs 5 --paths /,/products/hat,/collections/all <origin>
 *
 * Asks a published website for its front page, a product page and a
 * collection page (found from the front page's links unless --paths names
 * them) the way four visitors arrive, each through curl so the times are the
 * network's own:
 *
 *   cold       an address nobody asked for yet (a probe query of its own):
 *              the CDN has nothing, so this is the server's answer, drawn or
 *              held (x-storelib-held)
 *   warm       the same address again a moment later: the CDN's copy
 *   returning  a visitor who came before: Storelib's tracker ids, the
 *              consent choice, analytics and a theme app's cookie. Held and
 *              public like a stranger's since Oct 21 (lib/storelib-theme/
 *              compat/anonymous-cache.ts pageCookie)
 *   cart       a visitor with a cart: drawn for them, private
 *
 * and prints, per request, DNS, connect, TLS, first byte and total in ms,
 * the bytes, Cache-Control, x-vercel-cache, Age and x-storelib-held. Then it
 * checks what the code promises and says plainly what it did not see; it
 * never rounds a miss into a pass. Exits 1 on a failed check.
 *
 * curl, so the agent proxy and its CA work as they do for every other tool.
 * For what a phone draws after the bytes arrive, use
 * scripts/check-live-first-load.mjs on the same address.
 */
import { execFileSync } from "node:child_process"

const args = process.argv.slice(2)
const option = (name, fallback) => {
  const i = args.indexOf(name)
  if (i < 0) return fallback
  const v = args[i + 1]
  args.splice(i, 2)
  return v
}
const runs = Math.max(1, Number(option("--runs", "3")))
const pathsArg = option("--paths", "")
const origin = (args[0] ?? "").replace(/\/+$/, "")
if (!/^https?:\/\//.test(origin)) {
  console.error("Usage: node scripts/check-live-speed.mjs [--runs N] [--paths /,/products/x,/collections/y] <https://site>")
  process.exit(2)
}

const PHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
const RETURNING = "_ga=GA1.1.1.1; materia_visitor=v_probe; sl_asid=s_probe; storelib_consent=2.p0.a1.probe; __kla_id=probe; recently_viewed=probe"
const CART = "sl_theme_cart="
const MARK = "\n@@probe@@"
const FORMAT = `${MARK}%{http_code} %{time_namelookup} %{time_connect} %{time_appconnect} %{time_starttransfer} %{time_total} %{size_download} %{size_header}`

/** One request: the timings in ms, the bytes, the headers that say who answered, and the body when asked for. */
function ask(url, { cookie, body = false } = {}) {
  const argv = ["-sS", "--compressed", "-D", "-", "-o", body ? "-" : "/dev/null", "-w", FORMAT, "-H", `user-agent: ${PHONE}`, "-H", "accept: text/html,application/xhtml+xml", "-H", "sec-fetch-dest: document", "-H", "sec-fetch-mode: navigate"]
  if (cookie) argv.push("-H", `cookie: ${cookie}`)
  argv.push(url)
  let raw
  try {
    raw = execFileSync("curl", argv, { encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "pipe"] })
  } catch (e) {
    return { url, error: String(e.stderr || e.message).trim().split("\n")[0] }
  }
  const at = raw.lastIndexOf(MARK)
  const [code, dns, connect, tls, ttfb, total, size] = raw.slice(at + MARK.length).trim().split(" ").map(Number)
  const text = raw.slice(0, at)
  /* The last header block is the answer's (a redirect followed would leave more than one; we follow none). */
  const split = text.search(/\r?\n\r?\n/)
  const head = split < 0 ? text : text.slice(0, split)
  const header = (n) => head.match(new RegExp(`^${n}:\\s*(.*)$`, "im"))?.[1]?.trim() ?? ""
  const ms = (s) => Math.round(s * 1000)
  return {
    url,
    code,
    dns: ms(dns),
    connect: ms(connect),
    tls: ms(tls),
    ttfb: ms(ttfb),
    total: ms(total),
    kb: Math.round(size / 1024),
    cache: header("cache-control"),
    vercel: header("x-vercel-cache"),
    age: header("age"),
    held: header("x-storelib-held"),
    location: header("location"),
    body: body && split >= 0 ? text.slice(split).replace(/^\s+/, "") : "",
  }
}

const probe = () => `_probe=${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
const withProbe = (path) => `${origin}${path}${path.includes("?") ? "&" : "?"}${probe()}`

/* The pages to ask for: as named, or the front page and the first product and collection it links to. */
let paths = pathsArg ? pathsArg.split(",").map((p) => p.trim()).filter(Boolean) : null
if (!paths) {
  const front = ask(`${origin}/`, { body: true })
  if (front.error) {
    console.error(`${origin}/ did not answer: ${front.error}`)
    process.exit(1)
  }
  const links = [...front.body.matchAll(/href="(\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(?:products|collections)\/[^"?#]+)"/gi)].map((m) => m[1])
  paths = ["/", links.find((l) => /\/products\//.test(l)), links.find((l) => /\/collections\//.test(l) && !/\/products\//.test(l))].filter(Boolean)
}

const median = (xs) => {
  const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : NaN
}
const row = (label, r) =>
  r.error
    ? `  ${label.padEnd(10)} error: ${r.error}`
    : `  ${label.padEnd(10)} ${String(r.code).padEnd(4)} dns ${String(r.dns).padStart(4)}  connect ${String(r.connect).padStart(4)}  tls ${String(r.tls).padStart(4)}  ttfb ${String(r.ttfb).padStart(5)}  total ${String(r.total).padStart(5)}  ${String(r.kb).padStart(5)} KB  ${r.vercel || "-"}${r.age ? ` age ${r.age}` : ""}${r.held ? `  held ${r.held}` : ""}  [${r.cache || "no cache-control"}]`

let failedChecks = 0
const check = (label, ok, detail) => {
  if (!ok) failedChecks++
  console.log(`    ${ok ? "ok  " : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`)
}

console.log(`${origin}, ${runs} run${runs > 1 ? "s" : ""} of each, times in ms\n`)
for (const path of paths) {
  console.log(path)
  const seen = { cold: [], warm: [], returning: [], cart: [] }
  for (let i = 0; i < runs; i++) {
    const coldUrl = withProbe(path)
    const cold = ask(coldUrl)
    const warm = ask(coldUrl)
    const returning = ask(withProbe(path), { cookie: RETURNING })
    const cart = ask(withProbe(path), { cookie: CART })
    for (const [k, r] of Object.entries({ cold, warm, returning, cart })) {
      seen[k].push(r)
      console.log(row(k, r))
    }
  }
  const ok = (rs) => rs.filter((r) => !r.error)
  const ttfb = (k) => median(ok(seen[k]).map((r) => r.ttfb))
  console.log(`  median first byte: cold ${ttfb("cold")}, warm ${ttfb("warm")}, returning ${ttfb("returning")}, cart ${ttfb("cart")}`)
  const cold = ok(seen.cold)
  const warm = ok(seen.warm)
  const returning = ok(seen.returning)
  const cart = ok(seen.cart)
  if (!cold.length) {
    check("the page answered", false, seen.cold[0]?.error)
    continue
  }
  if (cold.every((r) => r.code >= 300 && r.code < 400)) {
    check("the page answered (it redirects; ask its new address)", false, cold[0].location)
    continue
  }
  const isPublic = (r) => /\bpublic\b/.test(r.cache) && /s-maxage=\d+/.test(r.cache)
  check("a stranger's page may be held by the CDN (public, s-maxage)", cold.every(isPublic), cold.map((r) => r.cache).join(" | "))
  check("  and the same address a moment later comes from the CDN", warm.every((r) => /^(HIT|STALE)$/i.test(r.vercel)), warm.map((r) => r.vercel || "no x-vercel-cache").join(" "))
  /* An imported theme's page says whether the server drew it or handed on a held copy; a Storelib theme's page is held by Next itself and says nothing. */
  if (cold.some((r) => r.held)) console.log(`    info  server copies on a cold CDN: ${cold.map((r) => r.held || "-").join(" ")} (hit: held, miss: drawn now)`)
  check("a returning visitor's page is held and public too", returning.every(isPublic), returning.map((r) => r.cache).join(" | "))
  check("a visitor with a cart gets a page of their own (private)", cart.every((r) => /\bprivate\b/.test(r.cache)), cart.map((r) => r.cache).join(" | "))
  console.log("")
}

console.log(failedChecks ? `${failedChecks} check${failedChecks > 1 ? "s" : ""} failed` : "every check passed")
process.exitCode = failedChecks ? 1 : 0
