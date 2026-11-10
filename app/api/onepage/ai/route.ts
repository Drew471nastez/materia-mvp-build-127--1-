import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { authUnavailableResponse, routeUser } from "@/lib/auth/route-user"
import { onePageActor } from "@/lib/team/onepage"
import { addressSubject, rateLimit } from "@/lib/api/rate-limit"
import { AI_EDIT_TOOLS, MAX_AI_EDITS, aiPageSummary, readAiEdit, type AiEdit, type AiEditPage } from "@/lib/onepage/ai-edits"

/**
 * POST /api/onepage/ai (round AR, lib/onepage/ai-edits): "add my TikTok
 * @ana", "change the shop link to ana.com/shop", "show my socials as
 * buttons". The model is given the page's social icons, its social links
 * block and its link blocks, and the six edits it may name as tools. The
 * answer is the edits it named, read into their shapes and nothing else:
 * the editor applies them to the page it holds with the same checks a
 * change by hand goes through (applyAiEdits), so they land in its Undo and
 * are saved by its own Save, to the page this session may edit
 * (lib/team/onepage, the same as PUT /api/onepage).
 *
 * Signed in only, a few a minute. The key is the server's
 * (ANTHROPIC_API_KEY) and never leaves it; without one the answer says so in
 * plain words (503) and nothing is sent anywhere.
 */
export const dynamic = "force-dynamic"
const NO_STORE = { "Cache-Control": "no-store" }
const MAX_INSTRUCTION = 600

const SYSTEM = [
  "You edit a creator's OnePage (a link in bio page) on Storelib.",
  "You can only change its social icons, its social links block and its link blocks, with the tools given.",
  "Use the tools for every change asked for and nothing else. Use the link ids given; never invent one.",
  "If the request asks for anything else, make no change and say in one short sentence what you can change.",
  "Reply in one short plain sentence, without em dashes.",
].join(" ")

export async function POST(request: Request) {
  const who = await routeUser()
  if (who.kind === "unavailable") return authUnavailableResponse()
  const user = who.kind === "user" ? who.user : null
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401, headers: NO_STORE })

  const limited = await rateLimit({
    bucket: "onepage-ai",
    subjects: [`user:${user.id}`, addressSubject(request)],
    windows: [
      { limit: 10, seconds: 60 },
      { limit: 120, seconds: 86400 },
    ],
    message: "That is a lot of changes at once. Try again in a minute.",
  })
  if (limited) return limited

  const body = (await request.json().catch(() => null)) as { id?: unknown; instruction?: unknown; page?: unknown } | null
  const instruction = typeof body?.instruction === "string" ? body.instruction.trim().slice(0, MAX_INSTRUCTION) : ""
  if (!instruction) return NextResponse.json({ error: "Say what to change." }, { status: 400, headers: NO_STORE })
  if (typeof body?.id !== "string") return NextResponse.json({ error: "The page could not be read." }, { status: 400, headers: NO_STORE })

  /* Only a page this session may edit: its owner, or a team member acting for the store (the same rule as saving it). */
  const supabase = await createClient()
  const actor = await onePageActor(supabase, user.id)
  if (actor instanceof NextResponse) return actor
  const { data: row } = await actor.db.from("onepages").select("id").eq("id", body.id).eq("owner_id", actor.pageOwnerId).maybeSingle()
  if (!row) return NextResponse.json({ error: "OnePage not found" }, { status: 404, headers: NO_STORE })

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "The AI is not set up on Storelib yet. Your links can still be changed by hand." }, { status: 503, headers: NO_STORE })
  }

  /* What the editor holds now (unsaved changes included), read only for the summary the model sees. */
  const sent = (body.page && typeof body.page === "object" ? body.page : {}) as Partial<AiEditPage>
  const page: AiEditPage = {
    social_links: sent.social_links && typeof sent.social_links === "object" ? sent.social_links : {},
    draft_blocks: Array.isArray(sent.draft_blocks) ? sent.draft_blocks.slice(0, 300) : [],
  }

  try {
    const [{ anthropic }, { modelFor }] = await Promise.all([import("@/lib/sites/agent/anthropic-provider"), import("@/lib/sites/agent/provider")])
    const answer = await anthropic().messages.create({
      model: process.env.ONEPAGE_AI_MODEL || modelFor("anthropic", "fast"),
      max_tokens: 1024,
      system: SYSTEM,
      tools: AI_EDIT_TOOLS as unknown as Parameters<ReturnType<typeof anthropic>["messages"]["create"]>[0]["tools"],
      messages: [{ role: "user", content: `The page now:\n${aiPageSummary(page)}\n\nThe creator asks: ${instruction}` }],
    })
    const edits: AiEdit[] = []
    let reply = ""
    for (const part of answer.content) {
      if (part.type === "tool_use") {
        const edit = readAiEdit({ ...(part.input as Record<string, unknown>), op: part.name })
        if (edit && edits.length < MAX_AI_EDITS) edits.push(edit)
      } else if (part.type === "text") {
        reply += part.text
      }
    }
    return NextResponse.json({ edits, reply: reply.replace(/—/g, ",").trim().slice(0, 400) }, { headers: NO_STORE })
  } catch (error) {
    console.error("OnePage AI error:", (error as { status?: number }).status ?? (error as Error).name)
    return NextResponse.json({ error: "The AI did not answer. Try again in a moment." }, { status: 502, headers: NO_STORE })
  }
}
