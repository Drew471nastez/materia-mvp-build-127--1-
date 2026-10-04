/**
 * ===========================================================================
 *  A PRODUCT CARD NAVIGATES ON THE CLIENT, NOT BY RELOADING THE DOCUMENT
 * ===========================================================================
 * "I click a product and nothing happens for three seconds and then the page
 * appears." Nothing happening is correct behaviour for what it was doing: a
 * bare <a> hands the browser a new document, the browser waits for a
 * force-dynamic page to render, and the first thing it can paint is the
 * finished page. No prefetch, and `loading.tsx` never reached either, because
 * a loading boundary only exists inside a client navigation.
 *
 * SmartLink already routed internal links through next/link. It decided
 * "internal" with `href.startsWith("/")`, and product cards do not link that
 * way: getProductUrl returns the full address, because the same string is
 * also what gets copied, shared and put in metadata. So the one link type
 * that most needed prefetching was the one type that never got it.
 *
 * The rule is about ORIGIN, and it is worth a test rather than a read,
 * because getting it slightly too generous is not a slow page — it is this
 * app's shell wrapped around a page it does not serve.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
const failures: string[] = []

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}

/**
 * THE REAL FUNCTION, IMPORTED. An earlier draft lifted it out of the
 * component with a regex and `new Function`, which this repository has
 * already been bitten by once: that tests a transcription rather than the
 * code, and it falls over the moment the function is TypeScript or delegates
 * to anything. It lives in lib/url-helpers now, where the rest of the URL
 * logic is and where a test can just call it.
 */
import { toSameOriginPath } from "../lib/url-helpers"

const source = readFileSync(join(process.cwd(), "components/smart-link.tsx"), "utf8")

console.log("\nWhat counts as a link this app can route")

check("a plain path is itself", toSameOriginPath("/u/andrew") === "/u/andrew")
check(
  "the product card's own absolute address becomes a path",
  toSameOriginPath("https://storelib.com/andrewrullz/tech-house-drum-kit-vol-i") ===
    "/andrewrullz/tech-house-drum-kit-vol-i",
  String(toSameOriginPath("https://storelib.com/andrewrullz/tech-house-drum-kit-vol-i")),
)
check("www is the same site", toSameOriginPath("https://www.storelib.com/p/thing") === "/p/thing")
check(
  "the query and the hash survive, or ?layout=discover is lost",
  toSameOriginPath("https://storelib.com/a/b?layout=discover&recommended=1#reviews") ===
    "/a/b?layout=discover&recommended=1#reviews",
  String(toSameOriginPath("https://storelib.com/a/b?layout=discover&recommended=1#reviews")),
)

console.log("\nand what does not, however much it looks like it")

/* A creator's subdomain is a different origin serving a different page. */
check("a creator subdomain stays a real link", toSameOriginPath("https://andrew.storelib.com/p/x") === null)
/* A creator's own domain is somebody else's site. */
check("a custom domain stays a real link", toSameOriginPath("https://negruw.shop/p/x") === null)
check("another site stays a real link", toSameOriginPath("https://example.com/p/x") === null)
/**
 * The one that matters most: a host ENDING in the main domain is not the main
 * domain. "storelib.com.evil.test" ends with the string and is not this site.
 */
check("a lookalike host is not this site", toSameOriginPath("https://storelib.com.evil.test/x") === null)
check("a nonsense href is not a crash", toSameOriginPath("mailto:a@b.c") === null)
check("an empty href is nothing", toSameOriginPath(undefined) === null)

console.log("\nand SmartLink uses it")
check(
  "the internal test is the origin one, not startsWith('/')",
  /const internalPath = toSameOriginPath\(href\)/.test(source) &&
    !/const internal = !!resolvedHref && resolvedHref\.startsWith\("\/"\)/.test(source),
)
check("a routable link renders next/link", /if \(internalPath && !needsHardNav\)[\s\S]{0,200}<Link/.test(source))
/* The builders and /app are a different layout and auth context. */
check(
  "the builders and the app still reload",
  /internalPath\.startsWith\("\/app"\)/.test(source) && /internalPath\.startsWith\("\/account\/library"\)/.test(source),
)

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
