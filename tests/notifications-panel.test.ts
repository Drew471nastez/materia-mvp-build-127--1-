/**
 * THE NOTIFICATIONS PANEL: UNREAD ONLY, AND MARK ALL AS READ
 *
 * Two buttons in the panel's header (components/app/notifications-modal.tsx)
 * and the count on the bell, which have to agree. What is held in place:
 *
 *   1. The bell counts what is unread: setup to-dos not read or dismissed in
 *      this browser, plus the unread rows the server counted.
 *   2. "Mark all as read" takes all of it to nothing at once, and its undo
 *      puts back only what it changed.
 *   3. "Unread only" is remembered per viewer, and a storage that throws
 *      (a private window, a blocked site) breaks nothing.
 *   4. The server marks every row read in one statement, scoped to the
 *      signed in user.
 *   5. The panel's buttons: pressed state, tooltips, disabled with nothing
 *      unread, the empty state in words.
 *   6. One list, no tabs: "get rid of those category pills". Every row says
 *      what kind of thing it is on the line above its title, and never
 *      leaves that line blank.
 *   7. "Set up payments" cannot be put away until Stripe is connected.
 *
 * The pixels (32px buttons, 44px on a phone, tooltips on a computer only, no
 * shift when toggled) are measured by scripts/check-notifications-panel.mjs.
 */
import { readCode } from "./_source"
import {
  EMPTY_STATE,
  UNREAD_ONLY_KEY,
  getUnreadState,
  markAllRead,
  readIds,
  readUnreadOnly,
  setDbUnread,
  setUnreadState,
  setupNotificationIds,
  setupShown,
  staysUntilDone,
  subscribeUnread,
  unreadCount,
  writeIds,
  writeUnreadOnly,
} from "@/lib/notifications/unread-state"
import { labelOf, panelHref, panelOrder, staysOnOpen, toneOf } from "@/lib/notifications/panel"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    const d = detail === undefined ? "" : `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`
    failures.push(label + d)
    console.log(`  FAIL  ${label}${d}`)
  }
}

function memoryStorage() {
  const map = new Map<string, string>()
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), map }
}
const throwing = {
  getItem: () => {
    throw new Error("SecurityError")
  },
  setItem: () => {
    throw new Error("QuotaExceededError")
  },
}

console.log("\nWhich setup to-dos a creator has")
check("both, for a new creator", setupNotificationIds({ stripeConnected: false, stripeStatus: "not_connected", onePagePublished: false }).join() === "onepage-setup,payment-setup")
check("none, once paid out and published", setupNotificationIds({ stripeConnected: true, stripeStatus: "enabled", onePagePublished: true }).length === 0)
check("payments still, while Stripe is connected but not enabled", setupNotificationIds({ stripeConnected: true, stripeStatus: "pending", onePagePublished: true }).join() === "payment-setup")

console.log("\nThe number on the bell")
const both = ["onepage-setup", "payment-setup"]
check("two to-dos and three unread rows is five", unreadCount({ dbUnread: 3, dismissed: [], read: [] }, both) === 5)
check("a dismissed to-do is not counted", unreadCount({ dbUnread: 0, dismissed: ["onepage-setup"], read: [] }, both) === 1)
check("nor a read one", unreadCount({ dbUnread: 0, dismissed: [], read: ["onepage-setup"] }, both) === 1)
check("a count below nothing is nothing", unreadCount({ dbUnread: -2, dismissed: ["onepage-setup"], read: ["payment-setup"] }, both) === 0)

