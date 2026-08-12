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
    ].map((s) => home.indexOf(s))
    return order.every((i) => i > 0) && order.every((v, i) => i === 0 || v > order[i - 1])
  })(),
)

check(
  "one row for the personal sections, three for the wider net",
  (() => {
    const based = home.slice(home.indexOf("Bazat pe vizualizările tale recente"))
    const suggested = home.slice(home.indexOf("Sugestii pentru tine"))
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
    return (
      /grid h-\[320px\] w-full shrink-0 grid-cols-/.test(hero) &&
      /lg:h-\[340px\]/.test(hero) &&
      // Both halves fill the row rather than stating their own height.
      /<div className="relative h-full">/.test(hero) &&
      /flex h-full items-center justify-center gap-3/.test(hero) &&
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
      /pl-\[72px\] pr-6 lg:pl-\[88px\]/.test(hero) &&
      /absolute bottom-5 left-\[72px\][\s\S]{0,80}lg:left-\[88px\]/.test(hero)
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
      (home.match(/\{personal && \(/g) ?? []).length === 2 &&
      home.indexOf("{personal && (") < home.indexOf("Bazat pe vizualizările tale recente") &&
      home.lastIndexOf("{personal && (") < home.indexOf("Vizualizate recent") &&
      // The pills are OUTSIDE both — that section is the one that carries an
      // early visit and must never be gated on history it does not have.
      home.indexOf("<YouMightBeInto") > home.lastIndexOf("{personal && (")
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
      (home.match(/minItems=\{ROW\}/g) ?? []).length === 2 &&
      !/minItems/.test(home.slice(home.indexOf("Sugestii pentru tine"), home.indexOf("<YouMightBeInto")))
    )
  })(),
)

check(
  "and the sections have more air between them",
  /<section className="mt-14">/.test(row) && /mt-20 border-t border-neutral-100 pt-14/.test(tiles),
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
  "the desktop shell is the shape of the page that is coming",
  (() => {
    // Removing it entirely was worse: a refresh drew the header, a category bar
    // and then the FOOTER — an empty document is a short one — and a second
    // later the real page shoved the footer two thousand pixels down. A
    // placeholder has one job, and one that holds the wrong space does the
    // opposite of it.
    return (
      /grid-cols-\[minmax\(0,0\.42fr\)_minmax\(0,0\.58fr\)\]/.test(loading) &&
      /xl:grid-cols-5/.test(loading) &&
      // The same hero height the real slide states — when these drift the
      // placeholder stops holding the space it exists to hold.
      /h-\[320px\]/.test(loading) &&
      /lg:h-\[340px\]/.test(loading) &&
      /\[0, 1, 2, 3, 4\]\.map/.test(loading)
    )
  })(),
)

check(
  "the hero placeholder does not pulse",
  (() => {
    // A 1400x260 block flashing grey is the most distracting thing a loading
    // screen can do, and it is the first thing on the page.
    const heroBlock = loading.slice(loading.indexOf("h-[320px]"), loading.indexOf("{[0, 1].map"))
    return !/animate-pulse/.test(heroBlock)
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
  "the hero image is drawn at its own ratio, so nothing is cropped",
  (() => {
    // The source is 1356x798 (1.70). It was in `aspect-[4/3]` (1.33) with
    // object-cover, so a fifth of the composition was cut off the sides, taking
    // most of both outer cards with it.
    const hero2 = code("components/explore/home/signed-out-hero.tsx")
    return (
      /const HERO_RATIO = "1356 \/ 798"/.test(hero2) &&
      /aspectRatio: HERO_RATIO/.test(hero2) &&
      !/aspect-\[4\/3\]/.test(hero2)
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
    const hero2 = code("components/explore/home/signed-out-hero.tsx")
    const titles = [...hero2.matchAll(/title: "([^"]+)", body:/g)].map((m) => m[1])
    return (
      /flex h-full flex-col rounded-xl/.test(hero2) &&
      titles.length === 6 &&
      titles.every((t) => t.split(" ").length <= 3)
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
      /\{!signedIn && <SignedOutHero \/>\}/.test(home) &&
      /signedIn = false \}: \{ products: any\[\]; signedIn\?: boolean \}/.test(home) &&
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

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
