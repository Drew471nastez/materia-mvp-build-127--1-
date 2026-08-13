/**
 * ===========================================================================
 *  THE DESKTOP HOME PAGE
 * ===========================================================================
 *
 * It was a banner, a recommended grid, a pill rail and a browse grid — four
 * sections, three of them the same hundred listings in a different order, and
 * none of them different on a second visit. On a marketplace whose whole
 * proposition is "there is one of these and somebody near you has it", showing
 * an identical grid twice is the surface admitting it has not been paying
 * attention.
 *
 * Run with:  npm run test:push
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"

import { stripComments } from "./_source"
import { signalsFrom, type RecentView } from "../lib/marketplace/recent-views"

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
    console.log(`  FAIL  ${name}${detail ? `\n${detail}` : ""}`)
  }
}

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
/** Comments are not code. Several files here quote the exact pattern they were
 *  written to remove — the setInterval that was replaced, the invented metric
 *  that is not on the page — and a guard that reads them fails on the prose
 *  explaining the fix. */
const code = (p: string) => stripComments(read(p))

const home = read("components/explore/home/desktop-home.tsx")
/**
 * The file returns TWO layouts and every guard below that reasons about ORDER
 * has to say which one it means. A stranger and a member are answering
 * different questions — see the note above `SIGNED_OUT_TOP_ROWS` — so the
 * sections are in different orders, and an `indexOf` over the whole file finds
 * whichever branch is written first, which is not a fact about either page.
 *
 * `home` stays the whole file for the guards that are about CONSTANTS
 * (MIN_HISTORY, ROW, the gates), because those are shared.
 */
const signedOutView = home.slice(home.indexOf("if (!signedIn) {"), home.indexOf("NO ENTRANCE ANIMATION"))
const memberView = home.slice(home.indexOf("NO ENTRANCE ANIMATION"))
const hero = read("components/explore/home/hero-slides.tsx")
const row = read("components/explore/home/listing-row.tsx")
const pills = read("components/explore/home/you-might-be-into.tsx")
const tiles = read("components/explore/home/shop-by-category.tsx")
const more = read("components/explore/home/more-listings.tsx")
const feed = read("app/(marketing)/_explore-feed.tsx")
const loading = read("app/(marketing)/(feed)/loading.tsx")
const detail = read("components/product/product-detail.tsx")

console.log("\nThe sections, and their order")

check(
  "the page is hero, views, recent, suggested, pills, categories, more",
  (() => {
    // Personal first: somebody who has been here before should see what they
    // were doing before they see what we would like them to do. The pills are
    // AFTER the suggestions — a strip of search chips in the middle of the
    // personal rows interrupts the part of the page that is about you, and it
    // belongs where the browsing has run out.
    const order = [
      // The personal row is ABOVE the hero: a returning shopper came back to
      // carry on, and making them scroll past a campaign to reach the row that
      // remembers what they were doing puts the house's business ahead of
      // theirs. It is gated, so a first visit still opens on the hero.
      "Bazat pe vizualizările tale recente",
      "<HeroSlides",
      "Vizualizate recent",
      "Sugestii pentru tine",
      "<YouMightBeInto",
      "<ShopByCategory",
      "<MoreListings",
    ].map((s) => memberView.indexOf(s))
    return order.every((i) => i > 0) && order.every((v, i) => i === 0 || v > order[i - 1])
  })(),
)

check(
  "one row for the personal sections, three for the wider net",
  (() => {
    const based = memberView.slice(memberView.indexOf("Bazat pe vizualizările tale recente"))
    const suggested = memberView.slice(memberView.indexOf("Sugestii pentru tine"))
    return /rows=\{1\}/.test(based.slice(0, 260)) && /rows=\{3\}/.test(suggested.slice(0, 260))
  })(),
)

check(
  "two rows in the load-more grid, and it grows by two",
  /const ROWS_PER_PAGE = 2/.test(more) && /const PAGE = PER_ROW \* ROWS_PER_PAGE/.test(more),
)

check(
  "load more is a button first and an observer after",
  (() => {
    // Pure infinite scroll takes the footer away and loads pages nobody asked
    // for; a pure button asks for a press every twelve cards.
    return /const \[auto, setAuto\] = useState\(false\)/.test(more) && /if \(!auto \|\| !hasMore\) return/.test(more)
  })(),
)

console.log("\nThe hero is split, and two thirds of it is real stock")

check(
  "words on a solid ground, photograph beside it — never on top of it",
  (() => {
    // Text over a photograph is legible over the picture you chose and over
    // nothing else, and every one of these is uploaded by a seller who was
    // photographing a jumper rather than composing a banner.
    return (
      /grid-cols-\[minmax\(0,0\.42fr\)_minmax\(0,0\.58fr\)\]/.test(hero) &&
      /backgroundColor: s\.ground/.test(hero)
    )
  })(),
)

