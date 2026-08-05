import { type NextRequest, NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { COVER_PRESETS, MAX_BIO_CHARS, MAX_NAME_CHARS, normaliseBio, normaliseName } from "@/lib/profile/covers"

/**
 * PATCH /api/profile { displayName?, bio?, cover? } → { ok, … }
 *
 * What /profile/edit saves: your name, the line under it, and the band behind
 * it. Every field is optional and only the ones present are touched, so the
 * form can send one thing without having to know the current value of the rest.
 *
 * WRITTEN WITH THE SERVICE ROLE, SCOPED TO THE SESSION'S OWN ID.
 *
 * It used to go through the caller's client and rely on `profiles` having a
 * row-owner UPDATE policy. When a project does not have one — and RLS is
 * deny-by-default per command, so "no policy" is the state a table starts in —
 * the update matches zero rows, comes back with no error, and this route
 * reported a failure it could not explain. That is why a saved bio never
 * appeared: nothing was wrong with the reading side at all.
 *
 * The id comes from `auth.getUser()` and from nowhere else. There is no id in
 * the body, this route does not accept one, and adding one would be the bug —
 * with that constraint the `.eq("id", user.id)` below is exactly the policy it
 * replaces, written where it can be read.
 *
 * `cover` accepts three things, matching the column exactly (see
 * lib/profile/covers.ts): a `lib:<id>` from the shipped library, an https URL
 * that this account uploaded through /api/profile/cover, or null to go back to
 * the default. An arbitrary URL is refused — a cover is drawn full-bleed on a
 * public page, so accepting one would let anybody point our profile at their
 * server and watch who loads it.
 */

const LIBRARY_IDS = new Set(COVER_PRESETS.map((p) => `lib:${p.id}`))

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

  let payload: { displayName?: unknown; bio?: unknown; cover?: unknown }
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: "Bad body" }, { status: 400 })
  }

  const patch: Record<string, string | null> = {}

  if ("displayName" in payload) {
    const name = normaliseName(payload.displayName)
    // A cleared name is not an empty name. Falling back to the username is what
    // the profile already does for an account that never set one, and it is a
    // better answer than a header with nothing in it.
    patch.display_name = name.length > 0 ? name.slice(0, MAX_NAME_CHARS) : null
  }

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
    } else if (typeof cover === "string" && LIBRARY_IDS.has(cover)) {
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
  const { data, error } = await createAdminClient()
    .from("profiles")
    .update(patch)
    .eq("id", user.id)
    .select("display_name, bio, cover_url")

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

  return NextResponse.json({
    ok: true,
    displayName: data[0].display_name ?? null,
    bio: data[0].bio ?? null,
    cover: data[0].cover_url ?? null,
  })
}
