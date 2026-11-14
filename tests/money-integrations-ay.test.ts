/**
 * Round AY (money and integrations): a refunded community program or module
 * opened again from its own paid session.
 *
 * A full refund marks the buyer's community_program_access or
 * community_module_access row revoked. The Checkout Session stays "paid" at
 * Stripe after a refund, and grantProgram / grantModuleFromSession cleared
 * revoked_at for any paid session. So one POST of the old session id to
 * /api/community/<id>/learn/<program>/checkout/confirm (or Stripe sending
 * checkout.session.completed again) gave the program back with the money
 * already refunded. Now a revoked row opens again only for a payment that is
 * not refunded (lib/communities/server/refunded-payment.ts).
 */
import { memDb } from "./_classroom-db"
import { readCode } from "./_source"
import { regrantVerdict } from "@/lib/communities/refund-verdict"
import { grantProgram } from "@/lib/communities/server/learn"
import { grantFromSession, revokeRefundedProgram } from "@/lib/communities/server/learn-checkout"
import { grantModuleFromSession, revokeRefundedModule } from "@/lib/communities/server/module-sales"

let failed = 0
let passed = 0
function check(name: string, ok: boolean) {
  if (ok) { passed++; console.log(`  ok    ${name}`) } else { failed++; console.log(`  FAIL  ${name}`) }
}

const id = (n: number) => `00000000-0000-4000-b000-${String(n).padStart(12, "0")}`
const A = id(1)
const ALICE = id(20)
const PAID = id(32)
const COURSE = id(41)
const MODULE = id(61)
const NOW = Date.parse("2026-10-05T12:00:00Z")

function db() {
  return memDb(
    {
      communities: [{ id: A, creator_id: id(10), owner_user_id: id(11), slug: "makers", name: "Makers", classroom_enabled: true, status: "published" }],
      community_courses: [{ id: PAID, community_id: A, product_id: null, course_id: COURSE, title: "Paid program", summary: null, cover_url: null, status: "published", price_cents: 4900, currency: "usd", access: {}, drip_days: null, position: 0, added_at: new Date(NOW).toISOString() }],
      courses: [{ id: COURSE, product_id: null }],
      course_modules: [{ id: MODULE, course_id: COURSE, title: "Clay", position: 0, price_cents: 1500 }],
      community_program_access: [],
      community_module_access: [],
    },
    { unique: { community_program_access: [["program_id", "user_id"], ["checkout_session_id"]], community_module_access: [["module_id", "user_id"]] } },
  )
}

const programSession = (sid: string, pi: string) =>
  ({ id: sid, payment_status: "paid", payment_intent: pi, amount_total: 4900, currency: "usd", metadata: { kind: "community_program", community_id: A, community_program_id: PAID, buyer_id: ALICE } }) as any
const moduleSession = (sid: string, pi: string) =>
  ({ id: sid, payment_status: "paid", payment_intent: pi, amount_total: 1500, currency: "usd", metadata: { kind: "community_module", community_id: A, community_program_id: PAID, community_module_id: MODULE, buyer_id: ALICE } }) as any

const notRefunded = async () => false
const refunded = async () => true
const stripeDown = async () => null

