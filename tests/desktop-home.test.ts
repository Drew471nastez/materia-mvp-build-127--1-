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
      //
      // AND IT IS THE THINGS THEMSELVES, not the ranking derived from them.
      // "Bazat pe vizualizările tale recente" is a good second row and a strange
      // first one: it opens the page on a guess about you rather than on your
      // own last move.
      //
      // WHICH SIDE OF THE HERO IT SITS ON DEPENDS ON THE SCREEN — see the note
      // beside `phoneFirst`. A phone puts it above (one column, and the
      // slideshow alone is a whole screenful); a desktop puts it below (both are
      // visible at once, so "below" costs nothing). Both branches are in this
      // file, so the ORDER checked here is the one common to both: the hero
      // comes before the ranking derived from your views, and the pills and
      // categories come after everything personal.
      "<HeroSlides",
      "Bazat pe vizualizările tale recente",
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
    // for; a pure button asks for a press every twelve cards. So the first press
    // is deliberate and the sentinel takes over after it.
    //
    // AND ON A PHONE THERE IS NO "AFTER". That trade is worth it on a desktop
    // page you scroll with a wheel through a section that is one of eight; on a
    // phone this section IS the rest of the screen, and an observer firing 600px
    // early means the page has no end — the footer is unreachable and every
    // flick loads twelve more photographs on whatever connection you are on.
    return (
      /const \[auto, setAuto\] = useState\(false\)/.test(more) &&
      /if \(manual \|\| !auto \|\| !hasMore\) return/.test(more) &&
      /\{manual \|\| !auto \? \(/.test(more) &&
      // Ten at a time, which on a phone's two columns is the five rows the
      // button then extends.
      /const PER_ROW = 5/.test(more) &&
      /const ROWS_PER_PAGE = 2/.test(more) &&
      /manual=\{variant === "phone"\}/.test(home)
    )
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
      /grid h-auto w-full shrink-0 grid-rows-\[264px_auto\]/.test(hero) &&
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
      // THREE gates now, not two: "Vizualizate recent" is written on both sides
      // of the hero and only one of them is drawn, so the file carries three
      // `personal &&` blocks for two rows on screen.
      (memberView.match(/\{personal && /g) ?? []).length === 3 &&
      /\{personal && phoneFirst && \(/.test(memberView) &&
      /\{personal && !phoneFirst && \(/.test(memberView) &&
      /const phoneFirst = variant === "phone"/.test(home) &&
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
      // Three, because "Vizualizate recent" is written twice — once either side
      // of the hero, one of which is drawn. Both copies carry the gate.
      (memberView.match(/minItems=\{ROW\}/g) ?? []).length === 3 &&
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
  //
  // Merged with a caller override rather than stated bare: 40px is the gap
  // BETWEEN sections, and the row that is FIRST on a page has nothing above it
  // to be separated from — see the `className` prop.
  /<section className=\{cn\("mt-10 sm:mt-14", className\)\}>/.test(row) &&
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
      /mb-8 overflow-visible rounded-2xl ring-1[\s\S]{0,140}?sm:overflow-hidden/.test(hero2) &&
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
      // Member: a top margin only when a row was drawn ABOVE it — which on a
      // desktop is never, because there the row goes below. And a bottom margin
      // always: 56px between a full-bleed picture and the listings under it was
      // a band of white wide enough to read as the end of the page, so the gap
      // after a photograph is one step quieter than the gap after a row of cards
      // with their own air.
      /<HeroSlides listings=\{products\} className=\{cn\("mb-11", personal && phoneFirst && "mt-11"\)\} \/>/.test(homeAll) &&
      // AND NEITHER COPY OF THE ROW CARRIES THE BETWEEN-SECTIONS GAP. Above the
      // hero it is the FIRST thing on the page and the only thing over it is the
      // search row, which has padding of its own — 40px there is a hole. Below
      // the hero the slideshow's own `mb-11` is already the join, and a second
      // margin would be two gaps for one seam.
      /className="mt-4"/.test(homeAll) &&
      /className="mt-0"/.test(homeAll) &&
      // Signed out: always, because something is always above it there.
      /<HeroSlides listings=\{products\} className="mb-11 mt-11" \/>/.test(homeAll)
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
      /const homePage = !searchQuery && !filteredByUrl && \(!signedIn \|\| !nativeShell\)/.test(feed) &&
      /<DesktopHome products=\{initialProducts\} signedIn=\{signedIn\} variant="phone" \/>/.test(feed) &&
      /const shell = variant === "phone" \? "px-4 overflow-x-clip" : "hidden md:block"/.test(home) &&
      // On grey. The panel's edge is a hairline ring and a one-pixel contact
      // shadow, weights chosen against the desktop page's #f5f5f5; the feed is
      // white, and a near-white gradient panel on white is a card with no
      // visible edges. The strip also makes the promotion its own zone rather
      // than the first thing in the grid.
      /<div className="-mx-4 bg-\[#f5f5f5\] px-4 py-3">\s*\n\s*<SignedOutHero className="mb-0" \/>/.test(home) &&
      // And the category rail is not drawn over it: it is a filter for a grid
      // that is not there, and the departments are one of the sections under it.
      /const showCats = tab === "for-you" && !homePage/.test(feed) &&
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
      // And not over the home page either, which a signed-in browser now gets:
      // three tabs above a marketing hero is chrome for a screen that is not
      // there.
      /\{signedIn && !homePage && <div className="shrink-0 mt-1 h-px"/.test(feed) &&
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
      /gap-x-7 gap-y-9 px-5 py-7 sm:gap-10 sm:px-8 sm:py-9/.test(hero2) &&
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
    // a twelfth larger — and the scale carries it PAST both edges rather than
    // up to them. Past is the point: a composition stopping exactly at the edge
    // reads as a picture in a frame, one running off it reads as a window.
    //
    // The exact factor is not pinned, because it has been tuned twice and will
    // be again; what is pinned is that it is a single-digit percent. Fourteen
    // was tried and the artwork became the panel rather than the largest thing
    // on it. A few pixels of overshoot prove the frame is not the edge of the
    // picture as well as forty do.
    const hero2 = code("components/explore/home/signed-out-hero.tsx")
    return (
      /<div className="-mx-5 scale-\[1\.0[0-9]\] sm:mx-0 sm:scale-100">/.test(hero2) &&
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
  "the artwork is allowed out of the panel on a phone, and the gap allows for it",
  (() => {
    // `overflow-hidden` cut the scaled composition off exactly at the panel's
    // edge, so the thing meant to run PAST the frame stopped at it — a picture
    // cropped to a rectangle rather than one spilling out of one. Visible below
    // sm, clipped from sm up where the artwork sits inside its column and there
    // is nothing to let out. The gradient is clipped by the radius either way:
    // `border-radius` bounds the background whether or not overflow is hidden,
    // so letting content out does not let the ground out with it.
    const hero2 = code("components/explore/home/signed-out-hero.tsx")
    return (
      /overflow-visible rounded-2xl[\s\S]{0,140}?sm:overflow-hidden/.test(hero2) &&
      // And the row gap is no longer the column gap. Scaling the artwork past
      // the edges grows it vertically too — fourteen percent of a 197px box is
      // about fourteen pixels off the top — so 28px between the tiles and the
      // picture was really fourteen once the picture had claimed its half.
      /gap-x-7 gap-y-9 px-5 py-7/.test(hero2) &&
      // The phone shell still clips sideways, so "out of the panel" never means
      // "out of the document" — see the shell guard above.
      /overflow-x-clip/.test(code("components/explore/home/desktop-home.tsx"))
    )
  })(),
  "        components/explore/home/signed-out-hero.tsx",
)

check(
  "and a shelf slide's cards fill it rather than floating in it",
  (() => {
    // 132px is a card measured for a half-slide on a desktop. Two of them on a
    // 375px screen use 276 of the 335 available and leave the rest as ground, in
    // a row that was 228 tall for cards about 216 — so the slide read as two
    // small pictures floating in a coloured box rather than as a shelf.
    const hero = code("components/explore/home/hero-slides.tsx")
    return (
      /"group\/card w-\[46%\] max-w-\[170px\] flex-col sm:w-\[132px\] lg:w-\[152px\]"/.test(hero) &&
      /grid-rows-\[264px_auto\]/.test(hero)
    )
  })(),
  "        components/explore/home/hero-slides.tsx",
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

console.log("\nA narrowed catalogue is a page, not the feed wearing a filter")

check(
  "the results page has a URL worth sending, and a count that comes from the database",
  (() => {
    // The home feed answers "what is new": an endless column with no count, no
    // page number and nothing that survives being sent to anybody. Somebody who
    // has narrowed to women's shoes under 200 lei in size 38 is looking at a
    // RESULT, which needs a title, a total, a way back up, and a URL that still
    // means the same thing tomorrow.
    const page = read("app/(marketing)/shop/[[...path]]/page.tsx")
    const ui = code("components/explore/category-results.tsx")
    const nav = code("lib/marketplace/department-nav.ts")
    return (
      // A PATH for the place and a QUERY STRING for the state. Femei ·
      // Încălțăminte has a title, a trail and its own results; the brand, the
      // size and the page are things that page can be in.
      /export function categoryPath/.test(nav) &&
      /return `\/shop\/\$\{departmentId\}\/\$\{groupSlug\(groupId\)\}`/.test(nav) &&
      // The slug strips everything before the FIRST dash, not "the department id
      // and a dash" — the groups in `entertainment` are prefixed `ent-`, so the
      // by-name version would have left four of the thirty-seven alone.
      /const dash = groupId\.indexOf\("-"\)/.test(nav) &&
      // Unrecognised paths widen rather than 404: a marketplace whose old links
      // 404 loses the visitor, one that widens the filter keeps them.
      /export function resolveCategoryPath/.test(nav) &&
      // The count is SQL, not the length of what happened to be fetched, and the
      // page is a range rather than a slice of something already downloaded.
      /count: "exact"/.test(page) &&
      /\.range\(from, from \+ PAGE_SIZE - 1\)/.test(page) &&
      // Five across at its widest, and a page size that is a multiple of it — a
      // ragged last row on every page reads as the data running out.
      /xl:grid-cols-5/.test(ui) &&
      /export const PAGE_SIZE = 90/.test(code("lib/marketplace/feed-filters.ts")) &&
      // Every control writes the URL and nothing else, so the back button, a
      // reload and a shared link all behave the way somebody expects.
      /router\.push\(qs \? `\$\{path\}\?\$\{qs\}` : path/.test(ui) &&
      // And a filter change goes back to page 1: keeping page 7 while narrowing
      // is how somebody lands on an empty screen that has results.
      /Only the pager itself keeps the page/.test(read("components/explore/category-results.tsx"))
    )
  })(),
  "        app/(marketing)/shop/[[...path]]/page.tsx, components/explore/category-results.tsx",
)

check(
  "the filters cannot show a page twice, offer a dead end, or miscount a sale",
  (() => {
    const page = read("app/(marketing)/shop/[[...path]]/page.tsx")
    const engine = code("lib/marketplace/feed-filters.ts")
    const sql = read("supabase/sql/RUN_SHOP_INDEXES.sql")
    const ui = code("components/explore/category-results.tsx")
    return (
      // A TOTAL ORDER, OR PAGES OVERLAP. `ORDER BY price_cents` is not one — a
      // catalogue full of listings at 50 lei has hundreds of rows the database
      // may return in any order, and it is free to choose a different one for
      // rows 0-89 and for rows 90-179. A row that crosses that boundary is shown
      // twice or not at all, and nothing on the page says so.
      // Five: the four sorts and the empty page's fallback shelf, which
      // paginates never but is still a query whose order must be stable.
      (page.match(/\.order\("id", \{ ascending: true \}\)/g) ?? []).length === 5 &&
      // ON SALE IS A COLUMN. It is a comparison between two columns, which
      // PostgREST cannot express — so it was applied AFTER the fetch, and the
      // total was the real count minus only what the current page dropped. The
      // pager then offered ninety pages of almost-empty results.
      /GENERATED ALWAYS AS \(compare_at_cents IS NOT NULL AND compare_at_cents > price_cents\) STORED/.test(sql) &&
      /if \(effective\.onSale && withSale\) s = s\.eq\("is_on_sale", true\)/.test(page) &&
      // With a fallback for a deploy that lands before the SQL is run — and the
      // page refuses to print a total it cannot stand behind.
      /saleIsExact = false/.test(page) &&
      /exactTotal\?: boolean/.test(ui) &&
      // EVERY FACET IS COUNTED WITH THE OTHERS APPLIED AND NOT ITSELF. Without
      // the cross-filter, picking Nike left the Size list offering every size in
      // the department — including the ones no Nike listing has, each a tap that
      // empties the page under a count that was the reason somebody trusted it.
      // Its own is excluded deliberately: a Brand list counted with the brand
      // filter applied offers only the brand already picked, which makes
      // multi-select impossible.
      /export function facetsWithCounts/.test(engine) &&
      /const others = \(except: keyof FeedFilters\)/.test(engine) &&
      /facets = facetsWithVocabulary\(facetsWithCounts\(attrRows, department, effective\), group\)/.test(page) &&
      // And the cross-filtering is ONE query's worth of rows, not five queries:
      // the non-facet filters go into SQL and the five passes happen over the
      // array. The second `.select(ATTR_COLS)` is the escape query, which runs
      // only on an empty page and only because the price cannot suggest dropping
      // itself from rows it has already emptied.
      (page.match(/\.select\(ATTR_COLS\)/g) ?? []).length === 2 &&
      /if \(rows\.length === 0\) \{/.test(page)
    )
  })(),
  "        app/(marketing)/shop/[[...path]]/page.tsx, lib/marketplace/feed-filters.ts",
)

check(
  "the department pages are indexable and every view of them is not",
  (() => {
    // /shop/women and /shop/women/shoes are real pages about real things — five
    // departments and thirty-seven groups, each with its own title, description
    // and canonical. Everything else is the same catalogue in a different order:
    // five multi-select facets times four sorts times the page numbers is a
    // combinatorial number of near-duplicates, which is how a marketplace ends
    // up with its own pages competing with each other.
    //
    // `follow: true` on all of them, because the LISTINGS behind a filter are
    // worth reaching even when the filtered view is not.
    const page = read("app/(marketing)/shop/[[...path]]/page.tsx")
    return (
      /const narrowed = q\.length > 0 \|\| \[\.\.\.sp\.keys\(\)\]\.length > 0/.test(page) &&
      /robots: narrowed \? \{ index: false, follow: true \} : undefined/.test(page) &&
      // And a canonical on every one of them, so the signal is not only "do not
      // index this" but "the page this is a view of is over there".
      /alternates: \{ canonical \}/.test(page) &&
      /description: groupLabel/.test(page)
    )
  })(),
  "        app/(marketing)/shop/[[...path]]/page.tsx",
)

check(
  "the filter sheet is one trip, and the sort sheet can be thrown away with a thumb",
  (() => {
    // SORT IS THE FIRST ROW OF THE FILTER SHEET. It is the same question as the
    // filters — "which of these, and in what order" — and splitting it into a
    // second sheet means two trips for one decision.
    //
    // "Șterge tot" moved to the HEADER. Beside the apply button at the same
    // weight it was a fifty-fifty choice between applying your work and throwing
    // it away; in the corner it is where a destructive action belongs.
    const sheet = code("components/explore/mobile-filter-sheet.tsx")
    return (
      /label: "Sortare după"/.test(sheet) &&
      /Afișare rezultate/.test(sheet) &&
      /onSortChange\?\.\(draftSort\)/.test(sheet) &&
      // It ARRIVES rather than appearing: `if (!open) return null` alone is a
      // sheet with nothing on screen to animate out of, so the close is a cut.
      /if \(!open && !leaving\) return null/.test(sheet) &&
      /transform: shown \? "translateY\(0\)" : "translateY\(100%\)"/.test(sheet) &&
      // Two frames before the open class lands — React can commit inside the
      // frame it was scheduled in, and a transition whose start and end are set
      // in one paint simply does not run.
      /requestAnimationFrame\(\(\) => requestAnimationFrame\(\(\) => setShown\(true\)\)\)/.test(sheet) &&
      // THE SORT SHEET DRAGS, and only downward — letting it go up lifts it off
      // the bottom of the screen and shows the page beneath, which is travel
      // past the frame for no reason.
      /setDrag\(Math\.max\(0, y - startY\.current\)\)/.test(sheet) &&
      // A third of its height OR a flick: distance alone punishes a fast flick
      // that did not travel far.
      /if \(drag > Math\.max\(80, h \* 0\.33\)\) onClose\(\)/.test(sheet) &&
      /onTouchMove=/.test(sheet) &&
      // z-[95] is ABOVE the tab bar's z-40. A sheet that stops short of it
      // leaves a strip of navigation lit over the thing it is covering.
      /className="fixed inset-0 z-\[95\]"/.test(sheet)
    )
  })(),
  "        components/explore/mobile-filter-sheet.tsx",
)

check(
  "nothing from the address bar reaches the filter as syntax",
  (() => {
    // `or=(title.ilike.%x%,…)` is a STRING PostgREST parses, and `q` came out of
    // the address bar. Four characters change the meaning of that string rather
    // than the value inside it: `,` appends a condition of the caller's
    // choosing, `)` closes the group early and 500s, and `%`/`_` are LIKE
    // wildcards — so `?q=%` is "match every row", a full scan of the catalogue
    // on a public URL that costs nothing to request.
    //
    // It could not leak an unpublished listing: `status = 'published'` is a
    // separate filter ANDed with the whole group, and RLS is under that again.
    // But "it cannot read what it should not" is the floor, not the goal.
    //
    // Two defences, because either alone is thin: the value is QUOTED, which is
    // what PostgREST's own documentation prescribes for reserved characters,
    // and the four that quoting cannot help with are removed.
    const page = read("app/(marketing)/shop/[[...path]]/page.tsx")
    const engine = code("lib/marketplace/feed-filters.ts")
    // The quoting and the stripping live in one module now, because the API
    // route builds the same filters against the same columns — two copies of
    // this is how one of them ends up a version behind.
    const terms = read("lib/marketplace/search-terms.ts")
    return (
      terms.includes('.replace(/[%_"\\\\]/g, " ")') &&
      /\$\{c\}\.ilike\."%\$\{pattern\}%"/.test(terms) &&
      /\$\{column\}\.ilike\."\$\{safeTerm\(raw\)\}"/.test(page) &&
      // And BOTH callers go through it. A hand-built pattern anywhere is the
      // whole guard gone.
      !/\.ilike\.%/.test(page) &&
      !/\.ilike\.\$\{/.test(read("app/api/v2/search/route.ts")) &&
      // Nothing builds the pattern by hand any more.
      !/title\.ilike\.%\$\{q\}%/.test(page) &&
      !/JSON\.stringify\(b\)/.test(page) &&
      // An all-punctuation query sanitises to nothing and is treated as NO
      // search, rather than as a search for "" — which is `ilike "%%"`.
      /const q = safeTerm\(sp\.get\("q"\) \|\| ""\)/.test(page) &&
      // AND THE NUMBERS ARE BOUNDED. `page` becomes an OFFSET: `?page=99999999`
      // is a query Postgres will try, reading and discarding nine billion rows.
      // A list becomes one condition each, so `?brand=` with two thousand
      // entries is a two-thousand-condition filter from one free request.
      /const page = Math\.min\(500, Math\.max\(1, Number\(sp\.get\("page"\)\) \|\| 1\)\)/.test(page) &&
      /const MAX_LIST = 20/.test(engine) &&
      /\.slice\(0, MAX_LIST\)/.test(engine) &&
      /Math\.min\(n, MAX_PRICE\)/.test(engine) &&
      // A band the wrong way round is a band, not an empty page: somebody typed
      // the two boxes in the order they read them.
      /const minPrice = lo != null && hi != null \? Math\.min\(lo, hi\) : lo/.test(engine)
    )
  })(),
  "        app/(marketing)/shop/[[...path]]/page.tsx, lib/marketplace/feed-filters.ts",
)

check(
  "the sort matches the index it was given, and the pages are in the sitemap",
  (() => {
    // "Populare" ordered by sales_count then REVIEWS_COUNT, while
    // idx_products_published_category_sales is (category, sales_count DESC,
    // created_at DESC) — a query whose second key is a different column cannot
    // use the index past the first. The index was written for this sort; the
    // sort had drifted off it.
    const page = read("app/(marketing)/shop/[[...path]]/page.tsx")
    const sql = read("supabase/sql/RUN_SHOP_INDEXES.sql")
    const map = read("app/sitemap.ts")
    return (
      /\.order\("sales_count", \{ ascending: false \}\)\s*\n\s*\.order\("created_at", \{ ascending: false \}\)/.test(page) &&
      /\(category, sales_count DESC, created_at DESC\)/.test(sql) &&
      // Forty-two real pages that were indexable and unlisted — the worst of
      // both, since a crawler could index them but had to find them first, and
      // the only links in were a menu behind a button and a bar rendered by a
      // client component.
      /for \(const dept of DEPARTMENT_NAV\)/.test(map) &&
      /\$\{BASE\}\$\{categoryPath\(dept\.id, group\.id\)\}/.test(map) &&
      // A group outranks its department: "Femei" is a listing, "Femei ·
      // Încălțăminte" is what somebody searches for.
      /priority: 0\.8,\s*\n\s*\}\)\s*\n\s*\}\s*\n\s*\}/.test(map)
    )
  })(),
  "        app/sitemap.ts",
)

check(
  "an empty page says which one filter to drop, and what it gives back",
  (() => {
    // "Try removing some filters" offers to undo everything, when the person has
    // usually got four things right and one thing wrong. Every marketplace that
    // has thought about this answers an empty page with arithmetic instead:
    // WHICH filter is costing you the results, and how many you get back.
    //
    // It costs nothing. The facet query already fetched the attribute rows for
    // this scope, so "how many without the size" is that array filtered with the
    // size cleared — and a filter whose removal still leaves zero is not offered
    // at all, because that is a second dead end.
    const engine = code("lib/marketplace/feed-filters.ts")
    const page = read("app/(marketing)/shop/[[...path]]/page.tsx")
    const ui = code("components/explore/category-results.tsx")
    return (
      /export function dropSuggestions/.test(engine) &&
      /if \(count > 0\) out\.push/.test(engine) &&
      /\.sort\(\(a, b\) => b\.count - a\.count\)/.test(engine) &&
      // Computed only on an empty page: five array passes behind ninety
      // listings nobody is struggling to find is work for nothing.
      //
      // AND OVER ROWS THE PRICE HAS NOT ALREADY REMOVED. It ran over `attrRows`,
      // which comes from a query with the price band and on-sale already applied
      // in SQL — so "how many if I drop the price" was asked of rows the price
      // had already emptied, the answer was always zero, and the filter most
      // likely to be the problem was the one this could never name. A page
      // reading "0 rezultate" under a 4–6 RON chip offered nothing but "clear
      // everything".
      /if \(rows\.length === 0\) \{/.test(page) &&
      /const \{ data: escapeRows \} = await eq\.limit\(1000\)/.test(page) &&
      /escapes = dropSuggestions\(\(escapeRows as any\[\]\) \?\? \[\], effective, facets\)/.test(page) &&
      // The scope and the search still apply — it is the same page, minus the
      // two filters whose own suggestions were being computed.
      !/eq\.gte\("price_cents"/.test(page) &&
      /Fără \{e\.label\}/.test(ui) &&
      /go\(withoutFilter\(view, e\.key\)\)/.test(ui)
    )
  })(),
  "        lib/marketplace/feed-filters.ts, components/explore/category-results.tsx",
)

check(
  "the refine bar follows you down the page, and the count is announced",
  (() => {
    // Ninety listings is about six screenfuls. With the controls at the top,
    // deciding at listing sixty that these are all too expensive means scrolling
    // six screens back — so the cheap move is to give up rather than to refine,
    // which is the opposite of what a filter is for.
    //
    // Pinned under whatever header the platform is showing: `--web-header-h` and
    // `--platform-header-h` are mutually exclusive, each zero while the other's
    // header is on screen, so their SUM is right everywhere without anybody
    // coordinating. z-30 is UNDER the header's z-40 — it slides beneath the
    // chrome rather than over it, the rule every sticky surface here follows.
    const ui = code("components/explore/category-results.tsx")
    return (
      /className="sticky z-30 -mx-4 mt-4 border-t border-neutral-200 bg-white/.test(ui) &&
      /top: "calc\(var\(--web-header-h, 0px\) \+ var\(--platform-header-h, 0px\)\)"/.test(ui) &&
      // AND THE COUNT IS SPOKEN. Everything on this page changes the results and
      // the only thing reporting that is a number in the corner — press three
      // filters with a screen reader and nothing at all is announced, so there
      // is no way to tell a filter that narrowed the page from one that did
      // nothing. Polite, so it waits for the current sentence rather than
      // interrupting it.
      /aria-live="polite"/.test(ui)
    )
  })(),
  "        components/explore/category-results.tsx",
)

check(
  "and the indexed pages carry the two things a search engine wants",
  (() => {
    // BreadcrumbList is what turns a result into "storelib.com › Femei ›
    // Încălțăminte" rather than a bare URL. ItemList is the page's own contents
    // in the page's own order, with prices and condition on each, which is what
    // lets a listing appear as a product rather than as a line of text.
    //
    // Built from `rows` — what was actually rendered — rather than from a second
    // query that could disagree with the numbers on the page. And only on the
    // pages that are indexed: structured data on a `noindex` page is markup
    // nobody will ever read.
    const page = read("app/(marketing)/shop/[[...path]]/page.tsx")
    return (
      /"@type": "BreadcrumbList"/.test(page) &&
      /"@type": "ItemList"/.test(page) &&
      /itemCondition: "https:\/\/schema\.org\/UsedCondition"/.test(page) &&
      /rows\.slice\(0, 30\)\.map/.test(page) &&
      // One test for "is this for a crawler", shared with `robots`, so the
      // markup and the meta tag cannot disagree.
      /const indexable = !q && \[\.\.\.sp\.keys\(\)\]\.length === 0/.test(page) &&
      /const jsonLd = indexable/.test(page)
    )
  })(),
  "        app/(marketing)/shop/[[...path]]/page.tsx",
)

check(
  "and a filter change says it is thinking instead of ignoring the tap",
  (() => {
    // Every control here navigates, and a navigation to a server component is a
    // round trip with no feedback of its own: the pill closes, then nothing
    // happens for as long as the query takes. On a slow connection that reads as
    // a page that ignored the tap — so the tap comes again, and the second one
    // lands on a page that is about to be replaced.
    //
    // The old results DIM rather than being replaced by a skeleton: what you are
    // reading is the closest thing there is to what you are about to get, and
    // grey boxes throw that away to show a placeholder.
    const ui = code("components/explore/category-results.tsx")
    const page = read("app/(marketing)/shop/[[...path]]/page.tsx")
    return (
      /const \[pending, startTransition\] = useTransition\(\)/.test(ui) &&
      /startTransition\(\(\) => router\.push\(/.test(ui) &&
      // BUT ONLY IF THE WAIT IS LONG ENOUGH TO NOTICE. `pending` is true from
      // the frame the transition starts, so a filter the server answers in 80ms
      // flashed the whole grid to half opacity and back — a blink on every
      // press, which reads as the page glitching rather than as it working.
      /const t = setTimeout\(\(\) => setWaiting\(true\), 140\)/.test(ui) &&
      /waiting && "pointer-events-none opacity-\[0\.55\]"/.test(ui) &&
      // AND THE CONTROL ITSELF ANSWERS ON THE FRAME IT IS PRESSED. Without
      // this, pressing "Nike" left the box empty and the pill unchanged for a
      // whole round trip, so it got pressed again — and the second press is a
      // toggle back off.
      /setDraft\(\{ f: next, sub: nextSub, sort: nextSort \}\)/.test(ui) &&
      /const view = draft\?\.f \?\? filters/.test(ui) &&
      // Cleared the moment real props land, so an abandoned navigation heals
      // rather than leaving the page lying about what is applied.
      /\}, \[filters, sub, sort\]\)/.test(ui) &&
      // A stale bookmark to page 7 of a category that has since sold down to
      // three is not an error; the pager is told the last page that exists.
      /const lastPage = Math\.max\(1, Math\.ceil\(total \/ PAGE_SIZE\)\)/.test(page) &&
      /page=\{Math\.min\(page, lastPage\)\}/.test(page)
    )
  })(),
  "        components/explore/category-results.tsx",
)

check(
  "and Enter in the search field runs the search",
  (() => {
    // The desktop field opened a suggestions panel and nothing else, so the only
    // way to run a query was to pick one of ITS answers — anything it had no
    // suggestion for could be typed in full, pressed Enter on, and simply sat
    // there. On a desktop, Enter in a search box is not a convenience, it is the
    // control.
    const hdr = code("components/platform/platform-header-client.tsx")
    const overlay = code("components/explore/mobile-search-overlay.tsx")
    return (
      /if \(e\.key === "Enter"\)/.test(hdr) &&
      /router\.push\(`\/shop\?q=\$\{encodeURIComponent\(v\)\}`\)/.test(hdr) &&
      // Same destination from the phone, so one search box is not a different
      // feature from the other.
      /`\/shop\?q=\$\{encodeURIComponent\(v\)\}`/.test(overlay) &&
      // And the header is drawn there at all — the page is reached FROM the
      // header's own menu and its own field.
      /p\.startsWith\("\/shop"\)/.test(code("components/marketing/conditional-header.tsx"))
    )
  })(),
  "        components/platform/platform-header-client.tsx",
)

check(
  "a query is words, not one substring — and the words are asked for in widening tiers",
  (() => {
    // ONE `ilike '%<the whole thing>%'` WAS THE ENTIRE SEARCH, and it fails in
    // three ordinary ways that all look identical from the outside — an empty
    // page. Two words in the wrong order ("Nike geaca de piele" does not contain
    // "geaca nike"); diacritics, on a marketplace where half the keyboards have
    // no ș on them; and one mistyped letter.
    //
    // So the query is tokenised and asked for strictly first, then loosely, and
    // the page stops at the first tier that has anything in it — a good query
    // keeps its precise answer and pays for exactly one round trip.
    const terms = code("lib/marketplace/search-terms.ts")
    return (
      // CHAINED `.or()` CALLS ARE ANDed BY PostgREST, which is the only reason
      // "every word, anywhere, in any order" is expressible at all: one group
      // per token for "all", one group total for the wider two.
      /if \(mode === "all"\) return tokens\.map\(groupFor\)/.test(terms) &&
      /return \[words\.map\(groupFor\)\.join\(","\)\]/.test(terms) &&
      // Diacritic-blind, using LIKE's own single-character wildcard: "barbati"
      // becomes `b_rb_t_` and finds "bărbați". Symmetric — typing the diacritics
      // finds the listings that lack them.
      /const FOLDABLE = \/\[aăâAĂÂiîIÎsșşSȘŞtțţTȚŢ\]\/g/.test(terms) &&
      // AND A PATTERN THAT IS MOSTLY WILDCARDS MATCHES MOSTLY EVERYTHING. "sase"
      // would be `____`; `b_rb_t_` is safe because `b?rb` is a consonant
      // skeleton almost nothing else in a clothing catalogue has, and THREE
      // anchor characters is what makes it a skeleton rather than a coincidence.
      /if \(folded \/ token\.length > 0\.6\) return null/.test(terms) &&
      /if \(token\.length - folded < 3\) return null/.test(terms) &&
      // The stem tier is a prefix, not an edit distance: one pattern the trigram
      // index can serve rather than a function call per row.
      /if \(token\.length < 5\) return null/.test(terms) &&
      // Tiers that would be the previous query again are not run.
      /if \(tokens\.length > 1 && words\.length > 0\) modes\.push\("any"\)/.test(terms) &&
      /if \(words\.some\(\(t\) => relaxToken\(t\) !== null\)\) modes\.push\("fuzzy"\)/.test(terms)
    )
  })(),
  "        lib/marketplace/search-terms.ts",
)

check(
  "a widened tier may only widen on a WORD — it never invents an answer for noise",
  (() => {
    // THE TIERS EXIST TO RESCUE A NEAR-MISS, AND A NEAR-MISS IS A WORD THAT WAS
    // NEARLY SPELLED RIGHT. `424i2` is not a word that was nearly anything —
    // and treating it as one is how a search starts inventing: it stems to
    // `424`, and `%424%` matches the listing that mentions 42.4 cm, the one that
    // costs 424 lei, and the one with 424 in a serial. Three confident,
    // unrelated results for keyboard noise, which is worse than the empty page
    // it was avoiding — an empty page is TRUE.
    //
    // Digits are IDENTIFIERS here (Jordan 4, Air Max 90, size 43, 501s). A
    // prefix of a number is not a blurrier version of that number, it is a
    // different number. The token is still searched for exactly, in the strict
    // tier; it is barred only from the tiers whose job is to be approximate.
    const terms = code("lib/marketplace/search-terms.ts")
    return (
      /export function isWordToken\(token: string\): boolean \{\s*\n\s*if \(\/\\d\/\.test\(token\)\) return false/.test(terms) &&
      // BOTH doors. `424i2` folded its `i` into `424_2` — a wildcard inside
      // keyboard noise, arriving at the same invention through the fold rather
      // than through the stem. There are no diacritics in a serial number.
      (terms.match(/if \(!isWordToken\(token\)\) return null/g) ?? []).length === 2 &&
      // "jrdn" has no stem worth recovering: cutting it down only makes a
      // shorter random string, which collides by accident more often, not less.
      /if \(!VOWEL\.test\(token\)\) return null/.test(terms) &&
      // Three characters is where a substring stops being a word and starts
      // being a coincidence — `%art%` is in cardigan, quart, Martens and start.
      /const keep = Math\.max\(4, Math\.ceil\(token\.length \* 0\.6\)\)/.test(terms) &&
      // AND THE FALLBACK IS THE STRICT READING, NEVER NO FILTER AT ALL. An empty
      // group list is the ENTIRE CATALOGUE returned under somebody's search
      // term — the loosest thing this can return has to be tier one.
      /if \(words\.length === 0\) return tokens\.map\(\(t\) => patternsFor\(t, "all"\)/.test(terms) &&
      // The full-text pass is gated on the same judgement, so the two halves of
      // the search cannot disagree about what is worth widening.
      /modes\.includes\("any"\) \? buildTsQuery\(words, "\|"\) : ""/.test(code("app/api/v2/search/route.ts"))
    )
  })(),
  "        lib/marketplace/search-terms.ts",
)

check(
  "the results page widens on the COUNT, and says so when it did",
  (() => {
    // `rows.length === 0` is ALSO true of page 9 of an 8-page result. Widening
    // there answers a stale bookmark by silently searching for something else —
    // so the trigger is the total, which is zero only when the query really
    // matched nothing.
    const page = code("app/(marketing)/shop/[[...path]]/page.tsx")
    const results = code("components/explore/category-results.tsx")
    return (
      /for \(let i = 1; i < modes\.length && \(res\.count \?\? 0\) === 0; i\+\+\)/.test(page) &&
      // A widening that found nothing either is not worth mentioning: the page
      // would say "showing results for X" above no results.
      /if \(\(res\.count \?\? 0\) === 0\) relaxed = null/.test(page) &&
      // The facets are counted with the SAME tier the grid was answered with, or
      // the filter list describes a stricter set that returned nothing.
      /for \(const g of textFilterGroups\(SEARCH_COLS, tokens, matchMode\)\) fq = fq\.or\(g\)/.test(page) &&
      // AND THE PAGE ADMITS IT. A grid of Jordans under the word "jordn" is
      // either a very good search or a broken one, and the only difference is
      // whether the page says which.
      /Niciun rezultat exact pentru/.test(results) &&
      /relaxed\.mode === "fuzzy"/.test(results)
    )
  })(),
  "        app/(marketing)/shop/[[...path]]/page.tsx",
)

check(
  "the taxonomy's third level is reachable, and validated against the group it arrived with",
  (() => {
    // Every listing carries a `subcategory` and the sell form insists on one, so
    // "Femei · Haine" is three hundred listings of which four are the dresses
    // somebody came for. Until this, no surface could browse to a leaf.
    //
    // A QUERY PARAMETER RATHER THAN A FOURTH PATH SEGMENT: the thirty-seven
    // group pages are the ones worth indexing, and three hundred leaf pages are
    // three hundred near-duplicates competing with them.
    const page = code("app/(marketing)/shop/[[...path]]/page.tsx")
    const results = code("components/explore/category-results.tsx")
    return (
      /\?\.items\.find\(\(i\) => i\.id === rawSub\) \?\? null/.test(page) &&
      /if \(sub\) s = s\.eq\("subcategory", sub\)/.test(page) &&
      /if \(sub\) fq = fq\.eq\("subcategory", sub\)/.test(page) &&
      // A leaf that is not one of this group's items resolves to nothing, so a
      // stale URL widens to the group rather than showing an empty page under a
      // heading naming a category that does not exist.
      /const sub = subItem\?\.id \?\? null/.test(page) &&
      // IT SURVIVES EVERY OTHER CONTROL and is dropped by the one thing that
      // invalidates it — Rochii is a kind of Haine, so carrying it onto
      // Încălțăminte is an empty page with a chip explaining why.
      /next\.group !== groupId \? null : sub/.test(results) &&
      /if \(extra\?\.sub\) p\.set\("sub", extra\.sub\)/.test(code("lib/marketplace/feed-filters.ts"))
    )
  })(),
  "        app/(marketing)/shop/[[...path]]/page.tsx",
)

check(
  "every way out of a home row lands on the results page, not the feed with a query string",
  (() => {
    // "Vezi mai multe" under Sugestii pentru tine pushed `/?q=` — the home page
    // with an empty search on it, which is the home page. Four rows offering a
    // way out, and every one of them a reload of the page you are on.
    const home = code("components/explore/home/desktop-home.tsx")
    const tiles = code("components/explore/home/shop-by-category.tsx")
    return (
      !/href="\/\?q="/.test(home) &&
      !/href="\/\?q="/.test(tiles) &&
      (home.match(/href="\/shop"/g) ?? []).length === 5 &&
      /href="\/shop"/.test(tiles) &&
      // And a department tile is a PLACE — `categoryPath`, the same helper the
      // header menu and the drawer use, rather than a hand-written query string
      // the results page has never read.
      /href=\{categoryPath\(t\.id\)\}/.test(tiles) &&
      !/\?category=/.test(tiles)
    )
  })(),
  "        components/explore/home/desktop-home.tsx",
)

check(
  "/shop has a loading boundary, and it is the shape of the page it stands in for",
  (() => {
    // A `force-dynamic` route with no loading boundary CANNOT BE USEFULLY
    // PREFETCHED — there is no static shell to cache, so `prefetch` on every
    // link into it fetched nothing and each press waited out three database
    // round trips before one pixel changed. That is what "browsing between
    // categories is not smooth" is: the menu closes and the page you left sits
    // there, which reads as the press not landing.
    //
    // And a shell whose grid is a different width from the real one turns one
    // wait into one wait AND a jump, so the columns, the gaps and the card's
    // 3:4 image box are copied from category-results.tsx rather than guessed.
    const shell = code("app/(marketing)/shop/[[...path]]/loading.tsx")
    const results = code("components/explore/category-results.tsx")
    const grid = /grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-8 lg:grid-cols-4 xl:grid-cols-5/
    return (
      grid.test(shell) &&
      grid.test(results) &&
      /max-w-\[1400px\] px-4 pb-16 pt-4 sm:px-6 lg:px-8/.test(shell) &&
      /aspect-\[3\/4\]/.test(shell) &&
      // Two rows, not ninety pulsing rectangles that are about to be thrown away.
      /Array\.from\(\{ length: 10 \}\)/.test(shell)
    )
  })(),
  "        app/(marketing)/shop/[[...path]]/loading.tsx",
)

check(
  "Șterge tot clears the filters — it does not move you to another page",
  (() => {
    // IT WAS `go(EMPTY_FILTERS)`, AND `EMPTY_FILTERS.group` IS NULL. So pressing
    // it on /shop/women/clothing walked you UP to /shop/women and took the leaf
    // with it: somebody looking at dresses who unticks two brands ends up a
    // level out with three hundred listings, and the only clue is the heading
    // changing under them.
    //
    // The scope is not a filter. The department, the group and the leaf are in
    // the path, the trail and the h1 — they are WHERE YOU ARE — and `buildChips`
    // never emits a chip for the group, so nothing beside this button ever
    // suggested it would navigate.
    //
    // Both surfaces, because the phone had the same bug through the sheet.
    const results = code("components/explore/category-results.tsx")
    const sheet = code("components/explore/mobile-filter-sheet.tsx")
    return (
      /const clearFilters = useCallback\(\(\) => go\(\{ \.\.\.EMPTY_FILTERS, group: view\.group \}\)/.test(results) &&
      // Nothing calls the scope-losing version any more.
      !/go\(EMPTY_FILTERS\)/.test(results) &&
      (results.match(/onClick=\{clearFilters\}/g) ?? []).length === 2 &&
      // The sheet is shared with the FEED, where the group really is one filter
      // among several over an array — so this is a prop the results page sets,
      // not a behaviour change imposed on both callers.
      /setDraft\(\(d\) => \(\{ \.\.\.EMPTY_FILTERS, group: lockedGroup \?\? d\.group \}\)\)/.test(sheet) &&
      /lockedGroup = null/.test(sheet) &&
      /lockedGroup=\{groupId\}/.test(results) &&
      // AND AN EMPTY LEAF OFFERS THE LEVEL ABOVE IT. `dropSuggestions` only ever
      // names brands, sizes, colours, condition and price, so an empty
      // Femei › Haine › Salopete with nothing else applied got a sentence on a
      // page whose one useful action is one level up.
      /go\(view, \{ sub: null \}\)/.test(results)
    )
  })(),
  "        components/explore/category-results.tsx",
)

check(
  "the filter dropdown moves, and it never opens off the side of the window",
  (() => {
    // `{open && <panel/>}` is a panel that EXISTS or does not — there is no
    // state between the two. So the control on this page you press most often
    // was the only surface in the app that CUT rather than moved, while the
    // sheet slides, the search panel fades and every drill-down pushes.
    //
    // The mount is held for the length of the close, the same two-state pattern
    // the search overlay and the filter sheet use, and the panel fades and rises
    // 6px out of the corner it is anchored to. `pointer-events: none` from the
    // frame the close starts, or a leaving panel eats the click meant for what
    // is behind it.
    //
    // AND IT FLIPS. `left-0` on a 244px panel hanging off a pill against the
    // right edge — Sortează is `ml-auto`, so it always is — puts a third of the
    // menu past the viewport. Measured rather than hard-coded per pill, because
    // the row WRAPS: which pill ends up against the edge is a function of the
    // window, not of the markup.
    const ui = code("components/explore/category-results.tsx")
    const pill = ui.slice(ui.indexOf("function Pill("), ui.indexOf("function FacetPill("))
    return (
      /const \[mounted, setMounted\] = useState\(open\)/.test(pill) &&
      /const t = setTimeout\(\(\) => setMounted\(false\), 210\)/.test(pill) &&
      // Two frames: React can commit inside the frame it was scheduled in, and
      // a transition whose start and end land in one paint does not run.
      /requestAnimationFrame\(\(\) => requestAnimationFrame\(\(\) => setShown\(true\)\)\)/.test(pill) &&
      /transform: shown \? "translateY\(0\) scale\(1\)" : "translateY\(-6px\) scale\(0\.97\)"/.test(pill) &&
      /pointerEvents: shown \? "auto" : "none"/.test(pill) &&
      // It grows OUT OF the pill rather than floating up beside it.
      /align === "right" \? "right-0 origin-top-right" : "left-0 origin-top-left"/.test(pill) &&
      /r\.left \+ PANEL_W \+ 16 > window\.innerWidth \? "right" : "left"/.test(pill) &&
      // The scrim lives and dies with `open`, not with the mount — one that
      // outlived the close would swallow the first click after it.
      /\{open && \(\s*\n\s*<button aria-hidden/.test(pill)
    )
  })(),
  "        components/explore/category-results.tsx",
)

check(
  "a search can be narrowed by category, three levels down, from either surface",
  (() => {
    // THE ONE THING YOU COULD NOT NARROW BY CATEGORY WAS A SEARCH. The Categorie
    // pill appeared only once you were already inside a department, and then it
    // listed that department's groups and nothing else — so `/shop?q=nike` had
    // no department, therefore no pill, therefore "nike in Bărbați" was not a
    // thing this site could express. It is the first filter anybody reaches for
    // on Depop or Vinted.
    //
    // Now: departments → groups → leaves, in place, always offered, on the same
    // push/pop as every other drill-down in the app.
    const ui = code("components/explore/category-results.tsx")
    const sheet = code("components/explore/mobile-filter-sheet.tsx")
    const menu = ui.slice(ui.indexOf("function CategoryMenu"), ui.indexOf("function MenuRow"))
    return (
      /<CategoryMenu/.test(ui) &&
      /const level = dept \? \(grp \? 2 : 1\) : 0/.test(menu) &&
      // It opens WHERE YOU ARE, because the reason to open it on
      // /shop/women/clothing is to go sideways to Pantofi — walking down from
      // the top to do that is two presses of ceremony before the real one.
      /useState<DepartmentNavItem \| null>\(\s*\n?\s*\(\) => DEPARTMENT_NAV\.find\(\(d\) => d\.id === departmentId\) \?\? null,?\s*\n?\s*\)/.test(menu) &&
      // The links CARRY THE SEARCH and drop the attribute filters: a size 38
      // chosen inside Femei · Încălțăminte means nothing in Divertisment, and
      // carrying it across is how somebody lands on an empty page wearing three
      // chips they never applied to this category.
      /if \(query\) p\.set\("q", query\)/.test(menu) &&
      /dir === "push" \? "sub-push" : "sub-pop"/.test(menu) &&
      // THE PHONE GETS THE SAME REACH. The sheet's Categorie row was gated on
      // `facets.groups.length > 0`, which is empty outside a department.
      /const groupOptions = useMemo<Facet\[\]>/.test(sheet) &&
      /if \(facets\.groups\.length > 0\) return facets\.groups/.test(sheet) &&
      /return DEPARTMENT_NAV\.flatMap/.test(sheet) &&
      // AND THE DEPARTMENT IS DERIVED FROM THE GROUP. Picking "Bărbați · Haine"
      // from /shop?q=nike used to build `categoryPath(null, "men-clothing")`,
      // which is "/shop" — the filter silently did nothing.
      /const nextDept = next\.group \? departmentForGroup\(next\.group\) \?\? departmentId : departmentId/.test(ui)
    )
  })(),
  "        components/explore/category-results.tsx",
)

check(
  "the filters are the category's vocabulary, and a dead option is inert not absent",
  (() => {
    // EVERY FACET WAS DERIVED FROM WHAT HAPPENED TO BE LISTED, which looks like
    // the feature working and is the feature missing: a category with nothing in
    // it has NO FILTERS AT ALL. Femei › Încălțăminte › Pantofi cu toc on a young
    // catalogue offered Categorie, Preț and a checkbox — no Mărime, no Culoare,
    // no Stare — because there was nothing to derive them from. They vanish
    // exactly when somebody most needs to see what this category narrows by.
    //
    // Three of the five are closed vocabularies the sell form already owns, and
    // they come in THEIR order: sorting sizes by popularity puts 42 before 36.
    // Brand stays derived, because it is free text and there is no list to
    // offer.
    //
    // AND THE CATEGORY DECIDES WHICH FILTERS EXIST. `fieldsFor` is the same
    // table the sell form asks — a bag has no size, a lipstick has neither size
    // nor era — so Divertisment does not offer a Mărime pill no listing in it
    // could answer.
    const engine = code("lib/marketplace/feed-filters.ts")
    const ui = code("components/explore/category-results.tsx")
    const sheet = code("components/explore/mobile-filter-sheet.tsx")
    return (
      /export function facetsWithVocabulary/.test(engine) &&
      /sizes: has\("size"\) \? merge\(sizesFor\(groupId\), counted\.sizes\) : \[\]/.test(engine) &&
      /colours: has\("colour"\) \? merge\(COLOURS, counted\.colours\) : \[\]/.test(engine) &&
      /conditions: merge\(conditionsFor\(groupId\), counted\.conditions\)/.test(engine) &&
      // Brand is NOT given a vocabulary — there is none to give.
      /brands: has\("brand"\) \? counted\.brands : \[\]/.test(engine) &&
      // A value the data has and the vocabulary does not is kept: a listing
      // carrying it must stay reachable, and a filter that cannot reach a
      // published listing is worse than an untidy list.
      /for \(const m of measured\) if \(!known\.has\(m\.value\.trim\(\)\.toLowerCase\(\)\)\) out\.push\(m\)/.test(engine) &&
      // Both surfaces go through it.
      /facetsWithVocabulary\(facetsWithCounts\(pool, departmentId, draft\), draft\.group\)/.test(sheet) &&
      /facetsWithVocabulary\(facetsWithCounts\(attrRows, department, effective\), group\)/.test(
        read("app/(marketing)/shop/[[...path]]/page.tsx"),
      ) &&
      // A ZERO IS DRAWN AND CANNOT BE PRESSED. Hiding it was right while the
      // list was derived — a missing option then meant "nobody has one". Against
      // a vocabulary, hiding is a lie of omission: it makes a category with
      // twelve sizes look like one with three.
      (ui.match(/disabled=\{o\.count === 0 && !on\}/g) ?? []).length === 1 &&
      (sheet.match(/disabled=\{o\.count === 0 && !on\}/g) ?? []).length === 1 &&
      // A TICKED option stays live whatever its count, or a filter could be
      // applied and then be impossible to undo from the list that set it.
      /o\.count === 0 && !on\s*$/m.test(ui) &&
      // The cross-filter that decides those counts is unchanged: each list
      // counted with the OTHER filters applied but not its own, which is what
      // stops a facet list eating itself.
      /const applied: FeedFilters = \{ \.\.\.f, group: except === "group" \? null : f\.group \}/.test(engine) &&
      /if \(k === except\) applied\[k\] = \[\]/.test(engine)
    )
  })(),
  "        lib/marketplace/feed-filters.ts",
)

check(
  "the trail is on every view, and the app never draws one",
  (() => {
    // It was drawn only inside a department, so /shop and every search began
    // with a bare heading and no way up that was not the browser's own Back —
    // a chevron in a bar that may be hidden on a phone browser, and off in the
    // corner of the window on a desktop.
    //
    // A SEARCH GETS ONE TOO. The old note said "Acasă › „nike”" pretends a
    // search is a place in a hierarchy; it was right about the shape and wrong
    // about the fix. The rung says "Rezultate" — the kind of page this is — and
    // the query stays in the h1 as the subject rather than as a rung.
    //
    // And `web-only`, because inside the app there is a back gesture, a back
    // arrow and a tab bar: a second, textual way back is a row of small grey
    // type nobody presses. CSS rather than a check in the component, because
    // the class is on <html> before the first pixel and an effect would paint
    // the trail and then take it away.
    const ui = code("components/explore/category-results.tsx")
    const css = read("app/globals.css")
    return (
      /className="web-only flex items-center gap-1\.5/.test(ui) &&
      /out\.push\(\{ label: "Rezultate" \}\)/.test(ui) &&
      /out\.push\(\{ label: "Toate anunțurile" \}\)/.test(ui) &&
      css.includes("html.capacitor .web-only {") &&
      // The last rung has no href: a link to the page you are on does nothing.
      /\{c\.href \? \(/.test(ui)
    )
  })(),
  "        components/explore/category-results.tsx, app/globals.css",
)

check(
  "the sort pill is not dressed as an applied filter",
  (() => {
    // Sort always has a value — there is always an order — so it drew itself
    // with the black outline every other pill uses to mean "you have narrowed by
    // this", on every page, forever. A permanent emphasis is not emphasis: it
    // made the one control nobody had touched the loudest thing in the row, and
    // it made the row's own language a lie about the other six.
    const ui = code("components/explore/category-results.tsx")
    return (
      /active\?: boolean/.test(ui) &&
      /\(active \?\? !!value\) \|\| open/.test(ui) &&
      /active=\{viewSort !== "new"\}/.test(ui) &&
      /icon=\{<ArrowUpDown/.test(ui)
    )
  })(),
  "        components/explore/category-results.tsx",
)

check(
  "the filters are the same seven, in the same order, on both surfaces",
  (() => {
    // Category, Brand, Price, Size, Colour, Condition, On sale — the order Depop
    // puts them in, and the one this marketplace is modelled on. It is not
    // arbitrary: Category is the widest cut and comes first, Brand is what
    // people actually search resale by, Price is the second-widest, and the
    // three garment attributes follow in the order somebody thinks of them. On
    // sale is a toggle rather than a list, so it closes the row.
    //
    // LOCKED, because a row of seven controls is exactly the kind of thing that
    // drifts one edit at a time: somebody adds Material next to Brand because
    // that is where the code happens to be, and the phone and the desktop stop
    // agreeing about what order these come in.
    const ui = code("components/explore/category-results.tsx")
    const sheet = code("components/explore/mobile-filter-sheet.tsx")

    const bar = ui.slice(ui.indexOf('className="hidden flex-wrap items-center gap-3 md:flex"'), ui.indexOf('id="sort"'))
    const desktop = [
      /id="group"[\s\S]*label="Categorie"/,
      /id="brands" label="Brand"/,
      /<PricePill/,
      /id="sizes" label="Mărime"/,
      /id="colours" label="Culoare"/,
      /id="conditions" label="Stare"/,
      /La reducere/,
    ]
    let at = -1
    const inOrder = desktop.every((re) => {
      const m = bar.slice(at + 1).search(re)
      if (m < 0) return false
      at = at + 1 + m
      return true
    })

    const rows = sheet.slice(sheet.indexOf("const rows:"), sheet.indexOf("return (\n    <div\n      className=\"fixed inset-0 z-[95]"))
    const sheetOrder = ["Sortare după", "Categorie", "Brand", "Preț", "Mărime", "Culoare", "Stare"]
    let rat = -1
    const sheetInOrder = sheetOrder.every((label) => {
      const m = rows.indexOf(`"${label}"`, rat + 1)
      if (m < 0) return false
      rat = m
      return true
    })

    return (
      inOrder &&
      sheetInOrder &&
      // Sort is last on the desktop — pushed to the far end of the row by
      // `ml-auto`, because it is not a filter and standing it beside six of them
      // is what made people read it as one.
      ui.indexOf('id="sort"') > ui.indexOf('id="conditions"') &&
      /className="ml-auto"/.test(ui) &&
      // And the sort options are Depop's three, in Depop's order, with ours
      // last. Populare used to sit second, splitting the price pair that people
      // actually compare and taking the most prominent slot after the default.
      /\{ id: "new".*\n.*\{ id: "price-asc".*\n.*\{ id: "price-desc".*\n.*\{ id: "popular"/.test(
        read("lib/marketplace/feed-filters.ts"),
      )
    )
  })(),
  "        components/explore/category-results.tsx, components/explore/mobile-filter-sheet.tsx",
)

check(
  "a long facet list can be searched, and keeps your selection in sight",
  (() => {
    // A brand facet on a real catalogue is forty to two hundred entries in a box
    // three hundred pixels tall, sorted by frequency. Finding Carhartt in that is
    // scrolling with no idea how far you are from the answer — which is why
    // Vinted and Depop both put a field at the top of theirs.
    //
    // AND THE SELECTION IS PINNED. Pick three brands out of two hundred, scroll,
    // and otherwise the three you picked are somewhere behind you: the list stops
    // telling you what you have chosen, which is the one thing it is for.
    //
    // Pinned from what was selected when the list OPENED, not live — pinning
    // live makes the row you just ticked leap to the top from under the cursor,
    // and the second tick lands on whatever slid into its place.
    const engine = code("lib/marketplace/feed-filters.ts")
    const ui = code("components/explore/category-results.tsx")
    const sheet = code("components/explore/mobile-filter-sheet.tsx")
    return (
      /export function orderFacetOptions\(options: Facet\[\], pinned: string\[\], term: string\)/.test(engine) &&
      // Matches the label AND the raw value: a brand's label is its commonest
      // spelling, so somebody typing the one that lost still finds it.
      /o\.label\.toLowerCase\(\)\.includes\(q\) \|\| o\.value\.toLowerCase\(\)\.includes\(q\)/.test(engine) &&
      // Both surfaces, one implementation.
      (ui.match(/orderFacetOptions\(options, pinned, term\)/g) ?? []).length === 1 &&
      (sheet.match(/orderFacetOptions\(options, pinned, term\)/g) ?? []).length === 1 &&
      (ui.match(/const \[pinned\] = useState\(selected\)/g) ?? []).length === 1 &&
      (sheet.match(/const \[pinned\] = useState\(selected\)/g) ?? []).length === 1 &&
      // Only where it is needed: a list you can see all of does not need a field.
      /export const FACET_SEARCH_MIN = 8/.test(engine) &&
      /options\.length >= FACET_SEARCH_MIN/.test(sheet) &&
      /const searchable = options\.length >= FACET_SEARCH_MIN/.test(ui)
    )
  })(),
  "        lib/marketplace/feed-filters.ts",
)

check(
  "nothing sits between the count and the filter bar except the subcategories",
  (() => {
    // TRAIL → TITLE → COUNT → SUBCATEGORIES → FILTERS → GRID. Depop's order and
    // Vinted's, and what this page settled into after two rails above the title
    // were removed for saying what the filter row already says:
    //
    //   THE DEPARTMENT RAIL was added to answer a real problem — the site's
    //   category bar is not drawn on /shop, so arriving from it lost the row you
    //   pressed. Then the Categorie pill grew into the whole taxonomy and
    //   answered the same problem properly, and nobody went back for the first
    //   fix. Six pills reaching a strict subset of what a pill one row below
    //   reaches is the same navigation twice.
    //
    //   THE POPULAR-BRANDS RAIL was a fair trade while Brand was an
    //   unsearchable forty-row scroller. It is searchable now, with what you
    //   have already picked at the top, so the rail became a worse copy of the
    //   pill directly beneath it.
    //
    // Three stacked rows of chrome between a nineteen-result count and the first
    // listing is how a page ends up looking busy while doing less.
    const ui = code("components/explore/category-results.tsx")
    const body = ui.slice(ui.indexOf("<WishlistProvider>"), ui.indexOf("<MobileFilterSheet"))
    const order = [
      'aria-label="Breadcrumb"',
      "<h1 ",
      'aria-live="polite"',
      "{leaves.length > 1 &&",
      // `code()` strips comments, so every anchor here has to be real code.
      'className="sticky z-30 -mx-4',
      "products.length === 0 ?",
    ]
    let at = -1
    const inOrder = order.every((needle) => {
      const i = body.indexOf(needle, at + 1)
      if (i < 0) return false
      at = i
      return true
    })
    return (
      inOrder &&
      // Neither rail comes back.
      !/aria-label="Departamente"/.test(ui) &&
      !/Branduri populare/.test(ui) &&
      !/DEPARTMENT_RAIL/.test(ui) &&
      // And the subcategory row that DOES belong there is the taxonomy's leaves,
      // which is the row Depop draws under its own title.
      /const leaves = useMemo\(/.test(ui)
    )
  })(),
  "        components/explore/category-results.tsx",
)

check(
  "the two ways out of an empty page are one row apart, and only one is primary",
  (() => {
    // They were two siblings each carrying its own `mt-5` and nothing between
    // them, so on the one page that draws both — an empty leaf that also has
    // filters on it — they met edge to edge and read as a single black slab
    // split by a hairline.
    //
    // And two black buttons side by side is two primary actions, which is none.
    // Widening to the whole group is the likelier intent, so it keeps the fill
    // and the other becomes the quiet one — but only while both are drawn. On
    // its own, "Șterge filtrele" is still the primary thing.
    const ui = code("components/explore/category-results.tsx")
    return (
      /\{\(viewSub \|\| active > 0\) && \(/.test(ui) &&
      /className="mt-5 flex flex-wrap items-center justify-center gap-2\.5"/.test(ui) &&
      /viewSub\s*\n\s*\? "border border-neutral-300 bg-white text-neutral-900 hover:border-neutral-400"\s*\n\s*: "bg-neutral-900 text-white"/.test(ui) &&
      // Neither carries its own top margin any more — the row owns the spacing.
      !/mt-5 inline-flex h-11 items-center rounded-lg bg-neutral-900/.test(ui)
    )
  })(),
  "        components/explore/category-results.tsx",
)

check(
  "a suggestion shares a word with what was typed, or it is not offered",
  (() => {
    // The expansion table was matched by substring containment in either
    // direction, per token — so "pantofi lux" lit up half the table and the
    // panel confidently offered Jordans to somebody shopping for smart shoes.
    // A suggestion that shares no word with the query is the panel talking
    // over you.
    //
    // A key now matches only when the query is SAYING it: as a prefix
    // mid-type, at a word boundary, or as a whole ≥3-letter token — "tn" and
    // "y2k" must be typed, not implied.
    const overlay = code("components/explore/mobile-search-overlay.tsx")
    return (
      /const keyMatches = \(key: string\): boolean =>/.test(overlay) &&
      /tokens\.some\(\(tk\) => tk\.length >= 3 && \(key === tk \|\| key\.startsWith\(tk\)\)\)/.test(overlay) &&
      !/key\.includes\(tk\) \|\| tk\.includes\(key\)/.test(overlay) &&
      // And an unknown word gets no invented "X vintage / X black" padding —
      // silence over invention, the same rule the search tiers follow.
      /if \(out\.length < 4 && \(scored\.length > 0 \|\| realTitles\.length > 0\)\)/.test(overlay)
    )
  })(),
  "        components/explore/mobile-search-overlay.tsx",
)

check(
  "an empty answer still shows a shelf, and the empty page's chrome behaves",
  (() => {
    // "Niciun rezultat" and a sentence is the end of a visit. The page now
    // widens by one HONEST step at a time — the group unfiltered, the
    // department, the catalogue — and puts fresh stock under "S-ar putea să-ți
    // placă". It borrows nothing from the failed query: matching it loosely is
    // the invention the search tiers refuse, and the heading says what the
    // shelf is.
    const page = read("app/(marketing)/shop/[[...path]]/page.tsx")
    const ui = code("components/explore/category-results.tsx")
    const sheet = code("components/explore/mobile-filter-sheet.tsx")
    const feed = code("components/explore/mobile-feed.tsx")
    return (
      /const scopes: \{ g\?: string \| null; d\?: string \| null \}\[\] = \[/.test(page) &&
      /if \(fallback\.length > 0\) break/.test(page) &&
      /S-ar putea să-ți placă/.test(ui) &&
      /fallback\.map\(\(p\) => \(/.test(ui) &&
      // The sheet locks the page under it — a drag that runs out of list must
      // not scroll the grid behind a full-screen sheet.
      /if \(!open\) return\s*\n\s*return lockScroll\(\)/.test(sheet) &&
      // The Filtre/Sortează pair answer with a tint, not a scale: `:active`
      // flickers when a scroll starts over a button, and a 3% shrink of a
      // full-width button is the "glitchy bump".
      !/Filtre[\s\S]{0,400}active:scale/.test(ui.slice(ui.indexOf('id="group"') - 4000, ui.indexOf('id="group"'))) &&
      /active:bg-neutral-100 active:duration-0/.test(ui) &&
      // The count badge centres its digit — default line-height floats it high.
      /font-bold leading-none text-white/.test(ui) &&
      // And the feed's filter trigger is the FUNNEL, the one glyph the industry
      // taught to mean filter, not three grey sliders.
      /<Funnel weight="duotone"/.test(feed)
    )
  })(),
  "        app/(marketing)/shop/[[...path]]/page.tsx, components/explore/category-results.tsx",
)

check(
  "three recent searches, not four",
  (() => {
    // A recent-searches list is a shortcut, not a history: past about three the
    // eye stops recognising rows and starts reading them, which costs more than
    // retyping the word. On the phone panel the fourth row pushes the
    // suggestions under the keyboard — the list nobody asked for hiding the one
    // they did.
    const overlay = code("components/explore/mobile-search-overlay.tsx")
    return /const recent = searches\.slice\(0, 3\)/.test(overlay)
  })(),
  "        components/explore/mobile-search-overlay.tsx",
)

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
