/**
 * ===========================================================================
 *  A CONTROL THAT NAMES WHERE YOU CAME FROM MUST RETURN, NOT TRAVEL
 * ===========================================================================
 * Reported: open a product, press buy, press "Back to product" on the
 * checkout, then press the product page's own back arrow — and you land on
 * the checkout instead of where you started.
 *
 * Reproduced on production by reading history.length at each step:
 *
 *     explore                2
 *     product                3
 *     checkout               4
 *     "Back to product"      5   <- a push; a return leaves it at 4
 *     the product's back     5   -> lands on /checkout
 *
 * The product page's arrow was never broken. It popped exactly one entry, and
 * the entry behind it was the checkout, because the checkout's own control was
 * `<a href={productUrl}>` — a link, and a link PUSHES. History had become
 *
 *     explore -> product -> checkout -> product
 *
 * so one back is the checkout. Every "Back to <the page you just left>" in the
 * product has the same shape and the same fault.
 */
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/** Surfaces whose control names the page behind it. */
const RETURNS: Array<[string, string]> = [
  ["app/checkout/checkout-client.tsx", "Back to product"],
  ["app/checkout/receipt/checkout-receipt-client.tsx", "Back to product"],
  ["app/library/products/[id]/page.tsx", "Library"],
  ["app/library/my-downloads/page.tsx", "Library"],
  ["app/library/wishlist/page.tsx", "Library"],
  ["app/library/settings/buyer-settings.tsx", "Library"],
  ["app/app/orders/[id]/page.tsx", "Back to Orders"],
]

function main() {
  console.log("\nReturn controls return")

  /* ---------------------------------------------------------------------
     THE PRIMITIVE
     --------------------------------------------------------------------- */
  console.log("\n  one control, and it is still a link")

  const rl = read("components/navigation/return-link.tsx")
  check("ReturnLink exists", /export function ReturnLink/.test(rl))
  check("it renders a real next/link", /<Link href=\{href\} onClick=\{handleClick\}/.test(rl))
  /*
    Middle-click, ctrl-click, a context menu and the keyboard all need the
    href, and so does a visitor who arrived from a shared URL with nothing
    behind them. Only the plain left-click is intercepted.
  */
  check(
    "every click but a plain left one is left to the browser",
    /e\.button !== 0 \|\| e\.metaKey \|\| e\.ctrlKey \|\| e\.shiftKey \|\| e\.altKey/.test(rl),
  )
  check("a handler that already acted is respected", /if \(e\.defaultPrevented\) return/.test(rl))
  check("and it only pops when the entry behind is that page", /if \(!canReturnTo\(href\)\) return/.test(rl))
  check("then it is a real back", /window\.history\.back\(\)/.test(rl))

  /* ---------------------------------------------------------------------
     THE QUESTION IT ASKS
     --------------------------------------------------------------------- */
  console.log("\n  it asks which page is behind, not merely whether one is")

  const hist = read("lib/navigation/in-app-history.ts")
  check("canReturnTo exists", /export function canReturnTo\(href: string\): boolean/.test(hist))
  /*
    canReturnInApp answers "is one of ours back there". A button that says
    "Back to product" is making the stronger claim, and only the stronger one
    justifies pressing back.
  */
  check("it builds on canReturnInApp rather than replacing it", /if \(!canReturnInApp\(\)\) return false/.test(hist))
  check("it compares the path", /return prev === target/.test(hist))
  check(
    "and falls back to the referrer only on a hard load",
    /const prev = previousPath\(\)\s*\n\s*if \(prev !== null\) return prev === target/.test(hist),
    "the referrer is reliable exactly when this document has made no navigations",
  )
  check("the trail is bounded", /TRAIL_LIMIT/.test(hist) && /trail\.shift\(\)/.test(hist))
  check("a pop unwinds it", /export function notePopNavigation\(\) \{[\s\S]*?trail\.pop\(\)/.test(hist))

  const tracker = read("components/platform/app-history-tracker.tsx")
  check("the tracker records the path it leaves", /noteClientNavigation\(lastPath\.current\)/.test(tracker))
  check("and keeps it in step on a pop", /notePopNavigation\(\)\s*\n\s*lastPath\.current = pathname/.test(tracker))

  /* ---------------------------------------------------------------------
     EVERY SURFACE THAT HAD THE FAULT
     --------------------------------------------------------------------- */
  console.log("\n  no return control is a plain link any more")

  for (const [file, label] of RETURNS) {
    if (!existsSync(join(process.cwd(), file))) { check(`${file} exists`, false); continue }
    const src = read(file)
    check(`${file} uses ReturnLink`, /<ReturnLink/.test(src), `for "${label}"`)
    check(`  and imports it`, /from "@\/components\/navigation\/return-link"/.test(src))
  }
  /* The reported one specifically: it was an <a href>, which is a full
     document load AS WELL AS a push. */
  const checkout = read("app/checkout/checkout-client.tsx")
  check(
    "the checkout's control is no longer a bare anchor",
    !/<a href=\{productUrl\}/.test(checkout),
    "an <a href> is a document load and a push",
  )

  /* ---------------------------------------------------------------------
     AND NOTHING THROWS THE DOCUMENT AWAY TO REACH A ROUTE WE OWN
     --------------------------------------------------------------------- */
  console.log("\n  buying does not reload the page")

  /*
    The counter that lets a back arrow know there is something behind it is a
    module variable, so a hard navigation resets it to zero. Buying was
    `window.location.href = checkoutUrl` — a full document load to a route in
    this same app — and coming back from the checkout afterwards, the product
    page could no longer prove it had anywhere to return to and pushed the
    creator page instead of going back to the marketplace.

    Measured on production, the referrer says which navigations were hard:

        explore -> product    referrer ""             client
        product -> checkout   referrer <the product>  DOCUMENT LOAD
        back to product       referrer ""             counter gone
  */
  const buy = read("components/store-builder/sticky-add-to-cart.tsx")
  const hardCheckout = (buy.match(/^\s*window\.location\.href = checkoutUrl/gm) ?? []).length
  check("neither buy handler reloads the page", hardCheckout === 0, `${hardCheckout} left`)
  check("both navigate on the client", (buy.match(/router\.push\(checkoutUrl\)/g) ?? []).length === 2)
  /*
    ONE HARD NAVIGATION IS KEPT ON PURPOSE. The downloads link crosses to the
    canonical host from a creator subdomain, and a client navigation cannot
    change origin.
  */
  check(
    "the cross-origin one is still a document load",
    /window\.location\.assign\(new URL\("\/library\/my-downloads", canonical\)/.test(buy),
    "a client navigation cannot move between hosts",
  )

  /* ---------------------------------------------------------------------
     AND THE ONES THAT ARE CORRECTLY LINKS
     --------------------------------------------------------------------- */
  console.log("\n  a destination is still a destination")

  /*
    NOT EVERY ARROW IS A RETURN. "Back to log in" on a signup page, and a
    404's "Back to the home page", name somewhere the visitor has NOT been —
    pressing back there would take them somewhere else entirely. They stay
    links, and this records that it was a decision rather than an oversight.
  */
  for (const f of ["app/not-found.tsx", "app/(auth)/request/page.tsx"]) {
    if (!existsSync(join(process.cwd(), f))) continue
    check(`${f} keeps a plain link`, !/<ReturnLink/.test(read(f)))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
