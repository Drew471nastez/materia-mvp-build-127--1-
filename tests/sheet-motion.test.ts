/**
 * ===========================================================================
 *  THE SELL SHEET MOVES ON THE COMPOSITOR, OR IT DOES NOT MOVE WELL
 * ===========================================================================
 *
 * The slide up from the + in the tab bar, and the slide back down, were both
 * stuttering. The animation itself was never the problem — it is a single
 * `transform`, on the right curves, with the class present from the first
 * painted frame so there is no flash.
 *
 * What was wrong was everything ELSE happening during those frames:
 *
 *   1. FIVE backdrop-filters inside the moving element. A `backdrop-filter`
 *      under a transformed ancestor cannot be composited once and reused — the
 *      browser re-samples and re-blurs its backdrop on every single frame the
 *      ancestor moves. The header had one, and each photo tile had four, so a
 *      listing with six photos was fighting twenty-five live blur passes.
 *      Which is why it felt worse the more you had uploaded.
 *
 *   2. The close animation had to BUILD its compositor layer. `will-change`
 *      lived only on the two animation classes, and the enter class comes off
 *      once the sheet has arrived — so pressing X asked for a full-screen layer
 *      on the very frame the movement started.
 *
 * Both are the kind of thing that comes back the moment somebody adds a
 * tasteful blur to a chip, so they are written down here.
 *
 * Run with:  npm run test:push
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
    console.log(`  FAIL  ${name}${detail ? `\n${detail}` : ""}`)
  }
}

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const strip = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

import {
  DEPARTMENTS,
  LISTING_CATEGORIES,
  categoryShortLabel,
  departmentForGroup,
  groupsForDepartment,
} from "../lib/marketplace/listing-taxonomy"

const css = strip(read("app/globals.css"))
const taxonomy = strip(read("lib/marketplace/listing-taxonomy.ts"))
const form = strip(read("components/sell/new-listing-form.tsx"))
const bar = strip(read("components/explore/mobile-bottom-nav.tsx"))
const dragSheet = strip(read("components/ui/drag-sheet.tsx"))

console.log("\nThe sell sheet: what happens during the 400ms it is moving")

check(
  "every blur inside the sheet is suspended while it travels",
  /\.sell-sheet-enter \*,\s*\.sell-sheet-leave \*,\s*\.sell-sheet-armed \* \{[\s\S]{0,200}?backdrop-filter: none !important/.test(css),
  "        A backdrop-filter under a moving ancestor is re-blurred every frame.\n" +
    "        Six photos meant twenty-five of them against a 420ms slide.",
)

check(
  "the webkit prefix is there too",
  // Safari on iOS is the platform this was stuttering on. Unprefixed alone
  // would have suspended nothing where it actually mattered.
  /-webkit-backdrop-filter: none !important/.test(css),
)

check(
  "the header does not blur a background that is not there",
  (() => {
    // It sits directly on the sheet's own opaque colour, so the filter cost a
    // full re-composite per frame and bought no visual difference at all.
    const header = form.slice(form.indexOf("shrink-0 border-b border-neutral-200/80"))
    return /bg-white md:hidden/.test(header.slice(0, 120))
  })(),
)

check(
  "the compositor layer exists BEFORE the close starts moving",
  /\.sell-sheet-armed \{[\s\S]{0,80}?will-change: transform/.test(css) &&
    /setMotion\("armed"\)\s*\n\s*requestAnimationFrame\(\(\) => setMotion\("leave"\)\)/.test(form),
  "        Otherwise the browser builds a full-screen layer on the very frame\n" +
    "        the animation begins, which is the hitch at the start of a close.",
)

check(
  "both ways out of the sheet are armed, not just the X",
  // Closing by pressing X and closing by publishing are two different code
  // paths, and only one of them used to exist when this was written.
  (form.match(/setMotion\("armed"\)/g) ?? []).length >= 2,
)

check(
  "starting the animation does not re-render the form",
  (() => {
    // Every motion class used to be React state, so beginning the close
    // reconciled a 1,381-line component on the very frame the animation
    // started — main-thread work in the worst possible frame. The ref is the
    // source of truth now and the class goes straight onto the node.
    const usesRef = /const motion = useRef<SheetMotion>\("enter"\)/.test(form)
    const writesDirect = /el\.classList\.(add|remove)\(/.test(form)
    const noMotionState =
      !/useState\(false\)[\s\S]{0,40}leaving/.test(form) && !/setLeaving|setArmed|setEntering/.test(form)
    return usesRef && writesDirect && noMotionState
  })(),
)

check(
  "a re-render for any other reason cannot wipe the class mid-slide",
  // An upload finishing or a brand search returning re-renders this component
  // while the sheet is moving. className reads the same ref, so it recomputes
  // the class the animation is already using instead of clearing it.
  /MOTION_CLASS\[motion\.current\]/.test(form),
)

check(
  "the enter animation ends on an identity transform, not `none`",
  (() => {
    const enter = css.slice(css.indexOf("@keyframes sell-sheet-enter"), css.indexOf("@keyframes sell-sheet-leave"))
    // `none` removes the transform outright, which takes the element off its
    // compositor layer ON THE LAST FRAME — the slide finishing with a promotion
    // torn down and a full-screen repaint, exactly where it should settle.
    return /to\s*\{ transform: translate3d\(0, 0, 0\); \}/.test(enter) && !/transform: none/.test(enter)
  })(),
)

check(
  "the layer is released when the browser says it finished, not on a timer",
  // A timer set to 460 for a 420ms animation was both a guess and 40ms of a
  // full-screen layer nobody needed.
  /onAnimationEnd=\{onSheetAnimationEnd\}/.test(form) && !/setTimeout\(\(\) => setEntering/.test(form),
)

check(
  "arming is a frame, not a guessed delay",
  // rAF is precisely "after the browser has had a chance to act on the class I
  // just set", which is the entire requirement. A timeout would be a number
  // somebody picked.
  !/setTimeout\([^)]*setLeaving\(true\)/.test(form),
)

check(
  "the navigation still lands inside the slide, not on top of it",
  (() => {
    // The animation now begins one frame later than the timer that fires the
    // route change, so the old 280 landed 36ms inside a 300ms slide instead of
    // the 20 it was tuned for — the screen behind appearing while the sheet
    // still had visible travel left.
    const back = /}, 296\)/.test(form)
    const publish = /}, 316\)/.test(form)
    return back && publish
  })(),
)

check(
  "it animates transform and nothing else",
  (() => {
    const enter = css.slice(css.indexOf("@keyframes sell-sheet-enter"), css.indexOf("@keyframes sell-sheet-leave"))
    // Anything else — height, top, opacity over a full-screen subtree — drops
    // the whole animation onto the main thread, where it competes with a
    // 1,300-line form mounting.
    return /translate3d/.test(enter) && !/(height|top|left|width|opacity):/.test(enter)
  })(),
)

check(
  "none of this runs on a desktop, where it is a page rather than a sheet",
  /\.sell-sheet-enter,\s*\.sell-sheet-leave,\s*\.sell-sheet-armed \{ animation: none; will-change: auto; \}/.test(css),
)

check(
  "the screen behind the sheet does not dip",
  (() => {
    const press = bar.slice(bar.indexOf("onPress: (intent)"), bar.indexOf("onAbandon:"))
    // THE FLASH. The dip exists because a tab change is a HANDOVER — the screen
    // you are on is going away, so it starts moving under your finger. None of
    // that is true of the sell sheet: it slides up OVER a screen that stays
    // mounted and that you come back to. Dipping it to 0.88 and releasing it on
    // commit is the page behind visibly dimming and brightening again while the
    // sheet travels across it.
    return /if \(intent\.key === "sell"\) return/.test(press) &&
      press.indexOf('intent.key === "sell"') < press.indexOf("beginTabLeave()")
  })(),
  "        Otherwise the listings behind the rising sheet change brightness\n" +
    "        for a reason nobody can name.",
)

check(
  "the dip is still armed for the four tabs that really do hand over",
  /if \(intent\.href && intent\.key !== nav\.current\.here\) nav\.current\.beginTabLeave\(\)/.test(bar),
)

check(
  "the sheet route is exempt from the tab fade as well",
  // Two different animations, both of which would have played over the slide.
  /pathname\.startsWith\("\/products\/new"\)\) return null/.test(
    strip(read("components/marketing/tab-transition.tsx")),
  ),
)

check(
  "and the screen underneath is not scrolled to the top while it is covered",
  // Closing the sheet would otherwise drop you at the top of a profile you had
  // scrolled halfway down — a navigation you never made.
  /pathname\?\.startsWith\("\/products\/new"\)\) return/.test(
    strip(read("components/marketing/shell-scroll-reset.tsx")),
  ),
)

console.log("\nA closed sheet paints nothing, and renders nothing")

check(
  "what a sheet is doing is ONE variable, not three booleans in agreement",
  (() => {
    // Painted-or-not, mounted-or-not and moving-or-not are the same question
    // asked three ways, and they were answered separately — a delayed
    // visibility transition, an always-mounted subtree, and `open`.
    return /type Stage = "closed" \| "arming" \| "open" \| "leaving"/.test(dragSheet)
  })(),
)

check(
  "a parked picker does not cast its shadow back onto the screen",
  (() => {
    // THE BLACK FADE ALONG THE BOTTOM OF THE SELL FORM. DragSheet is never
    // unmounted — it has to exist to be able to slide — and when closed it sits
    // at translateY(100%), immediately below the viewport, carrying
    // shadow-[0_-8px_40px_-8px_rgba(0,0,0,0.28)]. That shadow points UP, so it
    // was cast back INTO the visible area for as long as the sheet was closed,
    // which is almost always. The sell form renders EIGHT of them.
    return (
      /visibility: up \|\| stage === "leaving" \? "visible" : "hidden"/.test(dragSheet) &&
      /shadow-\[0_-8px_40px/.test(dragSheet)
    )
  })(),
)

check(
  "hiding waits for the slide to finish — and the wait IS the state",
  (() => {
    // `visibility` cannot be transitioned, and the old version delayed it by a
    // hand-written 360ms that was only equal to the animation by coincidence.
    // `leaving` is that interval, so the duration is stated once.
    return (
      /leaveTimer\.current = window\.setTimeout\(\(\) => setStage\("closed"\), SHEET_MS\)/.test(dragSheet) &&
      /const SHEET_TRANSITION = `transform \$\{SHEET_MS\}ms \$\{SHEET_EASE\}`/.test(dragSheet)
    )
  })(),
)

check(
  "the list is built in a frame where nothing is moving",
  (() => {
    // Mounting a picker and starting its transform on the SAME frame spends the
    // animation's first frames building DOM. `arming` is one frame in which the
    // children mount against a parked panel, and the slide starts against a
    // layout that has already settled.
    const armed = dragSheet.slice(dragSheet.indexOf('if (stage !== "arming") return'))
    return (
      /void sheetRef\.current\?\.offsetHeight/.test(armed.slice(0, 400)) &&
      /requestAnimationFrame\(\(\) => setStage\(\(s\) => \(s === "arming" \? "open" : s\)\)\)/.test(
        armed.slice(0, 400),
      )
    )
  })(),
  "        offsetHeight is the forced flush: two style changes inside one frame\n" +
    "        collapse into one, and the sheet appears in place instead of sliding.",
)

check(
  "a closed picker's contents are not in the tree at all",
  (() => {
    // Eight pickers' worth of options — every category, every brand, thirty-one
    // styles — were reconciled on every keystroke in the title field, and built
    // during the sell form's own mount. That is why the first tap felt slow:
    // the work was not being done lazily, it was being done constantly.
    return /\{painted \? children : null\}/.test(dragSheet)
  })(),
)

check(
  "re-opening catches a sheet that is still on its way down",
  (() => {
    // Its children are already mounted, so there is nothing to arm — and
    // re-arming would blank it mid-slide, because `arming` is deliberately not
    // painted.
    return /if \(stageRef\.current === "leaving"\) setStage\("open"\)/.test(dragSheet)
  })(),
)

check(
  "the timer is set in an effect, not inside a state updater",
  (() => {
    // An updater is a function React is free to call twice; a setTimeout inside
    // one leaks the first timer, and the leaked one is the untracked one.
    const fx = dragSheet.slice(dragSheet.indexOf("window.clearTimeout(leaveTimer.current)"))
    return !/setStage\(\(s\) => \{/.test(fx.slice(0, 600))
  })(),
)

check(
  "a flick-to-dismiss goes through the same state, not around it",
  (() => {
    // The drag handler used to write `visibility: hidden` straight onto the
    // node, which meant the hiding rule existed in two places and only one of
    // them was the one anybody read.
    const end = dragSheet.slice(dragSheet.indexOf("const onTouchEnd"))
    return !/el\.style\.visibility/.test(end) && /onClose\(\)/.test(end)
  })(),
)

check(
  "the drag and the transition share one easing string",
  // React only rewrites a style property when its own value changes between
  // renders, so a drag that left a different curve on the node would leak it
  // into every open and close afterwards.
  (() => {
    const end = dragSheet.slice(dragSheet.indexOf("const onTouchEnd"))
    return /el\.style\.transition = SHEET_TRANSITION/.test(end) && /transition: SHEET_TRANSITION/.test(dragSheet)
  })(),
)

check(
  "there is a grabber, and it is the thing you drag",
  (() => {
    // The pill was removed once for looking dated. It is the one shape every
    // phone user already reads as "pull this down", and the sheets it was taken
    // off are sheets you can in fact pull down — so its absence was not
    // restraint, it was a gesture with no affordance.
    const zone = dragSheet.slice(dragSheet.indexOf("onTouchStart={onTouchStart}"))
    return /rounded-full bg-neutral-300/.test(zone.slice(0, 900))
  })(),
)

check(
  "only the header zone arms the drag",
  (() => {
    // A sheet that dismisses itself when somebody flings a long brand list
    // towards the top is unusable.
    const zone = dragSheet.slice(dragSheet.indexOf('className="shrink-0 touch-none select-none"'))
    return zone.indexOf("onTouchStart={onTouchStart}") < zone.indexOf("overflow-y-auto")
  })(),
)

check(
  "the height is measured once, not on every touchmove",
  (() => {
    // Reading a layout property mid-gesture forces a synchronous layout flush,
    // and it was being asked for once per touch event on a sheet holding a
    // hundred and sixty rows. It cannot change while a finger is on the sheet.
    const move = dragSheet.slice(dragSheet.indexOf("const onTouchMove"), dragSheet.indexOf("const onTouchEnd"))
    return !/offsetHeight/.test(move) && /height: sheetRef\.current\?\.offsetHeight \|\| 1/.test(dragSheet)
  })(),
)

check(
  "the drag paints once per frame, not once per event",
  (() => {
    // Touch events outrun the compositor on a 120Hz screen, so the same two
    // style writes were done several times for one visible frame.
    const move = dragSheet.slice(dragSheet.indexOf("const onTouchMove"), dragSheet.indexOf("const onTouchEnd"))
    return (
      /if \(!frameId\.current\) frameId\.current = requestAnimationFrame\(paint\)/.test(move) &&
      !/el\.style\.transform/.test(move)
    )
  })(),
)

check(
  "the scrim animates on its own layer, and in step with the sheet",
  (() => {
    // A full-viewport opacity animation without a layer is a full-viewport
    // repaint per frame, on the same frames the sheet is asking for. Matching
    // the duration is why the screen finishes dimming as the panel lands.
    return (
      /willChange: painted \? "opacity" : "auto"/.test(dragSheet) &&
      /transition: `opacity \$\{SHEET_MS\}ms \$\{SHEET_EASE\}`/.test(dragSheet)
    )
  })(),
)

check(
  "a mobile sheet has no close button",
  (() => {
    // There were three ways out — pull it down, tap the dimmed screen, press
    // the X — and the X was the only one that needed a control drawn for it and
    // the only one that was not already a habit. Desktop keeps one, because
    // none of the other three survive the trip to a mouse.
    const at = dragSheet.indexOf('aria-label="Închide"')
    return at > 0 && /hidden h-8 w-8 [^"]*md:flex/.test(dragSheet.slice(at, at + 420))
  })(),
)

check(
  "the compositor layer is held only while the sheet is on screen",
  /willChange: painted \? "transform" : "auto"/.test(dragSheet),
)

check(
  "the other bottom sheet was already fine and is left alone",
  // components/ui/bottom-sheet.tsx unmounts once its exit animation finishes,
  // so it has nothing parked off-screen to cast anything.
  /if \(!mounted \|\| typeof document === "undefined"\) return null/.test(
    strip(read("components/ui/bottom-sheet.tsx")),
  ),
)

console.log("\nWhat is inside a picker")

check(
  "a one-word choice is a chip, not a 56px row",
  (() => {
    // Thirty-one styles, nineteen colours and nine sizes were nine hundred
    // pixels of identical rows each, every one of them containing a single
    // word. A list is the right shape for a choice you have to READ; for one
    // you RECOGNISE it puts most of the vocabulary below the fold and makes
    // comparing two of them a scroll.
    const chipped = ["size", "colour", "source", "era", "style"]
    return chipped.every((k) => {
      const at = form.indexOf(`open={sheet === "${k}"}`)
      return at > 0 && /<ChipField>/.test(form.slice(at, at + 900))
    })
  })(),
)

check(
  "the condition ladder stays a list, and each rung says what it means",
  (() => {
    // The five labels are a database constraint and cannot change; on their own
    // they are five synonyms for "used", and the difference between them is the
    // difference between an accurate listing and a return.
    const at = form.indexOf('open={sheet === "condition"}')
    return /<OptionRow/.test(form.slice(at, at + 500)) && /const CONDITION_HINTS: Record<string, string> = \{/.test(form)
  })(),
)

check(
  "the six pickers share one row and one chip, not six near-copies",
  (() => {
    // Every sheet used to write its own — a rounded box, a hover tint, a check
    // floated right, 2px of padding so the rows sat in from the edges — and no
    // two were quite the same.
    return (
      /function OptionRow\(/.test(form) &&
      /function OptionChip\(/.test(form) &&
      /function SheetSearch\(/.test(form) &&
      !/rounded-lg px-3 py-2\.5 text-left/.test(form)
    )
  })(),
)

check(
  "no picker row carries a hover style",
  // A phone has no hover, and these produced a highlight that stuck after a tap
  // on iOS.
  !/hover:bg-neutral-50/.test(form),
)

check(
  "the multi-select limit is a line of its own, not crammed into the title",
  // "Stil · alege până la 3" put two different things on the one line a phone
  // sheet gives a title.
  /function PickerNote\(/.test(form) && !/alege până la 3"/.test(form),
)

check(
  "the rare case is what gets marked, not the common one",
  (() => {
    // First an asterisk after every label, then a coloured dot before every
    // heading. Both are the same mistake: on a form where eleven of fourteen
    // fields are required, marking the required ones puts a badge on almost
    // every line and tells you nothing. A mark is only information where it is
    // rare — so the three OPTIONAL fields say so and nothing else does.
    return (
      /function OptionalTag\(\)/.test(form) &&
      !/function Req\(\)/.test(form) &&
      !/text-\[#7c3aed\]">\*<\/span>/.test(form) &&
      (form.match(/<Field label="[^"]+" optional/g) ?? []).length === 3
    )
  })(),
)

console.log("\nFinding a category")

check(
  "the picker asks who it is for before it asks what it is",
  (() => {
    // Twenty-two groups and about a hundred and sixty leaves arrived as one
    // flat scroll, every heading repeating the department because that was the
    // only thing telling "Bărbați · Încălțăminte" from "Damă · Încălțăminte".
    return /DEPARTMENTS\.map\(\(d\) => \(/.test(form) && /catGroups\.map\(\(g\) => \(/.test(form)
  })(),
)

check(
  "the department is a route, not a value",
  (() => {
    // products.category still stores the group id and products.subcategory the
    // leaf. Persisting the department would mean a migration and a second
    // source of truth for something derivable from the group.
    const submit = form.slice(form.indexOf("const submit ="), form.indexOf("const submit =") + 3000)
    return !/catDep/.test(submit) && /export function departmentForGroup/.test(taxonomy)
  })(),
)

check(
  "a group that is sold for everyone appears under every department",
  (() => {
    // Accessories, bags, sportswear, swimwear and underwear are not a fourth
    // department nobody would think to open.
    const women = groupsForDepartment("women").map((g) => g.id)
    const men = groupsForDepartment("men").map((g) => g.id)
    const kids = groupsForDepartment("kids").map((g) => g.id)
    return (
      women.includes("accessories") && men.includes("accessories") && kids.includes("accessories") &&
      women.includes("women-dresses") && !men.includes("women-dresses") && !kids.includes("women-dresses")
    )
  })(),
)

check(
  "every group is reachable from some department",
  (() => {
    // A group nobody can drill into is a category that can never be chosen
    // again — including on listings that already use it.
    const reachable = new Set(
      DEPARTMENTS.flatMap((d) => groupsForDepartment(d.id).map((g) => g.id)),
    )
    return LISTING_CATEGORIES.every((g) => reachable.has(g.id))
  })(),
)

check(
  "re-opening lands where the choice was made",
  (() => {
    // Coming back to change "Rochii midi" to "Rochii maxi" and being asked who
    // it is for again is the drill-down charging you for a decision you have
    // already made.
    return (
      /const dep = departmentForGroup\(group\)/.test(form) &&
      departmentForGroup("women-dresses") === "women" &&
      departmentForGroup("men-suits") === "men" &&
      departmentForGroup("kids") === "kids" &&
      departmentForGroup(null) === null
    )
  })(),
)

check(
  "the department is not repeated inside its own list",
  categoryShortLabel({ id: "women-dresses", label: "Damă · Rochii și salopete", items: [] }) ===
    "Rochii și salopete" &&
    categoryShortLabel({ id: "bags", label: "Genți", items: [] }) === "Genți",
)

check(
  "search cuts across the whole tree, and replaces the drill-down while it is on",
  (() => {
    // Somebody who already knows the word should not have to walk three levels
    // to reach it — and a back button pointing at a level the search is hiding
    // is a control that lies.
    return /onBack=\{!catQuery\.trim\(\) && \(catDep \|\| catGroup\) \? categoryBack : undefined\}/.test(form)
  })(),
)

check(
  "going down and choosing look different",
  (() => {
    // One closes the sheet with an answer, the other asks the next question.
    // Getting that wrong is how a drill-down feels like a trap.
    const drill = form.slice(form.indexOf("function DrillRow("), form.indexOf("function OptionChip("))
    return /<ChevronRight/.test(drill) && !/<Check/.test(drill)
  })(),
)

console.log("\nHow fast a picker fills")

check(
  "the brand list is fetched while the form mounts, not when the sheet opens",
  (() => {
    // Brand is required, so the picker WILL be opened, and a request that
    // starts when the sheet does is a request the animation has to wait for.
    // `}, [])` is the whole claim: a mount effect, not one keyed on the sheet.
    return /fetch\("\/api\/brands\?q=", \{ credentials: "include" \}\)[\s\S]{0,420}?\}, \[\]\)/.test(form)
  })(),
)

check(
  "warming never overwrites a search result that came back first",
  /setBrands\(\(b\) => \(b\.length \? b : d\.brands\)\)/.test(form),
)

check(
  "opening the sheet is not debounced; only typing is",
  // 180ms is for a keystroke another keystroke is about to replace. Opening the
  // picker, or clearing the field, wants the answer now.
  /\}, brandQuery \? 180 : 0\)/.test(form),
)

check(
  "an unfilled brand list shows that it is loading, not that there are none",
  (() => {
    const at = form.indexOf('open={sheet === "brand"}')
    const sheetBody = form.slice(at, at + 1400)
    return /brands\.length === 0 &&/.test(sheetBody) && /animate-pulse/.test(sheetBody)
  })(),
)

console.log("\nThe keyboard")

check(
  "the action bar collapses while somebody is typing",
  (() => {
    // Writing a description on a phone leaves about four visible lines. Two
    // buttons and a checkbox pinned under it took a third of what was left, to
    // offer an action nobody wants mid-sentence — and neither is reachable
    // without dismissing the keyboard anyway.
    return (
      /\.sell-sheet\.sell-typing \.sell-actions,[\s\S]{0,140}?grid-template-rows: 0fr;/.test(css) &&
      /className="sell-actions shrink-0 grid md:hidden"/.test(form)
    )
  })(),
)

check(
  "it is driven by FOCUS, not by measuring the keyboard",
  (() => {
    // Both keyboard detectors here compute innerHeight - visualViewport.height.
    // In a browser the layout viewport stays tall while the visual one shrinks,
    // so that difference IS the keyboard. In the Capacitor WebView the plugin
    // resizes the web view itself, so innerHeight shrinks WITH it and the
    // difference stays near zero — the attribute is never set, and the bar sat
    // under the keyboard exactly as before. Focus needs no arithmetic.
    return (
      /onFocus=\{onFieldFocus\}/.test(form) &&
      /onBlur=\{onFieldBlur\}/.test(form) &&
      /classList\.toggle\("sell-typing", on\)/.test(form)
    )
  })(),
)

check(
  "a checkbox does not count as typing",
  // It takes focus and opens no keyboard, and the one on this screen lives ON
  // the bar — collapsing the bar because somebody ticked it would be absurd.
  /type !== "checkbox"/.test(form),
)

check(
  "moving between two fields does not flash the bar back",
  // focusout fires before focusin, so a blur followed immediately by a focus
  // would collapse and re-expand between two taps.
  /blurTimer/.test(form) && /window\.clearTimeout\(blurTimer\.current\)/.test(form),
)

check(
  "focus is tracked without re-rendering a 1,400-line form",
  /const typing = useRef\(false\)/.test(form),
)

check(
  "typing does not put the bar back",
  (() => {
    // React owns this className, so every render rewrites the whole attribute
    // and wipes a class written straight onto the node with classList. This
    // form re-renders on every keystroke — title and description are state — so
    // the bar collapsed on focus and came back on the first character. Which is
    // exactly "sometimes it appears".
    const at = form.indexOf('"sell-sheet fixed inset-0')
    const cn = form.slice(at, at + 700)
    return /typing\.current && "sell-typing"/.test(cn) && /MOTION_CLASS\[motion\.current\]/.test(cn)
  })(),
  "        The same trap the motion classes are read from a ref to avoid.",
)

check(
  "two independent signals, because a false negative is the bug",
  (() => {
    // Focus is the one that works in the app. The two keyboard classes are kept
    // because they are correct on the mobile web, and hiding a bar is something
    // where a false positive costs nothing.
    return (
      /\.sell-sheet\.sell-typing \.sell-actions,/.test(css) &&
      /html\[data-keyboard="open"\] \.sell-actions,/.test(css) &&
      /html\.keyboard-open \.sell-actions \{/.test(css)
    )
  })(),
)

check(
  "it collapses to a height nobody had to measure",
  (() => {
    const rule = css.slice(css.indexOf(".sell-actions {"), css.indexOf(".sell-actions {") + 260)
    // A pixel value is a guess that clips the row the moment the safe-area
    // inset differs; `height: auto` does not transition at all.
    return /grid-template-rows: 1fr;/.test(rule) && /transition: grid-template-rows/.test(rule)
  })(),
)

check(
  "the space goes to the field being typed into, not into a gap",
  (() => {
    // The sheet is a flex column, so a shrinking last row hands its height to
    // the scroller above rather than leaving a hole where the bar was.
    const markup = form.slice(form.indexOf('className="sell-actions'))
    return /<div className="overflow-hidden">/.test(markup.slice(0, 220))
  })(),
)

check(
  "a hidden control cannot be pressed by accident",
  // It is clipped, not removed, so without this a thumb on the edge of the
  // keyboard could still publish a listing.
  /html\.keyboard-open \.sell-actions \{[\s\S]{0,140}?pointer-events: none;/.test(css),
)

check(
  "none of it applies where there is no keyboard taking half the screen",
  (() => {
    const at = css.indexOf(".sell-actions {")
    const before = css.slice(Math.max(0, at - 400), at)
    return /@media \(width < 48rem\)/.test(before)
  })(),
)

console.log("\nPublishing, and what happens straight afterwards")

check(
  "nothing shows through under the action bar",
  (() => {
    // `.sell-sheet` is sized to the VISIBLE viewport so the buttons clear the
    // keyboard. When --vv-top + --vv-h is short of the screen, whatever is
    // behind shows in the band below — and on the feed that is a reels card
    // with a black gradient along its bottom edge. The dark smudge under the
    // Publish button was that, read as a shadow the bar was casting.
    return /\.sell-sheet::after \{[\s\S]{0,260}?top: 100%;[\s\S]{0,200}?background: #f6f6f7;/.test(css)
  })(),
)

check(
  "the bar behind the sheet cannot be a grey smudge",
  (() => {
    // WHAT THE "SHADOW" ACTUALLY WAS. The tab bar is fixed at the bottom, z-80,
    // UNDER the sell sheet at z-95 — and `--vv-h` is visualViewport.height,
    // which on iOS can fall short of the screen by roughly the home-indicator
    // strip. So a band of 95%-white-with-a-backdrop-blur showed under the
    // Publish button, over a full-bleed reels photograph. A smudged grey fade
    // that reads unmistakably as a shadow the button is casting.
    //
    // Opaque white cannot do that whatever ends up behind it. It also stops a
    // backdrop-filter being recomputed against fresh content on every frame of
    // every scroll on every page, which is the same argument the sell form's
    // own action bar makes about itself.
    return /border-t border-neutral-200 bg-white"/.test(bar) && !/backdrop-blur/.test(bar)
  })(),
)

check(
  "the strip travels with the sheet rather than sitting still under it",
  (() => {
    const rule = css.slice(css.indexOf(".sell-sheet::after"), css.indexOf(".sell-sheet::after") + 320)
    // Fixed would stay put and be visible under a sheet that had already left.
    return /position: absolute;/.test(rule) && !/position: fixed;/.test(rule)
  })(),
)

check(
  "the confirmation says what actually happened",
  (() => {
    // It said "Anunț publicat / Te ducem la anunțul tău" for all three
    // outcomes — including saving a DRAFT, which publishes nothing, and
    // including "add another", where nothing takes you anywhere.
    return (
      /Ciornă salvată/.test(form) &&
      /Poți adăuga următorul articol/.test(form) &&
      /Te ducem la anunțul tău/.test(form)
    )
  })(),
)

check(
  "the veil fades away instead of being deleted",
  // Unmounting a full-screen white overlay between two frames is the most
  // visible possible hard cut, because at that moment it is the only thing on
  // screen.
  /useState<false \| "in" \| "out">\(false\)/.test(form) &&
    /posted-out \$\{POSTED_OUT_MS\}ms/.test(form) &&
    /@keyframes posted-out/.test(css),
)

check(
  "the emptied form is reset behind the veil, not in front of it",
  (() => {
    // A SMOOTH scroll fired on the tick the veil was removed meant watching a
    // form that had just lost most of its height slide back to the top, with
    // the offset clamping under it as the content shrank. That is the layout
    // shift.
    const branch = form.slice(form.indexOf("if (postAnother && !draft)"))
    return /scrollTo\(\{ top: 0, behavior: "auto" \}\)/.test(branch.slice(0, 1600))
  })(),
)

check(
  "the checkbox is actually read at submit time",
  // `submit` is a useCallback; without postAnother in its dependencies it would
  // close over whatever the box was when the form first rendered.
  /postAnother, router, setMotion(, [a-zA-Z]+)*\]/.test(form),
)

check(
  "no full-screen blur under the confirmation",
  (() => {
    const veil = form.slice(form.indexOf("fixed inset-0 z-[130]"))
    // A backdrop-filter is recomputed on every frame of the fade it sits
    // under, and there is nothing worth seeing through it.
    return /bg-white\n/.test(veil.slice(0, 200)) || !/backdrop-blur/.test(veil.slice(0, 200))
  })(),
)

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
