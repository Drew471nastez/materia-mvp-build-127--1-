import { NextResponse, type NextRequest } from "next/server"

import { requireVerifiedUser } from "@/lib/auth/current-user"
import { listFixedLocations } from "@/lib/eawb"
import { splitStreet } from "@/lib/shipping/compare"
import { autoAwbEnabled, createAwbForOrder } from "@/lib/shipping/create-awb"
import { isMissingShippingSchema, resolveOrderParty } from "@/lib/shipping/order-access"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

/**
 * ===========================================================================
 *  WHERE THE PARCEL GOES — set by the buyer, on their own order
 * ===========================================================================
 *   POST /api/shipping/address  { orderId, lockerId, contact, phone }
 *
 * ---------------------------------------------------------------------------
 * The client sends a locker ID. It does NOT send an address.
 * ---------------------------------------------------------------------------
 * This is the important decision in this file. The obvious design is to let the
 * picker post the street and locality it already rendered, and save those. That
 * design lets anyone post a locker id from one city with the street of another,
 * and the courier then has a request that passes validation and delivers
 * somewhere nobody chose.
 *
 * So the id is the only address input that is trusted, and the street, locality
 * and county are looked up SERVER-SIDE from the provider's own list of fixed
 * locations — the same list the picker searched, fetched again here. If the id
 * is not in that list, the request is rejected. The address stored on the order
 * is therefore always the courier's own record of that locker, and the two can
 * never disagree.
 *
 * `contact` and `phone` are genuinely the buyer's to supply — the courier texts
 * that number the pickup code — so they are taken from the request, bounded and
 * validated, but never used to derive a location.
 *
 * ---------------------------------------------------------------------------
 * Once an AWB exists, this is closed
 * ---------------------------------------------------------------------------
 * The destination is printed on a label that is already in the courier's
 * system. Changing our copy of it after that point would leave the order
 * describing a delivery that is not the one happening — worse than not being
 * able to edit at all, because it looks authoritative.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Romanian mobile numbers, the shape couriers accept: 07xxxxxxxx or +407xxxxxxxx. */
