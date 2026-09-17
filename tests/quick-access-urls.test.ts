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
    check(`the row is 70.75px, down from ${ORIGINAL}`, n === 70.75)
    /* Two cuts, asked for separately: 3% off the original, then 5% off that. */
    check(
      "which is five percent off the previous 74.5",
      Math.abs(1 - n / AFTER_FIRST_CUT - 0.05) < 0.002,
      `${(100 * (1 - n / AFTER_FIRST_CUT)).toFixed(1)}%`,
    )
    check("and about eight percent off where it started", Math.abs(1 - n / ORIGINAL - 0.081) < 0.005)
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
  check("the hero's top spacing is 48 / 88", /className="pt-\[48px\] pb-6 sm:pt-\[88px\] sm:pb-10"/.test(hero))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
