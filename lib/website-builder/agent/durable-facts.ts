/**
 * ===========================================================================
 *  WHAT THE CREATOR SAID THAT IS STILL TRUE NEXT WEEK
 * ===========================================================================
 * "Make the hero darker, I never want gradients" holds two things: a change,
 * done this run, and a preference, true of every run after it. The model was
 * asked to keep the second with its remember tool, and mostly did not: the
 * change was the job, and the aside was forgotten with the conversation.
 *
 * So the plain shapes of a lasting preference or fact are read here, in code,
 * from the creator's own words, and kept in AI Memory for this website after
 * a run that went through (app/api/website-builder/themes/[installId]/agent):
 *
 *   "I never want gradients", "we don't like stock photos"   a dislike
 *   "always use rounded buttons", "I prefer serif headings"  a preference
 *   "our brand colour is #1f3a2b", "my font is Fraunces"      a brand fact
 *   "the shop is called Bandidos", "we sell handmade candles" a business fact
 *   "remember that prices are in euros"                       asked outright
 *
 * Only what is plainly about the brand or a standing rule. "I like this" is
 * about the page in front of them and is never kept. The chat says each note
 * it keeps ("Remembered: ...", with Undo), so a wrong one is one tap away.
 *
 * Pure: tests/round-bc-aiagent.test.ts.
 */

export const MAX_FACTS_PER_RUN = 3

/* About the page in front of them, not about the brand: "I like this", "I don't like it", "I love the new hero". */
const DEICTIC = /^(?:this|that|it|these|those|the (?:new|old|current|last|previous|way)|how|what you|your|here|there)\b/i

function tidy(x: string): string {
  return x
    .replace(/\s+/g, " ")
    .replace(/^(?:to\s+)?(?:see|have|use|any|having|using)\s+/i, "")
    .replace(/\s+(?:please|thanks|thank you|on (?:the|my) (?:site|website|page))$/i, "")
    .replace(/[\s,;:.!]+$/, "")
    .trim()
}

function ok(x: string): boolean {
  return x.length >= 3 && x.length <= 120 && !DEICTIC.test(x) && !/\b(?:this|that) (?:section|one|page)\b/i.test(x)
}

const sentence = (s: string) => `${s.charAt(0).toUpperCase()}${s.slice(1)}.`

type Rule = { re: RegExp; note: (m: RegExpMatchArray) => string | null }

