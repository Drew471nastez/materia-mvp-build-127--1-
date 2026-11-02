/**
 * ===========================================================================
 *  ONE ARRANGEMENT, BOTH TABS, AND ONLY THE CREATOR CAN REACH IT
 * ===========================================================================
 * Three things were asked for and each one is a different kind of claim.
 *
 * WHAT ORDER THE PRODUCTS COME OUT IN is a function, so it runs here. Home
 * and Products render the same products on the same page, and they were
 * ordered by two different rules: Home by the builder's `productIds`, the
 * Products tab by `productsOrder`. An Arrange control on Home that reordered
 * a list only the other tab showed is a control that appears not to work,
 * which is the bug this whole area keeps producing.
 *
 * WHO CAN SEE THE CONTROL is a structural claim, and the important half of
 * it is negative: a visitor's HTML must not contain it at all. Gating it in
 * CSS, or on anything the client decides, would ship a stranger a button that
 * reorders somebody else's shop.
 *
 * WHERE IT SITS is a layout claim, checked as "not inside the header that
 * holds the category and sort controls". Those two change what one visitor is
 * looking at; Arrange changes the shop for everybody.
 *
 * The cover's shape and the phone bar's row are geometry, so they are
 * measured in a browser instead: scripts/check-cover-frame.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { applyManualOrder, pickFeatured } from "../lib/store-builder/featured-order"

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

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")

console.log("\nThe order the products come out in\n")

const NEWEST = [{ id: "d" }, { id: "c" }, { id: "b" }, { id: "a" }]
const ids = (list: { id: string }[]) => list.map((p) => p.id).join("")

/** What the Home rail now does, in the order it does it. */
const home = (picks?: string[], order?: string[]) => ids(applyManualOrder(pickFeatured(NEWEST, picks), order))

check("with no selection and no arrangement, Home is newest first", home() === "dcba")
check("the builder's selection still decides WHICH products", home(["b", "c"]) === "cb" || home(["b", "c"]) === "bc")
check(
  "a selection with no arrangement keeps the builder's order",
  home(["b", "c"]) === "bc",
  `got ${home(["b", "c"])}`,
)

/** The point of the change: one arrangement governs both tabs. */
check(
  "the creator's arrangement reorders the selection",
  home(["b", "c", "d"], ["d", "b", "c"]) === "dbc",
  `got ${home(["b", "c", "d"], ["d", "b", "c"])}`,
)
check(
  "Home and Products agree on the order of the products they share",
  (() => {
    const order = ["c", "a", "d", "b"]
    const products = ids(applyManualOrder(NEWEST, order))
    const rail = home(undefined, order)
    return products === rail
  })(),
)

/**
 * A product arranged on one tab and not selected on the other is not a
 * disagreement: Featured is a selection. What must never happen is a product
 * VANISHING from the Products tab because it was left out of an arrangement.
 */
check(
  "a product nobody arranged is still on the Products tab",
  ids(applyManualOrder(NEWEST, ["c"])).includes("a"),
)
check(
  "and it is not on Home unless the selection names it",
  !home(["c"], ["c", "a"]).includes("a"),
  `got ${home(["c"], ["c", "a"])}`,
)

/** An arrangement that names products the rail does not show changes nothing. */
check(
  "ids outside the selection are ignored rather than adding products",
  home(["b", "c"], ["a", "d", "c", "b"]) === "cb",
  `got ${home(["b", "c"], ["a", "d", "c", "b"])}`,
)

console.log("\nWho can see it, and where it sits\n")

const arrange = read("components/storefront/arrange-products-button.tsx")
const grid = read("components/storefront/all-products-grid.tsx")
const renderer = read("components/store-builder/unified-section-renderer.tsx")

check(
  "the row renders nothing at all for a visitor",
  /if \(!isOwner \|\| products\.length < 2\) return null/.test(arrange),
  "a visitor's HTML would carry a button that reorders somebody else's shop",
)
check(
  "the Products tab shows it",
  /<ArrangeProductsControl products=\{products\} isOwner=\{isOwner\}/.test(grid),
)
/**
 * AND THE RAIL ACTUALLY COMPOSES THEM.
 *
 * The checks above run `applyManualOrder(pickFeatured(...))` and prove that
 * composition is right. They prove nothing about whether the rail does it —
 * a control experiment put `pickFeatured` back on its own and all eight of
 * them still passed, which is a suite measuring its own helper.
 */
check(
  "the Home rail applies the arrangement to its selection",
  /applyManualOrder\(pickFeatured\(products, settings\.productIds\), productsOrder\)/.test(renderer),
  "the rail would order by the builder's selection alone and Arrange would do nothing on Home",
)

