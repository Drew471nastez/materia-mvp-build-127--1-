import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { cookies } from "next/headers"

const GUEST_ID_COOKIE = "materia_guest_id"

// POST - Merge guest wishlist into user wishlist
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: "Must be logged in" }, { status: 401 })
    }
    
    const cookieStore = await cookies()
    const guestId = cookieStore.get(GUEST_ID_COOKIE)?.value
    
    if (!guestId) {
      return NextResponse.json({ success: true, merged: 0 })
    }
    
    /* The shared factory: every request carries a deadline (lib/net/deadline.ts). */
    const adminClient = createAdminClient()
    
    // Get all guest wishlist items
    const { data: guestItems, error: fetchError } = await adminClient
      .from("wishlist_items")
      .select("product_id")
      .eq("guest_id", guestId)
      .is("user_id", null)
    
    if (fetchError) {
      console.error("Error fetching guest wishlist:", fetchError)
      return NextResponse.json({ error: "Failed to fetch guest wishlist" }, { status: 500 })
    }
    
    if (!guestItems || guestItems.length === 0) {
      // Clear guest cookie
      const response = NextResponse.json({ success: true, merged: 0 })
      response.cookies.delete(GUEST_ID_COOKIE)
      return response
    }
    
    // Get existing user wishlist to avoid duplicates
    const { data: userItems } = await adminClient
      .from("wishlist_items")
      .select("product_id")
      .eq("user_id", user.id)
    
    const existingProductIds = new Set((userItems || []).map(item => item.product_id))
    
    // Filter out duplicates
    const newItems = guestItems.filter(item => !existingProductIds.has(item.product_id))
    
    let mergedCount = 0
    
    // Insert new items into user's wishlist
    if (newItems.length > 0) {
      const { error: insertError } = await adminClient
        .from("wishlist_items")
        .insert(
          newItems.map(item => ({
            user_id: user.id,
            product_id: item.product_id,
          }))
        )
      
      if (insertError) {
        console.error("Error merging wishlist:", insertError)
        // Continue to delete guest items even if some merge failed
      } else {
        mergedCount = newItems.length
      }
    }
    
    // Delete guest wishlist items
    await adminClient
      .from("wishlist_items")
      .delete()
      .eq("guest_id", guestId)
      .is("user_id", null)
    
    // Clear guest cookie
    const response = NextResponse.json({ success: true, merged: mergedCount })
    response.cookies.delete(GUEST_ID_COOKIE)
    return response
  } catch (err) {
    console.error("Wishlist merge error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
