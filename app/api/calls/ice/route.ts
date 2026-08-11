import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { iceServers } from "@/lib/calls/protocol"

/**
 * GET /api/calls/ice  → { iceServers }
 *
 * Where the two ends should look for each other. An endpoint rather than a
 * `NEXT_PUBLIC_` constant for one reason: a TURN credential in a public
 * environment variable is compiled into the JavaScript bundle and served to
 * everyone who loads the site, signed in or not, forever. Relay bandwidth is
 * metered and somebody else's is free.
 *
 * It still reaches the browser — WebRTC cannot use a credential the browser
 * does not have — but only a signed-in one, and only when a call is actually
 * being made.
 *
 * With no TURN configured this returns STUN alone, which is a working call on
 * most networks and no call at all on some. That trade-off is written out in
 * lib/calls/protocol.ts.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  return NextResponse.json(
    {
      iceServers: iceServers({
        url: process.env.TURN_URL,
        username: process.env.TURN_USERNAME,
        credential: process.env.TURN_CREDENTIAL,
      }),
    },
    // Short, and private. These are per-user credentials in the general case
    // and a shared CDN copy would hand one person's relay quota to everybody.
    { headers: { "Cache-Control": "private, max-age=300" } },
  )
}
