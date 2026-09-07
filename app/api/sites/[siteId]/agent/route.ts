/**
 * The agent endpoint.
 *
 * THE KEY NEVER LEAVES THIS PROCESS. The browser posts a sentence and receives
 * a stream of events; `OPENAI_API_KEY` is read inside
 * lib/sites/agent/openai-provider, which is `server-only` — a client component
 * importing it fails the build rather than shipping the key to every visitor.
 * A generated site never sees it either: published sites are static output.
 *
 * The response is a stream of newline-delimited JSON events, not one JSON body
 * at the end. A tool loop takes tens of seconds, and a spinner with nothing
 * behind it for forty seconds is indistinguishable from a hang — which is the
 * exact failure this editor already had once with its disabled send button.
 */

import { type NextRequest, NextResponse } from "next/server"

import { creatorSitePlan } from "@/lib/sites/plan-server"
import { currentCreatorId, getSite } from "@/lib/sites/projects"
import { MissingKeyError, openAIProvider } from "@/lib/sites/agent/openai-provider"
import { runAgent } from "@/lib/sites/agent/run"
import type { AgentEvent } from "@/lib/sites/agent/types"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
/** A multi-file edit with builds in it genuinely takes minutes. */
export const maxDuration = 300

const MAX_PROMPT = 4_000

export async function POST(request: NextRequest, context: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await context.params

  const creatorId = await currentCreatorId()
  if (!creatorId) {
    return NextResponse.json({ error: "Only creators can edit sites." }, { status: 403 })
  }

  // RLS decides. A site somebody else owns reads as absent, which is the right
  // answer to both "does not exist" and "not yours".
  const site = await getSite(siteId)
  if (!site) return NextResponse.json({ error: "Site not found." }, { status: 404 })

  let body: { prompt?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, MAX_PROMPT) : ""
  if (!prompt) return NextResponse.json({ error: "Describe what you want changed." }, { status: 400 })

  if (!process.env.OPENAI_API_KEY) {
    // 503, not 500: nothing is broken, the deployment is not configured. The
    // editor shows this sentence rather than "something went wrong".
    return NextResponse.json(
      { error: "Storelib AI is not configured yet — no model key is set." },
      { status: 503 },
    )
  }

  const plan = await creatorSitePlan(creatorId)

  /**
   * esbuild for `run_build`, initialised once per invocation.
   *
   * The same esbuild-wasm the editor's worker uses, running under Node here —
   * which is what makes the agent's build verdict the same verdict the preview
   * will reach. See lib/sites/bundle.ts.
   */
  const esbuild = await import("esbuild-wasm")
  await esbuild.initialize({}).catch(() => {
    /* already initialised in this warm lambda; initialize() throws on a second call */
  })

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: AgentEvent) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))

      try {
        for await (const event of runAgent({
          siteId,
          creatorId,
          plan,
          prompt,
          provider: openAIProvider,
          esbuild,
          signal: request.signal,
        })) {
          send(event)
        }
      } catch (error) {
        send({
          type: "error",
          message:
            error instanceof MissingKeyError
              ? "Storelib AI is not configured yet — no model key is set."
              : "The edit failed. Nothing was changed.",
        })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      // Vercel and some proxies buffer a response without this, which turns a
      // live stream back into one long silence followed by everything at once.
      "X-Accel-Buffering": "no",
    },
  })
}
