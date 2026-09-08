"use client"

/**
 * The chat pane.
 *
 * It reads a newline-delimited JSON stream from /api/sites/[siteId]/agent and
 * renders each event as it lands. The steps are shown — "read src/App.tsx",
 * "wrote src/components/Hero.tsx", "run_build" — because a tool loop takes
 * tens of seconds and a spinner with nothing behind it is indistinguishable
 * from a hang. This editor has already had exactly that failure once, with a
 * disabled send button that looked broken rather than unbuilt.
 *
 * The API key is not here and cannot be: the provider module is `server-only`,
 * so a client component importing it fails the build instead of shipping a key
 * to every visitor.
 */

import * as React from "react"
import {
  ArrowUp,
  Check,
  ChevronRight,
  Circle,
  FileCode,
  Hammer,
  ImagePlus,
  ListPlus,
  Loader2,
  RotateCcw,
  Sparkles,
  Square,
  TriangleAlert,
} from "lucide-react"

import { StorelibMark } from "@/components/storelib-mark"

import { cn } from "@/lib/utils"
import type { AgentEvent } from "@/lib/sites/agent/types"
import { answersPrompt, type AgentQuestion } from "@/lib/sites/agent/questions"

/** Mirrors lib/sites/chat.ts — the wire shape of a stored message. */
interface StoredMessage {
  id: string
  role: "user" | "assistant"
  content: string
  steps: Array<{ name: string; detail: string }>
  questions: AgentQuestion[]
  filesChanged: string[]
  versionId: string | null
  error: string | null
}

interface Step {
  id: string
  kind: "tool" | "note"
  label: string
}

/**
 * WHAT THE RUN IS DOING, in the creator's language.
 *
 * The chat used to render one line per tool call — "Read src/App.tsx",
 * "Edited src/components/Hero.tsx" — which is the inside of the machine on
 * somebody's screen. It is also the wrong grain: forty of those scroll past
 * and none of them says whether the work is going well.
 *
 * A milestone is a thing the creator asked for. The spine comes from the run's
 * own state, and the middle comes from the agent's plan, which is already
 * written in their words because it is what the agent committed to doing.
 */
interface Milestone {
  id: string
  label: string
  state: "queued" | "active" | "done"
}

export interface Exchange {
  id: string
  prompt: string
  /** The raw tool calls. Detail, behind a toggle — never the main thread. */
  steps: Step[]
  /** Where the run is, from its own state events. */
  phase?: "inspecting" | "planning" | "executing" | "verifying" | "repairing"
  /**
   * The agent's prose as it works — "I'll transform this into a digital
   * products store. First, let me check the current catalogue."
   *
   * These arrive as `thinking` events and used to be dropped on the floor,
   * which is why the card had a state and a checklist and nothing that read
   * like somebody talking. Only the latest is shown: this is a running
   * commentary, not a transcript, and stacking it turns the card into a wall.
   */
  notes: string[]
  /** What the agent asked, if it asked anything. Rendered as something to tap. */
  questions?: AgentQuestion[]
  /** Answers already sent, so the cards collapse instead of asking twice. */
  answered?: boolean
  /** What the agent said it would do, and how far it has got. */
  plan?: Array<{ title: string; done: boolean }>
  /** Something broke and was repaired — worth showing, and only if it happened. */
  repaired?: boolean
  reply?: string
  error?: string
  filesChanged: string[]
  running: boolean
  /** The snapshot taken before this run, so it can be undone. */
  runId?: string
  versionId?: string
  undone?: boolean
  /**
   * The stream died but the run did not. Shown as "still working" rather than
   * as a failure, because the agent is finishing server-side.
   */
  reconnecting?: boolean
}

const SUGGESTIONS = [
  "Make the hero bolder and add a testimonial section",
  "Change the palette to something warmer",
  "Add a pricing section with three tiers",
]

/**
 * Every tool, in words.
 *
 * A missing entry falls back to the raw name, so a new tool shows up in the
 * transcript as `replace_in_file` — which is not a lie, it is just the inside
 * of the machine on somebody's screen. This list went stale the moment tools
 * were added faster than it was; tests/sites.test.ts now fails if a tool has
 * no label here, so it cannot happen quietly again.
 */
/**
 * The milestones for one run, from the events it actually sent.
 *
 * Derived rather than stored, because the run's state and its plan already say
 * everything this needs and a second copy would be one more thing to keep
 * true. A finished run that predates this — restored from the transcript —
 * has no phase and no plan, and gets no milestones rather than invented ones.
 */
