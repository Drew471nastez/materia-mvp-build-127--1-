import { type NextRequest, NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { COVER_PRESETS, MAX_BIO_CHARS, normaliseBio } from "@/lib/profile/covers"

/**
 * PATCH /api/profile { bio?, cover? } → { ok, bio?, cover? }
 *
 * The two things about yourself you can change from your own profile without
 * going anywhere else: what it says under your name, and what is behind it.
 *
 * Written through the CALLER's client on purpose. `profiles` has a row-owner
 * policy, so the update is scoped to the person making the request by the
 * database rather than by this file remembering to add `.eq("id", user.id)` —
 * and a service-role write here would be a route that can edit anybody's
 * profile if it ever took an id from the body. It does not take an id from the
 * body, and it never should.
 *
 * `cover` accepts three things, matching the column exactly (see
 * lib/profile/covers.ts): a `preset:<id>` from the shipped set, an https URL
 * that this account uploaded through /api/profile/cover, or null to go back to
 * the default. An arbitrary URL is refused — a cover is drawn full-bleed on a
 * public page, so accepting one would let anybody point our profile at their
 * server and watch who loads it.
 */

const PRESET_IDS = new Set(COVER_PRESETS.map((p) => `preset:${p.id}`))

/** Where an uploaded cover legitimately lives. Anything else is somebody
 *  else's host wearing our page. */
function isOwnUpload(url: string): boolean {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!base) return false
  try {
    const u = new URL(url)
    return u.protocol === "https:" && u.origin === new URL(base).origin
  } catch {
    return false
  }
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  let payload: { bio?: unknown; cover?: unknown }
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: "Bad body" }, { status: 400 })
  }

  const patch: Record<string, string | null> = {}

  if ("bio" in payload) {
    const bio = normaliseBio(payload.bio)
    // An emptied bio is a removed one, not an empty string sitting in the
    // column — so the profile falls back to having no line rather than to
    // reserving space for a blank one.
    patch.bio = bio.length > 0 ? bio.slice(0, MAX_BIO_CHARS) : null
  }

  if ("cover" in payload) {
    const cover = payload.cover
    if (cover === null) {
      patch.cover_url = null
    } else if (typeof cover === "string" && PRESET_IDS.has(cover)) {
      patch.cover_url = cover
    } else if (typeof cover === "string" && isOwnUpload(cover)) {
      patch.cover_url = cover
    } else {
      return NextResponse.json({ error: "Bad cover" }, { status: 400 })
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to change" }, { status: 400 })
  }

  // `.select()` makes this a RETURNING update, which is the difference between
  // "the statement ran" and "a row changed". Without it a policy that does not
  // permit the write comes back with no error and no rows, and this route would
  // report success over a profile that is exactly as it was — the same failure
  // that made deleting a conversation look like it had worked.
  const { data, error } = await supabase.from("profiles").update(patch).eq("id", user.id).select("bio, cover_url")

  if (error) {
    // 42703 is "column does not exist": the migration adding bio and cover_url
    // has not been run against this database yet. Saying so plainly is worth
    // more than a 500, because it is the one failure here with an obvious fix
    // and the client can tell the person what it is.
    if ((error as { code?: string }).code === "42703") {
      return NextResponse.json(
        { error: "Profilul extins nu este activat încă pe acest cont.", missingColumns: true },
        { status: 409 },
      )
    }
    console.error("[profile] update failed:", error.message)
    return NextResponse.json({ error: "Could not save" }, { status: 500 })
  }
  if (!data || data.length === 0) {
    console.error("[profile] update matched no rows for", user.id)
    return NextResponse.json({ error: "Could not save" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, bio: data[0].bio ?? null, cover: data[0].cover_url ?? null })
}
