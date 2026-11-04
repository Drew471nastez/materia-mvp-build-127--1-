/**
 * ===========================================================================
 *  ROUND 51: /app WHEN THE DATABASE IS SLOW, AND EXPLORE FROM THE ACCOUNT MENU
 * ===========================================================================
 * The owner: "the database, I think, is not responding, which breaks
 * navigation in the web app", and the account menu's Explore "goes to
 * storelib.com (the landing page)".
 *
 *   1. A platform switch the database did not answer is not "off": the read
 *      throws (unstable_cache keeps no throw) and the last answer this
 *      instance had stands. It used to be `false`, kept five minutes for
 *      every instance, and /explore sent everybody to the landing page.
 *   2. Where /explore sends somebody while Explore really is off: the app's
 *      start gate inside the iOS and Android apps, the library for somebody
 *      signed in, the home page for a stranger on the web. Never "/" in the app.
 *   3. The /app account menus and header offer Explore only while it is on.
 *
 * scripts/check-app-navigation-r51.mjs measures the navigation itself in a
 * browser against a stand in Supabase that is on time, slow or failing.
 */
import { keptSetting, readSetting, SettingUnread } from "@/lib/platform/setting-read"
import { exploreOffTarget, isAppUserAgent } from "@/lib/explore/off-target"
import { readCode } from "./_source"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail)?.slice(0, 400)}`}`)
  }
}
const section = (name: string) => console.log(`\n${name}`)

type Answer = { data: { value?: unknown } | null; error: { code?: string; message?: string } | null }
function client(answer: Answer | (() => Promise<Answer>)) {
  const run = typeof answer === "function" ? answer : async () => answer
  return { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: run }) }) }) } as unknown as Parameters<typeof readSetting>[1]
}
async function throwsUnread(p: Promise<unknown>): Promise<boolean> {
  try {
    await p
    return false
  } catch (e) {
    return e instanceof SettingUnread
  }
}

async function main() {
  section("1. A switch that could not be read")
  check("a row that says true is on", (await readSetting("explore_marketplace", client({ data: { value: true }, error: null }))) === true)
  check("a row that says false is off", (await readSetting("explore_marketplace", client({ data: { value: false }, error: null }))) === false)
  check("no row is no answer (the caller's default)", (await readSetting("explore_marketplace", client({ data: null, error: null }))) === null)
  check("no table yet is no answer, not an outage", (await readSetting("explore_marketplace", client({ data: null, error: { code: "42P01", message: "relation does not exist" } }))) === null)
  check("a timeout throws, it is not off", await throwsUnread(readSetting("explore_marketplace", client({ data: null, error: { message: "DeadlineExceeded: read" } }))))
  check("a 503 throws, it is not off", await throwsUnread(readSetting("explore_marketplace", client({ data: null, error: { code: "PGRST003", message: "Timed out acquiring connection from connection pool." } }))))
  check("a fetch that threw throws", await throwsUnread(readSetting("explore_marketplace", client(async () => { throw new TypeError("fetch failed") }))))

  let outcome: "on" | "off" | "down" = "on"
  const kept = keptSetting(async () => {
    if (outcome === "down") throw new SettingUnread("explore_marketplace", "down")
    return outcome === "on"
  }, false)
  check("read on: on", (await kept.value()) === true)
  outcome = "down"
  check("then the database does not answer: still on (the last answer)", (await kept.value()) === true && (await kept.answer()) === true)
  outcome = "off"
  check("switched off and read: off", (await kept.value()) === false)
  outcome = "down"
  check("then down again: still off", (await kept.value()) === false)
  kept.forget()
  check("a cold instance that cannot read: no answer, and value() falls back", (await kept.answer()) === null && (await kept.value()) === false)

  const explore = readCode("lib/platform/explore-marketplace.ts")
  check("Explore's flag reads with the service role only (createClient read cookies inside unstable_cache)", !/@\/lib\/supabase\/server/.test(explore) && /readSetting\(EXPLORE_MARKETPLACE_KEY\)/.test(explore) && /keptSetting\(/.test(explore))
  for (const f of ["lib/platform/physical-commerce.ts", "lib/platform/buyer-header-theme.ts"]) {
    const src = readCode(f)
    check(`${f}: a missed read is never cached as off`, /readSetting\(/.test(src) && /keptSetting\(/.test(src) && !/catch\s*\{\s*(\/\*[^*]*\*\/\s*)?return false/.test(src))
  }

  section("2. Where /explore sends somebody while Explore is off")
  const IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Capacitor StorelibWindows/1"
  const ANDROID_WV = "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0 Mobile Safari/537.36"
  const SAFARI = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15"
  check("the iOS app is the app", isAppUserAgent(IOS) && isAppUserAgent(ANDROID_WV) && !isAppUserAgent(SAFARI))
  check("in the iOS app: the start gate, never the landing page", exploreOffTarget({ userAgent: IOS, cookieNames: ["sb-x-auth-token"] }) === "/native-start" && exploreOffTarget({ userAgent: IOS, cookieNames: [] }) === "/native-start")
  check("in the Android app: the start gate", exploreOffTarget({ userAgent: ANDROID_WV, cookieNames: [] }) === "/native-start")
  check("signed in on the web: the library", exploreOffTarget({ userAgent: SAFARI, cookieNames: ["sb-abc-auth-token.0"] }) === "/account/library")
  check("a stranger on the web: the home page, as before", exploreOffTarget({ userAgent: SAFARI, cookieNames: ["storelib_consent"] }) === "/")
  const layout = readCode("app/(marketing)/explore/layout.tsx")
  check("/explore sends nobody away on an unanswered read: only a real off", /enabled === false/.test(layout) && !/redirect\("\/"\)/.test(layout) && /exploreOffTarget\(/.test(layout))

  section("3. The /app account menus offer Explore only while it is on")
  const shell = readCode("app/app/layout.tsx")
  check("the shell reads the switch, bounded, unknown shows it", /within\(exploreMarketplaceAnswer\(\), SHELL_EXTRA_MS, null\)/.test(shell) && /exploreOn=\{exploreAnswer !== false\}/.test(shell))
  const sidebar = readCode("components/app/sidebar.tsx")
  check("the desktop menus drop the row", /\.\.\.\(exploreOn \? \[\{ href: "\/explore"/.test(sidebar))
  check("the header's Explore buttons only while on", (sidebar.match(/\{exploreOn \? <(Link|Button)/g) ?? []).length === 2)
  check("Explore is not read ahead while it is off", /exploreOn \? warmStorelibPages\(router\) : undefined/.test(sidebar))
  check("the phone's sheet drops the row", /\.\.\.\(exploreOn \? \[\{ href: "\/explore"/.test(readCode("components/app/mobile-account-menu.tsx")) && /exploreOn=\{exploreOn\}/.test(sidebar))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

void main()
