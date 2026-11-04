import { NextResponse } from "next/server"
import { teamStoreIdFor } from "@/lib/team/server"
import { createClient } from "@/lib/supabase/server"
import { ensureStorePublished } from "@/lib/store-builder/ensure-store-published"
import { authUnavailableResponse, routeUser } from "@/lib/auth/route-user"

/**
 * POST /api/store-builder/ensure-published
 *
 * Lightweight endpoint that ensures the caller's store builder shop page has
 * a published config. If none exists, creates one from defaults and publishes
 * it. Called from the product save flow so products are visible on the live
 * store page without the creator ever visiting the store builder editor.
 *
 * Returns { ok: true, created: boolean }
 */
export async function POST() {
  const supabase = await createClient()

  const who = await routeUser()
  if (who.kind === "unavailable") return authUnavailableResponse()
  const user = who.kind === "user" ? who.user : null
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  /* Round 41: after a team member with Products saves one of the store's products, the store's shop page, as for the owner. */
  const teamStore = await teamStoreIdFor(user.id, "products")
  const { data: creator } = teamStore
    ? { data: { id: teamStore } }
    : await supabase
    .from("creators")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle()

  if (!creator) {
    return NextResponse.json({ ok: false, error: "Creator not found" }, { status: 404 })
  }

  try {
    const created = await ensureStorePublished(creator.id)
    return NextResponse.json({ ok: true, created })
  } catch (err) {
    console.error("[ensure-published] error:", err)
    return NextResponse.json({ ok: false, error: "Failed to ensure published" }, { status: 500 })
  }
}
