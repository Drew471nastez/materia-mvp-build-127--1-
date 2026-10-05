import { NextResponse } from "next/server"
import { rateLimit } from "@/lib/api/rate-limit"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { CONTACT_RATE, CONTACT_RATE_ANY, cleanContactMessage } from "@/lib/communities/membership-policy"
import { requireMember } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { sendContactMessage } from "@/lib/communities/server/membership-lifecycle"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NO_STORE = { "Cache-Control": "no-store" }

type Params = { params: Promise<{ communityId: string }> }

/**
 * POST /api/community/<communityId>/contact  { subject, message }  (round 13, ask 42)
 *
 * An active member writes to the community's owner. Delivered to the address
 * the owner set for the community, else their seller inbox, with Reply-To
 * the member; the owner's address never reaches the member. Three an hour
 * and five a day per member and community, ten a day across communities
 * (rateLimit), and the day's five counted again from the messages table
 * (part 101) in case the limiter's own table cannot be read.
 */
export async function POST(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId } = await params
  const {
    data: { user },
  } = await (await createClient()).auth.getUser()
  const db = admin()
  const gate = await requireMember(db, communityId, user?.id ?? null, "view")
  if (gate instanceof NextResponse) return gate
  const input = cleanContactMessage(await request.json().catch(() => ({})))
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400, headers: NO_STORE })
  const message = "You have written to the owner a few times already. Give them time to reply."
  const limited =
    (await rateLimit({ bucket: "community-contact", subjects: [`user:${gate.viewer.userId}:${communityId}`], windows: CONTACT_RATE, message })) ||
    (await rateLimit({ bucket: "community-contact-any", subjects: [`user:${gate.viewer.userId}`], windows: CONTACT_RATE_ANY, message }))
  if (limited) return limited
  const { data: profile } = await db.from("profiles").select("display_name, username").eq("id", gate.viewer.userId).maybeSingle()
  const sent = await sendContactMessage(db, {
    community: gate.community,
    sender: { id: String(gate.viewer.userId), name: (profile?.display_name as string | null) || (profile?.username as string | null) || "A member", email: user?.email ?? null },
    subject: input.subject,
    message: input.message,
  })
  if (!sent.ok) return NextResponse.json({ error: sent.message, code: sent.error }, { status: sent.status, headers: NO_STORE })
  return NextResponse.json({ sent: true }, { headers: NO_STORE })
}
