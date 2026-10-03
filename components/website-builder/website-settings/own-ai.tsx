"use client"

/**
 * ===========================================================================
 *  YOUR OWN AI, IN STORELIB AI
 * ===========================================================================
 * "Let people connect their own Claude or ChatGPT, easy setup, so they code
 * right in the Storelib AI chat and it does not use Storelib AI credits."
 *
 * One line, the same row as the tools under it:
 *
 *   OpenAI       a key from platform.openai.com, pasted once.
 *
 * Storelib AI runs on OpenAI only (lib/sites/agent/provider.ts), so the
 * Claude key line is hidden; a key kept from before is not deleted.
 *
 * A connected key answers the chat's models on the creator's account, and
 * those edits do not count against the plan's AI edits. A key is checked
 * with its provider before it is kept, is stored encrypted, and is never
 * shown again: only its last four characters.
 *
 * Signing in with a Claude.ai or ChatGPT subscription is not offered
 * because neither can be used from another website; this says so in one
 * line, so nobody goes looking for it.
 */

import { useState, type ReactNode } from "react"
import { Loader2 } from "lucide-react"
import { OpenAIMark } from "@/components/website-builder/connection-marks"
import { acceptOwnAi, useOwnAi, type OwnKey, type OwnSource } from "@/components/website-builder/use-own-ai"
import { relativeTime } from "@/lib/website-builder/relative-time"
import { ConnectionRow, RowNote, type ConnectionTone } from "./connection-row"
import { buttonClass, inputClass, primaryButtonClass, textLinkClass } from "./parts"

const SOURCES: {
  id: OwnSource
  name: string
  mark: ReactNode
  paste?: { placeholder: string; where: string; href: string }
}[] = [
  /*
    No Claude line while Storelib AI runs on OpenAI only (lib/sites/agent/provider.ts,
    OFFERED). A Claude key connected before is still stored, unused and unshown;
    the line comes back here, with ClaudeMark and console.anthropic.com, when
    Claude is offered again.
  */
  {
    id: "openai",
    name: "ChatGPT (OpenAI)",
    mark: <OpenAIMark className="h-5 w-5 text-white" />,
    paste: { placeholder: "sk-...", where: "platform.openai.com", href: "https://platform.openai.com/api-keys" },
  },
]

function statusOf(key: OwnKey | undefined): { tone: ConnectionTone; status: string; detail?: string; action: string } {
  if (!key) return { tone: "off", status: "Not connected", action: "Connect" }
  if (key.lastError) return { tone: "attention", status: "Refused last time", detail: `ends ${key.hint}`, action: "Manage" }
  const used = relativeTime(key.lastUsedAt)
  return { tone: "on", status: "Connected", detail: used ? `ends ${key.hint} · used ${used}` : `ends ${key.hint}`, action: "Manage" }
}

export function OwnAiSettings() {
  const own = useOwnAi()
  const [open, setOpen] = useState<OwnSource | null>(null)

  const byId = (id: OwnSource) => own.keys.find((k) => k.source === id)
  const connected = SOURCES.filter((s) => byId(s.id))

  return (
    <section aria-label="Your own AI" data-own-ai="" className="mt-6 md:mt-7">
      <h2 className="text-[15px] font-semibold text-white md:text-[14.5px]">Use your own AI</h2>
      <p className="mt-1 max-w-[560px] text-[14px] leading-relaxed text-white/55 md:text-[13.5px]">
        Storelib AI is already included in your plan. If you would rather it ran on your own OpenAI key, connect it here and those edits stop counting against your plan&apos;s AI edits.
      </p>
      {!own.setUp && <RowNote tone="bad">This is not switched on for your store yet.</RowNote>}

      {own.setUp && (
        <div className="mt-3 divide-y divide-white/[0.07] overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
          {SOURCES.map((s) => {
            const key = byId(s.id)
            const st = statusOf(key)
            return (
              <ConnectionRow
                key={s.id}
                id={`own-${s.id}`}
                mark={s.mark}
                name={s.name}
                status={st.status}
                detail={st.detail}
                tone={st.tone}
                loading={!own.loaded}
                action={st.action}
                open={open === s.id}
                onToggle={() => setOpen(open === s.id ? null : s.id)}
              >
                {() => <SourceBody source={s} current={key} onDone={() => setOpen(null)} />}
              </ConnectionRow>
            )
          })}
        </div>
      )}

      {own.setUp && connected.length > 0 && (
        <p className="mt-3 text-[13.5px] leading-relaxed text-white/45 md:text-[13px]">
          Storelib AI now answers on your account. Your key is used for your chats only, kept encrypted, and never shown again.
        </p>
      )}
    </section>
  )
}

function SourceBody({
  source,
  current,
  onDone,
}: {
  source: (typeof SOURCES)[number]
  current: OwnKey | undefined
  onDone: () => void
}) {
  const [value, setValue] = useState("")
  const [busy, setBusy] = useState<"save" | "remove" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  const save = async () => {
    if (!value.trim() || busy) return
    setBusy("save")
    setError(null)
    setSaved(null)
    try {
      const res = await fetch("/api/ai-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source: source.id, key: value.trim() }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof body.error === "string" ? body.error : "Could not save your key. Try again.")
        return
      }
      acceptOwnAi(body)
      setValue("")
      setSaved(
        body.unchecked
          ? "Saved. We could not reach the provider to check it just now; your next message will."
          : "Connected. Storelib AI now answers on your OpenAI key.",
      )
    } catch {
      setError("Could not reach Storelib. Check your connection and try again.")
    } finally {
      setBusy(null)
    }
  }

  const remove = async () => {
    if (busy) return
    setBusy("remove")
    setError(null)
    try {
      const res = await fetch(`/api/ai-keys?source=${source.id}`, { method: "DELETE" })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof body.error === "string" ? body.error : "Could not remove it. Try again.")
        return
      }
      acceptOwnAi(body)
      onDone()
    } catch {
      setError("Could not reach Storelib. Check your connection and try again.")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div data-own-ai-body={source.id}>
      {current?.lastError && <RowNote tone="bad">{current.lastError}</RowNote>}
      <RowNote>
        {current ? "Replace it with a new key, or remove it to go back to Storelib AI." : "Create a key at "}
        {!current && source.paste && (
          <>
            <a href={source.paste.href} target="_blank" rel="noreferrer" className={textLinkClass}>
              {source.paste.where}
            </a>
            , then paste it here. It is checked before it is kept.
          </>
        )}
      </RowNote>
      <form
        className="mt-4 flex flex-col gap-2.5 md:flex-row md:items-center"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          aria-label={`${source.name} API key`}
          placeholder={source.paste?.placeholder}
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setError(null)
          }}
          className={inputClass}
          data-own-ai-input={source.id}
        />
        <div className="flex items-center gap-2.5">
          <button type="submit" disabled={!value.trim() || !!busy} className={primaryButtonClass}>
            {busy === "save" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {current ? "Replace" : "Connect"}
          </button>
          {current && (
            <button type="button" onClick={remove} disabled={!!busy} className={buttonClass}>
              {busy === "remove" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Remove
            </button>
          )}
        </div>
      </form>
      {error && <RowNote tone="bad">{error}</RowNote>}
      {saved && <RowNote tone="good">{saved}</RowNote>}
    </div>
  )
}
