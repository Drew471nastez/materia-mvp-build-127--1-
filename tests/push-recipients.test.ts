/**
 * ===========================================================================
 *  A SALE REACHES THE PHONE WHICHEVER BUSINESS IT HAS OPEN
 * ===========================================================================
 * lib/push/recipients and lib/push/sender. A phone's push token belongs to
 * the account open on it, and each business of a login is its own account,
 * so switching the phone to the second business used to take the first
 * business's notifications off it. Now a notification for one business goes
 * to every device of the login, its title naming the business on a device
 * that has another open, and never to anybody outside the login.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { devicesFor, titleOn, type TokenRow } from "../lib/push/recipients"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `   ${JSON.stringify(detail)}`}`)
  }
}

const A = "00000000-0000-4000-8000-00000000000a"
const B = "00000000-0000-4000-8000-00000000000b"
const phone: TokenRow = { id: "1", token: "phone-token", platform: "ios", user_id: B }
const laptop: TokenRow = { id: "2", token: "{\"endpoint\":\"https://push/1\"}", platform: "web", user_id: A }

console.log("\nWhich devices")
check("the business's own devices and those on its other business, each once", devicesFor([phone, laptop], A).length === 2)
check("a token listed under two accounts goes once, as the account the notification is for", (() => {
  const both = devicesFor([{ ...phone, id: "3", user_id: B }, { ...phone, id: "4", user_id: A }], A)
  return both.length === 1 && both[0].user_id === A && both[0].id === "4"
})())
check("no devices, nothing to send", devicesFor([], A).length === 0)

console.log("\nWhat the title says")
check("on the business's own device, the title as it is", titleOn(laptop, A, "New sale", "Loudlib") === "New sale")
check("on a device that has another business of the login open, the business's name in front", titleOn(phone, A, "New sale", "Loudlib") === "Loudlib: New sale")
check("  and as it is when the name is not known", titleOn(phone, A, "New sale", null) === "New sale" && titleOn(phone, A, "New sale", "  ") === "New sale")
check("  in plain words, no dashes", !/[–—]/.test(titleOn(phone, A, "New sale", "Loudlib")))

console.log("\nThe sender")
const sender = readFileSync(join(process.cwd(), "lib/push/sender.ts"), "utf8")
check("it reads the login's accounts on the server, and falls back to this account alone",
  /const accounts = await businessGroup\(userId\)\.then\(\(g\) => groupIds\(g, userId\)\)\.catch\(\(\) => \[userId\]\)/.test(sender))
check("  asks for the tokens of those accounts only", /\.in\("user_id", accounts\)/.test(sender) && !/\.eq\("user_id", userId\)\s*\n\s*\n\s*if \(error\)/.test(sender))
check("  sends each device its own title, phones and browsers alike",
  /const title = titleOn\(device, userId, payload\.title, businessName\)/.test(sender) && /sendToBrowser\(token, \{ \.\.\.payload, title \}\)/.test(sender) && /notification: \{\s*title,/.test(sender))
check("  and only asks for the business's name when a device is on another business", /tokens\.some\(\(t\) => t\.user_id !== userId\)\s*\?\s*await listBusinesses\(userId\)/.test(sender))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
