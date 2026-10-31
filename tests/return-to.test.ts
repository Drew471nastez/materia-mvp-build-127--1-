/**
 * ===========================================================================
 *  THE RETURN TARGET IS NOT AN OPEN REDIRECT
 * ===========================================================================
 * Sign-in accepts "come back here afterwards" so a shopper who left a
 * creator's site to make an account lands back on it. An unchecked one of
 * those turns the platform's sign-in page into a laundering service for
 * somebody else's link, so every shape that has been used to smuggle one
 * past a check is executed here rather than reasoned about.
 */
import { readFileSync } from "node:fs"
import { isAbsoluteTarget, safeReturnTarget, PLATFORM_HOST_LABELS } from "../lib/auth/return-to"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`) }
}

const rules = { mainDomain: "storelib.com", allowedHosts: ["shop.example.com"] }
const ok = (v: unknown) => safeReturnTarget(v, rules)

const NUL = String.fromCharCode(0)
const TAB = String.fromCharCode(9)
const NEWLINE = String.fromCharCode(10)

function main() {
  console.log("\n  ours is allowed")

  check("a path on the platform", ok("/library") === "/library")
  check("a path with a query", ok("/library?tab=downloads") === "/library?tab=downloads")
  check("the platform itself", ok("https://storelib.com/library") !== null)
  check("the platform's own hosts", ok("https://www.storelib.com/x") !== null && ok("https://help.storelib.com/articles/a") !== null && ok("https://app.storelib.com/") !== null)
  check("a custom domain the caller vouched for", ok("https://shop.example.com/cart") !== null)

  console.log("\n  everything else is refused")

  check("another site", ok("https://evil.com") === null)
  /*
    Changed on purpose (round rel-security, F7): a creator's subdomain used to
    be allowed. Published sites live there and run model written code, so a
    sign in on storelib.com could hand a person to a fake password page on
    evil.storelib.com.
  */
  check("a creator's subdomain (a published site anybody can build)", ok("https://andrew.storelib.com/cart") === null && ok("https://evil.storelib.com/login") === null)
  check("  nor a deeper name under a platform host", ok("https://evil.help.storelib.com/") === null && ok("https://help.evil.storelib.com/") === null)
  {
    const proxy = readFileSync("proxy.ts", "utf8")
    const m = /const EXCLUDED_SUBDOMAINS = \[([^\]]*)\]/.exec(proxy)
    const listed = (m?.[1] ?? "").split(",").map((s) => s.trim().replace(/^"|"$/g, "")).map((s) => (s === "MCP_HOST_LABEL" ? "mcp" : s)).filter((s) => s && s !== "localhost")
    check("  the platform hosts are exactly proxy.ts's reserved names", listed.length > 0 && listed.slice().sort().join() === [...PLATFORM_HOST_LABELS].sort().join(), listed.join())
  }
  check("a protocol-relative address", ok("//evil.com") === null)
  check("a backslash protocol-relative address", ok("/" + "\\" + "evil.com") === null)
  check("credentials that make it look like ours", ok("https://storelib.com@evil.com/") === null)
  check("a host that merely ends in our name", ok("https://notstorelib.com/") === null)
  check("a host that merely contains our name", ok("https://storelib.com.evil.com/") === null)
  check("a script URL", ok("javascript:alert(1)") === null)
  check("a data URL", ok("data:text/html,hello") === null)
  check("plain http to a real host", ok("http://storelib.com/library") === null)
  check("a custom domain the caller did NOT vouch for", ok("https://other.example.com/") === null)
  check("nothing", ok("") === null && ok(null) === null && ok(undefined) === null)
  check("something that is not a string", ok(42) === null && ok({}) === null)
  check("a newline hidden in it", ok("/library" + NEWLINE + "https://evil.com") === null)
  check("a tab hidden in it", ok("/lib" + TAB + "rary") === null)
  check("a null byte", ok("/library" + NUL) === null)
  check("something absurdly long", ok("/" + "a".repeat(4000)) === null)

  console.log("\n  and the caller can tell which kind it got")

  check("a path stays in the document", isAbsoluteTarget("/library") === false)
  check("a URL leaves it", isAbsoluteTarget("https://andrew.storelib.com/cart") === true)

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
