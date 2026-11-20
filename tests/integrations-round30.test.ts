/**
 * Round 30: the Integrations page. How it works out of the way, the owner's
 * pill order, All mixed across the categories, and the way into an
 * integration's page and back (the pill in the address, the reads kept, no
 * fade, no landing on a return). scripts/check-integrations-round30.mjs
 * measures the same in a browser.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { CATEGORY_ORDER, visibleIntegrations, type IntegrationCategory } from "@/lib/integrations/catalog"
import { AFTER_KLAVIYO, LANE_ORDER, PILL_HEAD, pillOrder, pinAfter, weave, type Lane } from "@/lib/integrations/directory-order"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 300)}`}`)
}
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)

console.log("\nThe pills\n")
{
  const order = pillOrder(() => 1)
  /* Changed on purpose (round K4, Andrew: "Installed/Connected becomes a pill filter"): the Connected list above the cards is gone, so Installed moves beside All; the categories keep the owner's order. */
  check("All, Installed, Reviews, Analytics, Storelib apps, Advertising, Email marketing, Automation, then the rest in the catalog's order", order.join() === "all,installed,reviews,analytics,storelib,advertising,email,automation,shipping,print_on_demand,dropshipping,fulfillment,suppliers", order)
  const none = pillOrder(() => 0)
  check("a category with nothing in it has no pill; All, Installed and Storelib apps always do", none.join() === "all,installed,storelib", none)
  check("the lanes follow the pills", LANE_ORDER.join() === "reviews,analytics,storelib,advertising,email,automation,shipping,print_on_demand,dropshipping,fulfillment,suppliers" && PILL_HEAD[0] === "all")
}

console.log("\nAll, mixed\n")
{
  type Card = { id: string; lane: Lane }
  const cards: Card[] = [
    ...["own-a", "own-b", "own-c", "own-d", "own-e"].map((id) => ({ id, lane: "storelib" as Lane })),
    ...["r1"].map((id) => ({ id, lane: "reviews" as Lane })),
    ...["a1", "a2", "a3", "a4"].map((id) => ({ id, lane: "analytics" as Lane })),
    ...["s1", "s2", "s3", "s4", "s5", "s6", "s7"].map((id) => ({ id, lane: "shipping" as Lane })),
  ]
  const woven = weave(cards, (c) => c.lane)
  const ids = woven.map((c) => c.id)
  check("every card once", ids.length === cards.length && new Set(ids).size === cards.length)
  check("the first row is one of each lane, in the pills' order", ids.slice(0, 4).join() === "r1,a1,own-a,s1", ids.slice(0, 4))
  check("each lane keeps its own order", (["storelib", "reviews", "analytics", "shipping"] as Lane[]).every((l) => woven.filter((c) => c.lane === l).map((c) => c.id).join() === cards.filter((c) => c.lane === l).map((c) => c.id).join()))
  const avoidable = woven.filter((c, i) => i > 0 && c.lane === woven[i - 1].lane && woven.slice(i + 1).some((d) => d.lane !== c.lane))
  check("never two of one lane side by side while another lane has a card left", avoidable.length === 0, ids)
  check("the same cards weave the same way every time", weave(cards, (c) => c.lane).map((c) => c.id).join() === ids.join())
  /* The real catalog. */
  const all = visibleIntegrations(true)
  const real = weave(all.filter((i) => !i.comingSoon), (i) => i.category as IntegrationCategory)
  const firstLanes = real.slice(0, new Set(real.map((i) => i.category)).size).map((i) => i.category)
  check("the catalog's working services open on one of each category", new Set(firstLanes).size === firstLanes.length, firstLanes)
  check("  in the categories' order", firstLanes.every((c, i) => i === 0 || CATEGORY_ORDER.indexOf(c) > CATEGORY_ORDER.indexOf(firstLanes[i - 1])), firstLanes)
}

