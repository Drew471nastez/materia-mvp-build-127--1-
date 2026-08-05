import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * The three things you can do about the person on the other end of a thread.
 *
 *   POST /api/messages/:id/actions { action: "block"   }  → stop hearing from them
 *   POST /api/messages/:id/actions { action: "unblock" }
 *   POST /api/messages/:id/actions { action: "report", reason, detail? }
 *   POST /api/messages/:id/actions { action: "delete"  }  → leave the conversation
 *
 * One route because they are one decision made in one sheet, and splitting them
 * across four files would mean four copies of the same membership check.
 *
 * That check is the whole security model here and it is deliberately done the
 * long way round: the conversation is read through the CALLER's client, so RLS
 * decides whether they are a party to it. A thread that is not theirs reads as
 * absent, and every branch below is unreachable for it. The service role is only
 * used afterwards, for writes over a row the caller has already proved they
 * belong to.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const REASONS = new Set(["spam", "scam", "harassment", "counterfeit", "other"])

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 })

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  let payload: { action?: string; reason?: string; detail?: string }
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: "Bad body" }, { status: 400 })
  }

  // RLS is the membership check. Everything below depends on this row existing.
  const { data: convo } = await supabase
    .from("conversations")
    .select("id, buyer_id, seller_id")
    .eq("id", id)
    .maybeSingle()
  if (!convo) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const iAmBuyer = convo.buyer_id === user.id
  const otherId = iAmBuyer ? convo.seller_id : convo.buyer_id
  const admin = createAdminClient()

  switch (payload.action) {
    case "block": {
      const { error } = await supabase
        .from("user_blocks")
        .upsert({ blocker_id: user.id, blocked_id: otherId }, { onConflict: "blocker_id,blocked_id" })
      if (error) return NextResponse.json({ error: "Could not block" }, { status: 500 })
      // Blocking somebody you are talking to means you are done talking to them.
      // Leaving the thread as well is what the person pressing it expects; they
      // should not have to press two buttons to stop seeing it.
      await supabase
        .from("conversations")
        .update(iAmBuyer ? { buyer_deleted_at: new Date().toISOString() } : { seller_deleted_at: new Date().toISOString() })
        .eq("id", id)
      return NextResponse.json({ ok: true, blocked: true })
    }

    case "unblock": {
      const { error } = await supabase
        .from("user_blocks")
        .delete()
        .eq("blocker_id", user.id)
        .eq("blocked_id", otherId)
      if (error) return NextResponse.json({ error: "Could not unblock" }, { status: 500 })
      return NextResponse.json({ ok: true, blocked: false })
    }

    case "report": {
      const reason = typeof payload.reason === "string" && REASONS.has(payload.reason) ? payload.reason : "other"
      const detail = typeof payload.detail === "string" ? payload.detail.trim().slice(0, 2000) : null
      // Written with the service role on purpose: a report is a message to
      // moderation, and the reporter must not be able to read, edit or withdraw
      // anyone's but their own — which is exactly what the RLS policy allows and
      // what this write has to satisfy anyway.
      const { error } = await admin.from("conversation_reports").insert({
        conversation_id: id,
        reporter_id: user.id,
        reported_id: otherId,
        reason,
        detail,
      })
      // 23505 is the one-report-per-person-per-thread index doing its job. From
      // where the user is standing they reported this conversation and it is
      // reported, which is true — telling them "you already did that" invites
      // them to find another way to say it louder, and reporting twice was
      // never going to make moderation move faster.
      if (error && error.code !== "23505") {
        console.error("[messages/actions] report failed:", error.message)
        return NextResponse.json({ error: "Could not report" }, { status: 500 })
      }
      return NextResponse.json({ ok: true, reported: true })
    }

    case "delete": {
      // Per person. A thread is shared, so pressing delete must not reach into
      // the other party's inbox and remove a conversation they are still having.
      //
      // `.select("id")` makes this a RETURNING update, which is the difference
      // between "the statement ran" and "a row changed". Without it an update
      // that matched nothing — a policy that does not permit it, an id that is
      // not there — comes back with no error and no rows, and this route
      // reported success over a conversation still sitting in the table. That
      // is the delete that survives a refresh, and it could not be told apart
      // from a working one by anything on either side of the wire.
      const { data: touched, error } = await supabase
        .from("conversations")
        .update(iAmBuyer ? { buyer_deleted_at: new Date().toISOString() } : { seller_deleted_at: new Date().toISOString() })
        .eq("id", id)
        .select("id")
      if (!error && (!touched || touched.length === 0)) {
        console.error("[messages/actions] delete matched no rows for", id)
        return NextResponse.json({ ok: true, deleted: true, persisted: false })
      }
      if (error) {
        // The column does not exist yet, so the server cannot remember this.
        // Saying so lets the client remember it instead — see
        // lib/messages/hidden-conversations.ts. Reporting a 500 here is what
        // made delete look like it worked and then undo itself on the next
        // load; reporting success would be a lie of a different shape.
        console.error("[messages/actions] delete failed:", error.message)
        return NextResponse.json({ ok: true, deleted: true, persisted: false })
      }
      return NextResponse.json({ ok: true, deleted: true, persisted: true })
    }

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  }
}

/** Whether this thread's other party is already blocked, for the sheet's state. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 })

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  const { data: convo } = await supabase
    .from("conversations")
    .select("id, buyer_id, seller_id")
    .eq("id", id)
    .maybeSingle()
  if (!convo) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const otherId = convo.buyer_id === user.id ? convo.seller_id : convo.buyer_id
  const { data } = await supabase
    .from("user_blocks")
    .select("blocked_id")
    .eq("blocker_id", user.id)
    .eq("blocked_id", otherId)
    .maybeSingle()

  return NextResponse.json({ blocked: !!data })
}
