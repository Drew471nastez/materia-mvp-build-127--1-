/**
 * ===========================================================================
 *  UP TO THREE BUSINESSES, ONE LOGIN
 * ===========================================================================
 * Every business after the first is an account of its own, linked to the
 * first (supabase/migrations/20261001_business_accounts.sql, lib/businesses).
 * This holds the pieces that keep it safe and keep it working:
 *
 *   ADDRESS   a business account's email is the owner's with a tag, unique,
 *             and every place Storelib writes to a seller takes the tag off
 *   SWITCH    only inside the group an account is part of, whatever id is
 *             sent; checked before a session is ever made
 *   LIMIT     MAX_BUSINESSES in lib/businesses/rules is the one number: the
 *             server, the routes and the account menu read it, and the
 *             database's trigger (run-now part 38) holds the same one
 *   DATABASE  no chains, read only by the accounts it links, written only by
 *             the server; the run-now parts are one statement per line and
 *             safe to run twice
 *   WIRING    the account menus list the businesses, the onboarding knows its
 *             way back, and Settings' own Delete account deletes whichever
 *             business you are in: one of them on its own leaves the rest and
 *             puts you back in the first, the first takes the rest with it
 *   SCREEN    a switch puts its screen up at the press, says each real step,
 *             carries it across the reload, and hands over to a ready page
 */
