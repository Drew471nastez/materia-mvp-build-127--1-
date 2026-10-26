"use client"

/**
 * ===========================================================================
 *  AI MEMORY, ONE TAP FROM THE CHAT
 * ===========================================================================
 * What Storelib AI remembers for this website (and for the whole account),
 * kept in Website settings › Connections, is also reachable from the chat's
 * own header: a small mark that opens a short list. Add a line, or take one
 * away, without leaving the conversation. The full page stays where it is
 * for anyone who wants it.
 *
 * Same endpoints as the settings page (app/api/ai-memory), so the two always
 * agree.
 */
import * as React from "react"
import { Brain, Loader2, X } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import type { MemoryNote } from "@/components/website-builder/website-settings/ai-memory"

type Load = { state: "idle" | "loading" | "error" } | { state: "ready"; notes: MemoryNote[] }

/** A read slower than this says "Loading"; a quicker one opens already filled, with nothing swapped in. */
export const LOADING_DELAY_MS = 300

async function call<T>(url: string, init?: { method: string; body?: unknown }): Promise<T | null> {
  try {
    const res = await fetch(url, {
      method: init?.method ?? "GET",
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
      body: init?.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    })
    if (!res.ok) return null
    return (await res.json().catch(() => null)) as T | null
  } catch {
    return null
  }
}

