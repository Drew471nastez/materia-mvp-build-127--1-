import { NextResponse } from "next/server"
import { handoffDeps } from "@/lib/handoff/deps"
import { metaOf, renewHandoff, revokeHandoff } from "@/lib/handoff/server"
import { signedOutAnswer } from "@/lib/businesses/server"

/**
 * One open claim link, from Settings, Team.
 *
 * POST   { send?: boolean }: a new link (the old one stops working and the
 *        expiry starts again), emailed again when `send` is set.
 * DELETE revoke it: the link stops working at once.
 *
 * Only the business it belongs to, signed in (lib/handoff/server).
 */
export const dynamic = "force-dynamic"
const NO_STORE = { "Cache-Control": "no-store" }

type Params = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Params) {
  const deps = handoffDeps()
  const user = await deps.requestUser(request)
  if (!user) return signedOutAnswer(request, NextResponse.json({ error: "Sign in first." }, { status: 401, headers: NO_STORE }))
  const limited = await deps.rateLimit({
    bucket: "handoff-renew",
    subjects: [`user:${user.id}`],
    windows: [
      { limit: 10, seconds: 3600 },
      { limit: 30, seconds: 86400 },
    ],
    message: "Too many new links just now. Try again in an hour.",
  })
  if (limited) return limited
  const { id } = await params
  const body = (await request.json().catch(() => null)) as { send?: unknown } | null
  const out = await renewHandoff(deps, user, id, { send: body?.send === true }, metaOf(request))
  if (out.ok === false) return NextResponse.json({ error: out.error }, { status: out.status, headers: NO_STORE })
  return NextResponse.json({ link: out.link, pending: out.pending, emailed: out.emailed }, { headers: NO_STORE })
}

export async function DELETE(request: Request, { params }: Params) {
  const deps = handoffDeps()
  const user = await deps.requestUser(request)
  if (!user) return signedOutAnswer(request, NextResponse.json({ error: "Sign in first." }, { status: 401, headers: NO_STORE }))
  const { id } = await params
  const out = await revokeHandoff(deps, user, id, metaOf(request))
  if (out.ok === false) return NextResponse.json({ error: out.error }, { status: out.status, headers: NO_STORE })
  return NextResponse.json({ ok: true }, { headers: NO_STORE })
}
