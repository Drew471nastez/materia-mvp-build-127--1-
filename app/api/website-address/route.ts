import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { effectiveHandle, handleProblem, normalizeHandle } from "@/lib/website-builder/site-address"
import { handleTakenFor, websiteHandleOf } from "@/lib/website-builder/site-address-data"
import { revalidatePublishedSite } from "@/lib/website-builder/published-site"
import { routeUser, signedOutOrRetry } from "@/lib/auth/route-user"

/**
 * ===========================================================================
 *  THE WEBSITE'S NAME ON STORELIB: READ IT, CHANGE IT
 * ===========================================================================
 * GET  → { handle, username, own }: the name the website is at, the
 *        creator's username, and whether the name is one they chose.
 * POST { handle } → the same, after the change. The username itself is
 *        allowed, and means "go back to my username".
 *
 * Only the signed-in creator's own website, found from their session and
 * never from the request. The name is checked the way the page checks it
 * (lib/website-builder/site-address) and then checked free; the database's
 * unique index settles two people choosing the same name at once. The name
 * the website had before is kept in the history, still answering for it,
 * so a link already given out keeps working and nobody else can take it.
 */

async function owner() {
  const supabase = await createClient()
  const who = await routeUser()
  const user = who.kind === "user" ? who.user : null
  if (!user) return null
  const { data: creator } = await supabase.from("creators").select("id").eq("user_id", user.id).maybeSingle()
  if (!creator) return null
  const { data: profile } = await supabase.from("profiles").select("username").eq("id", user.id).maybeSingle()
  return { creatorId: (creator as { id: string }).id, username: String((profile as { username?: string } | null)?.username ?? "") }
}

export async function GET() {
  const me = await owner()
  if (!me) return signedOutOrRetry(NextResponse.json({ error: "Sign in first." }, { status: 401 }))
  const own = await websiteHandleOf(me.creatorId)
  return NextResponse.json({ handle: effectiveHandle(own, me.username), username: me.username, own: Boolean(own) })
}

export async function POST(request: Request) {
  const me = await owner()
  if (!me) return signedOutOrRetry(NextResponse.json({ error: "Sign in first." }, { status: 401 }))
  const body = (await request.json().catch(() => ({}))) as { handle?: unknown }
  const wanted = normalizeHandle(typeof body.handle === "string" ? body.handle : "")
  const problem = handleProblem(wanted)
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  const admin = createAdminClient()
  const before = await websiteHandleOf(me.creatorId, admin)
  const current = effectiveHandle(before, me.username)
  if (wanted === current) return NextResponse.json({ handle: current, username: me.username, own: Boolean(before) })

  const taken = await handleTakenFor(wanted, me.creatorId, admin)
  if (taken) return NextResponse.json({ error: taken }, { status: 409 })

  /* The name it had keeps answering for this website. */
  if (before) {
    const { error } = await admin.from("website_address_history").upsert({ handle: before, creator_id: me.creatorId, retired_at: new Date().toISOString() }, { onConflict: "handle" })
    if (error && /relation .* does not exist|schema cache/i.test(error.message)) {
      return NextResponse.json({ error: "Changing the website's address is not switched on yet." }, { status: 503 })
    }
  }

  const backToUsername = wanted === me.username.toLowerCase()
  const { error } = backToUsername
    ? await admin.from("website_addresses").delete().eq("creator_id", me.creatorId)
    : await admin.from("website_addresses").upsert({ creator_id: me.creatorId, handle: wanted, updated_at: new Date().toISOString() }, { onConflict: "creator_id" })
  if (error) {
    if (/relation .* does not exist|schema cache/i.test(error.message)) {
      return NextResponse.json({ error: "Changing the website's address is not switched on yet." }, { status: 503 })
    }
    if (error.code === "23505") return NextResponse.json({ error: "That name was just taken." }, { status: 409 })
    return NextResponse.json({ error: "Could not change the address." }, { status: 500 })
  }
  /* A name it is moving back to is its own again, not a retired one. */
  await admin.from("website_address_history").delete().eq("handle", wanted).eq("creator_id", me.creatorId)

  await revalidatePublishedSite(me.creatorId)
  return NextResponse.json({ handle: wanted, username: me.username, own: !backToUsername })
}
