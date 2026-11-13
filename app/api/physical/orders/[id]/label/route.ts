import { NextResponse } from "next/server"
import { sellerOrderNumber } from "@/lib/orders/order-number-server"
import { isUuid, physicalCaller, physicalJson, readBody } from "@/lib/physical/auth"
import { checkoutOfOrderRow } from "@/lib/physical/orders-server"
import { rateLimit } from "@/lib/api/rate-limit"
import { recordActivity } from "@/lib/activity/log-server"
import { orderNumberOf } from "@/lib/receipts/rules"
import { storeIdentity } from "@/lib/store/identity-server"
import { buyLabel, labelDocument, labelOptions, listLabels, quoteLabel, shipLabel, voidLabel } from "@/lib/integrations/shipping/labels-server"
import { realLabelDeps } from "@/lib/integrations/shipping/shipping-deps-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
/* A purchase reads the rate back, buys (a carrier can take half a minute) and ships the items: its own limit, said here. */
export const maxDuration = 60

/**
 * BUY A LABEL for one order (lib/integrations/shipping/labels-server.ts).
 *
 *   GET   ?locationId=  the connected label apps, the packages, the weight,
 *                       from and to, and the order's labels
 *         ?only=labels  the order's labels alone
 *         ?print=<id>   Print label: the label as the provider has it now
 *                       (its address expires, so it is asked for each time),
 *                       opened by a redirect; &doc=invoice for the
 *                       commercial invoice of a parcel that crossed customs
 *   POST  rates         a quote from Shippo or EasyPost for the chosen items,
 *                       the address checked
 *         buy           the chosen rate, read back from the provider, bought;
 *                       the items ship with its tracking
 *         ship          a bought label left without a shipment (its shipment
 *                       was cancelled, or saving it failed): the items ship
 *                       with its tracking
 *         void          a label not used yet, refunded; its shipment cancelled
 *
 * The id is the order's (its checkout) or any of its lines', as on the
 * order's own route.
 */
async function checkoutOf(db: any, creatorId: string, id: string): Promise<string | null> {
  const { data } = await db.from("commerce_checkouts").select("id").eq("id", id).eq("creator_id", creatorId).maybeSingle()
  return data?.id ?? (await checkoutOfOrderRow(db, creatorId, id))
}