function milestonesFor(exchange: Exchange): Milestone[] {
  const phase = exchange.phase
  if (!phase && !exchange.plan?.length) return []

  const order = ["inspecting", "planning", "executing", "verifying", "repairing"] as const
  const reached = (what: (typeof order)[number]) =>
    !!phase && order.indexOf(phase) >= order.indexOf(what)

  const done = !exchange.running
  const list: Milestone[] = []

  list.push({
    id: "understand",
    label: "Understanding the project",
    state: done || reached("planning") ? "done" : phase === "inspecting" ? "active" : "queued",
  })

  /**
   * The agent's own steps, in its own words. This is the part that makes the
   * list worth reading: "Rebuild the hero" rather than "write_file".
   */
  for (const [index, step] of (exchange.plan ?? []).entries()) {
    list.push({
      id: `plan-${index}`,
      label: step.title,
      state: step.done
        ? "done"
        : // The first open step is the one being worked on, once work started.
          !done && reached("executing") && !(exchange.plan ?? []).slice(0, index).some((s) => !s.done)
          ? "active"
          : done
            ? "queued"
            : "queued",
    })
  }

  if (exchange.repaired) {
    list.push({
      id: "repair",
      label: "Fixing what broke",
      state: done || phase !== "repairing" ? "done" : "active",
    })
  }

  list.push({
    id: "verify",
    label: "Building and testing",
    state: done ? (exchange.error ? "queued" : "done") : phase === "verifying" ? "active" : "queued",
  })

  return list
}

const TOOL_LABELS: Record<string, string> = {
  list_files: "Looked at the project",
  read_file: "Read",
  write_file: "Edited",
  create_file: "Created",
  delete_file: "Deleted",
  run_build: "Built the site",
  read_build_errors: "Checked the errors",
  update_manifest: "Noted for next time",
  search_code: "Searched for",
  find_usages: "Traced",
  replace_in_file: "Edited",
  set_plan: "Made a plan",
  complete_step: "Finished",
  ask_creator: "Asked you something",
  // Not a tool the model calls — the harness compacting its own conversation.
  // It belongs in the transcript for the same reason a build does: it is
  // something that happened to the run.
  compact_context: "Tidied the conversation",
}

/**
 * The dot grid on the card's header.
 *
 * Drawn rather than imported: the mark is eight dots with the middle missing,
 * and no icon in the set is that. A near-miss icon would be the one thing on
 * the card that does not look deliberate.
 */
function DotGrid({ className }: { className?: string }) {
  const dots = [0, 1, 2].flatMap((row) => [0, 1, 2].map((col) => [row, col] as const))
  return (
    <svg viewBox="0 0 12 12" className={className} aria-hidden="true">
      {dots.map(([row, col]) =>
        row === 1 && col === 1 ? null : (
          <circle key={`${row}-${col}`} cx={2 + col * 4} cy={2 + row * 4} r="1.1" fill="currentColor" />
        ),
      )}
    </svg>
  )
}

/**
 * A run, on a card.
 *
 * ---------------------------------------------------------------------------
 *  WHY A CARD AND NOT A LIST
 * ---------------------------------------------------------------------------
 * The run used to render as loose lines in the message flow: a checklist, a
 * spinner, a toggle. Everything was there and none of it was contained, so a
 * long run pushed the conversation off the screen and there was no single
 * thing to look at that said "this is happening now".
 *
 * One card, with a header that names its state and a body that can be shut.
 * The header stays when the body is closed, which is the property that makes
 * it collapsible in a useful way — a finished run becomes one line rather than
 * disappearing.
 *
 * THREE GRAINS, and the order is deliberate:
 *   1. the milestones — things the creator asked for, in their words
 *   2. the agent's own prose — the running commentary, latest line only
 *   3. the tool calls — behind a toggle, closed, because they are the inside
 *      of the machine and almost never what somebody wants to know
 *
 * The body opens and closes with a grid-template-rows transition rather than a
 * height one. Height cannot animate to `auto`, so the usual workarounds are a
 * measured pixel value that goes stale the moment the content changes — and
 * this content changes every few seconds while a run is going.
 */
