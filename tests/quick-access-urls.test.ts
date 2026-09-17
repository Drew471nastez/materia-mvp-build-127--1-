/**
 * ===========================================================================
 *  TWO ADDRESSES, TWO THINGS, AND THE HELPERS SAID THE OPPOSITE
 * ===========================================================================
 * `getWebsiteUrl` carries a long comment explaining that
 * `<name>.storelib.com` is the creator's WEBSITE and `storelib.com/<name>` is
 * the creator's PAGE. Three helpers next to it returned the subdomain for the
 * PAGE, so the two handed out byte-identical URLs and Quick access printed:
 *
 *     Creator page   https://andrewrullz.storelib.com
 *     Website        andrewrullz.storelib.com
 *
 * One address under two names, and the creator page — the profile with the
 * products and the follow button, served by app/(marketing)/[sellername] —
 * could not be copied from anywhere in the product.
 *
 * The native branch of getStoreUrl was already right; it returns `/<name>`,
 * because that is the route. Only the web branches disagreed.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const helpers = read("lib/url-helpers.ts")
const dash = read("components/app/dashboard-client.tsx")
const header = read("components/platform/platform-header-client.tsx")

/** The body of one exported function, up to the next export. */
function fn(name: string): string {
  const i = helpers.indexOf(`export function ${name}(`)
  if (i < 0) return ""
  const j = helpers.indexOf("\nexport ", i + 10)
  return helpers.slice(i, j < 0 ? undefined : j)
}
/** Its production return, ignoring the localhost and native branches. */
function prodReturns(name: string): string[] {
  return (fn(name).match(/return `[^`]*`/g) ?? []).filter((r) => r.includes("mainDomain"))
}

function main() {
  console.log("\nThe creator page and the website are different addresses")

  console.log("\n  the page is on the apex path")
  for (const name of ["getStoreUrl", "getStoreShareUrl", "getStoreUrlDisplay"]) {
    const rets = prodReturns(name)
    check(`${name} returns a path under the main domain`, rets.length > 0 && rets.every((r) => /\$\{mainDomain\}\//.test(r)), rets.join(" | "))
    check(
      `  and ${name} is not a subdomain`,
      rets.every((r) => !/\$\{sanitizedUsername\}\.\$\{mainDomain\}|\$\{username\.toLowerCase\(\)\}\.\$\{mainDomain\}/.test(r)),
      rets.join(" | "),
    )
  }

  console.log("\n  the website keeps the subdomain")
  const web = prodReturns("getWebsiteUrl")
  check("getWebsiteUrl is still <name>.<domain>", web.some((r) => /\$\{sanitizedUsername\}\.\$\{mainDomain\}/.test(r)), web.join(" | "))
  /* The two must not agree. If they ever return the same shape again, the
     product is back to printing one address under two names. */
  check(
    "and it does not agree with the page's helper",
    JSON.stringify(prodReturns("getStoreShareUrl")) !== JSON.stringify(web),
  )

  /* ---------------------------------------------------------------------
     A CONNECTED DOMAIN, AND WHAT IT ACTUALLY SERVES
     --------------------------------------------------------------------- */
  console.log("\n  a connected domain replaces the right rows")

  /*
    proxy.ts resolves a custom domain and rewrites it to `/u/{username}` —
    the creator page. So the page and the OnePage under it move to the custom
    domain, and the WEBSITE does not, because the website is the subdomain and
    a custom domain does not front it. That is behaviour, not preference, so
    it is pinned against the proxy rather than against taste.
  */
  check(
    "the creator page uses it when there is one",
    /const publicStoreUrl = connectedDomain \? `https:\/\/\$\{connectedDomain\}` :/.test(dash),
  )
  check(
    "the OnePage uses it too",
    /const publicOnePageUrl = connectedDomain \? `https:\/\/\$\{connectedDomain\}\/links` :/.test(dash),
  )
  check(
    "and the website does not, because a custom domain does not serve it",
    /const publicWebsiteUrl = creatorHandle && websitePublished \? getWebsiteUrl\(creatorHandle\) : ""/.test(dash),
    "proxy.ts rewrites a custom domain to /u/{username}, the page — not the site",
  )
  check("the proxy still says so", /\/u\/\{username\}/.test(read("proxy.ts")))

  /* ---------------------------------------------------------------------
     QUICK ACCESS IS ADDRESSES, NOT ACTIONS
     --------------------------------------------------------------------- */
  console.log("\n  Quick access lists addresses and nothing else")

  check("no View page button", !/>\s*View page\s*</.test(dash))
  check("no Customize page button", !/>\s*Customize page\s*</.test(dash))
  check("the three rows are still there", /Creator page/.test(dash) && /OnePage/.test(dash) && />Website</.test(dash))
  /* And the mark in those rows is the shared one, not a fourth logo file. */
  check("its Storelib mark is the shared constant", !/image2vector/.test(dash) && /STORELIB_LOGO/.test(dash))

  /* ---------------------------------------------------------------------
     THE HEADER IS 3% SHORTER
     --------------------------------------------------------------------- */
  console.log("\n  the header lost three percent")

  /*
    THE ROW IS THE HEADER, near enough. An earlier version of this check added
    the two 3px rails to the row and called the header 83px — wrong, because
    Tailwind sets box-sizing: border-box and `h-[77px]` already includes its
    own padding. Measured on the deployed page:

        before   row 77px     header 78px
        after    row 74.5px   header 75.5px

    So the comparison is row against row, which is the number the class
    actually sets.
  */
  const ORIGINAL = 77
  const AFTER_FIRST_CUT = 74.5
  const row = header.match(/platform-header-row flex md:h-\[([\d.]+)px\]/)?.[1]
  check("the row names its height", !!row, `matched: ${row}`)
  if (row) {
    const n = Number(row)
    check(`the row is 69.35px, down from ${ORIGINAL}`, n === 69.35)
    /* Three cuts, asked for separately: 3% off the original, 5% off that,
       then 2% off that. The chain is what the numbers below check. */
    check(
      "which is two percent off the previous 70.75",
      Math.abs(1 - n / 70.75 - 0.02) < 0.002,
      `${(100 * (1 - n / 70.75)).toFixed(1)}%`,
    )
    check("and about ten percent off where it started", Math.abs(1 - n / ORIGINAL - 0.099) < 0.006)
    void AFTER_FIRST_CUT
  }
  check("the padding rails are untouched", /md:pb-\[3px\]/.test(header) && /padding-top: 3px/.test(read("app/globals.css")))
  /* The SSR placeholder holds the header's space before hydration; if it
     disagrees the page shifts by the difference on every load. */
  check(
    "the SSR placeholder's note names the row's real height",
    /70\.75px row \(border-box, padding included\)/.test(read("components/marketing/conditional-header.tsx")),
    "a placeholder that disagrees shifts the page by the difference on every load",
  )

  /*
    A LITTLE DEPTH, AND IT IS THE SHARED VALUE. The creator page's bar and the
    product page's bar already point at --bar-depth-dark; a fourth copy of a
    shadow is how three bars a visitor moves between end up at three different
    heights. Black rather than slate, because slate under a black bar is
    lighter than the bar and reads as a halo at the seam.
  */
  const css = read("app/globals.css")
  check("the header has depth", /platform-header-depth/.test(header))
  check("drawn from the shared token", /\.platform-header-depth \{\s*\n\s*box-shadow: var\(--bar-depth-dark\);/.test(css))
  check("and not a fourth copy of a shadow", !/\.platform-header-depth \{[^}]*rgba\(/.test(css))

  /*
    AND THE AIR UNDER IT CAME BACK DOWN. 8px off each breakpoint, and the two
    stay in the same notation so it is visible that they move together.
  */
  const hero = read("components/explore/explore-hero.tsx")
  /* The bottom padding was trimmed separately on main while this trimmed the
     top; both are deliberate, so the merge kept both rather than picking one. */
  /*
    THE TOP IS WHAT THIS PINS. It matched the whole class string, bottom
    padding included, so trimming the gap between the field and the category
    pills failed a check named for the space above the heading. The two
    numbers this is about are 48 and 88, and they are still checked exactly;
    the bottom is read separately and reported, because it has now moved
    twice for reasons of its own.
  */
  const heroPad = hero.match(/className="pt-\[48px\] (pb-[^\s"]+) sm:pt-\[88px\] (sm:pb-[^\s"]+)"/)
  check("the hero's top spacing is 48 / 88", Boolean(heroPad), "pt-[48px] … sm:pt-[88px] is not on the section")
  if (heroPad) console.log(`        its bottom padding is ${heroPad[1]} / ${heroPad[2]}`)

  /* ---------------------------------------------------------------------
     THE HERO'S SUBTITLE
     --------------------------------------------------------------------- */
  console.log("\n  the subtitle is closer and a little heavier")

  /*
    Inter is a variable font, so 400 -> 420 -> 450 are three real weights
    rather than one weight and two rounding errors. On a static family the
    browser would synthesise the middle one and the second request would have
    changed nothing visible.
  */
  check(
    "it sits 12px under the heading and carries 450",
    /className="mt-3 text-\[15px\] sm:text-\[17px\] font-\[450\] text-neutral-600"/.test(hero),
  )
  check("and the weight is a real one, not a synthesised bold", !/font-bold/.test(hero.slice(hero.indexOf("mt-3 text-[15px]"), hero.indexOf("mt-3 text-[15px]") + 200)))

  /* ---------------------------------------------------------------------
     THE FILTER CHIPS
     --------------------------------------------------------------------- */
  console.log("\n  the chips under the pills")

  const explore = read("components/explore/explore-page-client.tsx")
  /*
    Violet is what this page spends on the thing you are looking at. Clear is
    a way out of a filter, not a destination, so it was the loudest colour on
    screen given to the least important control.
  */
  check(
    "Clear is grey, not violet",
    /bg-neutral-100 text-neutral-600 ring-1 ring-inset ring-neutral-200/.test(explore),
  )
  check("and it is not wearing the accent any more", !/bg-violet-100 text-violet-700 hover:bg-violet-200 transition-colors cursor-pointer\"\s*\n\s*>\s*\n\s*<X className="w-3 h-3" \/>\s*\n\s*Clear/.test(explore))
  /*
    THE CATEGORY'S NAME WAS PRINTED TWICE. The pill row already shows which
    category is on — it is the filled chip — so a second black chip under it
    saying the same word read as another, different filter. A SUBcategory
    still earns one, because the row above only names the parent.
  */
  check(
    "the duplicate category chip is gone",
    /\{selectedSubcategoryLabel && \(/.test(explore) &&
      !/\{selectedSubcategoryLabel \|\| CATEGORIES\.find\(c => c\.id === mainCategory\)\?\.label \|\| "Category"\}/.test(explore),
  )

  /* ---------------------------------------------------------------------
     THE WISHLIST BADGE
     --------------------------------------------------------------------- */
  console.log("\n  the wishlist count reads as a badge")

  /*
    14px with 7px type, half off the heart's corner, read as part of the
    outline rather than as a count on top of it. The ring is the thing that
    fixes it: a gap in the header's own black is how every app separates a
    badge from the icon under it.
  */
  const badges = header.match(/absolute -top-1\.5 -right-2 flex h-\[17px\] min-w-\[17px\][^"]*/g) ?? []
  check("both badges were reworked, not just the one on screen", badges.length === 2, `${badges.length} found`)
  check("they are ringed in the header's own black", badges.every((b) => /ring-2 ring-black/.test(b)))
  check("and the digits do not shift the disc", badges.every((b) => /tabular-nums/.test(b)))
  check("nothing is left at the old 7px size", !/text-\[7px\] font-bold/.test(header))

  /* ---------------------------------------------------------------------
     THE GROUND
     --------------------------------------------------------------------- */
  console.log("\n  the renaissance ground")

  check("Explore carries it", /className="explore-ground min-h-screen/.test(read("app/(marketing)/explore/page.tsx")))
  check("it is an inline tile, so it costs no request", /\.explore-ground::before \{[\s\S]*?background-image: url\("data:image\/svg\+xml,/.test(css))
  /* Almost invisible on purpose: about two levels of grey on #f5f5f5. */
  check("and it is almost invisible", /\.explore-ground::before \{[\s\S]*?opacity: 0\.045;/.test(css))
  /* It has to END before the products do, or a picture sits on ornament. */
  check(
    "it fades out above the grid",
    /\.explore-ground::before \{[\s\S]*?height: 620px;/.test(css) &&
      /mask-image: linear-gradient\(to bottom, #000 0%, #000 34%, transparent 100%\)/.test(css),
  )
  check(
    "and it cannot eat a click",
    /\.explore-ground::before \{[\s\S]*?pointer-events: none;/.test(css),
    "a pseudo-element over the hero would stop the search field taking focus",
  )

  /* ---------------------------------------------------------------------
     THE HEADER SCROLLS AWAY AND COMES BACK PAST THE SEARCH
     --------------------------------------------------------------------- */
  console.log("\n  the bar pins itself only past the search")

  /*
    STILL `sticky`, MOVED WITH A TRANSFORM. Switching relative -> fixed at a
    threshold takes the element out of flow in that frame and everything below
    jumps by the height of the bar unless a spacer appears at the same moment.
    Sticky never leaves the flow, so a transform costs no layout at all.
  */
  check("it is still sticky rather than swapped to fixed", /isSellerOrProductPage \? "relative" : "sticky top-0"/.test(header))
  check("and it is moved with a translate", /headerTuckedAway && "-translate-y-full"/.test(header))
  /* Tailwind v4 builds -translate-y-full out of the standalone `translate`
     property; naming `transform` animates nothing and lets the bar jump. */
  check(
    "the transition names translate, not transform",
    /motion-safe:transition-\[translate\]/.test(header),
    "tests/motion-properties exists because of exactly this mistake",
  )
  /*
    THE THRESHOLD IS THE SEARCH FIELD, not a number of pixels. searchInHeader
    is already false while Explore's own field is on screen and true once it
    has gone, so the bar arrives carrying the control the page just lost.
  */
  check(
    "the threshold is the search anchor, not a magic number",
    /const headerTuckedAway = isExploreSurface && pastHeader && !searchInHeader/.test(header),
  )
  check("and at the top of the page it is always there", /window\.scrollY > Math\.max\(headerH, 1\)/.test(header))
  check("only Explore behaves this way", /if \(!isExploreSurface\) return/.test(header))
  /*
    AND IT CAN ALWAYS BE REACHED AGAIN. On a short result the search may never
    leave the viewport, and without this the bar would stay tucked away for as
    long as the visitor stayed. Measured on production at 1280x860 the whole
    document was 1315px — 455px of scroll, and the field went nowhere.
  */
  check(
    "reaching the bottom brings the bar back regardless",
    /!searchInHeader && !atBottom/.test(header) &&
      /doc\.scrollHeight - window\.scrollY - window\.innerHeight < 120/.test(header),
    "a page too short for the search to scroll away would hide the header for ever",
  )

  /* ---------------------------------------------------------------------
     THE CONTEXT EXPLORE NEEDS IS ABOVE IT
     --------------------------------------------------------------------- */
  console.log("\n  the marketing tree has a LanguageProvider")

  /*
    explore-page-client calls useLanguage — it puts `?lang=` on the URLs it
    hands out and reads one back — and the provider was mounted only in
    components/app/app-layout-wrapper, which is /app and nowhere else. So
    storelib.com/explore threw on every render and its error boundary served
    "Something went wrong while loading the explore page" to everyone.

    A BUILD CANNOT CATCH THIS. React context is resolved at runtime, and
    nothing type-checks that a hook's provider is above it in the tree; the
    build was green through the whole outage. So it is asserted here instead:
    every marketing surface that calls useLanguage must have the provider in
    an ancestor layout.
  */
  const marketingLayout = read("app/(marketing)/layout.tsx")
  check("the layout imports it", /import \{ LanguageProvider \} from "@\/lib\/i18n\/context"/.test(marketingLayout))
  check("and wraps the tree in it", /<LanguageProvider>[\s\S]*<\/LanguageProvider>/.test(marketingLayout))
  check(
    "which is what the page under it needs",
    /useLanguage\(\)/.test(read("components/explore/explore-page-client.tsx")),
    "if this ever stops being true the provider above can go too",
  )

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
