"use client"

/**
 * ===========================================================================
 *  WEBSITE SETTINGS › CONNECTIONS › CLAUDE CODE, CODEX, ANOTHER TOOL
 * ===========================================================================
 * Claude Code or Codex on the creator's own computer, talking to this one
 * website over MCP with a key. Each is one line on Connections
 * (./website-settings/connection-row) with one button:
 *
 *   Connect   makes a key at once and opens the steps, which are only ever
 *             the two or three things left to do:
 *               1  open Terminal, shown as the keys to press on THIS computer
 *               2  paste the line, spelled for this computer's shell
 *               3  start the tool and ask for something
 *   Manage    the keys this tool has, each with Disconnect, and a new key
 *             for another computer.
 *
 * Choosing the tool used to be step one, a row of three buttons inside a
 * panel that first had to be reached by answering "directly, or through
 * GitHub?". Now the tool is the line that was pressed.
 *
 * IT SAYS WHEN IT HAS WORKED. While a new key's steps are open, the list is
 * read again every few seconds and whenever the page comes back into view
 * (the creator was in Terminal), and the line turns to Connected the first
 * time the tool uses its key. The steps used to end with a command to run to
 * find that out.
 *
 * The key is shown ONCE, inside the lines that use it. The server keeps only
 * its hash, so there is no "show again": a lost key is disconnected and
 * replaced. It lives in this component's memory and nowhere else in the
 * browser. The lines themselves are in lib/agent-access/setup-commands.ts,
 * where they are tested as text.
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from "react"
import { Plug } from "lucide-react"
import { relativeTime } from "@/lib/website-builder/relative-time"
import { cn } from "@/lib/utils"
import { kindForName } from "@/lib/agent-access/connection-mark"
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
import { ClaudeMark, OpenAIMark } from "@/components/website-builder/connection-marks"
import { Code, CommandBlock, Keycap, Step, Steps } from "@/components/website-builder/setup-steps"
import { ConnectionRow, InlineButton, RowNote, type ConnectionTone } from "@/components/website-builder/website-settings/connection-row"
import { tt } from "@/lib/i18n/text"
import { Rich } from "@/lib/i18n/rich"
import { appLocale, zoned } from "@/lib/i18n/format"

interface Connection {
  id: string
  name: string
  prefix: string
  created_at: string
  last_used_at: string | null
  /** Part 132: when the key stops working (null for never), whether it has, and whether it can change the site. */
  expires_at?: string | null
  expired?: boolean
  access?: "read" | "write"
}

/** A key's second line: when it was used, how long it works, and if it only reads. Pure, tested as words. */
export function keyLine(c: Pick<Connection, "last_used_at" | "expires_at" | "expired" | "access">, now = Date.now()): string {
  const used = c.last_used_at ? tt("Used {time}", { time: relativeTime(c.last_used_at, now) }) : tt("Not used yet")
  const until = c.expired
    ? tt("Expired. Make a new key")
    : c.expires_at
      ? tt("Works until {date}", { date: new Date(c.expires_at).toLocaleDateString(appLocale().startsWith("en") ? "en-GB" : appLocale(), zoned({ day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })) })
      : null
  return [used, until, c.access === "read" ? tt("Read only") : null].filter(Boolean).join(" · ")
}

const TOOLS: Record<AgentTool, { name: string; tokenName: string; web?: string }> = {
  claude: { name: "Claude Code", get tokenName() { return tt("Claude Code") }, get web() { return tt("Claude Code on the web") } },
  codex: { name: "Codex", get tokenName() { return tt("Codex") }, get web() { return tt("Codex in ChatGPT") } },
  other: { name: "Another tool", get tokenName() { return tt("AI agent") } },
}

/** Which line a key belongs on, from the name it was made with. */
export function toolForName(name: string): AgentTool {
  const kind = kindForName(name)
  return kind === "claude" ? "claude" : kind === "openai" ? "codex" : "other"
}

/** How often a new key is looked at while its steps are open, and the page is in view. */
export const WAIT_POLL_MS = 5000

const OSES: Os[] = ["mac", "windows", "linux"]

/** Stands where the key goes until there is one. Never copyable. */
const NO_TOKEN_YET = "YOUR_TOKEN"

