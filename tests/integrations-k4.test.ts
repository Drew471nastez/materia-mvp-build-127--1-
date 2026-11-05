/**
 * Round K4: the Integrations marketplace (three cards across, a badge on
 * each, search, Request integration, pills with live counts, Installed as a
 * pill, a Filter menu, the whole list in the address) and the integration
 * page's shell (banner, actions with a confirm, setup steps, status, your
 * data) with the plug-in API built-in apps render their own tabs through.
 *
 *   npx tsx tests/integrations-k4.test.ts
 *
 * The browser half (columns at 1440 / 820 / 390, every pill's number against
 * its cards, search and filter in the address, Back, Turn off and Disconnect
 * end to end against stubbed routes) is the round's probe in the scratchpad.
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { CATEGORY_NAMES, INTEGRATIONS, integrationById, visibleIntegrations } from "@/lib/integrations/catalog"
import { DEFAULT_DIRECTORY_STATE, activeFilterCount, inPill, matchesQuery, passesFilters, pillCounts, readDirectoryState, visibleIn, writeDirectoryState, type CardFacets, type DirectoryState } from "@/lib/integrations/directory-filter"
import { pillOrder } from "@/lib/integrations/directory-order"
import { installVerb, oneTapInstall, removalPlan, setupSteps } from "@/lib/integrations/detail-actions"
import { INTEGRATION_APP_VIEWS, integrationAppView, registerIntegrationApp, tabFor, type IntegrationAppBodyProps } from "@/components/app/settings/integration-apps"
import { hasBuiltInArt } from "@/components/app/settings/integration-mark"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 300)}`}`)
}
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)
const params = (q: string) => new URLSearchParams(q)

console.log("\nThe list lives in the address\n")
{
  check("nothing named is All, nothing typed, no filters", JSON.stringify(readDirectoryState(params(""))) === JSON.stringify(DEFAULT_DIRECTORY_STATE) && JSON.stringify(readDirectoryState(null)) === JSON.stringify(DEFAULT_DIRECTORY_STATE))
  const s = readDirectoryState(params("category=analytics&q=pixel&status=available&by=storelib"))
  check("?category=&q=&status=&by= are read", s.category === "analytics" && s.q === "pixel" && s.status === "available" && s.by === "storelib", s)
  check("  an old ?c= still opens its pill; ?category= wins over it", readDirectoryState(params("c=installed")).category === "installed" && readDirectoryState(params("c=installed&category=email")).category === "email")
  const bad = readDirectoryState(params("category=nope&status=everything&by=you&q=" + "x".repeat(300)))
  check("  anything unknown is the default, a long search is cut, never an error", bad.category === "all" && bad.status === "any" && bad.by === "any" && bad.q.length === 80)
  const base = "https://storelib.com/app/integrations?c=email&integration=klaviyo"
  const out = new URL(writeDirectoryState(base, { category: "advertising", q: " meta ", status: "any", by: "partner" }))
  check("written back: defaults left out, the old ?c= dropped, other params kept", out.searchParams.get("category") === "advertising" && out.searchParams.get("q") === "meta" && !out.searchParams.has("status") && out.searchParams.get("by") === "partner" && !out.searchParams.has("c") && out.searchParams.get("integration") === "klaviyo", out.search)
  const plain = new URL(writeDirectoryState("https://storelib.com/app/integrations?category=email&q=x", DEFAULT_DIRECTORY_STATE))
  check("  All with nothing typed is the plain address", plain.search === "")
  const round: DirectoryState = { category: "shipping", q: "label", status: "coming_soon", by: "storelib" }
  check("  what is written reads back the same", JSON.stringify(readDirectoryState(new URL(writeDirectoryState("https://x.test/a", round)).searchParams)) === JSON.stringify(round))
}

console.log("\nSearch, pill and filters work together\n")
{
  const card = (over: Partial<CardFacets>): CardFacets => ({ id: "x", name: "X", summary: "", category: null, categoryName: null, storelib: false, installed: false, standing: "available", ...over })
  const cards: CardFacets[] = [
    card({ id: "meta-pixel", name: "Meta Pixel", summary: "Reach your visitors again on Facebook and Instagram.", category: "advertising", categoryName: "Advertising" }),
    card({ id: "tiktok-pixel", name: "TikTok Pixel", summary: "Measure and retarget your TikTok ads.", category: "advertising", categoryName: "Advertising", installed: true, standing: "installed" }),
    card({ id: "snapchat-pixel", name: "Snapchat Pixel", summary: "Measure your Snapchat ads.", category: "advertising", categoryName: "Advertising", standing: "coming_soon" }),
    card({ id: "storelib-reviews", name: "Storelib Reviews", summary: "Collect product reviews by email.", category: "reviews", categoryName: "Reviews", storelib: true, installed: true, standing: "installed" }),
    card({ id: "storelib-bundles", name: "Bundles and upsells", summary: "Buy together deals.", storelib: true, standing: "built_in" }),
    card({ id: "printful", name: "Printful", summary: "Shirts made when they sell.", category: "print_on_demand", categoryName: "Print on demand", standing: "attention", installed: true }),
  ]
  check("every word typed must be there: name, line or category", matchesQuery(cards[0], "meta facebook") && matchesQuery(cards[0], "ADVERTISING") && !matchesQuery(cards[0], "meta tiktok") && matchesQuery(cards[0], "  "))
  check("  'storelib' and 'built in' find Storelib's own", matchesQuery(cards[4], "storelib") && matchesQuery(cards[4], "built in") && !matchesQuery(cards[0], "storelib"))
  check("Made by: Storelib, other services", passesFilters(cards[3], { status: "any", by: "storelib" }) && !passesFilters(cards[0], { status: "any", by: "storelib" }) && passesFilters(cards[0], { status: "any", by: "partner" }) && !passesFilters(cards[4], { status: "any", by: "partner" }))
  check("Status: ready to connect, coming soon, needs attention", passesFilters(cards[0], { status: "available", by: "any" }) && !passesFilters(cards[1], { status: "available", by: "any" }) && passesFilters(cards[2], { status: "coming_soon", by: "any" }) && passesFilters(cards[5], { status: "attention", by: "any" }) && !passesFilters(cards[0], { status: "attention", by: "any" }))
  check("pills: All, Installed, Storelib apps, a category", inPill(cards[0], "all") && inPill(cards[1], "installed") && !inPill(cards[0], "installed") && inPill(cards[4], "storelib") && inPill(cards[0], "advertising") && !inPill(cards[3], "advertising"))
  const s: DirectoryState = { category: "advertising", q: "pixel", status: "any", by: "any" }
  const pills = pillOrder(() => 1)
  const counts = pillCounts(cards, s, pills)
  check("each pill's number is the cards it would show with the same search and filters", pills.every((p) => counts.get(p) === cards.filter((c) => visibleIn(c, { ...s, category: p })).length), Object.fromEntries(counts))
  check("  a search moves the numbers: 'pixel' is 3 in All and Advertising, 1 in Installed, 0 in Reviews", counts.get("all") === 3 && counts.get("advertising") === 3 && counts.get("installed") === 1 && counts.get("reviews") === 0)
  const withFilter = pillCounts(cards, { ...s, status: "available" }, pills)
  check("  and so does a filter", withFilter.get("all") === 1 && withFilter.get("installed") === 0)
  check("the Filter button counts what is set", activeFilterCount({ status: "any", by: "any" }) === 0 && activeFilterCount({ status: "coming_soon", by: "any" }) === 1 && activeFilterCount({ status: "attention", by: "partner" }) === 2)
}

console.log("\nThe marketplace\n")
{
  const ui = read("components/app/settings/integrations-directory.tsx")
  const page = read("app/(storelib)/app/integrations/integrations-client.tsx")
  check("no line under the title, no Connected list above the cards", !/Storelib apps and the services you already use/.test(page) && !/data-installed-integrations/.test(ui) && !/>Connected</.test(ui))
  check("a search by name, category or description, and Request integration beside it (the bulb alone on a phone)", /placeholder="Search by name, category or description"/.test(ui) && /data-request-integration=""/.test(ui) && /<Lightbulb /.test(ui) && /<span className="hidden sm:inline">Request integration<\/span>/.test(ui) && /aria-label="Request integration"/.test(ui))
  check("a Filter menu after the pills: Status and Made by, kept in the address, with Clear filters", /<FilterMenu status=\{statusFilter\} by=\{maker\} onChange=\{chooseFilters\} counts=\{filterCounts\} \/>/.test(ui) && /data-integration-filter-menu=""/.test(ui) && /data-integration-filter-clear=""/.test(ui) && /writeListState\(\{ category: filter, q: query, status, by \}\)/.test(ui))
  check("the pills that exist are held while typing; their numbers are live", /const pills: Filter\[\] = pillOrder\(\(c\) => held\.get\(c\) \?\? 0\)/.test(ui) && /const counts = pillCounts\(facets, listState, pills\)/.test(ui))
  check("a list on a phone, two across from 640px, three once the list is 880px wide", /sm:grid sm:grid-cols-2/.test(ui) && /@min-\[880px\]:grid-cols-3/.test(ui) && /className="@container /.test(ui))
  check("a card: the mark on a quiet band, the badge top right, name, category, two lines, the same height in a row", /sm:h-full sm:flex-col/.test(ui) && /sm:line-clamp-2 sm:min-h-\[38px\]/.test(ui) && /data-integration-category=""/.test(ui) && /h-\[46px\] overflow-hidden border-b border-\[#f3f4f6\] bg-\[#f9fafb\]/.test(ui))
  check("every card has a badge: Installed, Built in, Available, Coming soon, Needs attention, Not working; Storelib's apps On or Built in", ["Installed", "Built in", "Available", "Coming soon", "Needs attention", "Not working"].every((w) => ui.includes(`>${w}</Badge>`)) && /state === "on" \? <Badge tone="green">On<\/Badge> : <Badge tone="slate">Built in<\/Badge>/.test(ui))
  check("an empty pill offers All, clearing filters, and Request integration", /data-integration-empty-all=""/.test(ui) && /chooseFilters\(\{ status: "any", by: "any" \}\)/.test(ui))
  check("no Essentials pill (the owner asked for it gone in round 30; payments and taxes are Settings, not integrations)", !/"essentials"/.test(ui))
  check("closing a page drops its tab from the address too", /url\.searchParams\.delete\("view"\)/.test(ui))
}

console.log("\nAn integration's page\n")
{
  const ui = read("components/app/settings/integration-detail.tsx")
  check("a banner tinted by the integration's colour, never a photo", /data-integration-banner=""/.test(ui) && /style=\{bannerStyle\(bannerColor\(item\)\)\}/.test(ui) && !/<img[^>]+banner/.test(ui) && !/#8b5cf6|#7c3aed/i.test(ui))
  const brand = [...ui.slice(ui.indexOf("const BRAND"), ui.indexOf("const CATEGORY_TINT")).matchAll(/^\s+"?([a-z0-9-]+)"?: "#/gm)].map((m) => m[1])
  check("  every brand colour names a real integration", brand.length > 15 && brand.every((id) => !!integrationById(id)), brand.filter((id) => !integrationById(id)))
  check("  every category has its own tint", Object.keys(CATEGORY_NAMES).every((c) => new RegExp(`\\b${c}: "#`).test(ui)))
  check("the mark on a white tile over the banner, the name, what it does, its category and where it stands", /-mt-9 inline-flex rounded-\[18px\] bg-white/.test(ui) && /<Mark item=\{item\} size=\{60\} \/>/.test(ui) && /data-integration-standing=\{status\}/.test(ui))
  check("actions: Install, Connect or Turn on; then Installed, Settings, and Disconnect with a confirm", /data-integration-install-action=\{verb\}/.test(ui) && /data-integration-installed=""/.test(ui) && /data-integration-uninstall=\{plan\.verb\}/.test(ui) && /data-integration-uninstall-confirm=""/.test(ui) && /<Modal\s+open=\{confirming\}/.test(ui))
  check("  on a phone the header's Disconnect is the card at the foot instead", /className="hidden h-10 items-center[^"]*sm:inline-flex[^"]*" data-integration-uninstall/.test(ui) && /data-integration-remove=""/.test(ui))
  check("sections: Set up (steps, then the existing panel), Status, What it does, Your data, Disconnect; At a glance beside", /data-integration-steps=""/.test(ui) && /data-integration-status=""/.test(ui) && /data-integration-about=""/.test(ui) && /data-integration-data=""/.test(ui) && /data-integration-glance=""/.test(ui))
  check("  every panel the integrations had is still the one drawn", ["<ReviewsAppPanel onChanged=", "<TrackingAppPanel onChanged=", "<GaConnect value=", "<TrackerInstall item=", "<IntegrationCard provider=", "<MarketingSyncPanel provider=", "<NotifyMe item="].every((x) => ui.includes(x)))
  check("  a panel is drawn again after a header action, from the fresh read", /await readFresh\(plan\.refresh\)/.test(ui) && /<div key=\{panelKey\}>\{panel\}<\/div>/.test(ui))
  check("Turn on is at once, and undone if the server says no", /if \(item\.appId\) onApp\(item\.appId, true\)\s*const error = await send\(call\)\s*if \(error\) \{\s*if \(item\.appId\) onApp\(item\.appId, false\)/.test(ui))
  check("Status shows only what is known: account, key's last four, last sync, the last problem", /label: "Last sync"/.test(ui) && /label: "Last problem"/.test(ui) && /`•••• \$\{keyHint\}`/.test(ui))
  check("the long text is closed until asked for", /<details className="group border-t[^"]*" data-integration-details="">/.test(ui))
  check("nothing on the page needs the assistant: no import of it, no call to it", !/from "[^"]*(assistant|ai-chat|\/chat)[^"]*"/.test(ui + read("lib/integrations/detail-actions.ts") + read("components/app/settings/integration-apps.tsx")) && !/\/api\/(ai|assistant|chat)/.test(ui + read("lib/integrations/detail-actions.ts")))
}

console.log("\nWhat the actions call\n")
{
  const it = (id: string) => integrationById(id)!
  const reviews = removalPlan(it("storelib-reviews"), { installed: true })
  check("Storelib Reviews: Turn off sends enabled false; Turn on is one press", reviews?.verb === "turn_off" && JSON.stringify(reviews.calls) === JSON.stringify([{ path: "/api/store/reviews-app", method: "PUT", body: { enabled: false } }]) && JSON.stringify(oneTapInstall(it("storelib-reviews"))?.body) === '{"enabled":true}' && installVerb(it("storelib-reviews")) === "Turn on")
  const k = removalPlan(it("klaviyo"), { installed: true, marketingConnected: true, trackerSaved: true })
  check("Klaviyo: disconnect the sync, then remove the site ID", k?.verb === "disconnect" && k.calls.map((c) => `${c.method} ${c.path}`).join() === "POST /api/store/integrations/marketing,PUT /api/store/integrations" && k.calls[0].body.disconnect === true && k.calls[1].body.value === null)
  check("  only the site ID saved: Remove", removalPlan(it("klaviyo"), { installed: true, trackerSaved: true })?.verb === "remove")
  check("a pixel: Remove, the ID set to nothing", JSON.stringify(removalPlan(it("meta-pixel"), { installed: true, trackerSaved: true })?.calls) === JSON.stringify([{ path: "/api/store/integrations", method: "PUT", body: { id: "meta_pixel", value: null } }]))
  check("Printful and the webhook: disconnect on their own route", removalPlan(it("printful"), { installed: true })?.calls[0].path === "/api/physical/integrations/printful" && removalPlan(it("custom-webhook"), { installed: true })?.calls[0].body.disconnect === true)
  check("AfterShip: back to Storelib's tracking", removalPlan(it("aftership"), { installed: true })?.calls[0].body.remove === true)
  check("nothing to take off: not installed, Courier tracking (built in), Coming soon", removalPlan(it("meta-pixel"), { installed: false }) === null && removalPlan(it("courier-tracking"), { installed: true }) === null && removalPlan(it("sendcloud"), { installed: false }) === null)
  /* Every route the header calls exists and takes that body (the same the panels send). */
  check("the routes exist and take those bodies", existsSync(join(process.cwd(), "app/api/store/reviews-app/route.ts")) && /body\.disconnect !== true/.test(read("app/api/physical/integrations/[provider]/route.ts")) && /disconnect: true/.test(read("app/api/store/integrations/marketing/route.ts")) && /PUT \{ remove: true \}/.test(read("app/api/store/tracking-app/route.ts")) && /a change, laid over what is saved/.test(read("app/api/store/reviews-app/route.ts")))
  const all = visibleIntegrations(true)
  const connectable = all.filter((i) => !i.comingSoon && i.kind !== "listed" && installVerb(i))
  check("every integration that can be connected has setup steps, at most four", connectable.every((i) => setupSteps(i).length > 0 && setupSteps(i).length <= 4), connectable.filter((i) => !setupSteps(i).length).map((i) => i.id))
  check("  Coming soon has none", all.filter((i) => i.comingSoon).every((i) => setupSteps(i).length === 0))
  const copy = JSON.stringify([...all.flatMap((i) => setupSteps(i)), ...all.map((i) => removalPlan(i, { installed: true, trackerSaved: true, marketingConnected: true })?.consequence ?? "")])
  check("  plain words: no em dash, no Shopify or Liquid, nothing that sounds like an ad", !/[—–]|Shopify|Liquid|seamless|effortless|unlock|powerful|supercharge|elevate/i.test(copy))
}

