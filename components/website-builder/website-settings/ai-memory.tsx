"use client"

/**
 * ===========================================================================
 *  AI MEMORY, FOR THIS WEBSITE
 * ===========================================================================
 * What Storelib AI and connected agents read before every change here: this
 * website's notes and the creator's notes for every website, newest first,
 * each with who kept it and when (lib/ai-memory/store.ts). A note can be
 * corrected or deleted where it is read; a new one is added for this website.
 * Notes for every website are also in Settings, AI Memory.
 *
 * Until SQL part 106 has run, it says memory is not set up and offers
 * nothing that would fail.
 */

import { useCallback, useEffect, useState } from "react"
import { Pencil, Trash2 } from "lucide-react"
import { relativeTime } from "@/lib/website-builder/relative-time"
import { buttonClass, iconButtonClass, primaryButtonClass, textAreaClass } from "./parts"
import { tt } from "@/lib/i18n/text"

const MAX = 500

export interface MemoryNote {
  id: string
  content: string
  installId: string | null
  source: "creator" | "assistant" | "agent"
  sourceName?: string | null
  createdAt: string
}

type Load = { state: "loading" } | { state: "error" } | { state: "ready"; notes: MemoryNote[]; setUp: boolean }

/** Who kept it, in the words the list shows. */
export function keptBy(note: Pick<MemoryNote, "source" | "sourceName">): string {
  if (note.source === "assistant") return tt("Storelib AI")
  if (note.source === "agent") return note.sourceName || tt("Connected agent")
  return tt("You")
}

async function call<T>(url: string, init?: { method: string; body?: unknown }): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, {
      method: init?.method ?? "GET",
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
      body: init?.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    })
    const data = (await res.json().catch(() => ({}))) as T & { error?: string }
    return res.ok ? { ok: true, data } : { ok: false, error: data.error || tt("That did not go through. Try again.") }
  } catch {
    return { ok: false, error: tt("That did not go through. Try again.") }
  }
}

