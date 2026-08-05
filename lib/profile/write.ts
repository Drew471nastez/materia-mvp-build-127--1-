import "server-only"

import type { createAdminClient } from "@/lib/supabase/admin"
import { missingColumnFrom } from "@/lib/profile/missing-column"

/**
 * Writing to somebody's own profile row — including when there isn't one.
 *
 * ---------------------------------------------------------------------------
 * The bug this exists for
 * ---------------------------------------------------------------------------
 * Saving a profile answered "Could not save" on an account whose avatar and
 * cover had, apparently, just uploaded successfully. Both facts had the same
 * cause: THERE WAS NO `profiles` ROW.
 *
 * A row is normally written by a signup trigger. An account created before that
 * existed, or one where it failed, has none — and nothing downstream noticed,
 * because every screen falls back to the auth user for identity. So the profile
 * page rendered a name and the app worked.
 *
 * `update().eq("id", …)` against a row that is not there is not an error. It
 * matches zero rows and reports success. The two upload routes did exactly that
 * and returned the public URL they had just stored, so the picture appeared —
 * out of the response, in local state — and was gone on the next load, because
 * nothing had been written. The save route was the only one that asked
 * `.select()` whether a row had actually changed, so it was the only one that
 * could tell you. It was right, and it was the messenger.
 *
 * ---------------------------------------------------------------------------
 * What this does instead
 * ---------------------------------------------------------------------------
 * Update, and if that changed nothing, INSERT. In that order rather than as a
 * blind upsert, because an upsert has to name every column it would insert and
 * this is called with three different subsets of them; update-then-insert
 * touches only what it was given and only creates a row when there is genuinely
 * none.
 *
 * Two failures are handled on the way, both of which are "this database is not
 * quite the one the code expects" rather than anything the caller did:
 *
 *   A column that does not exist (42703) is dropped BY NAME and the rest is
 *   written — the same technique lib/profile/read.ts uses on the way in. `bio`
 *   and `cover_url` arrive with a migration, and until it has run a name should
 *   still save.
 *
 *   A NOT NULL column with no default (23502) on the INSERT path — in practice
 *   `username` — is filled from the identity we already have. A brand-new row
 *   needs a handle, and refusing to create one because nobody passed a username
 *   to a function about bios would be a strange place to give up.
 *
 * The id is always the caller's own, from the session. Nothing here takes one
 * from a request body, and nothing should: that is the whole of why writing
 * with the service role is safe.
 */

type Admin = ReturnType<typeof createAdminClient>

export type ProfileWriteResult =
  | { ok: true; row: Record<string, unknown>; skipped: string[]; created: boolean }
  | { ok: false; reason: "no-columns" | "failed"; skipped: string[]; message: string }

/** Both engines that can refuse a column, and they word it differently — see
 *  lib/profile/missing-column.ts for why that mattered. */
const missingColumn = missingColumnFrom

