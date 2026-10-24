/**
 * ===========================================================================
 *  A TRANSLATION KEEPS WHAT IS NOT WORDS
 * ===========================================================================
 * Storelib AI is told to keep placeholders, Liquid, links, e-mail addresses
 * and HTML exactly as they are (lib/markets/translate-ai.ts). This checks
 * that it did, before anything is saved: a translation that drops a
 * "{{ customer_name }}", rewrites a link or loses a closing tag is not kept,
 * and the original goes on showing until the next try. Compared as counts,
 * not in order, since a sentence in another language may put them anywhere.
 *
 * Pure, so the press, the hourly job and the tests agree.
 */

/** The brace that closes the one at `open`, or -1. */
function closing(s: string, open: number): number {
  let depth = 0
  for (let i = open; i < s.length; i++) {
    if (s[i] === "{") depth++
    else if (s[i] === "}" && --depth === 0) return i
  }
  return -1
}

const PLURAL_CASE = /^(?:zero|one|two|few|many|other|=\d+)$/

/**
 * A plural or a select ("{count, plural, one {# day} other {# days}}"), as
 * lib/i18n/text formatMessage reads it. Its argument and its kind have to
 * come through as they are: renamed, or with "plural" translated, the
 * sentence drew a bare number or nothing. A plural's cases may differ by
 * language (Polish has few and many), but each must be a plural category
 * and "other" must be there; a select keeps its own values. What is inside
 * the cases is checked as one set for the argument, since a language with
 * more cases repeats it more often.
 */
function icuArguments(text: string, add: (k: string) => void): string {
  let out = ""
  let i = 0
  while (i < text.length) {
    const open = text.indexOf("{", i)
    if (open < 0) break
    const end = closing(text, open)
    const head = end > open ? text.slice(open + 1, end).match(/^\s*([A-Za-z_][\w.]*)\s*,\s*([A-Za-z]+)\s*(?:,([\s\S]*))?$/) : null
    if (!head) {
      out += text.slice(i, open + 1)
      i = open + 1
      continue
    }
    const [, name, type, body = ""] = head
    add(`icu:${name},${type}`)
    if (type === "plural" || type === "selectordinal" || type === "select") {
      const keys: string[] = []
      const inner = new Set<string>()
      let j = 0
      const b = body.replace(/^\s*offset:\d+\s*/, "")
      while (j < b.length) {
        const m = b.slice(j).match(/^\s*([^\s{}]+)\s*\{/)
        if (!m) break
        const caseOpen = j + m[0].length - 1
        const caseEnd = closing(b, caseOpen)
        if (caseEnd < 0) break
        keys.push(m[1])
        for (const k of fixedParts(b.slice(caseOpen + 1, caseEnd)).keys()) inner.add(k)
        j = caseEnd + 1
      }
      const rest = b.slice(j).trim()
      if (type === "select") for (const k of keys) add(`icu-case:${name}=${k}`)
      else if (!keys.includes("other") || keys.some((k) => !PLURAL_CASE.test(k)) || rest) add(`icu-broken:${name}:${keys.join("|")}:${rest}`)
      for (const k of inner) add(`in:${name}:${k}`)
    }
    out += text.slice(i, open) + " "
    i = end + 1
  }
  return out + text.slice(i)
}

/** Everything in a text that must come through a translation unchanged, counted. */
export function fixedParts(text: string): Map<string, number> {
  const out = new Map<string, number>()
  const add = (k: string) => out.set(k, (out.get(k) ?? 0) + 1)
  let rest = icuArguments(String(text ?? ""), add)
  /* Liquid output and tags, and placeholders in double braces, whitespace inside them aside. */
  rest = rest.replace(/\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/g, (m) => {
    add(`liquid:${m.replace(/\s+/g, "")}`)
    return " "
  })
  /* Single brace placeholders, "{name}". */
  rest = rest.replace(/\{[A-Za-z_][\w.]*\}/g, (m) => {
    add(`slot:${m}`)
    return " "
  })
  /* Tags by name (attributes compared below, where they matter), and the addresses tags point at. */
  for (const m of rest.matchAll(/<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>/g)) {
    add(`tag:${m[1]}${m[2].toLowerCase()}`)
    for (const a of m[3].matchAll(/\b(href|src)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi)) add(`attr:${a[1].toLowerCase()}=${a[3] ?? a[4] ?? a[5]}`)
  }
  /* A sentence's links written as [words] (the checkout's "I agree to the [Terms and Conditions]"): as many as the original has. */
  for (const _ of rest.matchAll(/\[[^\]\n]+\]/g)) add("bracket")
  const words = rest.replace(/<[^>]*>/g, " ")
  for (const m of words.matchAll(/\bhttps?:\/\/[^\s"'<>]+/g)) add(`url:${m[0].replace(/[.,;:!?)]+$/, "")}`)
  for (const m of words.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) add(`email:${m[0].toLowerCase()}`)
  return out
}

/** True when a translation has exactly the original's placeholders, Liquid, tags, links and addresses. */
export function keepsFixedParts(source: string, translated: string): boolean {
  const a = fixedParts(source)
  const b = fixedParts(translated)
  if (a.size !== b.size) return false
  for (const [k, n] of a) if (b.get(k) !== n) return false
  return true
}
