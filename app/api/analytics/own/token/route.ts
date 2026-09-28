import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { HANDOFF_TTL_MS, signOwnHandoff } from "@/lib/analytics/own-marker"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * THE TOKEN THE APP PUTS ON A LINK TO THE CREATOR'S OWN SITE, so the site's
 * host can tell it is them and leave their visit out of their own analytics
 * (lib/analytics/own-marker explains the whole hand-off).
 *
 * It is minted only for the creator the session belongs to, never for a
 * creator named in the request, so the worst a token can do is stop counting
 * the browser holding it on the pages of the creator who asked for it.
 */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ token: null }, { status: 401, headers: { "Cache-Control": "no-store" } })

  const { data: creator } = await supabase.from("creators").select("id").eq("user_id", user.id).maybeSingle()
  const token = creator?.id ? signOwnHandoff(creator.id as string) : null
  return NextResponse.json(
    { token, expiresIn: Math.floor(HANDOFF_TTL_MS / 1000) },
    { headers: { "Cache-Control": "no-store" } },
  )
}
