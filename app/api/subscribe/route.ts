import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { v4 as uuidv4 } from "uuid"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, name, source, source_id, creator_id, consent_text } = body

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 })
    }

    if (!source) {
      return NextResponse.json({ error: "Source is required" }, { status: 400 })
    }

    if (!creator_id) {
      return NextResponse.json({ error: "Creator ID is required" }, { status: 400 })
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const normalizedEmail = email.toLowerCase().trim()

    if (!emailRegex.test(normalizedEmail)) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 })
    }

    const adminSupabase = createAdminClient()

    // STEP 1: Resolve the creator_id
    // The incoming creator_id could be:
    // 1. An actual creator ID (UUID from creators table)
    // 2. A user_id (UUID from auth.users)
    // 3. An owner_id from onepages table
    // We need to find the correct creator record
    
    let resolvedCreatorId: string | null = null

    // First, check if it's directly a creator ID
    const { data: directCreator } = await adminSupabase
      .from("creators")
      .select("id")
      .eq("id", creator_id)
      .single()

    if (directCreator) {
      resolvedCreatorId = directCreator.id
    } else {
      // Try to find creator by user_id
      const { data: creatorByUserId } = await adminSupabase
        .from("creators")
        .select("id")
        .eq("user_id", creator_id)
        .single()

      if (creatorByUserId) {
        resolvedCreatorId = creatorByUserId.id
      } else if (source === "onepage" && source_id) {
        // If coming from onepage, try to get creator from the onepage record
        const { data: onepageData } = await adminSupabase
          .from("onepages")
          .select("seller_id, creator_id, owner_id")
          .eq("id", source_id)
          .single()

        if (onepageData) {
          // Try seller_id first, then creator_id
          const possibleCreatorId = onepageData.seller_id || onepageData.creator_id
          
          if (possibleCreatorId) {
            // Verify this is a valid creator
            const { data: verifiedCreator } = await adminSupabase
              .from("creators")
              .select("id")
              .eq("id", possibleCreatorId)
              .single()

            if (verifiedCreator) {
              resolvedCreatorId = verifiedCreator.id
            }
          }

          // If still not found, try to find creator by owner_id
          if (!resolvedCreatorId && onepageData.owner_id) {
            const { data: creatorByOwner } = await adminSupabase
              .from("creators")
              .select("id")
              .eq("user_id", onepageData.owner_id)
              .single()

            if (creatorByOwner) {
              resolvedCreatorId = creatorByOwner.id
            }
          }
        }
      }
    }

    if (!resolvedCreatorId) {
      console.error("Could not resolve creator_id:", creator_id)
      return NextResponse.json({ error: "Invalid creator" }, { status: 400 })
    }

    // STEP 2: Check if subscriber already exists
    const { data: existingSubscriber } = await adminSupabase
      .from("subscribers")
      .select("id, status")
      .eq("creator_id", resolvedCreatorId)
      .eq("email", normalizedEmail)
      .single()

    if (existingSubscriber) {
      // If already subscribed, return success
      if (existingSubscriber.status === "subscribed") {
        return NextResponse.json({ success: true, message: "Already subscribed" }, { status: 200 })
      }

      // If previously unsubscribed, resubscribe them
      const { error: updateError } = await adminSupabase
        .from("subscribers")
        .update({
          status: "subscribed",
          is_active: true,
          subscribed_at: new Date().toISOString(),
          unsubscribed_at: null,
        })
        .eq("id", existingSubscriber.id)

      if (updateError) {
        console.error("Error resubscribing:", updateError)
        return NextResponse.json({ error: "Failed to resubscribe" }, { status: 500 })
      }

      return NextResponse.json({ success: true, message: "Resubscribed successfully" }, { status: 200 })
    }

    // STEP 3: Insert new subscriber
    const unsubscribeToken = uuidv4()

    const { data, error } = await adminSupabase
      .from("subscribers")
      .insert({
        email: normalizedEmail,
        name: name || null,
        source,
        source_id: source_id || null,
        creator_id: resolvedCreatorId,
        status: "subscribed",
        is_active: true,
        subscribed_at: new Date().toISOString(),
        consent_text: consent_text || "I agree to receive email updates",
        consent_timestamp: new Date().toISOString(),
        unsubscribe_token: unsubscribeToken,
      })
      .select()
      .single()

    if (error) {
      console.error("Error saving subscriber:", error)
      return NextResponse.json({ error: "Failed to subscribe" }, { status: 500 })
    }

    return NextResponse.json({ success: true, subscriber: data }, { status: 201 })
  } catch (error) {
    console.error("Subscribe error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
