/**
 * ===========================================================================
 *  THE TWO BARS ON A PRODUCT PAGE
 * ===========================================================================
 * A product page has a bar stuck to the top and a bar stuck to the bottom,
 * and this suite covers the four things that were wrong with them:
 *
 *   1. Both could be on screen at once. The top bar reveals on a scroll UP
 *      and the buy bar appears on the way DOWN, so scrolling up in the middle
 *      of a long page put a bar at each end around the thing being read.
 *
 *   2. The buy bar led with a coloured price chip, so the first thing in a
 *      bar that follows you down a product page was a number with no picture
 *      attached to it.
 *
 *   3. The creator's name on the page took a grey fill under the pointer —
 *      the only grey rectangle on the page, and invisible to every reader on
 *      a phone, where there is no hover at all.
 *
 *   4. The two bars across the top of the two page types had different
 *      depths: one had none and one had a shadow you could see.
 *
 * The exclusivity is the part worth running rather than reading: it is a
 * truth table over two flags published by two different components, and the
 * failure mode of getting it wrong is a buy bar that never appears on pages
 * where a creator switched the top bar off.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  isProductTopBarShown,
  setProductTopBarRendered,
  setProductTopBarRevealed,
} from "@/lib/store-builder/product-top-bar"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label + (detail ? ` — ${detail}` : ""))
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`)
  }
}

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const buyBar = read("components/store-builder/sticky-add-to-cart.tsx")
const topBar = read("components/store-builder/product-creator-bar.tsx")
const wrapper = read("components/store-builder/discover-sticky-wrapper.tsx")
const productPage = read("app/(marketing)/p/[slug]/page.tsx")
const css = read("app/globals.css")

/** Every `rgba(r, g, b, a)` alpha in a declaration, in order. */
function alphas(value: string): number[] {
  return [...value.matchAll(/rgba\([^)]*?,\s*([\d.]+)\s*\)/g)].map((m) => Number(m[1]))
}

