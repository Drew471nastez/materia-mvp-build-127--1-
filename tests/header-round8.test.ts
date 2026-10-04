/**
 * ===========================================================================
 *  THE STORELIB HEADER, ROUND 8 (asks 1 to 6)
 * ===========================================================================
 * The owner's words, shortened:
 *
 *   1. The hamburger opens and closes smoother (popover and sheet), a little
 *      more depth, and Explore and Discover communities get clean icons from
 *      the nav's own Solar set.
 *   2. Dashboard is not dark or purple: Storelib's secondary button.
 *   3. The scrolled header search opens a results dropdown, not a
 *      categories box: products AND communities (only while communities are
 *      on), the five most relevant, then View all results for the word in
 *      the mode being browsed; nothing typed shows recent searches only; a
 *      slim scrollbar; the keyboard works. The grid icon keeps the categories.
 *   4. No wishlist heart in the header on Explore.
 *   5. Counts are ink with white figures, not red.
 *   6. The phone's notifications sheet has no gap under the list (image 55):
 *      it fits its rows, scrolls inside, nothing below it, and opens with its
 *      rows already drawn.
 *
 * Read from source here; measured in a browser by
 * scripts/check-header-round8.mjs.
 */
import { existsSync } from "node:fs"
import { readCode, readSource } from "./_source"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail === undefined ? "" : `   (${JSON.stringify(detail)})`}`) }
}

const header = readCode("components/platform/platform-header-client.tsx")
const results = readCode("components/platform/header-search-results.tsx")
const nav = readCode("components/nav/place-navigator.tsx")
const bell = readCode("components/notifications/notification-bell.tsx")
const sheet = readCode("components/ui/bottom-sheet.tsx")
const bar = readCode("components/community/member/top-bar.tsx")

console.log("\n1. The navigator")
check("Explore and Discover communities have Solar line icons", /CompassIcon/.test(nav) && /UsersGroupRoundedIcon/.test(nav) && /<Icon size=\{phone \? 22 : 20\} strokeWidth=\{1\.6\} \/>/.test(nav))
check("a little more depth: a contact shadow and a wide soft one under the hairline", /shadow-\[0_0_0_1px_rgba\(15,23,42,0\.06\),0_1px_2px_rgba\(15,23,42,0\.05\),0_6px_12px_-4px_rgba\(15,23,42,0\.06\),0_22px_44px_-14px_rgba\(15,23,42,0\.24\)\]/.test(nav))
check("the press flips nothing inherited: no visibility or pointer-events in the closed state", !/PANEL_CLOSED = "[^"]*(invisible|pointer-events-none)/.test(nav) && /inert=\{live \? undefined : true\}/.test(nav))

console.log("\n2. Dashboard")
const dash = /const sellerDashboardButton = [\s\S]*?\) : null/.exec(header)?.[0] ?? ""
check("white, a hairline, a one pixel soft shadow, ink text", /border border-\[#e2e4e8\] bg-white/.test(dash) && /text-\[#1a1a2e\]/.test(dash) && /shadow-\[0_1px_1px_rgba\(16,18,27,0\.05\)\]/.test(dash), dash.slice(0, 400))
check("not purple and not dark", !/violet|bg-\[#1a1a2e\]|bg-black/.test(dash))

console.log("\n3. The search")
check("the header asks the phone search's questions, communities while they are on", /quickSearch\(createClient\(\), term, \{ communities: communitiesOn, creators: false \}\)/.test(header) && /const communitiesOn = useCommunitiesEnabled\(\)/.test(header))
check("and shows the five most relevant together", /setSearchResults\(topHits\(answer\)\)/.test(header))
check("a stale answer is dropped", /if \(seq !== searchSeq\.current\) return/.test(header))
check("no category pills in the dropdown, nor the old Start typing line", !/SEARCH_CATEGORIES|Start typing to search products|>Categories</.test(header))
check("View all goes to Explore in the mode being browsed", /navigateReliably\(viewAllHref\(word, searchMode\)\)/.test(header) && /searchParams\.get\("type"\) === "communities" \? "communities" : "products"/.test(header))
check("nothing typed: recent searches, and no panel when there are none", /export function hasPanel\(query: string, recents: string\[\]\): boolean \{\s*return query\.trim\(\) !== "" \|\| recents\.length > 0/.test(results) && /const panelShown = searchModalOpen && hasPanel\(query, recents\)/.test(header))
check("the keyboard: a combobox, arrows, Enter", /role: "combobox" as const/.test(header) && /"aria-activedescendant": panelShown && activeOption >= 0/.test(header) && /e\.key === "ArrowDown" \|\| e\.key === "ArrowUp"/.test(header) && /onKeyDown=\{onSearchKey\}/.test(header))
check("a slim scrollbar", /\[scrollbar-width:thin\]/.test(results) && /SLIM_SCROLL/.test(header))
check("pictures through the optimizer at their drawn size, with their size set", /optimizedImageUrl\(hit\.thumb, THUMB\)/.test(results) && /width=\{THUMB\}\s*height=\{THUMB\}/.test(results))
check("the grid icon keeps the categories", /<SearchCategoriesButton key=\{shown \? "shown" : "hidden"\} categories=\{deskCategories\} size="header" \/>/.test(header))
check("the results component is a client module importing nothing from the server", /^"use client"/.test(readSource("components/platform/header-search-results.tsx")) && !/server-only|next\/headers|lib\/communities\/server|admin-blog-auth/.test(results))
check("and communities are asked of Storelib's public route, never the database", /fetch\(`\/api\/explore\/communities\?q=/.test(readCode("lib/nav/quick-search.ts")))

