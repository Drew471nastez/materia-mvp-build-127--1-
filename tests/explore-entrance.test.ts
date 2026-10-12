/**
 * ===========================================================================
 *  THE MARKETPLACE DOES NOT FADE ITSELF IN WHEN YOU COME BACK TO IT
 * ===========================================================================
 * Four rounds were spent on this flash, and every probe reported it fixed,
 * because every probe drove a CREATOR page — storelib.com/<handle> — while
 * the screen recording that reported it was of /explore. Different route,
 * different components, and nothing here had ever driven it.
 *
 * Measured off that recording at 60fps, three navigations, three flashes:
 *
 *      784ms   88.9% of the screen white
 *     2934ms   89.0% white, every label washed out to grey
 *     4251ms   66.1% white
 *
 * Reproduced on production with scripts/check-explore-flash.mjs, going back
 * from a product page to /explore:
 *
 *      54ms   mean 194.4   65.6% white   the listing, as it was
 *      73ms   mean 227.2   90.3% white   <- the grid at opacity 0
 *     142ms   mean 212.0   66.8% white
 *     244ms   mean 198.0   62.3% white
 *     327ms   mean 194.7   61.8% white   settled
 *
 * Sampling document.getAnimations() through it named the element: a div of
 * 3364px running `enter` at opacity 0 — the whole product grid.
 *
 * `animate-in fade-in-0` is right for what it was written for. A grid whose
 * CONTENTS change under the visitor should fade rather than snap. But React
 * plays an entrance on every mount, and arriving on a page is a mount, and so
 * is coming back to it. So the animation is kept and made conditional on the
 * thing that separates the two: did the token that decides the contents
 * actually change, or is this the first render.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { untt } from "./i18n-source"

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

const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)
const hook = read("lib/ui/use-entrance-on-change.ts")
const explore = read("components/explore/explore-page-client.tsx")
const category = read("components/explore/category-page-client.tsx")
const probe = read("scripts/check-explore-flash.mjs")

/** Product grids, which are the ones that cover the screen. */
const GRID = /grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3/

