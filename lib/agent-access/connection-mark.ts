/**
 * ===========================================================================
 *  WHICH CONNECTION THE EDITOR'S TOP BAR SHOWS
 * ===========================================================================
 * A site can be linked to a GitHub repository and have agent connections
 * (Claude Code, Codex, anything else with a token) at the same time. The bar
 * has room for one mark, so this decides which, from what the editor already
 * reads when it opens (see the agent-activity route):
 *
 *   1  the connection that acted most recently, by the activity log and the
 *      tokens' last use;
 *   2  else any live agent connection, the newest first;
 *   3  else the GitHub link;
 *   4  else nothing is connected, and the bar shows GitHub's mark without a
 *      dot, which is where connecting starts.
 *
 * "Live" is a token that has not been disconnected, or a link that exists.
 * Nothing here ever sees a token: the brief carries names and times.
 *
 * Pure and client safe, so the bar and tests/connection-mark.test.ts read the
 * same rules.
 */
import type { ThemeOp } from "@/lib/website-builder/agent/operations"

export type ConnectionKind = "github" | "claude" | "openai" | "agent"

export interface ConnectionsBrief {
  /** Agent connections that are not disconnected, newest first. */
  agents: { name: string; lastUsedAt: string | null }[]
  /** The site's GitHub link. `repo` is null while one is still being picked. */
  github: { repo: string | null } | null
  /** The newest line in the activity log, whoever wrote it. */
  latest: { name: string; at: string } | null
}

export interface ConnectionMark {
  kind: ConnectionKind
  /** False only when nothing is connected at all. */
  online: boolean
  /** What the tooltip and the phone's menu say. */
  label: string
  /** The connection's own name: "Claude Code", "GitHub". */
  name: string
  /** When it last did something, if that is known. */
  lastActiveAt: number | null
  /** The other live connections, for the tooltip's second line. */
  others: string[]
}

/** Within this long of acting, a connection counts as working now. */
export const RECENT_MS = 5 * 60_000

/** GitHub writes its pushes into the log as "GitHub" or "GitHub · login". */
export function isGitHubName(name: string): boolean {
  return /^github(\s*·|$)/i.test(name.trim())
}

/**
 * A connection's mark, from the name the creator gave it when they made the
 * token. The panel offers "Claude Code", "Codex" and "AI agent"; a person can
 * type anything, so the match is by word, not by exact name.
 */
export function kindForName(name: string): ConnectionKind {
  const n = name.trim()
  if (isGitHubName(n)) return "github"
  if (/claude|anthropic/i.test(n)) return "claude"
  if (/codex|chatgpt|openai|\bgpt/i.test(n)) return "openai"
  return "agent"
}

function time(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : null
}

function githubLabel(repo: string | null | undefined): string {
  return repo ? `GitHub: ${repo}` : "GitHub connected"
}

export function pickConnection(brief: ConnectionsBrief | null): ConnectionMark {
  const none: ConnectionMark = {
    kind: "github",
    online: false,
    label: "Connect GitHub, Claude Code or Codex",
    name: "GitHub",
    lastActiveAt: null,
    others: [],
  }
  if (!brief) return none

  type Candidate = { kind: ConnectionKind; name: string; label: string; at: number | null; order: number }
  const candidates: Candidate[] = brief.agents.map((a, i) => ({
    kind: kindForName(a.name),
    name: a.name,
    label: `${a.name} connected`,
    at: time(a.lastUsedAt),
    order: i,
  }))
  if (brief.github) {
    candidates.push({ kind: "github", name: "GitHub", label: githubLabel(brief.github.repo), at: null, order: candidates.length })
  }

  /* The log names who wrote last. Credit it to that connection. */
  const latestAt = time(brief.latest?.at)
  if (brief.latest && latestAt !== null) {
    const who = brief.latest.name
    const match = isGitHubName(who)
      ? candidates.find((c) => c.kind === "github" && c.name === "GitHub")
      : candidates.find((c) => c.name === who && c.kind !== "github")
    if (match) {
      match.at = Math.max(match.at ?? 0, latestAt)
    } else if (!isGitHubName(who)) {
      /* Written by a connection made after this brief was read: it acted,
         so it is live. A GitHub line without a link is a link since removed. */
      candidates.push({ kind: kindForName(who), name: who, label: `${who} connected`, at: latestAt, order: candidates.length })
    }
  }
  if (candidates.length === 0) return none

  const acted = candidates.filter((c) => c.at !== null).sort((a, b) => (b.at ?? 0) - (a.at ?? 0))
  const winner =
    acted[0] ??
    candidates.find((c) => c.kind !== "github") ??
    candidates[0]
  return {
    kind: winner.kind,
    online: true,
    label: winner.label,
    name: winner.name,
    lastActiveAt: winner.at,
    others: candidates.filter((c) => c !== winner).map((c) => c.label),
  }
}