console.log("\n4. No heart on Explore")
check("the wishlist icon is drawn only off Explore, on both rows", /const showWishlistIcon = !isExploreSurface/.test(header) && (header.match(/\{showWishlistIcon && \(/g) ?? []).length === 2)

console.log("\n5. Ink counts")
check("the heart's count", /COUNT_BADGE_TONE = "bg-\[#1a1a2e\] text-white \[\[data-header-tone=dark\]_&\]:bg-white \[\[data-header-tone=dark\]_&\]:text-\[#1a1a2e\]"/.test(header))
check("the bell's count", /data-bell-badge=""[\s\S]{0,400}bg-\[#1a1a2e\] px-\[5px\] text-white/.test(bell))
check("the community bar's Messages count", /\$\{COUNT\} bg-\[#1a1a2e\] px-\[5px\] text-white/.test(bar))
check("no red count left in any of them", ![header, bell, bar].some((s) => /bg-red-500/.test(s)))

console.log("\n6. The phone's notifications sheet")
check("as tall as its rows, up to a maximum, no fixed height", /maxHeight="min\(78dvh, 640px\)"/.test(bell) && !/height="min\(68dvh, 584px\)"/.test(bell))
check("the first page read while the page is idle and kept warm", /refreshIfStale\(\)/.test(bell) && /let warm:/.test(bell))
check("the sheet's panel and dim are fixed themselves while up, the panel a hair under opaque (Safari's floating bar)", /cn\(atRest \? "absolute" : "fixed", "inset-x-0 bottom-0/.test(sheet) && /\.\.\.\(atRest \? null : \{ opacity: 0\.999 \}\)/.test(sheet) && /atRest \? "absolute inset-0" : "fixed inset-0"/.test(sheet))
check("the probe exists", existsSync("scripts/check-header-round8.mjs") && existsSync("scripts/render-header-round8.tsx"))

console.log("\nCopy")
/* Built from pieces, so this file does not say the words it looks for. */
const DASH = new RegExp("\\u2014")
const BANNED = new RegExp(`\\b(${["un" + "lock", "ele" + "vate", "seam" + "less", "power" + "ful", "effort" + "less(ly)?", "super" + "charge", "trans" + "form"].join("|")})\\b`, "i")
for (const f of ["components/platform/header-search-results.tsx", "components/nav/place-navigator.tsx", "components/notifications/notification-bell.tsx", "lib/nav/quick-search.ts", "scripts/check-header-round8.mjs", "scripts/render-header-round8.tsx", "tests/header-round8.test.ts"]) {
  const src = readSource(f)
  check(`${f}: no em dash and none of the banned words`, !DASH.test(src) && !BANNED.test(src))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
