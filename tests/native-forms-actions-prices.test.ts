import assert from "node:assert/strict"
import { priceOrder, priceCart } from "../lib/checkout/pricing"
import {
  actionHref,
  internationalPhone,
  normaliseAction,
} from "../lib/forms/actions"
import {
  validateDefinition,
  validateAnswers,
  csvCell,
} from "../lib/forms/definition"
import { formTemplate } from "../lib/forms/templates"
import { listPrice } from "../lib/pricing/list-price"
import {
  withKnownVariantPrices,
  variantPriceFacts,
  withVariantPrices,
} from "../lib/pricing/variant-price"
import { convertPriceText, pricingFor } from "../lib/markets/pricing"
import { leadCursor, beforeLead } from "../lib/forms/lead-query"
async function run() {
  const id = "aaaaaaaa-0000-4000-8000-000000000001"
  assert.equal(internationalPhone("+40 (712) 345-678"), "40712345678")
  assert.equal(internationalPhone("0040 712 345 678"), "40712345678")
  assert.equal(internationalPhone("not a phone"), null)
  const wa = actionHref({
    type: "whatsapp",
    phone: "+40712345678",
    message: "Bună! Goals & training? 💪",
  })!
  assert.equal(new URL(wa).pathname, "/40712345678")
  assert.equal(
    new URL(wa).searchParams.get("text"),
    "Bună! Goals & training? 💪",
  )
  assert.equal(
    actionHref({ type: "phone", phone: "+40712345678" }),
    "tel:+40712345678",
  )
  assert.ok(
    actionHref({
      type: "email",
      email: "coach@example.com",
      subject: "Your plan",
      message: "Hello & welcome",
    })?.includes("subject=Your+plan"),
  )
  assert.equal(actionHref({ type: "url", url: "javascript:alert(1)" }), null)
  assert.equal(
    normaliseAction({
      type: "whatsapp",
      phone: { bad: true },
      message: ["bad"],
    }),
    null,
  )
  assert.equal(
    normaliseAction({
      type: "url",
      url: "https://example.com",
      secret: "must not publish",
    })?.type,
    "url",
  )
  assert.ok(
    !(
      "secret" in
      normaliseAction({ type: "url", url: "https://example.com", secret: "x" })!
    ),
  )
  assert.ok(
    actionHref({ type: "form", form_id: id })?.includes("/request/forms/" + id),
  )
  assert.equal(actionHref({ type: "product", product_id: "invalid" }), null)
  const form = validateDefinition(formTemplate("fitness"))
  assert.equal(form.mode, "quiz")
  assert.equal(form.fields.length, 4)
  const result = validateAnswers(form, {
    goal: "strength",
    support: ["training", "nutrition"],
    name: "Radu",
    email: "RADU@example.com",
    injected: "not kept",
  })
  assert.equal(result.email, "radu@example.com")
  assert.equal(result.answers[0].value, "Build strength")
  assert.deepEqual(result.answers[1].value, ["Training", "Nutrition"])
  assert.equal(result.answers.length, 4)
  assert.throws(() =>
    validateAnswers(form, { goal: "other", name: "x", email: "x@y.com" }),
  )
  assert.throws(() =>
    validateAnswers(form, { goal: "strength", name: "x", email: "bad" }),
  )
  assert.throws(() =>
    validateDefinition({ ...form, fields: [form.fields[0], form.fields[0]] }),
  )
  assert.throws(() =>
    validateDefinition({
      ...form,
      completion: { action: { type: "url", url: "javascript:evil()" } },
    }),
  )
  const blank = validateDefinition(
    { ...form, title: "", description: "" },
    false,
  )
  assert.equal(blank.title, "")
  assert.equal(blank.description, "")
  assert.throws(() => validateDefinition({ ...form, title: "" }, true))
  assert.equal(
    csvCell('=HYPERLINK("https://evil")'),
    '"\'=HYPERLINK(""https://evil"")"',
  )
  assert.ok(csvCell(" \t+CMD").startsWith("\"'"))
  const base = { id, price_cents: 2500, compare_at_cents: 3000 }
  assert.equal(
    listPrice(
      withKnownVariantPrices(base, [{ id: "v", price_cents: 0 }]),
      (c) => `$${c / 100}`,
    ).main,
    "Free",
  )
  assert.equal(
    listPrice(
      withKnownVariantPrices(base, [
        { price_cents: 700 },
        { price_cents: 1200 },
      ]),
      (c) => `$${c / 100}`,
    ).main,
    "$7 – $12",
  )
  assert.equal(
    listPrice(withKnownVariantPrices(base, []), (c) => `$${c / 100}`).main,
    "$25",
  )
  assert.equal(
    withKnownVariantPrices(base, [
      { price_cents: 0, available: false },
      { price_cents: 1200 },
    ]).price_cents,
    1200,
  )
  assert.equal(
    variantPriceFacts([{ id: "free", price_cents: 0 }]).single_variant_id,
    "free",
  )
  let reads = 0
  const db = {
    from: () => ({
      select: () => ({
        in: async () => {
          reads++
          return {
            data: [{ id: "v", product_id: id, price_cents: 0 }],
            error: null,
          }
        },
      }),
    }),
  }
  assert.equal((await withVariantPrices(db, [base]))[0].price_cents, 0)
  assert.equal(reads, 1)
  const variantOverride = withKnownVariantPrices(
    {
      ...base,
      marketplace_usd_cents: 7000,
      marketplace_usd_approved_at: "2026-11-06",
    },
    [{ price_cents: 0 }],
  )
  assert.equal(variantOverride.marketplace_usd_cents, null)
  assert.equal(variantOverride.marketplace_usd_approved_at, null)
  const failed = {
    from: () => ({
      select: () => ({
        in: async () => ({ data: null, error: { code: "08006" } }),
      }),
    }),
  }
  assert.equal(
    (await withVariantPrices(failed, [base]))[0].variant_prices_known,
    undefined,
    "A failed variant read never claims there are no variants",
  )
  const market = pricingFor(
    {
      id: "eu",
      name: "Europe",
      currency: "EUR",
      countries: ["DE"],
      active: true,
      primary: false,
      rounding: "none",
      adjustBps: 0,
    } as any,
    "USD",
    { asOf: new Date().toISOString().slice(0, 10), rates: { USD: 1.1 } },
  )!
  assert.ok(market)
  assert.equal(
    convertPriceText("$7 – $12", market),
    `${market.format(700)} – ${market.format(1200)}`,
  )
  assert.equal(
    convertPriceText("Free – $12", market),
    `Free – ${market.format(1200)}`,
  )
  // Exercise the actual server quote functions, including omitted variant IDs.
  const quoteDb = (options: any[], failed = false) => ({
    from(table: string) {
      const filters: ((r: any) => boolean)[] = []
      const rows = () =>
        (table === "products"
          ? [
              {
                id,
                title: "Training plan",
                slug: "training",
                creator_id: id,
                type: "digital",
                status: "published",
                price_cents: 2500,
                thumbnail_url: null,
              },
            ]
          : table === "product_variants"
            ? options
            : []
        ).filter((r) => filters.every((f) => f(r)))
      const result = (single = false) => ({
        data: single ? (rows()[0] ?? null) : rows(),
        error:
          failed && table === "product_variants" ? { code: "08006" } : null,
      })
      const chain: any = new Proxy(
        {},
        {
          get(_, key) {
            if (key === "then") return (resolve: any) => resolve(result())
            if (key === "maybeSingle" || key === "single")
              return async () => result(true)
            return (...args: any[]) => {
              if (key === "eq") filters.push((r) => r[args[0]] === args[1])
              if (key === "in")
                filters.push((r) => args[1].includes(r[args[0]]))
              return chain
            }
          },
        },
      )
      return chain
    },
  })
  const freeOption = {
    id: "bbbbbbbb-0000-4000-8000-000000000001",
    product_id: id,
    name: "Free",
    price_cents: 0,
    active: true,
  }
  const paidOption = {
    ...freeOption,
    id: "cccccccc-0000-4000-8000-000000000001",
    name: "Pro",
    price_cents: 5000,
  }
  const freeQuote = await priceOrder(quoteDb([freeOption]), { productId: id })
  assert.ok(freeQuote.ok)
  if (freeQuote.ok) {
    assert.equal(freeQuote.totals.baseCents, 0)
    assert.equal(freeQuote.variant?.id, freeOption.id)
  }
  const paidQuote = await priceOrder(quoteDb([freeOption, paidOption]), {
    productId: id,
    variantId: paidOption.id,
  })
  assert.ok(paidQuote.ok)
  if (paidQuote.ok) assert.equal(paidQuote.totals.baseCents, 5000)
  assert.equal(
    (await priceOrder(quoteDb([freeOption, paidOption]), { productId: id })).ok,
    false,
  )
  assert.equal(
    (
      await priceOrder(quoteDb([{ ...freeOption, active: false }]), {
        productId: id,
      })
    ).ok,
    false,
  )
  const unavailable = await priceOrder(quoteDb([], true), { productId: id })
  assert.equal(unavailable.ok, false)
  if (unavailable.ok === false) assert.equal(unavailable.status, 503)
  const freeCart = await priceCart(quoteDb([freeOption]), {
    items: [{ productId: id, quantity: 1 }],
    keepFree: true,
  })
  assert.ok(freeCart.ok)
  if (freeCart.ok) {
    assert.equal(freeCart.lines[0].item.priceCents, 0)
    assert.equal(freeCart.lines[0].item.variantId, freeOption.id)
  }
  assert.equal(
    (
      await priceCart(quoteDb([freeOption, paidOption]), {
        items: [{ productId: id, quantity: 1 }],
        keepFree: true,
      })
    ).ok,
    false,
  )
  const cursor = leadCursor({ id, submitted_at: "2026-11-06T10:00:00.000Z" })
  let filter = ""
  beforeLead(
    {
      or: (s: string) => {
        filter = s
      },
    },
    cursor,
  )
  assert.ok(filter.includes("id.lt." + id))
  assert.throws(() =>
    beforeLead({}, "2026-11-06T00:00:00Z),owner_id.neq.x~" + id),
  )
  console.log(
    "Native forms/actions/prices passed: encoded CTA actions, templates, server answer validation, draft empty text, CSV safety, canonical zero/ranges, unavailable variants and safe cursors",
  )
}
void run().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
