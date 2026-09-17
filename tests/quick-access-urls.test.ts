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
    3px padding-top (globals.css) + the row + 3px padding-bottom. It was
    3 + 77 + 3 = 83; 97% of that is 80.5, so the row is 74.5 and the two
    rails are untouched — they hold the logo off the window edge, and taking
    it out of them would move the contents rather than shorten the bar.
  */
  const row = header.match(/platform-header-row flex md:h-\[([\d.]+)px\]/)?.[1]
  check("the row names its height", !!row, `matched: ${row}`)
  if (row) {
    const total = 3 + Number(row) + 3
    check(`the row is 74.5px (total ${total}px)`, Number(row) === 74.5)
    check("which is 97% of the 83px it was", Math.abs(total / 83 - 0.97) < 0.005, `${(100 * total / 83).toFixed(1)}%`)
  }
  check("the padding rails are untouched", /md:pb-\[3px\]/.test(header) && /padding-top: 3px/.test(read("app/globals.css")))
  /* The SSR placeholder holds the header's space before hydration; if it
     disagrees the page shifts by the difference on every load. */
  check(
    "the SSR placeholder's note matches the new number",
    /74\.5px row \+ 3px bottom = 80\.5px/.test(read("components/marketing/conditional-header.tsx")),
  )

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
