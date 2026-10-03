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

import { createAdminClient } from "@/lib/supabase/admin"
import { creatorSitePlan } from "@/lib/sites/plan-server"
import { currentCreatorId, getSite } from "@/lib/sites/projects"
import { plainRunError } from "@/lib/sites/agent/plain-errors"
import { chooseTier } from "@/lib/sites/agent/models"
import { canAnswer, modelFor, resolveForCreator } from "@/lib/sites/agent/provider"
import { agentRateLimit } from "@/lib/sites/rate-limit"
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

  /* Or the creator's own AI, when they have connected one. */
  if (!(await canAnswer(creatorId))) {
    // 503, not 500: nothing is broken, the deployment is not configured. The
    // editor shows this sentence rather than "something went wrong".
    return NextResponse.json(
      { error: "Storelib AI is not set up on this deployment yet: no model key is set." },
      { status: 503 },
    )
  }

  /**
   * BEFORE the model is reached, and before the stream opens. A limit checked
   * after the request has started is a limit that bills for what it refused —
   * and a 429 with a plain body is something the editor can show, where an
   * error mid-stream is not.
   */
  const limited = await agentRateLimit(creatorId)
  if (limited) return NextResponse.json({ error: limited }, { status: 429 })

  /**
   * ONE RUN PER SITE AT A TIME.
   *
   * Now that a run survives its connection, a creator can be looking at three
   * places it is still going: the tab that started it, a second tab, and a
   * phone. The editor disables its own composer while a run is active, but
   * that is one browser's opinion — it cannot speak for another device, and
   * the window between "send" and "the other tab notices" is exactly where a
   * double-send lands.
   *
   * Two agents editing one project is not a merge conflict the compare-and-swap
   * can resolve into anything sensible: both read the same files, both write
   * whole changed sets, and the loser's work is discarded after it has been
   * paid for. Refusing here costs a message; not refusing costs a bill and a
   * result nobody asked for.
   *
   * 409 rather than 429: nothing is rate-limited, the resource is busy.
   */
  const { data: active } = await createAdminClient().rpc("site_active_run", { p_site_id: siteId })
  if ((active as unknown[] | null)?.length) {
    return NextResponse.json(
      { error: "This site is already being edited. Wait for that to finish, or stop it first." },
      { status: 409 },
    )
  }

  const plan = await creatorSitePlan(creatorId)

  /**
   * esbuild for `run_build`.
   *
   * NATIVE esbuild here, esbuild-wasm in the browser worker — pinned to the
   * same exact version, which tests/sites.test.ts enforces. It is the same Go
   * program compiled two ways, given the same options by the same
   * lib/sites/bundle.ts, so the verdict the agent gets is the verdict the
   * preview will reach.
   *
   * esbuild-wasm was the obvious choice and would have failed EVERY run in
   * production. Under Node it does not instantiate the wasm itself — it
   * SPAWNS A CHILD PROCESS that loads esbuild.wasm from its package directory,
   * and that file is not traced into the serverless bundle. A subprocess plus
   * a 12MB WebAssembly load per turn, on a file that is not there. Native
   * builds the starter in 12ms.
   */
  const esbuild = await import("esbuild")

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      /**
       * THE READER LEAVING IS NOT AN ERROR.
       *
       * A phone locking, a tab closing, a tunnel, a switch to another app —
       * each ends the response stream, and `enqueue` on a closed controller
       * throws. That throw used to escape into the catch below and end the
       * run, so the work of the last two minutes was discarded on the last
       * turn before it would have been saved.
       *
       * Once nobody is listening we stop talking and let the run finish. The
       * files are still written, the transcript is still recorded, and the
       * creator who comes back finds the edit made instead of "nothing was
       * changed."
       */
      let listening = true
      const send = (event: AgentEvent) => {
        if (!listening) return
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
        } catch {
          listening = false
        }
      }

      try {
        const resolved = await resolveForCreator(creatorId, { requested: undefined })
        for await (const event of runAgent({
          siteId,
          creatorId,
          plan,
          prompt,
          /**
           * CHATGPT, like every Storelib AI run now (lib/sites/agent/provider.ts),
           * and the stronger model when the change is big: this is the harder
           * half of the product.
           *
           * The model comes from here rather than from inside run.ts because a
           * model id is one VENDOR's name for a difficulty. `chooseTier`
           * answers the difficulty question exactly as `chooseModel` did; this
           * turns that answer into the right vendor's id.
           */
          /* On the creator's own AI when they have connected one, which also leaves the run out of the monthly AI edits. */
          provider: resolved.provider,
          pickModel: (fileCount) => modelFor(resolved.id, chooseTier(prompt, fileCount)),
          esbuild,
          /**
           * NOT `request.signal`. The client's connection is not permission
           * to keep working — Stop is an explicit act, and it travels through
           * `cancel_requested` so it survives the trip between requests.
           */
        })) {
          send(event)
        }
      } catch (error) {
        /* The creator's own key refusing is said in its words; anything else in plain ones (lib/sites/agent/plain-errors). */
        send({ type: "error", message: plainRunError(error, "code agent", "The edit failed. Nothing was changed.") })
      } finally {
        // Closing an already-closed controller throws too, and by this point
        // the run has finished and been recorded — there is nothing left to
        // fail at.
        try {
          controller.close()
        } catch {
          /* the reader was already gone */
        }
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
