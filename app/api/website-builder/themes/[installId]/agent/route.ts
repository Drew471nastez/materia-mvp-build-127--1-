/**
 * The theme editor's AI endpoint.
 *
 * THE KEY NEVER LEAVES THIS PROCESS. `OPENAI_API_KEY` is read inside
 * lib/sites/agent/openai-provider, which is `server-only` — a client component
 * importing it fails the build rather than shipping the key to every visitor.
 *
 * The response is newline-delimited JSON, not one body at the end: the whole
 * point is that the page changes WHILE the model works, so each operation has
 * to reach the browser the moment it is made.
 *
 * NOTHING HERE WRITES TO THE DATABASE. The editor holds unsaved work — a
 * draft, an undo stack, a dirty flag — and an endpoint that wrote sections
 * behind it would diverge from what the person is looking at. It edits the
 * state the browser sent and streams back operations; Save stays the Save
 * button. See lib/website-builder/agent/loop.ts.
 */

import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"
import { MissingKeyError, openAIProvider } from "@/lib/sites/agent/openai-provider"
import { agentRateLimit } from "@/lib/sites/rate-limit"
import { themeAgent, type ThemeAgentEvent } from "@/lib/website-builder/agent/loop"
import { ADDABLE_SECTIONS } from "@/lib/website-builder/section-schemas"
import { DEFAULT_MODEL, STRONG_MODEL } from "@/lib/sites/agent/models"
import { classifyRequest } from "@/lib/website-builder/agent/ambition"
import { completeThemeExchange, startThemeExchange } from "@/lib/website-builder/agent/chat"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
/** A handful of section edits and a sentence. No build, so no minutes. */
export const maxDuration = 120

const MAX_PROMPT = 2_000

const BlockSchema = z.object({
  id: z.string().min(1).max(128),
  type: z.string().min(1).max(64),
  settings: z.record(z.unknown()),
})

const SectionSchema = z.object({
  id: z.string().min(1).max(128),
  type: z.string().min(1).max(64),
  name: z.string().max(256),
  settings: z.record(z.unknown()),
  blocks: z.array(BlockSchema).max(500).optional(),
  hidden: z.boolean().optional(),
})

const BodySchema = z.object({
  prompt: z.string().min(1).max(MAX_PROMPT),
  page: z.string().min(1).max(64),
  sections: z.array(SectionSchema).max(500),
  settings: z.record(z.unknown()),
  /** Which section the creator has open, so "this section" resolves. */
  selectedSectionId: z.string().max(128).optional(),
  /**
   * Whether that section is the ONLY thing this edit may change. Sent by the
   * panel, which shows it as a chip the creator can clear — so the scope of an
   * edit is something they set and can see, not something inferred from how
   * the sentence was phrased.
   */
  lockToSelection: z.boolean().optional(),
})

