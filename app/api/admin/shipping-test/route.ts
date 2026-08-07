import { NextResponse, type NextRequest } from "next/server"

import { isAdminAuthenticated } from "@/lib/admin-blog-auth"
import {
  createOrder,
  getLabelLink,
  getPrices,
  trackByAwb,
  verifyConnection,
  type EawbShipmentInput,
} from "@/lib/eawb"

/**
 * ===========================================================================
 *  SHIPPING SIMULATION — the backend half
 * ===========================================================================
 *   POST /api/admin/shipping-test   (admin session only)
 *     { "mode": "connection" }   → authenticate, create nothing
 *     { "mode": "quote", ... }   → price a shipment, create nothing
 *     { "mode": "create", ..., "confirm": "CREATE REAL SHIPMENT" }
 *     { "mode": "label", "awb": "..." }
 *     { "mode": "track", "awb": "..." }
 *
 * ---------------------------------------------------------------------------
 * Why the browser never talks to eAWB
 * ---------------------------------------------------------------------------
 * The key is a bearer credential for an account that can book couriers and
 * spend money. It is `EAWB_API_KEY` — server-only, never `NEXT_PUBLIC_*` — and
 * it is read here, used in a header, and never returned, logged or echoed. The
 * page that drives this posts to this route and gets back an already-sanitised
 * result.
 *
 * The `pk_` prefix on the key looks publishable and is not: it was issued in
 * the eAWB dashboard under "Chei API", and with it alone this route reads the
 * account's profile, its saved addresses and its wallet. Treated as a secret.
 *
 * ---------------------------------------------------------------------------
 * Why `create` needs a typed phrase
 * ---------------------------------------------------------------------------
 * The provider has no sandbox. `POST /orders` books a real courier against a
 * real account, and there is no idempotency key — a double-submit is two
 * shipments and two charges. A boolean is a default; a phrase somebody has to
 * type is a decision. `quote` runs the SAME validation against the SAME body
 * and creates nothing, so there is no reason to reach for `create` while
 * developing.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const CONFIRM_PHRASE = "CREATE REAL SHIPMENT"

/** The shape the test page posts. Everything is validated before it is used. */
type Body = {
  mode?: string
  confirm?: string
  awb?: string
  carrierId?: number
  serviceId?: number
  billingAddressId?: number
  from?: Record<string, string>
  to?: Record<string, string>
  weight?: number
  width?: number
  height?: number
  length?: number
  contents?: string
  reference?: string
  codAmount?: number
}

function num(v: unknown, fallback: number): number {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

/** Only the address fields the API knows, and only when non-empty — an empty
 *  string is not the same as an absent field to a validator. */
function address(src: Record<string, string> | undefined) {
  const out: Record<string, string> = {}
  for (const k of [
    "email",
    "phone",
    "contact",
    "company",
    "country_code",
    "county_name",
    "locality_name",
    "street_name",
    "street_number",
    "street_details",
    "postal_code",
  ] as const) {
    const v = src?.[k]
    if (typeof v === "string" && v.trim()) out[k] = v.trim()
  }
  return out
}

function shipmentFrom(body: Body): EawbShipmentInput {
  const weight = num(body.weight, 1)
  return {
    carrier_id: num(body.carrierId, 3),
    service_id: num(body.serviceId, 1),
    billing_address_id: num(body.billingAddressId, 0),
    address_from: address(body.from),
    address_to: address(body.to),
    total_weight: weight,
    parcels: [
      {
        sequence_no: 1,
        size: {
          weight,
          width: num(body.width, 25),
          height: num(body.height, 10),
          length: num(body.length, 35),
        },
      },
    ],
    parcel_content: (body.contents || "Articol Storelib").slice(0, 120),
    internal_identifier: body.reference?.slice(0, 60),
    ...(body.codAmount && body.codAmount > 0
      ? { bank_repayment_amount: body.codAmount, bank_repayment_currency: "RON" }
      : {}),
  }
}

/** Never let an upstream error carry anything but its own words. */
function failure(err: unknown) {
  const e = err as Error & { code?: string; upstreamStatus?: number }
  return NextResponse.json(
    {
      ok: false,
      code: e?.code ?? "error",
      message: e?.message ?? "Request failed",
      upstreamStatus: e?.upstreamStatus ?? null,
    },
    { status: 200 }, // the PAGE reports the failure; the request itself succeeded
  )
}

export async function POST(req: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  let body: Body = {}
  try {
    body = (await req.json()) as Body
  } catch {
    /* connection mode needs no body */
  }
  const mode = typeof body.mode === "string" ? body.mode : "connection"

  try {
    if (mode === "connection") {
      return NextResponse.json({ ok: true, mode, result: await verifyConnection() })
    }

    if (mode === "quote") {
      const { options, validatedAddresses } = await getPrices(shipmentFrom(body))
      return NextResponse.json({ ok: true, mode, options, validatedAddresses })
    }

    if (mode === "create") {
      if (body.confirm !== CONFIRM_PHRASE) {
        return NextResponse.json(
          {
            ok: false,
            code: "confirmation_required",
            message:
              `This books a real courier and charges the account. There is no sandbox. ` +
              `Send confirm: "${CONFIRM_PHRASE}" to proceed.`,
          },
          { status: 428 },
        )
      }
      const result = await createOrder(shipmentFrom(body))
      // The label is fetched straight away rather than left to a second trip:
      // an AWB whose label cannot be produced is not a usable shipment, and
      // finding that out now is the point of a test page.
      let label: { url: string | null } | null = null
      if (result.awb) {
        try {
          label = await getLabelLink(result.awb)
        } catch {
          label = null
        }
      }
      return NextResponse.json({ ok: true, mode, result, label })
    }

    if (mode === "label") {
      if (!body.awb) return NextResponse.json({ ok: false, message: "awb required" }, { status: 400 })
      return NextResponse.json({ ok: true, mode, label: await getLabelLink(body.awb) })
    }

    if (mode === "track") {
      if (!body.awb) return NextResponse.json({ ok: false, message: "awb required" }, { status: 400 })
      return NextResponse.json({ ok: true, mode, tracking: await trackByAwb(body.awb) })
    }

    return NextResponse.json({ ok: false, message: "Unknown mode" }, { status: 400 })
  } catch (err) {
    return failure(err)
  }
}
