"use client"

/**
 * ===========================================================================
 *  AI MEMORY: WHAT STORELIB AI KEEPS FOR YOU ON EVERY WEBSITE
 * ===========================================================================
 * Settings › Store › AI Memory (/app/settings?tab=ai_memory). The list is
 * the creator's own rows of `ai_memories` (lib/ai-memory/store.ts): the ones
 * they wrote here and the ones the assistant kept when they said "remember
 * this". Each can be deleted; none can be changed in place, so what the
 * assistant was told is always something they can see.
 *
 * A website's own notes stay with that website (its brief, kept on the
 * theme), so they are not listed here.
 *
 * Until SQL part 106 has run, the card says memory is not set up and offers
 * nothing that would fail.
 */

import { useCallback, useEffect, useState } from "react"
import { Trash2 } from "lucide-react"
import { primaryDepth, secondaryDepth } from "@/components/ui/depth-button"
import { cn } from "@/lib/utils"

const CARD = "bg-white rounded-2xl app-card-x py-4 sm:py-6 shadow-sm border border-[#e5e7eb]"
const MAX = 500

interface Memory {
  id: string
  content: string
  source: "creator" | "assistant"
  createdAt: string
}

type Load = { state: "loading" } | { state: "error" } | { state: "ready"; memories: Memory[]; setUp: boolean }

export function AiMemoryPanel() {
  const [load, setLoad] = useState<Load>({ state: "loading" })
  const [draft, setDraft] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)

  const read = useCallback(async () => {
    setLoad({ state: "loading" })
    try {
      const res = await fetch("/api/ai-memory", { cache: "no-store" })
      if (!res.ok) throw new Error(String(res.status))
      const data = (await res.json()) as { memories: Memory[]; ready: boolean }
      setLoad({ state: "ready", memories: data.memories, setUp: data.ready })
    } catch {
      setLoad({ state: "error" })
    }
  }, [])
  useEffect(() => {
    void read()
  }, [read])

  const add = async () => {
    const content = draft.replace(/\s+/g, " ").trim()
    if (!content || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/ai-memory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content }) })
      const data = (await res.json().catch(() => null)) as { memory?: Memory; duplicate?: boolean; error?: string } | null
      if (!res.ok || !data?.memory) {
        setError(data?.error ?? "That could not be kept. Try again.")
        return
      }
      const kept = data.memory
      setLoad((l) => (l.state === "ready" ? { ...l, memories: data.duplicate ? l.memories : [kept, ...l.memories] } : l))
      setDraft("")
    } catch {
      setError("That could not be kept. Try again.")
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: string) => {
    setRemoving(id)
    setError(null)
    try {
      const res = await fetch(`/api/ai-memory/${encodeURIComponent(id)}`, { method: "DELETE" })
      if (!res.ok) throw new Error(String(res.status))
      setLoad((l) => (l.state === "ready" ? { ...l, memories: l.memories.filter((m) => m.id !== id) } : l))
    } catch {
      setError("That could not be deleted. Try again.")
    } finally {
      setRemoving(null)
    }
  }

  return (
    <section className={CARD} aria-labelledby="ai-memory-heading" data-account-panel="ai-memory">
      <h3 id="ai-memory-heading" className="text-[15px] font-semibold text-[#1a1a2e]">
        AI Memory
      </h3>
      <p className="mt-0.5 text-[13px] leading-[1.45] text-[#6b7280]">
        Storelib AI reads these before every change on every one of your websites. Tell it &ldquo;remember this&rdquo; in the builder, or add one here.
      </p>

      {load.state === "error" ? (
        <div className="mt-4 flex flex-col items-start gap-3" data-ai-memory-error="">
          <p className="text-[13px] text-[#6b7280]">Your AI Memory did not load.</p>
          <button type="button" onClick={() => void read()} className={cn(secondaryDepth, "h-10 rounded-xl px-4 text-[13px]")}>
            Try again
          </button>
        </div>
      ) : load.state === "ready" && !load.setUp ? (
        <p className="mt-4 rounded-xl bg-[#f6f7f9] px-3.5 py-3 text-[13px] leading-[1.45] text-[#4b5563]" data-ai-memory-not-set-up="">
          AI Memory is not set up on this Storelib yet. Storelib AI still keeps notes for each website on its own.
        </p>
      ) : (
        <>
          <form
            className="mt-4 flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault()
              void add()
            }}
          >
            <label htmlFor="ai-memory-new" className="sr-only">
              Something to remember
            </label>
            <input
              id="ai-memory-new"
              value={draft}
              maxLength={MAX}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Prices in euros. No gradients."
              className="h-11 min-w-0 flex-1 rounded-xl border border-[#e5e7eb] bg-white px-3.5 text-[14px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] focus:border-[#1a1a2e]/40 focus:ring-2 focus:ring-[#1a1a2e]/10 sm:h-10"
              disabled={load.state !== "ready" || busy}
            />
            <button type="submit" disabled={!draft.trim() || busy || load.state !== "ready"} className={cn(primaryDepth, "h-11 rounded-xl px-5 text-[14px] disabled:cursor-not-allowed disabled:opacity-60 sm:h-10")}>
              {busy ? "Saving" : "Remember"}
            </button>
          </form>
          {error ? (
            <p role="alert" className="mt-2 text-[13px] text-[#b42318]">
              {error}
            </p>
          ) : null}

          <ul className="mt-4 divide-y divide-[#f0f1f3] border-t border-[#f0f1f3]" aria-busy={load.state === "loading" || undefined} data-ai-memory-list="">
            {load.state === "loading" ? (
              [0, 1].map((i) => (
                <li key={i} className="flex min-h-12 items-center py-3">
                  <span aria-hidden className="h-4 w-2/3 rounded bg-[#f1f2f4]" />
                </li>
              ))
            ) : load.memories.length === 0 ? (
              <li className="py-4 text-[13px] text-[#6b7280]">Nothing yet.</li>
            ) : (
              load.memories.map((m) => (
                <li key={m.id} className="flex min-h-12 items-start justify-between gap-3 py-3" data-ai-memory={m.id}>
                  <div className="min-w-0">
                    <p className="break-words text-[14px] leading-[1.45] text-[#1a1a2e]">{m.content}</p>
                    <p className="mt-0.5 text-[12px] text-[#9ca3af]">
                      {m.source === "assistant" ? "Kept by Storelib AI" : "Added by you"} · {new Date(m.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void remove(m.id)}
                    disabled={removing === m.id}
                    aria-label={`Delete: ${m.content}`}
                    className="-mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#6b7280] transition-colors hover:bg-[#f6f7f9] hover:text-[#b42318] disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </li>
              ))
            )}
          </ul>
        </>
      )}
    </section>
  )
}
