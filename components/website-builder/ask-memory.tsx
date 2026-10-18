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

export function AskMemoryButton({ installId, className }: { installId: string; className?: string }) {
  const [open, setOpen] = React.useState(false)
  const [load, setLoad] = React.useState<Load>({ state: "idle" })
  const [draft, setDraft] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  const read = React.useCallback(async () => {
    setLoad((l) => (l.state === "ready" ? l : { state: "loading" }))
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
  }, [installId])

  /* Read each time it opens, so what the AI kept a moment ago is there. */
  React.useEffect(() => {
    if (open) void read()
  }, [open, read])

  const add = async () => {
    const content = draft.replace(/\s+/g, " ").trim()
    if (!content || busy) return
    setBusy(true)
    const r = await call<{ memory?: MemoryNote; duplicate?: boolean }>("/api/ai-memory", { method: "POST", body: { content, installId } })
    setBusy(false)
    if (!r?.memory) return
    const kept = r.memory
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
        <button type="button" data-ask-memory="" aria-label={tt("AI memory")} title={tt("AI memory")} className={className}>
          <Brain className="h-[17px] w-[17px]" strokeWidth={1.8} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-[300px] max-w-[calc(100vw-16px)] rounded-[14px] border border-[#eceef1] bg-white p-0 text-[#1a1a2e] shadow-[0_16px_40px_-12px_rgba(16,24,40,0.22),0_2px_6px_rgba(16,24,40,0.06)]"
      >
        <div className="px-3.5 pb-2 pt-3">
          <p className="text-[13px] font-semibold">{tt("AI memory")}</p>
          <p className="mt-0.5 text-[12px] leading-[16px] text-[#6b7280]">{tt("What Storelib AI keeps in mind for this website.")}</p>
        </div>
        <div className="max-h-[240px] overflow-y-auto px-1.5 [scrollbar-color:#d1d5db_transparent] [scrollbar-width:thin]" data-ask-memory-list="">
          {load.state === "loading" ? (
            <p className="flex items-center gap-2 px-2 py-3 text-[12.5px] text-[#6b7280]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {tt("Loading")}
            </p>
          ) : load.state === "error" ? (
            <p className="px-2 py-3 text-[12.5px] text-[#6b7280]">{tt("Could not load. Try again in a moment.")}</p>
          ) : notes.length === 0 ? (
            <p className="px-2 py-3 text-[12.5px] text-[#6b7280]">{tt("Nothing yet. Add something below, or the AI keeps notes as you work.")}</p>
          ) : (
            notes.map((n) => (
              <div key={n.id} className="group/note flex items-start gap-1.5 rounded-lg px-2 py-1.5 hover:bg-[#f6f7f8]" data-ask-memory-note={n.id}>
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
}
