"use client"

/**
 * ===========================================================================
 *  THE AI PANEL IN THE THEME EDITOR
 * ===========================================================================
 * It edits the SAME sections the panels on the left edit. Not a copy, not a
 * parallel document — the operations that come back are applied to the state
 * the colour pickers and the drag handles are already writing to.
 *
 * That is what makes the three things below true at once, and none of them
 * would be if the AI wrote to the database behind the editor's back:
 *
 *   - the preview moves WHILE the model is working, because each operation is
 *     applied the moment it arrives rather than at the end;
 *   - Undo takes back the whole AI edit, because one snapshot is pushed before
 *     the first operation and the operations are ordinary state changes after
 *     that;
 *   - Save is unchanged. It writes what is on screen, and it has no idea an AI
 *     was involved.
 *
 * The applier is shared with the server — see lib/website-builder/agent/
 * operations.ts for why there is exactly one of it.
 */

import * as React from "react"
import { ArrowUp, Check, Loader2, RotateCcw, Square, TriangleAlert, X } from "lucide-react"

import { StorelibMark } from "@/components/storelib-mark"
import { cn } from "@/lib/utils"
import type { ThemeOp } from "@/lib/website-builder/agent/operations"
import type { SectionInstance } from "@/lib/website-builder/types"

interface Exchange {
  id: string
  prompt: string
  /** One line per change, in the creator's words: "Added Pricing". */
  changes: string[]
  reply?: string
  error?: string
  running: boolean
  /**
   * The agent's own words while it works. It streams these between tool calls
   * and the panel used to drop them, so a run that spent twenty seconds
   * reading a section and the catalogue showed "Working" and nothing else.
   * Latest line only — this is commentary, not a transcript.
   */
  note?: string
}

/**
 * Written to show what it can actually do, not to be safe. Each one exercises
 * a different part: blocks, one section's controls, a section built from
 * nothing, and the theme's own settings.
 */
const SUGGESTIONS = [
  "Add an FAQ with five questions about what I sell",
  "Build a pricing section with three real tiers",
  "Make this section's heading shorter and tighten the spacing",
  "Give the whole site a warmer palette and rounder buttons",
]

