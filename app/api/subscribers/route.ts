import { syncPlatformsSoon } from "@/lib/contacts/checkout-contact"
import { createAdminClient } from "@/lib/supabase/admin"
import { triggerEmailFlows } from "@/lib/email"
import { NextResponse } from "next/server"
import { randomUUID } from "node:crypto"
import { rateLimit, addressSubject, emailSubject, LIMITS } from "@/lib/api/rate-limit"
import { contactSourceFrom, recordContactSource } from "@/lib/contacts/contact-source"
import { recordSignupAttribution } from "@/lib/attribution/server"

/** Deliberately plain. A clever pattern refuses addresses that work. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    const { email, creatorId, name, origin } = await request.json()

    if (!email || !creatorId) {
      return NextResponse.json({ error: "Email and creator ID are required" }, { status: 400 })
    }

    const address = String(email).toLowerCase().trim()
    if (!EMAIL.test(address)) {
      return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 })
    }

    /* Counted by address and by the address being signed up, like every
       other public sign-up route. See lib/api/rate-limit.ts. */
    const limited = await rateLimit({
      bucket: "subscribe",
      subjects: [addressSubject(request), emailSubject(address)],
      windows: LIMITS.subscribe,
      message: "That is a lot of sign-ups at once. Try again in a minute.",
    })
    if (limited) return limited

    const adminSupabase = createAdminClient()

    /**
     * THE CREATOR HAS TO EXIST. This wrote whatever id it was handed, so a
     * made-up one left an orphan row that no creator could ever see or
     * delete, and fired flows for nobody.
     */
    const { data: creator } = await adminSupabase
      .from("creators")
      .select("id")
      .eq("id", creatorId)
      .maybeSingle()
    if (!creator) {
      return NextResponse.json({ error: "Could not find creator" }, { status: 400 })
    }

    /**
     * ALREADY ON THE LIST IS NOT AN ERROR, and not a second welcome email.
     * Somebody who unsubscribed and signs up again is joining again, so
     * they are resubscribed and the welcome does go.
     */
    const { data: existing } = await adminSupabase
      .from("subscribers")
      .select("id, status, is_active")
      .eq("creator_id", creator.id)
      .eq("email", address)
      .maybeSingle()

    let welcome = true
    if (existing) {
      const onTheList = existing.status === "subscribed" && existing.is_active !== false
      if (onTheList) {
        welcome = false
      } else {
        const { error: updateError } = await adminSupabase
          .from("subscribers")
          .update({
            status: "subscribed",
            is_active: true,
            subscribed_at: new Date().toISOString(),
            unsubscribed_at: null,
            /* A new yes, from somebody who left or a buyer who never asked
               (lib/contacts/checkout-contact): the record says what it was. */
            consent_text: "Subscribed from the creator's page",
            consent_timestamp: new Date().toISOString(),
          })
          .eq("id", existing.id)
        if (updateError) {
          console.error("[subscribers] Resubscribe failed:", updateError.message)
          return NextResponse.json({ error: "Failed to subscribe" }, { status: 500 })
        }
      }
    } else {
      /**
       * WITH AN UNSUBSCRIBE TOKEN. Written without one, this row had no way
       * out of: every email to it carried no unsubscribe link, because the
       * link IS the token. The column has a default, but only where the
       * migration that added it has run.
       */
      const { error } = await adminSupabase.from("subscribers").insert({
        email: address,
        name: name || null,
        creator_id: creator.id,
        source: "creator_page",
        status: "subscribed",
        is_active: true,
        subscribed_at: new Date().toISOString(),
        consent_text: "Subscribed from the creator's page",
        consent_timestamp: new Date().toISOString(),
        unsubscribe_token: randomUUID(),
      })

      if (error) {
        // A race with another submission of the same address is a success here.
        if (error.code === "23505") return NextResponse.json({ success: true })
        console.error("[subscribers] Insert failed:", error.message)
        return NextResponse.json({ error: "Failed to subscribe" }, { status: 500 })
      }
    }

    /* The bar on a profile or on a product page, told apart by the page it
       was on; on a creator's own domain, that website. */
    const source = contactSourceFrom({ request, surface: "profile", form: "bar", sent: origin })
    await recordContactSource(adminSupabase, creator.id, address, source)
    /* The property and the visit's touches, onto the same contact (lib/attribution). */
    await recordSignupAttribution(adminSupabase, { creatorId: creator.id, email: address, source, sent: origin })
    /* Connected email platforms (Klaviyo, Brevo, MailerLite, Kit...) get it within the minute. */
    await syncPlatformsSoon(adminSupabase, creator.id)

    if (welcome) {
      try {
        await triggerEmailFlows(adminSupabase, {
          triggerType: "new_subscriber",
          creatorId: creator.id,
          recipientEmail: address,
          recipientName: name || undefined,
          source,
        })
      } catch (flowErr) {
        console.error("[subscribers] Email flow trigger error (non-fatal):", flowErr)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[subscribers] Subscribe error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