import { readFileSync, existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { businessAlias, isBusinessAlias, ownerAddress, BUSINESS_TAG_PATTERN } from "../lib/businesses/email-alias"
import { canAddBusiness, countWord, LIMIT_NOT_OPEN_YET, LIMIT_REACHED, linkRefusal, MAX_BUSINESSES, maySwitch, ownerOf, UUID_PATTERN } from "../lib/businesses/rules"
import {
  cleanSwitchName,
  cleanSwitchPhoto,
  clearSwitchCookie,
  handoverAt,
  LINE_AFTER_MS,
  LINE_MIN_MS,
  lineShowsAt,
  readSwitchArrival,
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
  /* The photo rides with the name, so the screen's bar can draw the business on both sides of the reload (components/app/shell-header-still). */
  const withPhoto = switchCookie("Lind Studio", { photo: "https://x.supabase.co/storage/v1/object/public/avatars/a.png" })
  const photoValue = /^storelib_switching=([^;]*);/.exec(withPhoto)?.[1]
  check("the cookie carries the photo after the name, and reads back as both",
    JSON.stringify(readSwitchArrival(photoValue)) === JSON.stringify({ name: "Lind Studio", photo: "https://x.supabase.co/storage/v1/object/public/avatars/a.png" }) && readSwitchCookie(photoValue) === "Lind Studio")
  check("  a cookie with a name alone (written before the photo was carried) is that name, with no photo",
    JSON.stringify(readSwitchArrival("Lind%20Studio")) === JSON.stringify({ name: "Lind Studio", photo: null }))
  check("  only a picture address the app would draw: https or a path on this site, never another scheme, //host, quotes or spaces",
    cleanSwitchPhoto("/photos/a.png") === "/photos/a.png" && cleanSwitchPhoto("https://a.b/c.png") === "https://a.b/c.png"
      && [ "javascript:alert(1)", "//evil.com/a.png", "http://a.b/c.png", "data:image/png;base64,AA", "/a.png\" onerror=\"x", "/a b.png", "x".repeat(1200), 7, null ].every((u) => cleanSwitchPhoto(u) === null))
  check("  a bad photo leaves the name alone", JSON.stringify(readSwitchArrival(encodeURIComponent("Lind Studio\njavascript:alert(1)"))) === JSON.stringify({ name: "Lind Studio", photo: null }))
  check("  and a photo with no name is no switch", readSwitchArrival(encodeURIComponent("\n/photos/a.png")) === null && !/%0A/.test(switchCookie("", { photo: "/photos/a.png" })))
  const d = spinDelay(1_700_000_000_250, false)
  check("the spinner's turn comes from the wall clock, a second a turn, three with reduced motion", d === "-250ms" && spinDelay(3_000_000_001_250, true) === "-1250ms")
  check("  and the new document's HTML sets it the same way, before its first paint", /Date\.now\(\)%\(r\?3000:1000\)/.test(SWITCH_SPIN_SCRIPT) && /--switch-spin-delay/.test(SWITCH_SPIN_SCRIPT))

  console.log("\nThe switch's screen: the wiring")
  const switcher = read("components/app/business-switcher.tsx")
  check("a press on the other business puts the screen up and names it, with its photo, for the new /app",
    /setSwitching\(b\)/.test(switcher) && /const steps: SwitchSteps = \{\s*arrival: b\.ready \? \{ name: b\.name, photo: b\.avatarUrl \} : undefined,\s*business: b,\s*onOpening: \(\) => screen\.current\?\.opening\(\),\s*\}/.test(switcher)
      && /await switchBusiness\(b\.userId, "\/app", steps\)/.test(switcher)
      && /<SwitchingScreen name=\{switching\.name\} photo=\{switching\.avatarUrl\} ready=\{switching\.ready\}/.test(switcher))
  check("  the list fetches the other businesses' photos at the bar's size as it opens, so the bar has the photo on the press",
    /if \(!expanded\) return\s*const size = sheet \? STILL_AVATAR\.phone : STILL_AVATAR\.desktop\s*for \(const b of businesses\) if \(!b\.current\) preloadAvatar\(b\.avatarUrl, size\)/.test(switcher))
  check("  and the row's own spinner is gone: one loading state, not two", !/busy === b\.userId && <Loader2/.test(switcher))
  /*
    Changed on purpose (owner: "the loading states should be very smooth,
    clean"): New business used to spin in the plus and rewrite its own line
    ("Setting up your new business"), then reload onto a different spinner
    on white. Now it has the switch's screen, on the plain white its setup
    is drawn on, and /signup/success opens on the same words in the same place.
  */
  check("New business puts the same screen up, in its create mode, and moves it on once the session is held",
    /setCreating\(true\)/.test(switcher) && /await createBusiness\(\{ onOpening: \(\) => screen\.current\?\.opening\(\) \}\)/.test(switcher)
      && /\{creating && <SwitchingScreen mode="create"/.test(switcher))
  check("  its rows keep their icon and their words while it works: no spinner of their own, nothing changes width", !/Loader2/.test(switcher) && !/Setting up your new business/.test(switcher))
  check("  a failed one takes the screen away and the menu says why, as a switch does", /setError\(e instanceof Error && e\.message \? e\.message : "The business could not be created\. Try again\."\)\s*\/\*[^*]*\*\/\s*if \(screen\.current\) screen\.current\.fail\(\)/.test(switcher))
  check("  one whose setup page never came keeps the screen up and asks for it again on Try again", /if \(e instanceof SwitchStalled\) \{\s*stalled\(e\.next, \{\}\)/.test(switcher))
  check("its two lines say what is happening, in plain words", switchLine("creating", "") === "Setting up your new business" && switchLine("starting", "") === "Opening your new business")
  const created = read("lib/businesses/switch-client.ts")
  check("making one never waits forever, and no answer in time says where to look rather than to press again",
    /post\("\/api\/businesses", \{\}, CREATE_TIMEOUT_MS\)/.test(created) && /CREATE_TIMEOUT_MS = 30_000/.test(created) && /CREATE_NO_ANSWER/.test(created) && /"\/signup\/success\?action=become-creator&business=new", steps\)/.test(created))
  const success = read("app/(auth)/signup/success/page.tsx")
  check("the setup page's first HTML is that screen for a new business, read from the address on the server",
    /use\(searchParams\)\.business === "new"/.test(success) && /<Suspense fallback=\{newBusiness \? <NewBusinessScreen \/> : <AuthResolvingScreen \/>\}>/.test(success))
  check("  kept while the session is found, fading out under the setup's first step, never the welcome choice",
    /if \(newBusiness && \(!settled \|\| showCreatorOnboarding\)\)/.test(success) && /<NewBusinessScreen leaving=\{settled && showCreatorOnboarding\} \/>/.test(success)
      && success.indexOf("if (newBusiness && (!settled") < success.indexOf("return <AuthResolvingScreen />"))
  check("  the same surface, spinner and line as the menu's screen, fading on opacity only",
    /export function NewBusinessScreen\(\{ leaving = false \}/.test(read("components/app/business-switch-screen.tsx")) && /<Screen step="starting" name="" ready=\{false\} surface="plain" leaving=\{leaving\} \/>/.test(read("components/app/business-switch-screen.tsx"))
      && /surface=\{creating \? "plain" : "app"\}/.test(read("components/app/business-switch-screen.tsx")) && /transition-opacity ease-out motion-reduce:transition-none/.test(read("components/app/business-switch-screen.tsx")))
  check("a failed switch takes the screen away and says why in the menu", /screen\.current\.fail\(\)/.test(switcher) && /setError\(e instanceof Error && e\.message \? e\.message : SWITCH_FAILED\)/.test(switcher))
  const client = read("lib/businesses/switch-client.ts")
  /*
    Changed on purpose ("sometimes it gets stuck there"): the steps of a
    switch run in lib/businesses/switch-flow, each with a limit, and the
    session comes back in the answer's own cookies instead of through the
    client's setSession, which had none. tests/business-switch-flow.test.ts
    drives every wait; these hold the wiring. The order is the same: the
    session is held (the jar is checked) before prepare() writes the screen's
    cookie and the snapshot, and both come before the page is asked for.
  */
  const flow = read("lib/businesses/switch-flow.ts")
  const cookieAt = client.indexOf("document.cookie = switchCookie(steps.arrival.name")
  check("the switch leaves the cookie only once the session is held, and just before the new page is asked for",
    cookieAt > client.indexOf("function prepare(steps: SwitchSteps)") && flow.indexOf("return opening(deps, next)") > flow.indexOf("if (!(await deps.jarHolds(to))")
      && flow.indexOf("deps.prepare()") < flow.indexOf('deps.onPhase?.("opening")') && flow.indexOf('deps.onPhase?.("opening")') < flow.lastIndexOf("deps.navigate(next)")
      && /navigate: \(next\) => window\.location\.replace\(next\)/.test(client) && /if \(p === "opening"\) steps\.onOpening\?\.\(\)/.test(client))
  check("the public site's header is told who this browser is now, after the account before is cleared (saved listings and follows with it)",
    client.indexOf("clearAuthSnapshot()") > client.indexOf("function prepare(steps: SwitchSteps)") && client.indexOf("writeAuthSnapshot({ signedIn: true, userId: b.userId") > client.indexOf("clearAuthSnapshot()"))
  check("every failure is a sentence, and no answer in time is a failure",
    /export const SWITCH_FAILED = "That business could not be opened\. Try again\."/.test(client) && /SWITCH_TIMEOUT_MS = ASK_MS/.test(client) && /export const ASK_MS = 20_000/.test(flow) && /abort\.abort\(\)/.test(flow)
      && /throw new SwitchFailed\(outcome\.message, outcome\.retry\)/.test(client))
  const route = read("app/api/businesses/switch/route.ts")
  const createRoute = read("app/api/businesses/route.ts")
  const jar = read("lib/businesses/session-cookies.ts")
  check("the switch's answer carries the session in its own cookies, only after the link is checked and the session made",
    route.indexOf("maySwitch(group, user.id, to)") < route.indexOf("await sessionFor(to)") && route.indexOf("await sessionFor(to)") < route.indexOf("setSessionCookies(res, request, session, arrival)")
      && createRoute.indexOf("createBusinessAccount(user)") < createRoute.indexOf("setSessionCookies(res, request, session)")
      && /import "server-only"/.test(jar) && /sessionCookieChunks\(key, storedSessionJson\(session\), existing\)/.test(jar)
      && /res\.cookies\.set\(\{ name: c\.name, value: c\.value, path: "\/", maxAge: SESSION_COOKIE_MAX_AGE, sameSite: "lax", secure, httpOnly: false \}\)/.test(jar)
      && /name: SWITCH_COOKIE, value: photo \? `\$\{name\}\\n\$\{photo\}` : name, path: "\/app", maxAge: SWITCH_COOKIE_MAX_AGE_S/.test(jar) && /cleanSwitchName\(arrival\.name\)/.test(jar))
  const layout = read("app/app/layout.tsx")
  check("the new /app's HTML draws the screen when the cookie came, before its session gate, on both of the layout's paths",
    /readSwitchArrival\(\(await cookies\(\)\)\.get\(SWITCH_COOKIE\)\?\.value\)/.test(layout) && (layout.match(/\{arrival\}\s*\n\s*<NativeAuthGate/g) ?? []).length === 2
      && /__html: SWITCH_ARRIVAL_SCRIPT/.test(layout) && /<BusinessSwitchArrival name=\{switchingTo\.name\} photo=\{switchingTo\.photo\} \/>/.test(layout))
  const screen = read("components/app/business-switch-screen.tsx")
  /*
    Changed on purpose. The owner, on the screen halfway through a switch:
    "the layout, the sidebar there, it's cut". It used to be the cold start's
    frame, so it drew the shell's empty white rail beside the grey content
    area with the header's curve cut into its corner: an empty sidebar and a
    panel torn away from it, a moment after the page it covered had a full
    one. It is its own surface now, the same on both sides of the reload: the
    app's bar, and one white area under it from edge to edge, the white the
    new business's setup already sat on.
  */
  /*
    AND THE ORDER THE TWO FIELDS ARE WRITTEN IN. The surface used to be one
    white box from edge to edge with the bar written inside it afterwards. A
    browser draws a document it has only half read, and a frame caught
    between the two was the spinner and the line on white WITH NO BAR AT ALL
    (measured at 1440 by scripts/check-business-switch.mjs with the new
    document arriving in two parts, as a megabyte of /app does). So the bar
    is written first, over z-10 because its corners hang below it, and the
    white begins at the bar's bottom edge instead of behind it.
  */
  const barWritten = screen.indexOf('className="absolute inset-x-0 top-0 z-10 h-[calc(68px+env(safe-area-inset-top,0px))] bg-[#111111]')
  /*
    Changed on purpose (owner, on a phone: "a glitch, a refresh flash thing"):
    on a phone the surface under the bar is the page's own #f8f9fa, the
    colour the new /app's shell and its cold start are drawn on, so the
    screen and the page it hands over to are the same surface and only the
    page's own parts come in. From md it stays white, edge to edge, with no
    rail (the owner's earlier "the sidebar there, it's cut").
  */
  const whiteWritten = screen.indexOf('className="absolute inset-x-0 bottom-0 top-[calc(68px+env(safe-area-inset-top,0px))] bg-[#f8f9fa] md:top-[calc(58px+env(safe-area-inset-top,0px))] md:bg-white"')
  check("the screen is one surface under the app's own bar, the page's own colour on a phone: no empty rail beside it, nothing cut out of it",
    !/AppColdStart/.test(screen) && /function SwitchSurface/.test(screen)
      && /<SwitchSurface header=\{<ShellHeaderStill name=\{name\} photo=\{photo\} \/>\}>\{middle\}<\/SwitchSurface>/.test(screen)
      && /data-switch-surface="" className="absolute inset-0">/.test(screen)
      && !/w-\[240px\]/.test(screen) && whiteWritten !== -1
      && /data-cold-page="" className="absolute inset-x-0 bottom-0 top-\[calc\(68px\+env\(safe-area-inset-top,0px\)\)\] bg-\[#f8f9fa\]/.test(read("app/app/cold-start.tsx")))
  check("  the bar written before the white, and the white beginning under it, so no frame can have one without the other",
    barWritten !== -1 && whiteWritten > barWritten)
  check("  its bar is the shell's own height and colour at each width, with the one set of corners hung from it",
    /h-\[calc\(68px\+env\(safe-area-inset-top,0px\)\)\] bg-\[#111111\] text-\[#111111\] md:h-\[calc\(58px\+env\(safe-area-inset-top,0px\)\)\] md:bg-\[#131316\] md:text-\[#131316\]/.test(screen)
      && /<AppTopCorners \/>/.test(screen) && !/rounded-t-/.test(screen))
  check("  with the spinner where every slow page has it, 40% down the white",
    /grid-rows-\[2fr_auto_3fr\]/.test(screen) && /<PageSpinner \/>/.test(read("app/app/cold-start.tsx")))
  check("  and the cold start keeps its own frame, for the cold start alone",
    /<div data-app-cold-start="" className="fixed inset-0 bg-\[#111111\] md:bg-\[#131316\]">/.test(read("app/app/cold-start.tsx"))
      && /export default function AppColdStart\(\) \{/.test(read("app/app/cold-start.tsx")))
  /* "There's the black top bar there showing, which I don't understand why": the bar was an empty band. */
  const still = read("components/app/shell-header-still.tsx")
  check("  and its black bar is never empty: it draws the business you are going to, its photo and name, where the real header puts them",
    /\{header\}/.test(screen) && /data-still="name"/.test(still) && /data-still="avatar"/.test(still) && /avatarSource\(photo, size\)/.test(still)
      && /max-w-\[120px\] truncate text-\[13px\]/.test(still) && /max-w-\[140px\] truncate text-\[13px\]/.test(still) && /aria-hidden="true"/.test(still)
      && /max-w-\[120px\] truncate/.test(read("components/app/mobile-account-menu.tsx")) && /max-w-\[140px\] truncate/.test(read("components/app/sidebar.tsx")))
  check("the arrival waits for the page to be ready to draw: the shell, the fonts, the first screen's pictures, its loading parts",
    /\.app-content-scroll/.test(screen) && /\[data-app-cold-start\]/.test(screen) && /fonts\?\.ready/.test(screen) && /img\.decode\(\)/.test(screen) && /\[aria-busy="true"\]/.test(screen) && /ARRIVAL_CAP_MS/.test(screen))
  check("  then hands over in one fade, the page taking the stage's rise under it, and clears the cookie",
    /playEntrance\(outer, \{ fade: false \}\)/.test(screen) && /duration: HANDOVER_MS/.test(screen) && /document\.cookie = clearSwitchCookie/.test(screen))
  const keyframes = Array.from(screen.matchAll(/\.animate\(\s*\[([^\]]*)\]/g)).map((m) => m[1])
  const props = new Set(keyframes.flatMap((k) => Array.from(k.matchAll(/(\w+):/g)).map((m) => m[1])))
  check("everything on the screen moves on opacity and translate only", keyframes.length >= 4 && [...props].every((p) => p === "opacity" || p === "translate"), [...props])
  check("reduced motion: no movement on the lines, no fade in or out of the screen", /const rise = still \? 0 : LINE_RISE_PX/.test(screen) && (screen.match(/reducedMotion\(\) \|\| typeof el\.animate !== "function"/g) ?? []).length >= 3)
  check("its spinner turns on across the reload", /\[data-business-switch-screen\] \.activity-spinner \{\s*animation-delay: var\(--switch-spin-delay, 0ms\);/.test(read("app/globals.css")))
  /*
    THE FIRST FRAME OF THE NEW DOCUMENT. A browser draws a document as soon
    as it has one it can lay out — the head and the open <body> are enough —
    which can be before the screen's markup has been parsed. What it drew
    there was the canvas, and the canvas of an /app document is white: one
    white frame held for as long as the rest of the document took, 16 to 20
    of 255 of the light on the glass, measured by scripts/check-business-
    switch.mjs with the document in two parts. Two things close it, both from
    the <head>, before the body is read at all, and each enough on its own.
  */
  const switchLib = read("lib/businesses/switch-screen.ts")
  const globals = read("app/globals.css")
  check("the new document is asked not to draw until the screen is all there, and its canvas is the screen until it does",
    /rel="expect"/.test(switchLib) && /blocking","render"/.test(switchLib)
      && switchLib.includes('l.href="#${SWITCH_SCREEN_ID}"')
      && switchLib.includes("classList.add(${JSON.stringify(SWITCH_HTML_CLASS)})")
      && /SWITCH_HTML_CLASS = "switch-arriving"/.test(switchLib)
      && /\$\{SWITCH_FIRST_PAINT_SCRIPT\}/.test(read("app/layout.tsx")))
  check("  the mark it waits for is the LAST thing in the screen, not the screen's own box",
    /<span aria-hidden="true" id=\{SWITCH_SCREEN_ID\} \/>\s*<\/div>/.test(screen)
      && /SWITCH_SCREEN_ID = "business-switch-screen-ready"/.test(switchLib))
  check("  and that canvas is the screen's own two fields, at the bar's height at each width, outside every layer",
    /html\.switch-arriving \{/.test(globals) && /linear-gradient\(#111111 0, #111111 calc\(68px \+ env\(safe-area-inset-top, 0px\)\), #f8f9fa calc\(68px \+ env\(safe-area-inset-top, 0px\)\)\)/.test(globals)
      && /linear-gradient\(#131316 0, #131316 calc\(58px \+ env\(safe-area-inset-top, 0px\)\), #ffffff calc\(58px \+ env\(safe-area-inset-top, 0px\)\)\)/.test(globals)
      /* One plain gradient and no custom property of its own: taking the class off happens in the hand over's last frame, and either cost a long task there (measured). */
      && !/html\.switch-arriving \{[^}]*\n\s*--[a-z-]+:/.test(globals) && !/html\.switch-arriving \{[^}]*radial-gradient/.test(globals)
      && /html\.switch-arriving body \{\s*background-color: transparent;/.test(globals)
      && /background-attachment: fixed;/.test(globals))
  check("  and it comes off again when the screen hands over",
    /document\.documentElement\.classList\.remove\(SWITCH_HTML_CLASS\)/.test(screen))
  check("the new page's screen always ends: a timer that needs no frame, the cache bringing the page back, going away, all clear the cookie",
    /const hard = window\.setTimeout\(end, ARRIVAL_HARD_CAP_MS\)/.test(screen) && /if \(e\.persisted\) end\(\)/.test(screen) && /if \(!over\) \{\s*over = true\s*clear\(\)/.test(screen)
      && /takeOverFromHtml\(\)/.test(screen) && /__slSwitchGiveUp/.test(read("lib/businesses/switch-screen.ts")))
  check("  never handed over to the cold start while the app's gate is finding the session",
    /if \(!shell\(\) && coldStart\(\)\) await until\(\(\) => !coldStart\(\), by\)/.test(screen))
  check("  and drawn only from a document's own HTML, never put up by a refresh of the router",
    /const \[live\] = useState\(\(\) => typeof document === "undefined" \|\| !!document\.getElementById\(SWITCH_SCREEN_ID\)\)/.test(screen) && /if \(gone \|\| !live\) return null/.test(screen))
  check("  the bar's photo asked for from the head, and drawn in the same frame as the bar",
    /<link rel="preload" as="image" href=\{phone\.src\}/.test(screen) && /decoding="sync" fetchPriority="high"/.test(still))
  check("a new page that never comes: the screen stays, says so in one line, and Try again asks again",
    /stall: \(retry\) => setProblem\(\{ text: creating \? "Your new business did not open" : `\$\{name\} did not open`, onRetry: retry \}\)/.test(screen)
      && />\s*Try again\s*<\/button>/.test(screen) && /openAgain\(next, steps\)\.catch\(\(\) => screen\.current\?\.stall\(again\)\)/.test(switcher))
  const onboarding = read("components/app/creator-onboarding-modal.tsx")
  const redirect = /\{isRedirecting && \(([\s\S]*?)\n      \)\}/.exec(onboarding)?.[1] ?? ""
  check("the setup's last screen, on the way to the dashboard, is the same calm spinner and one line: no purple ring, no dots",
    /<ActivitySpinner label="" \/>/.test(redirect) && /grid-rows-\[2fr_auto_3fr\]/.test(redirect) && />Opening your dashboard</.test(redirect) && !/purple|animate-spin|\.\.\./.test(redirect))
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

  /*
    Changed on purpose (owner, 2026-09-26: "it's capped by 3"): a login is a
    group of an owner and up to two businesses it made, not one pair, so the
    rule is read off the group. The pair's checks stay, as a group of one.
  */
  console.log("\nWho may switch to whom")
  const owner = "00000000-0000-4000-8000-00000000000a"
  const member = "00000000-0000-4000-8000-00000000000b"
  const stranger = "00000000-0000-4000-8000-00000000000c"
  const third = "00000000-0000-4000-8000-00000000000d"
  const link = { ownerId: owner, memberIds: [member] }
  check("the owner to their second business", maySwitch(link, owner, member))
  check("the second business back to its owner", maySwitch(link, member, owner))
  check("nobody to an account outside their group", !maySwitch(link, owner, stranger) && !maySwitch(link, member, stranger))
  check("a stranger cannot use somebody else's group", !maySwitch(link, stranger, member) && !maySwitch(link, stranger, owner))
  check("no group, no switch", !maySwitch(null, owner, member))
  check("not to yourself", !maySwitch(link, owner, owner))
  check("only ever to an id", !maySwitch({ ownerId: owner, memberIds: ["x) or 1=1"] }, owner, "x) or 1=1") && UUID_PATTERN.test(member))
  const three = { ownerId: owner, memberIds: [member, third] }
  check("with three: the owner to either of its businesses, and each back", maySwitch(three, owner, third) && maySwitch(three, third, owner) && maySwitch(three, owner, member))
  check("  and one business straight to the other, both being the same login's", maySwitch(three, member, third) && maySwitch(three, third, member))
  check("  and still nobody outside it", !maySwitch(three, third, stranger) && !maySwitch(three, stranger, third))

  console.log("\nThree businesses a login, one number")
  check("the limit is three", MAX_BUSINESSES === 3)
  check("another can be made while there are one or two", canAddBusiness(1) && canAddBusiness(2))
  check("  and not at three", !canAddBusiness(3) && !canAddBusiness(4))
  /* Changed on purpose: "It doesn't matter which business I am on." Any business of the login makes one; the new one is linked to the first. */
  const first = "00000000-0000-4000-8000-00000000000a"
  const second = "00000000-0000-4000-8000-00000000000b"
  check("from any business, a new one is linked to the login's first, never to the business that asked", ownerOf({ ownerId: first, memberIds: [second] }, second) === first && ownerOf({ ownerId: first, memberIds: [second] }, first) === first && ownerOf(null, first) === first)
  check("the words say the number the code holds", LIMIT_REACHED === `You already have ${countWord(MAX_BUSINESSES)} businesses, the most one login can have.` && /three businesses/.test(LIMIT_REACHED))
  check("the database's own refusal reads as the limit", linkRefusal({ code: "23514", message: "One login can have at most 3 businesses" }) === LIMIT_REACHED)
  check("before part 38 runs, the old one per login key reads as a calm not yet, never an error page",
    linkRefusal({ code: "23505", message: 'duplicate key value violates unique constraint "business_links_one_per_owner"' }) === LIMIT_NOT_OPEN_YET && !/database|sql|constraint/i.test(LIMIT_NOT_OPEN_YET))
  check("anything else is the plain try again", /Try again/.test(linkRefusal({ code: "P0001", message: "x" })))
  const limitCode = ["lib/businesses/server.ts", "app/api/businesses/route.ts", "components/app/business-switcher.tsx"].map((f) => [f, read(f)] as const)
  check("the server, the route and the menu all ask canAddBusiness, and none counts to a number of its own",
    limitCode.every(([, src]) => /canAddBusiness\(/.test(src) && !/(businesses|ids)\.length\s*<\s*\d/.test(src)), limitCode.filter(([, src]) => !/canAddBusiness\(/.test(src)).map(([f]) => f))
  check("no copy left that says two is the most", !/two businesses, the most|up to two businesses/i.test(limitCode.map(([, src]) => src).join("\n") + read("lib/businesses/rules.ts")))

  console.log("\nThe switch route checks before it makes a session")
  const sw = read("app/api/businesses/switch/route.ts")
  /* Changed on purpose: the route reads the login's group (up to three businesses), not one link. */
  const order = ["requestUser(request)", "rateLimit(", "businessGroup(user.id)", "maySwitch(group, user.id, to)", "sessionFor(to)"].map((s) => sw.indexOf(s))
  check("signed in, rate limited, the group read, the switch allowed, then a session", order.every((i, k) => i > 0 && (k === 0 || i > order[k - 1])), order)
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
    /* Part 26 as it ran: its one per login key is what part 38 below replaces, so the text stays and the label says so. */
    check(`${name}: made one second business per login (part 38 lifts it to three)`, /constraint business_links_one_per_owner unique \(owner_id\)/.test(sql))
    check(`${name}: a business cannot be its own`, /check \(owner_id <> member_id\)/.test(sql))
    check(`${name}: row level security on both tables`, /alter table public\.business_links enable row level security/.test(sql) && /alter table public\.business_switches enable row level security/.test(sql))
    check(`${name}: read by the two accounts only`, /using \(\(select auth\.uid\(\)\) = owner_id or \(select auth\.uid\(\)\) = member_id\)/.test(sql))
    check(`${name}: no writes from a browser`, /revoke insert, update, delete on public\.business_links from anon, authenticated/.test(sql) && /revoke all on public\.business_switches from anon, authenticated/.test(sql))
    check(`${name}: no chains`, /A business account cannot own another business/.test(sql) && /An account that owns a business cannot be added as one/.test(sql))
    check(`${name}: a deleted login takes its link with it`, (sql.match(/references auth\.users\(id\) on delete cascade/g) ?? []).length === 2)
  }
  const part38 = read("supabase/sql/run-now/38_business_limit_three.sql")
  const migration38 = read("supabase/migrations/20261006_business_limit_three.sql")
  for (const [name, sql] of [["part 38", part38], ["its migration", migration38]] as const) {
    const limit = /if 1 \+ \(select count\(\*\) from public\.business_links where owner_id = new\.owner_id and member_id <> new\.member_id\) >= (\d+) then/.exec(sql)
    check(`${name}: the trigger counts the login and its businesses against the same number the app holds`, !!limit && Number(limit[1]) === MAX_BUSINESSES, limit?.[1])
    check(`${name}: two presses at once take turns on a lock per owner`, /perform pg_advisory_xact_lock\(hashtextextended\('business_links ' \|\| new\.owner_id::text, 0\)\)/.test(sql))
    check(`${name}: refuses as a check violation, which the server reads as the limit`, /using errcode = 'check_violation', constraint = 'business_links_limit'/.test(sql))
    check(`${name}: on insert and on any change of who owns what`, /create trigger business_links_limit before insert or update of owner_id, member_id on public\.business_links for each row execute function public\.business_links_limit\(\)/.test(sql))
    check(`${name}: the old one per login key goes only after the trigger is in`, sql.indexOf("create trigger business_links_limit") > 0 && sql.indexOf("drop constraint if exists business_links_one_per_owner") > sql.indexOf("create trigger business_links_limit"))
    check(`${name}: the owner's businesses keep an index to be read by`, /create index if not exists business_links_owner_created on public\.business_links \(owner_id, created_at\)/.test(sql))
  }
  const lines38 = part38.split("\n").filter((l) => l.trim())
  check("part 38 is one whole statement per line, and safe to run twice",
    lines38.every((l) => l.startsWith("/*") || /;\s*$/.test(l)) && /create or replace function public\.business_links_limit/.test(part38) && /drop trigger if exists business_links_limit/.test(part38) && /drop constraint if exists/.test(part38))
  check("part 38 in the run-now folder, listed in its README and its after check",
    read("supabase/sql/run-now/README.md").includes("`38_business_limit_three.sql`") && /as p38_business_limit_three\s*[,;]/.test(read("supabase/sql/run-now/99_check_after.sql")))
  /*
    THE COMPLETE PART. "Give me a full SQL to run for everything there, full
    complete." One part that gets any database to the whole of it, from
    nothing, from part 26, or from 26 and 38; run twice on copies of each on
    a scratch Postgres with no errors (see the report of that change).
  */
  /* XX_ until the lead gives it its number: found by its name. */
  const completeName = readdirSync(join(root, "supabase/sql/run-now")).find((f) => /^[0-9X]+_businesses_complete\.sql$/.test(f)) ?? ""
  const complete = completeName ? read(`supabase/sql/run-now/${completeName}`) : ""
  const completeMigration = read("supabase/migrations/20261007_businesses_complete.sql")
  const statements = (sql: string) => sql.split("\n").filter((l) => l.trim() && !l.startsWith("/*"))
  check("the complete part: one whole statement per line, /* */ comments only, no blank lines",
    complete.split("\n").filter((l) => l.length).every((l) => l.startsWith("/*") ? /\*\/\s*$/.test(l) : /;\s*$/.test(l)) && !/^--/m.test(complete) && !/\n\n/.test(complete))
  check("  its migration holds the very same statements", JSON.stringify(statements(complete)) === JSON.stringify(statements(completeMigration)) && !/^--/m.test(completeMigration))
  const completeLimit = /if 1 \+ \(select count\(\*\) from public\.business_links where owner_id = new\.owner_id and member_id <> new\.member_id\) >= (\d+) then/.exec(complete)
  check("  its trigger counts to the number the app holds", !!completeLimit && Number(completeLimit[1]) === MAX_BUSINESSES, completeLimit?.[1])
  check("  every table made only if missing, every policy and trigger dropped before it is made, the old key dropped only if there",
    (complete.match(/create table if not exists/g) ?? []).length === 3 && /drop policy if exists business_links_read/.test(complete) && /drop trigger if exists business_links_no_chain/.test(complete) && /drop trigger if exists business_links_limit/.test(complete)
      && /drop constraint if exists business_links_one_per_owner/.test(complete) && complete.indexOf("drop constraint if exists business_links_one_per_owner") > complete.indexOf("create trigger business_links_limit")
      && !/create index (?!if not exists)/.test(complete) && !/create (unique )?table (?!if not exists)/.test(complete))
  check("  no chains, never its own, row level security, read by the two accounts only, no writes or truncate from a browser",
    /A business account cannot own another business/.test(complete) && /check \(owner_id <> member_id\) not valid/.test(complete) && /alter table public\.business_links enable row level security/.test(complete)
      && /using \(\(select auth\.uid\(\)\) = owner_id or \(select auth\.uid\(\)\) = member_id\)/.test(complete) && /revoke insert, update, delete, truncate, references, trigger on public\.business_links from authenticated/.test(complete)
      && /revoke all on public\.business_links from anon/.test(complete) && /revoke all on public\.business_switches from anon, authenticated/.test(complete))
  check("  the two trigger functions cannot be called through the API", /revoke all on function public\.business_links_no_chain\(\) from public, anon, authenticated/.test(complete) && /revoke all on function public\.business_links_limit\(\) from public, anon, authenticated/.test(complete))
  /* XX_ until the lead numbers it; then its column in 99 comes with the four paste files (tests/sql-run-four.test.ts), so the column is asked for only once it is numbered. */
  check("  and it is in the run-now folder's README, with a column in its after check once numbered",
    !!completeName && read("supabase/sql/run-now/README.md").includes(`\`${completeName}\``) && (!/^\d{2}_/.test(completeName) || /as p\d{2}_businesses_complete\s*[,;]/.test(read("supabase/sql/run-now/99_check_after.sql"))))
  const lines = part.split("\n").filter((l) => l.trim())
  check("the part is one whole statement per line", lines.every((l) => l.startsWith("/*") || /;\s*$/.test(l)), lines.find((l) => !l.startsWith("/*") && !/;\s*$/.test(l)))
  check("and safe to run twice", /create table if not exists public\.business_links/.test(part) && /drop policy if exists business_links_read/.test(part) && /drop trigger if exists business_links_no_chain/.test(part) && /create index if not exists/.test(part))
  check("part 26 in the run-now folder, listed in its README and its after check",
    existsSync(join(root, "supabase/sql/run-now/26_business_accounts.sql")) && read("supabase/sql/run-now/README.md").includes("`26_business_accounts.sql`") && /as p26_business_accounts\s*[,;]/.test(read("supabase/sql/run-now/99_check_after.sql")))

  console.log("\nThe app")
  check("the layout reads the businesses beside everything else", /listBusinesses\(user\.id\)\.catch\(\(\) => \[\]\)/.test(read("app/app/layout.tsx")) && /businesses=\{businesses\}/.test(read("app/app/layout.tsx")))
  check("both account menus list them", /<BusinessSwitcher businesses=\{businesses\} variant="dropdown"/.test(read("components/app/sidebar.tsx")) && /<BusinessSwitcher businesses=\{businesses\} variant="sheet"/.test(read("components/app/mobile-account-menu.tsx")))
  check("New business makes it right there and goes straight into the creator onboarding, no page in between",
    /onClick=\{add\}/.test(read("components/app/business-switcher.tsx")) && /* Changed on purpose: it now hands the screen its next step. */ /await createBusiness\(\{ onOpening:/.test(read("components/app/business-switcher.tsx")) &&
      /"\/signup\/success\?action=become-creator&business=new"/.test(read("lib/businesses/switch-client.ts")) && /redirect\("\/app"\)/.test(read("app/(auth)/onboarding/business/page.tsx")))
  const switcher = read("components/app/business-switcher.tsx")
  /*
    Changed on purpose. The owner: "the plus should NOT redirect me to a new
    business directly: it needs to open up the collapsible thing, and then
    there's the New business + button there", and "it doesn't matter which
    business I am on". The plus is a picture inside the row's one button, so
    a press on it opens the list like the chevron; New business in the list
    is what makes one; both on every business of the login
    (scripts/check-business-switcher.mjs presses them).
  */
  const rowAt = switcher.indexOf('data-business-row="current"')
  const rowButton = rowAt < 0 ? "" : switcher.slice(switcher.lastIndexOf("<button", rowAt), switcher.indexOf("</button>", rowAt))
  check("the plus is inside the row's button, with the icon buttons' depth, hidden from a screen reader (the row is the button)",
    rowButton.includes("data-business-add") && /aria-hidden="true"\s*data-business-add=""/.test(rowButton) && /iconDepth/.test(rowButton) && /import \{ iconDepth \} from "@\/components\/ui\/depth-button"/.test(switcher))
  check("  so a press on it opens the list, the same as the chevron, and makes nothing",
    /onClick=\{\(\) => setExpanded\(\(v\) => !v\)\}/.test(rowButton) && !/onClick=\{add\}/.test(rowButton))
  check("  and it is on every business: no count or role decides whether it shows",
    !/\{canAdd && \(\s*\/\*[^]*?\*\/\s*<button[^]*?data-business-add/.test(switcher) && !/role === "owner"/.test(switcher) && !/current\.role/.test(switcher))
  /*
    Changed on purpose. The owner: "I don't want to show that text, 'you
    already have three businesses, the most one' thing. Don't show it. When I
    click create, it should show that, just only." The list no longer swaps
    New business for a sentence about the limit; New business is there on
    every login, and a press with three already puts LIMIT_REACHED on the
    menu's one alert line, asking the server nothing
    (scripts/check-business-switcher.mjs presses it).
  */
  check("New business is in the list whatever the count: nothing about the limit sits in the menu at rest",
    /data-business-new=""/.test(switcher) && !/data-business-limit/.test(switcher) && !/canAdd \?/.test(switcher) && !/\{canAdd &&/.test(switcher))
  check("  a press with three already says so on the press, on the same line a refusal uses, and makes no request",
    /if \(!canAdd\) \{\s*setError\(LIMIT_REACHED\)\s*return\s*\}/.test(switcher) && /if \(busy\) return/.test(switcher)
      && switcher.indexOf("setError(LIMIT_REACHED)") < switcher.indexOf("await createBusiness(")
      && /<p role="alert"[\s\S]*?\{retry \? error\.replace\(\/\\s\*Try again\\\.\?\$\/, ""\) : error\}/.test(switcher) && (switcher.match(/<p role="alert"/g) ?? []).length === 1)
  check("  and the limit is still the server's and the database's to keep, not the menu's",
    /if \(!canAddBusiness\(groupIds\(group, caller\.id\)\.length\)\) return \{ error: LIMIT_REACHED, status: 409 \}/.test(read("lib/businesses/server.ts"))
      && /raise exception 'One login can have at most 3 businesses'/.test(read("supabase/sql/run-now/38_business_limit_three.sql")))
  check("no Businesses label on either menu: the business you are in is one row that opens to the rest",
    !/>Businesses</.test(switcher) && /aria-expanded=\{expanded\}/.test(switcher) && /inert=\{!expanded\}/.test(switcher))
  check("and it folds back once the menu has gone", /open=\{headerProfileOpen\}/.test(read("components/app/sidebar.tsx")) && /open=\{mobileProfileDropdownOpen\}/.test(read("components/app/mobile-account-menu.tsx")))
  const desktopMenu = /const profileDropdownItems = \[([\s\S]*?)\]/.exec(read("components/app/sidebar.tsx"))?.[1] ?? ""
  const phoneMenu = /const items = useMemo\(\(\) => \[([\s\S]*?)\]/.exec(read("components/app/mobile-account-menu.tsx"))?.[1] ?? ""
  check("no Help in the account menu on any size", !!desktopMenu && !!phoneMenu && !/"\/help"/.test(desktopMenu) && !/"\/help"/.test(phoneMenu))
  check("Settings on the phone's sheet only: on a desktop the rail beside it has Settings",
    !/"\/app\/settings"/.test(desktopMenu) && /"\/app\/settings"/.test(phoneMenu) && /href="\/app\/settings"/.test(read("components/app/sidebar-desktop-nav.tsx")))
  check("a second business goes straight into onboarding with its way back",
    /const first = await firstBusinessIfSecond\(\)/.test(read("app/(auth)/signup/success/page.tsx")) && /* Changed on purpose: the way back is one value both of the page's paths hand the onboarding, and it carries the switch's screen into /app. */ /const switchBack = firstBusiness\s*\?\s*\{ name: firstBusiness\.name, onSwitch: \(\) => switchBusiness\(firstBusiness\.userId, "\/app", \{ arrival: \{ name: firstBusiness\.name, photo: firstBusiness\.avatarUrl \}, business: firstBusiness \}\) \}/.test(read("app/(auth)/signup/success/page.tsx")) && (read("app/(auth)/signup/success/page.tsx").match(/switchBack=\{switchBack\}/g) ?? []).length === 2 && /data-onboarding-switch-back/.test(read("components/app/creator-onboarding-modal.tsx")))
  check("the onboarding is the whole screen in the app", /setNativeFullScreen\(isNativeApp\(\)\)/.test(read("components/app/creator-onboarding-modal.tsx")))
  const del = read("app/api/auth/delete-account/route.ts")
  /* Changed on purpose: a login can have two businesses besides its first, so deleting it deletes each of them. */
  check("deleting a login deletes every business it made first", /if \(group\?\.ownerId === user\.id\) \{[\s\S]*?for \(const memberId of group\.memberIds\) \{\s*const member = await deleteAccount\(adminSupabase, memberId, "business_owner"\)/.test(del) && del.indexOf('deleteAccount(adminSupabase, memberId, "business_owner")') < del.indexOf('deleteAccount(adminSupabase, user.id, "self")'))
  check("deleting one of those businesses signs its owner back in", /group && group\.ownerId !== user\.id \? await sessionFor\(group\.ownerId\)/.test(del) && /data\.firstBusiness\?\.session/.test(read("components/app/settings-form-new.tsx")))
  /*
    Deleting a business is Settings' own delete, nothing new beside it. The
    owner: "make sure those businesses can be deleted, but in the settings,
    normally. Don't mention it specially." So: the same card, the same code
    by email, and the store gone from the account menu on the way back.
  */
  check("  and the deleted business takes its link with it, so the menu's next list has not got it",
    /await forgetBusinessLinks\(adminSupabase, user\.id\)/.test(del) && /delete\(\)\.eq\("member_id", userId\)/.test(del) && /delete\(\)\.eq\("owner_id", userId\)/.test(del)
      && /on delete cascade/.test(read("supabase/migrations/20261001_business_accounts.sql")))
  check("  the menu is right again with no reload asked for: the first business's session loads /app, which reads the list on the server",
    /applyBusinessSession\(data\.firstBusiness\.session, "\/app"\)/.test(read("components/app/settings-form-new.tsx")) && /window\.location\.replace\(next\)/.test(read("lib/businesses/switch-client.ts"))
      && /listBusinesses\(user\.id\)\.catch\(\(\) => \[\]\)/.test(read("app/app/layout.tsx")))
  const settingsForm = read("components/app/settings-form-new.tsx")
  check("  deleting the login's first account is still one plain Delete account, with no section of its own",
    !/data-settings-card="businesses"/.test(read("components/app/settings/account-panels.tsx")) && /Removes your store, products, customers and sales history for good\./.test(read("components/app/settings/account-panels.tsx"))
      && /Your store, products, customers and details are removed\. People who bought from you keep what they bought, and your sales and payout records are kept\./.test(settingsForm))
  check("  but it does say what else it removes, because the other stores of the login go with it",
    /otherStores > 0 &&/.test(settingsForm) && /The other store on this login goes with it\./.test(settingsForm) && /The other \$\{countWord\(otherStores\)\} stores on this login go with it\./.test(settingsForm)
      && /otherStores: group && group\.ownerId === user\.id \? groupIds\(group, user\.id\)\.length - 1 : 0/.test(read("app/app/settings/_server.ts")))
  check("the seller's mail reaches the owner", /ownerAddress\(sellerEmail\)/.test(read("lib/email.tsx")) && /ownerAddress\(replyTo\)/.test(read("lib/email.tsx")))
  /* Found in the audit: the payout, bank, verification, dispute and tax emails went to the tagged address. */
  /* Those emails are the notification engine's now (lib/notify): every creator email it sends goes to ownerAddress, a customer's to the address given. */
  check("  the payout, bank, verification and dispute emails too: none is sent to a tagged address as it is",
    /entry\.recipient === "customer" \? given : ownerAddress\(given\)/.test(read("lib/notify/engine.ts")) && !/^\s*to: params\.to,$/m.test(read("lib/email.tsx")))
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