export function ThemeChat({
  installId,
  page,
  sections,
  settings,
  selectedSectionId,
  onRunStart,
  onOp,
  onClose,
}: {
  installId: string
  page: string
  sections: SectionInstance[]
  settings: Record<string, unknown>
  /**
   * The section the creator has open, so "make this section better" has a
   * referent. Without it the model gets a demonstrative pronoun and a list of
   * nine sections, which is not a question anybody can answer.
   */
  selectedSectionId?: string
  /** Called once before the first change, so one Undo takes the lot back. */
  onRunStart: () => void
  onOp: (op: ThemeOp) => void
  onClose: () => void
}) {
  const [exchanges, setExchanges] = React.useState<Exchange[]>([])
  const [loadingHistory, setLoadingHistory] = React.useState(true)
  const [historyError, setHistoryError] = React.useState<null | "not_set_up" | "read_failed">(null)
  const [draft, setDraft] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  /**
   * THE NEXT THING TO ASK, WHILE THE LAST ONE IS STILL GOING.
   *
   * The box used to be `disabled` for the whole run, so the moment you had a
   * second thought you had to hold it in your head and watch a spinner. A run
   * is one request in and one answer out — there is no reason a person cannot
   * be writing the next one — so Enter during a run queues it and it goes the
   * instant the run ends.
   */
  const [queued, setQueued] = React.useState<string | null>(null)
  const abortRef = React.useRef<AbortController | null>(null)
  const bottomRef = React.useRef<HTMLDivElement>(null)
  const fieldRef = React.useRef<HTMLTextAreaElement>(null)

  /**
   * The live state, read at send time rather than captured in the callback.
   *
   * A run started thirty seconds ago must send what the page looks like NOW —
   * including anything the person changed by hand while it was open — or the
   * model plans against a page that no longer exists and addresses sections by
   * ids that have moved.
   */
  const live = React.useRef({ sections, settings, page, selectedSectionId })
  live.current = { sections, settings, page, selectedSectionId }

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [exchanges])

  /**
   * THE CONVERSATION SURVIVES A REFRESH.
   *
   * It used to live only in this component's state, so reloading the editor
   * left the sections changed and no record of what had been asked for or
   * why — which is exactly the question somebody has when they come back to a
   * page they built last week.
   *
   * Restored as pairs: the transcript stores one row for the question and one
   * for the reply, and the panel shows one exchange.
   */
  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const response = await fetch(`/api/website-builder/themes/${installId}/chat`)
        if (!response.ok) {
          /**
           * A FAILED READ IS NOT AN EMPTY CONVERSATION. Showing a blank panel
           * would let somebody believe their history was gone when it is
           * sitting in the table.
           */
          const body = (await response.json().catch(() => ({}))) as { reason?: string }
          if (!cancelled) {
            setHistoryError(body.reason === "not_set_up" ? "not_set_up" : "read_failed")
          }
          return
        }
        const body = (await response.json()) as {
          messages: Array<{ id: string; role: string; content: string; ops: unknown[]; error: string | null }>
        }
        if (cancelled) return

        const restored: Exchange[] = []
        for (const message of body.messages) {
          if (message.role === "user") {
            restored.push({ id: message.id, prompt: message.content, changes: [], running: false })
            continue
          }
          const open = restored[restored.length - 1]
          if (!open) continue
          open.reply = message.content || undefined
          open.error = message.error ?? undefined
          /**
           * The operations are summarised rather than replayed. Replaying them
           * would apply the same edits a second time to a page that already
           * has them — the transcript is a record, not a script.
           */
          open.changes =
            message.ops.length > 0
              ? [`${message.ops.length} change${message.ops.length === 1 ? "" : "s"}`]
              : []
        }
        setExchanges(restored)
      } catch {
        if (!cancelled) setHistoryError("read_failed")
      } finally {
        if (!cancelled) setLoadingHistory(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [installId])

  const send = React.useCallback(
    async (text: string) => {
      const prompt = text.trim()
      if (!prompt || busy) return

      const id = crypto.randomUUID()
      setDraft("")
      setBusy(true)
      setExchanges((previous) => [...previous, { id, prompt, changes: [], running: true }])

      const patch = (change: (exchange: Exchange) => Exchange) =>
        setExchanges((previous) => previous.map((e) => (e.id === id ? change(e) : e)))

      /** One snapshot, before anything moves, so Undo takes back the whole run. */
      let snapshotTaken = false

      /**
       * THE RUN BELONGS TO THE PAGE IT STARTED ON.
       *
       * Switching pages swaps `sections` for a different page's, and the
       * operations coming back address the OLD page by id. Most would miss
       * harmlessly — update, move and remove all no-op on an id that is not
       * there — but `add_section` names no existing id and would land a new
       * section on whichever page happens to be open. Somebody would find a
       * pricing table on their About page with no idea where it came from.
       */
      const startedOn = live.current.page

      try {
        const controller = new AbortController()
        abortRef.current = controller

        const response = await fetch(`/api/website-builder/themes/${installId}/agent`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            prompt,
            page: live.current.page,
            sections: live.current.sections,
            settings: live.current.settings,
            selectedSectionId: live.current.selectedSectionId,
          }),
        })

        if (!response.ok || !response.body) {
          const body = (await response.json().catch(() => ({}))) as { error?: string }
          patch((e) => ({ ...e, running: false, error: body.error ?? "That did not go through." }))
          return
        }

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

            let event: { type: string; op?: ThemeOp; label?: string; text?: string; message?: string }
            try {
              event = JSON.parse(line)
            } catch {
              continue
            }

            /**
             * Checked per operation rather than once: the page can change at
             * any point during a run, and the next event is where it matters.
             */
            if (live.current.page !== startedOn) {
              controller.abort()
              patch((e) => ({
                ...e,
                running: false,
                reply: "Stopped — you moved to another page. Nothing was applied there.",
              }))
              return
            }

            if (event.type === "thinking") {
              const note = event.text ?? ""
              patch((e) => ({ ...e, note }))
            } else if (event.type === "op" && event.op) {
              if (!snapshotTaken) {
                onRunStart()
                snapshotTaken = true
              }
              onOp(event.op)
              const label = event.label ?? "Changed the page"
              patch((e) => ({ ...e, changes: [...e.changes, label] }))
            } else if (event.type === "message") {
              const reply = event.text ?? ""
              patch((e) => ({ ...e, reply, running: false }))
            } else if (event.type === "error") {
              const message = event.message ?? "The edit failed."
              patch((e) => ({ ...e, running: false, error: message }))
            }
          }
        }

        patch((e) => ({ ...e, running: false }))
      } catch (thrown) {
        const stopped = thrown instanceof DOMException && thrown.name === "AbortError"
        patch((e) => ({
          ...e,
          running: false,
          /**
           * A stop is the person deciding, not a fault — and changes already
           * applied are NOT rolled back, because they are on screen and one
           * Undo takes them back. Silently reverting work somebody watched
           * happen would be the more surprising behaviour.
           */
          error: stopped ? undefined : "Lost the connection. Anything already changed is still here.",
          reply: stopped ? "Stopped." : e.reply,
        }))
      } finally {
        abortRef.current = null
        setBusy(false)
      }
    },
    [busy, installId, onOp, onRunStart],
  )

  /**
   * Drains the queue when the run that was in the way finishes. `send` refuses
   * while `busy`, so this cannot fire into the middle of one.
   */
  React.useEffect(() => {
    if (busy || !queued) return
    const next = queued
    setQueued(null)
    void send(next)
  }, [busy, queued, send])

  /** Enter sends, or queues if something is already running. */
  const submit = React.useCallback(
    (text: string) => {
      const prompt = text.trim()
      if (!prompt) return
      setDraft("")
      if (busy) {
        setQueued(prompt)
        return
      }
      void send(prompt)
    },
    [busy, send],
  )

  /**
   * The box grows with what is in it, to a point. Two fixed rows is enough for
   * "make it blue" and not enough for the kind of instruction that is worth
   * writing — and a box you cannot see the bottom of is one people stop
   * writing long things in.
   */
  const resize = React.useCallback(() => {
    const field = fieldRef.current
    if (!field) return
    field.style.height = "auto"
    field.style.height = `${Math.min(field.scrollHeight, 160)}px`
  }, [])

  React.useEffect(resize, [draft, resize])

  return (
    <div className="flex h-full w-full flex-col bg-background">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
        <StorelibMark className="h-[18px] w-[18px] shrink-0 rounded-[5px]" />
        <span className="flex-1 text-[13px] font-medium">Ask Storelib</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close AI panel"
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {loadingHistory ? (
          <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading
          </p>
        ) : historyError === "not_set_up" ? (
          <div className="rounded-[10px] border border-amber-500/30 bg-amber-500/5 px-3 py-3">
            <p className="text-[13px] font-medium">Chat history is not switched on yet.</p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
              This database has nowhere to keep the conversation, so it will not survive a reload.
              Everything else works — ask for a change and it is made.
            </p>
          </div>
        ) : historyError === "read_failed" ? (
          <div className="rounded-[10px] border border-red-500/30 bg-red-500/5 px-3 py-3">
            <p className="text-[13px] font-medium">We could not load this conversation.</p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
              Nothing has been lost — this is a problem reading it, not a problem with it. You can
              still ask for a change.
            </p>
          </div>
        ) : exchanges.length === 0 ? (
          <div className="space-y-4">
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              Describe a change and it is made on this page. It writes the same sections, blocks and
              controls the panels do — the same sliders, pickers and colours — so everything stays
              undoable and nothing saves until you press Save.
            </p>
            <div className="space-y-1.5">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => {
                    setDraft(suggestion)
                    fieldRef.current?.focus()
                    requestAnimationFrame(resize)
                  }}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-left text-[12.5px] leading-snug text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ul className="space-y-5">
            {exchanges.map((exchange) => (
              <li key={exchange.id} className="space-y-2">
                <p className="text-[13px] text-foreground">{exchange.prompt}</p>

                {exchange.changes.length > 0 && (
                  <ul className="space-y-1 border-l border-border pl-3">
                    {exchange.changes.map((change, index) => (
                      <li
                        key={`${change}-${index}`}
                        className="flex items-center gap-2 text-[12px] text-muted-foreground"
                      >
                        <Check className="h-3 w-3 shrink-0 text-emerald-500" strokeWidth={2} />
                        <span className="truncate">{change}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {exchange.note && exchange.running && (
                  <p
                    key={exchange.note}
                    className="animate-in fade-in text-[12.5px] leading-relaxed text-muted-foreground duration-300"
                  >
                    {exchange.note}
                  </p>
                )}

                {exchange.running && (
                  <p className="flex items-center gap-2 text-[12px] text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Working
                  </p>
                )}

                {exchange.reply && (
                  <p className="text-[13px] leading-relaxed text-muted-foreground">{exchange.reply}</p>
                )}

                {exchange.error && (
                  <div className="space-y-1.5">
                    <p className="flex items-start gap-1.5 text-[12px] text-red-500">
                      <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
                      {exchange.error}
                    </p>
                    {/*
                      A failed run leaves the request sitting there with no way
                      to make it again except retyping it, which is the moment
                      most people give up on a feature rather than on the
                      network.
                    */}
                    <button
                      type="button"
                      onClick={() => submit(exchange.prompt)}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11.5px] text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground disabled:opacity-40"
                    >
                      <RotateCcw className="h-3 w-3" strokeWidth={2} />
                      Try again
                    </button>
                  </div>
                )}
              </li>
            ))}
            {queued && (
              <li className="flex items-start gap-2 text-[12.5px] text-muted-foreground/70">
                <span className="mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                <span>
                  Up next: <span className="text-foreground/70">{queued}</span>
                </span>
              </li>
            )}
            <div ref={bottomRef} />
          </ul>
        )}
      </div>

      <div className="shrink-0 border-t border-border p-2.5">
        <div className="rounded-xl border border-border bg-background focus-within:border-foreground/30">
          {/*
            NOT `disabled` while a run is going. Waiting for a spinner before
            you are allowed to type your next thought is the difference between
            a conversation and a form. Enter during a run queues it instead.
          */}
          <textarea
            ref={fieldRef}
            rows={2}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                submit(draft)
              }
            }}
            placeholder={busy ? "Ask for the next change…" : "Change this page…"}
            className="w-full resize-none bg-transparent px-3 pt-2.5 text-[13px] leading-snug outline-none placeholder:text-muted-foreground/50"
          />
          <div className="flex items-center justify-between px-2 pb-2">
            <span className="pl-1 text-[11px] text-muted-foreground/60">
              {busy ? "Enter queues it" : "Enter to send, ⇧Enter for a new line"}
            </span>
            <div className="flex items-center gap-1.5">
              {busy && (
                <button
                  type="button"
                  onClick={() => abortRef.current?.abort()}
                  aria-label="Stop"
                  title="Stop"
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Square className="h-2.5 w-2.5 fill-current" />
                </button>
              )}
              <button
                type="button"
                onClick={() => submit(draft)}
                disabled={draft.trim().length === 0}
                aria-label={busy ? "Queue" : "Send"}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-lg transition-opacity",
                  draft.trim().length === 0
                    ? "bg-muted text-muted-foreground/50"
                    : "bg-foreground text-background",
                )}
              >
                <ArrowUp className="h-3.5 w-3.5" strokeWidth={2.25} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