const locationOf = (v: unknown) => (isUuid(v) ? v : null)
const itemsOf = (v: unknown) =>
  (Array.isArray(v) ? v : [])
    .filter((i) => isUuid(i?.orderId) && Number.isInteger(Number(i?.quantity)) && Number(i.quantity) > 0)
    .map((i) => ({ orderId: String(i.orderId), quantity: Math.min(10_000, Number(i.quantity)) }))

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await physicalCaller("orders", { read: true })
  if (c instanceof NextResponse) return c
  const { id } = await params
  if (!isUuid(id)) return physicalJson({ error: "Not found." }, 404)
  const checkoutId = await checkoutOf(c.db, c.creatorId, id)
  if (!checkoutId) return physicalJson({ error: "Not found." }, 404)
  const url = new URL(request.url)
  /* Print label, or the commercial invoice: a redirect to the document, read from the provider now. */
  const print = url.searchParams.get("print")
  if (print !== null) {
    if (!isUuid(print)) return physicalJson({ error: "Not found." }, 404)
    const limited = await rateLimit({ bucket: "physical-label-print", subjects: [`creator:${c.creatorId}`], windows: [{ limit: 60, seconds: 60 }], message: "That is a lot of labels at once. Wait a minute and try again." })
    if (limited) return limited
    const doc = await labelDocument(c.db, c.creatorId, checkoutId, print, url.searchParams.get("doc") === "invoice" ? "invoice" : "label")
    /* Opened in a tab of its own, so what went wrong is a sentence to read, not a JSON body. */
    if (doc.ok === false) return new NextResponse(doc.error, { status: doc.status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" } })
    return new NextResponse(null, { status: 302, headers: { Location: doc.url, "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } })
  }
  /* The shipment cards: only the labels, to print or void. */
  if (url.searchParams.get("only") === "labels") return physicalJson(await listLabels(c.db, c.creatorId, checkoutId))
  const store = await storeIdentity(c.db, c.creatorId, { logoOnly: true })
  const out = await labelOptions(c.db, c.creatorId, checkoutId, { locationId: locationOf(url.searchParams.get("locationId")), storeName: store.name }, realLabelDeps)
  if ("error" in out) return physicalJson({ error: out.error }, out.status ?? 400)
  return physicalJson(out)
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await physicalCaller("orders")
  if (c instanceof NextResponse) return c
  const { id } = await params
  if (!isUuid(id)) return physicalJson({ error: "Not found." }, 404)
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  /* Each quote and each purchase is a call to the seller's own account at Shippo or EasyPost: a packing afternoon, never a script. */
  const limited = await rateLimit({ bucket: "physical-label", subjects: [`creator:${c.creatorId}`], windows: [{ limit: 40, seconds: 60 }, { limit: 2000, seconds: 86400 }], message: "That is a lot of label requests at once. Wait a minute and try again." })
  if (limited) return limited
  const checkoutId = await checkoutOf(c.db, c.creatorId, id)
  if (!checkoutId) return physicalJson({ error: "Not found." }, 404)

  if (body.action === "rates") {
    const store = await storeIdentity(c.db, c.creatorId, { logoOnly: true })
    const custom = body.custom && typeof body.custom === "object" ? (body.custom as Record<string, unknown>) : null
    const out = await quoteLabel(c.db, c.creatorId, checkoutId, { provider: body.provider, locationId: locationOf(body.locationId), packageId: body.packageId, custom, grams: body.grams, storeName: store.name, items: itemsOf(body.items) }, realLabelDeps)
    if ("error" in out) return physicalJson({ error: out.error }, out.status ?? 400)
    return physicalJson(out)
  }
  if (body.action === "buy") {
    const out = await buyLabel(c.db, c.creatorId, checkoutId, { provider: body.provider, shipmentId: body.shipmentId, rateId: body.rateId, locationId: locationOf(body.locationId), items: itemsOf(body.items), notifyBuyer: body.notifyBuyer !== false, packageName: typeof body.packageName === "string" ? body.packageName : null }, realLabelDeps)
    if (out.ok === false) return physicalJson({ error: out.error, label: out.label ?? null }, out.status ?? 400)
    await recordActivity(c.db, c, { action: "order.fulfilled", subjectType: "order", subjectId: checkoutId, subjectLabel: (await sellerOrderNumber(c.db, c.creatorId, { checkoutId })) ?? `#${orderNumberOf(checkoutId)}` })
    return physicalJson({ order: out.order, label: out.label })
  }
  if (body.action === "ship") {
    if (!isUuid(body.labelId)) return physicalJson({ error: "Not found." }, 404)
    const out = await shipLabel(c.db, c.creatorId, checkoutId, body.labelId, { notifyBuyer: body.notifyBuyer === true }, realLabelDeps)
    if (out.ok === false) return physicalJson({ error: out.error, label: out.label ?? null }, out.status ?? 400)
    await recordActivity(c.db, c, { action: "order.fulfilled", subjectType: "order", subjectId: checkoutId, subjectLabel: (await sellerOrderNumber(c.db, c.creatorId, { checkoutId })) ?? `#${orderNumberOf(checkoutId)}` })
    return physicalJson({ order: out.order, label: out.label })
  }
  if (body.action === "void") {
    if (!isUuid(body.labelId)) return physicalJson({ error: "Not found." }, 404)
    /* Only a label of this order: the id in the address is the order the seller is looking at. */
    const out = await voidLabel(c.db, c.creatorId, body.labelId, realLabelDeps, { checkoutId })
    if (out.ok === false) return physicalJson({ error: out.error }, out.status ?? 400)
    await recordActivity(c.db, c, { action: "order.shipment", subjectType: "order", subjectId: checkoutId, subjectLabel: (await sellerOrderNumber(c.db, c.creatorId, { checkoutId })) ?? `#${orderNumberOf(checkoutId)}` })
    return physicalJson({ order: out.order, label: out.label })
  }
  return physicalJson({ error: "Unknown action." }, 400)
}
