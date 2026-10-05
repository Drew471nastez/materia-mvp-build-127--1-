/**
 * What the @ picker offers (mention-input.tsx), pure so the suite reads it
 * without a browser: the @word before the caret ("@" alone is an empty
 * query, round 13) and the people offered for it, the ones on screen first.
 */
const AT = /(^|[\s(])@([a-z0-9_.-]{0,30})$/i

/** The @word being typed just before the caret, if any; "@" alone is an empty query. */
export function mentionAt(text: string, caret: number): { start: number; query: string } | null {
  const m = AT.exec(text.slice(0, caret))
  if (!m) return null
  return { start: caret - m[2].length - 1, query: m[2] }
}

/** Somebody who can be offered: a member with a username. */
export interface MentionPerson {
  id: string
  name: string
  username: string
  avatarUrl: string | null
}

/** The nearby people that fit what was typed, then the server's, each person once, six at most. */
export function mentionChoices(query: string, nearby: MentionPerson[], found: MentionPerson[], max = 6): MentionPerson[] {
  const q = query.toLowerCase()
  const fits = (p: MentionPerson) => !q || p.username.toLowerCase().startsWith(q) || p.name.toLowerCase().split(/\s+/).some((w) => w.startsWith(q))
  const out: MentionPerson[] = []
  const seen = new Set<string>()
  for (const p of [...nearby.filter(fits), ...found]) {
    if (!p.username || seen.has(p.id)) continue
    seen.add(p.id)
    out.push(p)
    if (out.length >= max) break
  }
  return out
}