export async function writeProfile({
  admin,
  userId,
  patch,
  fallbackUsername,
  email,
}: {
  admin: Admin
  /** From the session, never from a body. */
  userId: string
  patch: Record<string, string | null>
  /** Used only if a row has to be created and `username` cannot be null. */
  fallbackUsername?: string | null
  /** Likewise, for a NOT NULL `email` column. From the session. */
  email?: string | null
}): Promise<ProfileWriteResult> {
  const wanted = Object.keys(patch)
  const live: Record<string, string | null> = { ...patch }
  const skipped: string[] = []

  // ── update ───────────────────────────────────────────────────────────────
  for (let i = 0; i <= wanted.length; i++) {
    const cols = Object.keys(live)
    if (cols.length === 0) break
    const res = await admin.from("profiles").update(live).eq("id", userId).select(cols.join(", "))
    if (!res.error) {
      const rows = (res.data ?? []) as unknown as Record<string, unknown>[]
      // A row came back: it existed and it changed. Done.
      if (rows.length > 0) return { ok: true, row: rows[0], skipped, created: false }
      break
    }
    const gone = missingColumn(res.error.message)
    if (!gone || !(gone in live)) {
      console.error("[profile/write] update failed:", res.error.message)
      return { ok: false, reason: "failed", skipped, message: res.error.message ?? "update failed" }
    }
    delete live[gone]
    skipped.push(gone)
  }

  if (Object.keys(live).length === 0) {
    return { ok: false, reason: "no-columns", skipped, message: "no writable columns" }
  }

  // ── nothing to update: make the row ──────────────────────────────────────
  //
  // A profiles table can carry columns nobody here knows about, and the insert
  // is where that shows: a NOT NULL with no default, a unique index, a foreign
  // key. Each is answered once and retried rather than surfaced as "could not
  // save", because every one of them is a fact about the schema rather than
  // about what the person typed.
  //
  // `upsert` rather than `insert` so a row that exists but did not match the
  // update — a stray casing, a race with a signup trigger firing at the same
  // moment — is written rather than collided with.
  const seed: Record<string, string | null> = { id: userId, ...live }
  let lastMessage = ""

  for (let attempt = 0; attempt < 8; attempt++) {
    const cols = Object.keys(live)
    const res = await admin.from("profiles").upsert(seed, { onConflict: "id" }).select(cols.join(", "))
    if (!res.error) {
      const rows = (res.data ?? []) as unknown as Record<string, unknown>[]
      return { ok: true, row: rows[0] ?? {}, skipped, created: true }
    }
    const err = res.error as { code?: string; message?: string; details?: string }
    lastMessage = err.message ?? ""
    const code = err.code

    // A column this database has not got: drop it and carry on with the rest.
    const gone = missingColumn(lastMessage)
    if (gone && gone in live) {
      delete live[gone]
      delete seed[gone]
      skipped.push(gone)
      if (Object.keys(live).length === 0) {
        return { ok: false, reason: "no-columns", skipped, message: lastMessage }
      }
      continue
    }

    // 23502 — NOT NULL with no default. Supply something true where we can:
    // the handle and the address both come from the session, and anything else
    // gets an empty string, which satisfies the constraint without inventing a
    // fact about the person.
    if (code === "23502") {
      const column = /column "([^"]+)"/i.exec(lastMessage) ?? /column ([\w.]+)/i.exec(lastMessage)
      const name = column?.[1]?.split(".").pop()
      if (name && !(name in seed)) {
        seed[name] = fillFor(name, { userId, fallbackUsername, email })
        continue
      }
    }

    // 23505 — a unique index, in practice on the handle. Try another one rather
    // than telling somebody their profile cannot be created because a username
    // they never chose is taken.
    if (code === "23505") {
      const target = /Key \((\w+)\)/i.exec(err.details ?? lastMessage)?.[1]
      const name = target && target in seed ? target : "username"
      if (name in seed) {
        seed[name] = `${handleFrom(fallbackUsername)}${userId.slice(0, 4)}${attempt}${Math.floor(Math.random() * 90 + 10)}`
        continue
      }
    }

    console.error("[profile/write] upsert failed:", code, lastMessage)
    return { ok: false, reason: "failed", skipped, message: `${code ?? "?"}: ${lastMessage}` }
  }

  return { ok: false, reason: "failed", skipped, message: lastMessage || "could not create profile row" }
}

function handleFrom(fallbackUsername?: string | null): string {
  const base = (fallbackUsername || "user").toLowerCase().replace(/[^a-z0-9_]+/g, "").slice(0, 18)
  return base || "user"
}

/** Something true where the session knows it, and something harmless where it
 *  does not. Never a guess about the person. */
function fillFor(
  column: string,
  ctx: { userId: string; fallbackUsername?: string | null; email?: string | null },
): string {
  if (/^(username|handle|slug)$/i.test(column)) return `${handleFrom(ctx.fallbackUsername)}${ctx.userId.slice(0, 6)}`
  if (/email/i.test(column)) return ctx.email ?? `${ctx.userId}@placeholder.invalid`
  if (/^(user_id|owner_id|auth_id)$/i.test(column)) return ctx.userId
  if (/(_at|date)$/i.test(column)) return new Date().toISOString()
  return ""
}
