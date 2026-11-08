"use client"

/**
 * ===========================================================================
 *  CREATE A WEBSITE: THREE WAYS IN
 * ===========================================================================
 * At the top of the Website page, the ways a creator starts another website
 * in the builder they already use:
 *
 *   • Start with AI: a description, and Create. The page makes a new
 *     website (POST /api/website-builder/themes/create, mode "ai") and opens
 *     the editor on it, where the Ask panel builds it from the description
 *     (lib/website-builder/start-handoff.ts). What it makes is an ordinary
 *     website: every section editable, nothing generated as code.
 *   • Start from blank: the same website with only its header and footer,
 *     opened in the editor.
 *   • Browse themes: the theme page (/app/website-builder/themes), the way
 *     Add theme went before. It was a button on the Library heading; it is
 *     one door of three now, so there is one way to the themes, not two.
 *
 * A full library keeps the doors on screen, says why they cannot be used,
 * and each opens the full library sheet, where a draft can be removed
 * (./library-full-dialog). A team member with Website does not get Start
 * with AI: the Ask panel spends the store owner's plan and is not offered to
 * them in the editor either (lib/team/website).
 *
 * Only the page's own colours and depth (website-builder-client.tsx), which
 * app/theme-dark.css already maps for the dark look.
 */
import * as React from "react"
import Link from "next/link"
import { ArrowUp, ChevronRight, FilePlus2, LayoutGrid, Loader2, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { START_PROMPT_MAX } from "@/lib/website-builder/start-handoff"
import type { StartMode } from "@/lib/website-builder/create-website"

/** Where Browse themes goes: the theme page Add theme opened. */
export const THEMES_PATH = "/app/website-builder/themes"

/** Each example: the chip's words, and the description it puts in the box. */
function examples(): { label: string; prompt: string }[] {
  return [
    { label: tt("Candle shop"), prompt: tt("An online shop for my hand-poured soy candles, with a warm and calm look, best sellers on the home page and the story of how they are made.") },
    { label: tt("Fitness coach"), prompt: tt("A website for my personal training business with my programs, client results, prices and a way to book a free first call.") },
    { label: tt("Photographer"), prompt: tt("A portfolio for my wedding and portrait photography with galleries, packages and prices, and a contact form.") },
    { label: tt("Online course"), prompt: tt("A website that sells my watercolor course for beginners, with what is inside, reviews, an FAQ and a clear buy button.") },
  ]
}

/** A door on the right: an icon in a tile, a name, a line under it and a chevron, the whole row one target. */
const DOOR =
  "group/door flex min-h-[64px] w-full min-w-0 items-center gap-3 rounded-xl border border-[#e5e7eb] bg-white px-3.5 py-3 text-left shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors duration-150 outline-none pointer-fine:hover:border-[#d1d5db] pointer-fine:hover:bg-[#fafbfc] active:bg-[#f3f4f6] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 [-webkit-tap-highlight-color:transparent]"

function DoorBody({ icon, title, line, busy }: { icon: React.ReactNode; title: string; line: string; busy?: boolean }) {
  return (
    <>
      <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#f3f4f6] text-[#4b5563]">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold text-[#1a1a2e]">{title}</span>
        <span className="mt-0.5 block text-[12.5px] leading-snug text-[#6b7280]">{line}</span>
      </span>
      <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-[#9ca3af]" strokeWidth={2} />
    </>
  )
}

export function StartWebsite({
  full,
  teamMember = false,
  starting,
  blocked = false,
  onStart,
  onFull,
  onBrowse,
}: {
  /** The library has no room: the doors say so and open the full library sheet. */
  full: boolean
  /** A team member with Website: no Start with AI (see the note at the top). */
  teamMember?: boolean
  /** The way in that is making its website right now. */
  starting: StartMode | null
  /** Something else is being made (an import, a copy): a second waits for it. */
  blocked?: boolean
  onStart: (mode: StartMode, prompt?: string) => void
  onFull: () => void
  /** Browse themes was pressed and is leaving the page. */
  onBrowse: () => void
}) {
  const [prompt, setPrompt] = React.useState("")
  const field = React.useRef<HTMLTextAreaElement>(null)
  const ready = prompt.trim().length > 0
  const busy = starting !== null || blocked
  const ai = !teamMember
  const fullNote = full ? (
    <p role="note" data-start-full="" className="flex flex-wrap items-baseline gap-x-1.5 rounded-lg bg-[#f8f9fa] px-3 py-2 text-[12.5px] text-[#4b5563]">
      <span className="font-semibold text-[#1a1a2e]">{tt("Your library is full")}</span>
      <span>{tt("Remove a website from your library to start another.")}</span>
    </p>
  ) : null

  const create = () => {
    if (full) return onFull()
    if (!ready || busy) return
    onStart("ai", prompt.trim())
  }

  return (
    <section aria-labelledby="start-heading" className="space-y-3" data-page-block data-start-website={full ? "full" : "open"}>
      <h2 id="start-heading" className="text-[16px] font-semibold tracking-tight text-[#1a1a2e]">
        {tt("Create a website")}
      </h2>
      <div
        className={cn(
          "grid grid-cols-1 gap-3 overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white p-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:p-4",
          ai && "lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:gap-4",
        )}
      >
        {ai && (
          /* ── Start with AI ─────────────────────────────────────── */
          <form
            data-start-door="ai"
            className="flex min-w-0 flex-col gap-2.5"
            onSubmit={(e) => {
              e.preventDefault()
              create()
            }}
          >
            <div className="flex items-center gap-2">
              <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#1a1a2e] text-white">
                <Sparkles className="h-3.5 w-3.5" strokeWidth={2.2} />
              </span>
              <h3 className="text-[14px] font-semibold text-[#1a1a2e]">{tt("Start with AI")}</h3>
            </div>
            <label htmlFor="start-ai-prompt" className="sr-only">
              {tt("Describe your website")}
            </label>
            <div
              className={cn(
                "rounded-xl border border-[#e5e7eb] bg-white transition-[border-color,box-shadow] duration-150 focus-within:border-[#d1d5db] focus-within:ring-2 focus-within:ring-[#1a1a2e]/20",
                full && "bg-[#f8f9fa]",
              )}
            >
              <textarea
                id="start-ai-prompt"
                ref={field}
                value={prompt}
                maxLength={START_PROMPT_MAX}
                rows={3}
                disabled={full || starting === "ai"}
                placeholder={tt("Describe your website")}
                onChange={(e) => setPrompt(e.target.value.slice(0, START_PROMPT_MAX))}
                onKeyDown={(e) => {
                  /* Enter with Cmd or Ctrl creates; Enter alone is a new line in a description. */
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    create()
                  }
                }}
                aria-describedby={full ? "start-full-note" : undefined}
                className="block max-h-[220px] min-h-[84px] w-full resize-none rounded-xl bg-transparent px-3.5 pt-3 pb-1 text-[14px] leading-relaxed text-[#1a1a2e] outline-none [field-sizing:content] placeholder:text-[#9ca3af] disabled:cursor-not-allowed"
              />
              <div className="flex items-end justify-between gap-3 px-3 pb-2.5">
                <span aria-live="polite" className={cn("text-[11.5px] tabular-nums text-[#9ca3af]", prompt.length < START_PROMPT_MAX - 200 && "invisible")}>
                  {tt("{count} of {max}", { count: prompt.length.toLocaleString(), max: START_PROMPT_MAX.toLocaleString() })}
                </span>
                <button
                  type="submit"
                  data-start-create=""
                  aria-describedby={full ? "start-full-note" : undefined}
                  disabled={!full && (!ready || busy)}
                  className={cn(
                    "inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-[10px] bg-[#1a1a2e] px-4 text-[14px] font-semibold text-white outline-none transition-colors duration-150 hover:bg-[#2d2d44] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 sm:h-9 sm:rounded-lg sm:px-3.5 sm:text-[13px] [-webkit-tap-highlight-color:transparent]",
                    full && "opacity-40",
                  )}
                >
                  {starting === "ai" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" strokeWidth={2.25} />}
                  {starting === "ai" ? tt("Creating") : tt("Create")}
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label={tt("Examples")}>
              {examples().map((x) => (
                <button
                  key={x.label}
                  type="button"
                  data-start-example=""
                  disabled={full || starting === "ai"}
                  onClick={() => {
                    setPrompt(x.prompt)
                    requestAnimationFrame(() => {
                      const el = field.current
                      if (!el) return
                      el.focus({ preventScroll: true })
                      el.setSelectionRange(el.value.length, el.value.length)
                    })
                  }}
                  className="inline-flex h-11 items-center rounded-full border border-[#e5e7eb] bg-white px-3.5 text-[13px] font-medium text-[#4b5563] outline-none transition-colors duration-150 pointer-fine:hover:border-[#d1d5db] pointer-fine:hover:bg-[#f8f9fa] pointer-fine:hover:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 disabled:cursor-not-allowed disabled:opacity-50 sm:h-8 sm:px-3 sm:text-[12.5px] [-webkit-tap-highlight-color:transparent]"
                >
                  {x.label}
                </button>
              ))}
            </div>
          </form>
        )}

        {/* ── Start from blank, Browse themes ─────────────────────── */}
        <div className={cn("flex min-w-0 flex-col gap-2.5", ai ? "lg:border-l lg:border-[#eceef1] lg:pl-4" : "sm:grid sm:grid-cols-2 sm:gap-3")}>
          {ai && <h3 className="sr-only">{tt("Other ways to start")}</h3>}
          <button
            type="button"
            data-start-door="blank"
            aria-describedby={full ? "start-full-note" : undefined}
            aria-haspopup={full ? "dialog" : undefined}
            aria-busy={starting === "blank" || undefined}
            disabled={!full && busy}
            onClick={() => (full ? onFull() : onStart("blank"))}
            className={cn(DOOR, (full || (busy && starting !== "blank")) && "opacity-60", "disabled:cursor-not-allowed")}
          >
            <DoorBody icon={<FilePlus2 className="h-4 w-4" strokeWidth={1.9} />} title={tt("Start from blank")} line={tt("An empty page with your header and footer")} busy={starting === "blank"} />
          </button>
          <Link
            href={THEMES_PATH}
            data-start-door="themes"
            aria-describedby={full ? "start-full-note" : undefined}
            aria-haspopup={full ? "dialog" : undefined}
            onClick={(e) => {
              if (full) {
                e.preventDefault()
                onFull()
                return
              }
              onBrowse()
            }}
            className={cn(DOOR, full && "opacity-60")}
          >
            <DoorBody icon={<LayoutGrid className="h-4 w-4" strokeWidth={1.9} />} title={tt("Browse themes")} line={tt("Start from a ready-made design")} />
          </Link>
          {fullNote && <div id="start-full-note">{fullNote}</div>}
        </div>
      </div>
    </section>
  )
}
