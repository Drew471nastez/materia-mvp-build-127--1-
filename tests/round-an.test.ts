/**
 * ===========================================================================
 *  CURRENCY ROUND AN: THE LAST THREE GAPS BEFORE A MARKETPLACE TRIAL
 * ===========================================================================
 *   STRIPE KEYS   no checkout can write more than Stripe's 50 metadata keys:
 *                 the business is three keys, not eight, an old payment's
 *                 eight still read, and one guard before every PaymentIntent
 *                 refuses (nothing charged) rather than overflow
 *   HELD EMAILS   an email that would state an amount with no currency is
 *                 held and flagged, never sent with a guess or a bare number:
 *                 the notification engine, the receipt, the receipt copy,
 *                 the seller's sale email and the refund email
 *   WORDS         the paused purchase, its way back and the too-large refusal
 *                 in every language Storelib curates checkout words for
 */
import { readFileSync } from "node:fs"
import { stripComments } from "./_source"
import { businessFromMetadata, businessToMetadata, type BusinessDetails } from "@/lib/checkout/business"
import { DROPPABLE_METADATA_KEYS, METADATA_TOO_LARGE_MESSAGE, STRIPE_METADATA_LIMIT, fitStripeMetadata } from "@/lib/checkout/stripe-metadata"
import { packItems } from "@/lib/checkout/cart-items"
import { MAX_LINES } from "@/lib/website-builder/cart"
import { CURRENCY_UNKNOWN_HOLD, knownCurrency, moneyWithoutCurrency } from "@/lib/money/held-email"
import { RATES_PAUSED_MESSAGE } from "@/lib/money/marketplace"
import { curatedLanguages, curatedWords } from "@/lib/checkout-text/words"
import { CHECKOUT_SENTENCES } from "@/lib/markets/checkout-words.generated"
import { money as bellMoney } from "@/lib/notifications/format"
import { emailChannel } from "@/lib/notify/channels/email"
import { inAppChannel } from "@/lib/notify/channels/in-app"
import { runWork, type EngineDeps } from "@/lib/notify/engine"
import { emit } from "@/lib/notify/outbox"
import { renderEmail, renderInApp } from "@/lib/notify/templates"
import type { ChannelResult, DomainEvent, OutgoingEmail } from "@/lib/notify/types"
import { MemoryNotifyStore } from "./notify-memory-store"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `   ${JSON.stringify(detail)}`}`)
  }
}
const read = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => stripComments(read(p))

/** The keys a route's metadata object literal writes, counted from its source between `const metadata` and its closing brace. */
function literalKeys(src: string, start: string): string[] {
  const from = src.indexOf(start)
  const body = src.slice(from, src.indexOf("\n  }\n", from))
  return [...body.matchAll(/^\s{4}(?:\[([A-Z_]+)\]|([a-z_]+)):/gm)].map((m) => m[1] ?? m[2])
}

const USER = "11111111-1111-4111-8111-111111111111"
const CREATOR = "22222222-2222-4222-8222-222222222222"

class FakeProvider {
  readonly name = "fake"
  sent: OutgoingEmail[] = []
  async send(email: OutgoingEmail): Promise<ChannelResult> {
    this.sent.push(email)
    return { status: "sent", providerMessageId: `<m${this.sent.length}@mg.example.com>` }
  }
}

function world() {
  const store = new MemoryNotifyStore()
  store.users.set(USER, { email: "maker@example.com", name: "Maker" })
  store.creators.set(CREATOR, USER)
  const provider = new FakeProvider()
  const deps: EngineDeps = {
    store,
    providerName: provider.name,
    worker: "w1",
    now: () => store.clock.now,
    email: emailChannel({
      provider,
      render: renderEmail,
      baseUrl: () => "https://storelib.com",
      unsubscribeUrl: (u, c) => `https://storelib.com/api/notify/unsubscribe?u=${u}&c=${c}`,
      preferencesUrl: () => "https://storelib.com/app/settings",
      messageDomain: "mg.example.com",
    }),
    inApp: inAppChannel(store, { render: renderInApp, baseUrl: () => "https://storelib.com", now: () => store.clock.now }),
  }
  const raise = (e: Partial<DomainEvent> & Pick<DomainEvent, "name" | "key">) =>
    emit({ userId: USER, creatorId: CREATOR, payload: {}, ...e, occurredAt: new Date(store.clock.now).toISOString() }, { db: store, soon: false })
  return { store, provider, run: () => runWork(deps, 10_000), raise }
}