/*
  KEPT OUT OF THE CHAT'S RENDERS. It was drawn again on every key typed in
  the chat, and each time its popover's anchor told the popover where it was
  again: a state update in an effect, one per key, until a phone typing fast
  hit React's limit on updates in a row ("Maximum update depth exceeded",
  measured by scripts/check-ask-sheet-r18.mjs) and the chat stuttered. Its
  props are two strings, so nothing typed reaches it now.
*/
export const AskMemoryButton = React.memo(function AskMemoryButton({ installId, className }: { installId: string; className?: string }) {
  const [open, setOpen] = React.useState(false)
  const [load, setLoad] = React.useState<Load>({ state: "idle" })
  const [draft, setDraft] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const added = React.useRef(new Set<string>())

  /* One read at a time: the warm read on the way in and the read on open are the same request. */
  const inflight = React.useRef<Promise<void> | null>(null)
  const read = React.useCallback((): Promise<void> => {
    if (inflight.current) return inflight.current
    setLoad((l) => (l.state === "ready" ? l : { state: "loading" }))
    const run = (async () => {
      const [site, everywhere] = await Promise.all([
        call<{ memories: MemoryNote[] }>(`/api/ai-memory?installId=${encodeURIComponent(installId)}`),
        call<{ memories: MemoryNote[] }>("/api/ai-memory"),
      ])
      if (!site || !everywhere) {
        setLoad((l) => (l.state === "ready" ? l : { state: "error" }))
        return
      }
      const notes = [...site.memories, ...everywhere.memories].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      setLoad({ state: "ready", notes })
    })()
    inflight.current = run.finally(() => {
      inflight.current = null
    })
    return inflight.current
  }, [installId])

  /* Read each time it opens, so what the AI kept a moment ago is there. */
  React.useEffect(() => {
    if (open) void read()
  }, [open, read])

  /*
    READ BEFORE IT OPENS (round Z3). The first open used to draw "Loading",
    then swap it for the list a moment later, so the box opened at one height
    and jumped to another. A pointer coming over the mark, or focus reaching
    it, starts the read, which is almost always done by the time the press
    ends; the list then opens already filled. A slow read shows "Loading" only
    after LOADING_DELAY_MS, in a list that already has its height.
  */
  const warmed = React.useRef(false)
  const warm = React.useCallback(() => {
    if (warmed.current) return
    warmed.current = true
    void read()
  }, [read])
  const [slow, setSlow] = React.useState(false)
  React.useEffect(() => {
    if (!open || load.state !== "loading") {
      setSlow(false)
      return
    }
    const t = window.setTimeout(() => setSlow(true), LOADING_DELAY_MS)
    return () => window.clearTimeout(t)
  }, [open, load.state])
  const contentRef = React.useRef<HTMLDivElement>(null)

  const add = async () => {
    const content = draft.replace(/\s+/g, " ").trim()
    if (!content || busy) return
    setBusy(true)
    const r = await call<{ memory?: MemoryNote; duplicate?: boolean }>("/api/ai-memory", { method: "POST", body: { content, installId } })
    setBusy(false)
    if (!r?.memory) return
    const kept = r.memory
    /* A note added here rises into the list; the ones that were there are simply there. */
    added.current.add(kept.id)
    setLoad((l) => (l.state === "ready" && !r.duplicate ? { state: "ready", notes: [kept, ...l.notes] } : l))
    setDraft("")
  }

  const remove = async (note: MemoryNote) => {
    setLoad((l) => (l.state === "ready" ? { state: "ready", notes: l.notes.filter((n) => n.id !== note.id) } : l))
    const scope = note.installId ? `?installId=${encodeURIComponent(installId)}` : ""
    const ok = await call(`/api/ai-memory/${encodeURIComponent(note.id)}${scope}`, { method: "DELETE" })
    if (!ok) void read()
  }

  const notes = load.state === "ready" ? load.notes : []
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" data-ask-memory="" aria-label={tt("AI memory")} title={tt("AI memory")} className={className} onPointerEnter={warm} onFocus={warm} onPointerDown={warm}>
          <Brain className="h-[17px] w-[17px]" strokeWidth={1.8} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        ref={contentRef}
        align="end"
        sideOffset={6}
        /*
          Focus goes to the box itself, not to its first button (a Forget that
          is invisible until hovered), and back to the mark when it closes,
          which Radix does. Tab then moves through the notes and the field.
        */
        tabIndex={-1}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          contentRef.current?.focus({ preventScroll: true })
        }}
        data-ask-memory-panel=""
        className="ask-memory-pop w-[300px] max-w-[calc(100vw-16px)] rounded-[14px] border border-[#eceef1] bg-white p-0 text-[#1a1a2e] shadow-[0_16px_40px_-12px_rgba(16,24,40,0.22),0_2px_6px_rgba(16,24,40,0.06)] outline-none"
      >
        <div className="px-3.5 pb-2 pt-3">
          <p className="text-[13px] font-semibold">{tt("AI memory")}</p>
          <p className="mt-0.5 text-[12px] leading-[16px] text-[#6b7280]">{tt("What Storelib AI keeps in mind for this website.")}</p>
        </div>
        <div className="max-h-[240px] min-h-[44px] overflow-y-auto px-1.5 [scrollbar-color:#d1d5db_transparent] [scrollbar-width:thin]" data-ask-memory-list="">
          {load.state === "loading" || load.state === "idle" ? (
            /* Held at a line's height while the read finishes; words only once it is slow. */
            <p className={cn("flex h-[44px] items-center gap-2 px-2 text-[12.5px] text-[#6b7280] transition-opacity duration-200", slow ? "opacity-100" : "opacity-0")} aria-live="polite">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {tt("Loading")}
            </p>
          ) : load.state === "error" ? (
            <p className="px-2 py-3 text-[12.5px] text-[#6b7280]">{tt("Could not load. Try again in a moment.")}</p>
          ) : notes.length === 0 ? (
            <p className="ask-fade px-2 py-3 text-[12.5px] text-[#6b7280]">{tt("Nothing yet. Add something below, or the AI keeps notes as you work.")}</p>
          ) : (
            notes.map((n) => (
              <div key={n.id} className={cn("group/note flex items-start gap-1.5 rounded-lg px-2 py-1.5 hover:bg-[#f6f7f8]", added.current.has(n.id) && "ask-in")} data-ask-memory-note={n.id}>
                <span className="min-w-0 flex-1 text-[12.5px] leading-[17px] text-[#374151]">{n.content}</span>
                <button
                  type="button"
                  onClick={() => void remove(n)}
                  aria-label={tt("Forget this")}
                  title={tt("Forget this")}
                  className="-mr-0.5 mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[#9ca3af] opacity-0 transition-opacity hover:bg-black/[0.06] hover:text-[#1a1a2e] group-hover/note:opacity-100 focus-visible:opacity-100 max-sm:opacity-100"
                >
                  <X className="h-3 w-3" strokeWidth={2.2} />
                </button>
              </div>
            ))
          )}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void add()
          }}
          className="flex items-center gap-1.5 border-t border-[#f0f1f3] p-2"
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, 500))}
            placeholder={tt("Add something to remember")}
            aria-label={tt("Add something to remember")}
            className="h-8 min-w-0 flex-1 rounded-lg bg-[#f3f4f6] px-2.5 text-[16px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] focus:bg-[#eef0f2] sm:text-[12.5px]"
          />
          <button
            type="submit"
            disabled={!draft.trim() || busy}
            className={cn("h-8 shrink-0 rounded-lg bg-[#1a1a2e] px-2.5 text-[12.5px] font-medium text-white transition-opacity disabled:opacity-40")}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : tt("Add")}
          </button>
        </form>
      </PopoverContent>
    </Popover>
  )
})
