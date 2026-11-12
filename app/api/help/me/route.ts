import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { helpCors } from "@/lib/help/cors"
import { createAdminClient } from "@/lib/supabase/admin"
import { displayEmail, emailLocalPart } from "@/lib/businesses/email-alias"
import { routeUser } from "@/lib/auth/route-user"

export const dynamic = "force-dynamic"

/** Who is signed in, for the Help Center's account menu: a name, an email and a photo, nothing else. */
export async function GET(request: Request) {
  const headers = { ...helpCors(request), "Cache-Control": "private, no-store" }
  try {
    const supabase = await createClient()
    const who = await routeUser({ fresh: true })
    const user = who.kind === "user" ? who.user : null
    if (!user) return NextResponse.json({ signedIn: false }, { headers })
    const { data: profile } = await supabase.from("profiles").select("display_name, avatar_url").eq("id", user.id).maybeSingle()
    const p = (profile ?? {}) as { display_name?: string | null; avatar_url?: string | null }
    const email = displayEmail(user.email)
    /* A store owner gets the dashboard in the menu; a buyer gets their purchases. Only whether a store exists is read. */
    let seller = false
    try {
      const { data: creator } = await createAdminClient().from("creators").select("id").eq("user_id", user.id).limit(1).maybeSingle()
      seller = Boolean(creator)
    } catch {
      seller = false
    }
    return NextResponse.json(
      { signedIn: true, kind: seller ? "seller" : "buyer", name: p.display_name || emailLocalPart(user.email) || "Your account", email, avatarUrl: p.avatar_url || null },
      { headers },
    )
  } catch {
    return NextResponse.json({ signedIn: false }, { headers })
  }
}

export function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: helpCors(request) })
}
