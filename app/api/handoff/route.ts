import { NextResponse } from "next/server"
import { addressSubject } from "@/lib/api/rate-limit"
import { handoffDeps } from "@/lib/handoff/deps"
import { createHandoff, metaOf, panelFor } from "@/lib/handoff/server"

/**
 * Settings, Team: handing this business over.
 *
 * GET   what the panel shows: whether this business can be handed over, what
 *       stops it, the open link (never the link itself, which is not kept)
 *       and its record.
 * POST  { email?, days?, keepFounder?, founderAccess? }: a claim link,
 *       answered once with the link; emailed when an email is given.
 *
 * Signed in as the business itself (the founder switched into it), and only
 * a business that is not its login's first (lib/handoff/server founderScope).
 */
export const dynamic = "force-dynamic"
const NO_STORE = { "Cache-Control": "no-store" }

export async function GET(request: Request) {
  const deps = handoffDeps()
  const user = await deps.requestUser(request)
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401, headers: NO_STORE })
  const panel = await panelFor(deps, user.id)
  return NextResponse.json(panel, { status: panel.ready ? 200 : 503, headers: NO_STORE })
}

export async function POST(request: Request) {
  const deps = handoffDeps()
  const user = await deps.requestUser(request)
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401, headers: NO_STORE })
  const limited = await deps.rateLimit({
    bucket: "handoff-create",
    subjects: [`user:${user.id}`, addressSubject(request)],
    windows: [
      { limit: 5, seconds: 3600 },
      { limit: 20, seconds: 86400 },
    ],
    message: "You have made a few links already. Try again in an hour.",
  })
  if (limited) return limited
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const out = await createHandoff(deps, user, body ?? {}, metaOf(request))
  if (out.ok === false) return NextResponse.json({ error: out.error }, { status: out.status, headers: NO_STORE })
  return NextResponse.json({ link: out.link, pending: out.pending, emailed: out.emailed }, { headers: NO_STORE })
}
