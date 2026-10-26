/**
 * The Emails list screen, rebuilt in the Orders page's language
 * (app/app/emails/emails-home.tsx). scripts/check-emails-page.mjs measures it
 * in a browser; this holds the structure that measurement depends on.
 */
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { listBehindShows } from "@/app/app/emails/list-return"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)
const page = read("app/app/emails/emails-client.tsx")
const home = read("app/app/emails/emails-home.tsx")
const detail = read("app/app/emails/email-detail.tsx")
const cache = read("components/email/emails-cache.ts")

console.log("\nThe Emails screen")
check("the page draws the list with EmailsHome, and new and edit open the composer", /<EmailsHome\n/.test(page) && /<ComposePage campaignId=\{null\} \/>/.test(read("app/app/emails/new/page.tsx")) && /<ComposePage campaignId=\{id\} \/>/.test(read("app/app/emails/edit/[id]/page.tsx")) && /<EmailComposer/.test(read("components/email/compose/compose-page.tsx")))
check("a send that is not simply done says so in the Sent list", /function SendBadge/.test(home) && /Partly sent/.test(home) && /Not sent/.test(home))
check("the old pill tabs, stat boxes and flow cards are gone", !/Tabs - Pill Style/.test(page) && !/grid grid-cols-2 sm:grid-cols-4 gap-4/.test(page) && !/rounded-full transition-all whitespace-nowrap/.test(page))
check("it is drawn with the Orders page's own parts", /from "\.\.\/orders\/order-parts"/.test(home) && /<PaneBar /.test(home) && /StatusBadge/.test(home))
/* Round 24: the views are Analytics' sliding pill (components/app/segmented-pills.tsx, a tablist). */
check("the views are tabs in the pane's bar, which never unmounts", /<SegmentedPills\s+label="Views"/.test(home) && /role="tablist"/.test(read("components/app/segmented-pills.tsx")) && /<PaneBar [^>]*>[\s\S]{0,1600}<Tabs tab=\{tab\}/.test(home))
check("New automation sits beside New email, on a phone too", /href="\/app\/emails\/flow\/new"[^>]*data-new-automation/.test(home) && /<span className="sm:hidden">Automation<\/span>/.test(home) && /href="\/app\/emails\/new"[^>]*data-new-email/.test(home))
check("a tab switch replaces ?tab= in the address, with no request and no scroll to the top", /writeAddress\(\(p\) => p\.set\("tab", next\), "replace"\)/.test(page) && !/router\.replace/.test(page.replace(/\/\*[\s\S]*?\*\//g, "")))
check("each tab keeps its scroll, and the bar never drops back down", /scrolls\.current\.set\(tab/.test(page) && /pane\.scrollTop = Math\.max\(saved \?\? stick, stick\)/.test(page) && /min-h-full/.test(home))
check("each tab's data is read once and kept, and read again behind what is shown", /export function useCached/.test(cache) && /Date\.now\(\) - e\.at > FRESH_MS/.test(cache) && /useCached<unknown>\(keyFor\(tab\)/.test(page))
check("the other tabs are read while the browser is idle", /requestIdleCallback/.test(page) && /prefetch\(keyFor\(t\), loaderFor\(t\)/.test(page))
check("rows darken while pressed and read ahead on hover or touch", /data-\[pressed=true\]:bg-\[#f4f5f7\]/.test(home) && /setTimeout\(intent, HOVER_PREFETCH_MS\)/.test(home) && /onTouchStart: intent/.test(home))
check("an automation row opens its builder, prefetched", /router\.prefetch\(href\(f\)\)/.test(home) && /data-flow-row=/.test(home))
check("the first column stays put on a phone", /const sticky = "orders-sticky sticky left-0/.test(home))
check("rows are dense", /const td = "h-12 /.test(home))
check("fifty to a page", /const PAGE_SIZE = 50/.test(home))
/* Five: subscribers, messages, emails, and the automations twice (their phone rows and their table from 768px). */
/* Five in the tables, and three in the phone rows (round 24: subscribers, messages, emails; an automation's phone row already had its own). */
check("a row's actions are the shared menu: a dropdown on a desktop, a sheet on a phone", (home.match(/<ResponsiveActionMenu/g) ?? []).length === 8)
check("and its trigger takes the menu's handlers, or the desktop dropdown never opens",
  /trigger=\{<RowMenuButton /.test(home) && /export const RowMenuButton = React\.forwardRef<HTMLButtonElement/.test(read("app/app/orders/order-parts.tsx")) && /\{\.\.\.rest\}/.test(read("app/app/orders/order-parts.tsx")))
check("a search box is 16px on a phone, so iOS does not zoom", /text-\[16px\][^"]*sm:text-\[13px\]/.test(home))
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
  /* Four since Messages joined Subscribers, the automations and the emails. */
  check("Emails' four tables use it, and mark the frozen column in the header and in every row",
    (home.match(/<ScrollEdge( frameClassName="max-(sm|md):hidden")?>/g) ?? []).length === 4 && (home.match(/<th data-scroll-edge="" className=\{cn\(th, stickyHead[,)]/g) ?? []).length === 4
      && (home.match(/<td data-scroll-edge="" className=\{cn\(td, sticky/g) ?? []).length === 4)
  check("the subscribers' email column keeps to its content (w-px), so the scrolling columns stay in view on a phone", /<th data-scroll-edge="" className=\{cn\(th, stickyHead, "w-px"\)\}>Email<\/th>/.test(home))
  check("the frozen cells are the row's own opaque colour, hover and press included, and Orders' sticky cells, so a picked row's tint leaves them pinned",
    /const sticky = "orders-sticky sticky left-0 z-\[1\] bg-white[^"]*group-hover:bg-\[#fafbfb\][^"]*group-active:bg-\[#f4f5f7\][^"]*group-data-\[pressed=true\]:bg-\[#f4f5f7\]"/.test(home) && /const stickyHead = "sticky left-0 z-\[1\] bg-\[#fafbfb\]"/.test(home))
  const flow = read("app/app/emails/flow/[id]/builder.tsx")
  check("so does an automation's runs table", /<ScrollEdge>/.test(flow) && (flow.match(/data-scroll-edge="" className="sticky left-0 z-\[1\]/g) ?? []).length === 2)
  const orders = read("app/app/orders/orders-list.tsx")
  check("and the orders list, which had its own copy of the listener and the shadow",
    /<ScrollEdge className="orders-scroller">/.test(orders) && !/scrollerRef|orders-edge|data-overflow/.test(orders) && !/orders-edge|orders-scroller\[/.test(css))
  const walk = (dir: string): string[] =>
    readdirSync(join(process.cwd(), dir), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(`${dir}/${e.name}`) : e.name.endsWith(".tsx") ? [`${dir}/${e.name}`] : [])
  const offenders = [...walk("app/app"), ...walk("components/app")]
    .filter((f) => /<(td|th)\b[^>]*(sticky left-|orders-sticky)/.test(read(f)) && !/<ScrollEdge\b/.test(read(f)))
  check("no other table in /app freezes a column without it", offenders.length === 0, offenders.join(", "))
}

console.log("\nAn email's page, opened over the list the way an order is")
{
  /* Back goes through the watch now, so an entry the browser will not go back through closes the email anyway (lib/navigation/go-back, tests/back-never-stalls). */
  check("?email= is pushed, so back closes it, and the list stays mounted under it", /writeAddress\(\(p\) => \{ p\.delete\("contact"\); p\.set\("email", c\.id\) \}, "push"\)/.test(page) && /backThen\(closeOver\)/.test(page) && /inert=\{listCovered\}/.test(page) && /orders-pane orders-detail/.test(page))
  check("its bar is the order's, drawn on the first frame", /<OrderBarFrame/.test(detail))
  check("it comes in and goes back with Orders' own move, not one of its own",
    /import \{ markRow, moveOrder, stillOrder \} from "\.\.\/orders\/order-motion"/.test(page)
      && /moveOrder\("push", detail, list\)/.test(page) && /moveOrder\("pop", detail, list, \(\) => setLeavingId\(null\), \{ settle: false \}\)/.test(page)
      && /hasUAVisualTransition/.test(page) && /data-order-open=\{listCovered \? "" : undefined\}/.test(page) && /orders-pane orders-list page-scroll/.test(page)
      && /data-arrival="list"/.test(page) && /inert=\{!openId\}/.test(page) && !/visibility: listCovered/.test(page))
  check("the row it came from is marked like an order's row, so the eye lands where it left", /className=\{cn\("orders-row", pressable\)\}[^>]*data-order-id=\{c\.id\}/.test(home) && /markRow\(list, rowOf\(openId\), "held"\)/.test(page) && /markRow\(list, was && rowOf\(was\), "fading"\)/.test(page))
  check("/app/emails/<id> lands on it", /redirect\(UUID\.test\(id\) \? `\/app\/emails\?tab=published&email=/.test(read("app/app/emails/[id]/page.tsx")))
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
  const detail = code("app/app/emails/contact-detail.tsx")
  const homeCode = code("app/app/emails/emails-home.tsx")
  check("a finger on the row, or a pointer resting on it as long as on an order's row, asks for the contact's runs",
    /\{\.\.\.press\(s\.id, \(\) => prefetchContact\(s\.email\)\)\}/.test(homeCode) && /onPointerDown: \(e: React\.PointerEvent\) => \{\s*intent\?\.\(\)/.test(homeCode)
      && /hover\.current = window\.setTimeout\(intent, HOVER_PREFETCH_MS\)/.test(homeCode) && /import \{ HOVER_PREFETCH_MS \} from "\.\.\/orders\/order-prefetch"/.test(homeCode))
  check("and the row stays pressed while its page waits", /\{\.\.\.\(waiting === s\.id \? \{ "data-pressed": "true" \} : null\)\}/.test(homeCode))
  check("the tap waits for them, at most a moment, and the latest tap wins",
    /export const OPEN_WAIT_MS = 300/.test(detail) && /void contactReady\(s\.email\)\.then\(\(\) => \{\s*if \(opening\.current !== s\) return/.test(homeCode) && /onClick=\{\(\) => openContact\(s\)\}/.test(homeCode))
  check("it opens as its own page over the list, like an order: a real address, the bar, cards; no sheet or side panel",
    /onOpenContact=\{onOpenContact\}/.test(code("app/app/emails/emails-client.tsx")) && /p\.set\("contact", s\.id\)/.test(code("app/app/emails/emails-client.tsx"))
      && /<ContactPage/.test(code("app/app/emails/emails-client.tsx")) && /<OrderBarFrame/.test(detail) && !/BottomSheet|aside/.test(detail)
      && /props\.onOpenContact\(s\)/.test(homeCode) && !/<ContactDetail/.test(homeCode))
  check("its body is the contact's own and starts from what is known", /<ContactBody key=\{keyOf\(contact\.email\)\} contact=\{contact\} \/>/.test(detail) && /useState<RunLite\[\] \| null>\(\(\) => keptRuns\(contact\.email\)\)/.test(detail) && !/setRuns\(null\)/.test(detail))
  check("a failed read is not kept", /if \(!error\) runsKept\.set\(key/.test(detail))
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
  const client = code("app/app/emails/emails-client.tsx")
  const motion = code("app/app/orders/order-motion.ts")
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
  check("the first draw leaves the scroll the stage put back; only a switch of tab places it",
    /if \(!tabShown\.current\) \{\s*tabShown\.current = true\s*return\s*\}/.test(client))
  check("the list notes its address for the composer's way back", /noteListAddress\(address\)/.test(client))
  check("the composer goes back in history when the list is right behind it on the right tab, and pushes it otherwise",
    /if \(tab && listBehindShows\(tab, canReturnTo\("\/app\/emails"\)\)\) backThen\(\(\) => router\.replace\(list\)\)\s*else router\.push\(list\)/.test(code("components/email/compose/compose-page.tsx")))
  check("the list behind is the list on that tab", listBehindShows("drafts", true, "tab=drafts") && listBehindShows("subscribers", true, "") && !listBehindShows("scheduled", true, "tab=drafts"))
  check("not an email or a contact open over it, and not a page that is not the list", !listBehindShows("published", true, "tab=published&email=abc") && !listBehindShows("subscribers", true, "contact=s1") && !listBehindShows("drafts", false, "tab=drafts") && !listBehindShows("drafts", true, null))
}

console.log("\nCustomers: buyers who did not ask for news")
{
  const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
  const homeCode = code("app/app/emails/emails-home.tsx")
  const contact = code("app/app/emails/contact-detail.tsx")
  check("a customer is shown as a Customer, in the list and on the contact, never as Unsubscribed",
    /if \(s\.status === "customer"\) return "Customer"/.test(contact) && /const label = contactStatusLabel\(s\)/.test(homeCode) && /const status = contactStatusLabel\(contact\)/.test(contact))
  check("Subscribers counts the list alone, and Customers the buyers who did not ask",
    /\{ label: "Subscribers", [^}]*value: n\(on\.length\) \}/.test(homeCode) && /s\.status === "customer"\)\.length \+ p\.checkoutBuyersCount/.test(homeCode) && /\{ label: "Customers", /.test(homeCode))
  check("and a Status filter finds them", /<FilterChip label="Status" value=\{statusName\}/.test(homeCode) && /\{ value: "customer", label: "Customers", match: \(s\) => s === "customer" \}/.test(homeCode))
  const queue = code("lib/email-campaigns/queue.ts")
  check("a campaign never goes to one, and does not count them as left out", /if \(status === "customer"\) continue/.test(queue))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
