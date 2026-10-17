/**
 * Template text helpers shared by the checks that read a section's markup
 * (./integration.ts, ./settings-coverage.ts). Pure.
 */

/**
 * The template with its editor-only branches taken out. A line that asks the
 * creator to add something ({% if page.in_editor %}Add questions...) is shown
 * in the builder and never to a visitor, so it is not content to make editable.
 */
export function withoutEditorBranches(template: string): string {
  const tags = /\{%-?\s*(if|elsif|else|endif|for|endfor|unless|endunless)\b([^%]*)%\}/g
  let out = ""
  let last = 0
  let skipDepth = -1
  let depth = 0
  for (const m of template.matchAll(tags)) {
    const [whole, tag, rest] = m
    const at = m.index ?? 0
    if (skipDepth === -1) out += template.slice(last, at)
    last = at + whole.length
    const editor = /page\.in_editor/.test(rest) && !/not|!=|==\s*false/.test(rest)
    if (tag === "if" || tag === "for" || tag === "unless") {
      depth++
      if (skipDepth === -1 && tag === "if" && editor) skipDepth = depth
    } else if (tag === "elsif" || tag === "else") {
      if (skipDepth === depth) skipDepth = -1
      if (skipDepth === -1 && tag === "elsif" && editor) skipDepth = depth
    } else {
      if (skipDepth === depth) skipDepth = -1
      depth--
    }
    if (skipDepth === -1) out += "\u0000"
  }
  if (skipDepth === -1) out += template.slice(last)
  return out
}
