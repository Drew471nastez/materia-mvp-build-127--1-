/**
 * ===========================================================================
 *  A PLAIN STORY THAT WAS WRITTEN IN MARKDOWN, READ AS WHAT IT SAYS
 * ===========================================================================
 * Wave 10, the owner's screenshot of a creator page: the About story printed
 * "# Storelib — Complete Contacts, Forms, Emails & Community Integration",
 * the hash and all, with a blank line's gap between every paragraph. Stories
 * written in the editor arrive as markup and go through cleanStoredHtml; a
 * story typed or pasted as plain text (the older field, the builder, an AI
 * draft) was drawn `whitespace-pre-wrap`, so its Markdown showed as symbols.
 *
 * This reads the small part of Markdown people actually type into a bio:
 *
 *   # Heading, ## Heading       a heading, a size under the section's own
 *   - item, * item, + item      a bulleted list
 *   1. item                     a numbered list
 *   > words                     a quote
 *   ---                         a rule
 *   blank line                  a new paragraph (any number of them is one)
 *   **bold**, __bold__, *em*, _em_, `code`, [words](https://…)
 *
 * NOTHING HERE IS HTML. The result is a tree of plain values that
 * components/store-builder/story-text.tsx turns into React elements, so a
 * "<script>" in a story is text on the page, never markup, and a link is only
 * ever http(s) or mailto.
 */

export type Inline =
  | { t: "text"; v: string }
  | { t: "strong"; c: Inline[] }
  | { t: "em"; c: Inline[] }
  | { t: "code"; v: string }
  | { t: "link"; href: string; c: Inline[] }
  | { t: "br" }

export type Block =
  | { t: "h"; level: 3 | 4; c: Inline[] }
  | { t: "p"; c: Inline[] }
  | { t: "ul"; items: Inline[][] }
  | { t: "ol"; items: Inline[][] }
  | { t: "quote"; c: Inline[] }
  | { t: "hr" }

/** Only these leave the page from a story: a web address or an email. */
export function safeHref(raw: string): string | null {
  const href = raw.trim()
  if (/^https?:\/\/[^\s<>"']+$/i.test(href)) return href
  if (/^mailto:[^\s<>"']+$/i.test(href)) return href
  return null
}

const INLINE = /(\*\*|__)(?=\S)([\s\S]+?)(?<=\S)\1|(\*|_)(?=\S)([\s\S]+?)(?<=\S)\3|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/

/** Bold, emphasis, code and links in one line of text; anything else is the text itself. */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = []
  let rest = text
  while (rest) {
    const m = INLINE.exec(rest)
    if (!m) {
      out.push({ t: "text", v: rest })
      break
    }
    /* An underscore inside a word (snake_case, my_shop) is not emphasis. */
    if (m[3] === "_" && m.index > 0 && /\w/.test(rest[m.index - 1])) {
      out.push({ t: "text", v: rest.slice(0, m.index + 1) })
      rest = rest.slice(m.index + 1)
      continue
    }
    if (m.index > 0) out.push({ t: "text", v: rest.slice(0, m.index) })
    if (m[1]) out.push({ t: "strong", c: parseInline(m[2]) })
    else if (m[3]) out.push({ t: "em", c: parseInline(m[4]) })
    else if (m[5] !== undefined) out.push({ t: "code", v: m[5] })
    else {
      const href = safeHref(m[7])
      out.push(href ? { t: "link", href, c: parseInline(m[6]) } : { t: "text", v: m[6] })
    }
    rest = rest.slice(m.index + m[0].length)
  }
  return merge(out)
}

function merge(list: Inline[]): Inline[] {
  const out: Inline[] = []
  for (const x of list) {
    const last = out[out.length - 1]
    if (x.t === "text" && last?.t === "text") last.v += x.v
    else if (!(x.t === "text" && x.v === "")) out.push(x)
  }
  return out
}

/** Lines of one paragraph, each line break kept as a break. */
function lines(ls: string[]): Inline[] {
  const out: Inline[] = []
  ls.forEach((l, i) => {
    if (i) out.push({ t: "br" })
    out.push(...parseInline(l.trim()))
  })
  return merge(out)
}

const HEADING = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/
const BULLET = /^\s{0,3}[-*+]\s+(.*)$/
const NUMBER = /^\s{0,3}\d{1,3}[.)]\s+(.*)$/
const QUOTE = /^\s{0,3}>\s?(.*)$/
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/

export function parseStory(text: string): Block[] {
  const src = (text || "").replace(/\r\n?/g, "\n").split("\n")
  const out: Block[] = []
  let para: string[] = []
  const flush = () => {
    if (para.length) out.push({ t: "p", c: lines(para) })
    para = []
  }
  for (let i = 0; i < src.length; i++) {
    const line = src[i]
    if (!line.trim()) {
      flush()
      continue
    }
    let m: RegExpExecArray | null
    if (RULE.test(line) && !para.length) {
      out.push({ t: "hr" })
      continue
    }
    if ((m = HEADING.exec(line))) {
      flush()
      out.push({ t: "h", level: m[1].length <= 1 ? 3 : 4, c: parseInline(m[2]) })
      continue
    }
    if (BULLET.test(line) || NUMBER.test(line)) {
      flush()
      const ordered = !BULLET.test(line)
      const re = ordered ? NUMBER : BULLET
      const items: Inline[][] = []
      while (i < src.length && re.test(src[i])) {
        items.push(parseInline((re.exec(src[i]) as RegExpExecArray)[1].trim()))
        i++
      }
      i--
      out.push(ordered ? { t: "ol", items } : { t: "ul", items })
      continue
    }
    if (QUOTE.test(line)) {
      flush()
      const q: string[] = []
      while (i < src.length && QUOTE.test(src[i])) {
        q.push((QUOTE.exec(src[i]) as RegExpExecArray)[1])
        i++
      }
      i--
      out.push({ t: "quote", c: lines(q.filter((x) => x.trim())) })
      continue
    }
    para.push(line)
  }
  flush()
  return out
}
