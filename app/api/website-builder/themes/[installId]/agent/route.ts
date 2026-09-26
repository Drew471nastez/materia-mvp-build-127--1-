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
 * THE PAGE IS NOT WRITTEN HERE. The editor holds unsaved work — a draft,
 * an undo stack, a dirty flag — and an endpoint that wrote sections behind
 * it would diverge from what the person is looking at. It edits the state
 * the browser sent and streams back operations; Save stays the Save button.
 * See lib/website-builder/agent/loop.ts.
 *
 * The one thing it does store is a section FILE the assistant rewrote
 * (`code.write` below), and that is saved the way the code editor saves: as
 * a draft with a version, never onto the live site, and never a built-in
 * section (lib/agent-access/protected.ts).
 */

import { validateSection } from "@/lib/storelib-ai/validate"
import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"
import { sourceMap } from "@/lib/website-builder/theme-file-drafts"
import { compileSection } from "@/lib/storelib-theme"
import { agentMayWrite } from "@/lib/agent-access/protected"
import { saveThemeFile } from "@/lib/website-builder/save-theme-file"
import { customAddableSections, customSectionSchemas } from "@/lib/website-builder/storelib-schemas"
// `MissingKeyError` only: the provider itself now comes from the resolver.
import { MissingKeyError } from "@/lib/sites/agent/openai-provider"
import { agentRateLimit } from "@/lib/sites/rate-limit"
import { themeAgent, type ThemeAgentEvent } from "@/lib/website-builder/agent/loop"
import { ADDABLE_SECTIONS } from "@/lib/website-builder/section-schemas"
import { describeAnthropicError } from "@/lib/sites/agent/anthropic-provider"
import {
  isConfigured,
  NoProviderConfiguredError,
  resolveProvider,
  substitutionNotice,
} from "@/lib/sites/agent/provider"
import { classifyRequest } from "@/lib/website-builder/agent/ambition"
import { reviewImages } from "@/lib/sites/agent/attachments"
import { completeThemeExchange, openThemeConversation, startThemeExchange } from "@/lib/website-builder/agent/chat"
import { keepImages } from "@/lib/website-builder/agent/attachment-store"
import { withPictureNote } from "@/lib/website-builder/ask-attach"
import { recentMessages } from "@/lib/website-builder/agent/memory"
import { getWebsiteShareUrl } from "@/lib/url-helpers"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
/** A handful of section edits and a sentence. No build, so no minutes. */
export const maxDuration = 120

/** Aborts when either does: the reader leaving, or the deadline. */
function eitherSignal(a: AbortSignal, b: AbortSignal): AbortSignal {
  const both = new AbortController()
  if (a.aborted || b.aborted) {
    both.abort()
    return both.signal
  }
  const stop = () => both.abort()
  a.addEventListener("abort", stop, { once: true })
  b.addEventListener("abort", stop, { once: true })
  return both.signal
}

const MAX_PROMPT = 2_000

/**
 * The route's own lines on the stream, beside the agent's: the id the
 * question was kept under (startThemeExchange), which the panel's Report
 * sends back; or, when it could not be kept, or its pictures could not, a
 * line that says so, and why, so the chat can tell the creator plainly
 * instead of them finding an empty history after a reload.
 */
