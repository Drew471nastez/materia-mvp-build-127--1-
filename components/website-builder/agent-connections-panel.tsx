"use client"

/**
 * ===========================================================================
 *  WEBSITE SETTINGS › AI AGENTS
 * ===========================================================================
 * Where a creator lets Claude Code, Codex or another agent work on this
 * website's sections from their own computer. A connection is a token that
 * reaches this one website and nothing else, and everything an agent saves
 * is a draft (lib/agent-access/operations.ts).
 *
 * The token is shown ONCE, beside the two lines that use it. The server
 * keeps only its hash, so there is no "show again": a lost token is
 * disconnected and replaced, which takes one click.
 */
import { useCallback, useEffect, useState } from "react"
import { Check, Copy, Loader2 } from "lucide-react"
import { relativeTime } from "@/lib/website-builder/relative-time"
import { cn } from "@/lib/utils"

interface Connection {
  id: string
  name: string
  prefix: string
  created_at: string
  last_used_at: string | null
}

const MCP_URL = "https://storelib.com/api/mcp"

function CopyBlock({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-medium text-white/60">{label}</p>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(value).then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 1400)
            })
          }}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          {copied ? <Check className="h-3.5 w-3.5" strokeWidth={2} /> : <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre
        className={cn(
          "mt-2 overflow-x-auto whitespace-pre rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-[13px] leading-relaxed text-white/90",
          mono && "font-mono",
        )}
      >
        {value}
      </pre>
    </div>
  )
}

export function AgentConnectionsPanel({ installId }: { installId: string }) {
  const [connections, setConnections] = useState<Connection[] | null>(null)
  const [ready, setReady] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState("Claude Code")
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
      const res = await fetch(`/api/website-builder/themes/${installId}/agent-connections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      const d = (await res.json().catch(() => ({}))) as { connection?: Connection; token?: string; error?: string }
      if (!res.ok || !d.token || !d.connection) throw new Error(d.error || "Could not connect")
      setFresh({ name: d.connection.name, token: d.token })
      setConnections((prev) => [d.connection as Connection, ...(prev ?? [])])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not connect")
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

  return (
    <>
      <h1 className="text-[26px] font-semibold tracking-[-0.01em] md:text-[30px]">AI agents</h1>
      <p className="mt-3 max-w-[600px] text-[15px] leading-relaxed text-white/60">
        Let Claude Code, Codex or another agent write this website&apos;s sections from your computer. It reaches this
        website and nothing else, and everything it saves is a draft until you publish. A new section it writes appears
        on the page you have open here.
      </p>

      {!ready ? (
        <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-[15px] text-white/60 md:p-6">
          Agent connections are not switched on for this Storelib yet.
        </div>
      ) : (
        <>
          <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-5 md:p-6">
            <label htmlFor="agent-name" className="text-[15px] font-medium">
              Connect an agent
            </label>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <input
                id="agent-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                placeholder="Claude Code"
                className="h-11 min-w-0 flex-1 rounded-xl border border-white/15 bg-white/[0.04] px-4 text-[15px] text-white outline-none placeholder:text-white/30 focus:border-white/40"
              />
              <button
                type="button"
                onClick={() => void connect()}
                disabled={creating || !name.trim()}
                className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-5 text-[15px] font-medium text-[#0f0f0f] transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                Connect
              </button>
            </div>
            <p className="mt-2 text-[13px] text-white/40">The name is how its changes are labelled in the builder.</p>
          </div>

          {fresh && (
            <div className="mt-6 rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.06] p-5 md:p-6">
              <p className="text-[15px] font-medium">{fresh.name} is connected</p>
              <p className="mt-1 text-[14px] text-white/60">
                Copy the token now. It is not shown again; if you lose it, disconnect this one and connect again.
              </p>
              <CopyBlock label="Token" value={fresh.token} />
              <CopyBlock
                label="Claude Code: run this in a terminal"
                value={`claude mcp add --transport http storelib ${MCP_URL} --header "Authorization: Bearer ${fresh.token}"`}
              />
              <CopyBlock
                label="Codex: add to ~/.codex/config.toml, then set STORELIB_TOKEN to the token"
                value={`[mcp_servers.storelib]\nurl = "${MCP_URL}"\nbearer_token_env_var = "STORELIB_TOKEN"`}
              />
              <p className="mt-4 text-[13px] text-white/50">
                Any other agent can use the same token with the HTTP API. See storelib.com/developers/ai.
              </p>
            </div>
          )}

          {error && (
            <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-[14px] text-red-300">{error}</p>
          )}

          <h2 className="mt-10 text-[17px] font-medium">Connected</h2>
          <div className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
            {connections === null ? (
              <div className="flex items-center justify-center py-12 text-white/50">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : connections.length === 0 ? (
              <p className="px-5 py-10 text-center text-[15px] text-white/50">No agents connected.</p>
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
        </>
      )}
    </>
  )
}