export function RunProgress({ exchange }: { exchange: Exchange }) {
  const [open, setOpen] = React.useState(true)
  const [showActivity, setShowActivity] = React.useState(false)
  const milestones = milestonesFor(exchange)

  /** The latest line of commentary. A transcript of these would be a wall. */
  const note = exchange.notes.length > 0 ? exchange.notes[exchange.notes.length - 1] : null

  if (milestones.length === 0 && exchange.steps.length === 0 && !note) return null

  const title = exchange.running
    ? exchange.reconnecting
      ? "Still working"
      : "Working"
    : exchange.error
      ? "Stopped"
      : "Done"

  return (
    <div className="overflow-hidden rounded-[14px] border border-border bg-card/60">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-foreground/[0.03]"
      >
        <DotGrid
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground",
            // The mark itself pulses while there is something to wait for, so
            // the card reads as live without a second spinner competing with
            // the one already on the active milestone.
            exchange.running && "animate-pulse text-foreground",
          )}
        />
        <span className="flex-1 text-sm font-medium">{title}</span>
        <ChevronRight
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
            open ? "-rotate-90" : "rotate-90",
          )}
        />
      </button>

      <div
        className={cn(
          "grid transition-all duration-300 ease-out",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden">
          <div className="space-y-3 border-t border-border/60 px-3 py-3">
            {(exchange.plan?.length ?? 0) > 0 && (
              /**
               * The moment the agent committed to something, called out above
               * the steps themselves. It is the first thing that makes the
               * card feel like a run rather than a spinner: there is now a
               * list, and it was written before the work started.
               */
              <p className="flex items-center gap-2.5 text-[13px] text-foreground">
                <ListPlus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                Created plan
              </p>
            )}

            {milestones.length > 0 && (
              <ul className="space-y-2">
                {milestones.map((milestone) => (
                  <li key={milestone.id} className="flex items-center gap-2.5 text-[13px]">
                    {milestone.state === "done" ? (
                      <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                    ) : milestone.state === "active" ? (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-foreground" />
                    ) : (
                      <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground/35" />
                    )}
                    <span
                      className={cn(
                        "truncate",
                        milestone.state === "active"
                          ? "text-foreground"
                          : milestone.state === "done"
                            ? "text-muted-foreground"
                            : "text-muted-foreground/50",
                      )}
                    >
                      {milestone.label}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {note && (
              /**
               * Keyed by the text so React replaces the node when the line
               * changes — a fade that never re-runs is a fade nobody sees.
               */
              <p
                key={note}
                className="animate-in fade-in slide-in-from-bottom-1 text-[13px] leading-relaxed text-muted-foreground duration-300"
              >
                {note}
              </p>
            )}

            {exchange.running && (
              <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 shrink-0 animate-pulse" />
                {exchange.reconnecting ? "Still working — you can close this and come back." : "Working"}
              </p>
            )}

            {exchange.steps.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowActivity((was) => !was)}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground/70 transition-colors hover:text-foreground"
                  aria-expanded={showActivity}
                >
                  <ChevronRight
                    className={cn("h-3 w-3 transition-transform duration-200", showActivity && "rotate-90")}
                  />
                  Activity ({exchange.steps.length})
                </button>

                <div
                  className={cn(
                    "grid transition-all duration-300 ease-out",
                    showActivity ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                  )}
                >
                  <div className="overflow-hidden">
                    <ul className="mt-1.5 space-y-1 border-l border-border pl-3">
                      {exchange.steps.map((step) => (
                        <li
                          key={step.id}
                          className="flex items-center gap-2 text-[11px] text-muted-foreground/80"
                        >
                          {step.label.startsWith("Built") ? (
                            <Hammer className="h-3 w-3 shrink-0" />
                          ) : (
                            <FileCode className="h-3 w-3 shrink-0" />
                          )}
                          <span className="truncate">{step.label}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * WHAT THE AGENT WANTED TO KNOW, as something to tap.
 *
 * "A site for my barber shop" names a trade and nothing else, so the agent
 * asks — and carries on building while it waits, which is why these cards sit
 * beside a finished site rather than in front of an empty one. See
 * lib/sites/agent/questions.ts for why asking must not mean waiting.
 *
 * Every question can be skipped. A required field here would turn a helpful
 * question into a toll gate on somebody who just wants to look at their site.
 */
export function QuestionCards({
  questions,
  disabled,
  onSend,
}: {
  questions: AgentQuestion[]
  disabled: boolean
  onSend: (answers: Array<{ question: string; answer: string }>) => void
}) {
  const [answers, setAnswers] = React.useState<Record<string, string>>({})
  const filled = questions.filter((q) => (answers[q.id] ?? "").trim().length > 0).length

  return (
    <div className="space-y-2.5">
      <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5 shrink-0" />
        A few things that would make this yours
      </p>

      {questions.map((question) => (
        <div
          key={question.id}
          className="animate-in fade-in slide-in-from-bottom-1 space-y-2 rounded-[12px] border border-border bg-card/60 px-3 py-2.5 duration-300"
        >
          <div>
            <p className="text-[13px] text-foreground">{question.question}</p>
            {question.why && (
              <p className="mt-0.5 text-[11px] text-muted-foreground/70">{question.why}</p>
            )}
          </div>

          {question.suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {question.suggestions.map((suggestion) => {
                const chosen = (answers[question.id] ?? "") === suggestion
                return (
                  <button
                    key={suggestion}
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      setAnswers((previous) => ({
                        ...previous,
                        // Tapping the chosen chip again clears it, so a
                        // mis-tap is one tap to undo rather than a selection
                        // there is no way out of.
                        [question.id]: chosen ? "" : suggestion,
                      }))
                    }
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                      chosen
                        ? "border-foreground bg-foreground text-background"
                        : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                    )}
                  >
                    {suggestion}
                  </button>
                )
              })}
            </div>
          )}

          <input
            value={answers[question.id] ?? ""}
            disabled={disabled}
            onChange={(event) =>
              setAnswers((previous) => ({ ...previous, [question.id]: event.target.value }))
            }
            placeholder={question.placeholder ?? "Or type your own"}
            className="w-full rounded-[9px] border border-border bg-background/40 px-2.5 py-1.5 text-[13px] outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-foreground/30"
          />
        </div>
      ))}

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={disabled || filled === 0}
          onClick={() =>
            onSend(
              questions.map((q) => ({ question: q.question, answer: answers[q.id] ?? "" })),
            )
          }
          className="shrink-0 whitespace-nowrap rounded-full bg-foreground px-3 py-1.5 text-[12px] font-medium text-background transition-opacity disabled:opacity-40"
        >
          {filled === 0
            ? "Answer to continue"
            : `Send ${filled} answer${filled === 1 ? "" : "s"}`}
        </button>
        <span className="text-[11px] text-muted-foreground/70">
          Or ignore these — the site is already built.
        </span>
      </div>
    </div>
  )
}

export function ChatPane({
  siteId,
  siteName,
  openingBrief,
  onFilesChanged,
}: {
  siteId: string
  siteName: string
  /** From the New Site flow — sent once, automatically, on first mount. */
  openingBrief?: string
  onFilesChanged: (paths: string[]) => void
}) {
  const [exchanges, setExchanges] = React.useState<Exchange[]>([])
  const [loadingHistory, setLoadingHistory] = React.useState(true)
  const [draft, setDraft] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [reconnecting, setReconnecting] = React.useState(false)
  const [historyError, setHistoryError] = React.useState(false)

  /**
   * ATTACHING MEDIA, the way every builder does it: drop it on the composer or
   * paste it from the clipboard.
   *
   * The file uploads IMMEDIATELY rather than waiting for the message to be
   * sent. A creator who drops a photo and then closes the tab should still find
   * it on the site next time — and a message that carries a half-uploaded file
   * is a message that can fail for a reason that has nothing to do with what
   * they asked for.
   *
   * The URL is then appended to the draft, which is what tells the model the
   * picture exists. Nothing else in the run knows about clipboards.
   */
  const [uploading, setUploading] = React.useState(0)
  const [uploadError, setUploadError] = React.useState<string | null>(null)
  const [dropping, setDropping] = React.useState(false)

  const attach = React.useCallback(
    async (files: File[]) => {
      const media = files.filter((f) => f.size > 0)
      if (media.length === 0) return

      setUploadError(null)
      setUploading((n) => n + media.length)

      for (const file of media) {
        try {
          const body = new FormData()
          body.append("file", file)
          const response = await fetch(`/api/sites/${siteId}/assets`, { method: "POST", body })
          const json = (await response.json().catch(() => ({}))) as {
            asset?: { name: string; url: string }
            error?: string
          }

          if (!response.ok || !json.asset) {
            setUploadError(json.error ?? "That file could not be uploaded.")
            continue
          }

          // Appended rather than replacing the draft: somebody who has already
          // typed "put this in the hero" should not lose the sentence.
          const { name, url } = json.asset
          setDraft((previous) => `${previous.trimEnd()}${previous.trim() ? "\n" : ""}${name}: ${url}`.trimStart())
        } catch {
          setUploadError("That file could not be uploaded.")
        } finally {
          setUploading((n) => n - 1)
        }
      }

      fieldRef.current?.focus()
    },
    [siteId],
  )
  const fieldRef = React.useRef<HTMLTextAreaElement>(null)
  const bottomRef = React.useRef<HTMLDivElement>(null)

  /**
   * Stop.
   *
   * The loop has always taken an AbortSignal and nothing ever gave it one, so
   * a run that went wrong could only be waited out — up to twelve turns of a
   * model doing the wrong thing, billed.
   *
   * STOP IS TWO THINGS NOW. The run no longer dies with the connection — that
   * is the whole point of the change — so closing the stream would leave the
   * agent working. Stop therefore asks the server to cancel, which the run
   * reads between turns, and then stops listening.
   *
   * The request goes first. If it fails, we have not stopped anything and
   * saying so is better than a button that lies.
   */
  const abortRef = React.useRef<AbortController | null>(null)

  const stop = React.useCallback(() => {
    void fetch(`/api/sites/${siteId}/run`, { method: "DELETE" }).catch(() => {})
    abortRef.current?.abort()
    abortRef.current = null
  }, [siteId])

  /**
   * The field grows with the text instead of scrolling inside fixed rows.
   *
   * Reset to 0 rather than "auto" before measuring: "auto" leaves the browser
   * free to report the height it already had, so the field never shrinks back
   * after a long draft is deleted. The floor is not cosmetic — scrollHeight on
   * an EMPTY textarea is one line plus padding, and the field collapsed below
   * the height of its own placeholder, cutting it in half.
   */
  React.useEffect(() => {
    const field = fieldRef.current
    if (!field) return
    field.style.height = "0px"
    field.style.height = `${Math.min(Math.max(field.scrollHeight, 60), 160)}px`
  }, [draft])

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [exchanges])

  /**
   * The conversation so far.
   *
   * Stored as alternating user/assistant rows, rebuilt here into the pairs the
   * UI renders. A trailing user message with no reply is a run that was
   * interrupted — shown as an error rather than left looking like it is still
   * thinking, which it is not: nothing is running any more.
   */
  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        /**
         * The transcript AND whether a run is in flight, together.
         *
         * A prompt is now saved the moment it is accepted, so a trailing user
         * message with no reply has two possible meanings: the run is still
         * going, or it ended without recording one. Reading the transcript
         * alone cannot tell them apart, and guessing "did not finish" over a
         * run that is actively working is the more alarming of the two wrong
         * answers.
         */
        const [chatResponse, runResponse] = await Promise.all([
          fetch(`/api/sites/${siteId}/chat`, { cache: "no-store" }),
          fetch(`/api/sites/${siteId}/run`, { cache: "no-store" }).catch(() => null),
        ])

        if (!chatResponse.ok) {
          /**
           * 503 means the transcript could not be READ, not that there is
           * none. Saying so is the difference between "we cannot reach your
           * history right now" and letting somebody believe it was deleted.
           */
          if (!cancelled && chatResponse.status === 503) setHistoryError(true)
          return
        }

        const body = (await chatResponse.json()) as { messages?: StoredMessage[] }
        if (cancelled || !body.messages?.length) return

        const active = runResponse?.ok
          ? ((await runResponse.json()) as { running?: boolean }).running === true
          : false

        const restored: Exchange[] = []
        for (const message of body.messages) {
          if (message.role === "user") {
            restored.push({
              id: message.id,
              prompt: message.content,
              steps: [],
              notes: [],
              filesChanged: [],
              running: false,
            })
            continue
          }
          const open = restored[restored.length - 1]
          if (!open) continue
          open.steps = message.steps.map((s, i) => ({
            id: `${message.id}-${i}`,
            kind: "tool" as const,
            label: `${TOOL_LABELS[s.name] ?? s.name}${s.detail ? ` ${s.detail}` : ""}`,
          }))
          open.reply = message.content || undefined
          /**
           * Restored with the message, so a creator who reloaded before
           * answering still sees what was asked. Marked answered, because the
           * run they belong to is over — re-offering the form would send the
           * same answers into a conversation that already moved on.
           */
          open.questions = message.questions?.length ? message.questions : undefined
          open.answered = true
          open.filesChanged = message.filesChanged
          open.versionId = message.versionId ?? undefined
          open.error = message.error ?? undefined
        }
        /**
         * Only the LAST exchange can be unanswered — a run is one at a time —
         * so anything earlier without a reply really did end without one.
         */
        for (let i = 0; i < restored.length; i++) {
          const exchange = restored[i]
          if (exchange.reply !== undefined || exchange.error !== undefined) continue
          const isLast = i === restored.length - 1
          if (isLast && active) {
            exchange.running = true
            exchange.reconnecting = true
          } else {
            exchange.error = "This edit did not finish."
          }
        }

        setExchanges(restored)
      } finally {
        if (!cancelled) setLoadingHistory(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [siteId])

  const send = React.useCallback(
    async (text: string) => {
      const prompt = text.trim()
      if (!prompt || busy) return

      const id = crypto.randomUUID()
      setDraft("")
      setBusy(true)
      setExchanges((previous) => [
        ...previous,
        { id, prompt, steps: [], notes: [], filesChanged: [], running: true },
      ])

      const patch = (change: (exchange: Exchange) => Exchange) =>
        setExchanges((previous) => previous.map((e) => (e.id === id ? change(e) : e)))

      try {
        const controller = new AbortController()
        abortRef.current = controller

        const response = await fetch(`/api/sites/${siteId}/agent`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
          signal: controller.signal,
        })

        if (!response.ok || !response.body) {
          const body = await response.json().catch(() => ({}))
          patch((e) => ({ ...e, running: false, error: body.error ?? "Could not reach Storelib AI." }))
          return
        }

        /**
         * Read line by line, keeping the remainder.
         *
         * A chunk boundary lands mid-object often enough that parsing each
         * chunk as JSON works in testing and fails in production on the first
         * long file write.
         */
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""

        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          let newline = buffer.indexOf("\n")
          while (newline !== -1) {
            const line = buffer.slice(0, newline).trim()
            buffer = buffer.slice(newline + 1)
            newline = buffer.indexOf("\n")
            if (!line) continue

            let event: AgentEvent
            try {
              event = JSON.parse(line)
            } catch {
              continue
            }

            // Narrowed into a local BEFORE the closure: TypeScript drops a
            // discriminated-union narrowing across a function boundary, so
            // `event.detail` inside patch() is an error on the union type.
            if (event.type === "tool") {
              const label = `${TOOL_LABELS[event.name] ?? event.name}${event.detail ? ` ${event.detail}` : ""}`
              patch((e) => ({
                ...e,
                steps: [...e.steps, { id: crypto.randomUUID(), kind: "tool" as const, label }],
              }))
            } else if (event.type === "thinking") {
              /**
               * The commentary the card shows. Kept as a list rather than a
               * single value so a run's own words survive in order if this
               * ever wants to show more than the latest.
               */
              const text = event.text
              patch((e) => ({ ...e, notes: [...e.notes, text] }))
            } else if (event.type === "questions") {
              const questions = event.questions
              patch((e) => ({ ...e, questions }))
            } else if (event.type === "state") {
              const phase = event.state
              patch((e) => ({ ...e, phase, repaired: e.repaired || phase === "repairing" }))
            } else if (event.type === "plan") {
              const steps = event.steps
              patch((e) => ({ ...e, plan: steps }))
            } else if (event.type === "files") {
              const paths = event.paths
              patch((e) => ({ ...e, filesChanged: paths }))
              onFilesChanged(paths)
            } else if (event.type === "message") {
              const reply = event.text
              patch((e) => ({ ...e, reply }))
            } else if (event.type === "error") {
              const message = event.message
              patch((e) => ({ ...e, running: false, error: message }))
            } else if (event.type === "started") {
              const { runId, versionId } = event
              patch((e) => ({ ...e, runId, versionId: versionId ?? undefined }))
            } else if (event.type === "done") {
              patch((e) => ({ ...e, running: false }))
            }
          }
        }
      } catch (thrown) {
        // A stop is the person deciding, not a fault. Saying "lost the
        // connection" when they pressed the button is the editor blaming the
        // network for something they did on purpose.
        const stopped = thrown instanceof DOMException && thrown.name === "AbortError"
        if (stopped) {
          // Still literally true after the run was decoupled from the
          // connection: cancellation is checked BETWEEN turns and the files
          // are written once at the end, so a stopped run has saved nothing.
          patch((e) => ({ ...e, running: false, error: "Stopped. Nothing was changed." }))
        } else {
          /**
           * THE CONNECTION DROPPED, WHICH IS NOT THE SAME AS THE WORK STOPPING.
           *
           * This used to say "Lost the connection. Nothing was changed." — and
           * it was true, because the run was wired to die with the socket. It
           * is not any more: the agent finishes and saves server-side. Telling
           * somebody their edit was discarded when it is being written as they
           * read the sentence is the worst version of this message.
           *
           * The exchange stays marked running and the watcher below picks it
           * back up.
           */
          patch((e) => ({ ...e, running: true, error: undefined, reconnecting: true }))
          setReconnecting(true)
          return
        }
      } finally {
        abortRef.current = null
        setBusy(false)
      }
    },
    [busy, onFilesChanged, siteId],
  )

  /**
   * REATTACHING TO A RUN THAT OUTLIVED ITS CONNECTION.
   *
   * The agent no longer stops when the browser goes away, so the editor has
   * to be able to find its way back to a run in progress. Three moments
   * matter, and they are the three ways a phone actually loses a stream:
   * opening the editor again, returning to a backgrounded tab, and the
   * network coming back.
   *
   * A poll rather than a second stream. Reconnecting to a half-consumed
   * NDJSON response is not something fetch can do — there is no offset to
   * resume from — and the question being asked here is small enough that
   * asking it every few seconds costs less than the machinery to avoid it.
   *
   * `document.hidden` is checked because a backgrounded tab is throttled to
   * roughly one timer a minute; polling while hidden buys nothing and the
   * visibility listener covers the return.
   */
  const reloadAfterRun = React.useCallback(async () => {
    /**
     * `onFilesChanged` re-reads the project ITSELF — merging the paths the
     * creator has unsaved edits in, and adopting the new revision so the next
     * autosave does not conflict. Fetching /files here as well meant two
     * requests for the same thing, the answer to one of them discarded, and a
     * merge this side does not know how to do.
     */
    const [chat] = await Promise.all([
      /**
       * THE CHAT ENDPOINT MATTERS. If it fails, the transcript of the run
       * is saved server-side but not shown to the user — so it looks like
       * nothing happened. Handle the failure explicitly rather than
       * swallowing it.
       */
      fetch(`/api/sites/${siteId}/chat`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Chat endpoint ${r.status}`))))
        .catch((e) => { console.error("Chat reload failed:", e); return null }),
      onFilesChanged([]),
    ])
    return chat as { messages?: StoredMessage[] } | null
  }, [onFilesChanged, siteId])

  React.useEffect(() => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const check = async () => {
      if (stopped || document.hidden) return
      try {
        const response = await fetch(`/api/sites/${siteId}/run`, { cache: "no-store" })
        if (!response.ok) return
        const body = (await response.json()) as { running: boolean; prompt?: string }

        if (body.running) {
          setReconnecting(true)
          setBusy(true)
          // Show the prompt that is being worked on even on a fresh load,
          // where this tab never saw it sent.
          setExchanges((previous) =>
            previous.some((e) => e.running)
              ? previous
              : [
                  ...previous,
                  {
                    id: `active-${siteId}`,
                    prompt: body.prompt ?? "",
                    steps: [],
                    notes: [],
                    filesChanged: [],
                    running: true,
                    reconnecting: true,
                  },
                ],
          )
          timer = setTimeout(() => void check(), 3000)
          return
        }

        /**
         * Nothing is running. If this tab thought otherwise, the run finished
         * while it was away — so the transcript and the files are re-read and
         * the placeholder is replaced by what actually happened.
         */
        if (reconnecting) {
          setReconnecting(false)
          setBusy(false)
          const chat = await reloadAfterRun()
          const last = chat?.messages?.filter((m) => m.role === "assistant").at(-1)
          setExchanges((previous) =>
            previous.map((e) =>
              e.running
                ? {
                    ...e,
                    running: false,
                    reconnecting: false,
                    reply: last?.content || "Done.",
                    filesChanged: last?.filesChanged ?? e.filesChanged,
                    versionId: last?.versionId ?? e.versionId,
                    error: last?.error ?? undefined,
                    steps: last?.steps?.length
                      ? last.steps.map((t) => ({
                          id: crypto.randomUUID(),
                          kind: "tool" as const,
                          label: `${TOOL_LABELS[t.name] ?? t.name}${t.detail ? ` ${t.detail}` : ""}`,
                        }))
                      : e.steps,
                  }
                : e,
            ),
          )
        }
      } catch {
        // Offline. The `online` listener below is what resumes this.
        if (!stopped) timer = setTimeout(() => void check(), 5000)
      }
    }

    void check()
    const onVisible = () => { if (!document.hidden) void check() }
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("online", onVisible)
    window.addEventListener("focus", onVisible)

    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("online", onVisible)
      window.removeEventListener("focus", onVisible)
    }
  }, [reconnecting, reloadAfterRun, siteId])

  /**
   * The New Site brief, sent once.
   *
   * A ref rather than state, and checked before the send: React runs effects
   * twice in development Strict Mode, and the second run would start a second
   * generation — two full runs against the model, two bills, and two sets of
   * edits racing each other into the same files.
   */
  const briefSent = React.useRef(false)
  React.useEffect(() => {
    if (briefSent.current || !openingBrief?.trim()) return
    /**
     * Waits for history, and skips if there is any.
     *
     * The brief lives in the URL, so a reopened tab — or a refresh, or a
     * shared link — still carries it. Without this check, coming back to a
     * finished site would silently start the whole generation again, against
     * a project that had already been built, and bill for it.
     */
    if (loadingHistory) return
    briefSent.current = true
    if (exchanges.length > 0) return
    void send(openingBrief)
  }, [exchanges.length, loadingHistory, openingBrief, send])

  const undo = React.useCallback(
    async (exchangeId: string, versionId: string) => {
      const response = await fetch(`/api/sites/${siteId}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId }),
      })
      if (!response.ok) return
      const body = (await response.json()) as { paths?: string[] }
      setExchanges((previous) =>
        previous.map((e) => (e.id === exchangeId ? { ...e, undone: true } : e)),
      )
      onFilesChanged(body.paths ?? [])
    },
    [onFilesChanged, siteId],
  )

  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar md:border-r md:border-border">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
        {/* The product's own mark, not a generic sparkle. This header is the
            first thing on screen on a phone, where it is the only branding
            the editor shows at all. */}
        <StorelibMark className="h-4 w-4 shrink-0" />
        <span className="text-sm font-medium">Storelib AI</span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4 py-5">
        {loadingHistory ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading the conversation…
          </p>
        ) : historyError ? (
          /**
           * The transcript could not be READ. Showing the "describe a change"
           * invitation here would tell somebody their conversation is gone
           * when it is sitting in the table, unreadable — and nothing they do
           * next would bring it back, because there is nothing wrong with it.
           */
          <div className="rounded-[10px] border border-destructive/30 bg-destructive/5 px-3 py-4">
            <p className="text-sm font-medium">We could not load this conversation.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Nothing has been lost — this is a problem reading it, not a problem with it. Refresh in
              a moment. You can still send a new message.
            </p>
          </div>
        ) : exchanges.length === 0 ? (
          <div className="space-y-5">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Describe a change to <span className="text-foreground">{siteName}</span> and it gets made in the code.
              The files in the Code tab are the site — there is no second copy of it anywhere.
            </p>
            <div className="space-y-1.5">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => {
                    setDraft(suggestion)
                    fieldRef.current?.focus()
                  }}
                  className="w-full rounded-[9px] border border-border bg-background/40 px-3 py-2.5 text-left text-xs leading-snug text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ul className="space-y-6">
            {exchanges.map((exchange) => (
              <li key={exchange.id} className="space-y-2.5">
                <p className="text-sm text-foreground">{exchange.prompt}</p>

                <RunProgress exchange={exchange} />

                {exchange.running && (
                  /**
                   * Two different truths, and saying the wrong one is what
                   * made this feel unreliable. "Working…" is the stream
                   * arriving. The second line is the stream gone while the
                   * run continues on the server — the moment a creator used
                   * to be told their edit had been thrown away.
                   */
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {exchange.reconnecting
                      ? "Still working — you can close this and come back."
                      : "Working…"}
                  </p>
                )}

                {exchange.reply && <p className="text-sm leading-relaxed text-muted-foreground">{exchange.reply}</p>}

                {exchange.questions && exchange.questions.length > 0 && !exchange.answered && (
                  <QuestionCards
                    questions={exchange.questions}
                    disabled={busy}
                    onSend={(answers) => {
                      const prompt = answersPrompt(answers)
                      if (!prompt) return
                      /**
                       * Marked answered BEFORE the send, so the cards go on
                       * the tap rather than when the next run starts. A form
                       * that stays live while its answers are in flight is one
                       * somebody submits twice.
                       */
                      setExchanges((previous) =>
                        previous.map((e) => (e.id === exchange.id ? { ...e, answered: true } : e)),
                      )
                      void send(prompt)
                    }}
                  />
                )}

                {exchange.filesChanged.length > 0 && (
                  <div className="flex items-center gap-3">
                    <p className="flex items-center gap-1.5 text-xs text-emerald-500">
                      <Check className="h-3 w-3 shrink-0" />
                      {exchange.filesChanged.length} file{exchange.filesChanged.length === 1 ? "" : "s"} changed
                    </p>
                    {exchange.versionId && !exchange.undone && (
                      <button
                        type="button"
                        onClick={() => void undo(exchange.id, exchange.versionId as string)}
                        className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Undo
                      </button>
                    )}
                    {exchange.undone && <span className="text-xs text-muted-foreground">Undone</span>}
                  </div>
                )}

                {exchange.error && (
                  <p className="flex items-start gap-1.5 text-xs text-destructive">
                    <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
                    {exchange.error}
                  </p>
                )}
              </li>
            ))}
            <div ref={bottomRef} />
          </ul>
        )}
      </div>

      <div className="shrink-0 p-3">
        {uploadError && (
          <p className="mb-2 rounded-[9px] border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {uploadError}
          </p>
        )}

        <div
          onDragOver={(event) => {
            event.preventDefault()
            setDropping(true)
          }}
          onDragLeave={() => setDropping(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDropping(false)
            void attach([...event.dataTransfer.files])
          }}
          className={cn(
            "overflow-hidden rounded-[11px] border bg-background transition-colors",
            dropping
              ? "border-foreground/40 bg-muted/40"
              : "border-border focus-within:border-foreground/25",
          )}
        >
          <textarea
            ref={fieldRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onPaste={(event) => {
              // A screenshot on the clipboard arrives as a file with no name.
              const files = [...event.clipboardData.files]
              if (files.length === 0) return
              event.preventDefault()
              void attach(files)
            }}
            onKeyDown={(event) => {
              // Enter sends, Shift+Enter is a newline — the convention every
              // chat surface uses, so it is what people's hands already do.
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                void send(draft)
              }
            }}
            rows={2}
            disabled={busy}
            placeholder="Describe a change…"
            className="w-full resize-none bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-60"
          />

          <div className="flex items-center justify-between gap-2 px-3 pb-2.5">
            <label
              className={cn(
                "flex h-7 cursor-pointer items-center gap-1.5 rounded-full px-2 text-[11px] text-muted-foreground transition-colors",
                "hover:bg-muted hover:text-foreground",
                uploading > 0 && "pointer-events-none opacity-60",
              )}
              title="Add an image or video"
            >
              {uploading > 0 ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ImagePlus className="h-3.5 w-3.5" />
              )}
              {uploading > 0 ? "Uploading…" : "Attach"}
              <input
                type="file"
                multiple
                accept="image/*,video/mp4,video/webm,audio/mpeg,application/pdf"
                className="sr-only"
                onChange={(event) => {
                  void attach([...(event.target.files ?? [])])
                  // Cleared so choosing the SAME file twice still fires.
                  event.target.value = ""
                }}
              />
            </label>

            {busy ? (
              <button
                type="button"
                onClick={stop}
                aria-label="Stop"
                className="flex h-7 items-center gap-1.5 rounded-full bg-foreground px-3 text-[11px] font-medium text-background"
              >
                <Square className="h-2.5 w-2.5 fill-current" />
                Stop
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void send(draft)}
                disabled={draft.trim().length === 0}
                aria-label="Send"
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-background transition-opacity",
                  "disabled:cursor-not-allowed disabled:opacity-25",
                )}
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
