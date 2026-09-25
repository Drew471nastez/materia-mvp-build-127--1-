/**
 * lib/api/public-fetch.ts: fetching an address somebody else typed, as the
 * theme export does for every picture and video a creator's pages point at.
 *
 * Written as the attacks they are: the cloud metadata address, loopback in
 * every spelling a URL parser accepts, a name that resolves to loopback, a
 * public address that redirects inward, and a body with no length that
 * would fill the function's memory.
 *
 *   npx esbuild tests/public-fetch.test.ts --bundle --platform=node --format=cjs \
 *     --alias:@=. --alias:server-only=/tmp/claude-0/empty.js --outfile=/tmp/t.cjs && node /tmp/t.cjs
 */
import http from "node:http"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { AddressInfo } from "node:net"

import { fetchPublic, isPrivateAddress, publicLookup, publicUrlProblem } from "../lib/api/public-fetch"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else { failed++; failures.push(name) }
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
}
function section(t: string) { console.log(`\n${t}`) }

async function refused(p: Promise<unknown>): Promise<string | null> {
  try {
    await p
    return null
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}

async function main() {
  // ═══════════════════════════════════════════════════════════════════════
  section("Private addresses, in every spelling")
  // ═══════════════════════════════════════════════════════════════════════
  for (const a of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "::", "fe80::1", "fd00::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:a9fe:a9fe", "64:ff9b::a9fe:a9fe", "2002:7f00:1::", "not an address"]) {
    check(`${a} is private`, isPrivateAddress(a))
  }
  for (const a of ["8.8.8.8", "104.18.0.1", "172.32.0.1", "192.0.1.1", "2606:4700::1111", "::ffff:808:808"]) {
    check(`${a} is public`, !isPrivateAddress(a))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("URLs refused before anything is asked")
  // ═══════════════════════════════════════════════════════════════════════
  const shape: [string, boolean][] = [
    ["https://cdn.example.com/a.png", true],
    ["http://images.example.org/a.jpg", true],
    ["https://cdn.example.com:443/a.png", true],
    ["http://169.254.169.254/latest/meta-data/x.png", false],
    ["http://[::ffff:127.0.0.1]/x.png", false],
    ["http://2130706433/x.png", false],
    ["http://0x7f000001/x.png", false],
    ["http://localhost/x.png", false],
    ["http://db.internal/x.png", false],
    ["http://intranet/x.png", false],
    ["https://cdn.example.com:8443/a.png", false],
    ["https://user:pass@cdn.example.com/a.png", false],
    ["file:///etc/passwd", false],
    ["gopher://cdn.example.com/a.png", false],
    ["not a url", false],
  ]
  for (const [url, ok] of shape) check(`${url} is ${ok ? "allowed" : "refused"}`, (publicUrlProblem(url) === null) === ok, publicUrlProblem(url))

  // ═══════════════════════════════════════════════════════════════════════
  section("The address is checked as it is connected to")
  // ═══════════════════════════════════════════════════════════════════════
  const lookedUp = await new Promise<unknown>((resolve) => publicLookup("localhost", {}, (err: unknown) => resolve(err)))
  check("a name that resolves to loopback is refused by the socket's own lookup", (lookedUp as { code?: string } | null)?.code === "EPRIVATE", lookedUp)

  // ═══════════════════════════════════════════════════════════════════════
  section("Redirects and size, against a server on this machine")
  // ═══════════════════════════════════════════════════════════════════════
  const hits: string[] = []
  const inner = http.createServer((req, res) => { hits.push(`inner ${req.url}`); res.end("secret") })
  const outer = http.createServer((req, res) => {
    hits.push(`outer ${req.url}`)
    if (req.url === "/away.png") { res.writeHead(302, { location: `http://127.0.0.1:${(inner.address() as AddressInfo).port}/meta.png` }); res.end(); return }
    if (req.url === "/big.png") {
      res.writeHead(200, { "content-type": "image/png" })
      const chunk = Buffer.alloc(64 * 1024, 1)
      let sent = 0
      const pump = () => { while (sent < 40 && res.write(chunk)) sent++; if (sent < 40) res.once("drain", pump); else res.end() }
      pump()
      return
    }
    if (req.url === "/told.png") { res.writeHead(200, { "content-length": String(5_000_000) }); res.end(); return }
    res.writeHead(200, { "content-type": "image/png" })
    res.end(Buffer.from([137, 80, 78, 71]))
  })
  await new Promise<void>((r) => inner.listen(0, "127.0.0.1", () => r()))
  await new Promise<void>((r) => outer.listen(0, "127.0.0.1", () => r()))
  const base = `http://127.0.0.1:${(outer.address() as AddressInfo).port}`
  const trust = { trustOrigins: [base], maxBytes: 1_000_000, timeoutMs: 5000 }

  check("an untrusted local server is never asked", !!(await refused(fetchPublic(`${base}/a.png`, { maxBytes: 1000 }))) && !hits.some((h) => h.startsWith("outer /a.png")))
  const ok = await fetchPublic(`${base}/a.png`, trust)
  check("a trusted origin answers like fetch", ok.status === 200 && (await ok.arrayBuffer()).byteLength === 4 && ok.headers.get("content-type") === "image/png")
  const away = await refused(fetchPublic(`${base}/away.png`, trust))
  check("a redirect to a private address is refused, and the inner server never asked", !!away && /Refused/.test(away) && !hits.some((h) => h.startsWith("inner")), away)
  const big = await refused(fetchPublic(`${base}/big.png`, trust))
  check("a body with no length stops at the limit", big === "larger than allowed", big)
  const told = await refused(fetchPublic(`${base}/told.png`, trust))
  check("a body that says it is too big is not read", told === "larger than allowed", told)

  inner.close()
  outer.close()

  // ═══════════════════════════════════════════════════════════════════════
  section("The theme export uses it")
  // ═══════════════════════════════════════════════════════════════════════
  const route = readFileSync(join(process.cwd(), "app/api/website-builder/themes/[installId]/export/route.ts"), "utf8")
  check("every media download goes through fetchPublic, within the file's own limit", /await fetchPublic\(url, \{ maxBytes: MAX_BYTES\[type\.kind\]/.test(route) && !/await fetch\(url\)/.test(route))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

void main()
