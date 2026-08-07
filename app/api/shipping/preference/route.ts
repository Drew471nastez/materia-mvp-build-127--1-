import { NextResponse, type NextRequest } from "next/server"

import { readSessionAuth, requireVerifiedUser } from "@/lib/auth/current-user"
import {
  normalisePhone,
  readPreference,
  resolveLocker,
  savePreference,
} from "@/lib/shipping/preference"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

/**
 * ===========================================================================
 *  THE DELIVERY POINT, CHOSEN BEFORE PAYING
 * ===========================================================================
 *   GET  /api/shipping/preference            → this buyer's saved choice
 *   POST /api/shipping/preference            → save it
 *        { lockerId, contact, phone, email? }
 *
 * ---------------------------------------------------------------------------
 * Guests are the reason this looks the way it does
 * ---------------------------------------------------------------------------
 * Checkout allows buying without an account, so this cannot require a session.
 * A signed-in buyer is identified by their VERIFIED user id; a guest by the
 * email they typed. The email is only trusted as a lookup key for a row that
 * contains nothing sensitive about anyone else — a locker, a name and a phone
 * number they themselves just entered.
 *
 * It is worth being precise about what that does and does not allow. Someone
 * who knows a guest's email could overwrite that guest's saved delivery point,
 * or read the name and phone attached to it. That is a real limit, and the
 * mitigation is that it applies ONLY to guests: the moment a buyer has an
 * account, `user_id` is the key and the email column is left null, so the
 * guessable identity stops existing for them. Attaching a delivery address to
 * an order still goes through the order's own buyer match, and changing one
 * after an AWB exists is refused outright.
 *
 * The client sends a locker ID and never an address — see `resolveLocker`.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 254
}

export async function GET() {
  const supabase = await createClient()
  // A cheap session read is enough here: it only ever narrows the lookup to the
  // caller's own row, and a wrong answer returns nothing rather than somebody
  // else's data.
  const auth = await readSessionAuth(supabase)
  if (!auth.userId) return NextResponse.json({ ok: true, preference: null })

  const preference = await readPreference(createAdminClient(), { userId: auth.userId })
  return NextResponse.json({ ok: true, preference })
}

export async function POST(req: NextRequest) {
  let body: { lockerId?: number | string; contact?: string; phone?: string; email?: string } = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, code: "bad_body" }, { status: 400 })
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

  const supabase = await createClient()
  // Verified, not session-read: this id becomes the row's owner, and the write
  // goes through the admin client.
  const userId = await requireVerifiedUser(supabase)

  // Guests identify by the email they are checking out with. Signed-in buyers
  // ignore any email in the body entirely — their id is the identity.
  const email = userId ? null : String(body.email ?? "").trim().toLowerCase()
  if (!userId && (!email || !isEmail(email))) {
    return NextResponse.json(
      { ok: false, code: "email_required", message: "Adresa de email este necesară pentru livrare." },
      { status: 400 },
    )
  }

  const resolved = await resolveLocker(lockerId)
  if (!resolved.ok) {
    const message =
      resolved.code === "wrong_carrier"
        ? "Acest easybox aparține altui curier. Alege unul din rețeaua disponibilă."
        : resolved.code === "provider_unavailable"
          ? "Nu am putut verifica easybox-ul. Încearcă din nou."
          : "Easybox necunoscut."
    return NextResponse.json(
      { ok: false, code: resolved.code, message },
      { status: resolved.code === "provider_unavailable" ? 503 : 400 },
    )
  }

  const saved = await savePreference(
    createAdminClient(),
    { userId, email },
    { ...resolved.pref, contact, phone },
  )
  if (!saved.ok) {
    if (saved.notInstalled) {
      // The migration has not been run. Checkout must still work, so this is
      // reported as a soft failure the caller can proceed past.
      return NextResponse.json({ ok: false, code: "shipping_not_configured" }, { status: 503 })
    }
    console.error("[shipping/preference] save failed", { code: "write_failed" })
    return NextResponse.json({ ok: false, code: "error" }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    locker: {
      id: lockerId,
      name: resolved.name,
      address: resolved.address,
      carrier: resolved.carrier,
      locality: resolved.pref.locality,
      county: resolved.pref.county,
    },
  })
}
