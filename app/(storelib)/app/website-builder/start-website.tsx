"use client"

/**
 * ===========================================================================
 *  CREATE A WEBSITE: THREE WAYS IN
 * ===========================================================================
 * At the top of the Website page, the ways a creator starts another website
 * in the builder they already use:
 *
 *   • Start with AI: a description, and Create. The page makes a new
 *     website and a generation job on the server (POST /api/website-builder/
 *     themes/create, mode "ai", lib/website-builder/ai-site) and opens the
 *     editor on it at once, where a progress view shows the site being
 *     planned, written and illustrated as it lands. Closing the tab does not
 *     stop it. What it makes is an ordinary website: every section a built-in
 *     section, editable in the sidebar, nothing generated as code.
 *     ROUND L: an example chip puts its words in the box and is sent as the
 *     category; words the person typed are never replaced without asking
 *     (chipAction); "From scratch" (round N: the default) makes the
 *     website without the theme's header, footer and sections for the AI
 *     to make its own. The
 *     box, the chip and the choice survive a reload of this page (this
 *     tab's storage), and the words are sent exactly as they are.
 *   • Start from blank: the same website with only its header and footer,
 *     opened in the editor.
 *   • Browse themes: the theme marketplace, opened over the page as a popup
 *     (./themes/themes-client.tsx). It was a link to a page of its own.
 *
 * WHERE THIS IS DRAWN (templates round 16). Not on /app/website-builder any
 * more: only on /app/website-builder/ai (./ai/page.tsx), which is that page
 * with this section at the top and is reached by its address alone.
 *
 * A full library keeps the doors on screen, says why they cannot be used,
 * and each opens the full library sheet, where a draft can be removed
 * (./library-full-dialog). A team member with Website does not get Start
 * with AI: the Ask panel spends the store owner's plan and is not offered to
 * them in the editor either (lib/team/website).
 *
 * ROUND N (N1). Andrew: "It needs to be fully free, not limited by the
 * theme's design choices" and "It should NOT take me to the default theme".
 * From scratch is now THE way Start with AI builds: the choice under the box
 * starts on "From scratch" (generation "blank"), and building inside
 * Storelib's theme is the second option, named for what it keeps. When the
 * new AI builder (the agent engine) is not on for the account (`agent`
 * false, from the server: lib/website-builder/ai-site/agent-access.ts),
 * From scratch is not offered as if it worked: it says, in one line, that
 * the new AI builder is not on yet, and the press builds inside the theme,
 * which is what the older builder can do. Nothing is switched silently: the
 * server refuses a from scratch press for such an account (409 agent_off)
 * instead of running the older builder on the theme's sections.
 *
 * Only the page's own colours and depth (website-builder-client.tsx), which
 * app/theme-dark.css already maps for the dark look.
 */