const RULES: Rule[] = [
  /* Asked outright. */
  { re: /\b(?:please\s+)?remember(?:\s+that)?\s*[:,]?\s+(.{4,160})/i, note: (m) => (ok(tidy(m[1])) ? sentence(tidy(m[1])) : null) },
  /* Dislikes, as a standing rule. */
  { re: /\b(?:i|we)\s+(?:really\s+)?(?:never|don'?t ever|do not ever)\s+(?:want|like|use)\s+(.{3,120}?)(?=[.!?;]|,\s*(?:and|but|so|then|please|make|change|add|put|use|remove|turn|give|set)\b|$)/i, note: (m) => (ok(tidy(m[1])) ? `Never use ${tidy(m[1])}.` : null) },
  { re: /\b(?:i|we)\s+(?:really\s+)?(?:hate|dislike|can'?t stand|am not a fan of|are not fans of|don'?t like|do not like)\s+(.{3,120}?)(?=[.!?;]|,\s*(?:and|but|so|then|please|make|change|add|put|use|remove|turn|give|set)\b|$)/i, note: (m) => (ok(tidy(m[1])) && !/^(?:it|this|that)\b/i.test(tidy(m[1])) ? `Does not like ${tidy(m[1])}.` : null) },
  { re: /(?:^|[.!?]\s+|,\s*)(?:and\s+)?(?:never|no more|please never|don'?t ever)\s+(use|add|put|show|make)\s+(.{3,120}?)(?=[.!?;]|,\s*(?:and|but|so|then|please|make|change|add|put|use|remove|turn|give|set)\b|$)/i, note: (m) => (ok(tidy(m[2])) ? `Never ${m[1].toLowerCase()} ${tidy(m[2])}.` : null) },
  /* Preferences. */
  { re: /(?:^|[.!?]\s+|,\s*)(?:and\s+)?(?:please\s+)?always\s+(use|keep|make|put|add|show|write)\s+(.{3,120}?)(?=[.!?;]|,\s*(?:and|but|so|then|please|make|change|add|put|use|remove|turn|give|set)\b|$)/i, note: (m) => (ok(tidy(m[2])) ? `Always ${m[1].toLowerCase()} ${tidy(m[2])}.` : null) },
  { re: /\b(?:i|we)\s+(?:always\s+)?prefer\s+(.{3,120}?)(?=[.!?;]|,\s*(?:and|but|so|then|please|make|change|add|put|use|remove|turn|give|set)\b|$)/i, note: (m) => (ok(tidy(m[1])) ? `Prefers ${tidy(m[1])}.` : null) },
  /* Brand facts. */
  { re: /\b(?:our|my|the)\s+brand(?:'s)?\s+colou?rs?\s+(?:is|are)\s+(.{3,80}?)(?=[.!?;]|,\s*(?:and|but|so|then|please|make|change|add|put|use|remove|turn|give|set)\b|$)/i, note: (m) => (ok(tidy(m[1])) ? `Brand colours: ${tidy(m[1])}.` : null) },
  { re: /\b(?:our|my|the)\s+(?:main|primary|accent)\s+colou?r\s+is\s+(.{3,60}?)(?=[.!?;]|,\s*(?:and|but|so|then|please|make|change|add|put|use|remove|turn|give|set)\b|$)/i, note: (m) => (ok(tidy(m[1])) ? `${m[0].match(/main|primary|accent/i)![0].replace(/^./, (c) => c.toUpperCase())} colour: ${tidy(m[1])}.` : null) },
  { re: /\b(?:our|my|the)\s+(?:brand\s+)?(?:font|typeface)s?\s+(?:is|are)\s+(.{3,60}?)(?=[.!?;]|,\s*(?:and|but|so|then|please|make|change|add|put|use|remove|turn|give|set)\b|$)/i, note: (m) => (ok(tidy(m[1])) ? `Brand font: ${tidy(m[1])}.` : null) },
  { re: /\b(?:our|my|the)\s+(?:brand|business|store|shop|company|studio|website|site)\s+(?:is called|is named|name is)\s+["“]?([^".!?,;”]{2,60})/i, note: (m) => (ok(tidy(m[1])) ? `The business is called ${tidy(m[1])}.` : null) },
  { re: /\b(?:our|my)\s+(?:tone|voice|tone of voice)\s+is\s+(.{3,80}?)(?=[.!?;]|,\s*(?:and|but|so|then|please|make|change|add|put|use|remove|turn|give|set)\b|$)/i, note: (m) => (ok(tidy(m[1])) ? `Tone of voice: ${tidy(m[1])}.` : null) },
  { re: /\b(?:our|my)\s+(?:audience|customers|clients|buyers)\s+(?:is|are)\s+(?:mostly\s+)?(.{3,100}?)(?=[.!?;]|,\s*(?:and|but|so|then|please|make|change|add|put|use|remove|turn|give|set)\b|$)/i, note: (m) => (ok(tidy(m[1])) ? `Audience: ${tidy(m[1])}.` : null) },
  { re: /\b(?:i|we)\s+sell\s+(.{3,100}?)(?=[.!?;]|,\s*(?:and|but|so|then|please|make|change|add|put|use|remove|turn|give|set)\b|$)/i, note: (m) => (ok(tidy(m[1])) ? `Sells ${tidy(m[1])}.` : null) },
  { re: /\bprices?\s+(?:are|should be|always)\s+(?:in|shown in)\s+([a-z]{3,20}|[A-Z]{3})\b/i, note: (m) => `Prices are in ${m[1]}.` },
]

/** The lasting preferences and facts in what the creator typed, as short notes, newest wording kept; at most MAX_FACTS_PER_RUN. */
export function durableFacts(prompt: string): string[] {
  const text = (prompt ?? "").replace(/\s+/g, " ").trim()
  if (!text || text.length > 3000) return []
  /* A question about a preference is not one being stated. */
  const statements = text.split(/(?<=[.!?])\s+/).filter((s) => !/\?\s*$/.test(s)).join(" ")
  const out: string[] = []
  const key = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()
  for (const rule of RULES) {
    const m = statements.match(rule.re)
    if (!m) continue
    const note = rule.note(m)
    if (note && note.length <= 200 && !out.some((o) => key(o) === key(note))) out.push(note)
    if (out.length >= MAX_FACTS_PER_RUN) break
  }
  return out
}