console.log("\nSet up payments stays until Stripe is connected")
check("it is one of the to-dos that stay until done, and OnePage is not", staysUntilDone("payment-setup") && !staysUntilDone("onepage-setup"))
check("a dismissal an older build wrote is ignored: it is listed and counted", setupShown("payment-setup", { dismissed: ["payment-setup"] }) && unreadCount({ dbUnread: 0, dismissed: ["payment-setup"], read: [] }, both) === 2)
check("read, it stays listed and is not counted", setupShown("payment-setup", { dismissed: [] }) && unreadCount({ dbUnread: 0, dismissed: ["onepage-setup"], read: ["payment-setup"] }, both) === 0)
check("a server row that says it better still takes its place", !setupShown("payment-setup", { dismissed: [], covered: ["payment-setup"] }))
check("connected, it is gone: the creator no longer has it", !setupNotificationIds({ stripeConnected: true, stripeStatus: "connected", onePagePublished: true }).includes("payment-setup"))
{
  const store = readCode("lib/notifications/unread-state.ts")
  check("dismissing it only marks it read", /if \(staysUntilDone\(id\)\) return markSetupNotificationRead\(id\)/.test(store))
  const modal = readCode("components/app/notifications-modal.tsx")
  check("a tap on it in the panel marks it read and keeps it, like a critical row", /\} else if \(staysUntilDone\(notification\.id\)\) \{[\s\S]{0,200}markSetupNotificationRead\(notification\.id\)/.test(modal))
  check("the panel lists the to-dos through the same rule the bell counts by", (modal.match(/setupShown\("(payment|onepage)-setup", unread\)/g) ?? []).length === 2)
}

console.log("\nMark all as read, and its way back")
{
  const rows = [
    { id: "a", read_at: null, title: "New review" },
    { id: "b", read_at: "2026-09-01T00:00:00.000Z", title: "Old" },
    { id: "c", read_at: null, title: "Another" },
  ]
  const before = { dbUnread: 4, dismissed: ["payment-setup"], read: [] as string[] }
  const at = "2026-09-25T10:00:00.000Z"
  const m = markAllRead(rows, before, both, at)
  check("every unread row is read at once", m.rows.every((r) => r.read_at) && m.rows[0].read_at === at && m.rows[2].read_at === at)
  check("a row read before keeps its own time", m.rows[1].read_at === "2026-09-01T00:00:00.000Z")
  check("the bell goes to nothing in the same step", unreadCount(m.state, both) === 0, m.state)
  check("the rows it was handed are not changed", rows[0].read_at === null)
  const back = m.undo(m.rows, m.state)
  check("undo makes unread exactly the rows it marked", back.rows.map((r) => r.read_at).join() === [null, "2026-09-01T00:00:00.000Z", null].join())
  check("and puts the server's count back", back.state.dbUnread === 4)
  check("the setup to-dos stay read: that part could not fail", back.state.read.includes("onepage-setup"))
  const readMeanwhile = m.undo(m.rows.map((r) => (r.id === "a" ? { ...r, read_at: "2026-09-25T10:00:05.000Z" } : r)), m.state)
  check("a row read some other way meanwhile stays read", readMeanwhile.rows[0].read_at === "2026-09-25T10:00:05.000Z")
  const newer = m.undo(m.rows, { ...m.state, dbUnread: 2 })
  check("a newer count from the server is kept over the old one", newer.state.dbUnread === 2)
}

console.log("\nRemembered per viewer, and never a crash")
{
  const store = memoryStorage()
  check("unread only is off until chosen", readUnreadOnly(store) === false)
  writeUnreadOnly(true, store)
  check("and remembered when chosen", readUnreadOnly(store) === true && store.map.get(UNREAD_ONLY_KEY) === "1")
  writeUnreadOnly(false, store)
  check("and when chosen off again", readUnreadOnly(store) === false)
  check("a storage that throws reads as off", readUnreadOnly(throwing) === false)
  let threw = false
  try {
    writeUnreadOnly(true, throwing)
    writeIds("k", ["x"], throwing)
  } catch {
    threw = true
  }
  check("and writing to it throws nothing", !threw)
  check("a list that throws reads as empty", readIds("k", throwing).length === 0)
  store.setItem("k", "not json")
  check("a list that is not JSON reads as empty", readIds("k", store).length === 0)
  store.setItem("k", JSON.stringify(["a", 3, null, "b"]))
  check("and only strings are kept from one that is", readIds("k", store).join() === "a,b")
}

console.log("\nThe shared store")
{
  let heard = 0
  const off = subscribeUnread(() => heard++)
  setUnreadState({ ...EMPTY_STATE, dbUnread: 2 })
  check("a change is heard by every bell", heard === 1 && getUnreadState().dbUnread === 2)
  setDbUnread(2)
  check("the same count again draws nothing", heard === 1)
  setDbUnread(-5)
  check("a count is never below nothing", getUnreadState().dbUnread === 0 && heard === 2)
  off()
}

