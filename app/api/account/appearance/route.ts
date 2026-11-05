import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
/* Round 52: the token's verified signature, with no Supabase Auth round trip (lib/auth/route-user). */
import { readerForRequest } from "@/lib/auth/route-user"
import { isAppearance } from "@/lib/appearance/site-appearance"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * The person's light or dark choice, kept on their account (lib/appearance/site-appearance.ts),
 * so it follows them to another browser, their phone and the native apps.
 *
 * Kept in their own user metadata, written with their own session: nobody
 * can set it for anybody else, and nothing needs a table. GET answers null
 * for a person who never chose, and for nobody signed in.
 */
const noStore = { "Cache-Control": "no-store" }

export async function GET() {
  const supabase = await createClient()
  const current = await readerForRequest()
  if (!current.user) return NextResponse.json({ appearance: null }, { headers: noStore })
  const v = (current.user.user_metadata as { storelib_appearance?: unknown } | null)?.storelib_appearance
  return NextResponse.json({ appearance: isAppearance(v) ? v : null }, { headers: noStore })
}

export async function PUT(request: NextRequest) {
  let body: { appearance?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400, headers: noStore })
  }
  if (!isAppearance(body.appearance)) return NextResponse.json({ error: "Pick light or dark." }, { status: 400, headers: noStore })
  const supabase = await createClient()
  const current = await readerForRequest()
  if (current.state === "indeterminate") return NextResponse.json({ error: "Could not reach Storelib. Try again." }, { status: 503, headers: noStore })
  /* Signed out: the browser keeps it, there is no account to keep it on. */
  if (!current.user) return NextResponse.json({ ok: true, kept: "browser" }, { headers: noStore })
  const { error } = await supabase.auth.updateUser({ data: { storelib_appearance: body.appearance } })
  if (error) return NextResponse.json({ error: "It could not be saved to your account. It is kept on this device." }, { status: 502, headers: noStore })
  return NextResponse.json({ ok: true, kept: "account" }, { headers: noStore })
}