type RecordedEvent =
  | { type: "recorded"; messageId: string }
  | { type: "unsaved"; what: "chat" | "pictures"; reason: "not_set_up" | "failed"; kept?: number; of?: number }

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
  /**
   * EMPTY IS ALLOWED NOW, but only with a picture. "Even if it says nothing
   * and uploads an image, it should try to replicate it." A request with
   * neither is still refused below, where the reason can be said plainly.
   */
  prompt: z.string().max(MAX_PROMPT),
  /** Validated by `reviewImages`, not here: the limits live in one place. */
  images: z.array(z.unknown()).max(16).optional(),
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
  /**
   * WHOSE MODEL ANSWERS, from the switch in the panel. Untrusted and validated
   * in resolveProvider — anything else falls back to the deployment default
   * rather than reaching a client constructor.
   */
  provider: z.enum(["anthropic", "openai"]).optional(),
  /** How hard a model to use. "strong" is the creator asking for Opus. */
  tier: z.enum(["fast", "strong"]).optional(),
  /**
   * WHICH CONVERSATION THIS CONTINUES. Null or absent starts a new one. An id
   * is honoured only when it is a conversation on THIS install (see
   * openThemeConversation), so naming another website's conversation starts
   * a new one here rather than writing into theirs.
   */
  conversationId: z.string().uuid().nullable().optional(),
  /** Continuing the messages from before conversations were kept apart. */
  continueEarlier: z.boolean().optional(),
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

  /**
   * EITHER key will do now. Checking only OPENAI_API_KEY here would refuse
   * every request on a deployment that has moved to Claude — the exact
   * migration this change exists to make possible.
   *
   * 503, not 500: nothing is broken, the deployment is not configured.
   */
  if (!isConfigured("anthropic") && !isConfigured("openai")) {
    return NextResponse.json(
      { error: "Storelib AI is not set up on this deployment yet: no model key is set." },
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
  /**
   * The pictures are checked here, at the edge, before anything is stored or
   * sent: type, size and count, against the limits in one module. Anything
   * refused is named in the reply rather than dropped silently.
   */
  const { images, rejected } = reviewImages(body.images)
  if (!body.prompt.trim() && images.length === 0) {
    return NextResponse.json({ error: "Describe what you want changed, or attach a picture of it." }, { status: 400 })
  }

  /**
   * What goes in the history is the text and a note of what came with it.
   * The picture itself goes to a PRIVATE bucket for thirty days, under this
   * install's own prefix, so reading the conversation back next week shows
   * the screenshot rather than a sentence saying there was one. The note
   * stays for after the thirty days are up, when the words are all there is.
   */
  const noted = withPictureNote(body.prompt, images.length)
  /* Ownership of the install was proved above; the conversation is checked against it. */
  const conversation = await openThemeConversation({
    installId,
    requested: body.conversationId ?? null,
    prompt: noted,
    adoptEarlier: body.continueEarlier === true && !body.conversationId,
  })
  const conversationId = conversation?.id ?? null
  /**
   * WHAT WAS JUST SAID in this conversation, read BEFORE this request is
   * recorded so it is never among it. Through the creator's own client:
   * row-level security decides, as it does for the history panel. It is
   * what lets "I meant the animation", or a tap on the assistant's own
   * question, mean what it meant (lib/website-builder/agent/memory.ts).
   */
  const history = await recentMessages(supabase as never, installId, conversationId)
  const recorded = await startThemeExchange({ installId, pageKey: body.page, prompt: noted, conversationId })
  const messageId = recorded.id
  /**
   * Ownership was proved above against the USER'S client before a single
   * byte was read. Storing never blocks the run: a picture that could not be
   * kept is one the thread will not show later, not a reason to refuse an
   * edit somebody already asked for. What happened is said on the stream.
   */
  const kept = await keepImages({ installId, messageId, images })

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      /**
       * THE READER LEAVING IS NOT AN ERROR. A tab closing ends the response,
       * and `enqueue` on a closed controller throws. Once nobody is listening
       * we stop talking rather than letting that throw end the run.
       */
      let listening = true
      const send = (event: ThemeAgentEvent | RecordedEvent) => {
        if (!listening) return
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"))
        } catch {
          listening = false
        }
      }

      /* First, so the panel knows which conversation this run is in before anything else arrives. */
      if (conversation) send({ type: "conversation", id: conversation.id, title: conversation.title })
      /* And which message the question was kept as, so its answer can be reported. */
      if (messageId) send({ type: "recorded", messageId })
      /* Or that it was not kept: said in words, rather than lost quietly and found out after a reload. */
      else send({ type: "unsaved", what: "chat", reason: recorded.problem ?? "failed" })
      if (messageId && kept.problem) send({ type: "unsaved", what: "pictures", reason: kept.problem, kept: kept.kept, of: kept.of })

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

        /**
         * The creator's switch, honoured where the deployment can honour it.
         *
         * `tier` is theirs to choose — Sonnet for everyday work, Opus when
         * they know the change is hard — and the classifier's own opinion only
         * decides the turn budget. A model that could promote itself to the
         * dearer tier eventually would, and the bill is theirs.
         */
        const resolved = resolveProvider({ requested: body.provider, tier: body.tier })
        const notice = substitutionNotice(resolved)
        if (notice) send({ type: "thinking", text: notice })
        /**
         * An attachment that was refused is said out loud. Dropping one
         * quietly means the assistant answers about a picture the creator
         * thinks it is looking at and it never saw.
         */
        if (rejected.length) {
          send({
            type: "thinking",
            text: rejected.length === 1
              ? `One attachment was not used: ${rejected[0].reason}`
              : `${rejected.length} attachments were not used: ${[...new Set(rejected.map((r) => r.reason))].join(" ")}`,
          })
        }

        /**
         * THE SECTIONS THIS CREATOR WROTE. Read through their own client, so
         * row-level security decides what the assistant can see, the same way
         * every other read in this route does. Without them the assistant
         * could name their sections and nothing about their settings, because
         * the map it read was built when the site was built.
         *
         * The draft half where there is one: the assistant works on the page
         * as it is being edited, which is where the creator is.
         */
        let agentSources: Record<string, string> | undefined
        try {
          const { data: fileRows, error: fileErr } = await supabase
            .from("store_theme_custom_files")
            .select("path, content, draft_content")
            .eq("install_id", installId)
            .like("path", "%.storelib")
          const rows = fileErr
            ? ((await supabase.from("store_theme_custom_files").select("path, content").eq("install_id", installId).like("path", "%.storelib")).data ?? [])
            : (fileRows ?? [])
          if (rows.length > 0) {
            agentSources = sourceMap(rows as { path: string; content: string; draft_content?: string | null }[])
          }
        } catch {
          /* the assistant works without them, as it always did */
        }

        /**
         * =====================================================================
         *  THE ASSISTANT CAN EDIT A SECTION'S SOURCE, NOT ONLY ITS SETTINGS
         * =====================================================================
         * Asked for a smoother accordion, it used to answer that the section
         * exposes no animation control. A section is a file. These two give it
         * the file, and take a new one back on exactly the terms the code
         * editor's own save uses: it must compile, or nothing is stored and
         * the compiler's words go back to the model to fix.
         *
         * Only sections the creator has in their own theme can be written;
         * the product's built-in ones have no file here and the read says so.
         */
        const code = agentSources
          ? {
              read(sectionType: string): string | null {
                const path = `sections/${sectionType}.storelib`
                return agentSources?.[path] ?? null
              },
              async write(sectionType: string, source: string): Promise<{ ok: true } | { ok: false; error: string }> {
                const path = `sections/${sectionType}.storelib`
                /* The same rule every agent is held to: a section file, and
                   never one of Storelib's built-in sections. */
                const allowed = agentMayWrite(path)
                if (allowed.ok === false) return { ok: false, error: allowed.error }
                if (!agentSources || !(path in agentSources)) {
                  return { ok: false, error: `There is no ${path} in this theme to replace.` }
                }
                const compiled = compileSection(source, { file: path })
                if (compiled.ok === false) {
                  const lines = compiled.errors
                    .map((e) => `${e.line !== undefined ? `line ${e.line}: ` : ""}${e.message}`)
                    .join("\n")
                  return { ok: false, error: `${path} did not compile.\n${lines}` }
                }
                /* Held to what every agent's section is held to: it plugs into the theme like a native one. */
                const checked = validateSection(source, { path, expectType: sectionType, strict: true })
                if (checked.ok === false) return { ok: false, error: `${path} was not saved.\n${checked.feedback}` }
                /*
                  SAVED AS A DRAFT, like the code editor's own save. This used
                  to write `content` and clear the draft, which put the
                  assistant's rewrite on the LIVE site the moment it was made,
                  with no version to go back to: the one write in the builder
                  that skipped Publish.
                */
                const saved = await saveThemeFile(supabase, installId, path, source)
                if (saved.ok === false) {
                  const first = saved.errors?.[0]
                  return { ok: false, error: `${path} was not saved: ${first?.message ?? saved.error}` }
                }
                // The next turn reads what was just written, not what was there.
                agentSources[path] = source
                return { ok: true }
              },
            }
          : undefined

        /**
         * STOP BEFORE THE PLATFORM STOPS US. At maxDuration the function is
         * killed mid-stream: no closing message, nothing written to the
         * transcript, and a creator watching a spinner that never resolves
         * (the production log shows it). Ending the loop fifteen seconds
         * early lets it finish the way a cancel does: work already applied
         * is kept and summarised, and the answer arrives.
         */
        const deadline = AbortSignal.timeout((maxDuration - 15) * 1000)
        const loop = themeAgent({
          provider: resolved.provider,
          sources: agentSources,
          code,
          model: resolved.model,
          maxTurns: shape.maxTurns,
          /**
           * Thinking depth, where the provider has such a dial. A build is
           * the case that repays it; a one-word change is not.
           */
          effort: shape.scope === "build" ? "high" : "medium",
          prompt: body.prompt,
          images,
          page: body.page,
          state: { sections: body.sections, settings: body.settings },
          /**
           * And it can add them, not only edit them. A section somebody wrote
           * is a section: if it declares a preset it belongs on this list
           * beside the theme's thirty, or the assistant can describe it and
           * not put one on the page.
           */
          addable: agentSources
            ? [...ADDABLE_SECTIONS, ...customAddableSections(customSectionSchemas(agentSources))]
            : ADDABLE_SECTIONS,
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
              /**
               * The product data API's fields (lib/website-builder/shop-products):
               * ids and page addresses for a product picker and a buy button,
               * sale prices, pay what you want, and the options below. Asked
               * again with the basic columns when an older database does not
               * have one of them, so the store is described either way.
               */
              const productQuery = (cols: string) =>
                supabase
                  .from("products")
                  .select(cols, { count: "exact" })
                  .eq("creator_id", (creator as { id: string }).id)
                  .order("created_at", { ascending: false })
                  .limit(30)
              const [{ data: profile }, first] = await Promise.all([
                supabase
                  .from("creators")
                  .select("slug, store_published")
                  .eq("id", (creator as { id: string }).id)
                  .maybeSingle(),
                productQuery("id, title, type, slug, price_cents, compare_at_cents, pay_what_you_want, pwyw_min_price_cents, status"),
              ])
              const { data: rows, count } = first.error ? await productQuery("id, title, type, slug, price_cents, status") : first

              type Row = {
                id: string
                title: string
                type: string
                slug?: string | null
                price_cents: number
                compare_at_cents?: number | null
                pay_what_you_want?: boolean | null
                pwyw_min_price_cents?: number | null
                status: string
              }
              const list = (rows as unknown as Row[] | null) ?? []
              /* The options each product is bought as, read the same way; none if they will not load. */
              let options: { product_id: string; name: string | null; price_cents: number | null }[] = []
              if (list.length) {
                const { data: variantRows } = await supabase
                  .from("product_variants")
                  .select("product_id, name, price_cents, position")
                  .in("product_id", list.map((p) => p.id))
                  .order("position", { ascending: true })
                options = (variantRows as typeof options | null) ?? []
              }
              const products = list.map((p) => ({
                id: p.id,
                title: p.title,
                type: p.type,
                priceCents: p.pay_what_you_want ? p.pwyw_min_price_cents ?? 0 : p.price_cents,
                payWhatYouWant: p.pay_what_you_want === true,
                compareAtCents: p.compare_at_cents ?? null,
                url: p.slug ? `/products/${p.slug}` : undefined,
                published: p.status === "published",
                options: options
                  .filter((o) => o.product_id === p.id)
                  .map((o) => ({ name: o.name ?? "Option", priceCents: o.price_cents ?? 0 })),
              }))

              const slug = (profile as { slug?: string } | null)?.slug ?? null
              return {
                storeName: slug ?? "this store",
                live: (profile as { store_published?: boolean } | null)?.store_published === true,
                totalProducts: count ?? products.length,
                publishedProducts: products.filter((p) => p.published).length,
                products,
                address: slug ? getWebsiteShareUrl(slug) : null,
              }
            } catch {
              return null
            }
          },
          history,
          // Groups this theme's requests for the provider's prompt cache. A
          // theme id, never anything about the person.
          cacheKey: `theme:${installId}`,
          signal: eitherSignal(request.signal, deadline),
        })

        let step = await loop.next()
        while (!step.done) {
          send(step.value)
          step = await loop.next()
        }

        const result = step.value
        /**
         * A SECTION'S SOURCE CHANGED, so the canvas is drawing the old one.
         * Said before the closing message, so the editor has reloaded by the
         * time somebody reads what was done.
         */
        if (result.wroteCode) send({ type: "sources-changed" })
        if (result.status === "failed") {
          send({
            type: "error",
            message:
              deadline.aborted && !request.signal.aborted
                ? "This edit ran out of time before it changed anything. Try asking for one part of it."
                : result.error ?? "The edit failed.",
          })
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
          conversationId,
        })
      } catch (thrown) {
        const claude = describeAnthropicError(thrown)
        send({
          type: "error",
          message: claude
            ? claude
            : thrown instanceof NoProviderConfiguredError
              ? "Storelib AI is not set up on this deployment yet: no model key is set."
              : thrown instanceof MissingKeyError
                ? "Storelib AI is not set up on this deployment yet: no model key is set."
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
