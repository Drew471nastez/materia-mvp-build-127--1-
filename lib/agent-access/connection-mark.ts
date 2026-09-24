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

/** True while the connection acted within the last few minutes. */
export function actedRecently(mark: ConnectionMark, now: number): boolean {
  return mark.online && mark.lastActiveAt !== null && now - mark.lastActiveAt >= -60_000 && now - mark.lastActiveAt < RECENT_MS
}

/**
 * ===========================================================================
 *  HOW OFTEN AN OPEN EDITOR ASKS
 * ===========================================================================
 * Quickly while changes are arriving, so a run of edits reads as one live
 * notice; slower and slower while nothing happens, down to one small read
 * every twenty seconds. A tab coming back into view asks at once and starts
 * again from the quick end (the editor does that), so nobody waits twenty
 * seconds to see what an agent did while they were in the terminal.
 */
export const POLL_ACTIVE_MS = 3_000
export const POLL_BASE_MS = 5_000
export const POLL_MAX_MS = 20_000

export function nextPollDelay(previous: number, changesArrived: boolean): number {
  if (changesArrived) return POLL_ACTIVE_MS
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
  path: string
  action: "created" | "updated"
  created_at?: string
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
  if (!type) {
    if (/settings/i.test(event.path)) return "Theme settings changed"
    return `${event.path} changed`
  }
  const name = (nameOf(type) ?? titleFromType(type)).trim()
  if (event.action === "created") return `New section: ${name}`
  return /\bsection$/i.test(name) ? `${name} updated` : `${name} section updated`
}