export async function POST(request: NextRequest, context: { params: Promise<{ installId: string }> }) {
  const { installId } = await context.params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Sign in to use this." }, { status: 401 })

  const { data: creator } = await supabase
    .from("creators")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle()
  if (!creator) return NextResponse.json({ error: "Only creators can edit themes." }, { status: 403 })

  /**
   * RLS decides. A theme somebody else owns reads as absent, which is the
   * right answer to both "does not exist" and "not yours".
   */
  const { data: install } = await supabase
    .from("store_theme_installs")
    .select("id")
    .eq("id", installId)
    .eq("creator_id", (creator as { id: string }).id)
    .maybeSingle()
  if (!install) return NextResponse.json({ error: "Theme not found." }, { status: 404 })

  if (!process.env.OPENAI_API_KEY) {
    // 503, not 500: nothing is broken, the deployment is not configured.
    return NextResponse.json(
      { error: "Storelib AI is not configured yet — no model key is set." },
      { status: 503 },
    )
  }

  /**
   * BEFORE the model is reached and before the stream opens. A limit checked
   * after the request has started bills for what it refused, and a plain 429
   * body is something the editor can show where an error mid-stream is not.
   */
  const limited = await agentRateLimit((creator as { id: string }).id)
  if (limited) return NextResponse.json({ error: limited }, { status: 429 })

  const parsed = BodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Describe what you want changed." }, { status: 400 })
  }
  const body = parsed.data

  /**
   * The question is recorded BEFORE the model is reached, so a run that dies —
   * a crash, a timeout, a closed tab — still leaves the request in the
   * transcript. A transcript that only records what succeeded is one where
   * nobody can see the model was asked the same thing three times.
   */
  await startThemeExchange({ installId, pageKey: body.page, prompt: body.prompt })

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      /**
       * THE READER LEAVING IS NOT AN ERROR. A tab closing ends the response,
       * and `enqueue` on a closed controller throws. Once nobody is listening
       * we stop talking rather than letting that throw end the run.
       */
      let listening = true
      const send = (event: ThemeAgentEvent) => {
        if (!listening) return
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"))
        } catch {
          listening = false
        }
      }

      try {
        /**
         * WHAT THIS REQUEST IS ASKING FOR, in this editor's own vocabulary.
         *
         * It used to call the CODE agent's classifier, which reads a language
         * about files and dashboards that nobody types here. Measured: "build
         * me a very good complex section" classified as small and got the
         * cheap model, while "add a pricing section" classified as medium and
         * got the strong one. Ambition was being penalised.
         */
        const shape = classifyRequest(body.prompt)

        const loop = themeAgent({
          provider: openAIProvider,
          model: shape.strong ? STRONG_MODEL : DEFAULT_MODEL,
          maxTurns: shape.maxTurns,
          prompt: body.prompt,
          page: body.page,
          state: { sections: body.sections, settings: body.settings },
          addable: ADDABLE_SECTIONS,
          selectedSectionId: body.selectedSectionId,
          lockToSelection: body.lockToSelection === true && !!body.selectedSectionId,
          /**
           * READ THROUGH THE USER'S OWN CLIENT, so RLS decides what the model
           * is shown. The service role would read every creator's catalogue
           * and rely on this route's filter being right — one mistake there
           * and somebody else's products end up in a model's context.
           *
           * Never throws: a catalogue that will not load is reported to the
           * model as "not available" and the run carries on writing copy that
           * does not depend on it. Failing the edit over it would be worse.
           */
          readStore: async () => {
            try {
              const [{ data: profile }, { data: rows, count }] = await Promise.all([
                supabase
                  .from("creators")
                  .select("slug, store_published")
                  .eq("id", (creator as { id: string }).id)
                  .maybeSingle(),
                supabase
                  .from("products")
                  .select("title, type, price_cents, status", { count: "exact" })
                  .eq("creator_id", (creator as { id: string }).id)
                  .order("created_at", { ascending: false })
                  .limit(30),
              ])

              type Row = { title: string; type: string; price_cents: number; status: string }
              const products = ((rows as Row[] | null) ?? []).map((p) => ({
                title: p.title,
                type: p.type,
                priceCents: p.price_cents,
                published: p.status === "published",
              }))

              return {
                storeName: (profile as { slug?: string } | null)?.slug ?? "this store",
                live: (profile as { store_published?: boolean } | null)?.store_published === true,
                totalProducts: count ?? products.length,
                publishedProducts: products.filter((p) => p.published).length,
                products,
              }
            } catch {
              return null
            }
          },
          // Groups this theme's requests for the provider's prompt cache. A
          // theme id, never anything about the person.
          cacheKey: `theme:${installId}`,
          signal: request.signal,
        })

        let step = await loop.next()
        while (!step.done) {
          send(step.value)
          step = await loop.next()
        }

        const result = step.value
        if (result.status === "failed") {
          send({ type: "error", message: result.error ?? "The edit failed." })
        } else {
          send({ type: "message", text: result.message || "Done." })
        }

        /**
         * Recorded from the RESULT, not from what was streamed. The two agree
         * today; if they ever stop, the transcript should say what the run
         * actually did rather than what a browser happened to receive before
         * somebody closed the tab.
         */
        await completeThemeExchange({
          installId,
          pageKey: body.page,
          reply: result.message || (result.status === "failed" ? "" : "Done."),
          ops: result.ops,
          error: result.status === "failed" ? result.error : null,
        })
      } catch (thrown) {
        send({
          type: "error",
          message:
            thrown instanceof MissingKeyError
              ? "Storelib AI is not configured yet — no model key is set."
              : thrown instanceof Error
                ? thrown.message
                : "The edit failed.",
        })
      } finally {
        try {
          controller.close()
        } catch {
          // Already closed because the reader left. Nothing to do.
        }
      }
    },
  })

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store, no-transform",
    },
  })
}
