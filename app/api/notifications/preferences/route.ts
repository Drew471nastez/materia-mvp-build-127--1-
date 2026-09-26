import { NextResponse, type NextRequest } from "next/server"

import { readCurrentUser } from "@/lib/auth/current-user"
import { getPreferences, setPreference } from "@/lib/notify/preferences"
import { REQUIRED_WHY, parseChanges, preferencesView } from "@/lib/notify/preference-view"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  WHICH NOTIFICATIONS THE SIGNED IN CREATOR GETS, BY CATEGORY AND CHANNEL
 * ===========================================================================
 * Settings' "Email and notifications" card
 * (components/app/settings/notification-preferences.tsx) reads and writes
 * here.
 *
 *   GET   every category (lib/notify/preference-view.ts CATEGORY_INFO), each
 *         with email and in app on or off and when it was last changed, and
 *         whether it is required (always sent, no switch)
 *   PUT   {category, channel, enabled}, or {changes: [...]} for a few at
 *         once. A required category is refused with the reason.
 *
 * Who is asking is the person's own session (the RLS client). The rows are
 * read and written through lib/notify/preferences.ts with the service role,
 * always for that person's own id, with the source "settings", so
 * notification_preferences keeps updated_at and where the choice came from.
 */

const NO_STORE = { "Cache-Control": "private, no-store" }

function unavailable() {
  return NextResponse.json({ error: "Could not reach Storelib. Check your connection and try again." }, { status: 503, headers: NO_STORE })
}

export async function GET() {
  const supabase = await createClient()
  const current = await readCurrentUser(supabase)
  if (current.state === "indeterminate") return unavailable()
  if (!current.user) return NextResponse.json({ error: "Sign in again to see this." }, { status: 401, headers: NO_STORE })

  let stored: Awaited<ReturnType<typeof getPreferences>> = []
  try {
    stored = await getPreferences(createAdminClient(), current.user.id)
  } catch (err) {
    /* Before the engine's SQL, or while it cannot be read: the defaults, said as such. */
    console.error(`[notification-preferences] could not read (${err instanceof Error ? err.message.slice(0, 120) : "unknown"})`)
    return NextResponse.json({ categories: preferencesView([]), requiredWhy: REQUIRED_WHY, defaultsOnly: true }, { headers: NO_STORE })
  }
  return NextResponse.json({ categories: preferencesView(stored), requiredWhy: REQUIRED_WHY }, { headers: NO_STORE })
}

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const parsed = parseChanges(body)
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400, headers: NO_STORE })

  const supabase = await createClient()
  const current = await readCurrentUser(supabase)
  if (current.state === "indeterminate") return unavailable()
  if (!current.user) return NextResponse.json({ error: "Your session ended. Sign in again to change this." }, { status: 401, headers: NO_STORE })

  const db = createAdminClient()
  try {
    for (const c of parsed.changes) await setPreference(db, current.user.id, c.category, c.channel, c.enabled, "settings")
  } catch (err) {
    console.error(`[notification-preferences] could not save (${err instanceof Error ? err.message.slice(0, 120) : "unknown"})`)
    return NextResponse.json({ error: "That did not save. Try again in a moment." }, { status: 500, headers: NO_STORE })
  }

  let stored: Awaited<ReturnType<typeof getPreferences>> = []
  try {
    stored = await getPreferences(db, current.user.id)
  } catch {
    /* Saved; the answer is what was asked for. */
    stored = parsed.changes.map((c) => ({ ...c, updatedAt: new Date().toISOString() }))
  }
  return NextResponse.json({ ok: true, categories: preferencesView(stored) }, { headers: NO_STORE })
}
