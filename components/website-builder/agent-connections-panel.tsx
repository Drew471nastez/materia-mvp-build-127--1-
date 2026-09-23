"use client"

/**
 * ===========================================================================
 *  WEBSITE SETTINGS › ADVANCED › CONNECT DIRECTLY
 * ===========================================================================
 * Claude Code or Codex on the creator's own computer, talking to this one
 * website over MCP with a token. Three steps, each one thing to do:
 *
 *   1  pick the tool and make a token
 *   2  open a terminal, shown as the keys to press on THIS computer
 *   3  paste the line, spelled for this computer's shell
 *
 * and then what to ask for, and how to see it worked. The computer is read
 * from the browser and can be switched; the lines themselves are in
 * lib/agent-access/setup-commands.ts, where they are tested as text.
 *
 * The token is shown ONCE, inside the lines that use it. The server keeps
 * only its hash, so there is no "show again": a lost token is disconnected
 * and replaced, which takes one click. It lives in this component's memory
 * and nowhere else in the browser.
 */
import { Fragment, useCallback, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { relativeTime } from "@/lib/website-builder/relative-time"
import { cn } from "@/lib/utils"
import {
  CLAUDE_REMOVE_OLD,
  FIRST_ASK,
  OS_LABEL,
  afterSetup,
  detectOs,
  openTerminalGuide,
  setupCommands,
  type AgentTool,
  type Os,
} from "@/lib/agent-access/setup-commands"
import { Code, CommandBlock, Keycap, Step, Steps } from "@/components/website-builder/setup-steps"

interface Connection {
  id: string
  name: string
  prefix: string
  created_at: string
  last_used_at: string | null
}

const AGENTS: { id: AgentTool; label: string; name: string }[] = [
  { id: "claude", label: "Claude Code", name: "Claude Code" },
  { id: "codex", label: "Codex", name: "Codex" },
  { id: "other", label: "Other", name: "AI agent" },
]

const OSES: Os[] = ["mac", "windows", "linux"]

/** Stands where the token goes until there is one. Never copyable. */
const NO_TOKEN_YET = "YOUR_TOKEN"

/** How to open a terminal on this computer, as keys. */
function TerminalGuide({ os }: { os: Os }) {
  const guide = openTerminalGuide(os)
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 text-[14px] text-white/70" aria-label={`Open a terminal on ${OS_LABEL[os]}`}>
        {guide.parts.map((part, i) => {
          const prev = guide.parts[i - 1]
          const plus = "key" in part && prev && "key" in prev
          return (
            <Fragment key={i}>
              {plus && <span className="text-white/35">+</span>}
              {"key" in part && <Keycap>{part.key}</Keycap>}
              {"type" in part && (
                <span>
                  type <span className="font-medium text-white">{part.type}</span>
                </span>
              )}
              {"then" in part && <span aria-hidden className="px-0.5 text-white/35">→</span>}
            </Fragment>
          )
        })}
      </div>
      {guide.aside && <p className="mt-2 text-[13px] text-white/45">{guide.aside}</p>}
    </div>
  )
}

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  size = "md",
}: {
  label: string
  options: { id: T; label: string }[]
  value: T
  onChange: (v: T) => void
  size?: "sm" | "md"
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-xl border border-white/10 bg-white/[0.03] p-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "rounded-lg font-medium transition-colors duration-150",
            size === "sm" ? "h-7 px-2.5 text-[12.5px]" : "h-9 px-4 text-[14px]",
            value === o.id ? "bg-white text-[#0f0f0f]" : "text-white/65 hover:text-white",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function AgentConnectionsPanel({ installId }: { installId: string }) {
  const [connections, setConnections] = useState<Connection[] | null>(null)
  const [ready, setReady] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [agent, setAgent] = useState<AgentTool>("claude")
  /* The panel only ever renders in the browser (Website settings is a
     portal opened by a click), so the computer can be read on first render. */
  const [os, setOs] = useState<Os>(() => detectOs())
  const [creating, setCreating] = useState(false)
  /** The token just made. Held in memory only, and gone when this closes. */
  const [fresh, setFresh] = useState<{ name: string; token: string } | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/website-builder/themes/${installId}/agent-connections`)
      const d = (await res.json().catch(() => ({}))) as { connections?: Connection[]; ready?: boolean; error?: string }
      if (!res.ok) throw new Error(d.error || "Could not load connections")
      setConnections(d.connections ?? [])
      setReady(d.ready !== false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load connections")
      setConnections([])
    }
  }, [installId])

  useEffect(() => {
    void load()
  }, [load])

  const connect = async () => {
    setCreating(true)
    setError(null)
    try {
      const name = AGENTS.find((a) => a.id === agent)?.name ?? "AI agent"
      const res = await fetch(`/api/website-builder/themes/${installId}/agent-connections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      const d = (await res.json().catch(() => ({}))) as { connection?: Connection; token?: string; error?: string }
      if (!res.ok || !d.token || !d.connection) throw new Error(d.error || "Could not make a token")
      setFresh({ name: d.connection.name, token: d.token })
      setConnections((prev) => [d.connection as Connection, ...(prev ?? [])])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not make a token")
    } finally {
      setCreating(false)
    }
  }

  const disconnect = async (id: string) => {
    setError(null)
    const res = await fetch(`/api/website-builder/themes/${installId}/agent-connections?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    })
    if (!res.ok) {
      setError("Could not disconnect. Try again.")
      return
    }
    setConfirmingId(null)
    setConnections((prev) => (prev ?? []).filter((c) => c.id !== id))
  }

  if (!ready) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-[15px] text-white/60 md:p-6">
        Direct connections are not switched on for this Storelib yet.
      </div>
    )
  }

  const token = fresh?.token ?? NO_TOKEN_YET
  const lines = setupCommands(agent, os, token)
  const next = afterSetup(agent)
  const terminal = agent !== "other"

  return (
    <>
      <Steps>
        <Step n={1} title="Pick your tool and make a token" done={!!fresh}>
          <Segmented label="Agent" options={AGENTS} value={agent} onChange={setAgent} />
          <div className="mt-3">
            {fresh ? (
              <p className="text-[13.5px] text-white/55">Made. It is in the line below and is shown only this once.</p>
            ) : (
              <button
                type="button"
                onClick={() => void connect()}
                disabled={creating}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-white px-5 text-[14.5px] font-semibold text-[#0f0f0f] transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                Make a token
              </button>
            )}
          </div>
        </Step>

        {terminal && (
          <Step
            n={2}
            title="Open a terminal"
            aside={
              <Segmented
                label="Your computer"
                size="sm"
                options={OSES.map((o) => ({ id: o, label: OS_LABEL[o] }))}
                value={os}
                onChange={setOs}
              />
            }
          >
            <TerminalGuide os={os} />
          </Step>
        )}

        <Step
          n={terminal ? 3 : 2}
          title={terminal ? "Paste, then press Enter" : "Add Storelib to your MCP client"}
          muted={!fresh}
        >
          <div className="space-y-3">
            {lines.map((line) => (
              <CommandBlock key={line.label} label={lines.length > 1 ? line.label : undefined} value={line.value} disabled={!fresh} />
            ))}
          </div>
          {agent === "claude" && (
            <p className="mt-2.5 text-[13px] text-white/45">
              Added storelib before? Run <Code>{CLAUDE_REMOVE_OLD}</Code> first.
            </p>
          )}
        </Step>
      </Steps>

      {fresh && next && (
        <div className="mt-8 rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.05] p-5 md:p-6">
          <p className="text-[15px] font-medium">
            Done? Run <Code>{next.start}</Code> in any folder and ask:
          </p>
          <p className="mt-2 text-[16px] text-white">&ldquo;{FIRST_ASK}&rdquo;</p>
          <p className="mt-4 text-[13px] text-white/55">
            Check it works: <Code>{next.check}</Code> {next.checkResult}.
          </p>
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-[14px] text-red-300">{error}</p>
      )}

      <h3 className="mt-10 text-[15px] font-medium text-white/80">Connected</h3>
      <div className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
        {connections === null ? (
          <div className="flex items-center justify-center py-10 text-white/50">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : connections.length === 0 ? (
          <p className="px-5 py-8 text-center text-[14px] text-white/45">Nothing connected yet.</p>
        ) : (
          <ul className="divide-y divide-white/[0.07]">
            {connections.map((c) => (
              <li key={c.id} className="flex items-center gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium">{c.name}</p>
                  <p className="mt-0.5 truncate text-[13px] text-white/50">
                    <span className="font-mono">{c.prefix}…</span>
                    <span className="text-white/30"> · </span>
                    {c.last_used_at ? `Used ${relativeTime(c.last_used_at)}` : "Not used yet"}
                  </p>
                </div>
                {confirmingId === c.id ? (
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmingId(null)}
                      className="h-9 rounded-lg px-3 text-[14px] text-white/70 hover:text-white"
                    >
                      Keep
                    </button>
                    <button
                      type="button"
                      onClick={() => void disconnect(c.id)}
                      className="h-9 rounded-lg bg-red-500/90 px-4 text-[14px] font-medium text-white hover:bg-red-500"
                    >
                      Disconnect
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingId(c.id)}
                    className="h-9 shrink-0 rounded-lg border border-white/15 px-4 text-[14px] font-medium text-white transition-colors hover:bg-white/[0.1]"
                  >
                    Disconnect
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="mt-2 text-[13px] text-white/40">Lost a token? Disconnect it and make a new one.</p>
    </>
  )
}
