"use client"

/**
 * ===========================================================================
 *  YOUR OWN AI, IN STORELIB AI
 * ===========================================================================
 * "Let people connect their own Claude or ChatGPT, easy setup, so they code
 * right in the Storelib AI chat and it does not use Storelib AI credits."
 *
 * Three lines, the same rows as the tools under them:
 *
 *   OpenRouter   one click: sign in there, approve Storelib, back here.
 *                Claude and ChatGPT both answer on the creator's
 *                OpenRouter credit. The easiest, so it is first.
 *   Claude       a key from console.anthropic.com, pasted once.
 *   OpenAI       a key from platform.openai.com, pasted once.
 *
 * Whatever is connected answers the chat's models on the creator's account
 * (a key for that vendor first, else OpenRouter), and those edits do not
 * count against the plan's AI edits. A key is checked with its provider
 * before it is kept, is stored encrypted, and is never shown again: only
 * its last four characters.
 *
 * Signing in with a Claude.ai or ChatGPT subscription is not offered
 * because neither can be used from another website; this says so in one
 * line, so nobody goes looking for it.
 */

import { useEffect, useState, type ReactNode } from "react"
import { Loader2, Route } from "lucide-react"
import { ClaudeMark, OpenAIMark } from "@/components/website-builder/connection-marks"
import { acceptOwnAi, OWN_AI_RETURN_KEY, useOwnAi, type OwnKey, type OwnSource } from "@/components/website-builder/use-own-ai"
import { relativeTime } from "@/lib/website-builder/relative-time"
import { ConnectionRow, RowNote, type ConnectionTone } from "./connection-row"
import { buttonClass, inputClass, primaryButtonClass, textLinkClass } from "./parts"


const RETURNED: Record<string, { tone: "good" | "bad"; text: string }> = {
  connected: { tone: "good", text: "OpenRouter is connected. Storelib AI now answers on your OpenRouter account." },
  cancelled: { tone: "bad", text: "OpenRouter was not connected: the sign in was cancelled." },
  expired: { tone: "bad", text: "That took too long or started in another browser. Connect again from here." },
  failed: { tone: "bad", text: "OpenRouter did not hand over a key. Try connecting again." },
  "not-set-up": { tone: "bad", text: "Connecting your own AI is not switched on yet." },
}

const SOURCES: {
  id: OwnSource
  name: string
  mark: ReactNode
  paste?: { placeholder: string; where: string; href: string }
}[] = [
  { id: "openrouter", name: "OpenRouter", mark: <Route className="h-5 w-5" strokeWidth={1.9} /> },
  {
    id: "anthropic",
    name: "Claude",
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
  if (!key) return { tone: "off", status: "Not connected", action: "Connect" }
  if (key.lastError) return { tone: "attention", status: "Refused last time", detail: `ends ${key.hint}`, action: "Manage" }
  const used = relativeTime(key.lastUsedAt)
  return { tone: "on", status: "Connected", detail: used ? `ends ${key.hint} · used ${used}` : `ends ${key.hint}`, action: "Manage" }
}

export function OwnAiSettings({ installId }: { installId: string }) {
  const own = useOwnAi()
  const [open, setOpen] = useState<OwnSource | null>(null)
  const [returned, setReturned] = useState<string | null>(null)

  /* Back from OpenRouter: say how it went, on its line, open. */
  useEffect(() => {
    let value: string | null = null
    try {
      value = sessionStorage.getItem(OWN_AI_RETURN_KEY)
      sessionStorage.removeItem(OWN_AI_RETURN_KEY)
    } catch {
      value = null
    }
    if (!value) return
    setReturned(value)
    setOpen("openrouter")
    void own.refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const byId = (id: OwnSource) => own.keys.find((k) => k.source === id)
  const anyOn = own.keys.length > 0

  return (
    <section aria-label="Your own AI" data-own-ai="" className="mt-6 md:mt-7">
      <h2 className="text-[15px] font-semibold text-white md:text-[14.5px]">Your own AI in Storelib AI</h2>
      <p className="mt-1 max-w-[560px] text-[14px] leading-relaxed text-white/55 md:text-[13.5px]">
        Connect your own Claude or ChatGPT and Storelib AI answers on your account, right here in the chat. Those edits don&apos;t use your plan&apos;s AI edits.
      </p>
      {!own.setUp && (
        <RowNote tone="bad">Connecting your own AI is not switched on yet. It is coming shortly.</RowNote>
      )}
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
              tone={own.setUp ? st.tone : "none"}
              loading={!own.loaded}
              action={own.setUp ? st.action : undefined}
              open={open === s.id}
              onToggle={() => setOpen(open === s.id ? null : s.id)}
            >
              {() => (
                <SourceBody
                  source={s}
                  current={key}
                  installId={installId}
                  returned={s.id === "openrouter" ? returned : null}
                  onDone={() => setOpen(null)}
                />
              )}
            </ConnectionRow>
          )
        })}
      </div>
      <p className="mt-3 text-[13.5px] leading-relaxed text-white/45 md:text-[13px]">
        {anyOn
          ? "Your key is used for your chats only, kept encrypted, and never shown again."
          : "A Claude.ai or ChatGPT subscription can't be signed into from another website, so it is a key or OpenRouter. Both take a minute."}
      </p>
    </section>
  )
}

function SourceBody({
  source,
  current,
  installId,
  returned,
  onDone,
}: {
  source: (typeof SOURCES)[number]
  current: OwnKey | undefined
  installId: string
  returned: string | null
  onDone: () => void
}) {
  const [value, setValue] = useState("")
  const [busy, setBusy] = useState<"save" | "remove" | "go" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const back = returned ? RETURNED[returned] : null

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
          : `Connected. Storelib AI now answers ${source.id === "anthropic" ? "Claude" : "ChatGPT"} on your key.`,
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
      {back && <RowNote tone={back.tone}>{back.text}</RowNote>}
      {current?.lastError && <RowNote tone="bad">{current.lastError}</RowNote>}

      {source.id === "openrouter" ? (
        <>
          {!current && (
            <RowNote>
              Sign in to OpenRouter and approve Storelib. Claude and ChatGPT then answer on your OpenRouter credit, and you can see every request there.
            </RowNote>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <a
              href={`/api/ai-keys/openrouter?installId=${encodeURIComponent(installId)}`}
              onClick={() => setBusy("go")}
              className={current ? buttonClass : primaryButtonClass}
              data-own-ai-openrouter=""
            >
              {busy === "go" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {current ? "Connect again" : "Continue to OpenRouter"}
            </a>
            {current && (
              <button type="button" onClick={remove} disabled={!!busy} className={buttonClass}>
                {busy === "remove" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                Remove
              </button>
            )}
          </div>
        </>
      ) : (
        <>
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
        </>
      )}
      {error && <RowNote tone="bad">{error}</RowNote>}
      {saved && <RowNote tone="good">{saved}</RowNote>}
    </div>
  )
}