function normalisePhone(raw: string): string | null {
  const digits = raw.replace(/[\s.\-()]/g, "")
  if (/^07\d{8}$/.test(digits)) return digits
  if (/^\+407\d{8}$/.test(digits)) return `0${digits.slice(3)}`
  if (/^407\d{8}$/.test(digits)) return `0${digits.slice(2)}`
  return null
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  // Verified, not session-read: the id below decides who may rewrite a delivery
  // address, and it is handed to the admin client, which bypasses RLS.
  const userId = await requireVerifiedUser(supabase)
  if (!userId) return NextResponse.json({ ok: false, code: "auth_required" }, { status: 401 })

  let body: { orderId?: string; lockerId?: number | string; contact?: string; phone?: string } = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, code: "bad_body" }, { status: 400 })
  }

  const orderId = String(body.orderId ?? "")
  if (!UUID_RE.test(orderId)) {
    return NextResponse.json({ ok: false, code: "bad_order_id" }, { status: 400 })
  }

  const lockerId = Number(body.lockerId)
  if (!Number.isInteger(lockerId) || lockerId <= 0) {
    return NextResponse.json({ ok: false, code: "bad_locker" }, { status: 400 })
  }

  const contact = String(body.contact ?? "").trim().slice(0, 80)
  if (contact.length < 3) {
    return NextResponse.json({ ok: false, code: "bad_contact", message: "Nume prea scurt." }, { status: 400 })
  }

  const phone = normalisePhone(String(body.phone ?? ""))
  if (!phone) {
    return NextResponse.json(
      { ok: false, code: "bad_phone", message: "Număr de telefon invalid (ex. 0712345678)." },
      { status: 400 },
    )
  }

  const resolved = await resolveOrderParty(orderId, userId)
  // A stranger and a nonexistent order get the same answer, so order ids cannot
  // be probed for existence.
  if (!resolved.ok) {
    if (resolved.reason === "error") {
      return NextResponse.json({ ok: false, code: "error" }, { status: 500 })
    }
    return NextResponse.json({ ok: false, code: "not_found" }, { status: 404 })
  }
  // Only the buyer chooses where their own parcel goes. A seller must not be
  // able to redirect it.
  if (resolved.party !== "buyer") {
    return NextResponse.json({ ok: false, code: "not_found" }, { status: 404 })
  }
  if (resolved.schema === "absent") {
    return NextResponse.json({ ok: false, code: "shipping_not_configured" }, { status: 503 })
  }
  if (resolved.order.awb_number) {
    return NextResponse.json(
      { ok: false, code: "already_shipped", message: "Coletul are deja AWB — adresa nu mai poate fi schimbată." },
      { status: 409 },
    )
  }

  // The locker's real address, from the provider — not from the request.
  let locker
  try {
    const all = await listFixedLocations("RO")
    locker = all.find((l) => Number(l.id) === lockerId)
  } catch {
    return NextResponse.json(
      { ok: false, code: "provider_unavailable", message: "Nu am putut verifica easybox-ul. Încearcă din nou." },
      { status: 503 },
    )
  }
  if (!locker) {
    return NextResponse.json({ ok: false, code: "unknown_locker" }, { status: 400 })
  }

  // Shared with the carrier comparison rather than re-derived here. This split
  // had a bug worth not having twice: "Str. Sergent Pechiu Ion 3-7" came back
  // as street "…Ion 3-" and number "7", and an address with no number at all
  // produced an EMPTY street_number, which the provider rejects outright.
  const address = String(locker.address ?? "").trim()
  const { street, streetNumber: streetNo } = splitStreet(address, (locker.name || "").trim() || "Easybox")

  const admin = createAdminClient()
  const { error } = await admin
    .from("orders")
    .update({
      ship_contact: contact,
      ship_phone: phone,
      ship_country_code: locker.country_code || "RO",
      ship_county: locker.county_name || null,
      ship_locality: locker.locality_name || null,
      ship_street: street,
      ship_street_no: streetNo || null,
      ship_details: (locker.name || "").trim() || null,
      ship_fixed_location_id: lockerId,
      shipping_status: resolved.order.shipping_status || "awaiting_shipment",
    })
    .eq("id", orderId)
    // Re-assert the precondition at write time: between the read above and this
    // update, the payment webhook may have booked the shipment. Without this the
    // last writer would silently overwrite the address the label was printed
    // from.
    .is("awb_number", null)

  if (error) {
    if (isMissingShippingSchema(error)) {
      return NextResponse.json({ ok: false, code: "shipping_not_configured" }, { status: 503 })
    }
    console.error("[shipping/address] save failed", { orderId, code: error.code })
    return NextResponse.json({ ok: false, code: "error" }, { status: 500 })
  }

  // The destination now exists, so the shipment can be booked. This is the
  // Vinted moment: the buyer picks a locker and the seller's label appears
  // without anyone asking for it.
  //
  // Behind a flag, and OFF by default — see `autoAwbEnabled`. Until an operator
  // has watched one label come out correctly and funded the prepaid wallet, the
  // seller presses the button themselves.
  //
  // Awaited rather than fired and forgotten: a serverless function that returns
  // may be frozen mid-flight, and a half-executed booking is the one thing this
  // integration must never produce. The provider call is a couple of seconds
  // and the buyer is already waiting on a save.
  let awbCreated = false
  if (autoAwbEnabled()) {
    try {
      const created = await createAwbForOrder(orderId)
      awbCreated = created.ok
      if (!created.ok) {
        // Not surfaced to the buyer: booking is the platform's job, not theirs,
        // and the order is already recorded as failed for a retry. Telling them
        // "provider_error" would be alarming and unactionable.
        console.error("[shipping/address] auto-AWB failed", { orderId, code: created.code })
      }
    } catch (e) {
      console.error("[shipping/address] auto-AWB threw", { orderId, message: (e as Error)?.message })
    }
  }

  return NextResponse.json({
    ok: true,
    awbCreated,
    locker: {
      id: lockerId,
      name: (locker.name || "").trim(),
      address,
      locality: locker.locality_name,
      county: locker.county_name,
      carrier: locker.carrier_name,
    },
  })
}
