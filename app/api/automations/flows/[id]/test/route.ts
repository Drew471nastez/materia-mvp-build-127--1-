import { NextResponse } from "next/server"
import { cleanSteps, signedInCreator } from "@/lib/automations/flow-io"
import { drawFlowEmail } from "@/lib/automations/flow-preview"
import { rateLimit } from "@/lib/api/rate-limit"

export const runtime = "nodejs"

/**
 * One email of a flow, as it is in the builder right now (saved or not), to
 * the creator's own account address and nowhere else: a test that could go
 * to any address would be a way to send mail as Storelib to anyone.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await signedInCreator()
  if (!me) return NextResponse.json({ error: "Sign in again." }, { status: 401 })
  if (!me.userEmail) return NextResponse.json({ error: "Your account has no email address to send a test to." }, { status: 400 })

  const limited = await rateLimit({
    bucket: "flow-test",
    subjects: [me.creatorId],
    windows: [{ limit: 10, seconds: 600 }, { limit: 40, seconds: 86400 }],
    message: "That is a lot of tests. Try again in a few minutes.",
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
  if (!step || step.type !== "email") return NextResponse.json({ error: "Choose an email to test." }, { status: 400 })
  if (!step.config.subject.trim()) return NextResponse.json({ error: "Give the email a subject first." }, { status: 400 })

  /* Filled and branded exactly as a real send is (lib/automations/flow-preview). */
  const drawn = await drawFlowEmail({ flowId: id, creatorId: me.creatorId, to: me.userEmail, step, product: body.product })
  const result = await drawn.mailer.send({ to: me.userEmail, fromName: drawn.identity.fromName, replyTo: drawn.identity.replyTo, subject: `Test: ${drawn.subject}`, html: drawn.html, text: drawn.text, headers: drawn.headers })
  if (!result.success) return NextResponse.json({ error: "The test could not be sent. Try again in a minute." }, { status: 502 })
  return NextResponse.json({ ok: true, to: me.userEmail })
}
