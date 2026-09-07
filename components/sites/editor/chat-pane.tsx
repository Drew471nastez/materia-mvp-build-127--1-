"use client"

/**
 * The chat pane.
 *
 * The SHELL of it: the transcript, the composer, and the empty state that says
 * what this will be able to do. The agent itself — the tool loop over
 * list_files / read_file / write_file / run_build in lib/sites/types.ts — is
 * the next step, and this composer refuses rather than pretending.
 *
 * It refuses out loud instead of being hidden because the layout, the scroll
 * behaviour and the way a long reply sits next to a preview are all things
 * worth having settled before there is a model behind them.
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

  return (
    <div className="flex h-full min-h-0 flex-col border-r border-border bg-background">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
        <Sparkles className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Storelib AI</span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {messages.length === 0 ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Describe a change to <span className="text-foreground">{siteName}</span> and it gets made in the code —
              the files on the right are the site, and there is no second copy of it anywhere.
            </p>
            <div className="space-y-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setDraft(s)}
                  className="w-full rounded-[7px] border border-border px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ul className="space-y-4">
            {messages.map((m) => (
              <li key={m.id} className={cn("text-sm", m.role === "user" ? "text-foreground" : "text-muted-foreground")}>
                {m.content}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="shrink-0 border-t border-border p-3">
        <div className="rounded-[10px] border border-border focus-within:border-foreground/30">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            placeholder="Describe a change…"
            className="w-full resize-none bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground"
          />
          <div className="flex items-center justify-between gap-2 px-3 pb-2.5">
            <span className="text-[11px] text-muted-foreground">Editing by chat lands next</span>
            <button
              type="button"
              disabled
              aria-label="Send"
              className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-background disabled:opacity-30"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
