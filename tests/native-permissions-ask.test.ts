/**
 * ASKING FOR PERMISSIONS NOW AND THEN, AND PROVING A PUSH ARRIVES
 *
 * The gentle ask (lib/native-permissions-rule.ts permissionAskStep): never
 * before sign in, one sheet per launch, Storelib's own sheet before the
 * phone's prompt, Settings after a no, every seven days at most. And Settings'
 * Send a test notification (lib/push/test-result.ts, lib/push/test-client.ts),
 * which says exactly what happened.
 */
import { readFileSync } from "node:fs"
import { ASK_AT_MOST_TIMES, ASK_EVERY_MS, isMediaMoment, isNotificationsMoment, mediaAskPermission, permissionAskStep, type PermissionAskContext } from "@/lib/native-permissions-rule"
import { testAnswer } from "@/lib/push/test-result"
import { phoneLine } from "@/lib/push/test-client"
import type { PushResult } from "@/lib/push/sender"

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
const DAY = 24 * 3600 * 1000
const ctx = (over: Partial<PermissionAskContext>): PermissionAskContext => ({ signedIn: true, askedThisSession: false, permission: "prompt", record: null, ...over })

console.log("\nWhen the app asks")
check("never before sign in (a first launch's welcome)", permissionAskStep(ctx({ signedIn: false }), now) === null && permissionAskStep(ctx({ signedIn: false, permission: "denied" }), now) === null)
check("one sheet per launch, whatever the kind", permissionAskStep(ctx({ askedThisSession: true }), now) === null)
check("allowed, limited, or no plugin: nothing", ["granted", "limited", "unsupported"].every((p) => permissionAskStep(ctx({ permission: p as PermissionAskContext["permission"] }), now) === null))
check("never asked: Storelib's sheet, then the phone's prompt", permissionAskStep(ctx({}), now) === "explain")
check("refused: the sheet that opens the phone's Settings", permissionAskStep(ctx({ permission: "denied" }), now) === "settings")
check("a Not now waits seven days", permissionAskStep(ctx({ record: { at: now - 6 * DAY, count: 1 } }), now) === null && permissionAskStep(ctx({ record: { at: now - 7 * DAY, count: 1 } }), now) === "explain")
check("  a refusal too", permissionAskStep(ctx({ permission: "denied", record: { at: now - DAY, count: 1 } }), now) === null && permissionAskStep(ctx({ permission: "denied", record: { at: now - ASK_EVERY_MS, count: 2 } }), now) === "settings")
check("a limited number of times per install", permissionAskStep(ctx({ permission: "denied", record: { at: now - 365 * DAY, count: ASK_AT_MOST_TIMES } }), now) === null)
check("seven days, eight times", ASK_EVERY_MS === 7 * DAY && ASK_AT_MOST_TIMES === 8)

console.log("\nThe camera and photos as one ask")
check("not asked when either is not asked", mediaAskPermission("prompt", "granted") === "prompt" && mediaAskPermission("granted", "prompt") === "prompt")
check("refused only when the camera is: the library picker works without access", mediaAskPermission("denied", "granted") === "denied" && mediaAskPermission("granted", "denied") === "granted")
check("no camera plugin: nothing", mediaAskPermission("unsupported", "prompt") === "unsupported")

console.log("\nWhere it matters")
check("a product's page is the photo moment", isMediaMoment("/app/products/new") && isMediaMoment("/app/products/abc123") && !isMediaMoment("/app/products") && !isMediaMoment("/app/products/collections") && !isMediaMoment("/explore"))
check("a seller's /app is the notifications moment", isNotificationsMoment("/app") && isNotificationsMoment("/app/orders") && !isNotificationsMoment("/login") && !isNotificationsMoment("/native-start") && !isNotificationsMoment("/app/auth/callback"))

