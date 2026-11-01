/**
 * ===========================================================================
 *  ONE SECTION'S MARKUP NEVER TAKES THE REST OF THE PAGE WITH IT
 * ===========================================================================
 * A browser reads a page as one stream. A section that leaves a <template>,
 * a <textarea>, a <script>, a <style> or a comment open does not fail on
 * its own: everything after it is read into that element. The sections
 * below it vanish, and so does what Storelib prints at the end of the body
 * (the builder's canvas bridge, so nothing can be selected or added).
 *
 * On 1 Nov 2026 that was the owner's whole editor: Materia's FAQ section
 * left a `<template data-faq-icons>` open (./theme.ts, compatTemplateEnd),
 * and the footer, the phone's tab bar and the canvas bridge were all inside
 * it, in the canvas and on the live site alike.
 *
 * So each section's markup is closed off where it ends: what it left open is
 * closed there, and the section says so in its errors. It is read the way a
 * browser reads it, tag by tag: a `<!--` inside a tag's attributes (Materia's
 * products grid has several) is not a comment, and text inside a <script>
 * is not markup. A closing tag that was not needed after all is one the
 * browser ignores, so a section that was whole is never changed.
 */

/* Elements whose text a browser reads up to their own closing tag, nothing else. A <noscript> is one wherever scripts run (the canvas). */
const RAW = new Set(["script", "style", "textarea", "title", "xmp", "iframe", "noembed", "noframes", "noscript"])

/** The start of the error a section carries when it left an element open: what the builder reports. */
export const SEALED_NOTE = "This section left open:"

export interface Sealed {
  html: string
  /** What the markup left open ("<template>", "<textarea>", "a comment"); empty when it was whole. */
  closed: string[]
}

const isLetter = (c: number) => (c >= 65 && c <= 90) || (c >= 97 && c <= 122)

/** Where the tag opened at `at` ends (just past its `>`), quoted attribute values read as values; -1 when it never does. */
function tagEnd(html: string, at: number): number {
  let quote = 0
  let afterEq = false
  for (let i = at + 1; i < html.length; i++) {
    const c = html.charCodeAt(i)
    if (quote) {
      if (c === quote) quote = 0
      continue
    }
    if (c === 62 /* > */) return i + 1
    if (afterEq && (c === 34 || c === 39)) {
      quote = c
      afterEq = false
      continue
    }
    if (c === 61 /* = */) afterEq = true
    else if (c !== 32 && c !== 9 && c !== 10 && c !== 13 && c !== 12) afterEq = false
  }
  return -1
}

export function sealMarkup(html: string): Sealed {
  if (!html || html.indexOf("<") < 0) return { html, closed: [] }
  const closed: string[] = []
  let templates = 0
  let tail = ""
  let i = 0
  while ((i = html.indexOf("<", i)) >= 0) {
    if (html.startsWith("<!--", i)) {
      const end = html.indexOf("-->", i + 4)
      if (end < 0) {
        closed.push("a comment")
        tail = "-->"
        break
      }
      i = end + 3
      continue
    }
    const next = html.charCodeAt(i + 1)
    const closing = next === 47 /* / */
    if (!isLetter(closing ? html.charCodeAt(i + 2) : next)) {
      /* `<!doctype`, `<?…`: to their `>`. A `<` before anything else is text. */
      if (next === 33 || next === 63) {
        const end = html.indexOf(">", i)
        i = end < 0 ? html.length : end + 1
      } else i++
      continue
    }
    let j = i + (closing ? 2 : 1)
    while (j < html.length && /[A-Za-z0-9-]/.test(html[j])) j++
    const name = html.slice(i + (closing ? 2 : 1), j).toLowerCase()
    const end = tagEnd(html, j - 1)
    if (end < 0) {
      /* The tag itself never ends: the rest of the page would be its attributes. */
      closed.push(`a <${name}> tag`)
      tail = ">"
      if (!closing && RAW.has(name)) tail += `</${name}>`
      break
    }
    i = end
    if (name === "template") {
      if (closing) templates = Math.max(0, templates - 1)
      else templates++
      continue
    }
    if (closing || !RAW.has(name)) continue
    const close = new RegExp(`</${name}(?=[\\s/>])`, "gi")
    close.lastIndex = i
    const shut = close.exec(html)
    if (!shut) {
      closed.push(`<${name}>`)
      tail = `</${name}>`
      break
    }
    const after = html.indexOf(">", shut.index)
    i = after < 0 ? html.length : after + 1
  }
  if (templates > 0) closed.push(templates === 1 ? "<template>" : `${templates} <template>s`)
  if (!closed.length) return { html, closed }
  return { html: `${html}${tail}${"</template>".repeat(templates)}`, closed }
}
