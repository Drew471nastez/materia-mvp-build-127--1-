import { NextResponse } from "next/server"
import { cleanSteps, signedInCreator } from "@/lib/automations/flow-io"
import { drawFlowEmail } from "@/lib/automations/flow-preview"
import { rateLimit } from "@/lib/api/rate-limit"

export const runtime = "nodejs"

/**
 * PREVIEW: one email of a flow as it is in the builder right now (saved or
 * not), drawn exactly as a send draws it, and handed back to be shown. The
 * step is cleaned as a save cleans it, so what is shown is what would be
 * kept. Nothing is sent and nothing is written.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await signedInCreator()
  if (!me) return NextResponse.json({ error: "Sign in again." }, { status: 401 })

  const limited = await rateLimit({
    bucket: "flow-preview",
    subjects: [me.creatorId],
    windows: [{ limit: 60, seconds: 600 }],
    message: "That is a lot of previews. Try again in a few minutes.",
  })
  if (limited) return limited

  let body: { step?: unknown; product?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 })
  }
  const { data: flow } = await me.supabase.from("email_flows").select("id").eq("id", id).eq("creator_id", me.creatorId).maybeSingle()
  if (!flow) return NextResponse.json({ error: "This flow no longer exists." }, { status: 404 })

  const [step] = cleanSteps([body.step])
  if (!step || step.type !== "email") return NextResponse.json({ error: "Choose an email to preview." }, { status: 400 })

  try {
    const drawn = await drawFlowEmail({ flowId: id, creatorId: me.creatorId, to: me.userEmail ?? "alex@example.com", step, product: body.product })
    return NextResponse.json(
      { html: drawn.html, subject: drawn.subject, previewText: drawn.previewText, fromName: drawn.identity.fromName },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    console.error("[automations] could not draw a preview:", (error as Error)?.message)
    return NextResponse.json({ error: "The preview could not be drawn. Try again." }, { status: 500 })
  }
}
