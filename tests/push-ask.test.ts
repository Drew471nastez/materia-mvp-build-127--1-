/**
 * ASKED TO ALLOW NOTIFICATIONS AFTER AN INSTALL
 *
 * A reinstall resets the phone's permission and the device token, so an
 * account that still says push is on quietly receives nothing. The app asks
 * again, once, in Storelib's own words before the phone's prompt, and
 * Settings stays the place to say how much of it.
 */
import { readFileSync } from "node:fs"
import { ASK_AGAIN_AFTER_MS, ASK_AT_MOST, shouldAsk } from "@/lib/notifications/push-ask-rule"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `   (${JSON.stringify(detail)})`}`)
  }
}

const now = 1_800_000_000_000

console.log("\nHow often it asks")
check("never asked on this phone: ask", shouldAsk(null, now))
check("asked a moment ago: leave them alone", !shouldAsk({ at: now - 60_000, count: 1 }, now))
check("a week later: ask again", shouldAsk({ at: now - ASK_AGAIN_AFTER_MS, count: 1 }, now) && !shouldAsk({ at: now - ASK_AGAIN_AFTER_MS + 1000, count: 1 }, now))
check("three times is all, however long it has been", !shouldAsk({ at: now - 365 * 24 * 3600 * 1000, count: ASK_AT_MOST }, now))
check("a week is a week and three is three", ASK_AGAIN_AFTER_MS === 7 * 24 * 3600 * 1000 && ASK_AT_MOST === 3)

const ask = readFileSync("components/platform/notifications-ask.tsx", "utf8")
const layout = readFileSync("app/layout.tsx", "utf8")
const settings = readFileSync("components/account/notification-settings.tsx", "utf8")

console.log("\nWho it asks, and when")
check("the app only: a browser has its own notifications", /if \(!inNativeApp\(\)\) return/.test(ask))
check("only where the phone has not been asked yet", /\(await readPushPermission\(\)\) !== "prompt"/.test(ask))
check("only someone signed in", /await signedIn\(\)/.test(ask))
check("never someone whose account turned push off", /accountWantsPush/.test(ask) && /body\?\.enabled !== false/.test(ask))
check("not over a sheet that is already open", /pageIsBusy/.test(ask) && /data-payments-setup-panel/.test(ask))
check("after the first frame, not during it", /setTimeout\(\(\) => void decide\(\), 2500\)/.test(ask))

console.log("\nOur sheet first, the phone's prompt second")
check("the phone is only asked through Allow", /data-push-ask-allow/.test(ask) && /askPushPermission\(\)/.test(ask))
check("  and a yes turns the account's own switch on, so a push lands somewhere", /JSON\.stringify\(\{ enabled: true \}\)/.test(ask))
check("Not now is remembered, and costs nothing", /data-push-ask-later/.test(ask) && /const notNow = \(\) => \{\s*\n\s*remember\(\)/.test(ask))
check("both answers are remembered, so three is really three", /const allow = async \(\) => \{[\s\S]{0,120}remember\(\)/.test(ask) && /const notNow = \(\) => \{\s*\n\s*remember\(\)/.test(ask))
check("it says Settings is where to choose how much", /Settings, Notifications/.test(ask))

console.log("\nIt is mounted everywhere, and Settings still owns the detail")
check("the root layout draws it, so any page in the app can ask", /<NotificationsAsk \/>/.test(layout) && /components\/platform\/notifications-ask/.test(layout))
check("Settings keeps the switch, the kinds, quiet hours and the phone's own state", /PushSwitchRow/.test(settings) && /PUSH_KINDS/.test(settings) && /QuietHours/.test(settings) && /data-phone-permission/.test(settings))
check("  and tells somebody who said no where to undo it", /phoneSettingsPath/.test(settings))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
