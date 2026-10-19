import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { helpCors } from "@/lib/help/cors"

/** Log out from the Help Center's account menu: the session is storelib.com's, so it is ended here. */
export async function POST(request: Request) {
  const headers = helpCors(request)
  try {
    const supabase = await createClient()
    await supabase.auth.signOut({ scope: "local" })
  } catch {
    /* Signed out already, or nothing to end. */
  }
  return NextResponse.json({ ok: true }, { headers })
}

export function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: helpCors(request) })
}
