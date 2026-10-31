/**
 * ===========================================================================
 *  robots.txt, READ THE WAY GOOGLE AND RFC 9309 READ IT
 * ===========================================================================
 * Pure. developers.google.com/search/docs/crawling-indexing/robots/robots_txt
 * and RFC 9309 (the Robots Exclusion Protocol) are the rules:
 *
 *   GROUPS    one or more user-agent lines, then the rules under them. A
 *             user-agent line after a rule starts a new group. Lines Google
 *             does not know (sitemap, crawl-delay, host) neither start nor
 *             end a group. Rules before any user-agent line belong to none.
 *   THE AGENT a crawler obeys only the most specific group naming its
 *             product token (case insensitive, anything after "/" ignored),
 *             and falls back to `*` only when no group names it. Several
 *             groups naming the same agent are one group. A crawler with a
 *             family (Googlebot-Image) is given its tokens most specific
 *             first, and the first that has a group wins.
 *   MATCHING  a rule's path is matched from the start of the path and query.
 *             `*` is any run of characters, a final `$` is the end of the
 *             address. Letters are compared as written (case matters), and
 *             percent escapes and non ASCII are compared in one normal form.
 *   PRECEDENCE the most specific rule wins, by the length of its path;
 *             on a tie Allow wins (the least restrictive). No rule that
 *             matches means allowed. An empty Disallow is no rule.
 *   /robots.txt is always allowed.
 */

export interface RobotsRule {
  allow: boolean
  path: string
}

export interface RobotsGroup {
  agents: string[]
  rules: RobotsRule[]
}

export interface ParsedRobots {
  groups: RobotsGroup[]
  sitemaps: string[]
}

/** The token a user-agent line names: "Googlebot/2.1" is googlebot. */
function agentToken(value: string): string {
  return value.split("/")[0].trim().toLowerCase()
}

/**
 * One normal form for comparing paths: every percent escape upper case, and
 * every character outside printable ASCII percent encoded as UTF-8. So
 * "/caf%c3%a9", "/caf%C3%A9" and "/café" are the same path, as RFC 9309 asks.
 */
export function normalizeRobotsPath(path: string): string {
  let out = ""
  for (let i = 0; i < path.length; i++) {
    const c = path[i]
    if (c === "%" && /^[0-9a-fA-F]{2}$/.test(path.slice(i + 1, i + 3))) {
      out += `%${path.slice(i + 1, i + 3).toUpperCase()}`
      i += 2
      continue
    }
    const code = c.codePointAt(0) ?? 0
    if (code > 0x7e || code < 0x21) {
      const ch = String.fromCodePoint(code)
      if (code > 0xffff) i++
      out += [...new TextEncoder().encode(ch)].map((b) => `%${b.toString(16).toUpperCase().padStart(2, "0")}`).join("")
      continue
    }
    out += c
  }
  return out
}

export function parseRobots(txt: string): ParsedRobots {
  const groups: RobotsGroup[] = []
  const sitemaps: string[] = []
  let current: RobotsGroup | null = null
  let collectingAgents = false
  for (const raw of txt.replace(/^﻿/, "").split(/\r\n|\r|\n/)) {
    const line = raw.replace(/#.*$/, "").trim()
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line)
    if (!m) continue
    const key = m[1].toLowerCase()
    const value = m[2].trim()
    if (key === "user-agent") {
      if (!current || !collectingAgents) {
        current = { agents: [], rules: [] }
        groups.push(current)
      }
      if (value) current.agents.push(agentToken(value))
      collectingAgents = true
    } else if (key === "allow" || key === "disallow") {
      collectingAgents = false
      /* An empty Disallow allows everything; an empty Allow says nothing. Either way, no rule. */
      if (current && value) current.rules.push({ allow: key === "allow", path: value })
    } else if (key === "sitemap") {
      if (value) sitemaps.push(value)
    }
    /* Anything else (crawl-delay, host, a typo) is ignored and changes nothing. */
  }
  return { groups, sitemaps }
}

/** The rules a crawler obeys: its own groups merged, or `*`'s, or none. */
export function rulesFor(parsed: ParsedRobots, agents: string | string[]): { rules: RobotsRule[]; group: string | null } {
  const tokens = (Array.isArray(agents) ? agents : [agents]).map(agentToken)
  for (const token of tokens) {
    const own = parsed.groups.filter((g) => g.agents.includes(token))
    if (own.length) return { rules: own.flatMap((g) => g.rules), group: token }
  }
  const star = parsed.groups.filter((g) => g.agents.includes("*"))
  return star.length ? { rules: star.flatMap((g) => g.rules), group: "*" } : { rules: [], group: null }
}

/** Whether a rule's path matches a path (with its query). */
export function ruleMatches(rulePath: string, pathWithQuery: string): boolean {
  const anchored = rulePath.endsWith("$")
  const body = normalizeRobotsPath(anchored ? rulePath.slice(0, -1) : rulePath)
  const target = normalizeRobotsPath(pathWithQuery)
  const parts = body.split("*")
  /* Matched piece by piece, never with a regular expression built from the file: a hostile robots.txt cannot make it slow. */
  if (!target.startsWith(parts[0])) return false
  if (parts.length === 1) return anchored ? target === parts[0] : true
  let at = parts[0].length
  for (let i = 1; i < parts.length; i++) {
    const piece = parts[i]
    const last = i === parts.length - 1
    if (last && anchored) {
      return target.length - piece.length >= at && target.endsWith(piece)
    }
    if (!piece) continue
    const found = target.indexOf(piece, at)
    if (found < 0) return false
    at = found + piece.length
  }
  return true
}

export interface RobotsVerdict {
  allowed: boolean
  /** The rule that decided it, or null when none matched. */
  rule: RobotsRule | null
  /** The group obeyed: the agent's token, "*", or null when the file has neither. */
  group: string | null
}

/** Whether a crawler may fetch a path, and the rule that says so. */
export function robotsVerdict(txt: string | ParsedRobots, pathWithQuery: string, agents: string | string[]): RobotsVerdict {
  const parsed = typeof txt === "string" ? parseRobots(txt) : txt
  const path = pathWithQuery.startsWith("/") ? pathWithQuery : `/${pathWithQuery}`
  const { rules, group } = rulesFor(parsed, agents)
  if (path === "/robots.txt") return { allowed: true, rule: null, group }
  let best: RobotsRule | null = null
  for (const r of rules) {
    if (!ruleMatches(r.path, path)) continue
    if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow && !best.allow)) best = r
  }
  return { allowed: best ? best.allow : true, rule: best, group }
}

export function robotsAllowed(txt: string | ParsedRobots, pathWithQuery: string, agents: string | string[]): boolean {
  return robotsVerdict(txt, pathWithQuery, agents).allowed
}