check(
  "all three slides are written, not generated from a listing title",
  (() => {
    // Two of them used the LISTING'S OWN TITLE as the headline, so the front
    // page of the marketplace read "Eu2" in 32px — a name that means something
    // to the person who typed it and nothing to anybody else.
    return (
      /const COPY: SlideCopy\[\]/.test(hero) &&
      (hero.match(/eyebrow: "/g) ?? []).length === 3 &&
      !/title: listing\.title/.test(hero) &&
      /unfazed\.ro\/cdn\/shop\/collections/.test(hero)
    )
  })(),
)

check(
  "each one gives a reason, and none of them is addressed to one sex",
  (() => {
    // A price you can justify, things that went up this week, things that
    // exist once — a reason rather than a name, and nothing a copywriter had
    // to invent about a category this catalogue may not have.
    return (
      /Sneakers sub 250 lei/.test(hero) &&
      /Adăugate zilele astea/.test(hero) &&
      /Lucruri pe care nu le are toată lumea/.test(hero) &&
      !/pentru ea\b/i.test(hero) &&
      !/pentru el\b/i.test(hero)
    )
  })(),
)

check(
  "the denim campaign is gone — it read as written by a machine",
  (() => {
    // The COPY array only: the file's own notes are allowed to quote the
    // headline they explain the removal of.
    const copy = hero.slice(hero.indexOf("const COPY: SlideCopy[]"), hero.indexOf("const SHELF"))
    return !/[Bb]lugi/.test(copy) && !/proba timpului/.test(copy) && !/denim/i.test(copy)
  })(),
)

check(
  "a listing slide is a shelf of three, not one photograph stretched wide",
  (() => {
    // A listing photograph is PORTRAIT — shot 3:4 by somebody holding a phone
    // vertically. In an 820x260 slot with object-cover, three quarters of it is
    // thrown away and a horizontal band from the middle is kept, which is how
    // the front page ended up showing two torsos and a picnic blanket. No crop
    // rule fixes that; the aspect ratios are not the same shape.
    return (
      /const SHELF = 3/.test(hero) &&
      /kind: "shelf"/.test(hero) &&
      /items\.length === SHELF/.test(hero) &&
      !/pickImage/.test(hero)
    )
  })(),
)

check(
  "the keywords are a preference, so a shelf is not left empty by a filter",
  (() => {
    // As a FILTER they matched fewer than three listings each, both shelf
    // slides fell back to the artwork, and the front page showed the SAME
    // photograph three times. Preferred first, then top up from the rest.
    const fn = hero.slice(hero.indexOf("function pickShelf"), hero.indexOf("export function HeroSlides"))
    return (
      /prefer\.some\(\(w\) => hay\.includes\(w\)\)/.test(fn) &&
      // The top-up pass: a second walk of the catalogue with no word test.
      /Then anything still unclaimed/.test(fn) &&
      (fn.match(/for \(const l of listings\)/g) ?? []).length === 2
    )
  })(),
)

check(
  "a shelf that still cannot be filled is dropped, never a third copy of the artwork",
  /if \(items\.length === SHELF\) out\.push/.test(hero) &&
    !/kind: "art" as const, image: c\.fallback/.test(hero) &&
    (hero.match(/SNEAKERS_ART/g) ?? []).length === 2,
)

check(
  "no two slides show the same listing",
  /taken\.add\(l\.id\)/.test(hero) && /taken\.has\(l\.id\)/.test(hero),
)

check(
  "the shelf's boxes are the card's own ratio, so nothing is cropped",
  (() => {
    const shelf = hero.slice(hero.indexOf('s.kind === "art"'))
    return /aspect-\[3\/4\] w-full overflow-hidden rounded-xl/.test(hero) && /sizes="160px"/.test(hero)
  })(),
)

check(
  "the height is on the slide, so no half of it is left short",
  (() => {
    // It was on the image (`h-[240px]`) while the copy half sized itself from
    // its contents (~285px), so the row was 285 tall, the photograph was 240,
    // and a band of page-white ran under it for the full width. That is the
    // cut edge people were seeing.
    //
    // FROM md UP. Below it the slide stacks — two columns at 375px gives the
    // copy half 172px for a 22px headline and a 44px button, and nothing about
    // that fits — so the row is `h-auto` and the picture states a ratio
    // instead. Same invariant either way: neither half decides its own height
    // independently of the other, so there is nothing for a band of white to
    // appear in.
    return (
      /md:h-\[320px\] md:grid-cols-/.test(hero) &&
      // A DEFINITE PICTURE ROW below md, not a ratio on each half. An
      // `aspect-ratio` inside a grid track that the flex track is also
      // stretching is two rules arguing over one number — the row grows to the
      // tallest slide and the picture grows with it, so the ratio stops being
      // true. 228px is also what the shelf slides need: a ShelfCard is a 3:4
      // photograph plus a caption, and anything shorter clips the price off.
      /grid h-auto w-full shrink-0 grid-rows-\[228px_auto\]/.test(hero) &&
      /lg:h-\[340px\]/.test(hero) &&
      // Both halves fill their row, at every width.
      /<div className="relative order-1 h-full md:order-none">/.test(hero) &&
      /order-1 flex h-full items-center justify-center gap-3 px-5 md:order-none/.test(hero) &&
      // The old fixed heights are gone from the CODE; the note explaining why
      // still quotes them.
      !/className="relative h-\[240px\]/.test(hero)
    )
  })(),
)

check(
  "the button opens a search, not the one listing whose picture it borrowed",
  (() => {
    // A slide that promises "denim" and lands on one pair of jeans is a bait.
    return !/href: `\/products\/\$\{listing\.slug\}`/.test(hero) && (hero.match(/href: "\/\?q=/g) ?? []).length === 3
  })(),
)

check(
  "the arrows are on the edges, and the copy leaves them a seat",
  (() => {
    // They belong on the edges — that is where everybody's hand goes. The
    // reason the left one was drawn through the headline is that a centred
    // block of copy occupies the same strip, so the fix is not to relocate the
    // arrow but to stop the copy claiming that strip. Reserve 72/88px and the
    // overlap is impossible by construction rather than avoided by hoping
    // headlines stay short.
    return (
      /<HeroArrow side="left"/.test(hero) &&
      /<HeroArrow side="right"/.test(hero) &&
      /absolute top-1\/2 z-10 flex h-9 w-9 -translate-y-1\/2/.test(hero) &&
      /side === "left" \? "left-4 lg:left-5" : "right-4 lg:right-5"/.test(hero) &&
      // The gutter, on the copy half AND under the dots, so all three share one
      // left margin.
      /md:pl-\[72px\] md:pr-6 lg:pl-\[88px\]/.test(hero) &&
      /md:left-\[72px\] lg:left-\[88px\]/.test(hero) &&
      // AND THE SEAT EXISTS ONLY WHERE THE ARROW DOES. Below md the arrows are
      // not drawn — a 36px disc pinned over a 375px slide sits on the picture
      // it is there to change, and the track is already swipeable — so
      // reserving 72px there would be an inch of empty ground beside every
      // headline on the screen with the least to spare. The dots then take the
      // copy's own 20px edge, so the two still share one margin at that width.
      /<div className="hidden md:contents">/.test(hero) &&
      /absolute bottom-4 left-5 [\s\S]{0,120}md:left-\[72px\]/.test(hero)
    )
  })(),
)

check(
  "a shelf card says what the thing is and what it costs",
  (() => {
    // Three unlabelled photographs is a mood board: you cannot tell whether the
    // thing is five lei or five hundred without clicking one to find out.
    return (
      /function ShelfCard\(/.test(hero) &&
      /formatPrice\(buyerPaysCents\(item\.priceCents\)\)/.test(hero) &&
      /\{item\.brand \|\| item\.title\}/.test(hero)
    )
  })(),
)

check(
  "and the third card stands down where three will not fit",
  // Between 768 and 1024 the picture half is about 430px; three cards plus
  // their gaps were being squeezed until the titles wrapped and the prices
  // fell off the bottom.
  /n === 2 \? "hidden lg:flex" : "flex"/.test(hero),
)

check(
  "and the editorial host is allowed through next/image",
  (() => {
    // A host that is not listed is not "unoptimised" — next/image REFUSES it and
    // the browser paints its own broken-image glyph, on the first thing anybody
    // sees.
    return /hostname: 'contentful\.depop\.com'/.test(read("next.config.mjs"))
  })(),
)

check(
  "five seconds a slide, on a timeout rather than an interval",
  (() => {
    // An INTERVAL lives across slides, so pressing next at 4.9s gives the slide
    // you just chose 100ms. One timeout per slide, torn down whenever the index
    // or the turn changes, is what makes a press reset the countdown.
    return (
      /const AUTOPLAY_MS = 5000/.test(hero) &&
      !/setInterval/.test(code("components/explore/home/hero-slides.tsx")) &&
      /window\.setTimeout\(\(\) => \{[\s\S]{0,160}go\(index \+ 1\)/.test(hero) &&
      /\}, \[index, turn, count, go\]\)/.test(hero) &&
      // A background tab does not advance thirty slides.
      /document\.visibilityState === "visible"/.test(hero) &&
      // And it is still drivable by hand.
      /if \(e\.key === "ArrowRight"\) go\(index \+ 1\)/.test(hero)
    )
  })(),
)

check(
  "the dots are the clock, off the SAME constant as the timer",
  (() => {
    // A bar that finishes early, or is still running when the slide changes, is
    // worse than no bar. One constant, used by the timer and by the fill.
    const css = read("app/globals.css")
    return (
      /animationDuration: `\$\{AUTOPLAY_MS\}ms`/.test(hero) &&
      /key=\{turn\}/.test(hero) &&
      /@keyframes hero-dot-fill/.test(css) &&
      // Linear: this is a measurement, not a movement. An eased clock lies
      // about how much time is left.
      /animation-timing-function: linear/.test(css) &&
      // The duration must NOT be restated in the stylesheet.
      !/hero-dot-fill[\s\S]{0,200}animation-duration/.test(css)
    )
  })(),
)

check(
  "and a press restarts the countdown rather than inheriting it",
  (() => {
    // React only replays a CSS animation on a NEW element. An index alone
    // cannot express "same slide, clock reset" — 0 → 1 → 0 reuses slide 0's bar
    // and inherits however far through it already was.
    return /const \[turn, setTurn\] = useState\(0\)/.test(hero) && /setTurn\(\(t\) => t \+ 1\)/.test(hero)
  })(),
)

check(
  "the tone reaches the shelf captions, not just the headline",
  (() => {
    // A pale ground shipped for one deploy and the three cards' captions stayed
    // WHITE: "Guess / 372 RON" invisible on bone. The products were on the
    // slide and their names and prices were not. A tone that covers the
    // headline but not the things it introduces is a half-applied theme, and
    // this is the guard that says so — whatever colour the grounds are today.
    return (
      /tone=\{s\.tone\}/.test(hero) &&
      /tone\?: "light" \| "dark"/.test(hero) &&
      // Both caption lines ask, not just one of them — inside ShelfCard, since
      // the copy half uses the same pattern for its headline and body.
      (() => {
        const card = hero.slice(hero.indexOf("function ShelfCard("), hero.indexOf("function HeroArrow("))
        return (card.match(/tone === "dark" \? "text-neutral-(500|900)"/g) ?? []).length === 2
      })() &&
      // And the arrow over a pale ground is dark, not a white smudge.
      /tone === "dark"[\s\S]{0,60}bg-neutral-900\/85 text-white/.test(hero)
    )
  })(),
)

check(
  "the three grounds are three different colours",
  (() => {
    const grounds = [...hero.matchAll(/ground: "(#[0-9a-f]{6})"/g)].map((m) => m[1])
    return grounds.length === 3 && new Set(grounds).size === 3
  })(),
)

check(
  "an off-screen slide's button is out of the tab order",
  /tabIndex=\{i === index \? 0 : -1\}/.test(hero),
)

check(
  "a personal section with nothing in it is not drawn at all",
  (() => {
    // A dashed box saying "open a few listings and we'll show you things like
    // them" is a page apologising for itself: it takes the space of content,
    // promises something nobody asked for, and pushes what IS worth seeing
    // below the fold to do it.
    return (
      /if \(shown\.length < minItems\) return null/.test(row) &&
      !/emptyNote/.test(row) &&
      !/emptyNote/.test(home) &&
      !/border-dashed/.test(row)
    )
  })(),
)

check(
  "and neither personal row appears until five listings have been collected",
  (() => {
    // They used to appear on the FIRST listing anybody opened. "Vizualizate
    // recent" with one card in it is a row four fifths empty — the grid is five
    // across — telling somebody about a page they were on ten seconds ago; and
    // "Bazat pe vizualizările tale recente" is worse for being FULL, because one
    // view is enough for the ranking to produce five cards under a heading that
    // claims to know what you are into.
    //
    // Five is one full row of the grid below, so the first time either is drawn
    // it is drawn complete.
    //
    // Counted on the HISTORY, not on either row's own contents: the second row
    // can produce a hundred candidates from a single view, so gating it on its
    // own length would gate nothing. And on `views` rather than on
    // `recentlyViewed`, so a sold listing dropping out of the catalogue cannot
    // take the rows away from somebody who has browsed plenty.
    return (
      /const MIN_HISTORY = 5/.test(home) &&
      /const personal = views\.length >= MIN_HISTORY/.test(home) &&
      // TWO gates now, not one block — the rows sit either side of the hero, so
      // they cannot share a fragment. Each must carry its own.
      (memberView.match(/\{personal && \(/g) ?? []).length === 2 &&
      memberView.indexOf("{personal && (") < memberView.indexOf("Bazat pe vizualizările tale recente") &&
      memberView.lastIndexOf("{personal && (") < memberView.indexOf("Vizualizate recent") &&
      // The pills are OUTSIDE both — that section is the one that carries an
      // early visit and must never be gated on history it does not have.
      memberView.indexOf("<YouMightBeInto") > memberView.lastIndexOf("{personal && (")
    )
  })(),
  "        components/explore/home/desktop-home.tsx",
)

check(
  "and a personal row needs a FULL row before it claims to know you",
  (() => {
    // "Sugestii pentru tine" with three cards is a quiet day. "Bazat pe
    // vizualizările tale recente" with three is the marketplace announcing it
    // has been watching you and then producing almost nothing.
    //
    // A SECOND condition, not a restatement of the one above. That gate is on
    // the history — has this device opened five listings — and this one is on
    // the row: are there five cards to draw. Neither implies the other. Five
    // views of listings that have since sold leave the recently-viewed row with
    // two cards in it, and a single view is enough for the ranking to produce
    // fifty candidates for the row above.
    return (
      /minItems = 3/.test(row) &&
      (memberView.match(/minItems=\{ROW\}/g) ?? []).length === 2 &&
      // The signed-out page's own recently-viewed row asks for the same full
      // row, for the same reason.
      (signedOutView.match(/minItems=\{ROW\}/g) ?? []).length === 1 &&
      !/minItems/.test(memberView.slice(memberView.indexOf("Sugestii pentru tine"), memberView.indexOf("<YouMightBeInto")))
    )
  })(),
)

check(
  "and the sections have more air between them",
  // Two values, because a phone has less of it to give: 40px between sections
  // there and 56 from sm up, and the categories block keeps its rule and its
  // larger gap only where the page is wide enough for one.
  /<section className="mt-10 sm:mt-14">/.test(row) &&
    /mt-12 border-t border-neutral-100 pt-10 lg:mt-20 lg:pt-14/.test(tiles),
)

console.log("\nIt knows what this person was looking at")

check(
  "opening a listing is what records the signal",
  (() => {
    // A search can be a typo and a scroll can be a thumb; nobody opens a jumper
    // by accident.
    return /recordView\(\{/.test(detail) && /subcategory: product\.subcategory \?\? null/.test(detail)
  })(),
)

check(
  "the history lives on the device and is capped",
  (() => {
    // The most sensitive thing a shopping site holds. No server copy to leak
    // and no join to an account.
    const src = read("lib/marketplace/recent-views.ts")
    return (
      /localStorage/.test(src) &&
      /const MAX = 40/.test(src) &&
      !/fetch\(/.test(src) &&
      !/supabase/i.test(src)
    )
  })(),
)

check(
  "re-opening something moves it rather than counting it twice",
  (() => {
    const src = read("lib/marketplace/recent-views.ts")
    return /const list = read\(\)\.filter\(\(e\) => e\.id !== v\.id\)/.test(src)
  })(),
)

check(
  "recency is weighted, so this morning outranks last week",
  (() => {
    const views: RecentView[] = [
      { id: "1", brand: "Nike", at: 3 },
      { id: "2", brand: "Zara", at: 2 },
      { id: "3", brand: "Zara", at: 1 },
    ]
    const s = signalsFrom(views, "brand")
    // Two older Zaras still outweigh one recent Nike; the decay is a tie-break,
    // not a cliff.
    return s[0].value === "Zara" && s[1].value === "Nike" && s[0].weight > s[1].weight
  })(),
)

check(
  "and an empty history is not an error",
  signalsFrom([], "brand").length === 0,
)

check(
  "the ranking prefers brand, then the kind of thing, then the department",
  (() => {
    // Somebody looking at Carhartt trousers is likelier to want a Carhartt
    // jacket than another pair of trousers by anybody.
    return /brandScores\.get\(brand\) \?\? 0\) \* 3/.test(home) && /subScores\.get\(sub\) \?\? 0\) \* 2/.test(home)
  })(),
)

check(
  "the two recommendation rows cannot restate each other",
  (() => {
    // Fifteen cards repeating the five above them is worse than one row.
    return /const usedInBased = new Set\(basedOnViews\.slice\(0, ROW\)/.test(home) && /!usedInBased\.has\(p\.id\)/.test(home)
  })(),
)

check(
  "five cards per row, and the exclusion arithmetic counts in fives",
  (() => {
    // Six across 1400px is 215px a card, and a second-hand listing is sold by
    // its photograph. When the exclusions drift from the grid the last section
    // either repeats a card already on the screen or hides one that never made
    // it there — both invisible until somebody counts.
    return (
      /const PER_ROW = 5/.test(row) &&
      /const PER_ROW = 5/.test(more) &&
      /xl:grid-cols-5/.test(row) &&
      /xl:grid-cols-5/.test(more) &&
      /const ROW = 5/.test(home) &&
      /suggested\.slice\(0, ROW \* 3\)/.test(home) &&
      !/xl:grid-cols-6/.test(row + more)
    )
  })(),
)

check(
  "you are never recommended what you just looked at",
  /const candidates = products\.filter\(\(p\) => !viewedIds\.has\(p\.id\)\)/.test(home),
)

check(
  "nothing is fetched — it is one array cut seven ways",
  !/fetch\(/.test(home) && !/useSWR/.test(home) && !/fetch\(/.test(row) && !/fetch\(/.test(more),
)

check(
  "the history is not read during render, so hydration cannot mismatch",
  (() => {
    // localStorage does not exist on the server; seeding state from it in a
    // lazy initialiser makes React discard the server HTML for the whole page.
    return /useState<RecentView\[\]>\(\[\]\)/.test(home) && /useEffect\(\(\) => \{\s*\n\s*const read = \(\) => setViews/.test(home)
  })(),
)

console.log("\nThe pills are a search somebody was about to run")

check(
  "a brand crossed with what it was sold as",
  (() => {
    // "Nike" alone is a brand page; "Nike sneakers" is a query.
    return /signalsFrom\(views, "brand"\)/.test(pills) && /\$\{b\.value\} \$\{noun\.toLowerCase\(\)\}/.test(pills)
  })(),
)

check(
  "and it is the one section that is never empty — six, always",
  (() => {
    // The two rows above it vanish entirely with no history, so this is what
    // carries a first visit. Two fallbacks, both broad, both landing on pages
    // that have listings on them: the catalogue's commonest brands, then the
    // kinds of thing it actually stocks.
    return (
      /const MIN = 6/.test(pills) &&
      (pills.match(/if \(out\.length < MIN\)/g) ?? []).length === 2 &&
      /if \(pills\.length < MIN\) return null/.test(pills) &&
      /categoryLabelFor\(p\?\.category, p\?\.subcategory\)/.test(pills)
    )
  })(),
)

check(
  "they are outlined, not filled",
  /border border-neutral-200 bg-white/.test(pills) && !/bg-neutral-900 text-white/.test(pills),
)

console.log("\nCategories wear their own stock")

check(
  "one tile per department, with a photograph from a listing inside it",
  /DEPARTMENTS\.map/.test(tiles) && /cardImage\(readVariants/.test(tiles),
)

check(
  "an empty department is not dressed in somebody else's stock",
  (() => {
    // Sending people to a page with nothing on it.
    return /image: cover\.get\(d\.id\) \?\? null/.test(tiles) && /\{t\.image && \(/.test(tiles)
  })(),
)

check(
  "the old browse-by-category rail is gone from the home page",
  (() => {
    // The feed no longer renders it, and the client block that carried it is
    // scoped to search results.
    const client = read("components/explore/explore-page-client.tsx")
    return (
      !/FeaturedCategoriesSection/.test(feed) &&
      !/MostPopularSection/.test(feed) &&
      /urlSearchQuery \? "space-y-8 hidden md:block" : "hidden"/.test(client)
    )
  })(),
)

console.log("\nAnd the desktop stops flashing a skeleton of the wrong page")

check(
  "the desktop shell is late, and it is three shapes rather than thirty",
  (() => {
    /**
     * A loading.tsx fallback is shown the INSTANT a navigation starts, so a
     * route that resolves quickly — most of them — flashed a skeleton for two
     * or three frames. That is worse than nothing: something appears and
     * disappears and you learn nothing from either.
     *
     * The 400ms delay is what makes it "only when the wait is real", and
     * `both` is what holds it at opacity 0 through that delay — without the
     * fill mode the element paints fully opaque until the animation begins,
     * which is the exact flash it removes.
     *
     * The MOBILE shell must NOT be delayed: in the app it is the answer to
     * tapping a tab, and 400ms of nothing after a tap is the "switching to home
     * is slow" report it was built to fix.
     */
    const css = read("app/globals.css")
    return (
      /feed-shell-late mx-auto/.test(loading) &&
      /animation: feed-shell-late 220ms ease-out 400ms both/.test(css) &&
      // Simple: one hero block, one heading, one row — and no pulse.
      !/animate-pulse/.test(loading.slice(loading.indexOf("feed-shell-late"))) &&
      // The phone shell keeps its own detail and its own immediacy.
      !/feed-shell-late[\s\S]*mobile-feed-shell/.test(loading) &&
      /mobile-feed-shell/.test(loading)
    )
  })(),
)

check(
  "the phone browser gets its own shell, and it is late and plain",
  (() => {
    // There was ONE mobile placeholder, and it is an exact tracing of the feed
    // inside the app: a search row, three tabs, a hairline, a rail of category
    // pills and a two-column grid. That is right for the app — a loading.tsx
    // there answers a TAB PRESS, it is on screen for the whole wait, and
    // anything in it that is not the shape of the arriving screen is a jump.
    //
    // On a phone browser none of it is true. The header already carries the
    // search, so that row appeared and was removed; a signed-out visitor gets
    // the home page, so the tabs and the rail belong to a screen that is not
    // coming; and what arrives is a hero and a set of shelves, not a grid. A
    // placeholder has one job — hold the space its content will take — and that
    // one held the wrong space and then handed over to a different page.
    //
    // Two shells, and the class on <html> picks one: the same signal, set
    // before the first paint, that already chooses between the two headers.
    const css = read("app/globals.css")
    const web = loading.slice(loading.indexOf('"feed-shell-web'))
    return (
      /className="feed-shell-app mobile-feed-shell/.test(loading) &&
      /className="feed-shell-web feed-shell-late px-4/.test(loading) &&
      /html\.capacitor \.feed-shell-web \{\s*\n\s*display: none;/.test(css) &&
      /html:not\(\.capacitor\) \.feed-shell-app \{\s*\n\s*display: none;/.test(css) &&
      // LATE on the web, so a load that resolves in 150ms draws nothing at all
      // — and NOT late in the app, where a tap has to answer instantly.
      !/feed-shell-app[^"]*feed-shell-late/.test(loading) &&
      // PLAIN: three shapes and no pulse, because anybody who sees this is
      // already waiting and wants a calm signal rather than a forgery.
      !/animate-pulse/.test(web) &&
      // And none of the app's chrome, which is the whole reason it is separate.
      !/Pentru tine|feed-own-search|rounded-full/.test(web)
    )
  })(),
  "        app/(marketing)/(feed)/loading.tsx, app/globals.css",
)

check(
  "and nothing in it pulses",
  (() => {
    // A 1400px block flashing grey is the most distracting thing a loading
    // screen can do, and by the time this is on screen somebody is already
    // waiting — a calm signal reads better than an animated one.
    const desktop = loading.slice(loading.indexOf("feed-shell-late"))
    return !/animate-pulse/.test(desktop)
  })(),
)

check(
  "and nothing animates the whole page while it is still changing height",
  (() => {
    // The 160ms opacity fade over the shell promoted two thousand pixels to a
    // composited layer during the exact window in which that page grows — and
    // a layer whose contents grow after it is rasterised is how the FOOTER
    // ended up painted across the middle of the listings, at the height the
    // page had before the personal rows arrived.
    const css = read("app/globals.css")
    return (
      !/home-arrive/.test(home) &&
      !/@keyframes home-arrive/.test(css) &&
      /\.home-arrive \{\s*\n\s*animation: none;/.test(css)
    )
  })(),
)

check(
  "and the footer cannot be composited under the page it ends",
  (() => {
    const css = read("app/globals.css")
    const footer = read("components/marketing/footer.tsx")
    return (
      /className="marketing-footer bg-\[#0f0f0f\] text-white"/.test(footer) &&
      /\.marketing-footer \{[\s\S]{0,140}position: relative;[\s\S]{0,140}z-index: 1;[\s\S]{0,140}isolation: isolate;/.test(css)
    )
  })(),
)

check(
  "the phone shell stays",
  (() => {
    // The app has no browser chrome to say a navigation happened, and this is
    // the most expensive route in the product.
    return /mobile-feed-shell md:hidden fixed inset-0/.test(loading)
  })(),
)

check(
  "the switch is black and the button is purple, and neither is the other",
  (() => {
    // Grey was too quiet: a neutral-200 thumb on a white track on a near-white
    // panel is three greys within a few percent of each other, and the switch
    // did not look switched. Black has the distance to read as selected.
    //
    // It still does not compete with the CTA, because they are different KINDS
    // of thing — the switch is monochrome, the button is the only colour on
    // the panel — so the eye separates them by hue rather than by weight. What
    // cannot happen is BOTH being purple: two things claiming to be primary.
    const hero2 = code("components/explore/home/signed-out-hero.tsx")
    const thumb = hero2.slice(hero2.indexOf("absolute inset-y-1 left-1"), hero2.indexOf("absolute inset-y-1 left-1") + 200)
    const cta = hero2.slice(hero2.indexOf("mt-8 inline-flex h-[52px]"), hero2.indexOf("mt-8 inline-flex h-[52px]") + 200)
    return /bg-neutral-900/.test(thumb) && !/7c3aed/.test(thumb) && /bg-\[#7c3aed\]/.test(cta)
  })(),
)

check(
  "and the selected word turns white on the same tick the thumb turns black",
  (() => {
    // The thumb is black now, so near-black text on the selected side would be
    // unreadable — and it has to change on the SAME duration the thumb travels
    // on, or the word disappears for a fifth of a second mid-slide.
    const hero2 = code("components/explore/home/signed-out-hero.tsx")
    const labels = hero2.slice(hero2.indexOf('"relative z-10 w-[100px]'), hero2.indexOf('"relative z-10 w-[100px]') + 260)
    return /side === s \? "text-white"/.test(labels) && /transition-colors duration-200/.test(labels)
  })(),
)

check(
  "and the hero image cannot be dragged off the page",
  (() => {
    const hero2 = code("components/explore/home/signed-out-hero.tsx")
    return /draggable=\{false\}/.test(hero2) && /pointer-events-none select-none/.test(hero2)
  })(),
)

check(
  "the hero image is drawn at its own ratio, so nothing is cropped",
  (() => {
    // The source is 1356x798 (1.70). It was in `aspect-[4/3]` (1.33) with
    // object-cover, so a fifth of the composition was cut off the sides, taking
    // most of both outer cards with it.
    const hero2 = code("components/explore/home/signed-out-hero.tsx")
    return (
      // The artwork's own ratio, stated, so nothing is cropped.
      /const HERO_RATIO = "1356 \/ 798"/.test(hero2) &&
      /aspectRatio: HERO_RATIO/.test(hero2) &&
      !/aspect-\[4\/3\]/.test(hero2) &&
      // It is transparent RGBA, so it sits on the gradient with no card of its
      // own — a radius or a background here would be a card inside a card.
      !/rounded-xl object-/.test(hero2) &&
      /object-contain/.test(hero2) &&
      // NO width cap: this export is 1356 wide against a ~600px column, so it
      // fills. The previous one was 400 wide and had to be capped at 1:1,
      // because the optimizer never upscales past the source and no `quality`
      // setting can put back detail that is not in the file.
      !/MAX_W/.test(hero2) &&
      !/maxWidth/.test(hero2) &&
      /quality=\{75\}/.test(hero2)
    )
  })(),
)

check(
  "and the three tiles are one set rather than three heights",
  (() => {
    // "Anunț în câteva minute" wrapped while "Zero comision" did not, so three
    // boxes that are the same object had three different heights and their
    // icons and titles all started at different places. A grid can equalise the
    // BOXES; only the copy can make them look like a set.
    //
    // Equal heights are now asked for twice, because there are two layouts. The
    // grid does it above sm; below it these are a snapping rail, where the flex
    // default (`items-stretch`) does the same job — so what is pinned here is
    // that neither layout lets a tile size itself: `sm:h-full` for the grid,
    // and no `items-start` / `self-` anywhere to opt one row out of the stretch.
    const hero2 = code("components/explore/home/signed-out-hero.tsx")
    const titles = [...hero2.matchAll(/title: "([^"]+)", body:/g)].map((m) => m[1])
    const tiles = hero2.slice(hero2.indexOf("bg-white/75"), hero2.indexOf("bg-white/75") + 260)
    return (
      /sm:h-full/.test(tiles) &&
      /flex-col rounded-xl/.test(hero2) &&
      !/items-start/.test(tiles) &&
      titles.length === 6 &&
      titles.every((t) => t.split(" ").length <= 3)
    )
  })(),
)

check(
  "Log in and Sign up are one control with no rule drawn through it",
  (() => {
    /**
     * A hairline between two things is a SEPARATOR — it is what you draw when
     * they are not obviously related. Drawing one here argued against the
     * point of the control: it pushed the two halves apart and then asked a
     * line to hold them together. Two words a few pixels apart, one of them
     * filled, already read as one object.
     *
     * And Log in is at full white. It was the half most people actually need,
     * dimmed to 85% — which put both halves at the same low contrast and made
     * the returning shopper's word the harder one to find.
     */
    /**
     * SLICED BY THE BLOCK, NOT BY A WINDOW AROUND ONE LINK.
     *
     * It used to take 220 characters before `href="/login"` and 600 after,
     * which held both halves only because Log in happened to be written first.
     * The moment the two were reordered the window no longer contained Sign up
     * and the guard failed on a change it has no opinion about — a test that
     * breaks when the thing it is not testing moves.
     */
    const hdr = code("components/platform/platform-header-client.tsx")
    const start = hdr.indexOf('{!user && (\n                  <div className="flex items-center gap-2">')
    if (start < 0) return false
    const pair = hdr.slice(start, hdr.indexOf("</div>", hdr.indexOf('href="/login"')))
    return (
      // No rule between them, anywhere in the pair.
      !/w-px/.test(pair) &&
      // They are held together by the gap on their shared row instead.
      /flex items-center gap-2/.test(pair) &&
      // Log in is opaque, not 85%.
      /text-white transition-opacity/.test(pair) &&
      !/text-white\/85/.test(pair) &&
      // And Sign up is still the only filled object of the two.
      /href="\/signup"/.test(pair) &&
      /bg-neutral-800/.test(pair) &&
      // SIGN UP LEADS. Most of the traffic on a page carrying the signed-out
      // hero has never been here, and the filled object was sitting at the very
      // end of the row against the edge of the window. Log in is the last word,
      // which is where somebody who already has an account looks anyway.
      pair.indexOf('href="/signup"') < pair.indexOf('href="/login"')
    )
  })(),
)

check(
  "the marketing hero is signed-out only",
  (() => {
    // Somebody with an account already knows what Storelib is. Telling them on
    // every visit is the site failing to recognise them.
    const hero2 = code("components/explore/home/signed-out-hero.tsx")
    return (
      // Back inside the page's measure: full-bleed was tried and reverted —
      // edge to edge it stopped being one of the page's sections and became a
      // header, which made the listings under it look inset rather than making
      // the hero look wide.
      /\{!signedIn && <SignedOutHero \/>\}/.test(home) &&
      /mb-8 overflow-hidden rounded-2xl ring-1/.test(hero2) &&
      /signedIn=\{signedIn\}/.test(feed) &&
      /auth\.getUser\(\)/.test(feed) &&
      // No invented metrics. The reference carries "49M+ items for sale"; a
      // front page opening with a figure it cannot stand behind has told its
      // first lie to everybody who ever visits.
      !/\dM\+/.test(hero2) &&
      !/[0-9][0-9,.]*\+\s*(items|articole|anunțuri)/i.test(hero2)
    )
  })(),
)

check(
  "the hero says what the product now says, on both sides of the toggle",
  (() => {
    // Copy is pinned here for one reason: these six tiles and two paragraphs
    // are the entire pitch, they are the only strings on the site a stranger
    // reads before deciding whether to stay, and they have been rewritten four
    // times. A guard is the difference between a considered revision and a
    // half-applied one — the state this file was in twice, where a headline had
    // been changed and the tile under it still argued with it.
    const hero2 = code("components/explore/home/signed-out-hero.tsx")
    return (
      // Buy: not only fashion, and no "lucruri care au mai trăit o dată".
      /Haine, sneakers, cărți, muzică, și obiecte de colecție, vândute de oameni din toată țara\./.test(hero2) &&
      /title: "Lucruri diferite", body: "Găsești ceva nou de fiecare dată\."/.test(hero2) &&
      /title: "Adăugate zilnic", body: "Listări noi, în fiecare zi\."/.test(hero2) &&
      // "Cumpărături protejate" is "Safe Buying" — the one English string kept
      // on this panel, deliberately, because it is the phrase the payment
      // industry has trained everybody to look for and the Romanian is a
      // mouthful nobody scans.
      /title: "Safe Buying", body: "Plătești simplu și în siguranță\."/.test(hero2) &&
      // Sell: the promise is the money kept, not the minutes spent.
      /Publici rapid, găsești un cumpărător și păstrezi banii din vânzare\./.test(hero2) &&
      /cta: "Începe să vinzi"/.test(hero2) &&
      /title: "Publici rapid", body: "Câteva poze, un preț și gata\."/.test(hero2) &&
      /title: "Zero comision", body: "Primești prețul pe care îl setezi\."/.test(hero2) &&
      // Shortened from "AWB-ul este generat pentru tine." — and it is the one
      // tile body on the panel with no full stop, which is the copy as written
      // rather than a slip.
      /title: "Livrare simplă", body: "AWB generat automat"/.test(hero2) &&
      // And the sentences they replaced are gone from the CODE.
      !/Un exemplar din fiecare/.test(hero2) &&
      !/De la vânzători reali/.test(hero2) &&
      !/prețul pe care îl ceri este prețul pe care îl primești/.test(hero2)
    )
  })(),
  "        components/explore/home/signed-out-hero.tsx",
)

check(
  "and only the tile that means it opens the protection panel",
  (() => {
    // It was `i === 2` — the third tile, on both sides — which was true while
    // both third tiles said "Cum funcționează" and both meant the same page.
    // They do not any more: the seller's third tile is about AWB labels, and an
    // underlined line reading "AWB generat automat" that opens a page about
    // buyer protection is a link that lies about where it goes.
    const hero2 = code("components/explore/home/signed-out-hero.tsx")
    return (
      /const opensPanel = tile\.opensProtection === true/.test(hero2) &&
      !/const opensPanel = i === 2/.test(hero2) &&
      // Exactly one tile carries it, and it is the one about paying safely.
      (hero2.match(/opensProtection: true/g) ?? []).length === 1 &&
      /title: "Safe Buying", body: "Plătești simplu și în siguranță\.", opensProtection: true/.test(hero2)
    )
  })(),
  "        components/explore/home/signed-out-hero.tsx",
)

check(
  "the hero has an edge without becoming a card",
  (() => {
    // A flat tint with a hairline ring read as a region of the background
    // rather than as something placed on it, so the page opened on a large pale
    // rectangle with no edge. A one-pixel contact shadow is what says "this
    // sits on top"; the wide ambient one is pulled 24px in so it never reads as
    // a drop shadow. Nothing above ~0.12 alpha — an edge, not an elevation.
    const hero2 = code("components/explore/home/signed-out-hero.tsx")
    return (
      /shadow-\[0_1px_2px_rgba\(15,15,15,0\.04\),0_18px_40px_-24px_rgba\(15,15,15,0\.12\)\]/.test(hero2) &&
      // And the tiles are one step quieter, because two objects at the same
      // elevation stacked on each other flattens both.
      /shadow-\[0_1px_2px_rgba\(15,15,15,0\.035\)\]/.test(hero2)
    )
  })(),
  "        components/explore/home/signed-out-hero.tsx",
)

check(
  "the ground falls from the top edge and keeps falling",
  (() => {
    // It was 115deg — a diagonal, and on a panel twice as wide as it is tall a
    // diagonal spends most of its travel horizontally. That put the lightest
    // part of the ground behind the headline and the darkest behind the
    // artwork: the two things on this panel that least want a ground drawing
    // attention to itself.
    //
    // The angle is pinned near vertical, but the real invariant is the one
    // under it: EVERY STOP IS DARKER THAN THE ONE BEFORE. Each earlier setting
    // ended on a lighter stop than its neighbour, because a diagonal wants to
    // come back up in the far corner — and one stop that goes back up is a band
    // across a panel this size, which is what a gradient must never look like.
    // Read off the values rather than matched against a string, so the check
    // survives a re-tint and only fails on a re-shape.
    const hero2 = code("components/explore/home/signed-out-hero.tsx")
    const decl = /linear-gradient\((\d+)deg,([^"]+)\)/.exec(hero2)
    if (!decl) return false
    const angle = Number(decl[1])
    const lum = [...decl[2].matchAll(/#([0-9a-f]{6})/gi)].map((m) => {
      const v = parseInt(m[1], 16)
      return ((v >> 16) & 255) + ((v >> 8) & 255) + (v & 255)
    })
    return (
      // Top to bottom, with enough lean that it is light falling rather than a
      // mechanical band, and not so much that it turns back into a sweep.
      angle >= 160 &&
      angle <= 180 &&
      // Five stops, because a near-flat ramp over six hundred pixels is exactly
      // where 8-bit sRGB bands and the extra stops cost nothing.
      lum.length >= 5 &&
      lum.every((v, i) => i === 0 || v < lum[i - 1]) &&
      // Still a ground, not a tint: the darkest stop stays within about six
      // percent of the #f5f5f5 page it sits on.
      lum[lum.length - 1] > 245 * 3 * 0.94
    )
  })(),
  "        components/explore/home/signed-out-hero.tsx",
)

check(
  "the artwork takes the slack rather than the panel's height",
  (() => {
    // Two asks that read as opposites — a bigger picture in a shorter panel —
    // and they are only opposites if the picture is what makes the panel tall.
    // It is not: the copy column runs to something over 450px at 1400px wide
    // while the artwork at a half column is about 350, and `items-center`
    // centres the shorter of the two. That ~100px of slack either side of the
    // picture is the panel's height being set entirely by the left-hand side.
    //
    // So the artwork grows into slack it already had, and the height comes off
    // the copy column's rhythm, where it was actually being spent.
    const hero2 = code("components/explore/home/signed-out-hero.tsx")
    return (
      // 45/55, not 50/50. Past 55 the left column starts reflowing, and
      // reflowing the left column makes the panel TALLER — the opposite of the
      // other half of this change.
      /lg:grid-cols-\[minmax\(0,0\.45fr\)_minmax\(0,0\.55fr\)\]/.test(hero2) &&
      // The shorter column is what gets centred, which is what makes the slack
      // exist at all.
      /grid items-center/.test(hero2) &&
      // Five percent off the panel, spread over three places rather than taken
      // out of the padding alone — 41px of air above a 42px headline is a panel
      // with its contents against the edges, not a shorter panel.
      /lg:py-\[46px\]/.test(hero2) &&
      // And the gap that carries meaning is untouched: the space between the
      // button and the tiles is what separates "what to do" from "what you get".
      /mt-8 inline-flex h-\[52px\]/.test(hero2) &&
      // `sizes` moved with the column. A hint left behind by a layout change is
      // the quiet kind of wrong — the picture still fits, it is just upscaled
      // from a rung too small for it.
      /\(min-width: 1024px\) 680px/.test(hero2)
    )
  })(),
  "        components/explore/home/signed-out-hero.tsx",
)

check(
  "a stranger gets a different page, not the same one with a banner",
  (() => {
    // A visitor with no account is answering a different question. The member's
    // question is "what is new since I was last here", and the layout below
    // answers it by leading with their own history. A stranger has no history —
    // the personal rows are empty by definition on a first visit — so the same
    // layout hands them a hero, a gap where two sections would be, and a wall of
    // listings under a heading that says "for you" about somebody it has never
    // met.
    //
    // The order, written out rather than derived:
    //   the proposition, then either their own history OR two rows of the newest
    //   things, then the editorial, then the queries, then the categories, then
    //   three more rows, then everything else a page at a time.
    const order = [
      "<SignedOutHero />",
      "Vizualizate recent",
      "<HeroSlides",
      "<YouMightBeInto",
      "<ShopByCategory",
      "<MoreListings",
    ].map((s) => signedOutView.indexOf(s))
    return (
      signedOutView.length > 400 &&
      order.every((i) => i > 0) &&
      order.every((v, i) => i === 0 || v > order[i - 1]) &&
      // The hero is UNDER the proposition here, not above it: it is a promotion
      // and it has to earn the scroll rather than open the page twice.
      signedOutView.indexOf("<SignedOutHero />") < signedOutView.indexOf("<HeroSlides")
    )
  })(),
  "        components/explore/home/desktop-home.tsx",
)

check(
  "three suggestion blocks, cut from one list so no card appears twice",
  (() => {
    // "Sugestii pentru tine" at two rows stands in for the personal row when
    // there is no history — the same promise made honestly: ten of the newest
    // things, not a claim to know anybody. The other two sit either side of the
    // category tiles.
    //
    // The heading therefore appears up to three times on one page, which is a
    // decision about the page rather than an accident — and it is only
    // defensible while the CONTENTS differ. Three consecutive slices of one
    // list, offset by what the block before it took, is what makes that
    // provable rather than hoped for.
    const homeAll = read("components/explore/home/desktop-home.tsx")
    return (
      /const SIGNED_OUT_TOP_ROWS = 2/.test(homeAll) &&
      /const SIGNED_OUT_MID_ROWS = 2/.test(homeAll) &&
      // `topTaken` is 0 when the first block was not drawn, which is the whole
      // of "the middle block starts wherever the top one stopped" — written as
      // an offset rather than as two branches, so the slices cannot overlap.
      /const topTaken = personal \? 0 : ROW \* SIGNED_OUT_TOP_ROWS/.test(homeAll) &&
      /const suggestedTop = sections\.suggested\.slice\(0, topTaken\)/.test(homeAll) &&
      /const suggestedMid = sections\.suggested\.slice\(topTaken, topTaken \+ ROW \* SIGNED_OUT_MID_ROWS\)/.test(homeAll) &&
      /const suggestedRest = sections\.suggested\.slice\(topTaken \+ ROW \* SIGNED_OUT_MID_ROWS\)/.test(homeAll) &&
      (signedOutView.match(/title="Sugestii pentru tine"/g) ?? []).length === 3 &&
      /\{personal \? \(/.test(signedOutView) &&
      /items=\{suggestedRest\}\s*\n\s*rows=\{3\}/.test(signedOutView)
    )
  })(),
  "        components/explore/home/desktop-home.tsx",
)

check(
  "and the grid between the pills and the tiles, not two rows of navigation in a row",
  (() => {
    // The pills are queries and the tiles are departments — both are ways of
    // NARROWING, and back to back they make the middle of the page two rows of
    // navigation with nothing to look at between them.
    const order = ["<YouMightBeInto", "items={suggestedMid}", "<ShopByCategory", "items={suggestedRest}", "<MoreListings"].map(
      (needle) => signedOutView.indexOf(needle),
    )
    return order.every((i) => i > 0) && order.every((v, i) => i === 0 || v > order[i - 1])
  })(),
  "        components/explore/home/desktop-home.tsx",
)

check(
  "the hero takes the page's rhythm when something is above it, and none when nothing is",
  (() => {
    // It had no top margin at all while every other section has `mt-14`, so a
    // listing row directly above it butted its cards against the slideshow with
    // no space between them. Baking the margin in would have put a gap above
    // the top of the page on the visit where the hero IS the first thing.
    const homeAll = read("components/explore/home/desktop-home.tsx")
    const slides = read("components/explore/home/hero-slides.tsx")
    return (
      // The section merges a caller className rather than stating its own.
      /className=\{cn\(\s*\n\s*"group\/hero relative overflow-hidden rounded-2xl/.test(slides) &&
      /className\?: string/.test(slides) &&
      // Member: only when the personal row above it was drawn.
      /<HeroSlides listings=\{products\} className=\{personal \? "mt-14" : undefined\} \/>/.test(homeAll) &&
      // Signed out: always, because something is always above it there.
      /<HeroSlides listings=\{products\} className="mt-14" \/>/.test(homeAll)
    )
  })(),
  "        components/explore/home/hero-slides.tsx",
)

check(
  "the artwork answers the toggle, and both are mounted so the swap is a fade",
  (() => {
    // The panel swaps its headline, its line, its button and its three tiles
    // when you press Vinde — everything except the picture, which went on
    // showing a shopper's composition while the copy talked about publishing a
    // listing. That is the one element on the panel not answering the control,
    // and it is the largest.
    //
    // Swapping `src` on ONE element is not a cross-fade: the browser tears the
    // first picture down, requests the second, and shows whatever is behind them
    // in between — a white hole on half the panel, every press. Two elements
    // both `priority`, only their opacity changing, is a composited fade with
    // nothing to fetch.
    const hero2 = code("components/explore/home/signed-out-hero.tsx")
    return (
      /const HERO_IMAGE: Record<Side, string> = \{/.test(hero2) &&
      // Two different files. The seller's has been replaced once already —
      // (4) became (5) — and what this pins is not which file it is but that
      // the two sides do not point at the same one, which is the state this
      // whole block exists to prevent and the state a careless edit returns it
      // to. Both are 1356x798 RGBA with transparent corners; an asset off that
      // ratio letterboxes inside the box rather than cropping, which is why the
      // ratio guard above and this one are separate checks.
      /Untitled%20design%20\(2\)\.png/.test(hero2) &&
      /Untitled%20design%20\(5\)\.png/.test(hero2) &&
      /\(\["buy", "sell"\] as const\)\.map\(\(s\) => \(/.test(hero2.slice(hero2.indexOf("aspectRatio: HERO_RATIO"))) &&
      /side === s \? "opacity-100" : "opacity-0"/.test(hero2) &&
      // THE OUTGOING ONE LEAVES FASTER THAN THE INCOMING ONE ARRIVES. Both at
      // one duration meant that halfway through the switch you were looking at
      // two whole compositions at half strength — three cards dissolving into
      // three different cards, all six on screen. Nothing moves, but everything
      // LOOKS like it does, which is what "the images move too much when I
      // change side" was. Cutting the overlap is the fix, not slowing the fade.
      /transitionDuration: side === s \? "340ms" : "200ms"/.test(hero2) &&
      /transitionDelay: side === s \? "90ms" : "0ms"/.test(hero2) &&
      // Both decoded before either is needed — the whole reason there is nothing
      // to fetch at the moment of the press.
      (hero2.match(/priority/g) ?? []).length >= 1 &&
      /src=\{HERO_IMAGE\[s\]\}/.test(hero2)
    )
  })(),
  "        components/explore/home/signed-out-hero.tsx",
)

check(
  "and it drifts, slowly enough that you notice it has moved rather than watch it move",
  (() => {
    // Five pixels over nine seconds — roughly one pixel a second. Deliberately
    // below the threshold where anybody would call it an animation: what it buys
    // is that the first screen is not a photograph of an interface. Anything
    // faster becomes an object competing with the headline beside it, which is
    // the failure mode of every floating hero image ever shipped.
    //
    // A pendulum, so its end IS its beginning and the loop has no seam, and
    // eased at both ends because the eye is very good at spotting constant
    // velocity and very bad at spotting eased velocity.
    const css = read("app/globals.css")
    const hero2 = code("components/explore/home/signed-out-hero.tsx")
    return (
      /@keyframes hero-art-drift \{[\s\S]{0,200}?translate3d\(0, -5px, 0\)/.test(css) &&
      /animation: hero-art-drift 9s ease-in-out infinite/.test(css) &&
      // transform ONLY — no paint, no layout, and nothing it could push.
      !/@keyframes hero-art-drift \{[\s\S]{0,220}?(margin|top:|height)/.test(css) &&
      // A continuous loop is precisely what the preference is about: stopped,
      // not slowed.
      /@media \(prefers-reduced-motion: reduce\) \{\s*\n\s*\.hero-art-drift \{\s*\n\s*animation: none;/.test(css) &&
      // ONE animation, on the box the two layers SHARE. It was on each layer:
      // two animations of the same length are in phase only until something
      // desynchronises them, and during a switch that is the two compositions
      // drifting fractionally apart while they cross-fade — movement invented
      // by the code rather than present in the artwork.
      /className="hero-art-drift relative w-full"/.test(hero2) &&
      (hero2.match(/hero-art-drift/g) ?? []).length === 1
    )
  })(),
  "        app/globals.css, components/explore/home/signed-out-hero.tsx",
)

check(
  "the home page is only drawn when there is nothing being searched for",
  /\{!searchQuery && <DesktopHome products=\{productsWithCreators\} signedIn=\{signedIn\} \/>\}/.test(feed),
)

console.log("\nCrossing between the profile and the home page does not bump")

check(
  "the feed's height is in the stylesheet, so the web rule can subtract from it",
  (() => {
    // Both the feed and its loading shell carried `style={{height:"100dvh"}}`,
    // which is the stylesheet's own rule with one point of specificity nothing
    // can outrank — an inline declaration beats every selector short of
    // `!important`. So on a phone BROWSER the shell took `top: var(--web-header-h)`
    // and REFUSED the matching `height: calc(100dvh - var(--web-header-h))`: a
    // full viewport starting below the header and therefore hanging off the
    // bottom of the screen by exactly the header's height, with the tab-bar
    // spacer and the last row of listings down there.
    //
    // `inset: 0` supplies the other three sides; an over-constrained fixed box
    // drops `bottom` in favour of a stated height, which is why the height has
    // to be stated at all rather than simply deleted.
    const css = read("app/globals.css")
    const shell = read("components/explore/mobile-feed.tsx")
    return (
      !/style=\{\{ height: "100dvh" \}\}/.test(shell) &&
      !/style=\{\{ height: "100dvh" \}\}/.test(loading) &&
      /\.mobile-feed-shell \{\s*\n\s*height: 100dvh;\s*\n\s*\}/.test(css) &&
      /html:not\(\.capacitor\) \.mobile-feed-shell \{\s*\n\s*top: var\(--web-header-h, 0px\);\s*\n\s*height: calc\(100dvh - var\(--web-header-h, 0px\)\);/.test(
        css,
      )
    )
  })(),
  "        components/explore/mobile-feed.tsx, app/(marketing)/(feed)/loading.tsx, app/globals.css",
)

check(
  "and the header's height is republished by the commit that reshapes it",
  (() => {
    // THE BUMP. The mobile web header is not one height: isCompactHeader drops
    // the search row on /profile, /settings, /messages and the order pages, so
    // crossing between your account and the feed changes it by a whole row —
    // about 56px. The feed is `position: fixed` with `top: var(--web-header-h)`,
    // so that number is where the home screen starts.
    //
    // It was published from a mount-only layout effect plus a ResizeObserver.
    // A route change re-renders the header taller or shorter WITHOUT remounting
    // it, so the effect did not re-run and the only thing left to notice was the
    // observer — which fires from the browser's rendering steps rather than from
    // the commit that caused the change. The value was right in the end and
    // wrong at the moment it mattered: the feed arrived inset by the height of
    // the header you had just LEFT, then settled onto the height of the one you
    // are looking at.
    //
    // `compact` is the whole of what a route can change about the geometry, so
    // the republish is keyed on it rather than on the pathname — it fires when
    // the height actually moves and not on every navigation. The observer stays
    // for what a render cannot predict: a font landing, an orientation change,
    // a safe-area inset appearing on a standalone install.
    const header = read("components/marketing/mobile-web-header.tsx")
    return (
      /const publishHeaderHeight = useCallback\(/.test(header) &&
      /useLayoutEffect\(\(\) => \{\s*\n\s*publishHeaderHeight\(\)\s*\n\s*\}, \[compact, publishHeaderHeight\]\)/.test(
        header,
      ) &&
      // Still measured rather than written down twice, and still observed.
      /getBoundingClientRect\(\)\.height/.test(header) &&
      /new ResizeObserver\(publishHeaderHeight\)/.test(header)
    )
  })(),
  "        components/marketing/mobile-web-header.tsx",
)

console.log("\nA build cannot die on somebody else's font server")

check(
  "only the interface typeface is fetched at build time",
  (() => {
    // next/font/google fetches from fonts.gstatic.com AT BUILD TIME, and a blip
    // there fails the whole build with "Can't resolve
    // '@vercel/turbopack-next/internal/font/…'". Six families meant six chances
    // per deploy to die on somebody else's network — and it took three of them
    // in one afternoon, each on a different font, each with a diff that had
    // nothing to do with typography. A failed build looks exactly like a change
    // that was never pushed.
    const layout = read("app/layout.tsx")
    return (
      /import \{ Inter \} from "next\/font\/google"/.test(layout) &&
      // Comments name them; only the CODE must not import them.
      !/from "next\/font\/google"[\s\S]*?(Plus_Jakarta_Sans|Space_Grotesk|DM_Sans\(|Poppins\(|Montserrat\()/.test(layout) &&
      !/\bconst (plusJakartaSans|spaceGrotesk|dmSans|poppins|montserrat) =/.test(layout)
    )
  })(),
)

check(
  "the five builder families still load, from a stylesheet",
  (() => {
    // They are used by NOTHING in the marketplace — the OnePage theme picker
    // writes them as raw CSS family names, so they need the family to be
    // available and do not care where it came from.
    const layout = read("app/layout.tsx")
    return (
      /fonts\.googleapis\.com\/css2\?family=DM\+Sans/.test(layout) &&
      /Montserrat/.test(layout) &&
      /Poppins/.test(layout) &&
      /Space\+Grotesk/.test(layout) &&
      /display=swap/.test(layout) &&
      /rel="preconnect" href="https:\/\/fonts\.gstatic\.com"/.test(layout)
    )
  })(),
)

check(
  "and they cannot blank the page while Google thinks about it",
  (() => {
    // A cross-origin <link rel="stylesheet"> in <head> is RENDER-BLOCKING: not
    // one pixel is painted until it lands. Blocking first paint on five
    // families that nothing in the marketplace uses is how a refresh of
    // storelib.com becomes a white screen followed by the whole page at once.
    const layout = read("app/layout.tsx")
    // Comments in here quote the tag they explain the removal of, so they are
    // stripped before the head is searched for one.
    const head = layout
      .slice(layout.indexOf("<head>"), layout.indexOf("</head>"))
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    return (
      // No blocking stylesheet tag anywhere in the head...
      !/<link\s+rel="stylesheet"/.test(head) &&
      !/rel="stylesheet"\s*\n?\s*href="https:\/\/fonts\.googleapis/.test(head) &&
      // ...and the sheet is appended from script, print-first, flipped on load.
      /bf\.media='print'/.test(head) &&
      /this\.media='all'/.test(head) &&
      /document\.head\.appendChild\(bf\)/.test(head)
    )
  })(),
)

console.log("\nThe phone gets the proposition too, and the chrome an account earns")

check(
  "a stranger on a phone is told what this place is",
  (() => {
    // The hero lived only on the desktop home, which is `hidden md:block`. So
    // the panel explaining what Storelib is, what it costs to sell and that
    // paying is protected was shown to nobody arriving on a phone — most first
    // visits — and the phone feed is a full-screen overlay, so there was not
    // even a page underneath it carrying the same words.
    //
    // Inside the scroller, above the grid: it is a promotion and it has to
    // scroll away. Not under a search, because a query is somebody who has
    // already decided what they want.
    const feed = code("components/explore/mobile-feed.tsx")
    return (
      // THE WHOLE HOME PAGE, not just the hero — the proposition, the
      // editorial, the queries and the five departments were all desktop-only.
      // Same component and same order, with `variant="phone"` dropping only the
      // `hidden md:block` wrapper, which inside this `md:hidden` shell would
      // hide the page at every width.
      /import \{ DesktopHome \} from "\.\/home\/desktop-home"/.test(feed) &&
      /const guestHome = !signedIn && !searchQuery/.test(feed) &&
      /<DesktopHome products=\{initialProducts\} signedIn=\{false\} variant="phone" \/>/.test(feed) &&
      /const shell = variant === "phone" \? "px-4 overflow-x-clip" : "hidden md:block"/.test(home) &&
      // On grey. The panel's edge is a hairline ring and a one-pixel contact
      // shadow, weights chosen against the desktop page's #f5f5f5; the feed is
      // white, and a near-white gradient panel on white is a card with no
      // visible edges. The strip also makes the promotion its own zone rather
      // than the first thing in the grid.
      /<div className="-mx-4 bg-\[#f5f5f5\] px-4 py-3">\s*\n\s*<SignedOutHero className="mb-0" \/>/.test(home) &&
      // And the category rail is not drawn over it: it is a filter for a grid
      // that is not there, and the departments are one of the sections under it.
      /const showCats = tab === "for-you" && !guestHome/.test(feed) &&
      // Server-resolved, not fetched here: a screen that renders one shape and
      // changes to the other a moment later is worse than either shape.
      /signedIn\?: boolean/.test(feed) &&
      /signedIn=\{signedIn\}/.test(code("components/explore/explore-page-client.tsx")) &&
      /signedIn=\{signedIn\}/.test(code("app/(marketing)/_explore-feed.tsx"))
    )
  })(),
  "        components/explore/mobile-feed.tsx",
)

check(
  "and the two tabs about an account are not offered to somebody without one",
  (() => {
    // Urmărești lists the people you follow and Salvate lists what you saved.
    // To a visitor with neither they are two words leading to two empty rooms —
    // a screen telling a first-time visitor what they do not have.
    //
    // The ROW goes, not the two tabs in it: dropping just those leaves Pentru
    // tine alone under an underline, which is not a tab any more but a heading
    // dressed as a choice. Both copies of the row — the white one over the grid
    // and the white-on-photo one over the reels — and the rule under it.
    const feed = code("components/explore/mobile-feed.tsx")
    return (
      (feed.match(/\{signedIn && TABS\.map|\{signedIn \? |signedIn && \(\n/g) ?? []).length >= 1 &&
      /\{signedIn && TABS\.map\(\(\[id, key\]\) => \{/.test(feed) &&
      /\{signedIn && <div className="shrink-0 mt-1 h-px"/.test(feed) &&
      // And `tab` is CORRECTED rather than guarded at every read — signing out
      // with Salvate open otherwise leaves a wishlist with no way back to the
      // feed, because the control that would switch it has just gone.
      /if \(!signedIn\) setTab\("for-you"\)/.test(feed)
    )
  })(),
  "        components/explore/mobile-feed.tsx",
)

check(
  "the hero is measured for a phone rather than shrunk onto one",
  (() => {
    // One column was always right below lg; desktop measurements on it were
    // not. 24px of side padding on a 375px screen is 13% of the width gone
    // before the headline starts, and `grid-cols-1` turned the three tiles into
    // ~300px of supporting detail under a button — on the one screen where the
    // hero has to stay short enough to leave listings visible.
    const hero2 = code("components/explore/home/signed-out-hero.tsx")
    return (
      /gap-7 px-5 py-7 sm:gap-10 sm:px-8 sm:py-9/.test(hero2) &&
      // A snapping rail below sm: all three tiles at the height of one, and the
      // next one peeking at the edge says so without a chevron or a row of dots.
      /snap-x snap-mandatory/.test(hero2) &&
      /snap-start/.test(hero2) &&
      // Bled to the panel's edges with the padding moved inside the scroller,
      // so the first tile lines up with the headline and the last one can still
      // scroll fully into view.
      /-mx-5[\s\S]{0,80}?scroll-px-5 px-5/.test(hero2) &&
      /sm:mx-0[\s\S]{0,60}?sm:grid sm:grid-cols-3/.test(hero2) &&
      // The caller owns the outer spacing — the page wants mb-8 on a 1400px
      // measure, the feed wants its own gutters, and a baked-in margin means one
      // of them is undoing it.
      /export function SignedOutHero\(\{ className \}/.test(hero2)
    )
  })(),
  "        components/explore/home/signed-out-hero.tsx",
)

check(
  "and on a phone the artwork runs past both edges of the panel it is on",
  (() => {
    // The panel has 20px of side padding, so the largest thing on it was drawn
    // in a 335px box on a 375px screen, with a strip of gradient either side
    // saying nothing. `-mx-5` is that padding given back — edge to edge, about
    // a twelfth larger — and `scale-[1.07]` is the rest of the twenty percent,
    // which takes it a little PAST both edges. Past is the point: a composition
    // stopping exactly at the edge reads as a picture in a frame, one running
    // off it reads as a window.
    const hero2 = code("components/explore/home/signed-out-hero.tsx")
    return (
      /<div className="-mx-5 scale-\[1\.14\] sm:mx-0 sm:scale-100">/.test(hero2) &&
      // TWO ELEMENTS, and that is not tidiness: `hero-art-drift` animates
      // `transform`, and a running animation beats a class setting the same
      // property — put the scale on the drifting box and the drift overwrites
      // it on its first keyframe. Scale on the parent, drift on the child.
      /<div className="hero-art-drift relative w-full"/.test(hero2) &&
      // Centred on a phone, left-aligned from lg. The toggle and the button are
      // both `inline-flex`, so both inline-level and both obeying text-align —
      // they were sitting hard against the left edge under a headline that
      // wrapped short of it.
      /<div className="min-w-0 text-center lg:text-left">/.test(hero2) &&
      // Except the tiles, which are a different object: centred text in a card
      // is a card with no reading edge.
      /scroll-px-5 px-5 text-left/.test(hero2) &&
      // And the buy CTA is two words. "Vezi ce e de vânzare" was five, on a
      // button that is the widest thing in a centred column.
      /cta: "Vezi anunțurile"/.test(hero2) &&
      !/Vezi ce e de vânzare/.test(hero2)
    )
  })(),
  "        components/explore/home/signed-out-hero.tsx",
)

check(
  "the shelves scroll sideways on a phone and the last section stays a grid",
  (() => {
    // `grid-cols-3` is three cards across 375px minus gutters — about 105px
    // each, for an object whose entire job is a photograph of a jumper. And
    // fifteen at three across is five rows deep: a "row" that is a third of the
    // screen and pushes everything under it out of reach.
    //
    // The rows are shelves — one idea, as many examples as you care to look at
    // — so the horizontal axis is the one that should be long. "Mai multe
    // anunțuri" is not: it has no idea in it and no end, and the marketplace on
    // a phone is the two-column grid the feed already draws.
    const row = code("components/explore/home/listing-row.tsx")
    const more = code("components/explore/home/more-listings.tsx")
    return (
      /-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4/.test(row) &&
      /sm:grid sm:grid-cols-3[\s\S]{0,80}lg:grid-cols-4 xl:grid-cols-5/.test(row) &&
      /w-\[43%\] shrink-0 snap-start sm:w-auto sm:shrink/.test(row) &&
      /grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3/.test(more) &&
      // Nothing left at three across on a phone in either file.
      !/"grid grid-cols-3/.test(row) &&
      !/"grid grid-cols-3/.test(more)
    )
  })(),
  "        components/explore/home/listing-row.tsx, components/explore/home/more-listings.tsx",
)

check(
  "and the page cannot be dragged sideways, because the bleeds have padding behind them",
  (() => {
    // The rails pull `-mx-4` so their first card lines up with the heading and
    // their last can still reach the middle of the screen. On the desktop page
    // that lands inside `px-4 sm:px-6 lg:px-8` on the container above. The phone
    // feed's scroller has no padding at all, so those bleeds had nothing to
    // cancel: every rail came out 32px wider than the screen, the document
    // gained horizontal overflow, and the whole page could be dragged left.
    //
    // The gutter belongs on the shell rather than on each section, because the
    // sections are shared with the desktop page — putting it there would be a
    // second gutter inside the first. And `overflow-x-clip` is the guarantee
    // behind it: `clip` rather than `hidden`, because `hidden` on one axis
    // forces the other to `auto` and would make a scroll container inside the
    // feed's scroller.
    const home = code("components/explore/home/desktop-home.tsx")
    const row = code("components/explore/home/listing-row.tsx")
    const more = code("components/explore/home/more-listings.tsx")
    const you = code("components/explore/home/you-might-be-into.tsx")
    const tiles = code("components/explore/home/shop-by-category.tsx")
    return (
      /const shell = variant === "phone" \? "px-4 overflow-x-clip" : "hidden md:block"/.test(home) &&
      // The grey strip under the hero bleeds back out to the screen's edges,
      // which is the one place the gutter is deliberately cancelled.
      /<div className="-mx-4 bg-\[#f5f5f5\] px-4 py-3">/.test(home) &&
      // And no section carries a phone gutter of its own, which would sit
      // inside the shell's and take another 16px off a 375px screen. The rail's
      // own `px-4`/`sm:px-0` pair is not that — it is the inside of a scroller
      // whose `-mx-4` cancels it, and the two are separated in the class string
      // by everything else the rail needs, which is why the pattern is the
      // contiguous one a section heading would have written.
      ![row, more, you, tiles].some((f) => /px-4 sm:px-0/.test(f))
    )
  })(),
  "        components/explore/home/desktop-home.tsx",
)

check(
  "the five category tiles are not two of them stretched into slabs",
  (() => {
    // The magazine grid is three at 4:5 and two at 16:10 — five things arranged
    // as five things, at SIX columns. Dropped into two, the ratios land on the
    // wrong rows: a 16:10 tile shares a row with a 4:5 one, the grid stretches
    // it to match, and the photograph inside letterboxes into a slab of flat
    // ground. That is the two tall dark blocks with a word floating in them.
    const tiles = code("components/explore/home/shop-by-category.tsx")
    return (
      // One ratio a row on a phone, and the fifth closes the block across the
      // full width rather than sitting alone beside a hole.
      /i === 4 \? "aspect-\[16\/9\]" : "aspect-\[4\/5\]"/.test(tiles) &&
      /i === 4 && "col-span-2 sm:col-span-3"/.test(tiles) &&
      // The six-column arrangement is untouched from sm up.
      /i < 3 \? "sm:aspect-\[4\/5\]" : "sm:aspect-\[16\/10\]"/.test(tiles) &&
      /i < 3 \? "sm:col-span-2" : "sm:col-span-3"/.test(tiles)
    )
  })(),
  "        components/explore/home/shop-by-category.tsx",
)

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
