/**
 * The Emails list screen, rebuilt in the Orders page's language
 * (app/(storelib)/app/emails/emails-home.tsx). scripts/check-emails-page.mjs measures it
 * in a browser; this holds the structure that measurement depends on.
 */
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { listBehindShows } from "@/app/(storelib)/app/emails/list-return"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)
const page = read("app/(storelib)/app/emails/emails-client.tsx")
const home = read("app/(storelib)/app/emails/emails-home.tsx")
const detail = read("app/(storelib)/app/emails/email-detail.tsx")
const cache = read("components/email/emails-cache.ts")

console.log("\nThe Emails screen")
/* Changed on purpose (round 51): a new email can open with people, a segment or a layout chosen (preset). */
check("the page draws the list with EmailsHome, and new and edit open the composer", /<EmailsHome\n/.test(page) && /<ComposePage\s+campaignId=\{null\}\s+preset=\{/.test(read("app/(storelib)/app/emails/new/page.tsx")) && /<ComposePage campaignId=\{id\} \/>/.test(read("app/(storelib)/app/emails/edit/[id]/page.tsx")) && /<EmailComposer/.test(read("components/email/compose/compose-page.tsx")))
check("a send that is not simply done says so in the Sent list", /function SendBadge/.test(home) && /Partly sent/.test(home) && /Not sent/.test(home))
check("the old pill tabs, stat boxes and flow cards are gone", !/Tabs - Pill Style/.test(page) && !/grid grid-cols-2 sm:grid-cols-4 gap-4/.test(page) && !/rounded-full transition-all whitespace-nowrap/.test(page))
check("it is drawn with the Orders page's own parts", /from "\.\.\/orders\/order-parts"/.test(home) && /<PaneBar /.test(home) && /StatusBadge/.test(home))
/* Round 24: the views are Analytics' sliding pill (components/app/segmented-pills.tsx, a tablist). */
/* Changed on purpose (wave 6, the owner: "too many pill-shaped selectors, before it looked better"): no pill track in the bar. The bar is the list bar every Storelib list wears (LIST_BAR), never unmounted, with the title and the page's ways in; Campaigns' views are the quiet tabs in the list card's toolbar, as Orders' and Coupons'. */
check("the views are quiet tabs in the list's toolbar, under a bar that never unmounts", !/<SegmentedPills/.test(home) && /<PaneBar width=\{LIST_WIDTH\} className=\{LIST_BAR\}>/.test(home) && /function Views<T extends string>[\s\S]*?role="tablist"[\s\S]*?role="tab"[\s\S]*?aria-selected=\{on\}/.test(home) && /data-campaign-filter=""[\s\S]{0,200}<Views/.test(home))
/* Changed on purpose (round 51): one main action per tab, New email on Campaigns and Create automation on Automations. */
/* Changed on purpose (wave 6): Campaigns' bar carries Automations, Settings and New email, as Contacts' carries Forms; Automations, a page under it, carries Create automation. */
check("each place's one main action: New email on Campaigns, Create automation on Automations", /pageTab === "campaigns" \? \([\s\S]*?data-emails-automations=""[\s\S]*?data-emails-settings=""[\s\S]*?<Link href="\/app\/emails\/new"[^>]*data-new-email/.test(home) && /pageTab === "automations" \? \(\s*<Link href="\/app\/emails\/flow\/new"[^>]*data-new-automation/.test(home))
/* Changed on purpose (round 51): the tab, Campaigns' &show= and Settings' &section= are all replaced the same way. */
/* Changed on purpose (wave 6): Automations and Settings are pages under Emails with a back arrow, so going in is pushed (the arrow, the browser's back and a phone's gesture come out alike) and the arrow pops it, with Campaigns put in the address when nothing is behind; Campaigns' &show= and Settings' &section= are still replaced. */
check("a place is pushed and its back arrow pops it; a filter or section is replaced, with no request and no scroll to the top", /writeAddress\(placeAddress\(next\), push \? "push" : "replace"\)/.test(page) && /if \(next === "campaigns" && placePushed\.current\) \{[\s\S]*?backThen\(/.test(page) && /p\.set\("show", next\)[\s\S]*?\}, "replace"\)/.test(page) && !/router\.replace/.test(page.replace(/\/\*[\s\S]*?\*\//g, "")))
/* Changed on purpose (round 28, the owner: the header is not sticky): the bar scrolls with the page, a switch places no scroll, the content keeps the last tab's until the next has its rows. */
check("the bar is flat, and a tab switch leaves the scroll where it is", /<PaneBar width=\{LIST_WIDTH\} className=/.test(home) && !/<PaneBar [^>]*\bsticky\b/.test(home) && !/scrolls\.current/.test(page) && /min-h-full/.test(home))
check("  the last tab's content stays until the chosen one has its rows, then a skeleton after HOLD_MS", /const canShow = wanted\.data !== undefined \|\| wanted\.error !== null \|\| heldOut === tab/.test(page) && /if \(shown !== tab && canShow\) React\.startTransition\(\(\) => setShown\(tab\)\)/.test(page) && /const HOLD_MS = \d+/.test(page) && /tab=\{shown\}\s+chosenTab=\{tab\}/.test(page))
check("each tab's data is read once and kept, and read again behind what is shown", /export function useCached/.test(cache) && /Date\.now\(\) - e\.at > FRESH_MS/.test(cache) && /useCached<unknown>\(keyFor\(tab\)/.test(page))
check("the other tabs are read while the browser is idle", /requestIdleCallback/.test(page) && /prefetch\(keyFor\(t\), loaderFor\(t\)/.test(page))
check("rows darken while pressed and read ahead on hover or touch", /data-\[pressed=true\]:bg-\[#f4f5f7\]/.test(home) && /setTimeout\(intent, HOVER_PREFETCH_MS\)/.test(home) && /onTouchStart: intent/.test(home))
check("an automation row opens its builder, prefetched", /router\.prefetch\(href\(f\)\)/.test(home) && /data-flow-row=/.test(home))
check("the first column stays put on a phone", /const sticky = "orders-sticky sticky left-0/.test(home))
check("rows are dense", /const td = "h-12 /.test(home))
check("fifty to a page", /const PAGE_SIZE = 50/.test(home))
/* Five: subscribers, messages, emails, and the automations twice (their phone rows and their table from 768px). */
/* Five in the tables, and three in the phone rows (round 24: subscribers, messages, emails; an automation's phone row already had its own). */
/* Changed on purpose (round 51): Subscribers and Messages moved to Contacts: the emails (phone, table) and the automations (phone, table). */
check("a row's actions are the shared menu: a dropdown on a desktop, a sheet on a phone", (home.match(/<ResponsiveActionMenu/g) ?? []).length === 4)
check("and its trigger takes the menu's handlers, or the desktop dropdown never opens",
  /trigger=\{<RowMenuButton /.test(home) && /export const RowMenuButton = React\.forwardRef<HTMLButtonElement/.test(read("app/(storelib)/app/orders/order-parts.tsx")) && /\{\.\.\.rest\}/.test(read("app/(storelib)/app/orders/order-parts.tsx")))
/* Changed on purpose (round 51): the only search box here was the subscribers', which moved to Contacts; none is left to zoom. */
check("no search box left that could zoom on iOS", !/type="search"/.test(home) || /text-\[16px\][^"]*sm:text-\[13px\]/.test(home))
check("a resend reads Sent again, not a raw (Resend) suffix", /Sent again/.test(home))
check("no em dash in what it says", !home.replace(/\/\*[\s\S]*?\*\//g, "").includes("—"))

/*
 * Depth at the cut. "Bscribed" ran flat into the frozen Email column with
 * nothing to say the row carried on under it. Every table in /app that
 * scrolls sideways under a frozen column is framed by the one ScrollEdge,
 * and marks its frozen column's cells, header included, so the shadow is one
 * line from the header to the last row. scripts/check-scroll-edge.mjs
 * measures the line, its fade and the cells' opacity in a browser.
 */
console.log("\nTables that scroll sideways under a frozen column")
{
  const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
  const edge = code("components/app/scroll-edge.tsx")
  const css = read("app/globals.css")
  check("the frame flips two attributes from a passive listener, once a frame, only when they change, and re-renders nothing",
    /addEventListener\("scroll", onScroll, \{ passive: true \}\)/.test(edge) && /raf = requestAnimationFrame\(/.test(edge)
      && /if \(frame\.dataset\.start !== start\) frame\.dataset\.start = start/.test(edge) && !/useState/.test(edge))
  check("where the frozen column ends is measured once, from its marked cells, and handed to the CSS as one number",
    /querySelectorAll<HTMLElement>\("\[data-scroll-edge\]"\)/.test(edge) && /setProperty\("--scroll-edge-x"/.test(edge) && /new ResizeObserver/.test(edge))
  check("the shadow and the right shade are the frame's own pseudo elements, over the table, faded on opacity alone, stopped for reduced motion",
    /\.scroll-edge::before,\s*\.scroll-edge::after \{[^}]*pointer-events: none;[^}]*opacity: 0;\s*transition: opacity 160ms ease-out;/.test(css)
      && /\.scroll-edge::before \{\s*left: var\(--scroll-edge-x, 0px\);\s*top: var\(--scroll-edge-top, 0px\);\s*height: var\(--scroll-edge-h, 100%\);/.test(css)
      && /\.scroll-edge\[data-start="true"\]::before,\s*\.scroll-edge\[data-end="true"\]::after \{\s*opacity: 1;/.test(css)
      && /@media \(prefers-reduced-motion: reduce\) \{\s*\.scroll-edge::before,\s*\.scroll-edge::after \{\s*transition: none;/.test(css))
  /* Changed on purpose (round 51): two tables now, the automations and the emails; Subscribers and Messages moved to Contacts. */
  check("Emails' two tables use it, and mark the frozen column in the header and in every row",
    (home.match(/<ScrollEdge( frameClassName="max-(sm|md):hidden")?>/g) ?? []).length === 2 && (home.match(/<th data-scroll-edge="" className=\{cn\(th, stickyHead[,)]/g) ?? []).length === 2
      && (home.match(/<td data-scroll-edge="" className=\{cn\(td, sticky/g) ?? []).length === 2)
  check("the frozen cells are the row's own opaque colour, hover and press included, and Orders' sticky cells, so a picked row's tint leaves them pinned",
    /const sticky = "orders-sticky sticky left-0 z-\[1\] bg-white[^"]*group-hover:bg-\[#fafbfb\][^"]*group-active:bg-\[#f4f5f7\][^"]*group-data-\[pressed=true\]:bg-\[#f4f5f7\]"/.test(home) && /const stickyHead = "sticky left-0 z-\[1\] bg-\[#fafbfb\]"/.test(home))
  const flow = read("app/(storelib)/app/emails/flow/[id]/builder.tsx")
  check("so does an automation's runs table", /<ScrollEdge>/.test(flow) && (flow.match(/data-scroll-edge="" className="sticky left-0 z-\[1\]/g) ?? []).length === 2)
  const orders = read("app/(storelib)/app/orders/orders-list.tsx")
  check("and the orders list, which had its own copy of the listener and the shadow",
    /<ScrollEdge className="orders-scroller">/.test(orders) && !/scrollerRef|orders-edge|data-overflow/.test(orders) && !/orders-edge|orders-scroller\[/.test(css))
  const walk = (dir: string): string[] =>
    readdirSync(join(process.cwd(), dir), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(`${dir}/${e.name}`) : e.name.endsWith(".tsx") ? [`${dir}/${e.name}`] : [])
  const offenders = [...walk("app/(storelib)/app"), ...walk("components/app")]
    .filter((f) => /<(td|th)\b[^>]*(sticky left-|orders-sticky)/.test(read(f)) && !/<ScrollEdge\b/.test(read(f)))
  check("no other table in /app freezes a column without it", offenders.length === 0, offenders.join(", "))
}

console.log("\nAn email's page, opened over the list the way an order is")
{
  /* Back goes through the watch now, so an entry the browser will not go back through closes the email anyway (lib/navigation/go-back, tests/back-never-stalls). */
  check("?email= is pushed, so back closes it, and the list stays mounted under it", /writeAddress\(\(p\) => p\.set\("email", c\.id\), "push"\)/.test(page) /* Changed on purpose (round 51): no contact opens over the list any more. */ && /backThen\(closeOver\)/.test(page) && /inert=\{listCovered\}/.test(page) && /orders-pane orders-detail/.test(page))
  check("its bar is the order's, drawn on the first frame", /<OrderBarFrame/.test(detail))
  check("it comes in and goes back with Orders' own move, not one of its own",
    /import \{ markRow, moveOrder, stillOrder \} from "\.\.\/orders\/order-motion"/.test(page)
      && /moveOrder\("push", detail, list\)/.test(page) && /moveOrder\("pop", detail, list, \(\) => setLeavingId\(null\), \{ settle: false \}\)/.test(page)
      && /hasUAVisualTransition/.test(page) && /data-order-open=\{listCovered \? "" : undefined\}/.test(page) && /orders-pane orders-list page-scroll/.test(page)
      && /data-arrival="list"/.test(page) && /inert=\{!openId\}/.test(page) && !/visibility: listCovered/.test(page))
  check("the row it came from is marked like an order's row, so the eye lands where it left", /className=\{cn\("orders-row", pressable\)\}[^>]*data-order-id=\{c\.id\}/.test(home) && /markRow\(list, rowOf\(openId\), "held"\)/.test(page) && /markRow\(list, was && rowOf\(was\), "fading"\)/.test(page))
  check("/app/emails/<id> lands on it", /redirect\(UUID\.test\(id\) \? `\/app\/emails\?tab=campaigns&email=/ /* Changed on purpose (round 51): Sent is Campaigns now. */.test(read("app/(storelib)/app/emails/[id]/page.tsx")))
  check("the email is shown as it went out, in the sandboxed preview", /<EmailPreview/.test(detail) && /sandbox="allow-same-origin"/.test(read("components/email/compose/email-preview.tsx")))
  const report = read("app/api/email/campaigns/[id]/report/route.ts")
  check("its numbers come from the send's own rows, for the creator's own email only", /requireCreator\(\)/.test(report) && /\.eq\("creator_id", ctx\.creatorId\)/.test(report) && /countRecipients\(/.test(report) && /"opened_at", "is", null/.test(report))
  check("and no reader's address is in the answer", !/email: r\.email|recipients:/.test(report))
}

/*
 * A contact's sheet. It rose before its content: the runs were read once it
 * was open, and the grey bars turned into the list half way up, a different
 * height, so the top edge jumped (scripts/check-emails-page.mjs measured
 * 360 then 390px, and a quick tap turned the sheet round twice). The content
 * is read on the finger now, the tap waits a moment for it, and the sheet is
 * always there on a phone so opening it is one render.
 */
console.log("\nA contact, opened from its row")
{
  const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
  const detail = code("app/(storelib)/app/emails/contact-detail.tsx")
  const homeCode = code("app/(storelib)/app/emails/emails-home.tsx")
  /* Changed on purpose (round 51): a subscriber no longer opens over Emails: Subscribers moved to Contacts, and an old ?contact= address goes to that person's profile (./emails-r51.test.ts). The page itself (contact-detail.tsx) is kept for whoever reuses it. */
  check("an old ?contact= address goes to Contacts, and Emails draws no contact page", !/<ContactPage/.test(code("app/(storelib)/app/emails/emails-client.tsx")) && /from=subscriber/.test(read("app/(storelib)/app/emails/emails-route.ts")))
  check("its body is the contact's own and starts from what is known", /<ContactBody key=\{keyOf\(contact\.email\)\} contact=\{contact\} \/>/.test(detail) && /useState<RunLite\[\] \| null>\(\(\) => keptRuns\(contact\.email\)\)/.test(detail) && !/setRuns\(null\)/.test(detail))
  /* Round 40: read on the server by the store (app/api/email/area); a failed read is null and is not kept. */
  check("a failed read is not kept", /if \(got\) runsKept\.set\(key/.test(detail))
}

/*
 * "When I click on an email to go to its sub page and then I go back, there
 * is an animation bump throughout the whole page, coming up and down."
 * Three ways back, each now showing the list at once where it was left:
 * an email or a contact over the list (the list's settle in is gone), an
 * automation or a draft (a history back, with the stage's landing held),
 * and the draft composer's own back arrow (a history back when the list is
 * right behind it, on the right tab).
 */
console.log("\nBack to the list is the list, as it was")
{
  const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
  const client = code("app/(storelib)/app/emails/emails-client.tsx")
  const motion = code("app/(storelib)/app/orders/order-motion.ts")
  check("an email or a contact closed on a computer leaves the list whole at once: no half faded, 2px low settle",
    /\{ settle: settleIn = true \}: \{ settle\?: boolean \} = \{\}/.test(motion) && /done\?\.\(\)\s*if \(!settleIn\) return\s*for \(const layer of list\.children\)/.test(motion)
      && /\{ settle: false \}/.test(client))
  check("a return to the page asks the stage for no landing, decided on its first render",
    /const \[returning\] = React\.useState\(\(\) => isTraversing\(\)\)/.test(client) && /React\.useLayoutEffect\(\(\) => \{\s*if \(returning\) holdLanding\(\)\s*\}, \[returning\]\)/.test(client))
  const stage = code("components/app/app-stage.tsx")
  /* Changed on purpose: the stage also holds its landing while a pull to refresh is showing (pullRefreshVisualActive, ddcbaf919; page-performance pins it). */
  check("and the stage lands nothing for a page that held it",
    /requestAnimationFrame\(\(\) => \{\s*const s = scrollers\(\)\s*if \(!s \|\| layered \|\| document\.documentElement\.dataset\.layerMotion \|\| isLandingHeld\(\) \|\| pullRefreshVisualActive\(\)\) return\s*playEntrance/.test(stage))
  const nav = code("lib/ui/app-navigation.ts")
  check("the hold lets go on its own, two frames on, so it cannot swallow the next page's landing",
    /requestAnimationFrame\(\(\) => requestAnimationFrame\(release\)\)/.test(nav) && /window\.setTimeout\(release, 500\)/.test(nav))
  /* Changed on purpose (round 28): no switch places a scroll any more, so the first draw never can either. */
  check("the first draw leaves the scroll the stage put back; a switch of tab places none", !/tabShown/.test(client) && !/pane\.scrollTop =/.test(client))
  check("the list notes its address for the composer's way back", /noteListAddress\(address\)/.test(client))
  check("the composer goes back in history when the list is right behind it on the right tab, and pushes it otherwise",
    /if \(tab && listBehindShows\(tab, canReturnTo\("\/app\/emails"\)\)\) backThen\(\(\) => router\.replace\(list\)\)\s*else router\.push\(list\)/.test(code("components/email/compose/compose-page.tsx")))
  /* Changed on purpose (round 51): the list is Campaigns filtered by &show=, All showing every email. */
  check("the list behind is the list on that tab", listBehindShows("drafts", true, "tab=campaigns&show=drafts") && listBehindShows("drafts", true, "") && !listBehindShows("scheduled", true, "tab=campaigns&show=drafts"))
  check("not an email or a contact open over it, and not a page that is not the list", !listBehindShows("published", true, "tab=campaigns&email=abc") && !listBehindShows("subscribers", true, "contact=s1") && !listBehindShows("drafts", false, "tab=drafts") && !listBehindShows("drafts", true, null))
}

console.log("\nCustomers: buyers who did not ask for news")
{
  const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
  const homeCode = code("app/(storelib)/app/emails/emails-home.tsx")
  const contact = code("app/(storelib)/app/emails/contact-detail.tsx")
  /* Changed on purpose (round 51): the subscriber list, its counts and its Status filter moved to Contacts; the contact page keeps its label. */
  check("a customer is shown as a Customer on the contact, never as Unsubscribed", /if \(s\.status === "customer"\) return "Customer"/.test(contact) && /const status = contactStatusLabel\(contact\)/.test(contact))
  void homeCode
  const queue = code("lib/email-campaigns/queue.ts")
  check("a campaign never goes to one, and does not count them as left out", /if \(status === "customer"\) continue/.test(queue))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
