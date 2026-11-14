import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { ensureStorePublished } from "@/lib/store-builder/ensure-store-published"
import { ensureOnePage } from "@/lib/onepage/ensure-onepage"
import { routeUser, signedOutOrRetry } from "@/lib/auth/route-user"
import { creatorPagesChanged } from "@/lib/storefront/creator-page-purge"
import { onePageChangedFor } from "@/lib/onepage/public-cache"
import { claimStoreHandle } from "@/lib/profile/move-handle"
import { isValidUsername } from "@/lib/reserved-words"

/**
 * POST /api/onboarding/finalize
 *
 * Writes the critical onboarding flags using the service-role admin client
 * (bypasses RLS). Called at the end of creator onboarding and for buyer role
 * selection so the writes cannot fail silently due to RLS.
 *
 * Body (JSON):
 *   role: "creator" | "buyer"
 *   creatorSlug?: string   (used when role = "creator" and no creator record exists yet)
 *
 * Returns:
 *   { ok: true, nextPath: "/app" | "/account/library" }
 *   { ok: false, error: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { role, creatorSlug } = body as { role: "creator" | "buyer"; creatorSlug?: string }

    if (role !== "creator" && role !== "buyer") {
      return NextResponse.json({ ok: false, error: "Invalid role" }, { status: 400 })
    }

    // Verify the caller is authenticated via cookie-based session (web browsers).
    // Capacitor apps store the session in Preferences (not cookies), so the server
    // client may return null. In that case, fall back to the Authorization header.
    let userId: string | null = null

    const who = await routeUser({ fresh: true })
    const user = who.kind === "user" ? who.user : null
    if (user) {
      userId = user.id
    } else {
      // Capacitor / native fallback: client passes the access token in the header
      const authHeader = request.headers.get("authorization")
      const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null
      if (token) {
        const admin = createAdminClient()
        const { data: { user: tokenUser } } = await admin.auth.getUser(token)
        if (tokenUser) userId = tokenUser.id
      }
    }

    if (!userId) {
      return signedOutOrRetry(NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }))
    }

    const admin = createAdminClient()

    // ── Buyer ──────────────────────────────────────────────────────────────
    if (role === "buyer") {
      const { error } = await admin
        .from("profiles")
        .update({ is_creator: false, welcome_completed: true })
        .eq("id", userId)

      if (error) {
        console.error("[finalize] buyer profile update error:", error)
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
      }

      return NextResponse.json({ ok: true, nextPath: "/account/library" })
    }

    // ── Creator ─────────────────────────────────────────────────────────────

    // 1. Update profiles table
    const { error: profileError } = await admin
      .from("profiles")
      .update({ is_creator: true, welcome_completed: true })
      .eq("id", userId)

    if (profileError) {
      console.error("[finalize] creator profile update error:", profileError)
      return NextResponse.json({ ok: false, error: profileError.message }, { status: 500 })
    }

    // 2. Find existing creator record
    const { data: existingCreator } = await admin
      .from("creators")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle()

    if (existingCreator) {
      // UPDATE — only touch the critical gate flag; don't overwrite other fields
      const { error } = await admin
        .from("creators")
        .update({ onboarding_completed: true, store_published: true })
        .eq("id", existingCreator.id)

      if (error) {
        console.error("[finalize] creator update error:", error)
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
      }
    } else {
      /*
        INSERT: no creator record yet. The store's address is the account's
        handle, claimed through the same rules as every other name
        (lib/profile/move-handle.ts claimStoreHandle: format, reserved words,
        a fake sign in page's name, taken anywhere a handle lives). It used to
        be whatever creatorSlug the request sent, so a name like paypal-login
        became paypal-login.storelib.com.
      */
      const claimed = await claimStoreHandle(admin, userId, typeof creatorSlug === "string" ? creatorSlug : "")
      const sent = String(creatorSlug || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
      const baseSlug = claimed.ok ? claimed.username : isValidUsername(sent).valid ? sent : "creator"

      // Resolve slug conflicts by appending a short random suffix
      let slug = baseSlug
      let insertError: { code?: string; message: string } | null = null

      for (let attempt = 0; attempt < 5; attempt++) {
        if (attempt > 0) {
          slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`
        }

        const { error } = await admin
          .from("creators")
          .insert({
            user_id: userId,
            slug,
            onboarding_completed: true,
            store_published: true,
          })

        if (!error) { insertError = null; break }

        // Retry only on unique constraint violations (slug conflict)
        if (error.code !== "23505") {
          insertError = error
          break
        }
        insertError = error
      }

      if (insertError) {
        console.error("[finalize] creator insert error:", insertError)
        return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 })
      }
    }

    // ── Auto-publish store builder with defaults ────────────────────────────
    // Ensures the creator's store page is live immediately after onboarding,
    // even if they never visit the store builder editor. Featured products
    // section will show whatever products they add later.
    try {
      // Re-fetch the creator id (might have just been inserted above)
      const { data: finalCreator } = await admin
        .from("creators")
        .select("id, slug")
        .eq("user_id", userId)
        .maybeSingle()

      if (finalCreator) {
        await ensureStorePublished(finalCreator.id)

        /**
         * AND THE ONEPAGE, WHICH DID NOT EXIST UNTIL SOMEBODY ASKED FOR IT.
         *
         * The creator page has been published from here for a while. The
         * OnePage row was created lazily, on the first visit to /app/onepage,
         * so a creator who never opened that screen had no OnePage at all: no
         * row, no slug, no address. The dashboard said "Set up your OnePage to
         * create a link" and a link they could have handed somebody on day one
         * did not exist.
         *
         * It is created published, from the name and picture already gathered,
         * by the same function that screen uses, so the two cannot drift into
         * making different OnePages. Idempotent, because this and a first
         * visit can race.
         */
        await ensureOnePage(admin, userId, { id: finalCreator.id, slug: finalCreator.slug })
      }
    } catch (autoPublishErr) {
      // Non-critical — the store builder can still be published later manually
      console.error("[finalize] store auto-publish error:", autoPublishErr)
    }

    /*
      THE NEW STORE'S ADDRESSES, TAKEN DOWN FROM EVERY CACHE (round AW). Opened before this moment,
      storelib.com/<handle> answered the member profile's 308 or a 404 and storelib.me/<handle> a 404, and the CDN
      keeps those for every visitor (next.config.mjs EDGE_PAGE, measured live: the second ask is a HIT), as Next's
      data cache keeps a OnePage's "nothing here" for a minute. Every other publish clears them; this one did not,
      so a creator who had looked at their link saw "not found" on it for minutes after finishing. Both never throw.
    */
    await creatorPagesChanged({ userId })
    await onePageChangedFor(userId)

    return NextResponse.json({ ok: true, nextPath: "/app" })
  } catch (err) {
    console.error("[finalize] unexpected error:", err)
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 })
  }
}
