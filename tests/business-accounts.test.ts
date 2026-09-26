/**
 * ===========================================================================
 *  TWO BUSINESSES, ONE LOGIN
 * ===========================================================================
 * A second business is a second account, linked to the first
 * (supabase/migrations/20261001_business_accounts.sql, lib/businesses). This
 * holds the pieces that keep it safe and keep it working:
 *
 *   ADDRESS   the second account's email is the owner's with a tag, unique,
 *             and every place Storelib writes to a seller takes the tag off
 *   SWITCH    only across the one link an account is part of, whatever id is
 *             sent; checked before a session is ever made
 *   DATABASE  one second business per login, no chains, read only by the two
 *             accounts, written only by the server; the run-now part is one
 *             statement per line and safe to run twice
 *   WIRING    the account menus list the businesses, the onboarding knows its
 *             way back, deleting a login takes its second business with it
 *   SCREEN    a switch puts its screen up at the press, says each real step,
 *             carries it across the reload, and hands over to a ready page
 */
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { businessAlias, isBusinessAlias, ownerAddress, BUSINESS_TAG_PATTERN } from "../lib/businesses/email-alias"
import { maySwitch, UUID_PATTERN } from "../lib/businesses/rules"
import {
  cleanSwitchName,
  clearSwitchCookie,
  handoverAt,
  LINE_AFTER_MS,
  LINE_MIN_MS,
  lineShowsAt,
  readSwitchCookie,
  spinDelay,
  SWITCH_COOKIE,
  SWITCH_SPIN_SCRIPT,
  switchCookie,
  switchLine,
} from "../lib/businesses/switch-screen"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `   ${JSON.stringify(detail)}`}`)
  }
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")

/**
 * THE SWITCH'S SCREEN (lib/businesses/switch-screen, components/app/
 * business-switch-screen). Up at the press, a line per real step of the
 * switch, carried across the reload by a short lived cookie the new /app's
 * HTML reads, and handed over to the page only once it is ready. The frames
 * themselves are measured by scripts/check-business-switch.mjs; this holds
 * the words, the timing rules, the cookie and the wiring.
 */
function switchScreen() {
  console.log("\nThe switch's screen: its words")
  check("the press says where you are going", switchLine("asking", "Loudlib") === "Switching to Loudlib")
  check("the server's yes says what is opening", switchLine("opening", "Loudlib") === "Opening Loudlib's store")
  check("  a business still being set up opens on its setup", switchLine("opening", "Loudlib", { ready: false }) === "Opening Loudlib's setup")
  check("the new /app loading says so", switchLine("arriving", "Loudlib") === "Loading your dashboard")
  const words = (["asking", "opening", "arriving"] as const).map((s) => switchLine(s, "Loudlib"))
  const dashes = new RegExp(`[${String.fromCharCode(0x2014)}${String.fromCharCode(0x2013)}]`)
  check("plain words: no dashes, none of the words CLAUDE.md bans, no trailing dots", words.every((w) => !dashes.test(w) && !/unlock|elevate|seamless|powerful|effortless|supercharge|transform|\.\.\.|…$/i.test(w)), words)

  console.log("\nThe switch's screen: one line at a time, each for a real step")
  check("the first line shows at once", lineShowsAt(1000, null, { atOnce: true }) === 1000)
  check("a later step waits to be worth reading, and one over sooner is never shown", lineShowsAt(1000, 0) === 1000 + LINE_AFTER_MS)
  check("a line on screen keeps its time before the next replaces it", lineShowsAt(1000, 900, { atOnce: true }) === 900 + LINE_MIN_MS)
  check("  and a step asked for at once after that time shows at once", lineShowsAt(5000, 900, { atOnce: true }) === 5000)
  check("the hand over waits for the page, then for the line on screen to have had its time", handoverAt(2000, 1900) === 1900 + LINE_MIN_MS && handoverAt(2000, 100) === 2000 && handoverAt(2000, null) === 2000)
  check("the times are short: a line fits in half a second, a step under a third is skipped", LINE_MIN_MS <= 500 && LINE_AFTER_MS <= 350 && LINE_AFTER_MS >= 200)

  console.log("\nThe switch's screen: across the reload")
  check("the name is plain text: no control characters, one space at a time", cleanSwitchName(" Lind\n\tStudio\u0007 ") === "Lind Studio")
  check("  sixty characters at most", (cleanSwitchName("x".repeat(200)) ?? "").length === 60)
  check("  nothing, or not a string, is no name", cleanSwitchName("   ") === null && cleanSwitchName(42) === null && cleanSwitchName(null) === null)
  const cookie = switchCookie("Lind Studio")
  check("the cookie is sent to /app only, for half a minute, same site", cookie.startsWith(`${SWITCH_COOKIE}=Lind%20Studio;`) && /; Path=\/app;/.test(cookie) && /; Max-Age=30;/.test(cookie) && /; SameSite=Lax$/.test(cookie))
  check("  secure on https", /; Secure$/.test(switchCookie("A", { secure: true })))
  check("  and cleared the same way", /^storelib_switching=; Path=\/app; Max-Age=0; SameSite=Lax/.test(clearSwitchCookie()))
  check("what the server reads back is the name, cleaned", readSwitchCookie("Lind%20Studio") === "Lind Studio" && readSwitchCookie(encodeURIComponent("<b>x</b>\n")) === "<b>x</b>")
  check("  and a broken or empty cookie is no switch", readSwitchCookie("%E0%A4%A") === null && readSwitchCookie("") === null && readSwitchCookie(undefined) === null)
  const d = spinDelay(1_700_000_000_250, false)
  check("the spinner's turn comes from the wall clock, a second a turn, three with reduced motion", d === "-250ms" && spinDelay(3_000_000_001_250, true) === "-1250ms")
  check("  and the new document's HTML sets it the same way, before its first paint", /Date\.now\(\)%\(r\?3000:1000\)/.test(SWITCH_SPIN_SCRIPT) && /--switch-spin-delay/.test(SWITCH_SPIN_SCRIPT))

  console.log("\nThe switch's screen: the wiring")
  const switcher = read("components/app/business-switcher.tsx")
  check("a press on the other business puts the screen up and names it for the new /app",
    /setSwitching\(b\)/.test(switcher) && /switchBusiness\(b\.userId, "\/app", \{ arrival: b\.ready \? b\.name : undefined, onOpening: \(\) => screen\.current\?\.opening\(\) \}\)/.test(switcher)
      && /<SwitchingScreen name=\{switching\.name\} ready=\{switching\.ready\}/.test(switcher))
  check("  and the row's own spinner is gone: one loading state, not two", !/busy === b\.userId && <Loader2/.test(switcher))
  check("a failed switch takes the screen away and says why in the menu", /screen\.current\.fail\(\)/.test(switcher) && /setError\(e instanceof Error && e\.message \? e\.message : SWITCH_FAILED\)/.test(switcher))
  const client = read("lib/businesses/switch-client.ts")
  const cookieAt = client.indexOf("document.cookie = switchCookie(steps.arrival")
  check("the switch leaves the cookie only once the session is held, and just before the new page is asked for",
    cookieAt > client.indexOf("auth.setSession(session)") && cookieAt < client.indexOf("steps.onOpening?.()") && client.indexOf("steps.onOpening?.()") < client.indexOf("window.location.replace(next)"))
  check("every failure is a sentence, and no answer in time is a failure",
    /export const SWITCH_FAILED = "That business could not be opened\. Try again\."/.test(client) && /SWITCH_TIMEOUT_MS = 20_000/.test(client) && /abort\.abort\(\)/.test(client)
      && /catch \{\s*throw new Error\(SWITCH_FAILED\)/.test(client))
  const layout = read("app/app/layout.tsx")
  check("the new /app's HTML draws the screen when the cookie came, before its session gate, on both of the layout's paths",
    /readSwitchCookie\(\(await cookies\(\)\)\.get\(SWITCH_COOKIE\)\?\.value\)/.test(layout) && (layout.match(/\{arrival\}\s*\n\s*<NativeAuthGate/g) ?? []).length === 2
      && /__html: SWITCH_SPIN_SCRIPT/.test(layout) && /<BusinessSwitchArrival name=\{switchingTo\} \/>/.test(layout))
  const screen = read("components/app/business-switch-screen.tsx")
  check("the screen is the shell's own frame (the cold start's), with the spinner where every slow page has it",
    /<AppColdStart>/.test(screen) && /grid-rows-\[2fr_auto_3fr\]/.test(screen) && /\{children \?\? <PageSpinner \/>\}/.test(read("app/app/cold-start.tsx")))
  check("the arrival waits for the page to be ready to draw: the shell, the fonts, the first screen's pictures, its loading parts",
    /\.app-content-scroll/.test(screen) && /\[data-app-cold-start\]/.test(screen) && /fonts\?\.ready/.test(screen) && /img\.decode\(\)/.test(screen) && /\[aria-busy="true"\]/.test(screen) && /ARRIVAL_CAP_MS/.test(screen))
  check("  then hands over in one fade, the page taking the stage's rise under it, and clears the cookie",
    /playEntrance\(outer, \{ fade: false \}\)/.test(screen) && /duration: HANDOVER_MS/.test(screen) && /document\.cookie = clearSwitchCookie/.test(screen))
  const keyframes = Array.from(screen.matchAll(/\.animate\(\s*\[([^\]]*)\]/g)).map((m) => m[1])
  const props = new Set(keyframes.flatMap((k) => Array.from(k.matchAll(/(\w+):/g)).map((m) => m[1])))
  check("everything on the screen moves on opacity and translate only", keyframes.length >= 4 && [...props].every((p) => p === "opacity" || p === "translate"), [...props])
  check("reduced motion: no movement on the lines, no fade in or out of the screen", /const rise = still \? 0 : LINE_RISE_PX/.test(screen) && (screen.match(/reducedMotion\(\) \|\| typeof el\.animate !== "function"/g) ?? []).length >= 3)
  check("its spinner turns on across the reload", /\[data-business-switch-screen\] \.activity-spinner \{\s*animation-delay: var\(--switch-spin-delay, 0ms\);/.test(read("app/globals.css")))
  check("the probe that measures it is there", existsSync(join(root, "scripts/check-business-switch.mjs")) && existsSync(join(root, "scripts/render-business-switch-tree.tsx")))
}

function main() {
  console.log("\nThe second business's address")
  const alias = businessAlias("Andrew@Gmail.com", "1a2b3c4d")
  check("the owner's address with a tag", alias === "andrew+slb-1a2b3c4d@gmail.com", alias)
  check("recognised as a business address", isBusinessAlias(alias))
  check("and taken back to the owner's", ownerAddress(alias) === "andrew+slb-1a2b3c4d@gmail.com".replace("+slb-1a2b3c4d", ""), ownerAddress(alias))
  check("an owner who already uses a + keeps it", businessAlias("a+shop@x.com", "0f0f0f0f") === "a+shop+slb-0f0f0f0f@x.com" && ownerAddress("a+shop+slb-0f0f0f0f@x.com") === "a+shop@x.com")
  check("a tag is never stacked", businessAlias("a+slb-11111111@x.com", "22222222") === "a+slb-22222222@x.com")
  check("an ordinary address is left alone", ownerAddress("jane@example.com") === "jane@example.com" && !isBusinessAlias("jane@example.com"))
  check("a + that is not ours is left alone", ownerAddress("jane+news@example.com") === "jane+news@example.com")
  check("no owner address: an address with no inbox, and no owner to write to",
    businessAlias(null, "abcdef01") === "slb-abcdef01@businesses.invalid" && ownerAddress("slb-abcdef01@businesses.invalid") === null)
  let refused = false
  try {
    businessAlias("a@x.com", "not-hex!")
  } catch {
    refused = true
  }
  check("a tag is eight hex characters or nothing", refused)
  check("the pattern only matches before the @", !BUSINESS_TAG_PATTERN.test("slb-1a2b3c4d@x.com"))

  console.log("\nWho may switch to whom")
  const owner = "00000000-0000-4000-8000-00000000000a"
  const member = "00000000-0000-4000-8000-00000000000b"
  const stranger = "00000000-0000-4000-8000-00000000000c"
  const link = { ownerId: owner, memberId: member }
  check("the owner to their second business", maySwitch(link, owner, member))
  check("the second business back to its owner", maySwitch(link, member, owner))
  check("nobody to an account outside their link", !maySwitch(link, owner, stranger) && !maySwitch(link, member, stranger))
  check("a stranger cannot use somebody else's link", !maySwitch(link, stranger, member) && !maySwitch(link, stranger, owner))
  check("no link, no switch", !maySwitch(null, owner, member))
  check("not to yourself", !maySwitch(link, owner, owner))
  check("only ever to an id", !maySwitch({ ownerId: owner, memberId: "x) or 1=1" }, owner, "x) or 1=1") && UUID_PATTERN.test(member))

  console.log("\nThe switch route checks before it makes a session")
  const sw = read("app/api/businesses/switch/route.ts")
  const order = ["requestUser(request)", "rateLimit(", "businessLink(user.id)", "maySwitch(link, user.id, to)", "sessionFor(to)"].map((s) => sw.indexOf(s))
  check("signed in, rate limited, the link read, the switch allowed, then a session", order.every((i, k) => i > 0 && (k === 0 || i > order[k - 1])), order)
  check("refused with a 403 otherwise", /status: 403/.test(sw))
  check("never cached", (sw.match(/no-store/g) ?? []).length >= 1 && /headers: NO_STORE/.test(sw))
  const server = read("lib/businesses/server.ts")
  check("the filter string only ever holds a UUID", /if \(!UUID_PATTERN\.test\(userId\)\) return null/.test(server))
  check("a session is made on the server with nothing sent", /generateLink\(\{ type: "magiclink", email \}\)/.test(server) && /verifyOtp\(\{ token_hash: tokenHash, type: "magiclink" \}\)/.test(server) && /persistSession: false/.test(server))
  check("the second account's password is random and never kept", /password: randomBytes\(32\)\.toString\("base64url"\)/.test(server))
  check("a failed link removes the account it made", /await admin\.auth\.admin\.deleteUser\(memberId\)/.test(server))
  const create = read("app/api/businesses/route.ts")
  check("creating is rate limited per person and address", /bucket: "business-create"/.test(create) && /addressSubject\(request\)/.test(create))

  console.log("\nThe database")
  const part = read("supabase/sql/run-now/26_business_accounts.sql")
  const migration = read("supabase/migrations/20261001_business_accounts.sql")
  for (const [name, sql] of [["the run-now part", part], ["the migration", migration]] as const) {
    check(`${name}: one second business per login`, /constraint business_links_one_per_owner unique \(owner_id\)/.test(sql))
    check(`${name}: a business cannot be its own`, /check \(owner_id <> member_id\)/.test(sql))
    check(`${name}: row level security on both tables`, /alter table public\.business_links enable row level security/.test(sql) && /alter table public\.business_switches enable row level security/.test(sql))
    check(`${name}: read by the two accounts only`, /using \(\(select auth\.uid\(\)\) = owner_id or \(select auth\.uid\(\)\) = member_id\)/.test(sql))
    check(`${name}: no writes from a browser`, /revoke insert, update, delete on public\.business_links from anon, authenticated/.test(sql) && /revoke all on public\.business_switches from anon, authenticated/.test(sql))
    check(`${name}: no chains`, /A business account cannot own another business/.test(sql) && /An account that owns a business cannot be added as one/.test(sql))
    check(`${name}: a deleted login takes its link with it`, (sql.match(/references auth\.users\(id\) on delete cascade/g) ?? []).length === 2)
  }
  const lines = part.split("\n").filter((l) => l.trim())
  check("the part is one whole statement per line", lines.every((l) => l.startsWith("/*") || /;\s*$/.test(l)), lines.find((l) => !l.startsWith("/*") && !/;\s*$/.test(l)))
  check("and safe to run twice", /create table if not exists public\.business_links/.test(part) && /drop policy if exists business_links_read/.test(part) && /drop trigger if exists business_links_no_chain/.test(part) && /create index if not exists/.test(part))
  check("part 26 in the run-now folder, listed in its README and its after check",
    existsSync(join(root, "supabase/sql/run-now/26_business_accounts.sql")) && read("supabase/sql/run-now/README.md").includes("`26_business_accounts.sql`") && /as p26_business_accounts\s*[,;]/.test(read("supabase/sql/run-now/99_check_after.sql")))

  console.log("\nThe app")
  check("the layout reads the businesses beside everything else", /listBusinesses\(user\.id\)\.catch\(\(\) => \[\]\)/.test(read("app/app/layout.tsx")) && /businesses=\{businesses\}/.test(read("app/app/layout.tsx")))
  check("both account menus list them", /<BusinessSwitcher businesses=\{businesses\} variant="dropdown"/.test(read("components/app/sidebar.tsx")) && /<BusinessSwitcher businesses=\{businesses\} variant="sheet"/.test(read("components/app/mobile-account-menu.tsx")))
  check("New business makes it right there and goes straight into the creator onboarding, no page in between",
    /onClick=\{add\}/.test(read("components/app/business-switcher.tsx")) && /await createBusiness\(\)/.test(read("components/app/business-switcher.tsx")) &&
      /"\/signup\/success\?action=become-creator&business=new"/.test(read("lib/businesses/switch-client.ts")) && /redirect\("\/app"\)/.test(read("app/(auth)/onboarding/business/page.tsx")))
  const switcher = read("components/app/business-switcher.tsx")
  /*
    The owner's plus: a small depth button on the row, left of the chevron,
    that makes the business with the same handler as the New business line.
    It is the row button's sibling, never its child, so a press on it cannot
    open or fold the list (scripts/check-business-switcher.mjs presses it).
  */
  const plusButton = /<button\s[^>]*?data-business-add=""[\s\S]*?<\/button>/.exec(switcher)?.[0] ?? ""
  /* From the row's marker to the end of its button (its onClick holds an arrow, so a [^>] match cannot reach the marker). */
  const rowAt = switcher.indexOf('data-business-row="current"')
  const rowButton = rowAt < 0 ? "" : switcher.slice(rowAt, switcher.indexOf("</button>", rowAt))
  check("a plus on the row makes a new business, with the depth of the icon buttons and a name a screen reader reads",
    /onClick=\{add\}/.test(plusButton) && /aria-label="New business"/.test(plusButton) && /iconDepth/.test(plusButton) &&
      /import \{ iconDepth \} from "@\/components\/ui\/depth-button"/.test(switcher) && /\{canAdd && \(/.test(switcher))
  check("and it sits beside the row's button, not inside it, so pressing it never toggles the list",
    !!rowButton && !rowButton.includes("data-business-add") && switcher.indexOf('data-business-row="current"') < switcher.indexOf("data-business-add"))
  check("its 44px hit area and its place over the gap the row leaves for it come from one set of numbers",
    /const PLUS = \{/.test(switcher) && /style=\{\{ right: plus\.right, width: plus\.size, height: plus\.size \}\}/.test(switcher) && /style=\{\{ width: plus\.size, height: plus\.size \}\}/.test(switcher))
  check("no Businesses label on either menu: the business you are in is one row that opens to the rest",
    !/>Businesses</.test(switcher) && /aria-expanded=\{hasList \? expanded : undefined\}/.test(switcher) && /inert=\{!expanded\}/.test(switcher))
  check("and it folds back once the menu has gone", /open=\{headerProfileOpen\}/.test(read("components/app/sidebar.tsx")) && /open=\{mobileProfileDropdownOpen\}/.test(read("components/app/mobile-account-menu.tsx")))
  const desktopMenu = /const profileDropdownItems = \[([\s\S]*?)\]/.exec(read("components/app/sidebar.tsx"))?.[1] ?? ""
  const phoneMenu = /const items = useMemo\(\(\) => \[([\s\S]*?)\]/.exec(read("components/app/mobile-account-menu.tsx"))?.[1] ?? ""
  check("no Help in the account menu on any size", !!desktopMenu && !!phoneMenu && !/"\/help"/.test(desktopMenu) && !/"\/help"/.test(phoneMenu))
  check("Settings on the phone's sheet only: on a desktop the rail beside it has Settings",
    !/"\/app\/settings"/.test(desktopMenu) && /"\/app\/settings"/.test(phoneMenu) && /href="\/app\/settings"/.test(read("components/app/sidebar-desktop-nav.tsx")))
  check("a second business goes straight into onboarding with its way back",
    /const first = await firstBusinessIfSecond\(\)/.test(read("app/(auth)/signup/success/page.tsx")) && /switchBack=\{firstBusiness \?/.test(read("app/(auth)/signup/success/page.tsx")) && /data-onboarding-switch-back/.test(read("components/app/creator-onboarding-modal.tsx")))
  check("the onboarding is the whole screen in the app", /setNativeFullScreen\(isNativeApp\(\)\)/.test(read("components/app/creator-onboarding-modal.tsx")))
  const del = read("app/api/auth/delete-account/route.ts")
  check("deleting a login deletes its second business first", /if \(link\?\.ownerId === user\.id\) \{[\s\S]*?deleteAllUserData\(adminSupabase, link\.memberId\)[\s\S]*?deleteUser\(link\.memberId\)/.test(del) && del.indexOf("deleteUser(link.memberId)") < del.indexOf("deleteUser(user.id)"))
  check("deleting a second business signs its owner back in", /link\?\.memberId === user\.id \? await sessionFor\(link\.ownerId\)/.test(del) && /data\.firstBusiness\?\.session/.test(read("components/app/settings-form-new.tsx")))
  check("the seller's mail reaches the owner", /ownerAddress\(sellerEmail\)/.test(read("lib/email.tsx")) && /ownerAddress\(replyTo\)/.test(read("lib/email.tsx")))
  for (const f of ["lib/checkout/invoice.ts", "lib/stripe/refund-sync.ts", "lib/automations/supabase-store.ts", "app/api/stripe/connect/start/route.ts"]) {
    check(`  and ${f} writes to the owner`, /ownerAddress\(/.test(read(f)))
  }

  switchScreen()

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main()