export function AiMemorySettings({ installId }: { installId: string }) {
  const [load, setLoad] = useState<Load>({ state: "loading" })
  const [draft, setDraft] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null)

  const read = useCallback(async () => {
    const [site, everywhere] = await Promise.all([
      call<{ memories: MemoryNote[]; ready: boolean }>(`/api/ai-memory?installId=${encodeURIComponent(installId)}`),
      call<{ memories: MemoryNote[]; ready: boolean }>("/api/ai-memory"),
    ])
    if (site.ok === false || everywhere.ok === false) {
      setLoad((l) => (l.state === "ready" ? l : { state: "error" }))
      return
    }
    const notes = [...site.data.memories, ...everywhere.data.memories].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    setLoad({ state: "ready", notes, setUp: site.data.ready && everywhere.data.ready })
  }, [installId])
  useEffect(() => {
    void read()
  }, [read])

  const add = async () => {
    const content = draft.replace(/\s+/g, " ").trim()
    if (!content || busy) return
    setBusy(true)
    setError(null)
    const r = await call<{ memory?: MemoryNote; duplicate?: boolean }>("/api/ai-memory", { method: "POST", body: { content, installId } })
    setBusy(false)
    if (r.ok === false || !r.data.memory) {
      setError(r.ok === false ? r.error : tt("That could not be kept. Try again."))
      return
    }
    const kept = r.data.memory
    setLoad((l) => (l.state === "ready" && !r.data.duplicate ? { ...l, notes: [kept, ...l.notes] } : l))
    setDraft("")
  }

  const remove = async (note: MemoryNote) => {
    setError(null)
    const scope = note.installId ? `?installId=${encodeURIComponent(installId)}` : ""
    const r = await call(`/api/ai-memory/${encodeURIComponent(note.id)}${scope}`, { method: "DELETE" })
    if (r.ok === false) {
      setError(r.error)
      return
    }
    setLoad((l) => (l.state === "ready" ? { ...l, notes: l.notes.filter((n) => n.id !== note.id) } : l))
  }

  const save = async (note: MemoryNote) => {
    if (!editing) return
    const content = editing.text.replace(/\s+/g, " ").trim()
    if (!content) return
    setBusy(true)
    setError(null)
    const r = await call<{ memory?: MemoryNote }>(`/api/ai-memory/${encodeURIComponent(note.id)}`, { method: "PATCH", body: { content, installId: note.installId ? installId : undefined } })
    setBusy(false)
    if (r.ok === false || !r.data.memory) {
      setError(r.ok === false ? r.error : tt("That could not be kept. Try again."))
      return
    }
    const kept = r.data.memory
    setLoad((l) => (l.state === "ready" ? { ...l, notes: [kept, ...l.notes.filter((n) => n.id !== note.id && n.id !== kept.id)] } : l))
    setEditing(null)
  }

  return (
    <section aria-labelledby="wb-ai-memory" data-wb-ai-memory="" className="mt-8 md:mt-9">
      <h2 id="wb-ai-memory" className="text-[15px] font-semibold text-white md:text-[14.5px]">
        {tt("AI Memory")}
      </h2>
      <p className="mt-1 max-w-[560px] text-[14px] leading-relaxed text-white/55 md:text-[13.5px]">
        {tt("Storelib AI and your connected agents read these before every change. Say “remember this” in the chat, or add one here.")}
      </p>

      {load.state === "error" ? (
        <p className="mt-3 text-[13.5px] text-white/55">
          {tt("AI Memory did not load.")}{" "}
          <button type="button" onClick={() => void read()} className="text-white/80 underline underline-offset-2">
            {tt("Try again")}
          </button>
        </p>
      ) : load.state === "ready" && !load.setUp ? (
        <p data-wb-ai-memory-not-set-up="" className="mt-3 text-[13.5px] text-white/55">
          {tt("AI Memory is not set up on this Storelib yet.")}
        </p>
      ) : (
        <div className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
          <form
            className="flex flex-col gap-2 border-b border-white/[0.07] p-3 md:flex-row md:items-start md:p-4"
            onSubmit={(e) => {
              e.preventDefault()
              void add()
            }}
          >
            <label htmlFor="wb-ai-memory-new" className="sr-only">
              {tt("Something to remember for this website")}
            </label>
            <textarea
              id="wb-ai-memory-new"
              data-wb-ai-memory-input=""
              rows={1}
              maxLength={MAX}
              value={draft}
              disabled={load.state !== "ready" || busy}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  void add()
                }
              }}
              placeholder={tt("We write in a warm, plain voice. Never use gradients.")}
              className={`${textAreaClass} min-h-11 md:min-h-9 md:py-2`}
            />
            <button type="submit" disabled={!draft.trim() || busy || load.state !== "ready"} className={primaryButtonClass}>
              {tt("Remember")}
            </button>
          </form>
          {error && (
            <p role="alert" className="border-b border-white/[0.07] px-4 py-2.5 text-[13.5px] text-red-300">
              {error}
            </p>
          )}
          <ul className="divide-y divide-white/[0.07]" aria-busy={load.state === "loading" || undefined} data-wb-ai-memory-list="">
            {load.state === "loading" ? (
              <li className="px-4 py-3.5">
                <span aria-hidden className="block h-4 w-2/3 rounded bg-white/[0.06]" />
              </li>
            ) : load.notes.length === 0 ? (
              <li className="px-4 py-3.5 text-[13.5px] text-white/45">{tt("Nothing yet.")}</li>
            ) : (
              load.notes.map((note) =>
                editing?.id === note.id ? (
                  <li key={note.id} className="px-3 py-3 md:px-4">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault()
                        void save(note)
                      }}
                    >
                      <textarea
                        autoFocus
                        rows={2}
                        maxLength={MAX}
                        aria-label={tt("Correct this note")}
                        value={editing.text}
                        onChange={(e) => setEditing({ id: note.id, text: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") setEditing(null)
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault()
                            void save(note)
                          }
                        }}
                        className={textAreaClass}
                      />
                      <div className="mt-2 flex gap-2">
                        <button type="submit" disabled={busy || !editing.text.trim()} className={primaryButtonClass}>
                          {tt("Save")}
                        </button>
                        <button type="button" onClick={() => setEditing(null)} className={buttonClass}>
                          {tt("Cancel")}
                        </button>
                      </div>
                    </form>
                  </li>
                ) : (
                  <li key={note.id} data-wb-ai-memory-note={note.id} className="flex items-start gap-2 py-2.5 pl-4 pr-2">
                    <div className="min-w-0 flex-1 py-0.5">
                      <p className="break-words text-[14.5px] leading-snug text-white md:text-[14px]">{note.content}</p>
                      <p className="mt-0.5 text-[12.5px] text-white/40">
                        {note.installId ? tt("This website") : tt("Every website")} · {keptBy(note)} · {relativeTime(note.createdAt) || new Date(note.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <button type="button" onClick={() => setEditing({ id: note.id, text: note.content })} aria-label={tt("Edit: {note}", { note: note.content })} className={iconButtonClass}>
                      <Pencil className="h-4 w-4" aria-hidden />
                    </button>
                    <button type="button" onClick={() => void remove(note)} aria-label={tt("Delete: {note}", { note: note.content })} className={`${iconButtonClass} hover:text-red-300`}>
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </li>
                ),
              )
            )}
          </ul>
        </div>
      )}
    </section>
  )
}
