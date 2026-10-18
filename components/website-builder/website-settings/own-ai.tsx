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
 * Claude and OpenAI keys answer the corresponding model choices in the chat.
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
import { ClaudeMark, OpenAIMark } from "@/components/website-builder/connection-marks"
import { acceptOwnAi, useOwnAi, type OwnKey, type OwnSource } from "@/components/website-builder/use-own-ai"
import { relativeTime } from "@/lib/website-builder/relative-time"
import { ConnectionRow, RowNote, type ConnectionTone } from "./connection-row"
import { buttonClass, inputClass, primaryButtonClass, textLinkClass } from "./parts"
import { tt } from "@/lib/i18n/text"

const SOURCES: {
  id: OwnSource
  name: string
  mark: ReactNode
  paste?: { placeholder: string; where: string; href: string }
}[] = [
  {
    id: "anthropic",
    name: "Claude (Anthropic)",
    mark: <ClaudeMark className="h-5 w-5 text-[#D97757]" />,
    paste: { placeholder: "sk-ant-...", where: "console.anthropic.com", href: "https://console.anthropic.com/settings/keys" },
  },
  {
    id: "openai",
    name: "ChatGPT (OpenAI)",
    mark: <OpenAIMark className="h-5 w-5 text-white" />,
    paste: { placeholder: "sk-...", where: "platform.openai.com", href: "https://platform.openai.com/api-keys" },
  },
]

function statusOf(key: OwnKey | undefined): { tone: ConnectionTone; status: string; detail?: string; action: string } {
  if (!key) return { tone: "off", status: "Not connected", action: tt("Connect") }
  if (key.lastError) return { tone: "attention", status: "Refused last time", detail: tt("ends {hint}", { hint: key.hint }), action: tt("Manage") }
  const used = relativeTime(key.lastUsedAt)
  return { tone: "on", status: "Connected", detail: used ? tt("ends {hint} · used {used}", { hint: key.hint, used }) : tt("ends {hint}", { hint: key.hint }), action: tt("Manage") }
}

/**
 * The Claude and OpenAI rows alone, for Connections' one list (after GitHub):
 * the same rows OwnAiSettings draws, without its heading and card.
 */
export function OwnAiRows({ open, onOpen }: { open: string | null; onOpen: (id: string | null) => void }) {
  const own = useOwnAi()
  const byId = (id: OwnSource) => own.keys.find((k) => k.source === id)
  if (!own.setUp) return null
  return (
    <>
      {SOURCES.map((s) => {
        const key = byId(s.id)
        const st = statusOf(key)
        const id = `own-${s.id}`
        return (
          <ConnectionRow
            key={s.id}
            id={id}
            mark={s.mark}
            name={s.name}
            status={st.status}
            detail={st.detail ?? (key ? undefined : tt("Your own API key"))}
            tone={st.tone}
            loading={!own.loaded}
            action={st.action}
            open={open === id}
            onToggle={() => onOpen(open === id ? null : id)}
          >
            {() => <SourceBody source={s} current={key} onDone={() => onOpen(null)} />}
          </ConnectionRow>
        )
      })}
    </>
  )
}

export function OwnAiSettings() {
  const own = useOwnAi()
  const [open, setOpen] = useState<OwnSource | null>(null)

  const byId = (id: OwnSource) => own.keys.find((k) => k.source === id)
  const connected = SOURCES.filter((s) => byId(s.id))

  return (
    <section aria-label={tt("Your own AI")} data-own-ai="" className="mt-6 md:mt-7">
      <h2 className="text-[15px] font-semibold text-white md:text-[14.5px]">{tt("Use your own AI")}</h2>
      <p className="mt-1 max-w-[560px] text-[14px] leading-relaxed text-white/55 md:text-[13.5px]">
        {tt("Storelib AI is already included in your plan. Connect your own Claude or OpenAI API key to use your account for that provider without counting those edits against your plan.")}
      </p>
      {!own.setUp && <RowNote tone="bad">{tt("This is not switched on for your store yet.")}</RowNote>}

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
          {tt("Storelib AI now answers on your account. Your key is used for your chats only, kept encrypted, and never shown again.")}
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
        setError(typeof body.error === "string" ? body.error : tt("Could not save your key. Try again."))
        return
      }
      acceptOwnAi(body)
      setValue("")
      setSaved(
        body.unchecked
          ? tt("Saved. We could not reach the provider to check it just now; your next message will.")
          : source.id === "anthropic" ? tt("Connected. Claude now answers on your API account.") : tt("Connected. Storelib AI now answers on your OpenAI key."),
      )
    } catch {
      setError(tt("Could not reach Storelib. Check your connection and try again."))
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
        setError(typeof body.error === "string" ? body.error : tt("Could not remove it. Try again."))
        return
      }
      acceptOwnAi(body)
      onDone()
    } catch {
      setError(tt("Could not reach Storelib. Check your connection and try again."))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div data-own-ai-body={source.id}>
      {current?.lastError && <RowNote tone="bad">{current.lastError}</RowNote>}
      <RowNote>
        {current ? tt("Replace it with a new key, or remove it to go back to Storelib AI.") : tt("Create a key at ")}
        {!current && source.paste && (
          <>
            <a href={source.paste.href} target="_blank" rel="noreferrer" className={textLinkClass}>
              {source.paste.where}
            </a>
            {tt(", then paste it here. It is checked before it is kept.")}
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
          aria-label={tt("{name} API key", { name: source.name })}
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
            {current ? tt("Replace") : tt("Connect")}
          </button>
          {current && (
            <button type="button" onClick={remove} disabled={!!busy} className={buttonClass}>
              {busy === "remove" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {tt("Remove")}
            </button>
          )}
        </div>
      </form>
      {error && <RowNote tone="bad">{error}</RowNote>}
      {saved && <RowNote tone="good">{saved}</RowNote>}
    </div>
  )
}