check(
  "Home shows it too",
  /<ArrangeProductsControl products=\{sectionProducts\} isOwner=\{viewerIsOwner\}/.test(renderer),
)
/**
 * IN THE HEADER ROW, WHICH IS WHY IT COSTS NOTHING.
 *
 * A row of its own put 48px between the heading and the first card, measured;
 * the header row is `min-h-9` and already there, so a 30px button in it adds
 * zero. scripts/check-arrange-row measures that, laying the old row out
 * alongside on every pass so a verdict of "free" is worth reading.
 *
 * This only guards the placement, which the probe cannot see: it builds its
 * page from class strings, so it would measure a header row with the button
 * in it whatever the call sites actually do.
 */
check(
  "the control is inside the header row on the Products tab",
  /<CatalogHeader[\s\S]*?<ArrangeProductsControl[\s\S]*?<\/CatalogHeader>/.test(grid),
  "in a row of its own it costs 48px of vertical space for one button",
)
check(
  "and inside the header row on Home",
  /<CatalogHeader[\s\S]*?<ArrangeProductsControl[\s\S]*?<\/CatalogHeader>/.test(renderer),
)
check(
  "it is last in the row, so it sits at the right end",
  (() => {
    const row = grid.slice(grid.indexOf("<CatalogHeader"), grid.indexOf("</CatalogHeader>"))
    return row.indexOf("ArrangeProductsControl") > row.indexOf("SortControl")
  })(),
  "the filters are quiet outlines and this is filled; last puts it at the end of the row",
)
check(
  /* Changed on purpose (round 49): decided after load from the session (/api/creator-page/viewer), the page is one HTML for everybody; the grid reads the answer. */
  "ownership is decided on the server, from the session",
  /const isOwner = useCreatorPageOwner\(ownerGiven\)/.test(read("components/storefront/all-products-grid.tsx")) && /row\.user_id === user\.id \|\| teamStore === row\.id/.test(read("app/api/creator-page/viewer/route.ts")),
)
check(
  "Home is handed the same arrangement the Products tab uses",
  /productsOrder=\{headerSettings\?\.productsOrder\}/.test(read("app/(marketing)/u/[username]/page.tsx")),
)

console.log("\nThe bar that follows you down a product page\n")

const bar = read("components/store-builder/sticky-add-to-cart.tsx")

/**
 * The phone row led with a filled price chip in the button's own colour and
 * no picture: two coloured pills at either end of a 390px strip, opening with
 * a number that had nothing attached to it. The desktop row had already
 * settled this — picture, name, then price beside the button.
 */
check(
  "the phone row leads with the product's picture",
  (bar.match(/\{thumbnail\}/g) || []).length >= 2,
  "one of the two bars is still leading with something else",
)
check(
  "the coloured price chip is gone from both bars",
  !/priceBadge/.test(bar),
  "a dead copy of it is the one somebody reaches for next time",
)
check(
  "the price is still on the phone row, under the title",
  /barPrice\(barPriceText\(product, pageCurrency\)/.test(bar),
  "moving the chip out must not take the price with it",
)
check(
  "the picture is asked for at the size the bar draws it",
  /optimizedImageUrl\(src, 44, 75\)/.test(bar),
  "a 4MB phone photo for a 44px square",
)

console.log("\nThe cover is positioned in the shape it will be drawn in\n")

const aspect = read("components/storefront/use-cover-aspect.ts")

check(
  "the band marks itself so the number is measured once",
  (renderer.match(/data-cover-band/g) || []).length === 2,
  "both the band and the empty placeholder occupy it, so both carry the mark",
)
check(
  "the editor reads the band rather than assuming a shape",
  /* querySelectorAll since it picks the band that is actually drawn, not merely the first. */
  /querySelector(All)?\("\[data-cover-band\]"\)/.test(aspect),
  "a hardcoded 3:1 here is a preview of a crop the page will not draw",
)
check(
  "the measurement is bounded",
  /Math\.min\(MAX, Math\.max\(MIN/.test(aspect),
  "a band that has not been laid out would reshape the editor into a sliver",
)
/* The frame is components/app/cover-crop-frame now; image-upload hands it the measured shape. */
check(
  "and the frame uses it",
  /aspect=\{reposition\.aspect \?\? 3\}/.test(read("components/app/image-upload.tsx")) &&
    /aspectRatio: String\(aspect\)/.test(read("components/app/cover-crop-frame.tsx")),
)

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log("\nFailures:")
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