async function main() {
  console.log("\nTHE RULE")
  {
    check("same session as the revoked row: refused without asking Stripe", (await regrantVerdict({ checkout_session_id: "cs_1" }, { checkoutSessionId: "cs_1" }, async () => { throw new Error("asked") })) === "refunded")
    check("same payment as the revoked row: refused", (await regrantVerdict({ payment_intent_id: "pi_1" }, { checkoutSessionId: "cs_2", paymentIntentId: "pi_1" })) === "refunded")
    check("another payment Stripe says is refunded: refused", (await regrantVerdict({ checkout_session_id: "cs_1" }, { checkoutSessionId: "cs_2", paymentIntentId: "pi_2" }, refunded)) === "refunded")
    check("another payment, Stripe cannot say: try again", (await regrantVerdict({ checkout_session_id: "cs_1" }, { checkoutSessionId: "cs_2", paymentIntentId: "pi_2" }, stripeDown)) === "unknown")
    check("a throwing check counts as cannot say", (await regrantVerdict({}, { paymentIntentId: "pi_2" }, async () => { throw new Error("x") })) === "unknown")
    check("a new payment that is not refunded: allowed", (await regrantVerdict({ checkout_session_id: "cs_1", payment_intent_id: "pi_1" }, { checkoutSessionId: "cs_2", paymentIntentId: "pi_2" }, notRefunded)) === "allow")
  }

  console.log("\nPROGRAM: refund, then the old session sent again")
  {
    const d = db()
    const first = await grantFromSession(d, programSession("cs_test_aaaaaaaaaa", "pi_a"), { refundCheck: notRefunded })
    check("paid: granted", first.ok === true && (first as any).created === true)
    check("full refund revokes it", (await revokeRefundedProgram(d, "pi_a")) === 1)
    const replay = await grantFromSession(d, programSession("cs_test_aaaaaaaaaa", "pi_a"), { refundCheck: notRefunded })
    check("REPLAY of the refunded session: 409 refunded", replay.ok === false && (replay as any).status === 409 && (replay as any).error === "refunded")
    check("and the row stays revoked", !!d.tables.community_program_access[0].revoked_at)
    const replayCheckOnly = await grantProgram(d, { programId: PAID, userId: ALICE, communityId: A, source: "purchase", checkoutSessionId: "cs_test_zzzzzzzzzz", paymentIntentId: "pi_old" , refundCheck: refunded })
    check("an older refunded payment (another session) is refused too", replayCheckOnly.ok === false && !!d.tables.community_program_access[0].revoked_at)
    const down = await grantFromSession(d, programSession("cs_test_bbbbbbbbbb", "pi_b"), { refundCheck: stripeDown })
    check("Stripe not answering: 503 so the webhook retries, still revoked", down.ok === false && (down as any).status === 503 && !!d.tables.community_program_access[0].revoked_at)
    const rebuy = await grantFromSession(d, programSession("cs_test_bbbbbbbbbb", "pi_b"), { refundCheck: notRefunded })
    check("a real new purchase opens it again", rebuy.ok === true && d.tables.community_program_access[0].revoked_at === null && d.tables.community_program_access[0].payment_intent_id === "pi_b")
    const owner = await grantProgram(d, { programId: PAID, userId: ALICE, communityId: A, source: "grant" })
    check("a second call on an open row changes nothing", owner.ok === true && (owner as any).created === false)
  }

  console.log("\nMODULE: refund, then the old session sent again")
  {
    const d = db()
    const first = await grantModuleFromSession(d, moduleSession("cs_test_mmmmmmmmmm", "pi_m"), { refundCheck: notRefunded })
    check("paid: granted", first.ok === true)
    check("full refund revokes it", (await revokeRefundedModule(d, "pi_m")) === 1)
    const replay = await grantModuleFromSession(d, moduleSession("cs_test_mmmmmmmmmm", "pi_m"), { refundCheck: notRefunded })
    check("REPLAY of the refunded session: 409 refunded, still revoked", replay.ok === false && (replay as any).status === 409 && !!d.tables.community_module_access[0].revoked_at)
    const other = await grantModuleFromSession(d, moduleSession("cs_test_nnnnnnnnnn", "pi_n"), { refundCheck: refunded })
    check("another refunded payment: refused", other.ok === false && !!d.tables.community_module_access[0].revoked_at)
    const rebuy = await grantModuleFromSession(d, moduleSession("cs_test_oooooooooo", "pi_o"), { refundCheck: notRefunded })
    check("a real new purchase opens it again", rebuy.ok === true && d.tables.community_module_access[0].revoked_at === null)
  }

  console.log("\nCONCURRENCY: a burst of replays after the refund")
  {
    const d = db()
    await grantFromSession(d, programSession("cs_test_cccccccccc", "pi_c"), { refundCheck: notRefunded })
    await revokeRefundedProgram(d, "pi_c")
    const burst = await Promise.all(Array.from({ length: 20 }, () => grantFromSession(d, programSession("cs_test_cccccccccc", "pi_c"), { refundCheck: notRefunded })))
    check("20 replays at once: none granted", burst.every((r) => r.ok === false) && !!d.tables.community_program_access[0].revoked_at)
  }

  console.log("\nWIRING")
  {
    const learn = readCode("lib/communities/server/learn-checkout.ts")
    check("the program webhook and confirm ask Stripe by default", /refundCheck: opts\.refundCheck \?\? stripeRefundCheck/.test(learn))
    check("refunded is a final 409, unknown a 503", /"refunded" \? 409/.test(learn) && /"unknown" \? 503/.test(learn))
    const mod = readCode("lib/communities/server/module-sales.ts")
    check("the module grant asks the rule before clearing revoked_at", mod.indexOf("regrantVerdict(") > 0 && mod.indexOf("regrantVerdict(") < mod.indexOf('update({ ...row, created_at'))
    const hook = readCode("app/api/stripe/webhook/route.ts")
    check("the webhook retries only on 5xx (a 409 refusal is answered received)", /done\.ok === false && done\.status >= 500/.test(hook))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
