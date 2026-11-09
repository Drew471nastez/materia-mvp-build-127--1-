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

import { BlockInstanceSchema } from "@/lib/website-builder/block-tree-schema"
import { cleanAgentBody, unreadablePart } from "@/lib/website-builder/agent/request-shape"
import { THEME_SCHEMA_FILE, builtInSettingsSchemaText, readThemeSettingsSchema } from "@/lib/storelib-theme/theme-config"
import { readThemeSchemaText } from "@/lib/website-builder/theme-config-store"
import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"
import { recordVersion, saveDraft, sourceMap } from "@/lib/website-builder/theme-file-drafts"
import { compileSection } from "@/lib/storelib-theme"
import { agentMayWrite } from "@/lib/agent-access/protected"
import { saveThemeFile } from "@/lib/website-builder/save-theme-file"
import { isCompatSource, isNativeSectionSource } from "@/lib/storelib-theme/compat/theme"
import {
  SETTINGS_SCHEMA_FILE,
  buildSettingsPanel,
  compatBlockTypes,
  compatFileErrors,
  compatSchemaWords,
  syncCompatFile,
  type SchemaWords,
} from "@/lib/storelib-theme/compat/schema-sync"
import { customAddableSections, customSectionSchemas } from "@/lib/website-builder/storelib-schemas"
import { agentRateLimit, limitStatus, themeAgentLimit } from "@/lib/sites/rate-limit"
import { themeAgent, type ThemeAgentEvent } from "@/lib/website-builder/agent/loop"
import { ADDABLE_SECTIONS, SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import { readSelection, selectedShapeOf } from "@/lib/website-builder/agent/selection-intent"
import { plainRunError } from "@/lib/sites/agent/plain-errors"
import { AUTO_STRONG_MODEL, EFFORT, autoModel } from "@/lib/website-builder/ask-engines"
import { canAnswer, isConfigured, resolveForCreator, substitutionNotice } from "@/lib/sites/agent/provider"
import { classifyRequest } from "@/lib/website-builder/agent/ambition"
import { reviewImages } from "@/lib/sites/agent/attachments"
import { completeThemeExchange, openThemeConversation, startThemeExchange } from "@/lib/website-builder/agent/chat"
import { keepImages } from "@/lib/website-builder/agent/attachment-store"
import { withPictureNote } from "@/lib/website-builder/ask-attach"
import { recentMessages } from "@/lib/website-builder/agent/memory"
import { describeMemory, memoriesForSite, sameMemory, type MemoryDb } from "@/lib/ai-memory/store"
import { durableFacts } from "@/lib/website-builder/agent/durable-facts"
import { keepRunMemory, type KeptNote } from "@/lib/ai-memory/keep"
import { CodeJournal } from "@/lib/website-builder/agent/code-journal"
import { resolveSelectedSection, SECTION_TYPE, type SectionOrigin } from "@/lib/website-builder/agent/selected-section"
import { DEFAULT_THEME_SOURCES } from "@/themes/default/sources.generated"
import { classifyIntent } from "@/lib/website-builder/agent/intent"
import { importedSectionWrite } from "@/lib/website-builder/agent/imported-write"
import { AGENT_LIMITS, loopDeadlineMs } from "@/lib/website-builder/agent/limits"
import { readStoreFacts } from "@/lib/website-builder/agent/store-facts-server"
import { visualCheck } from "@/lib/website-builder/agent/visual-check"
import { describeComparison, MATCH_THRESHOLD } from "@/lib/website-builder/agent/reference-diff"
import { schemaMapFor } from "@/lib/website-builder/agent/schemas"
import { sitePages } from "@/lib/website-builder/agent/page-builder-server"
import { recordRun } from "@/lib/website-builder/agent/run-ledger"
import type { TraceEntry } from "@/lib/website-builder/agent/loop"
import { decideTarget, resolveTarget, type TargetInput } from "@/lib/website-builder/agent/targeting"
import { targetClassifier } from "@/lib/website-builder/agent/router-model"
import { CHECKPOINT_MAX_PROMPT, CHECKPOINT_MAX_SOURCE, type RunCheckpoint } from "@/lib/website-builder/agent/run-clock"
import { readBrief } from "@/lib/website-builder/agent/project-state"
import { authUnavailableResponse, routeUser } from "@/lib/auth/route-user"
import { SLOW_SAVE_MESSAGE, saveWithRetry } from "@/lib/website-builder/agent/commit-retry"
import { dataUnavailableResponse, transientReadError } from "@/lib/website-builder/agent/route-guard"
import { ledgerStatus } from "@/lib/website-builder/agent/run-ledger-status"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
/**
 * Five minutes, like Code a section: accuracy over speed. A run reads,
 * plans, writes, checks what it drew and reads its work back against the
 * request before it finishes, and a picture or a section's code makes each
 * of those turns longer. Two minutes was cutting those runs off.
 */
export const maxDuration = 300

/** Aborts when either does: the reader leaving, or the deadline. */
function eitherSignal(a: AbortSignal, b: AbortSignal): AbortSignal {
  const both = new AbortController()
  /* The reason is passed on: the deadline's TimeoutError is a pause the next part picks up, the reader leaving is a stop (loop cancelledBy). */
  if (a.aborted || b.aborted) {
    both.abort(a.aborted ? a.reason : b.reason)
    return both.signal
  }
  a.addEventListener("abort", () => both.abort(a.reason), { once: true })
  b.addEventListener("abort", () => both.abort(b.reason), { once: true })
  return both.signal
}

/** How long before the backstop signal the loop's own clock stops it, so the clock always wins the race. */
const CLOCK_MARGIN_MS = 5_000

/* Long enough for a detailed brief: creators write a paragraph per change, and a refusal here read as "describe it". */
const MAX_PROMPT = 8_000

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
  /** Whose account this run is on: null for Storelib AI, else the creator's own connection. */
  | { type: "account"; own: "anthropic" | "openai" | null }
  /** The run stopped on the time limit with work left: the chat sends the next part itself (theme-chat CONTINUE_PROMPT). */
  | { type: "continue"; reason: "time" }
  /** What it kept in AI Memory, for the chat's "Remembered: ..." line with Undo, and what it forgot. */
  | { type: "remembered"; items: KeptNote[]; forgot: string[] }
  /* Partly done (checks still failing), or stopped by the creator: said as that, never as plain success or an error. */
  | { type: "outcome"; outcome: "partial" | "stopped"; unresolved?: string[] }

/* The whole tree, blocks inside blocks included: lib/website-builder/block-tree.ts. */
const BlockSchema = BlockInstanceSchema

const SectionSchema = z.object({
  id: z.string().min(1).max(128),
  type: z.string().min(1).max(64),
  /* An imported Shopify theme's sections carry no name (the theme names them by type); one sent without is saved with none, not refused. */
  name: z.string().max(256).optional().default(""),
  /* The name the creator gave the section in the editor (lib/website-builder/section-name.ts). */
  label: z.string().max(80).optional(),
  settings: z.record(z.unknown()),
  blocks: z.array(BlockSchema).max(500).optional(),
  hidden: z.boolean().optional(),
  /* Which section group it sits in, kept rather than stripped: lib/storelib-theme/section-groups.ts. */
  group: z.enum(["header", "footer"]).optional(),
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
  page: z.string().min(1).max(200),
  sections: z.array(SectionSchema).max(500),
  settings: z.record(z.unknown()),
  /** Which section the creator has open, so "this section" resolves. */
  selectedSectionId: z.string().max(400).optional(),
  /**
   * Whether that section is the ONLY thing this edit may change. Sent by the
   * panel, which shows it as a chip the creator can clear — so the scope of an
   * edit is something they set and can see, not something inferred from how
   * the sentence was phrased.
   */
  lockToSelection: z.boolean().optional(),
  /**
   * The creator is in Code a section with a section open: the change goes
   * into that section's code (lib/website-builder/agent/loop.ts, codeFocus).
   * Honoured only with a section that resolved on this page.
   */
  codeFocus: z.boolean().optional(),
  /** The block selected inside that section, by its path key and type: the request is about it unless it says otherwise. */
  selectedBlockId: z.string().max(400).optional(),
  selectedBlockType: z.string().max(64).optional(),
  /**
   * WHOSE MODEL ANSWERS, from the switch in the panel. Untrusted, and
   * Both vendors go through the same validated coding agent. Model IDs are
   * checked against the caller's available Claude models on the server.
   */
  provider: z.enum(["anthropic", "openai"]).optional(),
  /** How hard a model to use. "strong" is the creator asking for the bigger ChatGPT model. */
  tier: z.enum(["fast", "strong"]).optional(),
  /** One of the four in the menu (lib/website-builder/ask-engines.ts); resolveForCreator refuses any other. */
  model: z.string().regex(/^claude-[a-z0-9-]{1,100}$/).optional(),
  /** Auto in the menu: no model sent, the server picks Sonnet 5.5 or Opus 5.5 for this request (ask-engines autoModel). */
  auto: z.boolean().optional(),
  /**
   * WHICH CONVERSATION THIS CONTINUES. Null or absent starts a new one. An id
   * is honoured only when it is a conversation on THIS install (see
   * openThemeConversation), so naming another website's conversation starts
   * a new one here rather than writing into theirs.
   */
  conversationId: z.string().uuid().nullable().optional(),
  /** Continuing the messages from before conversations were kept apart. */
  continueEarlier: z.boolean().optional(),
  /**
   * THE PART BEFORE THIS ONE RAN OUT OF TIME HAVING KEPT NOTHING, and this is
   * where it got to (lib/website-builder/agent/run-clock.ts), sent back by the
   * chat with its automatic next part. Context for the model only: nothing in
   * it is applied, and any code in it is written again through every check.
   */
  resume: z
    .object({
      v: z.literal(1),
      runId: z.string().min(1).max(80),
      part: z.number().int().min(2).max(20),
      prompt: z.string().max(CHECKPOINT_MAX_PROMPT),
      plan: z.string().max(2_000).optional(),
      target: z.string().max(400).optional(),
      read: z.array(z.string().max(200)).max(24),
      draft: z.object({ path: z.string().max(200), source: z.string().max(CHECKPOINT_MAX_SOURCE), problem: z.string().max(400) }).optional(),
    })
    .nullable()
    .optional()
    /* A checkpoint that does not read is dropped, never a refused request: the next part simply starts fresh. */
    .catch(null),
})

export async function POST(request: NextRequest, context: { params: Promise<{ installId: string }> }) {
  /* Vercel's 300 seconds count from here, so the loop's deadline does too (loopDeadlineMs). */
  const requestStartedAt = Date.now()
  const { installId } = await context.params

  const supabase = await createClient()
  const asker = await routeUser()
  if (asker.kind === "unavailable") return authUnavailableResponse()
  const user = asker.kind === "user" ? asker.user : null
  if (!user) return NextResponse.json({ error: "Sign in to use this." }, { status: 401 })

  const { data: creator, error: creatorError, status: creatorStatus } = await supabase
    .from("creators")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle()
  /* A slow database is a retry, not "only creators" (lib/website-builder/agent/route-guard.ts). */
  if (!creator && transientReadError(creatorError, creatorStatus)) return dataUnavailableResponse()
  if (!creator) return NextResponse.json({ error: "Only creators can edit themes." }, { status: 403 })

  /**
   * RLS decides. A theme somebody else owns reads as absent, which is the
   * right answer to both "does not exist" and "not yours".
   */
  const { data: install, error: installError, status: installStatus } = await supabase
    .from("store_theme_installs")
    .select("id")
    .eq("id", installId)
    .eq("creator_id", (creator as { id: string }).id)
    .maybeSingle()
  if (!install && transientReadError(installError, installStatus)) return dataUnavailableResponse()
  if (!install) return NextResponse.json({ error: "Theme not found." }, { status: 404 })

  /**
   * Storelib's OpenAI key, or the creator's own: somebody who has
   * connected their own OpenAI key is answered on it.
   *
   * 503, not 500: nothing is broken, the deployment is not configured.
   */
  if (!(await canAnswer((creator as { id: string }).id))) {
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
  if (limited) return NextResponse.json({ error: limited }, { status: limitStatus(limited) })
  /* This editor's own runs, counted from its own rows: the limit above counts the code agent's (lib/sites/rate-limit.ts themeAgentLimit). */
  const busy = await themeAgentLimit((creator as { id: string }).id)
  if (busy) return NextResponse.json({ error: busy }, { status: limitStatus(busy) })

  /* Tidied first (lib/website-builder/agent/request-shape.ts): one odd value in the page never refuses the run. */
  const parsed = BodySchema.safeParse(cleanAgentBody(await request.json().catch(() => null)))
  if (!parsed.success) {
    console.warn("[theme agent] unreadable request", parsed.error.issues.slice(0, 3))
    return NextResponse.json({ error: unreadablePart(parsed.error.issues) }, { status: 400 })
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
  /**
   * AI MEMORY (lib/ai-memory/store.ts), through the creator's own client:
   * this website's notes and the ones for every website of theirs, shown to
   * the run as one block, size bounded, with the ids the forget tool takes.
   * Not ready (part 106 not run) is undefined, so the run keeps only this
   * website's own notes in its brief, as before.
   */
  const creatorId = (creator as { id: string }).id
  const memoryDb = supabase as unknown as MemoryDb
  const memory = await memoriesForSite(memoryDb, creatorId, installId)
  const accountMemory = memory.ready ? memory.account.map((m) => m.content) : undefined
  const memoryText = memory.ready ? describeMemory(memory, { ids: true }) : undefined
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
        /*
          THE REQUEST ITSELF, when this is the automatic next part of one that ran out of time: "Continue where you
          stopped" says nothing about what was asked, so the checkpoint's words are what is classified and targeted.
        */
        const resume: RunCheckpoint | null = body.resume ?? null
        const asked = resume?.prompt || body.prompt
        const shape = resume ? classifyRequest(resume.prompt) : classifyRequest(body.prompt)
        /**
         * AND WHAT KIND OF CHANGE IT IS (lib/website-builder/agent/intent.ts):
         * a small edit that preserves everything else, or a new direction
         * that does not. Internal: it decides the plan, the budget and how
         * the finished page is judged, and the creator never sees the label.
         */
        const bodySections = body.sections.filter((s) => s.type !== "header" && s.type !== "footer" && !s.group).length
        /*
          A section open is not always the subject (lib/website-builder/agent/selection-intent.ts): "add a pricing section
          below this" asks for a new one, and is not read as the open section to be rethought.
        */
        const openShape = body.lockToSelection === true || body.codeFocus === true ? null : selectedShapeOf(body.sections as never, body.selectedSectionId, (type) => (SECTION_SCHEMAS[type]?.blocks ?? []).map((b) => String((b as { type?: unknown }).type ?? "")))
        const asksForNew = !!openShape && readSelection(body.prompt, openShape).aim === "new" ? true : !!openShape && resolveTarget({ prompt: asked, sections: body.sections, selectedId: body.selectedSectionId }).action === "add"
        const intent = classifyIntent(asked, {
          selected: !!body.selectedSectionId && !asksForNew,
          locked: body.lockToSelection === true && !!body.selectedSectionId,
          codeFocus: body.codeFocus === true && !!body.selectedSectionId,
          bodySections,
          images: images.length > 0,
          hasHistory: history.length > 0,
        })
        const bigIntent = intent.plan

        /**
         * The creator's switch, honoured where the deployment can honour it.
         *
         * `tier` is theirs to choose (the everyday ChatGPT model, or the
         * stronger one when they know the change is hard) and the
         * classifier's own opinion only decides the turn budget. A model that could promote itself to the
         * dearer tier eventually would, and the bill is theirs.
         */
        /* On the creator's own AI when they have connected one: see resolveForCreator. */
        /**
         * THE BETTER MODEL WHEN THE ASK IS PLAINLY A BUILD.
         *
         * `tier` is the creator's switch and this never lowers it. But
         * "build me a proper pricing section" on the everyday model is the
         * run most likely to come back thin, and the classifier already
         * recognises that shape (./ambition, `ambitious`): a page built once
         * badly costs more than the difference between the two models. A
         * tweak, a question and a chat all stay on what they chose.
         */
        /*
          AUTO (the menu's default): the model is chosen here, per request. A small local, content or style edit runs on
          Sonnet 5.5; a plan, a redesign, section code, a new page or a picture to match runs on Opus 5.5. A model the
          creator picked in the menu is honoured exactly and never changed (lib/website-builder/ask-engines.ts autoModel).
        */
        const autoChosen =
          !body.model && (body.auto === true || !body.tier) && (body.provider ?? "anthropic") === "anthropic"
            ? autoModel({
                kind: intent.kind,
                plan: intent.plan,
                rebuild: intent.rebuild,
                newPage: intent.newPage,
                recreate: intent.recreate,
                codeFocus: body.codeFocus === true,
                images: images.length,
                ambitious: shape.ambitious,
                wholePage: shape.wholePage,
                code: asksForNew || intent.kind === "FUNCTIONAL_CHANGE" || !!intent.settingsLayout,
              })
            : undefined
        const wantsTier = !body.model && !autoChosen && (shape.ambitious || bigIntent || intent.kind === "SECTION_REDESIGN") && body.tier !== "strong" ? "strong" : body.tier
        const resolved = await resolveForCreator((creator as { id: string }).id, { requested: body.provider, tier: autoChosen === AUTO_STRONG_MODEL ? "strong" : wantsTier, model: body.model ?? autoChosen })
        /* Whose account answers, so the chat can say "On your OpenAI key" and not count it as Storelib AI. */
        send({ type: "account", own: resolved.own })
        /* Said out loud: the run is on a model they did not pick, and on their own account it is their bill. */
        if (!autoChosen && wantsTier !== body.tier) send({ type: "thinking", text: "Using the stronger model for this one." })
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
        const agentSources: Record<string, string> = {}
        try {
          const { data: fileRows, error: fileErr } = await supabase
            .from("store_theme_custom_files")
            .select("path, content, draft_content")
            .eq("install_id", installId)
            .like("path", "%.storelib")
          const rows = fileErr
            ? ((await supabase.from("store_theme_custom_files").select("path, content").eq("install_id", installId).like("path", "%.storelib")).data ?? [])
            : (fileRows ?? [])
          Object.assign(agentSources, sourceMap(rows as { path: string; content: string; draft_content?: string | null }[]))
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
        /**
         * The files as they stood when this run started: what a rollback
         * goes back to, and what "the version before" in a file's history is.
         */
        const startedWith: Record<string, string> = { ...agentSources }
        /**
         * WHOSE CODE A SECTION TYPE IS (lib/website-builder/agent/selected-section):
         *   own       a file in this install that an agent may write
         *   builtin   Storelib's shipped file, or the creator's own copy of a
         *             built in one: readable, never written by an agent
         *   product   drawn by the product with no file at all
         */
        const pathOf = (type: string) => `sections/${type}.storelib`
        /**
         * AN IMPORTED THEME has no Storelib built-ins: every section in it is
         * its own, whatever its name, so a "slideshow" of its own is not
         * refused as Storelib's (the same rule a push to GitHub follows,
         * lib/agent-access/protected.ts, repoMayWrite).
         */
        const importedTheme = isCompatSource(agentSources["layout/theme.storelib"])
        const origin = (type: string): SectionOrigin => {
          if (!SECTION_TYPE.test(type)) return "product"
          const path = pathOf(type)
          if (importedTheme) return isCompatSource(agentSources[path]) || isNativeSectionSource(agentSources[path]) ? "own" : "product"
          if (path in agentSources && agentMayWrite(path).ok) return "own"
          return agentSources[path] !== undefined || DEFAULT_THEME_SOURCES[path] !== undefined ? "builtin" : "product"
        }
        /**
         * What an imported theme's builder settings are made with (its words
         * for `t:` labels, its block types) and its settings schema, read once,
         * the first time this run writes one of its files. The same reading the
         * save makes (lib/storelib-theme/compat/schema-sync.ts), so what this run
         * reads back is what the builder will show.
         */
        let compatRead: Promise<{ tr: SchemaWords; settingsSchema: string | null }> | null = null
        const loadCompat = async (): Promise<{ tr: SchemaWords; settingsSchema: string | null }> => {
          try {
            const [words, schema] = await Promise.all([
              supabase.from("store_theme_custom_files").select("path, content, draft_content").eq("install_id", installId).like("path", "shopify/locales/%default%"),
              supabase.from("store_theme_custom_files").select("path, content, draft_content").eq("install_id", installId).eq("path", SETTINGS_SCHEMA_FILE),
            ])
            const files = sourceMap([...(words.data ?? []), ...(schema.data ?? [])] as { path: string; content: string; draft_content?: string | null }[])
            return { tr: compatSchemaWords(files), settingsSchema: files[SETTINGS_SCHEMA_FILE] ?? null }
          } catch {
            return { tr: compatSchemaWords({}), settingsSchema: null }
          }
        }
        const readCompat = () => (compatRead ??= loadCompat())
        /* The theme's settings schema as this run has it: what it read, then what it wrote. */
        let settingsSchemaNow: string | null = importedTheme ? (await readCompat()).settingsSchema : null
        /* What a rollback puts back, like every section file this run may write. */
        if (settingsSchemaNow !== null) startedWith[SETTINGS_SCHEMA_FILE] = settingsSchemaNow
        /*
          A STORELIB THEME'S config/settings_schema.json: its own when it has
          one, Storelib's groups to start from when it has none
          (lib/storelib-theme/theme-config.ts). Staged like a section, checked
          by the same reader the save uses.
        */
        const ownThemeSchema = importedTheme ? null : await readThemeSchemaText(supabase, installId)
        let themeSchemaNow: string = ownThemeSchema ?? builtInSettingsSchemaText()
        if (ownThemeSchema !== null) startedWith[THEME_SCHEMA_FILE] = ownThemeSchema
        /**
         * A RUN'S CODE CHANGES ARE KEPT TOGETHER (lib/website-builder/agent/code-journal).
         * Each write the loop has checked is staged here; nothing reaches the
         * database until the run is over, and then all of them or none.
         */
        const journal = new CodeJournal((path) => startedWith[path] ?? null)

        /**
         * =====================================================================
         *  THE ASSISTANT CAN EDIT A SECTION'S SOURCE, NOT ONLY ITS SETTINGS
         * =====================================================================
         * Asked for a smoother accordion, it used to answer that the section
         * exposes no animation control. A section is a file. These give it
         * the file, and take a new one back once the loop has compiled it,
         * held it to the integration rules and drawn it with this page's
         * settings (lib/website-builder/agent/compile-feedback).
         *
         * Always offered now, not only to a creator who already has a file:
         * Storelib's own sections are read here too, so a built in section
         * can be read, and copied into an editable one when the creator
         * agrees. The type is a file name or it is nothing: no `..`, no `/`.
         */
        const code = {
          read(sectionType: string): string | null {
            if (!SECTION_TYPE.test(sectionType)) return null
            const path = pathOf(sectionType)
            /* An imported theme draws none of Storelib's sections, so none is offered to read as if it were its own. */
            if (importedTheme) return agentSources[path] ?? null
            return agentSources[path] ?? DEFAULT_THEME_SOURCES[path] ?? null
          },
          origin,
          async write(sectionType: string, source: string, opts: { create?: boolean } = {}): Promise<{ ok: true; source?: string; notes?: string[] } | { ok: false; error: string }> {
            if (!SECTION_TYPE.test(sectionType)) return { ok: false, error: "That is not a section type." }
            const path = pathOf(sectionType)
            /*
              AN IMPORTED THEME'S SECTION: read by the theme engine's parser,
              not Storelib's compiler, and kept with the builder's panel made
              again from the theme's own schema, the way every save keeps it
              (lib/website-builder/save-theme-file.ts). What is kept goes back
              to the loop, so its next read and update_section see the
              settings the sidebar will show.
            */
            /* A Storelib section already in an imported theme (one written by Storelib AI) is changed like any Storelib section, without a script. */
            const nativeInImported = importedTheme && !opts.create && isNativeSectionSource(agentSources[path])
            if (nativeInImported && /^\s*<script[\s>]/m.test(source)) {
              return { ok: false, error: "This website runs an imported theme, where a section's <script> does not run. Leave the <script> block out and keep any motion in CSS." }
            }
            if (importedTheme && !nativeInImported) {
              /*
                A NEW SECTION OF AN IMPORTED THEME is a Storelib section, which the engine draws inside the theme in its
                own fonts and colour schemes (lib/website-builder/agent/imported-write.ts). Checked, then staged like
                every other file this run writes.
              */
              if (opts.create) {
                const fresh = importedSectionWrite(sectionType, source, agentSources)
                if (fresh.ok === false) return { ok: false, error: (fresh as { error: string }).error }
                journal.stage(path, source)
                agentSources[path] = source
                return { ok: true }
              }
              if (!isCompatSource(agentSources[path])) return { ok: false, error: `There is no ${path} in this theme to replace.` }
              if (!isCompatSource(source)) return { ok: false, error: `${path} belongs to an imported theme: keep its first line, <template compat="shopify">, and its <schema> after </template>.` }
              const { tr } = await readCompat()
              const synced = syncCompatFile(path, source, agentSources[path] ?? null, { tr, blockTypes: compatBlockTypes(Object.keys(agentSources)) })
              const problems = synced.ok === false ? synced.errors : compatFileErrors(path, synced.source)
              if (synced.ok === false || problems.length) return { ok: false, error: problems.map((e) => `${e.line ? `line ${e.line}: ` : ""}${e.path ? `${e.path}: ` : ""}${e.message}`).slice(0, 5).join("; ") }
              journal.stage(path, synced.source)
              agentSources[path] = synced.source
              return { ok: true, ...(synced.source !== source ? { source: synced.source } : {}), ...(synced.notes.length ? { notes: synced.notes } : {}) }
            }
            /* The same rule every agent is held to: a section file, and never one of Storelib's built in sections. */
            const allowed = agentMayWrite(path)
            if (allowed.ok === false) return { ok: false, error: allowed.error }
            if (opts.create ? path in agentSources : !(path in agentSources)) {
              return { ok: false, error: opts.create ? `${path} already exists in this theme.` : `There is no ${path} in this theme to replace.` }
            }
            /* Checked by the loop already; compiled once more here because this is the door a file goes through. */
            const compiled = compileSection(source, { file: path, expectType: sectionType })
            if (compiled.ok === false) return { ok: false, error: `${path} did not compile.` }
            journal.stage(path, source)
            // The next turn reads what was just written, not what was there.
            agentSources[path] = source
            return { ok: true }
          },
          /*
            AN IMPORTED THEME'S SETTINGS SCHEMA (its Theme settings): read, and
            staged like a section, so it is saved with the run's other files or
            not at all. The save makes the builder's Theme settings from it.
            A theme of Storelib's own has its config/settings_schema.json the
            same way, laid over Storelib's groups when it is saved.
          */
          ...(importedTheme && settingsSchemaNow !== null
            ? {
                readSettingsSchema: () => settingsSchemaNow,
                async writeSettingsSchema(source: string): Promise<{ ok: true; notes?: string[] } | { ok: false; error: string }> {
                  const { tr } = await readCompat()
                  const values = (body.settings as Record<string, unknown>).shopify
                  const built = buildSettingsPanel(source, values && typeof values === "object" ? (values as Record<string, unknown>) : {}, tr)
                  if (built.ok === false) return { ok: false, error: built.errors.map((e) => `${e.line ? `line ${e.line}: ` : ""}${e.message}`).join("; ") }
                  journal.stage(SETTINGS_SCHEMA_FILE, source)
                  settingsSchemaNow = source
                  return { ok: true, ...(built.notes.length ? { notes: built.notes } : {}) }
                },
              }
            : !importedTheme
              ? {
                  readSettingsSchema: () => themeSchemaNow,
                  async writeSettingsSchema(source: string): Promise<{ ok: true; notes?: string[] } | { ok: false; error: string }> {
                    const read = readThemeSettingsSchema(source)
                    if (read.ok === false) return { ok: false, error: (read as { errors: { line?: number; message: string }[] }).errors.slice(0, 5).map((e) => `${e.line ? `line ${e.line}: ` : ""}${e.message}`).join("; ") }
                    journal.stage(THEME_SCHEMA_FILE, source)
                    themeSchemaNow = source
                    return { ok: true }
                  },
                }
              : {}),
        }

        /**
         * THE SECTION THE CREATOR HAS OPEN, resolved here and not taken on
         * the browser's word. The id must be a section on the page this
         * request carries, for this install whose ownership was proved above;
         * its type, its file and whose code that is are worked out from this
         * install's own files and the shipped theme. An id that is not on the
         * page is dropped, and the lock with it.
         */
        const selected = resolveSelectedSection(body.sections as never, body.selectedSectionId, origin)

        /*
          WHICH SECTION THIS IS ABOUT, OR WHAT TO ADD WHERE (lib/website-builder/agent/targeting.ts): decided here,
          before the model reads the page, from the words, the selection and the page itself. A small fast model is
          asked only when the rules can only guess, and only on a deployment or account that has Claude.
        */
        const targetSchemas = schemaMapFor(agentSources)
        const targetInput: TargetInput = {
          prompt: asked,
          sections: body.sections,
          selectedId: selected?.id,
          locked: body.lockToSelection === true && !!selected,
          codeFocus: body.codeFocus === true && !!selected,
          addable: [...ADDABLE_SECTIONS, ...customAddableSections(customSectionSchemas(agentSources))].map((type) => ({ type, name: targetSchemas[type]?.name })),
          schema: (type) => {
            const found = targetSchemas[type]
            return found ? { name: found.name, fields: found.fields, blocks: found.blocks } : undefined
          },
          lastChanged: history.length ? readBrief(body.settings).recent?.slice(-1)[0]?.ids : undefined,
          images: images.length,
        }
        const target = await decideTarget(targetInput, isConfigured("anthropic") || resolved.provider.id.startsWith("own:anthropic") ? targetClassifier(creatorId) : undefined)

        /**
         * STOP BEFORE THE PLATFORM STOPS US. At maxDuration the function is
         * killed mid-stream: no closing message, nothing written to the
         * transcript, and a creator watching a spinner that never resolves
         * (the production log shows it). Ending the loop early lets it
         * finish the way a cancel does: work already applied is kept and
         * summarised, and the answer arrives. Counted from the request's
         * start with room for the commit and the closing writes after the
         * loop (lib/website-builder/agent/limits.ts loopDeadlineMs); it was
         * fifteen seconds from the stream's start, which a slow start spent.
         */
        const deadline = AbortSignal.timeout(loopDeadlineMs({ requestStartedAt, maxDurationS: maxDuration }))
        /*
          THE LOOP'S OWN CLOCK ends a few seconds before that signal (lib/website-builder/agent/run-clock.ts): it stops
          between turns with what it kept, or with a checkpoint, and the signal is only the backstop.
        */
        const deadlineAt = Date.now() + loopDeadlineMs({ requestStartedAt, maxDurationS: maxDuration }) - CLOCK_MARGIN_MS
        /**
         * THE RUN'S LOG, for whoever debugs it: the intent, the plan, every
         * tool call, what the checks found and what was repaired, the model
         * and the tokens. Structured, one JSON line per run in the function
         * log; never on the creator's screen and never the model's reasoning.
         */
        const runLog: TraceEntry[] = []
        const startedAt = Date.now()
        const loop = themeAgent({
          provider: resolved.provider,
          sources: agentSources,
          code,
          model: resolved.model,
          /*
            NO PER EDIT TURN CAP (round Z3). The run is held by its cost and its time (lib/website-builder/agent/limits.ts),
            and the turn guard there is for a loop that never ends. Reaching any of them ends a part, kept, with Continue.
          */
          maxTurns: AGENT_LIMITS.maxTurns,
          limits: AGENT_LIMITS,
          /* Reads the catalogue up front and gives the model room to write a filled section (lib/website-builder/agent/loop). */
          ambitious: shape.ambitious || bigIntent,
          /**
           * Thinking depth: the creator's Strength when they sent one, which
           * is theirs to choose like the model. Without one (an older
           * client), from the request: a build is the case that repays it, a
           * one word change is not. The provider sends what its model takes.
           */
          /* Medium, always: the owner's choice, with no switch (lib/website-builder/ask-engines.ts). The provider sends it where the model takes it. */
          effort: EFFORT,
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
          addable: [...ADDABLE_SECTIONS, ...customAddableSections(customSectionSchemas(agentSources))],
          selectedSectionId: selected?.id,
          selected,
          lockToSelection: body.lockToSelection === true && !!selected,
          codeFocus: body.codeFocus === true && !!selected,
          /* Read its work back against the request once before finishing, for anything built, coded or from a picture. */
          selfCheck: "auto",
          /* The agentic layer: what kind of request, a plan for a big one, the site's memory, the whole page checked, and a look at it in a browser. */
          intent,
          plan: true,
          memory: true,
          accountMemory,
          memoryText,
          siteMemory: memory.ready,
          focusBlock: selected && body.selectedBlockId && body.selectedBlockType ? { id: body.selectedBlockId, type: body.selectedBlockType } : null,
          projectCheck: true,
          maxReviews: bigIntent ? 3 : undefined,
          visualCheck: async (state, sources, opts) => {
            const report = await visualCheck({ state, sources, schemas: schemaMapFor(sources), shots: opts.shots, reference: opts.reference ?? null })
            if (!report) return null
            /* The likeness to their picture, in words, for the loop (lib/website-builder/agent/reference-diff.ts). */
            return {
              ...report,
              comparison: report.comparison ? { score: report.comparison.score, text: describeComparison(report.comparison), threshold: MATCH_THRESHOLD } : null,
            }
          },
          trace: (entry) => {
            if (runLog.length < 400) runLog.push(entry)
          },
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
          /* lib/website-builder/agent/store-facts-server.ts, shared with Start with AI's capability manifest. */
          readStore: () => readStoreFacts(supabase, (creator as { id: string }).id),
          /*
            THE SITE'S OTHER PAGES, through the creator's own client: a request for a whole site builds the shop, the product
            page, About, Contact and the rest as drafts (lib/website-builder/agent/page-builder-server.ts). Not in a locked edit.
          */
          pages: body.lockToSelection === true || body.codeFocus === true ? undefined : sitePages(supabase, installId, body.page),
          /*
            THE WEBSITE'S BLOG for read_blog (lib/website-builder/blog-page.ts describeBlog): its address, categories and
            newest live posts, the same public facts its pages show, always this creator's. A Storelib theme's only: an
            imported theme reads the blog through its own templates. Null without a blog or before SQL part 353.
          */
          readBlog: importedTheme
            ? undefined
            : async () => {
                const { blogFor } = await import("@/lib/site-blog/public-read")
                const { describeBlog } = await import("@/lib/website-builder/blog-page")
                return describeBlog(await blogFor(creatorId).catch(() => null))
              },
          history,
          // Groups this theme's requests for the provider's prompt cache. A
          // theme id, never anything about the person.
          cacheKey: `theme:${installId}`,
          signal: eitherSignal(request.signal, deadline),
          target,
          deadlineAt,
          runId: resume?.runId ?? messageId ?? undefined,
          checkpoint: resume,
        })

        let step = await loop.next()
        while (!step.done) {
          send(step.value)
          step = await loop.next()
        }

        const result = step.value
        /*
          KEPT IN AI MEMORY, as the creator asked: for this website or every website, and what they asked to forget.
          The chat says each one ("Remembered: ...", with Undo); one that fails to keep is in the log, not in the way.
        */
        /*
          AND WHAT THEY SAID IN PASSING THAT STAYS TRUE (lib/website-builder/agent/durable-facts.ts): "I never want
          gradients", "our brand colour is #1f3a2b". Kept for this website after a run that went through, once, beside
          what the run asked to keep itself, and never a second copy of a note already in AI Memory.
        */
        const known = [...memory.site, ...memory.account].map((m) => m.content).concat(result.remembered ?? [], result.rememberedSite ?? [])
        const said = memory.ready && result.status === "succeeded" ? durableFacts(body.prompt).filter((note) => !known.some((k) => sameMemory(k, note))) : []
        if (said.length) result.rememberedSite = [...(result.rememberedSite ?? []), ...said]
        const notes = await keepRunMemory(memoryDb, { creatorId, installId }, result, [...memory.site, ...memory.account])
        if (notes.kept.length || notes.forgot.length) send({ type: "remembered", items: notes.kept, forgot: notes.forgot.map((m) => m.content) })
        console.info(
          "[storelib ai] run",
          JSON.stringify({
            installId,
            page: body.page,
            model: resolved.model,
            provider: resolved.provider.id,
            own: resolved.own,
            auto: !!autoChosen,
            status: ledgerStatus(result),
            stopped: result.stopped ?? null,
            intent: intent.kind,
            target: { action: target.action, sections: target.sections.map((t) => t.id), kind: target.kind ?? null, confidence: target.confidence, via: target.via },
            part: resume?.part ?? 1,
            ms: Date.now() - startedAt,
            startedAfterMs: startedAt - requestStartedAt,
            usage: result.usage,
            ops: result.ops.length,
            wroteCode: !!result.wroteCode,
            files: journal.size,
            unresolved: result.unresolved ?? [],
            pages: (result.pages ?? []).map((p) => p.key),
            visual: result.visual,
            plan: result.plan ? result.plan.sections.map((s) => s.use) : null,
            log: runLog,
          }).slice(0, 60_000),
        )
        /**
         * =====================================================================
         *  THE CODE IS SAVED NOW, ALL OF IT OR NONE OF IT
         * =====================================================================
         * A run that ended well saves every file it wrote, keeping the version
         * each had before in its history first, and a save that fails puts
         * back every file this commit had already saved. A run that failed
         * saves nothing: the files are exactly as they were. Either way the
         * editor reloads its files, so the canvas draws what is stored.
         *
         * This runs whether or not the browser is still listening: a creator
         * who closed the tab mid run comes back to the code it kept.
         */
        let codeLost = false
        /* Lost to a slow database rather than refused: the chat says to send it again, which works. */
        let codeLostSlow = false
        if (journal.size > 0) {
          if (result.status === "succeeded") {
            let slowSave = false
            const committed = await journal.commit({
              /*
                A SLOW DATABASE IS ASKED AGAIN (lib/website-builder/agent/commit-retry.ts): production lost a run's code to one
                "store_theme_custom_files took longer than 30s". The same draft is written again, with backoff, while the
                function still has room for a whole try; a file that is refused for what it is answers at once.
              */
              async save(path, source) {
                const saved = await saveWithRetry(
                  async () => {
                    const r = await saveThemeFile(supabase, installId, path, source)
                    return r.ok === true ? { ok: true } : { ok: false, error: r.error }
                  },
                  {
                    roomMs: () => requestStartedAt + maxDuration * 1000 - Date.now() - 5_000,
                    perTryMs: 30_000,
                    onRetry: (attempt, why) => console.warn("[storelib ai] theme agent: code save retried", path, attempt, String(why).slice(0, 200)),
                  },
                )
                if (saved.ok === false && saved.transient) slowSave = true
                return saved.ok === true ? { ok: true } : { ok: false, error: saved.error }
              },
              async keep(path, previous) {
                /* The version from before this run, kept unless it is already the newest one in the history. */
                const { data } = await supabase
                  .from("store_theme_file_versions")
                  .select("content")
                  .eq("install_id", installId)
                  .eq("path", path)
                  .order("created_at", { ascending: false })
                  .limit(1)
                  .maybeSingle()
                if ((data as { content?: string } | null)?.content !== previous) await recordVersion(supabase, installId, path, previous, "save")
              },
              async restore(path, previous) {
                const put = await saveDraft(supabase, installId, path, previous)
                if (put.ok === false) return { ok: false, error: put.error }
                await recordVersion(supabase, installId, path, previous, "restore")
                return { ok: true }
              },
            })
            if (committed.ok === false) {
              codeLost = true
              codeLostSlow = slowSave
              console.error("[storelib ai] theme agent: code commit failed", committed.failed, committed.error, committed.stuck)
            }
          } else {
            journal.discard()
          }
        }
        /**
         * A SECTION'S SOURCE CHANGED, so the canvas may be drawing the old
         * one. Said before the closing message, so the editor has its files
         * by the time somebody reads what was done.
         */
        if (result.wroteCode || codeLost) send({ type: "sources-changed" })
        if (codeLost) {
          result.status = "failed"
          result.error = codeLostSlow ? SLOW_SAVE_MESSAGE : "The section's code could not be saved, so it is back to how it was. Try again."
          result.message = ""
        }
        /* The reply's first line says what was changed: "Edited: Hero", "Added: Testimonials, after Hero". */
        const reply = (text: string) => (result.headline ? `${result.headline}\n${text}` : text)
        if (result.status === "failed" && deadline.aborted && !request.signal.aborted && !codeLost) {
          /*
            THE BACKSTOP, NOT AN ERROR. The loop's own clock stops it first (deadlineAt); if the platform's signal got
            there anyway, nothing is lost by saying so plainly and carrying on: the chat sends the next part itself.
          */
          result.status = "succeeded"
          result.error = null
          result.message = "This one needs more than one pass, so I am carrying on from where I got to."
          send({ type: "continue", reason: "time" })
          send({ type: "message", text: result.message })
        } else if (result.status === "failed") {
          send({ type: "error", message: result.error ?? "The edit failed." })
        } else {
          /*
            OUT OF TIME, NOT OUT OF WORK. A function here lives 300 seconds, and a whole site takes longer. A run the
            deadline stopped after it had changed things says so, and the chat sends the next part on its own
            (components/website-builder/theme-chat.tsx, CONTINUE_PROMPT), with this conversation as its memory, so a
            task of ten or fifteen minutes runs as one request from where the creator sits.
          */
          /* The loop says it stopped for time itself (its `continue` is already sent); this is for the backstop. */
          const outOfTime = result.stopped !== "time" && deadline.aborted && !request.signal.aborted && (result.ops.length > 0 || !!result.wroteCode || (result.pages?.length ?? 0) > 0)
          if (outOfTime) send({ type: "continue", reason: "time" })
          /* PARTLY DONE, said as that: changes made, checks still failing (lib/website-builder/agent/loop.ts `partial`). */
          if (result.partial && !codeLost) send({ type: "outcome", outcome: "partial", unresolved: (result.unresolved ?? []).slice(0, 3).map((u) => u.slice(0, 200)) })
          /* Stopped by the person: what was kept stays, and the chat shows a stop, not an error. */
          if (result.stopped === "cancelled") send({ type: "outcome", outcome: "stopped" })
          result.message = (result.message || "Done.") + (outOfTime ? " Carrying on with the rest." : "")
          send({ type: "message", text: reply(result.message) })
        }

        /* One row of facts per run (lib/website-builder/agent/run-ledger.ts): never in the way of the reply. */
        await recordRun(supabase, {
          installId,
          creatorId,
          pageKey: body.page,
          status: ledgerStatus(result),
          intent,
          ops: result.ops.length,
          wroteCode: !!result.wroteCode,
          pages: (result.pages ?? []).map((p) => p.key),
          unresolved: result.unresolved ?? [],
          ms: Date.now() - startedAt,
          model: resolved.model,
          provider: resolved.provider.id,
          inputTokens: result.usage?.inputTokens ?? 0,
          outputTokens: result.usage?.outputTokens ?? 0,
        })

        /**
         * Recorded from the RESULT, not from what was streamed. The two agree
         * today; if they ever stop, the transcript should say what the run
         * actually did rather than what a browser happened to receive before
         * somebody closed the tab.
         */
        await completeThemeExchange({
          installId,
          pageKey: body.page,
          reply: result.status === "failed" ? result.message : reply(result.message || "Done."),
          ops: result.ops,
          error: result.status === "failed" ? result.error : null,
          conversationId,
        })
      } catch (thrown) {
        /* Plain words on the stream; the provider's own, JSON and all, go to the log (lib/sites/agent/plain-errors). */
        send({ type: "error", message: plainRunError(thrown, "theme agent") })
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