/**
 * ===========================================================================
 *  EVERYTHING THAT IS CONNECTED, FOR THE PUBLISH SHEET ON A PHONE
 * ===========================================================================
 * The bar shows one mark; a phone has no room on its bar for even that, so
 * the Publish sheet ends with a row that says what is connected, by each
 * company's mark: Claude, Codex (or ChatGPT), any other agent by the name it
 * was given, then GitHub. One entry per tool, however many tokens it has.
 * Read from the same brief as the bar, so the two can never disagree.
 */
export interface ConnectedTool {
  kind: ConnectionKind
  /** "Claude", "Codex", "GitHub", or an agent's own name. */
  name: string
}

export function connectedTools(brief: ConnectionsBrief | null): ConnectedTool[] {
  if (!brief) return []
  const tools: ConnectedTool[] = []
  const seen = new Set<string>()
  for (const a of brief.agents) {
    const kind = kindForName(a.name)
    if (kind === "github") continue
    const name = kind === "agent" ? a.name.trim() || "Agent" : shortName(kind, a.name)
    const key = kind === "agent" ? `agent:${name.toLowerCase()}` : `${kind}:${name}`
    if (seen.has(key)) continue
    seen.add(key)
    tools.push({ kind, name })
  }
  if (brief.github) tools.push({ kind: "github", name: "GitHub" })
  return tools
}

/** "Claude", "Claude and GitHub", "Claude, Codex and GitHub". */
export function toolNames(tools: ConnectedTool[]): string {
  const names = tools.map((t) => t.name)
  if (names.length <= 1) return names[0] ?? ""
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
}

/** True while the connection acted within the last few minutes. */
/** The short name a tooltip gives a connection: "GitHub", "Claude", "Codex". */
export function shortName(kind: ConnectionKind, name: string): string {
  if (kind === "github") return "GitHub"
  if (kind === "claude") return "Claude"
  if (kind === "openai") return /chatgpt/i.test(name) ? "ChatGPT" : "Codex"
  return "Agent"
}

/**
 * THE TOOLTIP, IN FOUR WORDS AT MOST. It read "GitHub: owner/repo. Also
 * Claude Code connected, Codex connected and 2 more", a paragraph hanging
 * off a 32px button. The owner asked for three or four words. The repo and
 * the list are one click away, in the panel the button opens.
 */
export function connectionTip(mark: ConnectionMark): string {
  if (!mark.online) return "Connect an agent"
  const who = shortName(mark.kind, mark.name)
  return mark.others.length === 0 ? `${who} connected` : `${who} + ${mark.others.length} more`
}

export function actedRecently(mark: ConnectionMark, now: number): boolean {
  return mark.online && mark.lastActiveAt !== null && now - mark.lastActiveAt >= -60_000 && now - mark.lastActiveAt < RECENT_MS
}

/**
 * ===========================================================================
 *  HOW OFTEN AN OPEN EDITOR ASKS
 * ===========================================================================
 * Quickly while changes are arriving, so a run of edits reads as one live
 * notice; slower and slower while nothing happens, down to one small read
 * every ten seconds (it was twenty: a push to GitHub sat unseen in an open
 * editor for that long, which read as having to refresh). A tab coming back
 * into view, or the pointer coming back over it, asks at once and starts
 * again from the quick end (site-connections.tsx), so nobody waits to see
 * what an agent or a push did while they were somewhere else.
 *
 * After two quiet minutes (no change arrived, nobody came back to the tab or
 * touched it) it drops to one read every thirty seconds: an editor left open
 * on a second screen all afternoon was 360 function calls an hour for
 * nothing. Changed on purpose (the owner: lower Vercel costs). The person at
 * the screen still sees a push within seconds, because coming back to the
 * tab, the pointer coming back over it, or a press or key in it all return
 * to the quick end at once.
 */
export const POLL_ACTIVE_MS = 3_000
export const POLL_BASE_MS = 5_000
export const POLL_MAX_MS = 10_000
/** Quiet for this long, the editor counts as left alone. */
export const POLL_IDLE_AFTER_MS = 2 * 60_000
/** How often an editor left alone asks. */
export const POLL_IDLE_MS = 30_000