console.log("\nWhat the rules engine writes: first, filed, marked, and covering a to-do")
{
  const t = (h: number) => new Date(Date.UTC(2026, 8, 25, 12) - h * 3_600_000)
  const items = [
    { id: "review", type: "new_review", category: null, createdAt: t(1) },
    { id: "coupon", type: "opportunity", category: "opportunity" as const, priority: 35, createdAt: t(0) },
    { id: "payout", type: "critical", category: "critical" as const, priority: 95, createdAt: t(2) },
    { id: "stripe", type: "critical", category: "critical" as const, priority: 100, createdAt: t(40) },
    { id: "file", type: "problem", category: "problem" as const, priority: 75, createdAt: t(5) },
    { id: "onepage-setup", type: "opportunity", category: "next_step" as const, createdAt: new Date(0) },
    { id: "sale10", type: "milestone", category: "milestone" as const, priority: 65, createdAt: t(0.5) },
  ]
  const order = panelOrder(items).map((n) => n.id).join()
  check("critical first by priority, then the problem, the next step, then the rest newest first", order === "stripe,payout,file,onepage-setup,coupon,sale10,review", order)
  /* The tabs are gone: one list, and the word above each title says what it is. */
  const labelled = panelOrder(items.map((n) => ({ ...n, area: ({ stripe: "Payouts", payout: "Payouts", file: "Products", coupon: "Opportunities", sale10: "Milestone" } as Record<string, string>)[n.id] ?? null })))
  check("one list: every kind is in it, in the panel's order, none filed away", labelled.map((n) => n.id).join() === "stripe,payout,file,onepage-setup,coupon,sale10,review")
  check("every row has a label above its title, what it is", labelled.map((n) => labelOf(n)).join() === "Payouts,Payouts,Products,OnePage,Opportunities,Milestone,Reviews", labelled.map((n) => labelOf(n)))
  check("Messages: a message says so", labelOf({ id: "m", type: "message", category: null }) === "Messages")
  check("rows from before categories are labelled by their type as before", labelOf({ id: "a", type: "update", category: null }) === "Updates" && labelOf({ id: "b", type: "opportunity", category: null }) === "Opportunities" && labelOf({ id: "c", type: "action", category: null }) === "To do" && labelOf({ id: "d", type: "new_sale", category: null }) === "Sales")
  check("an engine row without its area falls back to its category, and nothing is ever blank",
    labelOf({ id: "e", type: "critical", category: "critical", area: "  " }) === "Account" && labelOf({ id: "f", type: "next_step", category: "next_step" }) === "Getting started"
      && labelOf({ id: "g", type: "something_new", category: null }) === "Updates" && labelOf({ id: "payment-setup", type: "action", category: "next_step" }) === "Payments")
  check("critical is red, a problem amber, the rest untoned", toneOf({ category: "critical" }) === "critical" && toneOf({ category: "problem" }) === "problem" && toneOf({ category: "milestone" }) === null && toneOf({ category: null }) === null)
  check("a tap keeps critical rows, problems and digests (read, until fixed); anything else is put away", staysOnOpen({ category: "critical" }) && staysOnOpen({ category: "problem" }) && staysOnOpen({ category: "opportunity", kind: "opportunity_digest" }) && !staysOnOpen({ category: "milestone" }) && !staysOnOpen({ category: null }))
  check("links stay on this site", panelHref("/app/payouts") === "/app/payouts" && panelHref("/p/x#testimonials") === "/p/x#testimonials" && panelHref("https://evil.example") === undefined && panelHref("//evil.example") === undefined && panelHref(null) === undefined)
  check("a to-do the server covers is not counted on the bell", unreadCount({ dbUnread: 1, dismissed: [], read: [], covered: ["payment-setup"] }, both) === 2 && unreadCount({ dbUnread: 1, dismissed: [], read: [] }, both) === 3)

  const panel = readCode("components/app/notifications-modal.tsx")
  check("the panel orders through those rules, and filters by unread only", /panelOrder\(\[/.test(panel) && /const filteredNotifications = unreadOnly \? notifications\.filter\(\(n\) => !n\.read\) : notifications/.test(panel))
  check("a covered to-do steps aside in the list too", /setupShown\("payment-setup", unread\)/.test(panel) && /if \(\(state\.covered \?\? \[\]\)\.includes\(id\)\) return false/.test(readCode("lib/notifications/unread-state.ts")) && /setCovered\(data\.covered\)/.test(panel))
  check("critical: a 6px dot and the word in red, no red ground", /mr-1\.5 h-1\.5 w-1\.5 shrink-0 rounded-full", tone === "critical" \? "bg-\[#d92d20\]" : "bg-\[#dc6803\]"/.test(panel) && /tone === "critical" && "font-medium text-\[#b42318\]"/.test(panel) && !/bg-red-|bg-\[#fe[ef]|bg-\[#fd/.test(panel.slice(panel.indexOf("function NotificationItem("), panel.indexOf("export function NotificationBadge"))))
  check("a tap on a row that stays marks it read instead of putting it away", /if \(notification\.isFromDb && staysOnOpen\(notification\)\) \{\s*[\s\S]{0,200}void handleMarkRead\(notification\)/.test(panel))
  check("a digest draws its lines as links", /data-notification-digest=""/.test(panel) && /notification\.items\.map/.test(panel))

  const route = readCode("app/api/notifications/route.ts")
  check("the route pins what needs the creator first, and drops what resolved", /\.in\("category", ATTENTION\)/.test(route) && /const ATTENTION = \["critical", "problem", "next_step"\]/.test(route) && /\.is\("resolved_at", null\)/.test(route))
  check("before the engine's SQL it reads exactly what it always read", /if \(recent\.error && missingColumns\(recent\.error\)\)/.test(route) && /recentQuery\(LEGACY_COLUMNS, false\)/.test(route))
  check("the bell's count answers covered too", /return NextResponse\.json\(\{ unreadCount, covered \}/.test(route))
  check("no database error text leaves the route or reaches its logs", !/console\.error\([^)]*, (error|notifError|legacy\.error|recent\.error)\)/.test(route))
}

console.log("\nThe server marks them all read in one statement, for this user only")
{
  const route = readCode("app/api/notifications/route.ts")
  const readAll = route.slice(route.indexOf('if (action === "read_all")'), route.indexOf("if (!ids ||"))
  check("one update of read_at", (readAll.match(/\.update\(/g) ?? []).length === 1 && /\.update\(\{ read_at: now \}\)/.test(readAll))
  check("scoped to the signed in user", /\.eq\("user_id", user\.id\)/.test(readAll) && /auth\.getUser\(\)/.test(route))
  check("only rows still unread", /\.is\("read_at", null\)/.test(readAll))
  check("a body that is not JSON is a 400, not a crash", /request\.json\(\)\.catch\(\(\) => null\)/.test(route))
  check("the bell's count has a mode of its own: a head count, no rows", /searchParams\.get\("summary"\) === "1"/.test(route) && /count: "exact", head: true/.test(route))
}

console.log("\nThe panel")
{
  const panel = readCode("components/app/notifications-modal.tsx")
  check("an Unread only toggle that says whether it is on", /label="Unread only"/.test(panel) && /aria-pressed=\{pressed\}/.test(panel) && /pressed=\{unreadOnly\}/.test(panel))
  check('its tooltip says what a press will do: "Show unread only" or "Show all"', /tip=\{unreadOnly \? "Show all" : "Show unread only"\}/.test(panel))
  check("it filters the list", /unreadOnly \? notifications\.filter\(\(n\) => !n\.read\) : notifications/.test(panel))
  check("remembered through the storage helpers", /readUnreadOnly\(\)/.test(panel) && /writeUnreadOnly\(!on\)/.test(panel) && !/localStorage/.test(panel))
  check("Mark all as read, with its tooltip", /label="Mark all as read"/.test(panel) && /tip="Mark all as read"/.test(panel))
  check("disabled with nothing unread, and while it works", /disabled=\{!hasUnread \|\| marking\}/.test(panel))
  check("one request, read_all", (panel.match(/action: "read_all"/g) ?? []).length === 1)
  check("the change is on screen before the answer", panel.indexOf("setUnreadState(optimistic.state)") < panel.indexOf('action: "read_all"'))
  check("and undone if the answer is no", /if \(!ok\) \{[\s\S]*optimistic\.undo\(/.test(panel) && /Could not mark them as read\. Try again\./.test(panel))
  check("tooltips on a computer only, on hover or keyboard focus", /hidden[^"]*md:block md:group-hover:opacity-100 md:group-focus-visible:opacity-100/.test(panel))
  check("buttons 32px on a computer, a 44px target on a phone, drawn 32px", /h-11 w-11[^"]*md:h-8 md:w-8/.test(panel) && /data-face=""\s*className=\{cn\(\s*"flex h-8 w-8/.test(panel))
  check('"No unread notifications" when the filter leaves nothing', /No unread notifications/.test(panel))
  /* "The icon of 'No notifications yet' should be smaller and less AI." */
  check("the empty list is a small muted bell and one line, no disc behind it and no second sentence",
    /<Bell aria-hidden className="h-5 w-5 text-\[#9ca3af\]" strokeWidth=\{1\.75\} \/>/.test(panel)
      && /\{unreadOnly \? "No unread notifications" : t\("notifications\.empty"\)\}/.test(panel)
      && !/w-14 h-14 rounded-full/.test(panel) && !/w-7 h-7/.test(panel) && !/notifications\.emptyDesc/.test(panel))
  check("both bells read the live count", (readCode("components/app/sidebar.tsx").match(/<LiveNotificationBadge \{\.\.\.badgeProps\} \/>/g) ?? []).length === 2)
  /* "Remove the X close button. Replace the purple unread dot with a more refined modern circle." */
  check("no close button: outside, Escape or a drag down closes it", !/label="Close"/.test(panel) && !/\bX\b[^"]*from "lucide-react"/.test(panel) && /onClose=\{closeSheet\}/.test(panel) && /if \(e\.key === "Escape"\) onOpenChange\(false\)/.test(panel))
  check("an unread row's mark is a near black bead with a soft ring and a touch of light, shrinking away when read; nothing violet in the panel",
    /bg-\[#111113\] shadow-\[0_0_0_3px_rgba\(17,17,19,0\.07\),inset_0_1px_0\.5px_rgba\(255,255,255,0\.28\)\]/.test(panel) && /unread \? "scale-100 opacity-100" : "scale-50 opacity-0"/.test(panel) && !/8b5cf6/.test(panel))
  /* "Get rid of those category pills/tabs in the notifications modal. Above each notification there should be the category." */
  check("no tabs over the list: no tab row, no sliding pill, no view to switch, on a computer or a phone",
    !/role="tablist"|role="tab"|data-tab-pill|data-tab=|NotificationTabs|activeTab|switchTab|TAB_MOVE/.test(panel) && !/notifications\.(all|updates|messages|opportunities)"/.test(panel))
  check("nothing left measuring the tabs: no resize observer, no wait on the typeface", !/new ResizeObserver/.test(panel) && !/document\.fonts/.test(panel))
  check("every row says what it is above its title, before the date",
    /<span data-notification-label="" className=\{cn\("truncate"[^>]*>\{labelOf\(notification\)\}<\/span>/.test(panel)
      && panel.indexOf("data-notification-label") < panel.indexOf('unread ? "font-semibold" : "font-medium")}>\n          {notification.title}') && !/function categoryOf\(/.test(panel))
  /* The rows are kept and the filter shows some of them (`hidden`), so a press builds nothing
     (scripts/check-app-sheets-frames.mjs); the list still fades in, on the compositor, and never on reduced motion. */
  check("Unread only fades the list in from the top, and a computer's panel keeps its height until it closes",
    /hidden=\{!shownIds\.has\(notification\.id\)\}/.test(panel)
      && /el\?\.animate\(\[\{ opacity: 0 \}, \{ opacity: 1 \}\], \{ duration: 200/.test(panel) && /prefers-reduced-motion: reduce\)"\)\.matches\) return/.test(panel)
      && /\}, \[unreadOnly\]\)/.test(panel)
      && /if \(listRef\.current\) listRef\.current\.scrollTop = 0/.test(panel)
      && /body\.style\.minHeight = `\$\{Math\.max\(body\.offsetHeight, parseFloat\(body\.style\.minHeight\) \|\| 0\)\}px`/.test(panel))
  check("no glass or gradient on the panel", !/backdrop-blur|bg-gradient/.test(panel))
  const banned = /\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b/i
  const copy = [...panel.matchAll(/"([A-Z][^"]{6,})"/g)].map((m) => m[1])
  check("the new words read plainly", copy.every((c) => !banned.test(c) && !c.includes("—")), copy.filter((c) => banned.test(c)))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
