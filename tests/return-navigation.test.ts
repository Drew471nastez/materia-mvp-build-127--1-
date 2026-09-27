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
  ["app/library/products/[id]/page.tsx", "Library"],
  ["app/library/my-downloads/page.tsx", "Library"],
  ["app/library/wishlist/page.tsx", "Library"],
  ["app/library/settings/buyer-settings.tsx", "Library"],
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
  /* An order opens over the Orders list rather than on a route of its own
     (app/app/orders/orders-client.tsx). Its back arrow has the same duty as
     a ReturnLink: when the order was opened from the list, it pops that
     entry instead of pushing the list again. */
  const orders = read("app/app/orders/orders-client.tsx")
  check("an order's back arrow pops the entry it pushed", /if \(pushed\.current\) window\.history\.back\(\)/.test(orders))
  check("  and opening one pushes exactly one entry", /writeAddress\(\(p\) => p\.set\("order", id\), "push"\)/.test(orders))
  check("the old order address still lands on the order", /redirect\(`\/app\/orders\?order=/.test(read("app/app/orders/[id]/page.tsx")))

  /*
    BACK TO A LIST LANDS NOTHING. Emails first, then Orders, Products and
    Coupons: a list that comes back exactly as it was left asks the stage for
    no landing (lib/ui/app-navigation holdLanding), so the whole page does not
    fade in and rise 2px on every Back. Decided on the first render, while
    the return is still marked, and only on a return: a visit still lands.
    scripts/check-lists-back.mjs measures it frame by frame.
  */
  for (const [file, returning] of [
    ["app/app/emails/emails-client.tsx", /const \[returning\] = React\.useState\(\(\) => isTraversing\(\)\)/],
    ["app/app/orders/orders-client.tsx", /const \[returning\] = React\.useState\(\(\) => isTraversing\(\)\)/],
    ["app/app/products/products-client.tsx", /const \[returning\] = useState\(isReturning\)/],
    ["app/app/coupons/coupons-client.tsx", /const \[returning\] = useState\(isReturning\)/],
  ] as const) {
    const src = read(file)
    check(`${file}: a return is the list as it was, with no landing`,
      returning.test(src) && /(React\.)?useLayoutEffect\(\(\) => \{\s*if \(returning\) holdLanding\(\)\s*\}, \[returning\]\)/.test(src))
  }
  check("  and the stage lands nothing while a page holds it", /isLandingHeld\(\)\) return/.test(read("components/app/app-stage.tsx")))

  /* The reported one specifically: it was an <a href>, which is a full
     document load AS WELL AS a push. */
  const checkout = read("app/checkout/checkout-client.tsx")
  check(
    "the checkout's control is no longer a bare anchor",
    !/<a href=\{productUrl\}/.test(checkout),
    "an <a href> is a document load and a push",
  )
  /*
    The checkout's own receipt used to carry a "Back to product" ReturnLink
    and was listed above. There is one receipt page now (/receipt/<token>),
    and the checkout REPLACES itself with it, so the entry behind a receipt
    is the product the buyer came from and the browser's own back returns
    there. The old address only forwards.
  */
  check(
    "a finished checkout replaces itself with the receipt rather than pushing it",
    /router\.replace\(receiptHref\(receiptToken\)\)/.test(checkout) &&
      /const receiptHref = \(receiptToken: string\) => `\/receipt\/\$\{encodeURIComponent\(receiptToken\)\}`/.test(checkout) &&
      !/router\.push\(`\/checkout\/receipt/.test(checkout),
    "a push leaves the paid checkout behind the receipt, one back away",
  )
  check(
    "and the old checkout receipt address forwards to the one receipt",
    /redirect\(`\/receipt\/\$\{token\}`\)/.test(read("app/checkout/receipt/page.tsx")) &&
      !existsSync(join(process.cwd(), "app/checkout/receipt/checkout-receipt-client.tsx")),
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
  /*
    ═══════════════════════════════════════════════════════════════════════
     EVERY BUY CONTROL, NOT THE ONES I HAPPENED TO LOOK AT
    ═══════════════════════════════════════════════════════════════════════
    The first pass at this fixed two call sites and declared the job done. It
    was wrong: the search that found them was piped through `head -5` and the
    list was truncated, so smart-buy-button and buy-button — the two that
    actually render "Get for Free" on a product page — were never seen. The
    journey was re-measured on production afterwards, the referrer was still
    the product URL at the checkout step, and that is what exposed it.

    So this does not name files. It scans for the shape.
  */
  const BUY_FILES = [
    "components/store-builder/sticky-add-to-cart.tsx",
    "components/checkout/buy-button.tsx",
    "components/checkout/smart-buy-button.tsx",
  ]
  for (const f of BUY_FILES) {
    const src = read(f)
    const hard = (src.match(/^\s*window\.location\.href = checkoutUrl/gm) ?? []).length
    check(`${f} does not reload the page to reach checkout`, hard === 0, `${hard} left`)
    /* carryTouches only adds the visit's touches on a host other than storelib.com (lib/attribution/browser). */
    check(`  and pushes on the client instead`, /router\.push\(carryTouches\(checkoutUrl\)\)/.test(src))
  }
  /*
    ONE HARD NAVIGATION IS KEPT ON PURPOSE. The downloads link crosses to the
    canonical host from a creator subdomain, and a client navigation cannot
    change origin.
  */
  check(
    "the cross-origin one is still a document load",
    /window\.location\.assign\(new URL\("\/library\/my-downloads", canonical\)/.test(
      read("components/store-builder/sticky-add-to-cart.tsx"),
    ),
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
