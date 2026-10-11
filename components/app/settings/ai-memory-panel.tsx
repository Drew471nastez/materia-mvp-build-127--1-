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
import { Pencil, Trash2 } from "lucide-react"
import { primaryDepth, secondaryDepth } from "@/components/ui/depth-button"
import { cn } from "@/lib/utils"
import { api, peekGet } from "@/components/physical/ui"

const CARD = "bg-white rounded-2xl app-card-x py-4 sm:py-6 shadow-sm border border-[#e5e7eb]"
const MAX = 500

interface Memory {
  id: string
  content: string
  source: "creator" | "assistant"
  createdAt: string
}

type Load = { state: "loading" } | { state: "error" } | { state: "ready"; memories: Memory[]; setUp: boolean }

/*
  DRAWN AT ONCE FROM WHAT SETTINGS FETCHED AHEAD (components/physical/ui
  peekGet, TAB_DATA in components/app/settings-form-new.tsx), and read again
  behind it. It used to open on two grey rows every time, then the list.
*/
const PATH = "/api/ai-memory"
type Answer = { memories: Memory[]; ready: boolean }
const fromAnswer = (a: Answer | null): Load => (a ? { state: "ready", memories: a.memories, setUp: a.ready } : { state: "loading" })

export function AiMemoryPanel() {
  const [load, setLoad] = useState<Load>(() => fromAnswer(peekGet<Answer>(PATH)))
  const [draft, setDraft] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  /* The memory being corrected, and its words while they are typed. */
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const read = useCallback(async () => {
    setLoad((l) => (l.state === "ready" ? l : { state: "loading" }))
    const r = await api<Answer>(PATH)
    if (r.ok) setLoad(fromAnswer(r.data))
    else setLoad((l) => (l.state === "ready" ? l : { state: "error" }))
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
      /* Through api(), so the list Settings keeps is read again after it (refreshAfterWrite). */
      const r = await api<{ memory?: Memory; duplicate?: boolean }>(PATH, { method: "POST", body: { content } })
      const data = r.ok ? r.data : null
      if (!r.ok || !data?.memory) {
        setError((!r.ok && r.error) || "That could not be kept. Try again.")
        return
      }
      const kept = data.memory
      setLoad((l) => (l.state === "ready" ? { ...l, memories: data.duplicate ? l.memories : [kept, ...l.memories] } : l))
      setDraft("")
      const box = document.getElementById("ai-memory-new")
      if (box) box.style.height = ""
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
      const r = await api(`${PATH}/${encodeURIComponent(id)}`, { method: "DELETE" })
      if (!r.ok) throw new Error(r.error)
      setLoad((l) => (l.state === "ready" ? { ...l, memories: l.memories.filter((m) => m.id !== id) } : l))
    } catch {
      setError("That could not be deleted. Try again.")
    } finally {
      setRemoving(null)
    }
  }

  const save = async () => {
    if (!editing || saving) return
    const content = editing.text.replace(/\s+/g, " ").trim()
    if (!content) return
    setSaving(true)
    setError(null)
    try {
      const r = await api<{ memory?: Memory }>(`${PATH}/${encodeURIComponent(editing.id)}`, { method: "PATCH", body: { content } })
      const data = r.ok ? r.data : null
      if (!r.ok || !data?.memory) {
        setError((!r.ok && r.error) || "That could not be kept. Try again.")
        return
      }
      const kept = data.memory
      const old = editing.id
      setLoad((l) =>
        l.state === "ready"
          ? { ...l, memories: l.memories.some((m) => m.id === kept.id && m.id !== old) ? l.memories.filter((m) => m.id !== old) : l.memories.map((m) => (m.id === old ? kept : m)) }
          : l,
      )
      setEditing(null)
    } catch {
      setError("That could not be kept. Try again.")
    } finally {
      setSaving(false)
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
          {/*
            THE WHOLE WIDTH OF THE CARD, AND A FEW LINES TALL. It was a single
            40px line beside its button, narrow for a sentence and narrower on
            a phone. Now a box that grows with what is typed (up to six lines),
            16px on a phone so iOS does not zoom into it, with how much room
            is left and Remember under it. Enter keeps it, Shift and Enter
            starts a new line.

            Remember used to close Settings: this form sat inside the one form
            Settings drew around every section, and its submit reached that
            form too, which saved the profile and refreshed the route.
            Settings has no form around its sections now
            (components/app/settings-form-new.tsx), and this submit stops here.
          */}
          <form
            className="mt-4 rounded-xl border border-[#e5e7eb] bg-white transition-[border-color,box-shadow] focus-within:border-[#1a1a2e]/40 focus-within:ring-2 focus-within:ring-[#1a1a2e]/10"
            data-ai-memory-form=""
            onSubmit={(e) => {
              e.preventDefault()
              e.stopPropagation()
              void add()
            }}
          >
            <label htmlFor="ai-memory-new" className="sr-only">
              Something to remember
            </label>
            <textarea
              id="ai-memory-new"
              value={draft}
              maxLength={MAX}
              rows={2}
              onChange={(e) => {
                setDraft(e.target.value)
                const t = e.currentTarget
                t.style.height = "auto"
                t.style.height = `${Math.min(t.scrollHeight, 6 * 22 + 20)}px`
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  void add()
                }
              }}
              placeholder="Prices in euros. No gradients. Keep product names short."
              className="block min-h-[64px] w-full resize-none rounded-t-xl bg-transparent px-3.5 pb-1 pt-3 text-[16px] leading-[22px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] sm:text-[14.5px]"
              disabled={load.state !== "ready" || busy}
              data-ai-memory-input=""
            />
            <div className="flex items-center justify-between gap-3 px-2 pb-2 pl-3.5">
              <span className="text-[12px] tabular-nums text-[#9ca3af]">{draft.length > MAX - 80 ? `${MAX - draft.length} left` : "Enter to keep it"}</span>
              <button type="submit" disabled={!draft.trim() || busy || load.state !== "ready"} className={cn(primaryDepth, "h-10 rounded-xl px-5 text-[14px] disabled:cursor-not-allowed disabled:opacity-60 sm:h-9")} data-ai-memory-remember="">
                {busy ? "Saving" : "Remember"}
              </button>
            </div>
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
                  {editing?.id === m.id ? (
                    <form
                      className="min-w-0 flex-1"
                      onSubmit={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        void save()
                      }}
                    >
                      <textarea
                        autoFocus
                        value={editing.text}
                        maxLength={MAX}
                        rows={2}
                        aria-label="Correct this memory"
                        onChange={(e) => setEditing({ id: m.id, text: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") setEditing(null)
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault()
                            void save()
                          }
                        }}
                        className="w-full resize-none rounded-xl border border-[#e5e7eb] bg-white px-3 py-2 text-[16px] leading-[1.45] text-[#1a1a2e] outline-none focus:border-[#1a1a2e] sm:text-[14px]"
                      />
                      <div className="mt-2 flex gap-2">
                        <button type="submit" disabled={saving || !editing.text.trim()} className={cn(primaryDepth, "h-9 rounded-xl px-4 text-[13px] disabled:opacity-60")}>
                          {saving ? "Saving" : "Save"}
                        </button>
                        <button type="button" onClick={() => setEditing(null)} className={cn(secondaryDepth, "h-9 rounded-xl px-4 text-[13px]")}>
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="min-w-0">
                        <p className="break-words text-[14px] leading-[1.45] text-[#1a1a2e]">{m.content}</p>
                        <p className="mt-0.5 text-[12px] text-[#9ca3af]">
                          {m.source === "assistant" ? "Kept by Storelib AI" : "Added by you"} · {new Date(m.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                        </p>
                      </div>
                      <div className="-mr-2 flex shrink-0">
                        <button
                          type="button"
                          onClick={() => setEditing({ id: m.id, text: m.content })}
                          aria-label={`Edit: ${m.content}`}
                          className="flex h-10 w-10 items-center justify-center rounded-full text-[#6b7280] transition-colors hover:bg-[#f6f7f9] hover:text-[#1a1a2e]"
                        >
                          <Pencil className="h-4 w-4" aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => void remove(m.id)}
                          disabled={removing === m.id}
                          aria-label={`Delete: ${m.content}`}
                          className="flex h-10 w-10 items-center justify-center rounded-full text-[#6b7280] transition-colors hover:bg-[#f6f7f9] hover:text-[#b42318] disabled:opacity-50"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))
            )}
          </ul>
        </>
      )}
    </section>
  )
}