console.log("\nThe directory\n")
{
  const ui = read("components/app/settings/integrations-directory.tsx")
  /* Round 22: the woven order is what a tie keeps; most used first on top of it, Coming soon still after. */
  check("one woven order for every pill: working first, Coming soon after", /const woven: Entry\[\] = \[\.\.\.weave\(listed\.filter\(\(e\) => !later\(e\)\), laneOf\), \.\.\.weave\(listed\.filter\(later\), laneOf\)\]/.test(ui) && /Number\(later\(a\.e\)\) - Number\(later\(b\.e\)\) \|\| scoreOf\(b\.e\) - scoreOf\(a\.e\) \|\| a\.at - b\.at/.test(ui))
  check("  inside a lane Storelib's own first (its pages, then its apps), then the services as the catalog lists them", /const ownRank = \(e: Entry\) => \(e\.kind === "integration" \? \(hasBuiltInArt\(e\.id\) \? 0 : 2\) : 1\)/.test(ui))
  /* Changed on purpose (round K4): the pill, the search and the filters are one state in the address (?category=&q=&status=&by=, lib/integrations/directory-filter), read on the first render and written in place; ?c= is still read for old links. */
  const filterLib = read("lib/integrations/directory-filter.ts")
  check("the list is read from the address on the first render and written in place, never a new history entry", /const \[initial\] = React\.useState\(\(\) => readDirectoryState\(params\)\)/.test(ui) && /window\.history\.replaceState\(window\.history\.state, "", next\)/.test(ui) && /writeListState\(\{ category: f, q: query, status: statusFilter, by: maker \}\)/.test(ui) && /set\("category", s\.category, "all"\)/.test(filterLib) && /url\.searchParams\.delete\("c"\)/.test(filterLib))
  check("a return asks the stage for no landing", /const \[returning\] = React\.useState\(\(\) => page && isTraversing\(\)\)/.test(ui) && /if \(returning\) holdLanding\(\)/.test(ui))
  check("what the directory and its pages read is kept, so a page draws at once", /prefetchGet\(keptReads\(physical\)\)/.test(ui) && /REVIEWS_APP_PATH/.test(ui) && /TRACKING_APP_PATH/.test(ui))
  check("an app's page fetched in full on a hover, a focus or a touch, once", /prefetchAppPage\(router, href\)/.test(ui) && /onTouchStart=\{\(\) => warmApp\(hrefOf\(e\.app\)\)\}/.test(ui) && /warmed\.current\.has\(href\)/.test(ui))
  check("no fade on the way in or out", !/SWAP_FROM/.test(ui) && !/el\.animate\(\[\{ opacity: 0\.55/.test(ui))
  for (const [file, path] of [["components/app/settings/reviews-app-panel.tsx", "/api/store/reviews-app"], ["components/app/settings/tracking-app-panel.tsx", "/api/store/tracking-app"], ["components/app/settings/ga-connect.tsx", "/api/store/integrations"]] as const) {
    check(`  ${file.split("/").pop()} draws from the kept answer first`, new RegExp(`useState<[^>]+>\\(\\(\\) => peekGet<[^>]+>\\("${path.replace(/\//g, "\\/")}"\\)`).test(read(file)))
  }
}

console.log("\nHow it works\n")
{
  const page = read("app/(storelib)/app/integrations/integrations-client.tsx")
  /* Changed on purpose (round K4, Andrew: remove "Storelib apps and the services you already use."): with the line under the title gone, How it works sits in the bar at every width. */
  check("in the page's bar, across from the title, at every width", /<PaneBar width=\{LIST_WIDTH\} className=\{LIST_BAR\}>\s*<h1[^>]*>[^<]*<\/h1>\s*<HowItWorks id="integrations" className="-mr-2" \/>/.test(page))
  check("no line under the title", !/Storelib apps and the services you already use/.test(page) && !/data-integrations-lede/.test(page))
  check("no pill shaped button after the line any more", !/<HowItWorks id="integrations" className="-ml-2" \/>/.test(page))
}

console.log("\nRight after Klaviyo (the owner's run)\n")
{
  const ids = ["meta-pixel", "klaviyo", "google-tag-manager", "printful", "zapier", "google-ads", "printify", "tiktok-pixel", "storelib-reviews", "mailchimp"]
  const out = pinAfter(ids, (x) => x)
  check("Printify, Printful, TikTok Pixel, Google Ads, Storelib Reviews follow Klaviyo in that order, Google Tag Manager after them", out.join() === "meta-pixel,klaviyo,printify,printful,tiktok-pixel,google-ads,storelib-reviews,google-tag-manager,zapier,mailchimp", out)
  check("no card is lost or doubled", [...out].sort().join() === [...ids].sort().join())
  check("with no Klaviyo in the list nothing moves", pinAfter(["a", "printful", "b"], (x) => x).join() === "a,printful,b")
  check("the run is the owner's", AFTER_KLAVIYO.slice(0, 5).join() === "printify,printful,tiktok-pixel,google-ads,storelib-reviews")
  const dir = read("components/app/settings/integrations-directory.tsx")
  check("the directory applies it to the one list every pill reads", /const entries: Entry\[\] = pinAfter\(ranked, \(e\) => e\.id\)/.test(dir))
  const listed = visibleIntegrations(true).map((i) => i.id)
  check("every pinned id is a card in the catalog", ["klaviyo", "printify", "printful", "tiktok-pixel", "google-ads", "storelib-reviews"].every((id) => listed.includes(id)))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
