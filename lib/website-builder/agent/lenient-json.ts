/**
 * ===========================================================================
 *  A TOOL CALL THAT IS ALMOST JSON IS READ, NOT REFUSED
 * ===========================================================================
 * The model writes every tool call as JSON, and settings as JSON inside a
 * string. Three slips came back as "The arguments were not JSON" and a turn
 * spent sending the same thing again: a fence around it (```json ... ```), a
 * comma before a closing brace, and curly quotes from copy it had just
 * written. A fourth: settings sent as an object where a string was asked for.
 * Each is unambiguous, so each is repaired here and the call goes through.
 *
 * What is NOT repaired: JSON that stops part way. That is a reply cut off at
 * the output limit, and guessing its end would apply half a change. The loop
 * asks for that turn again instead (./loop.ts, `turn.stop === "length"`).
 *
 * Pure: tests/round-bc-aiagent.test.ts runs every slip through it.
 */

function attempt(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch {
    return { ok: false }
  }
}

/** Trailing commas, outside strings only, so a comma in someone's copy is never touched. */
function dropTrailingCommas(text: string): string {
  let out = ""
  let inString = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      out += ch
      if (ch === "\\") {
        out += text[i + 1] ?? ""
        i++
      } else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      out += ch
      continue
    }
    if (ch === ",") {
      let j = i + 1
      while (j < text.length && /\s/.test(text[j])) j++
      if (text[j] === "}" || text[j] === "]") continue
    }
    out += ch
  }
  return out
}

/** The value, read as leniently as is safe, or undefined when it is not JSON at all. */
export function lenientParse(text: string): unknown {
  const raw = text.trim()
  if (!raw) return undefined
  const first = attempt(raw)
  if (first.ok) return first.value
  let fixed = raw.replace(/^```(?:json|JSON)?\s*\n?/, "").replace(/\n?```\s*$/, "").trim()
  const unfenced = attempt(fixed)
  if (unfenced.ok) return unfenced.value
  fixed = dropTrailingCommas(fixed)
  const uncomma = attempt(fixed)
  if (uncomma.ok) return uncomma.value
  /* Curly quotes used AS the JSON's quotes: only when nothing else is quoting, or the copy's own apostrophes would move. */
  if (!fixed.includes('"') && /[“”]/.test(fixed)) {
    const straight = attempt(fixed.replace(/[“”]/g, '"'))
    if (straight.ok) return straight.value
  }
  return undefined
}

/**
 * A tool call's arguments as the JSON the tools read: unchanged when they
 * already parse, repaired when they are one of the slips above, and null
 * when they cannot be read (the tool then says so, as it always did).
 */
export function repairArguments(argumentsJson: string): string | null {
  const text = argumentsJson ?? ""
  if (!text.trim()) return "{}"
  if (attempt(text).ok) return text
  const value = lenientParse(text)
  if (value === undefined || value === null || typeof value !== "object" || Array.isArray(value)) return null
  return JSON.stringify(value)
}

/** A settings object from a string of JSON (as asked) or an object (as sometimes sent); null when it is neither. */
export function lenientSettings(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>
  if (typeof value !== "string") return null
  if (!value.trim()) return {}
  const parsed = lenientParse(value)
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null
  return parsed as Record<string, unknown>
}
