"use client"

/**
 * ASK AI, IN THE LINKS TAB (round AR, lib/onepage/ai-edits). One line: what
 * to change ("add my TikTok @ana", "change the shop link to ana.com/shop",
 * "show my socials as buttons"). The server asks the model which edits it
 * means (app/api/onepage/ai); they are applied here to the page as it is on
 * screen, through the same checks a change by hand goes through, in one
 * step Undo takes back, and saved by the editor's own Save. What was changed
 * and what was refused is said under the field.
 */
import { useState } from "react"
import { ArrowUp, Loader2 } from "lucide-react"
import { useOnePage } from "@/lib/onepage/context"
import { applyAiEdits } from "@/lib/onepage/ai-edits"
import { generateBlockId, type OnePageBlock, type OnePageSocialLinks } from "@/lib/onepage/types"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"

export function AiEditBar() {
  const { onepage, getLatestOnePage, updateOnePage } = useOnePage()
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<{ tone: "ok" | "error"; words: string } | null>(null)
  if (!onepage) return null

  const send = async () => {
    const instruction = text.trim()
    const page = getLatestOnePage()
    if (!instruction || busy || !page) return
    setBusy(true)
    setSaid(null)
    try {
      const res = await fetch("/api/onepage/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ id: page.id, instruction, page: { social_links: page.social_links ?? {}, draft_blocks: page.draft_blocks ?? [] } }),
      })
      const body = (await res.json().catch(() => null)) as { edits?: unknown[]; reply?: string; error?: string } | null
      if (!res.ok || !body) {
        setSaid({ tone: "error", words: body?.error || tt("That did not work. Try again.") })
        return
      }
      /* The page as it is now, not as it was when the question left: typing meanwhile is kept. */
      const now = getLatestOnePage() ?? page
      const result = applyAiEdits(
        { social_links: (now.social_links ?? {}) as Record<string, string | null>, draft_blocks: (now.draft_blocks ?? []) as never },
        body.edits ?? [],
        { newId: generateBlockId },
      )
      if (result.applied.length) {
        updateOnePage({ social_links: result.page.social_links as OnePageSocialLinks, draft_blocks: result.page.draft_blocks as unknown as OnePageBlock[] })
        setText("")
      }
      const words = [result.applied.length ? tt("{n, plural, one {# change made.} other {# changes made.}}", { n: result.applied.length }) : body.reply || tt("Nothing was changed."), ...result.refused].join(" ")
      setSaid({ tone: result.applied.length ? "ok" : "error", words })
    } catch {
      setSaid({ tone: "error", words: tt("That did not work. Try again.") })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mb-3" data-ai-edit-bar="">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
        className="flex items-center gap-1.5 rounded-xl border border-[#e3e4e8] bg-white py-1 pl-3.5 pr-1 transition-[border-color,box-shadow] duration-150 focus-within:border-[#1a1a2e] focus-within:shadow-[0_0_0_3px_rgba(26,26,46,0.08)]"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={600}
          placeholder={tt("Ask AI: add my TikTok @ana")}
          aria-label={tt("Ask AI to change your links and social icons")}
          className="h-10 min-w-0 flex-1 bg-transparent text-[16px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] sm:text-[14px]"
          data-ai-edit-input=""
        />
        <button
          type="submit"
          disabled={busy || !text.trim()}
          aria-label={tt("Send")}
          className={cn("grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-lg bg-[#1a1a2e] text-white transition-[opacity,scale] duration-150 active:scale-[0.95] disabled:cursor-default disabled:opacity-40")}
          data-ai-edit-send=""
        >
          {busy ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <ArrowUp aria-hidden className="h-4 w-4" />}
        </button>
      </form>
      {said ? (
        <p role="status" className={cn("mt-1.5 px-1 text-[12.5px] leading-[18px]", said.tone === "ok" ? "text-[#067647]" : "text-[#6b7280]")} data-ai-edit-said={said.tone}>
          {said.words}
        </p>
      ) : null}
    </div>
  )
}