function main() {
  console.log("\nThe marketplace does not fade itself in on arrival")

  /* ---------------------------------------------------------------------
     THE HOOK
     --------------------------------------------------------------------- */
  console.log("\n  a change is not an arrival")

  check("the rule lives in one place", /export function useEntranceOnChange/.test(hook))
  check(
    "the first render compares the token against itself",
    /const first = useRef\(token\)/.test(hook) && /return token === first\.current \? "" : classes/.test(hook),
  )
  /*
    A REF, NOT STATE. The class has to be right on the FIRST painted frame.
    State would settle a render later, which is a fade that starts late — the
    exact thing being removed, moved by one frame.
  */
  check("held in a ref so it is right on the first painted frame", !/useState/.test(hook))
  check("and it does not reach for an effect either", !/useEffect|useLayoutEffect/.test(hook))

  /* ---------------------------------------------------------------------
     NO PRODUCT GRID CARRIES AN UNCONDITIONAL ENTRANCE
     --------------------------------------------------------------------- */
  console.log("\n  no grid of products animates on mount")

  for (const [name, src] of [
    ["explore", explore],
    ["explore/[category]", category],
  ] as const) {
    const offenders = src
      .split("\n")
      .map((l, i) => [i + 1, l] as const)
      /* Real JSX only. A prose line in a comment that quotes the class name is
         not a grid, and an earlier version of this check failed on its own
         explanation of the bug. */
      .filter(([, l]) => /className=/.test(l))
      .filter(([, l]) => /animate-in/.test(l) && /grid/.test(l) && !/\$\{/.test(l))
      /*
        ONE EXEMPTION, AND IT IS EARNED RATHER THAN WAVED THROUGH. The skeleton
        grid keeps an unconditional entrance because it cannot render on
        arrival: it is behind `showSkeletons`, which is `isPending ||
        isLoadingCategory`, and both of those start false. Every frame it is
        ever on screen for is one the visitor asked for by changing something,
        which is precisely the case the animation is for. The assertion below
        keeps that true.
      */
      .filter(([n]) => !(name === "explore" && /\bshowSkeletons \? \(/.test(src.split("\n")[n - 2] ?? "")))
    check(
      `${name} has no grid with a hardcoded entrance`,
      offenders.length === 0,
      offenders.map(([n, l]) => `line ${n}: ${l.trim().slice(0, 80)}`).join(" | "),
    )
  }

  check("explore's three grids all read a token", (explore.match(/useEntranceOnChange\(/g) || []).length === 3)
  /*
    AND THE SKELETON'S EXEMPTION HOLDS. It is allowed to animate on mount only
    because it never mounts on arrival. The moment `showSkeletons` could be
    true on a first render — someone initialises it from a prop, say — that
    grid becomes a 9-card flash on every return and the exemption above is
    quietly wrong.
  */
  check(
    "the skeleton only exists while something the visitor started is pending",
    /const showSkeletons = isPending \|\| isLoadingCategory/.test(explore),
  )
  check(
    "and neither of those can be true on the first render",
    /const \[isLoadingCategory, setIsLoadingCategory\] = useState\(false\)/.test(explore) &&
      /useTransition\(\)/.test(explore),
    "isPending comes from useTransition, which is false until a transition starts",
  )
  check("and the category page's one does too", (category.match(/useEntranceOnChange\(/g) || []).length === 1)

  /*
    THE TOKEN IS THE ONE THE ELEMENT ALREADY KEYS ON. Inventing a second
    source of truth for "did the contents change" is how the key and the
    animation come to disagree about it.
  */
  check(
    "the main grid's key and its entrance read the same token",
    /key=\{productsGridToken\}/.test(explore) &&
      /const productsGridEntrance = useEntranceOnChange\(\s*\n\s*productsGridToken,/.test(explore),
  )
  check(
    "and so do the category page's",
    /key=\{categoryGridToken\}/.test(category) &&
      /const categoryGridEntrance = useEntranceOnChange\(\s*\n\s*categoryGridToken,/.test(category),
  )
  check("the browsed category still drives its own grid", /useEntranceOnChange\(browseCategory,/.test(explore))
  check("and the search query drives the results grid", /useEntranceOnChange\(urlSearchQuery \|\| "",/.test(explore))

  /*
    THE ANIMATION IS NOT DELETED. It is the right behaviour for a filter
    change and the point is only that arriving is not one. If these strings
    go, somebody has solved this by removing the feature.
  */
  check(
    "the fade still exists for the case it was written for",
    /animate-in fade-in-0 slide-in-from-bottom-2 duration-300/.test(explore) &&
      /animate-in fade-in-0 slide-in-from-bottom-2 duration-300/.test(category),
  )
  check("and the grids are still grids", GRID.test(explore))

  /* ---------------------------------------------------------------------
     AND SOMETHING DRIVES THE ROUTE THIS HAPPENED ON
     --------------------------------------------------------------------- */
  console.log("\n  the marketplace is actually driven")

  check("there is a probe for /explore, not only for creator pages", /storelib\.com\/explore/.test(probe))
  check(
    "it opens a card by the shape the marketplace actually uses",
    /the pretty one/.test(probe),
    "a[href^=\"/p/\"] matches nothing on /explore — the cards link to /<handle>/<slug>",
  )
  check(
    "it compares pathname against pathname",
    /const wantPath = target\.href\.split\("\?"\)\[0\]/.test(probe),
    "a card's href carries ?layout=discover, so the raw href never equals location.pathname",
  )
  check(
    "it names what is see-through rather than checking one guess",
    /main \*/.test(probe) && /faded:/.test(probe),
    "reading only <main>'s opacity said 1 through a navigation that measured 90.3% white",
  )

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main()