console.log("\nThe plug-in API for built-in apps\n")
{
  const api = read("components/app/settings/integration-apps.tsx")
  check("documented at the top of its file: the shape, what Body is given, the rules", /THE WHOLE API/.test(api) && /INTEGRATION_APP_VIEWS\[integrationId\] = \{/.test(api) && /What `Body` is given/.test(api) && /Rules for a view/.test(api))
  const view = integrationAppView("storelib-reviews")
  /* Changed on purpose (round K5): the placeholder is replaced by Storelib Reviews' managed page (components/reviews/manage/integration-view.tsx). */
  check("Storelib Reviews plugs its managed page in: Overview, Reviews, Requests, Widgets, Analytics, Settings", !!view && view.tabs().map((t) => t.id).join() === "overview,reviews,requests,widgets,analytics,settings" && view.defaultTab === "overview")
  check("  keyed by catalog ids, and only Storelib's own", Object.keys(INTEGRATION_APP_VIEWS).every((id) => !!integrationById(id) && hasBuiltInArt(id)))
  check("the tab in the address if the view has it, else the default", tabFor(view!, "analytics") === "analytics" && tabFor(view!, "nope") === "overview" && tabFor(view!, null) === "overview")
  check("no view, no tabs: a third party integration keeps the shell's own sections", integrationAppView("klaviyo") === null && integrationAppView(null) === null)
  const sections = { setup: React.createElement("i", { id: "setup" }), status: null, overview: React.createElement("i", { id: "overview" }), data: React.createElement("i", { id: "data" }), glance: React.createElement("i", { id: "glance" }), danger: React.createElement("i", { id: "danger" }) }
  const Layout = ({ main, aside }: { main: React.ReactNode; aside?: React.ReactNode }) => React.createElement("div", null, React.createElement("main", null, main), aside)
  const props = (tab: string): IntegrationAppBodyProps => ({ tab, setTab: () => {}, item: integrationById("storelib-reviews")!, status: "installed", installed: true, sections, Layout, onChanged: () => {} })
  const settingsHtml = renderToStaticMarkup(React.createElement(view!.Body, props("settings")))
  const overviewHtml = renderToStaticMarkup(React.createElement(view!.Body, props("overview")))
  check("  Settings keeps At a glance beside it (the shell's Layout); the other views use the full width", /id="glance"/.test(settingsHtml) && !/id="glance"/.test(overviewHtml))
  const reviewsView = read("components/reviews/manage/integration-view.tsx")
  check("  Settings carries the shell's Status, Turn off, What it does and Your data under the app's own settings", /\{sections\.status\}\s*\{sections\.danger\}\s*\{sections\.overview\}\s*\{sections\.data\}/.test(reviewsView))
  const before = INTEGRATION_APP_VIEWS["storelib-reviews"]
  registerIntegrationApp("storelib-reviews", { tabs: () => [{ id: "overview", label: "Overview" }, { id: "reviews", label: "Reviews", count: 2 }], Body: () => null })
  check("registerIntegrationApp replaces a view (how the reviews management plugs in)", integrationAppView("storelib-reviews")!.tabs()[1].count === 2 && tabFor(integrationAppView("storelib-reviews")!, null) === "overview")
  INTEGRATION_APP_VIEWS["storelib-reviews"] = before
  const page = read("components/app/settings/integration-detail.tsx")
  check("the page draws the tabs under its header and hands the body over, the tab kept in ?view=", /data-integration-tabs=""/.test(page) && /<Body tab=\{tab\} setTab=\{setTab\} item=\{item\} status=\{status\} installed=\{installed\} sections=\{sections\} Layout=\{Layout\}/.test(page) && /url\.searchParams\.set\("view", id\)/.test(page))
}

void INTEGRATIONS
console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