function main() {
  console.log("\nThe two bars on a product page")

  /* ---------------------------------------------------------------------
     1. ONE BAR AT A TIME
     --------------------------------------------------------------------- */
  console.log("\n  one bar at a time")

  /* The state starts where a fresh page starts: no bar has reported in, and
     the scroll-up hook says visible because every page begins at the top. */
  check("nothing has reported a bar yet, so there is no conflict", isProductTopBarShown() === false)

  setProductTopBarRendered(true)
  check("a bar on the page, revealed, is a conflict", isProductTopBarShown() === true)

  setProductTopBarRevealed(false)
  check("scrolled down, the top bar is gone and the buy bar is free", isProductTopBarShown() === false)

  setProductTopBarRevealed(true)
  check("scrolled back up, the top bar wins again", isProductTopBarShown() === true)

  /*
    THE ONE THAT WOULD HAVE BEEN A BUG. A creator can switch the top bar off.
    On those pages `revealed` still swings with the scroll direction, because
    the hook does not know whether anything is listening — so a buy bar that
    only watched `revealed` would vanish on every upward scroll, on a page
    with no top bar to make room for.
  */
  setProductTopBarRendered(false)
  check("with the top bar switched off, scrolling up changes nothing", isProductTopBarShown() === false)
  setProductTopBarRevealed(false)
  check("and neither does scrolling down", isProductTopBarShown() === false)
  setProductTopBarRevealed(true)
  check("still nothing, at the top of the page", isProductTopBarShown() === false)

  /* Setting a flag to the value it already holds must not change the answer
     and must not notify — the getter is what a subscriber would read. */
  setProductTopBarRendered(false)
  setProductTopBarRendered(false)
  check("setting the same value again changes nothing", isProductTopBarShown() === false)

  /* And the wiring: the two publishers and the one consumer. */
  check(
    "the wrapper publishes the reveal",
    /setProductTopBarRevealed\((isNativeApp\(\) \? false : )?visible\)/.test(wrapper),
  )
  check(
    "the creator bar publishes whether it is on the page",
    /setProductTopBarRendered\(barIsOnThePage\)/.test(topBar),
  )
  check(
    "and it clears that on unmount",
    /return \(\) => setProductTopBarRendered\(false\)/.test(topBar),
  )
  check(
    "the bar counts as absent when a creator has switched it off",
    /const barIsOnThePage = settings\.visible && !hideOnMobileDiscover/.test(topBar),
  )
  /*
    AND IT IS NOT GATED ON HYDRATION, which is the check that matters here.
    `if (!isHydrated) return null` used to stand above this bar's markup, so
    the top 53px of every product page was white until React hydrated — 632ms
    of it, filmed on production. Nothing in the subtree needs the gate: every
    `window` read is inside a handler and the menu's portal is behind `open`.
    Putting it back would restore the flash, so the ban is written down.
  */
  const barBody = topBar.slice(topBar.indexOf("export function LiveProductCreatorBar"))
  check(
    "and the bar itself is never gated on hydration",
    !/^\s*if \(!isHydrated\) return null/m.test(barBody),
    "that gate keeps the bar out of the server HTML and paints white until hydration",
  )
  check(
    "the buy bar will not paint while the top bar is up",
    /isVisible && !topBarShown \? "opacity-100 translate-y-0"/.test(buyBar),
  )
  /* The hook has to be above the early return or it runs on some renders and
     not others, which is React #310 — this file has had that bug before. */
  const hookAt = topBar.indexOf("setProductTopBarRendered(barIsOnThePage)")
  const returnAt = topBar.indexOf("if (!settings.visible) return null", topBar.indexOf("export function LiveProductCreatorBar"))
  check("and its effect is declared above the early return", hookAt > 0 && returnAt > hookAt)

  /* ---------------------------------------------------------------------
     2. THE DESKTOP BUY BAR SHOWS THE THING
     --------------------------------------------------------------------- */
  console.log("\n  the desktop buy bar shows the thing")

  check("the bar can be given a picture", /thumbnail_url\?: string \| null/.test(buyBar))
  check("the page passes the one it leads with", /thumbnail_url: galleryImages\[0\] \|\| product\.thumbnail_url \|\| null/.test(productPage))
  check("and the editor's preview passes the same field", /thumbnail_url: selectedProduct\.thumbnail_url/.test(read("components/store-builder/preview-canvas.tsx")))
  check("a square with rounded corners", /h-11 w-11 shrink-0 overflow-hidden rounded-\[10px\]/.test(buyBar))
  check("through Next's optimizer, not Supabase's", /optimizedImageUrl\(src, 44, 75\)/.test(buyBar))
  check("no picture means no empty grey box", /if \(!src\) return null/.test(buyBar))

  /* The right-hand end: price, then the button. */
  const desktopRow = buyBar.slice(buyBar.indexOf('<div className="hidden sm:block py-3 px-[15px]">'))
  check("there is a desktop row to look at", desktopRow.length > 0)
  const priceAt = desktopRow.indexOf("{barPriceText(product)}")
  const buttonAt = desktopRow.indexOf("{buttonText}")
  check("the price is on the right, before the button", priceAt > 0 && buttonAt > priceAt)
  const thumbAt = desktopRow.indexOf("{thumbnail}")
  const titleAt = desktopRow.indexOf("{product.title}")
  check("the picture and the title come first", thumbAt > 0 && titleAt > thumbAt && titleAt < priceAt)
  /**
   * THE CHIP IS GONE FROM BOTH ROWS NOW, and this pin says so rather than
   * being deleted.
   *
   * The desktop row lost it first: picture, name, then price beside the
   * button. The phone row KEPT it, and this check said so — which was the
   * decision at the time and is not the decision now. A 390px strip led with
   * a filled chip in the button's own colour and no picture at all: two
   * coloured pills at either end, opening with a number that had nothing
   * attached to it, while the desktop bar two breakpoints up opened with the
   * product.
   *
   * So the phone row gets the picture too, and the price moves under the
   * title. What this pin protects is unchanged — the chip does not come back
   * on either row, and the price does not go missing with it.
   */
  check("the chip is not on the desktop row any more", !desktopRow.slice(0, priceAt).includes("priceBadge"))
  check("nor on the phone row", !/priceBadge/.test(buyBar))
  check("the phone row leads with the picture", /\{thumbnail\}\n\s*<div className="min-w-0">/.test(buyBar))
  check("and still says the price, under the title", /barPrice\(barPriceText\(product\)/.test(buyBar))

  /* Five stars became one; the count is still there. */
  check("one star, not five", !/\[1, 2, 3, 4, 5\]\.map/.test(buyBar))
  check("with the average and the count", /\{average > 0 \? average\.toFixed\(1\) : "5\.0"\}/.test(buyBar) && /\(\{count\}\)/.test(buyBar))

  /* ---------------------------------------------------------------------
     2b. THE BUY CARD FOLLOWS THE PAGE DOWN, AND THEN STOPS
     --------------------------------------------------------------------- */
  console.log("\n  the buy card stays where it is")

  /*
    IT WAS STICKY FOR THREE ROUNDS AND IS NOT ANY MORE.

    Sticking needed three things that had nothing to do with the card itself:
    the column stretched so there was somewhere to travel, the questions moved
    into a grid row of their own so the travel had an end, and the creator bar
    publishing its own measured height so the card could pin clear of it. All
    three are guarded here, because a `sticky` nobody meant is not a crash —
    the page renders, everything passes, and a card quietly starts following
    the reader down the page again.

    scripts/check-buy-card.mjs is the measurement in a browser; these are the
    lines it depends on.
  */
  check("the card carries no position class", /className="rounded-xl border p-6 shadow-sm relative z-20"/.test(productPage))
  check("nothing in the page is sticky at a bar's height", !/sticky top-\[calc\(var\(--product-topbar-h/.test(productPage))
  check("and its column is not stretched", !/lg:self-stretch/.test(productPage))
  check("the grid still aligns its columns to the top", /lg:items-start/.test(productPage))

  /* The questions went back where they were. */
  check("the questions are inside the left column again", /<div className="mt-8 sm:mt-10" data-faq-section>/.test(productPage))
  check("so one thing spans three columns, not two", (productPage.match(/className="lg:col-span-3 min-w-0 w-full"/g) || []).length === 1)

  /* And the bar stopped measuring itself for a card that no longer reads it. */
  check("the bar no longer publishes its height", !/setProductTopBarHeight/.test(topBar))
  check("nor observes itself for it", !/new ResizeObserver\(measure\)/.test(topBar))
  const store = read("lib/store-builder/product-top-bar.ts")
  check("and the store no longer offers it", !/setProductTopBarHeight|HEIGHT_VAR/.test(store))
  /* What the store IS still for: the two bars not showing at once. */
  check("it still answers whether the top bar is showing", /export function useProductTopBarShown/.test(store))

  /* The card names what it is selling, above the price. */
  check(
    "the buy card leads with the product's title",
    /<h1\s+className="mb-2 text-\[35px\] font-semibold leading-snug break-words"[\s\S]{0,160}\{product\.title\}/.test(productPage),
  )

  /*
    THE TITLE IS SAID ONCE PER WIDTH. It was said twice on a desktop: a 30px
    <h1> under the gallery and the card's line a column to the right, the same
    words twice on one screen. The big one is `lg:hidden` now and the card's
    is the <h1> from `lg` up, so exactly one of the two is in the
    accessibility tree at any width and the page keeps a single heading.
  */
  check("the title under the gallery stops at lg", /className="text-2xl sm:text-3xl font-semibold break-words flex-1 min-w-0 lg:hidden"/.test(productPage))
  check("and the card's is a heading, not a label", !/<p[^>]*>\s*\n?\s*\{product\.title\}/.test(productPage.replace(/\{\/\*[\s\S]*?\*\/\}/g, "")))
  /*
    Two in the source, one rendered at any width — counted on source with the
    JSX comments taken out. The note above the gallery's heading says the word
    "<h1>" in prose, and a count that does not strip comments matched THAT and
    ran 300 characters to the tag below it, reporting one heading where there
    are two. Stripped source is for COUNTING only; every index below is taken
    from the real thing, because an offset into stripped source points at the
    wrong place in the file.
  */
  const withoutComments = productPage.replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  const titleHeadings = (withoutComments.match(/<h1[\s\S]{0,300}?\{product\.title\}/g) || []).length
  check("two headings in the source, one per breakpoint", titleHeadings === 2, `found ${titleHeadings}`)

  /*
    THE NAME LEADS AND THE PRICE ANSWERS IT, and it took three rounds of
    moving them past each other to get there. 14/30, then 20/36, then 24/30 —
    every one of those put the title UNDER the price, where a title reads as
    a caption on a number. 35/24 now: the product's name is the biggest line
    on the card, which is the size it was as the heading under the gallery
    before it moved here. scripts/check-product-titles.mjs measures both.
  */
  /* 36px, less the one pixel that was asked for. */
  check("the title is 35px", /className="mb-2 text-\[35px\] font-semibold leading-snug break-words"/.test(productPage))
  check("the price is 24px, under it", /className="text-2xl font-bold tracking-tight"/.test(productPage))
  check("and neither of the sizes the price has already been", !/text-(3xl|4xl) font-bold tracking-tight/.test(productPage))

  /*
    THE DISCOUNT SHARES THE PRICE'S ROW. The old price and the % OFF badge
    were a second line underneath, which made a discount read as a footnote
    to the price rather than as part of it. Both cards say it the same way.
    scripts/check-product-titles.mjs measures the overlap; a class can say
    `flex` and still stack.
  */
  check("both price rows are one row", (productPage.match(/flex flex-wrap items-baseline gap-x-3 gap-y-1/g) || []).length === 2)
  check("and nothing pushes the discount onto its own line", !/className="mt-1 flex items-center gap-2"/.test(productPage))
  const cardAt = productPage.indexOf('className="rounded-xl border p-6 shadow-sm relative z-20"')
  const cardTitleAt = productPage.indexOf("{product.title}", cardAt)
  const cardPriceAt = productPage.indexOf("{headerPrice.main}", cardAt)
  check("above the price rather than under it", cardAt > 0 && cardTitleAt > cardAt && cardPriceAt > cardTitleAt)

  /* ---------------------------------------------------------------------
     3. A CHEVRON, NOT A GREY FILL
     --------------------------------------------------------------------- */
  console.log("\n  a chevron, not a grey fill")

  check("the grey fill is gone from the product page", !/hover:bg-muted\/50/.test(productPage))
  check("both creator rows carry the chevron", (productPage.match(/creator-link-arrow/g) || []).length === 2)
  check("and both are marked as the link", (productPage.match(/className="creator-link /g) || []).length === 2)
  check("it is there before anybody hovers", /\.creator-link-arrow \{[^}]*opacity: 0\.45/.test(css))
  check("hover is guarded, so a phone does not get a stuck state", /@media \(hover: hover\) \{\s*\.creator-link:hover \.creator-link-arrow/.test(css))
  check("the arrow moves in the direction it points", /\.creator-link:hover \.creator-link-arrow \{[^}]*transform: translateX\(2px\)/.test(css))
  check("and a press is acknowledged without a hover", /\.creator-link:active \{[^}]*opacity: 0\.72/.test(css))
  check("reduced motion turns the movement off", /prefers-reduced-motion[\s\S]{0,120}\.creator-link-arrow \{ transition: none \}/.test(css))

  /* ---------------------------------------------------------------------
     4. ONE DEPTH, AND LESS OF IT
     --------------------------------------------------------------------- */
  console.log("\n  one depth, and less of it")

  const depth = css.match(/--bar-depth:\s*([^;]+);/)
  check("there is one depth, defined once", !!depth)
  const depthValue = depth ? depth[1] : ""
  check("the creator page's bar has it", /\.subscribe-bar-border \{[\s\S]*?box-shadow: var\(--bar-depth\)/.test(css))
  check("and the product page's bar points at the same one", /boxShadow: isDarkBackground \? "var\(--bar-depth-dark\)" : "var\(--bar-depth\)"/.test(topBar))
  /* A slate shadow under a dark bar is lighter than the bar and reads as a
     halo; the dark bars get black instead. Both are still one definition. */
  check("with a darker one for a dark bar", /--bar-depth-dark:\s*0 1px 2px rgba\(0, 0, 0/.test(css))
  check("and the creator page's dark bar uses it too", /\.subscribe-bar-border-dark \{[\s\S]*?box-shadow: var\(--bar-depth-dark\)/.test(css))
  check("nothing is left holding its own copy", !/boxShadow: "0 1px 2px rgba\(15, 23, 42/.test(topBar))

  /*
    IT WENT DOWN. These are the numbers the product bar carried before, read
    off the commit that introduced them. Every part of the new value has to be
    smaller, or "reduce its depth just very little" did not happen.
  */
  const BEFORE = "0 1px 2px rgba(15, 23, 42, 0.05), 0 8px 24px -16px rgba(15, 23, 42, 0.28)"
  const before = alphas(BEFORE)
  const after = alphas(depthValue)
  check("two shadow layers, as before", after.length === 2, `got ${after.length}`)
  check(
    `the contact shadow is fainter (${before[0]} → ${after[0]})`,
    after[0] < before[0],
  )
  check(
    `the spread shadow is fainter (${before[1]} → ${after[1]})`,
    after[1] < before[1],
  )
  /* And smaller, not just paler: a wider blur at a lower alpha can read as
     more, not less. */
  const blurBefore = Number((BEFORE.match(/,\s*0 \d+px (\d+)px -/) || [])[1])
  const blurAfter = Number((depthValue.match(/,\s*0 \d+px (\d+)px -/) || [])[1])
  check(`and its blur is smaller (${blurBefore}px → ${blurAfter}px)`, blurAfter < blurBefore)

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main()
