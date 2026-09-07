"use client"

/**
 * The chat pane.
 *
 * The SHELL of it: the transcript, the composer, the suggestions and the empty
 * state. The agent itself — the tool loop over list_files / read_file /
 * write_file / run_build in lib/sites/types.ts — is the next step.
 *
 * ---------------------------------------------------------------------------
 *  A DISABLED BUTTON HAS TO SAY WHY
 * ---------------------------------------------------------------------------
 * It used to be a greyed arrow with "Editing by chat lands next" in 11px grey
 * beside it, and the first thing anyone asked about this editor was why the
 * send button did nothing. That is the whole failure: the control looked
 * broken rather than unbuilt, so the reader assumed a bug and went looking for
 * it.
 *
 * The composer now refuses in the place a person is already looking — inside
 * it, above the field, in a sentence — and the field still takes text so the
 * layout, the scroll behaviour and the way a long reply sits next to a preview
 * are settled before there is a model behind them.
 */

import * as React from "react"
import { ArrowUp, Sparkles } from "lucide-react"

import { cn } from "@/lib/utils"

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
}

const SUGGESTIONS = [
  "Make the hero bolder and add a testimonial section",
  "Change the palette to something warmer",
  "Add a pricing section with three tiers",
]

export function ChatPane({ siteName }: { siteName: string }) {
  const [messages] = React.useState<ChatMessage[]>([])
  const [draft, setDraft] = React.useState("")
  const fieldRef = React.useRef<HTMLTextAreaElement>(null)

  /**
   * The field grows with the text instead of scrolling inside fixed rows.
   *
   * Reset to 0 rather than "auto" before measuring: "auto" leaves the browser
   * free to report the height it already had, so the field never shrinks back
   * after a long draft is deleted.
   *
   * The floor is not cosmetic. scrollHeight on an EMPTY textarea is one line
   * plus padding, so the field collapsed below the height of its own
   * placeholder and cut "Describe a change…" in half — the first thing anyone
   * sees in this pane.
   */
  React.useEffect(() => {
    const field = fieldRef.current
    if (!field) return
    field.style.height = "0px"
    field.style.height = `${Math.min(Math.max(field.scrollHeight, 60), 160)}px`
  }, [draft])

  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar md:border-r md:border-border">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
        <Sparkles className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Storelib AI</span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4 py-5">
        {messages.length === 0 ? (
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
          <ul className="space-y-4">
            {messages.map((message) => (
              <li
                key={message.id}
                className={cn("text-sm", message.role === "user" ? "text-foreground" : "text-muted-foreground")}
              >
                {message.content}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="shrink-0 p-3">
        <div className="overflow-hidden rounded-[11px] border border-border bg-background focus-within:border-foreground/25">
          <p className="border-b border-border px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
            Not connected yet — Storelib AI needs a model key before it can edit your site. Everything else in this
            editor works: the Code tab writes real files and the preview rebuilds as you type.
          </p>

          <textarea
            ref={fieldRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={2}
            placeholder="Describe a change…"
            className="w-full resize-none bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground"
          />

          <div className="flex items-center justify-end px-3 pb-2.5">
            <button
              type="button"
              disabled
              title="Storelib AI is not connected yet"
              aria-label="Send"
              className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-background disabled:cursor-not-allowed disabled:opacity-25"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
