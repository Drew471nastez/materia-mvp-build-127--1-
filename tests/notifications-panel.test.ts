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
  subscribeUnread,
  unreadCount,
  writeIds,
  writeUnreadOnly,
} from "@/lib/notifications/unread-state"

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
check("a dismissed to-do is not counted", unreadCount({ dbUnread: 0, dismissed: ["payment-setup"], read: [] }, both) === 1)
check("nor a read one", unreadCount({ dbUnread: 0, dismissed: [], read: ["onepage-setup"] }, both) === 1)
check("a count below nothing is nothing", unreadCount({ dbUnread: -2, dismissed: both, read: [] }, both) === 0)

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
  check("it filters the list", /unreadOnly \? inTab\.filter\(\(n\) => !n\.read\) : inTab/.test(panel))
  check("remembered through the storage helpers", /readUnreadOnly\(\)/.test(panel) && /writeUnreadOnly\(!on\)/.test(panel) && !/localStorage/.test(panel))
  check("Mark all as read, with its tooltip", /label="Mark all as read"/.test(panel) && /tip="Mark all as read"/.test(panel))
  check("disabled with nothing unread, and while it works", /disabled=\{!hasUnread \|\| marking\}/.test(panel))
  check("one request, read_all", (panel.match(/action: "read_all"/g) ?? []).length === 1)
  check("the change is on screen before the answer", panel.indexOf("setUnreadState(optimistic.state)") < panel.indexOf('action: "read_all"'))
  check("and undone if the answer is no", /if \(!ok\) \{[\s\S]*optimistic\.undo\(/.test(panel) && /Could not mark them as read\. Try again\./.test(panel))
  check("tooltips on a computer only, on hover or keyboard focus", /hidden[^"]*md:block md:group-hover:opacity-100 md:group-focus-visible:opacity-100/.test(panel))
  check("buttons 32px on a computer, a 44px target on a phone, drawn 32px", /h-11 w-11[^"]*md:h-8 md:w-8/.test(panel) && /data-face=""\s*className=\{cn\(\s*"flex h-8 w-8/.test(panel))
  check('"No unread notifications" when the filter leaves nothing', /No unread notifications/.test(panel))
  check("both bells read the live count", (readCode("components/app/sidebar.tsx").match(/<LiveNotificationBadge \{\.\.\.badgeProps\} \/>/g) ?? []).length === 2)
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
