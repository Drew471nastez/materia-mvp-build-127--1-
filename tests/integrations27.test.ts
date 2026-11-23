/**
 * Round 27: the /app page bar, Integrations and Storelib Reviews.
 *
 *   K   the page bar is sticky only where it is worked from (an order, an
 *       email, the composer, a membership, a Help article, Emails' tabs);
 *       list pages like Integrations scroll it away, flat
 *   L1  a card's hover changes its depth only, never its place
 *   L2  the badge sits in the card's band, clear of its line
 *   L3  an integration's Connect follows in a bar once scrolled away
 *   L4  Back from an integration's page lands where the list was
 *   L5  an integration's page has no page title above it
 *   L6  Products › Reviews is /app/reviews, Storelib Reviews' own page
 *   L7  where it stands is one line
 *   L8  the reviews tabs keep each opened view, hold the page's height,
 *       and ready a view under the pointer
 *
 *   npx tsx tests/integrations27.test.ts
 *
 * The browser half (every frame of a hover, the following bar coming and
 * going, Back, the tabs at 1440 and at 390 with the CPU 4x slower) is
 * scripts/check-integrations27.mjs.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { PaneBar, OrderBarFrame } from "@/app/(storelib)/app/orders/order-parts"
import { ReviewsManageBody } from "@/components/reviews/manage/reviews-manage"
import { MANAGE_VIEWS } from "@/components/reviews/manage/views"
import { reviewsIntegrationView } from "@/components/reviews/manage/integration-view"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const raw = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const read = (p: string) => untt(raw(p), p)

console.log("\nK  The page bar: sticky only where it is worked from\n")
{
  const flat = renderToStaticMarkup(React.createElement(PaneBar, { width: "max-w-[1200px]", children: React.createElement("h1", null, "Integrations") }))
  const stuck = renderToStaticMarkup(React.createElement(PaneBar, { width: "max-w-[1200px]", sticky: true, children: React.createElement("h1", null, "Order") }))
  check("a bar is flat by default: not sticky, no scrolled state, no depth", !/sticky/.test(flat) && !/data-scrolled/.test(flat) && !/class="[^"]*orders-bar/.test(flat) && /data-orders-bar=""/.test(flat) && /bg-\[#f8f9fa\]/.test(flat), flat)
  check("  `sticky` is the bar it was: stuck at the top, with its hairline and shadow once scrolled under", /data-scrolled="false"/.test(stuck) && /class="orders-bar sticky top-0 z-10 bg-\[#f8f9fa\]"/.test(stuck), stuck)
  check("  the same box either way: the same column inside, the same background", flat.replace(/<div[^>]*data-orders-bar[^>]*>/, "") === stuck.replace(/<div[^>]*data-orders-bar[^>]*>/, "").replace("Order", "Integrations"))
  const order = renderToStaticMarkup(React.createElement(OrderBarFrame, { back: null, title: "#1", subtitle: "today" }))
  check("an order's or an email's bar (OrderBarFrame: Back and the actions) is sticky", /orders-bar sticky top-0/.test(order))
  const parts = raw("app/(storelib)/app/orders/order-parts.tsx")
  check("  the scroll is only listened to on a sticky bar", /const pane = sticky \? bar\?\.closest<HTMLElement>\("\.orders-pane"\) : null/.test(parts))
  /* Changed on purpose (round 28, the owner: "do not make the page header sticky"): Emails' title, buttons and tabs scroll away with the page, as every list's. */
  const stickyPages = ["components/email/compose/composer.tsx", "components/memberships/creator-screen.tsx", "components/help/app-help-frame.tsx"]
  check("Emails' bar is flat now", /<PaneBar width=\{LIST_WIDTH\} className=/.test(raw("app/(storelib)/app/emails/emails-home.tsx")) && !/<PaneBar [^>]*\bsticky\b/.test(raw("app/(storelib)/app/emails/emails-home.tsx")))
  check("sticky where the bar is how the page is worked: the composer, a membership, a Help article", stickyPages.every((f) => /<PaneBar width=\{[A-Z_]+\} sticky className=/.test(raw(f))), stickyPages.filter((f) => !/<PaneBar width=\{[A-Z_]+\} sticky/.test(raw(f))))
  const listPages = ["app/(storelib)/app/integrations/integrations-client.tsx", "app/(storelib)/app/orders/orders-list.tsx", "app/(storelib)/app/products/products-client.tsx", "app/(storelib)/app/files/files-client.tsx", "app/(storelib)/app/coupons/coupons-client.tsx", "app/(storelib)/app/offers/offers-client.tsx", "app/(storelib)/app/inventory/inventory-client.tsx", "app/(storelib)/app/support/support-client.tsx"]
  check("flat on a list (title and one action): Integrations, Orders, Products, Files, Coupons, Offers, Inventory, Support", listPages.every((f) => /<PaneBar /.test(raw(f)) && !/<PaneBar [^>]*\bsticky\b/.test(raw(f))), listPages.filter((f) => /<PaneBar [^>]*\bsticky\b/.test(raw(f))))
  check("the hairline and shadow are still the sticky bar's (app/globals.css)", /\.orders-bar\[data-scrolled="true"\] \{\s*box-shadow: 0 1px 0 rgba\(17, 24, 39, 0\.07\)/.test(raw("app/globals.css")))
}