async function main() {
  const quiet = console.error
  console.log("Stripe's 50 metadata keys")
  {
    /* The longest business the checks let through, every character that JSON escapes. */
    const widest: BusinessDetails = {
      company: '"'.repeat(120),
      taxId: "X".repeat(32),
      country: "DE",
      line1: '"'.repeat(120),
      line2: "\\".repeat(120),
      city: '"'.repeat(80),
      postalCode: "1".repeat(20),
      region: '"'.repeat(80),
    }
    const meta = businessToMetadata(widest)
    check("a business is three keys, not eight", Object.keys(meta).length === 3, Object.keys(meta))
    check("  each under Stripe's 500 characters at its worst", Object.values(meta).every((v) => v.length <= 500), Object.values(meta).map((v) => v.length))
    check("  and reads back exactly", JSON.stringify(businessFromMetadata(meta)) === JSON.stringify(businessFromMetadata(businessToMetadata(widest))) && businessFromMetadata(meta)?.line2 === widest.line2)
    const plain: BusinessDetails = { company: "Acme GmbH", taxId: "DE123456789", country: "DE", line1: "Hauptstr. 1", line2: "", city: "Berlin", postalCode: "10115", region: "" }
    check("a plain business round-trips", JSON.stringify(businessFromMetadata(businessToMetadata(plain))) === JSON.stringify(businessFromMetadata(businessToMetadata(plain))) && businessFromMetadata(businessToMetadata(plain))?.company === "Acme GmbH")
    const legacy = { business_company: "Acme GmbH", business_tax_id: "DE123456789", business_country: "DE", business_line1: "Hauptstr. 1", business_line2: "", business_city: "Berlin", business_postal_code: "10115", business_region: "" }
    check("a payment made before the change (eight keys) still makes its invoice", businessFromMetadata(legacy)?.company === "Acme GmbH" && businessFromMetadata(legacy)?.city === "Berlin")
    check("no business, no invoice company", businessFromMetadata({}) === null && businessFromMetadata({ business: "not json" }) === null)

    const many = Object.fromEntries(Array.from({ length: 49 }, (_, i) => [`k${i}`, "v"]))
    check("under the limit nothing is touched", (() => { const f = fitStripeMetadata({ ...many, buyer_os: "iOS" }); return f.ok && f.dropped.length === 0 && Object.keys(f.metadata).length === 50 })())
    const over = { ...many, buyer_browser: "Safari", buyer_os: "iOS", buyer_device_type: "mobile" }
    const fit = fitStripeMetadata(over)
    check("over it, only the device line goes, and only as much as needed", fit.ok && fit.dropped.length === 2 && Object.keys(fit.metadata).length === STRIPE_METADATA_LIMIT && fit.dropped.every((k) => (DROPPABLE_METADATA_KEYS as readonly string[]).includes(k)), fit)
    const tooMany = Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`k${i}`, "v"]))
    check("a record that cannot fit is refused, never trimmed", fitStripeMetadata(tooMany).ok === false)

    const session = code("app/api/checkout/stripe-session/route.ts")
    const sessionKeys = literalKeys(session, "const metadata: Record<string, string> = {")
    /* The literal, both holds, the business's three keys and the marketplace record. */
    const worstSession = sessionKeys.length + 3 + 1
    check("the single-product checkout at its worst (business, code hold, sale hold, marketplace) fits", worstSession <= STRIPE_METADATA_LIMIT, { literal: sessionKeys.length, worst: worstSession })
    check("  and is checked before Stripe, with the holds let go on a refusal", /const fitted = fitStripeMetadata\(metadata\)/.test(session) && /releaseCouponHold[\s\S]{0,120}releaseSale[\s\S]{0,200}METADATA_TOO_LARGE_MESSAGE/.test(session) && session.indexOf("fitStripeMetadata(metadata)") < session.indexOf("stripe.paymentIntents.create"))
    check("  the marketplace record is always written (never squeezed out by the old < 50 check)", /if \(priced\.pricing\.context === "marketplace"\) metadata\[PRICING_METADATA_KEY\]/.test(session))

    const site = code("app/api/checkout/site/route.ts")
    const siteKeys = literalKeys(site, "const metadata: Record<string, string> = {")
    const id = "33333333-3333-4333-8333-333333333333"
    const fullBasket = packItems(Array.from({ length: MAX_LINES }, () => ({ productId: id, variantId: id, quantity: 99, priceCents: 9_999_999, discountCents: 9_999_999, taxCents: 9_999_999 })))
    /* The literal's own keys, the code's four, the tax's five, a full basket, the business's three, the sale hold. */
    const worstSite = siteKeys.filter((k) => !["coupon_id", "coupon_code", "discount_cents", "coupon_holder", "tax_cents", "tax_rate_bps", "tax_included", "tax_country", "tax_label"].includes(k)).length + 4 + 5 + Object.keys(fullBasket).length + 3 + 1
    check("the website checkout with a full 50-line basket, a code, tax and a business fits", worstSite <= STRIPE_METADATA_LIMIT, { literal: siteKeys.length, basket: Object.keys(fullBasket).length, worst: worstSite })
    check("  and is checked before Stripe too", /const fitted = fitStripeMetadata\(metadata\)/.test(site) && site.indexOf("fitStripeMetadata(metadata)") < site.indexOf("paymentIntents.create"))
  }

  console.log("\nAn amount with no currency is held, never emailed")
  {
    check("knownCurrency reads a code and nothing else", knownCurrency("ron") === "RON" && knownCurrency("") === null && knownCurrency(null) === null && knownCurrency("dollars") === null)
    check("money with no currency is caught", moneyWithoutCurrency({ amountCents: 4900 }) && moneyWithoutCurrency({ totalCents: "4900", currency: "" }) && moneyWithoutCurrency({ lines: [{ amountCents: 100 }] }))
    check("money with its currency, a free claim, or no amount is not", !moneyWithoutCurrency({ amountCents: 4900, currency: "ron" }) && !moneyWithoutCurrency({ amountCents: 0 }) && !moneyWithoutCurrency({ productTitle: "Pack" }) && !moneyWithoutCurrency(null))

    console.error = () => undefined
    const w = world()
    await w.raise({ name: "payout.failed", key: "stripe:evt_held", entityType: "payout", entityId: "po_held", payload: { amountCents: 5000 } })
    await w.run()
    const job = w.store.jobs.find((j) => j.type === "PAYOUT_FAILED")
    const delivery = job && w.store.deliveries.find((d) => d.job_id === job.id && d.channel === "email")
    check("the engine sends no email for a payout amount with no currency", w.provider.sent.length === 0, w.provider.sent.map((m) => m.subject))
    check("  and records it as held (CURRENCY_UNKNOWN)", delivery?.status === "skipped" && delivery?.skip_reason === "CURRENCY_UNKNOWN", delivery)
    const bell = w.store.bell.find((b) => b.type === "PAYOUT_FAILED")
    check("  the bell still says it, with no number in it", !!bell && !/\d/.test(String((bell as { title?: string }).title ?? "")), bell)

    const ok = world()
    await ok.raise({ name: "payout.failed", key: "stripe:evt_ok", entityType: "payout", entityId: "po_ok", payload: { amountCents: 5000, currency: "ron" } })
    await ok.run()
    check("with its currency the same email goes, in that currency", ok.provider.sent.length === 1 && /50\.00|RON|lei/.test(`${ok.provider.sent[0]?.subject} ${ok.provider.sent[0]?.text}`), ok.provider.sent[0]?.subject)
    console.error = quiet

    check("the bell never writes a bare number for an unknown currency", bellMoney(1234, null) === "" && bellMoney(1234, "") === "")

    const email = code("lib/email.tsx")
    check("the receipt is held before it is sent when its currency is unknown", /if \(model\.heldForCurrency\) \{\s*if \(logId\) await updateEmailLog\(admin, logId, "failed", CURRENCY_UNKNOWN_HOLD\)/.test(email))
    check("  the receipt copy too", /if \(model\.heldForCurrency\) \{\s*await flagHeldEmail\(\{ email: "Receipt copy"/.test(email))
    check("  the seller's sale email too", /if \(moneyWithoutCurrency\(sale\.data as Record<string, unknown>\)\) \{[\s\S]{0,300}CURRENCY_UNKNOWN_HOLD/.test(email))
    check("  and the refund email still is", /await flagHeldEmail\(\{ email: "Refund", orderId \}\)/.test(email))
    check("the receipt knows when its currency was only a display default", /currencyKnown: \/\^\[a-z\]\{3\}\$\/i\.test/.test(code("lib/receipts/load.ts")) && /heldForCurrency: v\.currencyKnown === false && v\.totalCents > 0/.test(email))
    check("the hold is written down in words a person reads", /currency is unknown/.test(CURRENCY_UNKNOWN_HOLD))
  }

  console.log("\nThe marketplace's own sentences in every curated language")
  {
    const sentences = [RATES_PAUSED_MESSAGE, "Back to the product", METADATA_TOO_LARGE_MESSAGE]
    check("each is listed for translation", sentences.every((s) => (CHECKOUT_SENTENCES as readonly string[]).includes(s)), sentences.filter((s) => !(CHECKOUT_SENTENCES as readonly string[]).includes(s)))
    const missing = curatedLanguages().flatMap((lang) => sentences.filter((s) => !curatedWords(lang)[s]).map((s) => `${lang}: ${s}`))
    check(`each has a checked translation in all ${curatedLanguages().length} curated languages`, missing.length === 0, missing)
    check("a regional browser language reads its base language", curatedWords("es-MX")[RATES_PAUSED_MESSAGE] === curatedWords("es")[RATES_PAUSED_MESSAGE])
    const page = code("app/(storelib)/checkout/page.tsx")
    check("the paused page reads the buyer's browser language", /language=\{\(await headers\(\)\)\.get\("accept-language"\)\}/.test(page) && /curatedWords\(lang\)/.test(page))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
