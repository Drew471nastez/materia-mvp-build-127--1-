/**
 * ===========================================================================
 *  A DEVICE CODE GETS FIVE GUESSES
 * ===========================================================================
 * Round rel-security (F6). /api/security/confirm-device looked a code up by
 * order and code with no count, so the per order device lock could be walked
 * through a million codes. lib/auth/code-guard.ts checkDeviceCode, run here
 * against tests/_fake-db.
 */
import { fakeDb } from "./_fake-db"
import { readCode } from "./_source"
import { checkDeviceCode, DEVICE_WRONG_BUCKET } from "@/lib/auth/code-guard"

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

const ORDER = "11111111-1111-4111-8111-111111111111"
const live = (id: string, code: string, ageMs = 1000) => ({
  id,
  order_id: ORDER,
  code,
  expires_at: new Date(Date.now() + 600_000).toISOString(),
  used_at: null as string | null,
  created_at: new Date(Date.now() - ageMs).toISOString(),
})

async function main() {
  {
    const db = fakeDb({ verification_codes: [live("c1", "424242")], rate_limit_hits: [] })
    const ok = await checkDeviceCode(db, ORDER, "424242")
    check("the right code opens, once", ok.ok === true && !!db.tables.verification_codes[0].used_at)
    const again = await checkDeviceCode(db, ORDER, "424242")
    check("  the same code a second time does not", again.ok === false && again.status === 400)
  }
  {
    const db = fakeDb({ verification_codes: [live("c1", "424242")], rate_limit_hits: [] })
    const answers = []
    for (const guess of ["000001", "000002", "000003", "000004", "000005"]) answers.push(await checkDeviceCode(db, ORDER, guess))
    check("five wrong codes are refused", answers.every((a) => !a.ok))
    check("  each counted against the order", db.tables.rate_limit_hits.filter((r) => r.bucket === DEVICE_WRONG_BUCKET && r.subject === `order:${ORDER}`).length === 5)
    check("  the fifth burns the live code", !!db.tables.verification_codes[0].used_at && answers[4].ok === false && answers[4].locked === true)
    const right = await checkDeviceCode(db, ORDER, "424242")
    check("  the right code after that is refused with 429", right.ok === false && right.status === 429, right)
    db.tables.verification_codes.push(live("c2", "135790", -1000))
    const fresh = await checkDeviceCode(db, ORDER, "135790")
    check("  a new code sent after that starts with fresh tries", fresh.ok === true, fresh)
  }
  {
    const expired = { ...live("c1", "424242"), expires_at: new Date(Date.now() - 1000).toISOString() }
    const db = fakeDb({ verification_codes: [expired], rate_limit_hits: [] })
    const r = await checkDeviceCode(db, ORDER, "424242")
    check("an expired code is refused, and is not counted as a guess", r.ok === false && db.tables.rate_limit_hits.length === 0)
  }
  const route = readCode("app/api/security/confirm-device/route.ts")
  check("the route checks through checkDeviceCode", /checkDeviceCode\(admin, orderId, code\)/.test(route) && !/\.eq\("code", code\)/.test(route))
  check("  and limits each caller address", /bucket: "confirm-device-address"/.test(route) && /if \(limited\) return limited/.test(route) && route.indexOf("if (limited) return limited") < route.indexOf("checkDeviceCode("))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
