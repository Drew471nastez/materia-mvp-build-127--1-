import { NextResponse, type NextRequest } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { LIMITS, callerAddress, rateLimit } from "@/lib/api/rate-limit"
import { verifyIdHandoff } from "@/lib/payments/stripe/id-handoff"
import { idHandoffStatus, idHandoffUpload } from "@/lib/payments/stripe/own-form"
import { PaymentsProblem } from "@/lib/payments/errors"
import type { PaymentsCreatorRef } from "@/lib/payments/stripe/connect"

/**
 * VERIFY ID ON A PHONE, NOT SIGNED IN.
 *
 *   GET  ?t=<token>                  { front, back, wanted }
 *   POST multipart { t, side, file } { front, back }
 *
 * The token (lib/payments/stripe/id-handoff.ts) names one creator and lets
 * the phone add photos of their ID for thirty minutes. Nothing else: no
 * details are read back, nothing but the ID document can be sent, and the
 * creator comes from the signature, never from the request.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NO_STORE = { "cache-control": "no-store", "x-robots-tag": "noindex" }

async function creatorFor(token: string | null): Promise<PaymentsCreatorRef | null> {
  const id = verifyIdHandoff(token)
  if (!id) return null
  const { data } = await createAdminClient().from("creators").select("id, user_id").eq("id", id).maybeSingle()
  const row = data as { id: string; user_id: string } | null
  return row ? { id: row.id, userId: row.user_id, email: null } : null
}

function gone() {
  return NextResponse.json({ error: "This link has expired. Scan the new code on your computer." }, { status: 410, headers: NO_STORE })
}

function problem(e: unknown) {
  if (e instanceof PaymentsProblem) return NextResponse.json({ error: e.userMessage }, { status: e.status, headers: NO_STORE })
  console.error("[payments handoff]", e instanceof Error ? e.message.slice(0, 160) : "unknown")
  return NextResponse.json({ error: "That did not go through. Try again in a moment." }, { status: 500, headers: NO_STORE })
}

export async function GET(request: NextRequest) {
  const creator = await creatorFor(request.nextUrl.searchParams.get("t"))
  if (!creator) return gone()
  const limited = await rateLimit({ bucket: "payments-read", subjects: [creator.id], windows: LIMITS.paymentsRead, message: "Too many requests. Wait a minute and try again." })
  if (limited) return limited
  try {
    return NextResponse.json(await idHandoffStatus(creator), { headers: NO_STORE })
  } catch (e) {
    return problem(e)
  }
}

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null)
  const creator = await creatorFor(typeof form?.get("t") === "string" ? (form?.get("t") as string) : null)
  if (!creator) return gone()
  const limited = await rateLimit({
    bucket: "payments-setup",
    subjects: [creator.id, callerAddress(request) ?? ""],
    windows: LIMITS.paymentsSetup,
    message: "That is a lot of photos in a short time. Wait a few minutes and try again.",
  })
  if (limited) return limited
  try {
    const file = form?.get("file")
    return NextResponse.json(await idHandoffUpload(creator, { side: String(form?.get("side") ?? ""), file: file instanceof File ? file : null }), { headers: NO_STORE })
  } catch (e) {
    return problem(e)
  }
}
