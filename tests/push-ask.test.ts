/**
 * ASKED TO ALLOW NOTIFICATIONS ON EVERY INSTALL
 *
 * The phone's own prompt on the first launch after an install, signed in or
 * not. After a no, a reminder that opens the phone's settings.
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

console.log("\nHow often the off reminder comes back")
check("never reminded on this phone: remind", shouldAsk(null, now))
check("reminded a moment ago: leave them alone", !shouldAsk({ at: now - 60_000, count: 1 }, now))
check("a few days later: remind again", shouldAsk({ at: now - ASK_AGAIN_AFTER_MS, count: 1 }, now) && !shouldAsk({ at: now - ASK_AGAIN_AFTER_MS + 1000, count: 1 }, now))
check("a limited number of times per install", !shouldAsk({ at: now - 365 * 24 * 3600 * 1000, count: ASK_AT_MOST }, now))
check("every four days, eight times", ASK_AGAIN_AFTER_MS === 4 * 24 * 3600 * 1000 && ASK_AT_MOST === 8)

const ask = readFileSync("components/platform/notifications-ask.tsx", "utf8")
const layout = readFileSync("app/layout.tsx", "utf8")
const settings = readFileSync("components/account/notification-settings.tsx", "utf8")
const init = readFileSync("components/native-push-init.tsx", "utf8")
const client = readFileSync("lib/push/client.ts", "utf8")

console.log("\nEvery install is asked")
check("the app only: a browser has its own notifications", /if \(!inNativeApp\(\)\) return/.test(ask))
check("not asked yet: the phone's own prompt, signed in or not", /if \(permission === "prompt"\) \{\s*const answer = await askPushPermission\(\)/.test(ask) && !/accountWantsPush/.test(ask))
check("  a yes while signed in turns the account's own switch on", /answer === "granted" && \(await signedIn\(\)\)/.test(ask) && /JSON\.stringify\(\{ enabled: true \}\)/.test(ask))
check("  a yes before signing in registers the phone on sign in", /onAuthStateChange/.test(init) && /event === "SIGNED_IN"/.test(init) && /if \(!\(await sessionUser\(\)\)\) return/.test(client) && /if \(knownToken\) void sendToken\(knownToken, platform\)/.test(client))
check("after the first frame, not during it", /setTimeout\(\(\) => void decide\(\), 1200\)/.test(ask))

console.log("\nA no is reminded, and one tap opens the phone's settings")
check("only after a no, and not over a sheet already open", /if \(permission !== "denied"\) return/.test(ask) && /pageIsBusy/.test(ask))
check("Open Settings opens the phone's own settings", /data-push-ask-allow/.test(ask) && /openPhoneSettings\(\)/.test(ask))
check("Not now is remembered", /data-push-ask-later/.test(ask) && /writeRecord\(/.test(ask))

console.log("\nIt is mounted everywhere, and Settings still owns the detail")
check("the root layout draws it, so any page in the app can ask", /<NotificationsAsk \/>/.test(layout) && /components\/platform\/notifications-ask/.test(layout))
check("Settings keeps the switch, the kinds, quiet hours and the phone's own state", /PushSwitchRow/.test(settings) && /PUSH_KINDS/.test(settings) && /QuietHours/.test(settings) && /data-phone-permission/.test(settings))
check("  and a no opens the phone's settings from there too", /phoneSettingsPath/.test(settings) && /data-phone-open-settings/.test(settings) && /openPhoneSettings\(\)/.test(settings))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