import * as React from "react"
import { ArrowUp, ChevronRight, FilePlus2, LayoutGrid, Loader2, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { START_PROMPT_MAX } from "@/lib/website-builder/start-handoff"
import type { StartMode } from "@/lib/website-builder/create-website"
import { START_PRESETS, START_GENERATION, chipAction, presetFor, readStartDraft, saveStartDraft, startGeneration, type GenerationMode, type StartCategory, type StartOptions } from "@/lib/website-builder/ai-site/start-options"

/**
 * Each example: its id (sent as the category), the chip's words, and the
 * description it puts in the box (lib/website-builder/ai-site/start-options).
 */
function examples(): { id: StartCategory; label: string; prompt: string }[] {
  return START_PRESETS.map((p) => ({ id: p.id, label: tt(p.label), prompt: tt(p.prompt) }))
}

/** The tab's storage, or nothing (private mode, a web view that refuses it). */
function tabStorage(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
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

/**
 * How Start with AI builds: from scratch (the default), or inside Storelib's
 * theme. Two options in one row, the picked one dark; each says what it
 * means in a few words. Without the new AI builder for the account, From
 * scratch is shown as not available yet, with why, and the theme is picked.
 */
function GenerationChoice({ value, agent, disabled, onChange }: { value: GenerationMode; agent: boolean; disabled: boolean; onChange: (next: GenerationMode) => void }) {
  const options: { id: GenerationMode; title: string; line: string; off?: boolean }[] = [
    { id: "blank", title: tt("From scratch"), line: tt("The AI designs every page, the header and the footer."), off: !agent },
    { id: "theme", title: tt("Inside Storelib's theme"), line: tt("Keeps the theme's header, footer and sections.") },
  ]
  return (
    <div className="pt-1">
      <div role="radiogroup" aria-label={tt("How the AI builds it")} data-start-generation={value} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {options.map((o) => {
          const on = value === o.id
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              data-start-generation-option={o.id}
              disabled={disabled || o.off}
              onClick={() => onChange(o.id)}
              className={cn(
                "flex min-h-11 min-w-0 flex-col items-start rounded-lg border px-3 py-2 text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 disabled:cursor-not-allowed [-webkit-tap-highlight-color:transparent]",
                on ? "border-[#1a1a2e] bg-[#f8f9fa]" : "border-[#e5e7eb] bg-white pointer-fine:hover:border-[#d1d5db]",
                o.off && "opacity-60",
              )}
            >
              <span className="flex items-center gap-2 text-[13px] font-semibold text-[#1a1a2e]">
                <span aria-hidden className={cn("h-3.5 w-3.5 shrink-0 rounded-full border", on ? "border-[4px] border-[#1a1a2e]" : "border-[#d1d5db]")} />
                {o.title}
              </span>
              <span className="mt-0.5 pl-[22px] text-[12px] leading-snug text-[#6b7280]">{o.line}</span>
            </button>
          )
        })}
      </div>
      {!agent && (
        <p role="note" data-start-agent-off="" className="mt-2 text-[12.5px] leading-snug text-[#6b7280]">
          {tt("The new AI builder isn't on for your account yet, so it builds inside Storelib's theme for now.")}
        </p>
      )}
    </div>
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
  agent = true,
}: {
  /** The library has no room: the doors say so and open the full library sheet. */
  full: boolean
  /** A team member with Website: no Start with AI (see the note at the top). */
  teamMember?: boolean
  /** The way in that is making its website right now. */
  starting: StartMode | null
  /** Something else is being made (an import, a copy): a second waits for it. */
  blocked?: boolean
  onStart: (mode: StartMode, prompt?: string, options?: StartOptions) => void
  onFull: () => void
  /** Browse themes was pressed: the page opens the theme marketplace over itself, and gives the focus back to this door after. */
  onBrowse: (opener: HTMLElement) => void
  /** The new AI builder (the agent engine) is on for this account: From scratch can be offered (round N). */
  agent?: boolean
}) {
  const [prompt, setPrompt] = React.useState("")
  /* The example picked, and the exact words it put in the box: the person's own words are told apart from them. */
  const [category, setCategory] = React.useState<StartCategory | null>(null)
  const [inserted, setInserted] = React.useState<string | null>(null)
  const [generation, setGeneration] = React.useState<GenerationMode>(START_GENERATION)
  /* An example pressed over the person's own words: asked, never replaced on its own. */
  const [asking, setAsking] = React.useState<{ id: StartCategory; replace: string; append: string } | null>(null)
  const field = React.useRef<HTMLTextAreaElement>(null)
  const ready = prompt.trim().length > 0
  const busy = starting !== null || blocked
  const ai = !teamMember

  /* Back on this page after a reload: the box as it was. */
  const restored = React.useRef(false)
  React.useEffect(() => {
    if (!ai) return
    const d = readStartDraft(tabStorage())
    if (d) {
      setPrompt(d.prompt.slice(0, START_PROMPT_MAX))
      setCategory(d.category)
      setInserted(d.inserted)
      setGeneration(d.generation)
    }
    restored.current = true
  }, [ai])
  React.useEffect(() => {
    if (!ai || !restored.current) return
    saveStartDraft(tabStorage(), { prompt, category, inserted, generation })
  }, [ai, prompt, category, inserted, generation])

  const focusEnd = () =>
    requestAnimationFrame(() => {
      const el = field.current
      if (!el) return
      el.focus({ preventScroll: true })
      el.setSelectionRange(el.value.length, el.value.length)
    })

  const put = (id: StartCategory, text: string, presetText: string) => {
    setPrompt(text.slice(0, START_PROMPT_MAX))
    setCategory(id)
    setInserted(presetText)
    setAsking(null)
    focusEnd()
  }

  const pressExample = (x: { id: StartCategory; prompt: string }) => {
    /* The picked one again: let it go, and its words with it while they are still untouched. */
    if (category === x.id) {
      setCategory(null)
      setAsking(null)
      if (prompt === inserted) {
        setPrompt("")
        setInserted(null)
      }
      return
    }
    const act = chipAction(prompt, inserted, x.prompt)
    if (act.kind === "ask") setAsking({ id: x.id, replace: act.replace, append: act.append })
    else put(x.id, x.prompt, x.prompt)
  }

  const create = () => {
    if (full) return onFull()
    if (!ready || busy) return
    setAsking(null)
    onStart("ai", prompt, { generation: startGeneration(generation, agent), ...(category ? { category } : {}) })
  }

  const fullNote = full ? (
    <p role="note" data-start-full="" className="flex flex-wrap items-baseline gap-x-1.5 rounded-lg bg-[#f8f9fa] px-3 py-2 text-[12.5px] text-[#4b5563]">
      <span className="font-semibold text-[#1a1a2e]">{tt("Your library is full")}</span>
      <span>{tt("Remove a website from your library to start another.")}</span>
    </p>
  ) : null

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
                onChange={(e) => {
                  const next = e.target.value.slice(0, START_PROMPT_MAX)
                  setPrompt(next)
                  /* An emptied box is a fresh start: no example is picked any more. */
                  if (!next.trim()) {
                    setCategory(null)
                    setInserted(null)
                  }
                }}
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
                  key={x.id}
                  type="button"
                  data-start-example={x.id}
                  aria-pressed={category === x.id}
                  disabled={full || starting === "ai"}
                  onClick={() => pressExample(x)}
                  className={cn(
                    "inline-flex h-11 items-center rounded-full border px-3.5 text-[13px] font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 disabled:cursor-not-allowed disabled:opacity-50 sm:h-8 sm:px-3 sm:text-[12.5px] [-webkit-tap-highlight-color:transparent]",
                    category === x.id
                      ? "border-[#1a1a2e] bg-[#1a1a2e] text-white"
                      : "border-[#e5e7eb] bg-white text-[#4b5563] pointer-fine:hover:border-[#d1d5db] pointer-fine:hover:bg-[#f8f9fa] pointer-fine:hover:text-[#1a1a2e]",
                  )}
                >
                  {x.label}
                </button>
              ))}
            </div>
            {asking && (
              <div role="group" aria-label={tt("Use this example?")} data-start-ask="" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-[#f8f9fa] px-3 py-2 text-[12.5px] text-[#4b5563]">
                <span className="min-w-[min(100%,15rem)] flex-1">{tt("You already wrote a description. Use the {name} example?", { name: tt(presetFor(asking.id).label) })}</span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <button type="button" data-start-ask-replace="" onClick={() => put(asking.id, asking.replace, asking.replace)} className="h-11 rounded-lg bg-[#1a1a2e] px-3 text-[12.5px] font-semibold text-white outline-none hover:bg-[#2d2d44] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 sm:h-8">
                    {tt("Replace")}
                  </button>
                  <button type="button" data-start-ask-append="" onClick={() => put(asking.id, asking.append, asking.replace)} className="h-11 rounded-lg border border-[#e5e7eb] bg-white px-3 text-[12.5px] font-semibold text-[#1a1a2e] outline-none pointer-fine:hover:bg-[#f3f4f6] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 sm:h-8">
                    {tt("Add to mine")}
                  </button>
                  <button type="button" data-start-ask-keep="" onClick={() => setAsking(null)} className="h-11 rounded-lg px-2 text-[12.5px] font-medium text-[#6b7280] outline-none pointer-fine:hover:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 sm:h-8">
                    {tt("Keep mine")}
                  </button>
                </span>
              </div>
            )}
            <GenerationChoice value={startGeneration(generation, agent)} agent={agent} disabled={full || starting === "ai"} onChange={setGeneration} />
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
          <button
            type="button"
            data-start-door="themes"
            aria-describedby={full ? "start-full-note" : undefined}
            aria-haspopup="dialog"
            onClick={(e) => (full ? onFull() : onBrowse(e.currentTarget))}
            className={cn(DOOR, full && "opacity-60")}
          >
            <DoorBody icon={<LayoutGrid className="h-4 w-4" strokeWidth={1.9} />} title={tt("Browse themes")} line={tt("Start from a ready-made design")} />
          </button>
          {fullNote && <div id="start-full-note">{fullNote}</div>}
        </div>
      </div>
    </section>
  )
}