console.log("\nL1 L2  The cards\n")
{
  const ui = raw("components/app/settings/integrations-directory.tsx")
  const entry = ui.slice(ui.indexOf("const ENTRY = cn("), ui.indexOf("function EntryBody"))
  check("a hover never moves a card: no translate, and its transition is only colours and the shadow", !/translate/.test(entry) && /transition-\[background-color,box-shadow,border-color\]/.test(entry) && !/transform\]/.test(entry))
  check("  only its depth changes: the hairline a shade darker and the soft shadow, from a resting shadow of the same shape", /sm:hover:border-\[#dfe2e6\]/.test(entry) && /sm:shadow-\[0_1px_2px_rgba\(16,24,40,0\.04\),0_10px_24px_-12px_rgba\(16,24,40,0\)\]/.test(entry) && /sm:hover:shadow-\[0_1px_2px_rgba\(16,24,40,0\.04\),0_10px_24px_-12px_rgba\(16,24,40,0\.18\)\]/.test(entry))
  check("  eased in and out on one curve", /duration-200 ease-\[cubic-bezier\(0\.2,0,0,1\)\]/.test(entry))
  check("the badge sits in the 46px band, centred in it, not on its line", /h-\[46px\] overflow-hidden border-b/.test(ui) && /className="hidden sm:-mt-\[9\.5px\] sm:inline-flex" data-integration-card-badge=""/.test(ui))
}

console.log("\nL3 L5 L7  An integration's page\n")
{
  const ui = raw("components/app/settings/integration-detail.tsx")
  const page = raw("app/(storelib)/app/integrations/integrations-client.tsx")
  check("L5: no page title on an integration's page, gone in the same frame it is drawn (the directory's own view, not the address)", /const NO_BAR_ON_A_PAGE = "\[&:has\(\[data-integrations-view=page\]\)>\[data-orders-bar\]\]:hidden"/.test(page) && /cn\("orders-pane [^"]*", NO_BAR_ON_A_PAGE\)/.test(page))
  check("  the page starts with Back, with room of its own above it", /data-integrations-view="page" className=\{cn\("scroll-mt-4", page && "pt-3 sm:pt-5"\)\}/.test(raw("components/app/settings/integrations-directory.tsx")))
  check("  the integration's name is the page's title where it is a page", /const Title = pin \? "h1" : "h2"/.test(ui) && /<Title className="text-\[24px\] font-bold/.test(ui))
  check("L7: where it stands is one line: category, Made by Storelib, the status; no sentence after", /flex min-w-0 flex-nowrap items-center gap-x-2\.5 whitespace-nowrap text-\[13px\]" data-integration-standing=\{status\}/.test(ui) && !/basis-full/.test(ui))
  check("  a second line only when it says something: the ID saved, or what is wrong", /const standingNote = tracked && item\.trackerId \? `\$\{TRACKERS\[item\.trackerId\]\.label\}: \$\{tracked\}` : status === "needs_attention" \|\| status === "error" \? standing\.line : null/.test(ui))
  check("L3: the bar follows only on a page of its own and only with something to do", /const pinnable = pin && \(notifyOnly \|\| !!verb\)/.test(ui) && /pin=\{page\}/.test(raw("components/app/settings/integrations-directory.tsx")))
  /* Round Y2: one observer for the Back link's mark and the header's actions; the bar comes with Back, its action once the header's is gone (tests/integrations-y2.test.ts). */
  check("  shown once the header's action is out of view or under the bar's room, by an IntersectionObserver on the page's scroller", /new IntersectionObserver\(/.test(ui) && /rootMargin: `-\$\{PIN_ROOM\}px 0px 0px 0px`/.test(ui) && /out\.set\(e\.target, !e\.isIntersecting && e\.boundingClientRect\.bottom <= top \+ 0\.5\)/.test(ui))
  check("  a sticky box with no height, so nothing under it moves; the bar fades and drops into place, in and out on the Back link's curve", /className="sticky top-0 z-20 h-0" data-integration-pin-box=""/.test(ui) && /transition-\[opacity,translate\] duration-200 ease-\[cubic-bezier\(0\.2,0,0,1\)\]/.test(ui) && /pinned \? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-1\.5 opacity-0"/.test(ui) && /inert=\{!pinned\}/.test(ui))
  check("  8px under the top on a phone, 12px wider; its button has an 8px radius and does what the header's does", /absolute inset-x-0 top-0 pt-2 [^"]*sm:pt-3/.test(ui) && /* Changed on purpose (the mobile pass): the same 36px button, with a 44px target around it (HIT). */ /cn\(BTN_PRIMARY, "h-9 shrink-0 rounded-lg px-3\.5", HIT\)\} data-integration-pin-action=""/.test(ui) && /const HIT = "relative after:absolute after:-inset-1 after:content-\[''\]"/.test(ui) && /onClick=\{pressPrimary\} className=\{cn\(BTN_PRIMARY, "h-9/.test(ui) && /ref=\{primaryRef\}[^>]*onClick=\{pressPrimary\}/.test(ui))
  check("  At a glance sticks under the bar when there is one, never under it", /barOn \? "lg:top-\[80px\]" : "lg:top-4"/.test(ui))
  check("L4: Back is the list's own way back: through history when it opened the page, the list's scroll and card put back before the first frame", /backThen\(\(\) => writeIntegrationParam\(null, "replace"\)\)/.test(raw("components/app/settings/integrations-directory.tsx")) && /if \(box && at\) box\.scrollTop = at\.scroll/.test(raw("components/app/settings/integrations-directory.tsx")))
}

console.log("\nL6  /app/reviews is Storelib Reviews' own page\n")
{
  const page = read("app/(storelib)/app/reviews/page.tsx")
  const client = raw("app/(storelib)/app/reviews/reviews-client.tsx")
  check("the page draws it, no longer sending to Integrations", /<ReviewsClient \/>/.test(page) && !/redirect\(`/.test(page) && !/integration=storelib-reviews/.test(page))
  check("  the integration's own page, alone: the directory with `only`, in the pane every /app list page scrolls in", /<IntegrationsDirectory page only="storelib-reviews" \/>/.test(client) && /orders-pane h-full overflow-y-auto overflow-x-hidden page-scroll bg-\[#f8f9fa\] app-page-enter" data-integrations-scroll=""/.test(client))
  const dir = raw("components/app/settings/integrations-directory.tsx")
  check("  `only`: that page from the first render, no Back to integrations, nothing else drawn", /const wanted = only \?\? params\?\.get\("integration"\) \?\? null/.test(dir) && /onBack=\{only \? undefined : \(\) => open\(null\)\}/.test(dir) && /if \(only && !current\) return null/.test(dir))
  check("  Back is drawn only when there is somewhere to go back to", /\{onBack \? \(\s*<button/.test(raw("components/app/settings/integration-detail.tsx")))
  check("the sidebar's Products › Reviews names /app/reviews", /\{ href: "\/app\/reviews", label: "Reviews" \}/.test(read("components/app/sidebar.tsx")))
  check("/app/reviews/widgets opens its Widgets tab there", /const WIDGETS_HOME = "\/app\/reviews\?view=widgets"/.test(raw("app/(storelib)/app/reviews/widgets/page.tsx")))
  check("  and the gallery's Turn it on goes to its Settings tab there", /href="\/app\/reviews\?view=settings"/.test(raw("components/reviews/widgets/widgets-gallery.tsx")))
}

console.log("\nL8  The reviews tabs\n")
{
  const ui = raw("components/app/settings/integration-detail.tsx")
  check("the tab is marked on the press, in the same frame (state, then the address in place)", /setTabState\(id\)\s*writeViewParam\(/.test(ui))
  check("the page under the tabs is held at its height until the next tab is in, then eased only as far as the scroll allows", /panel\.style\.minHeight = `\$\{heldAt\.current\}px`/.test(ui) && /const keep = Math\.min\(was, Math\.max\(own, needed\)\)/.test(ui) && /box\.addEventListener\("scroll", onScroll, \{ passive: true \}\)/.test(ui))
  check("a tab under the pointer, a finger or the keyboard is readied in a transition", /onPointerEnter=\{\(\) => warm\(t\.id\)\}/.test(ui) && /onTouchStart=\{\(\) => warm\(t\.id\)\}/.test(ui) && /onFocus=\{\(\) => warm\(t\.id\)\}/.test(ui) && /React\.startTransition\(\(\) => setWarmTab\(id\)\)/.test(ui) && /<Body tab=\{tab\} [^>]*warm=\{warmTab\}/.test(ui))
  check("  the plug-in API says so (warm)", /warm\?: string \| null/.test(raw("components/app/settings/integration-apps.tsx")))
  const view = raw("components/reviews/manage/integration-view.tsx")
  /* Changed on purpose (r58): the aside on Settings is the installed page template's column, What is synced over At a glance; still one Layout for every tab. */
  check("one tree for every tab: Settings no longer builds the whole page again", /<Layout\s+main=\{body\}\s+aside=\{\s*view === "settings" \? \([\s\S]*?\{sections\.synced\}\s*\{sections\.glance\}[\s\S]*?\) : undefined\s*\}\s*\/>/.test(view) && (view.match(/<Layout/g) ?? []).length === 1 && !/view === "settings" \? <Layout/.test(view))

  /* The body, drawn: the open view, a readied one hidden, nothing else. */
  const html = renderToStaticMarkup(React.createElement(ReviewsManageBody, { view: "overview", warm: "analytics", onGo: () => {} }))
  const panes = [...html.matchAll(/<div( hidden="")? data-reviews-pane="([a-z]+)"/g)].map((m) => `${m[2]}${m[1] ? ":hidden" : ""}`)
  check("the open view is drawn, the one under the pointer readied hidden, no other", panes.join() === "overview,analytics:hidden", panes)
  const manage = raw("components/reviews/manage/reviews-manage.tsx")
  check("a view once opened stays mounted and is only hidden", /opened\.times\[v\] \|\| readied\.has\(v\)/.test(manage) && /<div hidden=\{v !== view\} data-reviews-pane=\{v\}>/.test(manage))
  check("  each opening is counted for its reads", /<ViewShown\.Provider key=\{v\} value=\{opened\.times\[v\] \?\? 0\}>/.test(manage))
  const parts = raw("components/reviews/manage/parts.tsx")
  check("  opened again, a view reads again quietly: no dimming, what it shows replaced when the answer is in", /if \(shown === before \|\| before === 0 \|\| !path\) return/.test(parts) && /if \(live && r\.ok\) setData\(r\.data\)/.test(parts))
  check("every tab is a view the page keeps", MANAGE_VIEWS.join() === "overview,reviews,requests,widgets,analytics,settings" && reviewsIntegrationView.tabs().length === 6)
  check("the request email's first preview is asked for at once, not after a typing pause", /const wait = firstPreview\.current \? 0 : 450/.test(raw("components/reviews/manage/requests-view.tsx")))
}

console.log("\nCopy\n")
{
  const files = ["app/(storelib)/app/orders/order-parts.tsx", "app/(storelib)/app/integrations/integrations-client.tsx", "components/app/settings/integrations-directory.tsx", "components/app/settings/integration-detail.tsx", "components/app/settings/integration-apps.tsx", "app/(storelib)/app/reviews/page.tsx", "app/(storelib)/app/reviews/reviews-client.tsx", "app/(storelib)/app/reviews/widgets/page.tsx", "components/reviews/manage/integration-view.tsx", "components/reviews/manage/reviews-manage.tsx", "components/reviews/manage/parts.tsx", "components/reviews/manage/requests-view.tsx", "scripts/check-integrations27.mjs", "scripts/render-integrations27.tsx", "tests/integrations27.test.ts"]
  const text = files.filter((f) => !f.startsWith("tests/")).map(raw).join("\n")
  /* The CSS property of that name is not a word anyone reads. */
  const words = text.replace(/transition-\[[^\]]*\]|transition-transform|\.transform\b|transform:/g, "")
  check("no em dash and none of the banned words in what this round touched", !/\u2014/.test(text) && !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b/i.test(words), files.filter((f) => /\u2014/.test(raw(f))))
  check("nothing violet in the new bar", !/#8b5cf6|#7c3aed|purple|violet/i.test(raw("components/app/settings/integration-detail.tsx").slice(raw("components/app/settings/integration-detail.tsx").indexOf("THE ACTION FOLLOWS"), raw("components/app/settings/integration-detail.tsx").indexOf("data-integration-page={item.id}"))))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)
