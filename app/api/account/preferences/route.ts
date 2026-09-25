import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { readCurrentUser } from "@/lib/auth/current-user"
import { readNewsletter, writeNewsletter } from "@/lib/account/preferences"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  THE PRIVACY SWITCHES, EACH ONE SAVED WHERE IT IS OBEYED
 * ===========================================================================
 * Settings used to show six switches that saved nothing: they were React
 * state and came back on at every reload. The ones that stayed are the ones
 * something in Storelib actually reads:
 *
 *   personalizedRecommendations   profiles.personalized_recommendations,
 *                                 read by Explore before it builds "For you"
 *                                 (app/(marketing)/explore/page.tsx)
 *
 *   newsletter                    a row in storelib_newsletter, the list
 *                                 Storelib's own newsletter is sent to
 *
 * Analytics is the third switch on the page and is not here: it is the
 * cookie consent record on this device (lib/consent), which every tracker
 * already asks before it stores anything.
 *
 * The profile column is written with the person's own client, so row level
 * security decides as it does for every other profile field. The newsletter
 * table is closed to browsers (RLS on, no policies) and is written with the
 * service role, always for the signed in person's own address.
 */

function unavailable() {
  return NextResponse.json(
    { error: "Could not reach Storelib. Check your connection and try again." },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  )
}

export async function GET() {
  const supabase = await createClient()
  const current = await readCurrentUser(supabase)
  if (current.state === "indeterminate") return unavailable()
  if (!current.user) return NextResponse.json({ error: "Sign in again to see this." }, { status: 401 })

  const [{ data: profile }, newsletter] = await Promise.all([
    supabase.from("profiles").select("personalized_recommendations").eq("id", current.user.id).maybeSingle(),
    readNewsletter(createAdminClient(), current.user.email),
  ])

  return NextResponse.json(
    {
      /* A column that is not there yet (its SQL not run) reads as the default: on. */
      personalizedRecommendations: (profile as { personalized_recommendations?: boolean } | null)?.personalized_recommendations !== false,
      newsletter,
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}

export async function PATCH(request: NextRequest) {
  let body: { personalizedRecommendations?: unknown; newsletter?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 })
  }
  const personalized = typeof body.personalizedRecommendations === "boolean" ? body.personalizedRecommendations : undefined
  const newsletter = typeof body.newsletter === "boolean" ? body.newsletter : undefined
  if (personalized === undefined && newsletter === undefined) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 })
  }

  const supabase = await createClient()
  const current = await readCurrentUser(supabase)
  if (current.state === "indeterminate") return unavailable()
  if (!current.user) return NextResponse.json({ error: "Your session ended. Sign in again to change this." }, { status: 401 })
  const user = current.user

  if (personalized !== undefined) {
    const { error } = await supabase.from("profiles").update({ personalized_recommendations: personalized }).eq("id", user.id)
    if (error) {
      console.error(`[preferences] personalized_recommendations not saved (${error.code ?? "unknown"})`)
      return NextResponse.json({ error: "That did not save. Try again in a moment." }, { status: 500 })
    }
  }

  if (newsletter !== undefined) {
    if (!user.email) return NextResponse.json({ error: "Add an email address to your account first." }, { status: 400 })
    const saved = await writeNewsletter(createAdminClient(), user.email, newsletter)
    if (!saved) return NextResponse.json({ error: "That did not save. Try again in a moment." }, { status: 500 })
  }

  return NextResponse.json(
    { ok: true, ...(personalized !== undefined ? { personalizedRecommendations: personalized } : {}), ...(newsletter !== undefined ? { newsletter } : {}) },
    { headers: { "Cache-Control": "no-store" } },
  )
}
