import "server-only"

import type { createAdminClient } from "@/lib/supabase/admin"

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

/** Postgres says which column is missing; take it at its word. */
function missingColumn(message: string | undefined): string | null {
  return /column\s+[\w".]*?\b(\w+)\s+does not exist/i.exec(message ?? "")?.[1] ?? null
}

export async function writeProfile({
  admin,
  userId,
  patch,
  fallbackUsername,
}: {
  admin: Admin
  /** From the session, never from a body. */
  userId: string
  patch: Record<string, string | null>
  /** Used only if a row has to be created and `username` cannot be null. */
  fallbackUsername?: string | null
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
  const seed: Record<string, string | null> = { id: userId, ...live }
  for (let i = 0; i < 6; i++) {
    const cols = Object.keys(live)
    const res = await admin.from("profiles").insert(seed).select(cols.join(", "))
    if (!res.error) {
      const rows = (res.data ?? []) as unknown as Record<string, unknown>[]
      return { ok: true, row: rows[0] ?? {}, skipped, created: true }
    }
    const code = (res.error as { code?: string }).code
    const message = res.error.message ?? ""

    const gone = missingColumn(message)
    if (gone && gone in live) {
      delete live[gone]
      delete seed[gone]
      skipped.push(gone)
      if (Object.keys(live).length === 0) {
        return { ok: false, reason: "no-columns", skipped, message }
      }
      continue
    }

    // 23502: a NOT NULL column with no default. The one this table realistically
    // has is `username`, and a handle is something we can supply rather than a
    // reason to refuse. Suffixed so two accounts with the same email handle
    // cannot collide on the unique index.
    if (code === "23502") {
      const column = /column "([^"]+)"/i.exec(message)?.[1]
      if (column && !(column in seed)) {
        const base = (fallbackUsername || "user").toLowerCase().replace(/[^a-z0-9_]+/g, "").slice(0, 20) || "user"
        seed[column] = column === "username" ? `${base}${userId.slice(0, 6)}` : ""
        continue
      }
    }

    console.error("[profile/write] insert failed:", message)
    return { ok: false, reason: "failed", skipped, message }
  }

  return { ok: false, reason: "failed", skipped, message: "could not create profile row" }
}
