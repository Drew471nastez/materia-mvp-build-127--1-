import "server-only"

/**
 * WHO IS ASKING, READ FROM THE SESSION ON THE SERVER.
 *
 * Every domains route starts here. The user comes from the session cookie
 * (supabase.auth.getUser, which asks Supabase rather than trusting the
 * cookie), the creator row from that user, and only then the service role
 * client that writes. Nothing a browser sends names whose domains these are.
 */
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { authUnavailableResponse, routeUser } from "@/lib/auth/route-user"
import { createAdminClient } from "@/lib/supabase/admin"

export type Owner = {
  userId: string
  creatorId: string
  username: string | null
  admin: ReturnType<typeof createAdminClient>
}

export async function domainOwner(opts: { read?: boolean } = {}): Promise<Owner | NextResponse> {
  /* Bounded, retried with backoff; a 503 with Try again when Supabase Auth did not answer, a 401 only for its nobody (lib/auth/route-user). A read-only GET passes read: true (round 49). */
  const who = await routeUser()
  if (who.kind === "unavailable") return authUnavailableResponse()
  if (who.kind !== "user") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = who.user
  const supabase = await createClient()

  const [{ data: creator }, { data: profile }] = await Promise.all([
    supabase.from("creators").select("id").eq("user_id", user.id).maybeSingle(),
    supabase.from("profiles").select("username").eq("id", user.id).maybeSingle(),
  ])
  if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 })

  return {
    userId: user.id,
    creatorId: (creator as { id: string }).id,
    username: (profile as { username?: string | null } | null)?.username ?? null,
    admin: createAdminClient(),
  }
}