/**
 * `quietMs` is how long since a change last arrived or the person last came
 * back to the editor or used it. Leave it out for the quick cadence alone.
 */
export function nextPollDelay(previous: number, changesArrived: boolean, quietMs = 0): number {
  if (changesArrived) return POLL_ACTIVE_MS
  if (quietMs >= POLL_IDLE_AFTER_MS) return POLL_IDLE_MS
  return Math.min(POLL_MAX_MS, Math.max(POLL_BASE_MS, Math.round(previous * 1.6)))
}

/**
 * ===========================================================================
 *  ONE LINE PER CHANGE, IN WORDS
 * ===========================================================================
 * The log holds a path and whether the file was new. The notice says what a
 * person would: "New section: Pricing", "Hero section updated". The name is
 * the section's own, read from its schema by the caller, or the file's name
 * when it has none yet.
 */
export interface ActivityEvent {
  id: number
  agent_name: string
  /** sections/<type>.storelib for a file, pages/<key> for a page change. */
  path: string
  action: "created" | "updated" | "page" | "page_created"
  created_at?: string
  /**
   * A page change carries its operations, the same ones Storelib AI streams
   * (lib/website-builder/agent/operations.ts). A new file an agent already
   * placed on a page carries placed, so the builder does not place it twice.
   * A page or the settings rewritten whole (a push to the linked GitHub
   * repository) carries replaced and no operations: the builder reads it
   * again from the draft.
   */
  detail?: { placed?: boolean; page?: string; ops?: ThemeOp[]; replaced?: boolean } | null
}

/**
 * What an open builder does with an agent's page change.
 *
 * The change is already saved to the draft. The builder is holding its own
 * copy of the page and would save that copy over it on its next autosave,
 * so it replays the same operations into what it holds: on the page it is
 * showing, all of them; on any other page, only the theme's, because that
 * page is read fresh from the draft when it is opened. A new page is added
 * to the page list.
 */
export function pageEventPlan(ev: ActivityEvent, currentPage: string): { pageOps: ThemeOp[]; themeOps: ThemeOp[]; newPage: string | null } {
  const none = { pageOps: [] as ThemeOp[], themeOps: [] as ThemeOp[], newPage: null as string | null }
  if (ev.action !== "page" && ev.action !== "page_created") return none
  const page = ev.detail?.page ?? /^pages\/([a-z0-9-]+)$/.exec(ev.path)?.[1] ?? null
  const ops = Array.isArray(ev.detail?.ops) ? (ev.detail!.ops as ThemeOp[]) : []
  const themeOps = ops.filter((o) => o?.kind === "update_theme")
  const pageOps = page === currentPage ? ops.filter((o) => o && o.kind !== "update_theme") : []
  return { pageOps, themeOps, newPage: ev.action === "page_created" ? page : null }
}

export function sectionTypeOf(path: string): string | null {
  return /^sections\/([a-z0-9_-]+)\.storelib$/.exec(path)?.[1] ?? null
}

function titleFromType(type: string): string {
  const words = type.replace(/[-_]+/g, " ").trim()
  return words ? words[0].toUpperCase() + words.slice(1) : type
}

export function describeChange(event: ActivityEvent, nameOf: (type: string) => string | undefined): string {
  const type = sectionTypeOf(event.path)
  const page = /^pages\/([a-z0-9-]+)$/.exec(event.path)?.[1]
  if (page) {
    if (event.action === "page_created") return `New page: ${titleFromType(page)}`
    const n = event.detail?.ops?.length ?? 0
    return `${page === "home" ? "Home page" : titleFromType(page)} changed${n > 1 ? `, ${n} edits` : ""}`
  }
  if (!type) {
    if (/settings/i.test(event.path)) return "Theme settings changed"
    /* A page's template from a GitHub push (lib/github-sync/sync.ts). */
    const template = /^templates\/([A-Za-z0-9_.-]+)\.json$/.exec(event.path)?.[1]
    if (template) return event.action === "created" ? `New page: ${titleFromType(template)}` : `${template === "home" ? "Home page" : titleFromType(template)} changed`
    return `${event.path} changed`
  }
  const name = (nameOf(type) ?? titleFromType(type)).trim()
  if (event.action === "created") return `New section: ${name}`
  return /\bsection$/i.test(name) ? `${name} updated` : `${name} section updated`
}
