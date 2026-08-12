import { type NextRequest, NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { writeProfile } from "@/lib/profile/write"
import { COVER_PRESETS, MAX_BIO_CHARS, MAX_NAME_CHARS, normaliseBio, normaliseName } from "@/lib/profile/covers"
import { slugifyUsername } from "@/lib/profile/username"
import { isValidUsername } from "@/lib/reserved-words"

/**
 * PATCH /api/profile { displayName?, username?, bio?, cover? } → { ok, … }
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

  let payload: { displayName?: unknown; bio?: unknown; cover?: unknown; username?: unknown }
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: "Bad body" }, { status: 400 })
  }

  const patch: Record<string, string | null> = {}
  /** The new handle, when one is being taken. Null on every other save. */
  let releasedHandle: string | null = null

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

  /**
   * THE HANDLE, WHICH IS THE ONE FIELD THAT CAN COLLIDE.
   *
   * Everything else on this route is yours alone and can only fail on the way
   * to the database. A username is a claim on a name in a shared space, so it
   * gets three gates in order, and the order matters:
   *
   *   1. SHAPE. Slugified first, so what is checked is what will be stored —
   *      validating the raw input and storing the slug would let "Andrew Rullz"
   *      pass a check that "andrewrullz" never had.
   *   2. RULES. isValidUsername, the same function the signup flow uses and the
   *      same one that refuses the reserved words. "storelib" is in that list,
   *      which is what stops anybody claiming the official handle.
   *   3. UNIQUENESS. Case-insensitively, because /member/[username] resolves
   *      case-insensitively, and excluding the caller so saving a form without
   *      touching the handle is not refused for the value it already holds.
   *
   * The check here is not a lock and cannot be — two writes a millisecond apart
   * both see a free handle. What makes that safe is that it is a NAME rather
   * than a resource: the loser of that race gets a duplicate, which the unique
   * index in the database refuses if there is one, and which is recoverable by
   * changing it. Reserving handles to close a race nobody will lose would be a
   * worse system.
   */
  if ("username" in payload && typeof payload.username === "string") {
    const wanted = slugifyUsername(payload.username)
    const verdict = isValidUsername(wanted)
    if (!verdict.valid) {
      return NextResponse.json({ error: verdict.error ?? "Nume de utilizator invalid", field: "username" }, { status: 400 })
    }
    const { data: clash } = await createAdminClient()
      .from("profiles")
      .select("id")
      .ilike("username", wanted)
      .neq("id", user.id)
      .limit(1)
      .maybeSingle()
    if (clash) {
      return NextResponse.json(
        { error: "Numele de utilizator este deja luat.", field: "username", taken: true },
        { status: 409 },
      )
    }
    patch.username = wanted
    // Remembered below, after the write is known to have succeeded — see
    // `releasedHandle`. Recording it here would leave a redirect pointing at a
    // rename that never happened.
    releasedHandle = wanted
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to change" }, { status: 400 })
  }

  // Written by lib/profile/write.ts, which handles the two things this route
  // used to get wrong: a column the database has not got yet (dropped by name,
  // the rest saved) and — the one that produced "Could not save" on an account
  // whose uploads had apparently just worked — an account with NO `profiles`
  // ROW AT ALL, where an update matches nothing and reports success.
  /** What the handle WAS, read before the write replaces it. */
  const previousUsername = releasedHandle
    ? ((
        await createAdminClient().from("profiles").select("username").eq("id", user.id).maybeSingle()
      ).data?.username ?? null)
    : null

  const written = await writeProfile({
    admin: createAdminClient(),
    userId: user.id,
    patch,
    fallbackUsername: user.email?.split("@")[0] ?? null,
    email: user.email ?? null,
  })

  /**
   * THE ADDRESS THAT USED TO BE THEIRS.
   *
   * /member/<handle> is where a seller's listings are linked from, where they
   * have put the link in their bio, and where anybody who bookmarked them comes
   * back to. Changing it silently breaks all of that, which is why most
   * products make the handle permanent instead — the other, worse answer.
   *
   * So the old one is written down and the profile page falls back to it. Done
   * AFTER the write and only when the write succeeded: a redirect recorded for
   * a rename that failed would send people away from a profile that never
   * moved.
   *
   * `upsert` on the handle rather than insert: the same handle can be released
   * more than once, by different accounts, and the most recent claimant is the
   * one an old link should now reach. And the row for the handle being TAKEN is
   * deleted, because it is live again — leaving it would mean a redirect
   * competing with a real profile, which the page resolves in the right order
   * anyway but which is a contradiction sitting in the table.
   *
   * Best-effort, and deliberately not awaited into the response's success. A
   * profile that saved is saved; failing the request because a redirect could
   * not be filed would be reporting a working rename as a broken one.
   */
  if (releasedHandle && previousUsername && previousUsername.toLowerCase() !== releasedHandle.toLowerCase()) {
    const admin = createAdminClient()
    try {
      await admin.from("profile_username_history").upsert(
        {
          username_lower: previousUsername.toLowerCase(),
          user_id: user.id,
          released_at: new Date().toISOString(),
        },
        { onConflict: "username_lower" },
      )
      await admin.from("profile_username_history").delete().eq("username_lower", releasedHandle.toLowerCase())
    } catch (e: unknown) {
      console.error("[profile] could not record released handle:", (e as Error)?.message)
    }
  }

  if (!written.ok) {
    if (written.reason === "no-columns") {
      return NextResponse.json(
        {
          error: "Profilul extins nu este activat încă pe acest cont.",
          missingColumns: true,
          skipped: written.skipped,
        },
        { status: 409 },
      )
    }
    // THE REASON, not a shrug.
    //
    // "Could not save" is what this said for every failure, and it is exactly
    // as useful to the person reading it as it was to the person who wrote it:
    // the profile row could be missing, a column could be absent, a constraint
    // could be refusing the write, and all three produced the same four words.
    // The message is the database's own, about the caller's own row, on a
    // screen only they can see — there is nothing in it to withhold, and
    // without it the next report is another screenshot of the same four words.
    return NextResponse.json({ error: "Nu am putut salva profilul.", detail: written.message }, { status: 500 })
  }

  const row = written.row as {
    display_name?: string | null
    bio?: string | null
    cover_url?: string | null
    username?: string | null
  }
  const skipped = written.skipped

  return NextResponse.json({
    ok: true,
    displayName: row.display_name ?? null,
    /**
     * THE HANDLE AS STORED, which is not necessarily the handle as sent.
     *
     * It has been through `slugifyUsername`, so "Andrew Rullz" arrives here as
     * "andrewrullz". A caller that has anything else keyed on the handle — the
     * settings form syncs `creators.slug` to it — must use THIS value and not
     * the one it typed, or the two drift apart on the first name with a space
     * or a capital in it.
     */
    username: row.username ?? null,
    bio: row.bio ?? null,
    cover: row.cover_url ?? null,
    // Which fields had nowhere to go, so the form can say so rather than
    // implying everything was kept.
    skipped,
  })
}
