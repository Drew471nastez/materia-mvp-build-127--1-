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

/** Everything in a text that must come through a translation unchanged, counted. */
export function fixedParts(text: string): Map<string, number> {
  const out = new Map<string, number>()
  const add = (k: string) => out.set(k, (out.get(k) ?? 0) + 1)
  let rest = String(text ?? "")
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
