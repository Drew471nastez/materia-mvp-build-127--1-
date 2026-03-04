import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * POST /api/onboarding/finalize
 *
 * Atomically writes the critical onboarding fields using the service-role
 * admin client (bypasses RLS). Called at the end of creator onboarding and
 * for buyer role selection so the writes cannot silently fail due to RLS.
 *
 * Body (JSON):
 *   role: "creator" | "buyer"
 *   creatorSlug?: string   (required when role = "creator")
 *
 * Returns:
 *   { ok: true, nextPath: "/app" | "/library" }
 */
export async function POST(request: NextRequest) {
  try {
    // Verify the caller is authenticated
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { role, creatorSlug } = body as { role: "creator" | "buyer"; creatorSlug?: string }

    if (role !== "creator" && role !== "buyer") {
      return NextResponse.json({ ok: false, error: "Invalid role" }, { status: 400 })
    }

    const admin = createAdminClient()

    if (role === "buyer") {
      // Mark profile as buyer with welcome completed
      const { error } = await admin
        .from("profiles")
        .update({ is_creator: false, welcome_completed: true })
        .eq("id", user.id)

      if (error) {
        console.error("[finalize] buyer profile update error:", error)
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
      }

      return NextResponse.json({ ok: true, nextPath: "/library" })
    }

    // role === "creator"
    const slug = creatorSlug || user.email?.split("@")[0] || "creator"

    // 1. Update profiles table
    await admin
      .from("profiles")
      .update({ is_creator: true, welcome_completed: true })
      .eq("id", user.id)

    // 2. Upsert creators record with onboarding_completed = true
    const { data: existingCreator } = await admin
      .from("creators")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle()

    if (existingCreator) {
      const { error } = await admin
        .from("creators")
        .update({ onboarding_completed: true, store_published: true })
        .eq("id", existingCreator.id)

      if (error) {
        console.error("[finalize] creator update error:", error)
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
      }
    } else {
      const { error } = await admin
        .from("creators")
        .insert({
          user_id: user.id,
          slug,
          onboarding_completed: true,
          store_published: true,
        })

      if (error) {
        console.error("[finalize] creator insert error:", error)
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
      }
    }

    return NextResponse.json({ ok: true, nextPath: "/app" })
  } catch (err) {
    console.error("[finalize] unexpected error:", err)
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 })
  }
}