const ask = readFileSync("components/platform/notifications-ask.tsx", "utf8")
console.log("\nThe sheet")
check("signed in first, then the rule", /if \(!\(await signedIn\(\)\)\) return/.test(ask) && /permissionAskStep\(/.test(ask))
check("one per launch: kept in the session and in memory", /sessionStorage\.setItem\(SESSION_KEY, "1"\)/.test(ask) && /askedThisLaunch = true/.test(ask))
check("counted when shown, so closing the app does not reset the wait", /markAsked\(\)\s*writeRecord\(kind\)\s*setSheet/.test(ask))
check("explain: the phone's prompt only from the sheet's button", /if \(was\.kind === "notifications"\) \{\s*void askPushPermission\(\)/.test(ask) && (ask.match(/askPushPermission\(\)/g) || []).length === 1)
check("refused: Settings, and back from there registers the phone", /openPhoneSettings\(\)/.test(ask) && /registerDevice\(\)/.test(ask))
const banned = /unlock|elevate|seamless|powerful|effortless|supercharge|transform|—/i
const copy = [...ask.matchAll(/(?:title|body|label): [`"]([^`"]+)[`"]/g)].map((m) => m[1])
check("copy: no banned words, no em dashes", copy.length >= 5 && copy.every((w) => !banned.test(w)), copy.filter((w) => banned.test(w)))

console.log("\nSend a test notification: the exact result")
const r = (over: Partial<PushResult>): PushResult => ({ devices: 0, sent: 0, failures: [], removed: 0, phonesSkipped: 0, ...over })
check("nothing registered", testAnswer(r({})).outcome === "no_devices" && /No devices are registered/.test(testAnswer(r({})).message))
check("sent to N", testAnswer(r({ devices: 2, sent: 2 })).message === "Sent to 2 devices. It should arrive in a few seconds." && testAnswer(r({ devices: 1, sent: 1 })).message.startsWith("Sent to 1 device."))
check("no Firebase key on the server says so by name", testAnswer(r({ devices: 1, phonesSkipped: 1 })).outcome === "not_configured" && /FIREBASE_PRIVATE_KEY/.test(testAnswer(r({ devices: 1, phonesSkipped: 1 })).message))
const apns = testAnswer(r({ devices: 1, failures: [{ platform: "ios", error: "messaging/third-party-auth-error: Auth error from APNS or Web Push Service" }] }))
check("the provider's own error text", apns.outcome === "failed" && /third-party-auth-error/.test(apns.message))
check("an expired token is removed and said", /removed/.test(testAnswer(r({ devices: 1, removed: 1, failures: [{ platform: "android", error: "messaging/registration-token-not-registered" }] })).message))
check("some sent, some not", testAnswer(r({ devices: 2, sent: 1, failures: [{ platform: "ios", error: "x" }] })).outcome === "partly")
check("tokens that could not be read", testAnswer(r({ error: "push_tokens could not be read: relation does not exist" })).outcome === "failed")

console.log("\nWhat this phone adds")
check("browser: nothing", phoneLine(null, "unsupported", null) === null)
check("an app build without push", /cannot use notifications/.test(phoneLine("android", "unsupported", null) ?? ""))
check("refused, not asked", /off for Storelib/.test(phoneLine("ios", "denied", null) ?? "") && /not allowed/.test(phoneLine("ios", "prompt", null) ?? ""))
check("the phone's registration error", phoneLine("ios", "granted", { token: false, saved: null, error: "The phone refused to register for notifications (no valid aps-environment entitlement string found)" })?.includes("aps-environment") === true)
check("no token", /no push token/.test(phoneLine("android", "granted", { token: false, saved: null, error: null }) ?? ""))
check("all well: nothing", phoneLine("android", "granted", { token: true, saved: true, error: null }) === null)

console.log("\nThe chain")
const sender = readFileSync("lib/push/sender.ts", "utf8")
const route = readFileSync("app/api/push/test/route.ts", "utf8")
const register = readFileSync("app/api/push/register/route.ts", "utf8")
const who = readFileSync("lib/push/request-user.ts", "utf8")
const client = readFileSync("lib/push/client.ts", "utf8")
const settings = readFileSync("components/account/notification-settings.tsx", "utf8")
const delegate = readFileSync("ios/App/App/AppDelegate.swift", "utf8")
check("the sender says what it did, device by device", /export async function sendPushToUser\(userId: string, payload: PushPayload\): Promise<PushResult>/.test(sender) && /result\.failures\.push\(\{ platform, error: words \}\)/.test(sender) && /return result\s*\}\s*$/.test(sender))
check("  a phone skipped for a missing Firebase key is logged every time", /result\.phonesSkipped\+\+/.test(sender) && /device skipped: FIREBASE_PROJECT_ID/.test(sender))
check("  gone tokens are pruned", /if \(GONE_TOKEN_CODES\.has\(code\)\) invalidIds\.push\(id\)/.test(sender) && /\.from\("push_tokens"\)\.delete\(\)\.in\("id", invalidIds\)/.test(sender))
check("the test sends to the session's own user only, rate limited", /const \{ user \} = await pushRequestUser\(req\)/.test(route) && /sendPushToUser\(user\.id,/.test(route) && !/body\.userId|req\.json/.test(route) && /bucket: "push-test"/.test(route))
check("a phone whose cookie is missing still saves its token (bearer)", /pushRequestUser\(req\)/.test(register) && /auth\.getUser\(bearer\)/.test(who) && /Authorization: `Bearer \$\{who\.accessToken\}`/.test(client))
check("the phone keeps its registration error for the test", /PushNotifications\.addListener\("registrationError"[\s\S]*?state\.error =/.test(client))
check("Settings has the button", /<TestPushRow \/>/.test(settings) && /data-push-test=""/.test(settings) && /sendTestNotification\(\)/.test(settings))
check("iOS no longer shows its one prompt at launch, before sign in", !/requestAuthorization/.test(delegate) && /getNotificationSettings/.test(delegate) && /registerForRemoteNotifications\(\)/.test(delegate))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