/** How to open a terminal on this computer, as keys. */
function TerminalGuide({ os }: { os: Os }) {
  const guide = openTerminalGuide(os)
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 text-[14px] text-white/70" aria-label={tt("Open a terminal on {os}", { os: OS_LABEL[os] })}>
        {guide.parts.map((part, i) => {
          const prev = guide.parts[i - 1]
          const plus = "key" in part && prev && "key" in prev
          return (
            <Fragment key={i}>
              {plus && <span className="text-white/35">+</span>}
              {"key" in part && <Keycap>{part.key}</Keycap>}
              {"type" in part && (
                <span>
                  {tt("type")} <span className="font-medium text-white">{part.type}</span>
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
}: {
  label: string
  options: { id: T; label: string }[]
  value: T
  onChange: (v: T) => void
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
            /* The group's own 4px padding is part of each button's press area:
               an invisible band out to the group's edge, so a phone gets 44px. */
            "relative h-9 rounded-lg px-3 text-[13.5px] font-medium transition-colors duration-150 after:absolute after:inset-x-0 after:-inset-y-1 after:content-[''] md:h-7 md:px-2.5 md:text-[12.5px] [-webkit-tap-highlight-color:transparent]",
            value === o.id ? "bg-white text-[#0f0f0f]" : "text-white/65 hover:text-white",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/**
 * The keys for this website, read once and then kept here. One hook for all
 * three lines, so a key made on one shows on the right one at once and the
 * list is read from the server once, not three times.
 */
export function useAgentConnections(installId: string) {
  const [connections, setConnections] = useState<Connection[] | null>(null)
  const [ready, setReady] = useState(true)
  const [error, setError] = useState<{ tool: AgentTool | null; message: string } | null>(null)
  const [making, setMaking] = useState<AgentTool | null>(null)
  /** The key just made for each tool. Held in memory only, and gone when this closes. */
  const [fresh, setFresh] = useState<Partial<Record<AgentTool, { id: string; token: string }>>>({})
  /* The panel only ever renders in the browser (Website settings is a
     portal opened by a click), so the computer can be read on first render. */
  const [os, setOs] = useState<Os>(() => detectOs())

  /** `quiet` for a look taken while waiting: a failed one changes nothing on screen. */
  const load = useCallback(
    async (quiet = false) => {
      try {
        const res = await fetch(`/api/website-builder/themes/${installId}/agent-connections`)
        const d = (await res.json().catch(() => ({}))) as { connections?: Connection[]; ready?: boolean; error?: string }
        if (!res.ok) throw new Error(d.error || tt("Could not load connections"))
        setConnections(d.connections ?? [])
        setReady(d.ready !== false)
      } catch (e) {
        if (quiet) return
        setError({ tool: null, message: e instanceof Error ? e.message : tt("Could not load connections") })
        setConnections([])
      }
    },
    [installId],
  )

  useEffect(() => {
    void load()
  }, [load])

  const byTool = useMemo(() => {
    const out: Record<AgentTool, Connection[]> = { claude: [], codex: [], other: [] }
    for (const c of connections ?? []) out[toolForName(c.name)].push(c)
    return out
  }, [connections])

  const make = async (tool: AgentTool) => {
    setMaking(tool)
    setError(null)
    try {
      const res = await fetch(`/api/website-builder/themes/${installId}/agent-connections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: TOOLS[tool].tokenName }),
      })
      const d = (await res.json().catch(() => ({}))) as { connection?: Connection; token?: string; error?: string }
      if (!res.ok || !d.token || !d.connection) throw new Error(d.error || tt("Could not make a key"))
      const made = d.connection
      setFresh((prev) => ({ ...prev, [tool]: { id: made.id, token: d.token as string } }))
      setConnections((prev) => [made, ...(prev ?? [])])
    } catch (e) {
      setError({ tool, message: e instanceof Error ? e.message : tt("Could not make a key") })
    } finally {
      setMaking(null)
    }
  }

  const disconnect = async (tool: AgentTool, id: string): Promise<boolean> => {
    setError(null)
    const res = await fetch(`/api/website-builder/themes/${installId}/agent-connections?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    }).catch(() => null)
    if (!res?.ok) {
      setError({ tool, message: tt("Could not disconnect. Try again.") })
      return false
    }
    setConnections((prev) => (prev ?? []).filter((c) => c.id !== id))
    setFresh((prev) => (prev[tool]?.id === id ? { ...prev, [tool]: undefined } : prev))
    return true
  }

  return { connections, ready, error, making, fresh, os, setOs, byTool, load, make, disconnect }
}

export type AgentConnections = ReturnType<typeof useAgentConnections>

/** The newest time any of these keys was used. */
function lastUsed(list: Connection[]): string | null {
  let best: string | null = null
  for (const c of list) if (c.last_used_at && (!best || Date.parse(c.last_used_at) > Date.parse(best))) best = c.last_used_at
  return best
}

/** What a tool's line says, from its keys. Pure, so the words are tested as words. */
export function agentStatus(
  list: { last_used_at: string | null }[] | null,
  ready: boolean,
  now = Date.now(),
): { tone: ConnectionTone; status?: string; detail?: string; action?: string; loading?: boolean } {
  if (list === null) return { tone: "off", loading: true }
  if (!ready) return { tone: "none", status: "Not available on this Storelib yet" }
  if (list.length === 0) return { tone: "off", status: "Not connected", action: tt("Connect") }
  /* Every key past its day: the tool cannot reach the site until a new one is made. */
  if ((list as Connection[]).every((c) => c.expired)) return { tone: "attention", status: "Key expired", detail: tt("make a new one"), action: tt("Manage") }
  const used = lastUsed(list as Connection[])
  if (used) return { tone: "on", status: "Connected", detail: tt("used {time}", { time: relativeTime(used, now) }), action: tt("Manage") }
  return { tone: "waiting", status: "Not used yet", action: tt("Manage") }
}

/** The steps for a key that has just been made, with the key in them. */
function SetupSteps({ tool, agents }: { tool: AgentTool; agents: AgentConnections }) {
  const { os, setOs } = agents
  const fresh = agents.fresh[tool] ?? null
  const token = fresh?.token ?? NO_TOKEN_YET
  const lines = setupCommands(tool, os, token)
  const next = afterSetup(tool)
  const terminal = tool !== "other"
  const enter = os === "mac" ? tt("Return") : tt("Enter")
  return (
    <Steps>
      {terminal && (
        <Step
          n={1}
          title={tt("Open Terminal")}
          aside={<Segmented<Os> label={tt("Your computer")} options={OSES.map((o) => ({ id: o, label: OS_LABEL[o] }))} value={os} onChange={setOs} />}
        >
          <TerminalGuide os={os} />
        </Step>
      )}

      <Step n={terminal ? 2 : 1} title={terminal ? tt("Paste this and press {enter}", { enter }) : tt("Add Storelib to your tool")} muted={!fresh}>
        <div className="space-y-3">
          {lines.map((line) => (
            <CommandBlock key={line.label} label={lines.length > 1 ? line.label : undefined} value={line.value} disabled={!fresh} />
          ))}
        </div>
        <p className="mt-2.5 text-[13px] leading-relaxed text-white/45">
          {fresh ? tt("Your key is in this line. It is shown only this once.") : tt("Making your key")}
        </p>
        {tool === "claude" && fresh && (
          <p className="mt-1 text-[13px] leading-relaxed text-white/45">
            <Rich text={tt("Added Storelib before? Run {command} first.")} parts={{ command: <Code>{CLAUDE_REMOVE_OLD}</Code> }} />
          </p>
        )}
      </Step>

      {next && (
        <Step n={3} title={tt("Start {name} and ask for a change", { name: TOOLS[tool].name })} muted={!fresh}>
          <p className="text-[14px] text-white/65">
            <Rich text={tt("Type {command}, press {enter}, then ask:", { enter })} parts={{ command: <Code>{next.start}</Code> }} />
          </p>
          <p className="mt-2 text-[15.5px] leading-snug text-white">&ldquo;{FIRST_ASK}&rdquo;</p>
        </Step>
      )}
    </Steps>
  )
}

/** The keys a tool has, each with Disconnect, asked once. */
function KeyList({ tool, agents, list }: { tool: AgentTool; agents: AgentConnections; list: Connection[] }) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  return (
    <ul aria-label={tt("{name} keys", { name: TOOLS[tool].name })} className="-my-1 divide-y divide-white/[0.07]">
      {list.map((c) => (
        <li key={c.id} className="flex min-h-[60px] items-center gap-4 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] text-white/85">
              {tt("Key")} <span className="font-mono text-[13px] text-white/70">{c.prefix}…</span>
            </p>
            <p className="mt-0.5 truncate text-[13px] text-white/45">
              {keyLine(c)}
            </p>
          </div>
          {confirmingId === c.id ? (
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setConfirmingId(null)}
                className="h-11 rounded-lg px-3 text-[15px] text-white/70 hover:text-white md:h-9 md:text-[14px]"
              >
                {tt("Keep")}
              </button>
              <button
                type="button"
                onClick={() => void agents.disconnect(tool, c.id).then((ok) => ok && setConfirmingId(null))}
                className="h-11 rounded-lg bg-red-500/90 px-4 text-[15px] font-medium text-white hover:bg-red-500 md:h-9 md:text-[14px]"
              >
                {tt("Disconnect")}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingId(c.id)}
              className="h-11 shrink-0 rounded-lg px-3 text-[15px] font-medium text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white md:h-9 md:text-[14px]"
            >
              {tt("Disconnect")}
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

/**
 * One tool's line. Closed: its status and one button. Open: the steps for a
 * key made just now, or the keys it already has.
 */
export function AgentConnectionRow({
  tool,
  agents,
  open,
  onOpen,
  onGitHub,
}: {
  tool: AgentTool
  agents: AgentConnections
  open: boolean
  onOpen: (tool: AgentTool | null) => void
  onGitHub: () => void
}) {
  const list = agents.connections === null ? null : agents.byTool[tool]
  const line = agentStatus(list, agents.ready)
  const fresh = agents.fresh[tool] ?? null
  const failed = agents.error && (agents.error.tool === tool || agents.error.tool === null) ? agents.error.message : null
  const freshUsed = fresh ? Boolean(list?.find((c) => c.id === fresh.id)?.last_used_at) : false
  const waiting = open && fresh !== null && !freshUsed

  /*
    WAITING FOR THE FIRST USE. Only while this line is open with a key made
    just now that has not been used: every few seconds while the page is in
    view, and the moment it comes back into view, which is when the creator
    has just been in Terminal. A failed look is quiet; the next one tries again.
  */
  const { load } = agents
  useEffect(() => {
    if (!waiting) return
    const look = () => {
      if (document.visibilityState === "visible") void load(true)
    }
    const timer = window.setInterval(look, WAIT_POLL_MS)
    window.addEventListener("focus", look)
    document.addEventListener("visibilitychange", look)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener("focus", look)
      document.removeEventListener("visibilitychange", look)
    }
  }, [waiting, load])

  const toggle = () => {
    if (open) return onOpen(null)
    onOpen(tool)
    /* Connect: the key is made as the line opens, so the steps have it by the time they are read. */
    if ((list?.length ?? 0) === 0 && !fresh && agents.making !== tool) void agents.make(tool)
  }

  const mark =
    tool === "claude" ? (
      <ClaudeMark className="h-5 w-5" />
    ) : tool === "codex" ? (
      <OpenAIMark className="h-5 w-5" />
    ) : (
      <Plug className="h-5 w-5" strokeWidth={1.75} />
    )
  const name = TOOLS[tool].name
  const others = (list ?? []).filter((c) => c.id !== fresh?.id)
  /* A key made just now, or being made: the steps. Otherwise the keys there are. */
  const settingUp = fresh !== null || agents.making === tool

  return (
    <ConnectionRow
      id={tool}
      mark={mark}
      name={name}
      tone={line.tone}
      status={line.status}
      detail={line.detail}
      loading={line.loading}
      action={line.action}
      open={open}
      onToggle={toggle}
    >
      {() => (
        <>
          {settingUp && <SetupSteps tool={tool} agents={agents} />}
          {settingUp && fresh && (
            <RowNote tone={freshUsed ? "good" : "quiet"}>
              {freshUsed ? tt("{name} is connected. What it writes shows up here as a draft.", { name }) : tt("Waiting for {name} to connect.", { name })}
            </RowNote>
          )}

          {!settingUp && others.length > 0 && <KeyList tool={tool} agents={agents} list={others} />}
          {settingUp && others.length > 0 && (
            <div className="mt-7">
              <p className="text-[13px] font-medium text-white/50">{tt("Other keys")}</p>
              <div className="mt-1.5">
                <KeyList tool={tool} agents={agents} list={others} />
              </div>
            </div>
          )}

          {failed && (
            <RowNote tone="bad">
              {failed}
              {agents.error?.tool === tool && !fresh && (
                <>
                  {" "}
                  <InlineButton onClick={() => void agents.make(tool)}>{tt("Try again")}</InlineButton>
                </>
              )}
            </RowNote>
          )}

          {!settingUp && others.length > 0 && (
            <RowNote>
              {tt("On another computer, or lost the line?")} <InlineButton onClick={() => void agents.make(tool)}>{tt("Make a new key")}</InlineButton>
            </RowNote>
          )}
          {TOOLS[tool].web && (
            <RowNote>
              {tt("Using {web}?", { web: TOOLS[tool].web })} <InlineButton onClick={onGitHub}>{tt("Connect GitHub")}</InlineButton> {tt("instead.")}
            </RowNote>
          )}
        </>
      )}
    </ConnectionRow>
  )
}
