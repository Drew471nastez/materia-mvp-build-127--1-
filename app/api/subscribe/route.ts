import { syncPlatformsSoon } from "@/lib/contacts/checkout-contact"
import { type NextRequest, NextResponse, after } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { rateLimit, addressSubject, emailSubject, LIMITS } from "@/lib/api/rate-limit"
import { triggerEmailFlows } from "@/lib/email"
import { randomUUID } from "node:crypto"
import { contactSourceFrom, recordContactSource } from "@/lib/contacts/contact-source"
import { recordSignupAttribution } from "@/lib/attribution/server"
import { deliverSignup, pageSignup } from "@/lib/onepage/integrations/deliver-server"
import { forwardLead } from "@/lib/analytics/destinations/forward-server"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, name, source, source_id, creator_id } = body
    const origin = contactSourceFrom({ request, surface: source === "onepage" ? "onepage" : "profile", form: "popup", sent: body.origin })

    // Validate email
    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 })
    }

    /* Counted by address and by the address being signed up, so neither a
       script from one machine nor one rotating through many can fill a
       creator's list. See lib/api/rate-limit.ts. */
    const limited = await rateLimit({
      bucket: "subscribe",
      subjects: [addressSubject(request), emailSubject(email)],
      windows: LIMITS.subscribe,
      message: "That is a lot of sign-ups at once. Try again in a minute.",
    })
    if (limited) return limited

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const normalizedEmail = email.toLowerCase().trim()

    if (!emailRegex.test(normalizedEmail)) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 })
    }

    // Validate source
    if (!source) {
      return NextResponse.json({ error: "Source is required" }, { status: 400 })
    }

    // Validate we have some identifier
    if (!creator_id && !source_id) {
      return NextResponse.json({ error: "Creator or source ID is required" }, { status: 400 })
    }

    const adminSupabase = createAdminClient()

    // STEP 1: Resolve the creator_id
    // We need to find the actual creator record in the creators table
    let resolvedCreatorId: string | null = null

    // Method 1: Direct creator_id lookup
    if (creator_id) {
      const { data: directCreator } = await adminSupabase
        .from("creators")
        .select("id")
        .eq("id", creator_id)
        .maybeSingle()

      if (directCreator) {
        resolvedCreatorId = directCreator.id
      } else {
        // Method 2: Try as user_id
        const { data: creatorByUserId } = await adminSupabase
          .from("creators")
          .select("id")
          .eq("user_id", creator_id)
          .maybeSingle()

        if (creatorByUserId) {
          resolvedCreatorId = creatorByUserId.id
        }
      }
    }

    // Method 3: If still not found and we have source_id from onepage, look it up
    if (!resolvedCreatorId && source === "onepage" && source_id) {
      const { data: onepageData } = await adminSupabase
        .from("onepages")
        .select("seller_id, creator_id, owner_id")
        .eq("id", source_id)
        .maybeSingle()

      if (onepageData) {
        // Try seller_id first
        if (onepageData.seller_id) {
          const { data: sellerCreator } = await adminSupabase
            .from("creators")
            .select("id")
            .eq("id", onepageData.seller_id)
            .maybeSingle()

          if (sellerCreator) {
            resolvedCreatorId = sellerCreator.id
          }
        }

        // Try creator_id
        if (!resolvedCreatorId && onepageData.creator_id) {
          const { data: pageCreator } = await adminSupabase
            .from("creators")
            .select("id")
            .eq("id", onepageData.creator_id)
            .maybeSingle()

          if (pageCreator) {
            resolvedCreatorId = pageCreator.id
          }
        }

        // Try owner_id as user_id
        if (!resolvedCreatorId && onepageData.owner_id) {
          const { data: ownerCreator } = await adminSupabase
            .from("creators")
            .select("id")
            .eq("user_id", onepageData.owner_id)
            .maybeSingle()

          if (ownerCreator) {
            resolvedCreatorId = ownerCreator.id
          }
        }
      }
    }

    // If we still can't find a creator, return error
    if (!resolvedCreatorId) {
      console.error("Could not resolve creator. Input:", { creator_id, source, source_id })
      return NextResponse.json({ error: "Could not find creator" }, { status: 400 })
    }

    // STEP 2: Check if already subscribed
    const { data: existingSubscriber } = await adminSupabase
      .from("subscribers")
      .select("id, status, is_active")
      .eq("creator_id", resolvedCreatorId)
      .eq("email", normalizedEmail)
      .maybeSingle()

    if (existingSubscriber) {
      // Already subscribed and active
      if (existingSubscriber.status === "subscribed" && existingSubscriber.is_active) {
        return NextResponse.json({ 
          success: true, 
          message: "Already subscribed",
          alreadySubscribed: true 
        }, { status: 200 })
      }

      // Resubscribe if previously unsubscribed
      const { error: updateError } = await adminSupabase
        .from("subscribers")
        .update({
          status: "subscribed",
          is_active: true,
          subscribed_at: new Date().toISOString(),
          unsubscribed_at: null,
          updated_at: new Date().toISOString(),
          /* A new yes, from somebody who left or a buyer who never asked
             (lib/contacts/checkout-contact): the record says what it was. */
          consent_text: "I agree to receive email updates",
          consent_timestamp: new Date().toISOString(),
        })
        .eq("id", existingSubscriber.id)

      if (updateError) {
        console.error("Error resubscribing:", updateError)
        return NextResponse.json({ error: "Failed to resubscribe" }, { status: 500 })
      }

      await recordContactSource(adminSupabase, resolvedCreatorId, normalizedEmail, origin)
      await recordSignupAttribution(adminSupabase, { creatorId: resolvedCreatorId, email: normalizedEmail, source: origin, sent: body.origin })
      /* Connected email platforms (Klaviyo, Brevo, MailerLite, Kit...) get it within the minute. */
      await syncPlatformsSoon(adminSupabase, resolvedCreatorId)

      /* Joining again is joining: the welcome goes, as it did the first time. */
      try {
        await triggerEmailFlows(adminSupabase, {
          triggerType: "new_subscriber",
          creatorId: resolvedCreatorId,
          recipientEmail: normalizedEmail,
          recipientName: name || undefined,
          source: origin,
        })
      } catch (flowErr) {
        console.error("[subscribe] Email flow trigger error (non-fatal):", flowErr)
      }

      /* A OnePage's subscribe button: its connected tools get the signup too (lib/onepage/integrations). */
      if (source === "onepage") after(() => deliverSignup(adminSupabase, resolvedCreatorId, pageSignup({ email: normalizedEmail, name, form: "subscribe", onepageId: typeof source_id === "string" ? source_id : null, pageUrl: request.headers.get("referer") })))

      return NextResponse.json({
        success: true,
        message: "Resubscribed successfully"
      }, { status: 200 })
    }

    // STEP 3: Create new subscriber
    const { data: newSubscriber, error: insertError } = await adminSupabase
      .from("subscribers")
      .insert({
        email: normalizedEmail,
        name: name || null,
        source: source,
        source_id: source_id || null,
        creator_id: resolvedCreatorId,
        status: "subscribed",
        is_active: true,
        subscribed_at: new Date().toISOString(),
        consent_text: "I agree to receive email updates",
        consent_timestamp: new Date().toISOString(),
        /* The unsubscribe link IS this token. A row written without one can
           be emailed and never left. */
        unsubscribe_token: randomUUID(),
      })
      .select("id, email")
      .single()

    if (insertError) {
      console.error("Error inserting subscriber:", insertError)
      
      // Check if it's a unique constraint violation (race condition)
      if (insertError.code === "23505") {
        return NextResponse.json({ 
          success: true, 
          message: "Already subscribed",
          alreadySubscribed: true 
        }, { status: 200 })
      }
      
      return NextResponse.json({ error: "Failed to subscribe" }, { status: 500 })
    }

    await recordContactSource(adminSupabase, resolvedCreatorId, normalizedEmail, origin)
    /* The property and the visit's touches, onto the same contact (lib/attribution). */
    await recordSignupAttribution(adminSupabase, { creatorId: resolvedCreatorId, email: normalizedEmail, source: origin, sent: body.origin })
    /* Connected email platforms (Klaviyo, Brevo, MailerLite, Kit...) get it within the minute. */
    await syncPlatformsSoon(adminSupabase, resolvedCreatorId)

    /**
     * THE CREATOR'S WELCOME EMAIL. This route wrote the subscriber and
     * stopped, so a person who joined here got nothing while the same
     * person joining through a built site got the welcome. Every capture
     * path fires the same trigger now. A failure here is not the visitor's
     * problem: they are subscribed either way.
     */
    try {
      await triggerEmailFlows(adminSupabase, {
        triggerType: "new_subscriber",
        creatorId: resolvedCreatorId,
        recipientEmail: normalizedEmail,
        recipientName: name || undefined,
        source: origin,
      })
    } catch (flowErr) {
      console.error("[subscribe] Email flow trigger error (non-fatal):", flowErr)
    }

    if (source === "onepage") after(() => deliverSignup(adminSupabase, resolvedCreatorId, pageSignup({ email: normalizedEmail, name, form: "subscribe", onepageId: typeof source_id === "string" ? source_id : null, pageUrl: request.headers.get("referer") })))
    /* Any other newsletter signup: a lead for the store's analytics tools (lib/analytics/destinations); a OnePage's goes through deliverSignup above. */
    else {
      const pageUrl = request.headers.get("referer")
      after(async () => {
        await forwardLead(adminSupabase, resolvedCreatorId, { email: normalizedEmail, form: "newsletter", key: `newsletter|${normalizedEmail}`, url: pageUrl })
      })
    }

    return NextResponse.json({
      success: true,
      message: "Subscribed successfully",
      subscriber: { id: newSubscriber.id, email: newSubscriber.email }
    }, { status: 201 })

  } catch (error) {
    console.error("Subscribe API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
