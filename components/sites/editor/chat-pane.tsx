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
import { ArrowUp, Check, FileCode, Hammer, Loader2, Sparkles, TriangleAlert } from "lucide-react"

import { cn } from "@/lib/utils"
import type { AgentEvent } from "@/lib/sites/agent/types"

interface Step {
  id: string
  kind: "tool" | "note"
  label: string
}

interface Exchange {
  id: string
  prompt: string
  steps: Step[]
  reply?: string
  error?: string
  filesChanged: string[]
  running: boolean
}

const SUGGESTIONS = [
  "Make the hero bolder and add a testimonial section",
  "Change the palette to something warmer",
  "Add a pricing section with three tiers",
]

const TOOL_LABELS: Record<string, string> = {
  list_files: "Looked at the project",
  read_file: "Read",
  write_file: "Edited",
  create_file: "Created",
  delete_file: "Deleted",
  run_build: "Built the site",
  read_build_errors: "Checked the errors",
}

export function ChatPane({
  siteId,
  siteName,
  onFilesChanged,
}: {
  siteId: string
  siteName: string
  onFilesChanged: (paths: string[]) => void
}) {
  const [exchanges, setExchanges] = React.useState<Exchange[]>([])
  const [draft, setDraft] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const fieldRef = React.useRef<HTMLTextAreaElement>(null)
  const bottomRef = React.useRef<HTMLDivElement>(null)

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

  const send = React.useCallback(
    async (text: string) => {
      const prompt = text.trim()
      if (!prompt || busy) return

      const id = crypto.randomUUID()
      setDraft("")
      setBusy(true)
      setExchanges((previous) => [
        ...previous,
        { id, prompt, steps: [], filesChanged: [], running: true },
      ])

      const patch = (change: (exchange: Exchange) => Exchange) =>
        setExchanges((previous) => previous.map((e) => (e.id === id ? change(e) : e)))

      try {
        const response = await fetch(`/api/sites/${siteId}/agent`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
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
            } else if (event.type === "done") {
              patch((e) => ({ ...e, running: false }))
            }
          }
        }
      } catch {
        patch((e) => ({ ...e, running: false, error: "Lost the connection. Nothing was changed." }))
      } finally {
        setBusy(false)
        patch((e) => ({ ...e, running: false }))
      }
    },
    [busy, onFilesChanged, siteId],
  )

  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar md:border-r md:border-border">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
        <Sparkles className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Storelib AI</span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4 py-5">
        {exchanges.length === 0 ? (
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

                {exchange.steps.length > 0 && (
                  <ul className="space-y-1">
                    {exchange.steps.map((step) => (
                      <li key={step.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                        {step.label.startsWith("Built") ? (
                          <Hammer className="h-3 w-3 shrink-0" />
                        ) : (
                          <FileCode className="h-3 w-3 shrink-0" />
                        )}
                        <span className="truncate">{step.label}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {exchange.running && (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Working…
                  </p>
                )}

                {exchange.reply && <p className="text-sm leading-relaxed text-muted-foreground">{exchange.reply}</p>}

                {exchange.filesChanged.length > 0 && (
                  <p className="flex items-center gap-1.5 text-xs text-emerald-500">
                    <Check className="h-3 w-3 shrink-0" />
                    {exchange.filesChanged.length} file{exchange.filesChanged.length === 1 ? "" : "s"} changed
                  </p>
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
        <div className="overflow-hidden rounded-[11px] border border-border bg-background focus-within:border-foreground/25">
          <textarea
            ref={fieldRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
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

          <div className="flex items-center justify-end px-3 pb-2.5">
            <button
              type="button"
              onClick={() => void send(draft)}
              disabled={busy || draft.trim().length === 0}
              aria-label="Send"
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-background transition-opacity",
                "disabled:cursor-not-allowed disabled:opacity-25",
              )}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUp className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
