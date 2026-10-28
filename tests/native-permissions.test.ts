/**
 * THE CAMERA, THE LIBRARY AND NOTIFICATIONS AFTER A NO
 *
 * The phone asks once. After a "Don't Allow" the app says what is off and
 * opens the phone's Settings in one tap, wherever the person tried to use it:
 * a photo input, the native photo picker, the ID camera, and the moments a
 * notification matters (joining, posting, commenting, a product on sale).
 */
import { readFileSync } from "node:fs"
import { HOLD_AGAIN_AFTER_MS, shouldHoldPicker, takesMedia } from "@/lib/native-permissions-rule"
import { allowed, mediaOffSheet, mediaPermissionFrom, settingsPath } from "@/lib/native-permissions"
import { deniedKind } from "@/lib/native-camera"
import { NUDGE_WORDS } from "@/lib/notifications/nudge"

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

console.log("\nThe phone's answers, in our words")
check("granted, limited, denied as they are", mediaPermissionFrom("granted") === "granted" && mediaPermissionFrom("limited") === "limited" && mediaPermissionFrom("denied") === "denied")
check("Android's prompt-with-rationale can still be asked", mediaPermissionFrom("prompt-with-rationale") === "prompt" && mediaPermissionFrom("prompt") === "prompt")
check("anything else is not the app", mediaPermissionFrom(undefined) === "unsupported" && mediaPermissionFrom("x") === "unsupported")
check("a limited library still opens", allowed("limited") && allowed("granted") && !allowed("denied") && !allowed("prompt"))

console.log("\nWhich inputs are about photos")
check("image and video types", takesMedia("image/*") && takesMedia("video/*") && takesMedia("image/png, image/jpeg") && takesMedia(".jpg,.png"))
check("a product's files are not", !takesMedia("") && !takesMedia(".pdf,.zip") && !takesMedia("application/pdf"))
check("mixed: photos among them", takesMedia("application/pdf,image/*"))

console.log("\nA photo input that also offers the library is held now and then")
check("never held on this phone: hold", shouldHoldPicker(null, now))
check("held a moment ago: let it through", !shouldHoldPicker(now - 60_000, now))
check("three days later: hold again", shouldHoldPicker(now - HOLD_AGAIN_AFTER_MS, now) && HOLD_AGAIN_AFTER_MS === 3 * 24 * 3600 * 1000)

console.log("\nThe native picker's refusals")
check("iOS and Android camera words", deniedKind(new Error("User denied access to camera")) === "camera")
check("iOS and Android library words", deniedKind(new Error("User denied access to photos")) === "photos")
check("a cancel is not a refusal", deniedKind(new Error("User cancelled photos app")) === null)

console.log("\nWhere the switch is, in each phone's words")
check("iPhone camera", settingsPath("camera", "ios") === "Settings, Storelib, Camera")
check("Android camera", settingsPath("camera", "android") === "Settings, Apps, Storelib, Permissions, Camera")
check("notifications", settingsPath("notifications", "ios") === "Settings, Notifications, Storelib" && settingsPath("notifications", "android") === "Settings, Apps, Storelib, Notifications")
check("the camera sheet says what is off", mediaOffSheet("camera").title === "Camera is off for Storelib" && mediaOffSheet("photos").title === "Photos are off for Storelib")

console.log("\nCopy")
const banned = /unlock|elevate|seamless|powerful|effortless|supercharge|transform|—/i
const words = [mediaOffSheet("camera"), mediaOffSheet("photos")].flatMap((r) => [r.title, r.body]).concat(Object.values(NUDGE_WORDS).flatMap((w) => [w.title, w.body("iPhone")]))
check("no banned words and no em dashes", words.every((w) => !banned.test(w)), words.filter((w) => banned.test(w)))

const sheet = readFileSync("components/platform/access-sheet.tsx", "utf8")
const ask = readFileSync("components/platform/notifications-ask.tsx", "utf8")
const camera = readFileSync("lib/native-camera.ts", "utf8")
const flow = readFileSync("components/app/settings/payments-setup-flow.tsx", "utf8")
const layout = readFileSync("app/layout.tsx", "utf8")
const appOnly = readFileSync("components/platform/app-only.tsx", "utf8")
const push = readFileSync("lib/native-push.ts", "utf8")

console.log("\nThe tap on a photo input")
check("decided inside the tap, from the last answer read", /knownCameraPermission\(\) !== "denied"/.test(sheet) && /document\.addEventListener\("click", onClick, true\)/.test(sheet))
check("read again on every return to the app", /visibilitychange/.test(sheet) && /readMediaPermission\("camera"\)/.test(sheet))
check("Choose from library carries on from the sheet's own tap", /Choose from library/.test(sheet) && /passing\.add\(input\)/.test(sheet) && /input\.click\(\)/.test(sheet))
check("iOS only, unless the input asks for the camera itself", /if \(!cameraOnly && platform !== "ios"\) return/.test(sheet))
check("an input opened from the sheet is not held again", /data-access-skip/.test(sheet) && /data-access-skip/.test(camera))

console.log("\nEvery refusal reaches the sheet")
check("the native picker: no alert while the sheet is there", /refusedSheet\(refused\)/.test(camera) && /showAccessSheet\(/.test(camera))
check("the ID camera, only when refused (no camera at all is not a setting)", /if \(why === "denied"\) showAccessSheet\(mediaOffSheet\("camera"\)\)/.test(flow))
check("one way to the phone's Settings", /return openAppSettings\(\)/.test(push))
check("mounted in the root layout, not on websites", /<AccessSheet \/>/.test(layout) && /import\("@\/components\/platform\/access-sheet"\)/.test(appOnly) && /usePublishedWebsite\(\) \? null : <LazyAccess \/>/.test(appOnly))

console.log("\nNotifications at the moments they matter")
check("joining, posting, commenting, a new product", /nudgeNotifications\("joined"\)/.test(readFileSync("components/community/public/join-controls.tsx", "utf8")) && /nudgeNotifications\("posted"\)/.test(readFileSync("components/community/member/composer.tsx", "utf8")) && /nudgeNotifications\("commented"\)/.test(readFileSync("components/community/member/comments.tsx", "utf8")) && /if \(created\) nudgeNotifications\("product"\)/.test(readFileSync("app/app/products/new/product-editor.tsx", "utf8")))
/* Changed on purpose: a short sheet first, then the phone's prompt; one rule and one budget for every kind (lib/native-permissions-rule.ts). */
check("not asked yet: Storelib's sheet, then the phone's own prompt", /void askPushPermission\(\)\.then\(\(answer\) => \(answer === "granted" \? accountOn\(\) : undefined\)\)/.test(ask))
check("refused: on the shared budget, never stacked on a sheet", /permissionAskStep\(\{ signedIn: true, askedThisSession: askedThisSession\(\), permission, record: readRecord\(kind\) \}, Date\.now\(\)\)/.test(ask) && /if \(pageIsBusy\(\)\)/.test(ask))
check("once per moment per launch", /nudged\.has\(at\)/.test(ask))
check("back from Settings with them on: registered and switched on now", /wentToSettings\.current = openPhoneSettings\(\)/.test(ask) && /registerDevice\(\)/.test(ask) && /await accountOn\(\)/.test(ask))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
