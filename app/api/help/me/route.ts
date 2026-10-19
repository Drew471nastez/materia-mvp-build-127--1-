import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { helpCors } from "@/lib/help/cors"

export const dynamic = "force-dynamic"

/** Who is signed in, for the Help Center's account menu: a name, an email and a photo, nothing else. */
export async function GET(request: Request) {
  const headers = { ...helpCors(request), "Cache-Control": "private, no-store" }
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ signedIn: false }, { headers })
    const { data: profile } = await supabase.from("profiles").select("display_name, avatar_url").eq("id", user.id).maybeSingle()
    const p = (profile ?? {}) as { display_name?: string | null; avatar_url?: string | null }
    const email = user.email && !user.email.includes("+slb-") ? user.email : null
    return NextResponse.json({ signedIn: true, name: p.display_name || email?.split("@")[0] || "Your account", email, avatarUrl: p.avatar_url || null }, { headers })
  } catch {
    return NextResponse.json({ signedIn: false }, { headers })
  }
}

export function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: helpCors(request) })
}
