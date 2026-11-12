import { NextResponse, type NextRequest } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { rateLimit } from "@/lib/api/rate-limit"
import { STAGE_WORDS, cleanCreatorNote, isInquiry, reasonWords, stageOf } from "@/lib/stripe/dispute-facts"
import { routeUser, signedOutOrRetry } from "@/lib/auth/route-user"

/**
 * ===========================================================================
 *  /api/payments/disputes: A CREATOR'S OWN DISPUTES
 * ===========================================================================
 *   GET   the signed in creator's disputes, newest first, in Storelib's words
 *   POST  { id, note }  what proves the sale, for Storelib to send to the bank
 *
 * The creator is the signed in person's own row; a dispute is found by its
 * Storelib id and that creator together, so nobody reaches another
 * creator's case by guessing an id. Nothing here names a Stripe id, and no
 * money moves: taking back and giving back happen in the webhook
 * (app/api/stripe/webhook, lib/stripe/disputes).
 *
 * Before run-now part 82 there is no dispute record, so the list is the
 * creator's disputed orders, without dates or a way to add evidence.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NO_STORE = { "cache-control": "no-store" }

export interface CreatorDispute {
  id: string
  amountMinor: number
  currency: string
  productTitle: string | null
  reason: string
  stage: ReturnType<typeof stageOf>
  label: string
  line: string
  tone: "neutral" | "attention" | "critical" | "good"
  openedAt: string | null
  evidenceDueBy: string | null
  closedAt: string | null
  noteSent: boolean
  canAddNote: boolean
}

async function creatorId(): Promise<string | null> {
  const who = await routeUser({ fresh: true })
  const user = who.kind === "user" ? who.user : null
  if (!user) return null
  const { data } = await createAdminClient().from("creators").select("id").eq("user_id", user.id).maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}

type Row = {
  id: string
  amount_minor: number | null
  currency: string | null
  product_title: string | null
  reason: string | null
  status: string
  opened_at: string | null
  evidence_due_by: string | null
  closed_at: string | null
  creator_note_at: string | null
}

function shown(r: Row): CreatorDispute {
  const stage = stageOf(r.status)
  const words = STAGE_WORDS[stage]
  const open = !r.closed_at
  return {
    id: r.id,
    amountMinor: Number(r.amount_minor) || 0,
    currency: (r.currency || "usd").toLowerCase(),
    productTitle: r.product_title,
    reason: reasonWords(r.reason),
    stage,
    label: words.label,
    line: words.line,
    tone: words.tone,
    openedAt: r.opened_at,
    evidenceDueBy: open ? r.evidence_due_by : null,
    closedAt: r.closed_at,
    noteSent: !!r.creator_note_at,
    /* Evidence helps only while the bank is still deciding; an inquiry is answered too. */
    canAddNote: open && (stage === "respond" || stage === "inquiry" || isInquiry(r.status)),
  }
}

export async function GET() {
  const id = await creatorId()
  if (!id) return signedOutOrRetry(NextResponse.json({ error: "Sign in to see your disputes." }, { status: 401, headers: NO_STORE }))
  const db = createAdminClient()

  const recorded = await db
    .from("payment_disputes")
    .select("id, amount_minor, currency, product_title, reason, status, opened_at, evidence_due_by, closed_at, creator_note_at")
    .eq("creator_id", id)
    .order("opened_at", { ascending: false })
    .limit(50)
  if (!recorded.error) {
    return NextResponse.json({ disputes: ((recorded.data ?? []) as Row[]).map(shown), recorded: true }, { headers: NO_STORE })
  }

  /* Before part 82: the disputed orders, so an open case is still shown. */
  const { data: products } = await db.from("products").select("id, title").eq("creator_id", id)
  const titles = new Map(((products ?? []) as Array<{ id: string; title: string | null }>).map((p) => [p.id, p.title]))
  if (titles.size === 0) return NextResponse.json({ disputes: [], recorded: false }, { headers: NO_STORE })
  const { data: orders } = await db
    .from("orders")
    .select("id, product_id, amount_cents, currency, created_at")
    .in("product_id", [...titles.keys()])
    .eq("status", "disputed")
    .order("created_at", { ascending: false })
    .limit(50)
  const disputes = ((orders ?? []) as Array<{ id: string; product_id: string; amount_cents: number | null; currency: string | null; created_at: string }>).map((o) => ({
    ...shown({ id: o.id, amount_minor: o.amount_cents, currency: o.currency, product_title: titles.get(o.product_id) ?? null, reason: null, status: "under_review", opened_at: null, evidence_due_by: null, closed_at: null, creator_note_at: null }),
    canAddNote: false,
  }))
  return NextResponse.json({ disputes, recorded: false }, { headers: NO_STORE })
}

export async function POST(request: NextRequest) {
  const id = await creatorId()
  if (!id) return signedOutOrRetry(NextResponse.json({ error: "Sign in to add evidence." }, { status: 401, headers: NO_STORE }))

  const limited = await rateLimit({
    bucket: "dispute-note",
    subjects: [id],
    windows: [{ limit: 10, seconds: 600 }, { limit: 40, seconds: 86400 }],
    message: "That is a lot of updates in a short time. Wait a few minutes and try again.",
  })
  if (limited) return limited

  const body = ((await request.json().catch(() => null)) ?? {}) as { id?: unknown; note?: unknown }
  const disputeId = typeof body.id === "string" && /^[0-9a-f-]{36}$/i.test(body.id) ? body.id : null
  const note = cleanCreatorNote(body.note)
  if (!disputeId) return NextResponse.json({ error: "Choose a dispute." }, { status: 400, headers: NO_STORE })
  if (!note) return NextResponse.json({ error: "Write a few words about the sale (at least 10 characters)." }, { status: 400, headers: NO_STORE })

  const db = createAdminClient()
  const { data: row, error } = await db
    .from("payment_disputes")
    .select("id, status, closed_at")
    .eq("id", disputeId)
    .eq("creator_id", id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: "Disputes are not set up yet. Write to support@storelib.com with the order." }, { status: 503, headers: NO_STORE })
  if (!row) return NextResponse.json({ error: "That dispute was not found." }, { status: 404, headers: NO_STORE })
  if ((row as { closed_at: string | null }).closed_at) return NextResponse.json({ error: "This dispute is already closed." }, { status: 409, headers: NO_STORE })

  const saved = await db
    .from("payment_disputes")
    .update({ creator_note: note, creator_note_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", disputeId)
    .eq("creator_id", id)
  if (saved.error) {
    console.error("[disputes] note not saved", saved.error.message)
    return NextResponse.json({ error: "We couldn't save that just now. Try again in a moment." }, { status: 500, headers: NO_STORE })
  }
  return NextResponse.json({ ok: true }, { headers: NO_STORE })
}
