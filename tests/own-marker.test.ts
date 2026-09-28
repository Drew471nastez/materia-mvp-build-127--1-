/**
 * ===========================================================================
 *  THE MARKER ROUTE, RUN RATHER THAN READ
 * ===========================================================================
 * tests/analytics-collection.test.ts proves the tracker leaves a marked
 * browser out, and that the app's links carry the hand-off. This runs the
 * route in the middle, the one on the site's own host, and reads what it
 * actually answers: the status, the address it lands on, and the cookie it
 * leaves, header by header.
 *
 * Each check below is a property the hand-off depends on:
 *
 *   the token never survives into the address bar, so a creator cannot copy
 *   or share one by accident; the cookie is this host's alone and cannot be
 *   read from a page; a token this server did not sign leaves no cookie and
 *   still lands on the page, because a visitor who follows such a link
 *   should see the site, not an error; `to` cannot leave this host; and a
 *   marker cannot be replayed as a hand-off.
 */
process.env.ANALYTICS_OWN_SECRET = process.env.ANALYTICS_OWN_SECRET || "storelib-tests-own-marker-key"

import { NextRequest } from "next/server"
import { GET } from "../app/api/analytics/own/route"
import { OWN_MARKER_COOKIE, marksOwner, signOwnHandoff, signOwnMarker } from "../lib/analytics/own-marker"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}${detail !== undefined ? ` (${JSON.stringify(detail)})` : ""}`) }
}

const ANA = "aaaaaaaa-0000-4000-8000-000000000001"
const BEE = "bbbbbbbb-0000-4000-8000-000000000002"
const HOST = "https://ana.storelib.com"

const ask = (query: string) => GET(new NextRequest(new Request(`${HOST}/api/analytics/own${query}`)))
const cookieOf = (res: Response) => {
  const raw = res.headers.get("set-cookie") ?? ""
  const found = raw.match(new RegExp(`${OWN_MARKER_COOKIE}=([^;]+)`))
  return { raw, value: found ? decodeURIComponent(found[1]) : "" }
}

async function main() {
  console.log("\nThe creator arrives at their own site and the host marks the browser")
  {
    const res = await ask(`?t=${encodeURIComponent(String(signOwnHandoff(ANA)))}&to=${encodeURIComponent("/about?ref=x")}`)
    const location = res.headers.get("location") ?? ""
    check("it lands on the page that was asked for, on this same host", res.status === 303 && location === `${HOST}/about?ref=x`, { status: res.status, location })
    check("  with no token left in the address", !/[?&]t=/.test(location), location)
    check("  answered fresh every time, and never indexed", res.headers.get("cache-control") === "no-store" && res.headers.get("x-robots-tag") === "noindex")

    const { raw, value } = cookieOf(res)
    check("the marker is this host's alone: no domain, so it reaches no other host", raw.length > 0 && !/Domain=/i.test(raw), raw.slice(0, 120))
    check("  and no page can read it", /HttpOnly/i.test(raw) && /SameSite=lax/i.test(raw) && /Path=\/(;|$)/i.test(raw))
    check("  it names the creator it was minted for, and no other", marksOwner(value, ANA) && !marksOwner(value, BEE))
  }

  console.log("\nAnything else still lands on the page, and marks nobody")
  {
    for (const [what, query] of [
      ["no token at all", "?to=%2Fabout"],
      ["a token that is not one", "?t=notatoken&to=%2Fabout"],
      ["a token signed by nobody", `?t=${Buffer.from(JSON.stringify({ k: "hand", c: ANA, e: Date.now() + 60_000 })).toString("base64url")}.00`],
      ["a hand-off long past", `?t=${encodeURIComponent(String(signOwnHandoff(ANA, Date.now() - 60 * 60_000)))}&to=%2Fabout`],
      ["a marker played back as a hand-off", `?t=${encodeURIComponent(String(signOwnMarker(ANA)))}&to=%2Fabout`],
    ] as const) {
      const res = await ask(query)
      check(`${what}: the page opens, with no marker`, res.status === 303 && !res.headers.get("set-cookie"), { status: res.status, cookie: res.headers.get("set-cookie") })
    }
  }

  console.log("\nThe way back is a path on this host and nothing else")
  {
    const token = () => encodeURIComponent(String(signOwnHandoff(ANA)))
    for (const [what, to] of [
      ["another site", "//evil.example/x"],
      ["another scheme", "https://evil.example/x"],
      ["a backslash a browser reads as a slash", "/\\evil.example"],
      ["nothing at all", ""],
    ] as const) {
      const res = await ask(`?t=${token()}&to=${encodeURIComponent(to)}`)
      check(`${what} is refused, and the root is opened`, res.headers.get("location") === `${HOST}/`, res.headers.get("location"))
    }
    const kept = await ask(`?t=${token()}&to=${encodeURIComponent("/shop/tote?size=l")}`)
    check("a path of its own is kept whole", kept.headers.get("location") === `${HOST}/shop/tote?size=l`, kept.headers.get("location"))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
  process.exit(0)
}

void main()
