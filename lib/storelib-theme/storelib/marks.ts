/**
 * ===========================================================================
 *  WHICH SETTING DREW THIS, FOR THE EDITOR ONLY
 * ===========================================================================
 * Click a heading on the canvas and the sidebar opens at the Heading field.
 * For that the canvas has to know which setting an element came from, and the
 * template knows: `{{ section.settings.heading }}` is the heading.
 *
 * So while the builder draws (`page.in_editor`), every output that reads a
 * section's or a block's own setting is preceded by a mark the browser never
 * sees: two private use characters around the setting's name. Once the
 * template has been drawn, `applySettingMarks` walks the markup, gives the
 * element each mark sits in `data-sl-setting` (and `data-sl-block` for a
 * block's setting), and takes every mark out.
 *
 * A mark inside an address attribute (an image's `src`, a button's `href`)
 * names the element that attribute is on, which is how a click on a picture
 * finds its Image field. A mark anywhere else inside a tag, or inside a
 * <style> or <script>, is simply removed: a colour in a `style` attribute is
 * not what somebody clicking the section is pointing at.
 *
 * A published page is drawn without `in_editor`, so it never gets a mark,
 * and tests/builder-click-edit.test.ts holds that.
 */

export const MARK_OPEN = ""
export const MARK_CLOSE = ""
const ANY_MARK = /[]/g
const MARK = /([^]*)/g

/** Attributes whose value is the thing itself, so a mark in one names its element. */
const MARKED_ATTRIBUTES = new Set(["src", "srcset", "href", "poster", "alt", "placeholder", "value", "action"])

/** Elements with no end tag. */
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"])

/** Elements whose inside is text, never tags. Marks in them are taken out and name nothing. */
const RAW_TEXT = new Set(["script", "style", "textarea", "title", "xmp", "iframe", "noembed", "noframes", "noscript"])

export interface SettingMark {
  /** The setting's id in its schema. */
  setting: string
  /** The block it belongs to, or null for the section's own setting. */
  block: string | null
}

/** The mark written before an output. Ids are kept to characters a mark cannot be confused by. */
export function markFor(setting: string, block: string | null): string {
  const clean = (s: string) => s.replace(/[^A-Za-z0-9_\-:./]/g, "")
  return `${MARK_OPEN}${block ? `b|${clean(block)}|` : "s|"}${clean(setting)}${MARK_CLOSE}`
}

function parseMark(body: string): SettingMark | null {
  const parts = body.split("|")
  if (parts[0] === "s" && parts.length === 2 && parts[1]) return { setting: parts[1], block: null }
  if (parts[0] === "b" && parts.length === 3 && parts[1] && parts[2]) return { setting: parts[2], block: parts[1] }
  return null
}

/** Every mark taken out, for anything that must not carry one. */
export function stripMarks(s: string): string {
  return s.indexOf(MARK_OPEN) === -1 && s.indexOf(MARK_CLOSE) === -1 ? s : s.replace(MARK, "").replace(ANY_MARK, "")
}

function escapeAttr(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string)
}

/** The end of the tag that starts at `from` ("<"), quotes respected. -1 when it never ends. */
function tagEnd(html: string, from: number): number {
  let quote = ""
  for (let k = from + 1; k < html.length; k++) {
    const c = html[k]
    if (quote) {
      if (c === quote) quote = ""
      continue
    }
    if (c === '"' || c === "'") {
      /* Only a quote that opens a value: right after "=" and any spaces. */
      let p = k - 1
      while (p > from && /\s/.test(html[p])) p--
      if (html[p] === "=") quote = c
      continue
    }
    if (c === ">") return k
  }
  return -1
}

/** The attribute a position inside a tag belongs to, when it is inside a value. */
function attributeAt(tag: string, at: number): string | null {
  const before = tag.slice(0, at)
  const m = /([^\s"'=<>/`]+)\s*=\s*(?:"[^"]*|'[^']*|[^\s"'=<>`]*)$/.exec(before)
  return m ? m[1].toLowerCase() : null
}

interface Open {
  name: string
  part: number
  text: SettingMark[]
  attr: SettingMark[]
}

/**
 * The marks turned into attributes on the elements they sit in, and taken
 * out. Markup without a mark comes back as it went in.
 */
export function applySettingMarks(html: string): string {
  if (html.indexOf(MARK_OPEN) === -1) return html.indexOf(MARK_CLOSE) === -1 ? html : stripMarks(html)
  const parts: string[] = []
  const stack: Open[] = []
  const marked: Open[] = []
  const n = html.length
  let i = 0

  const textRun = (s: string) => {
    if (s.indexOf(MARK_OPEN) !== -1) {
      MARK.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = MARK.exec(s))) {
        const mark = parseMark(m[1])
        const top = stack[stack.length - 1]
        if (mark && top) top.text.push(mark)
      }
    }
    parts.push(stripMarks(s))
  }

  while (i < n) {
    const lt = html.indexOf("<", i)
    if (lt === -1) {
      textRun(html.slice(i))
      break
    }
    if (lt > i) textRun(html.slice(i, lt))
    i = lt
    if (html.startsWith("<!--", i)) {
      const close = html.indexOf("-->", i + 4)
      const end = close === -1 ? n : close + 3
      parts.push(stripMarks(html.slice(i, end)))
      i = end
      continue
    }
    const closing = html[i + 1] === "/"
    const nameAt = closing ? i + 2 : i + 1
    if (!/[A-Za-z]/.test(html[nameAt] ?? "")) {
      parts.push("<")
      i += 1
      continue
    }
    const end = tagEnd(html, i)
    if (end === -1) {
      parts.push(stripMarks(html.slice(i)))
      break
    }
    let k = nameAt
    while (k < end && !/[\s/>]/.test(html[k])) k++
    const name = html.slice(nameAt, k).toLowerCase()
    const raw = html.slice(i, end + 1)
    i = end + 1

    if (closing) {
      parts.push(stripMarks(raw))
      for (let s = stack.length - 1; s >= 0; s--) {
        if (stack[s].name === name) {
          stack.length = s
          break
        }
      }
      continue
    }

    /* The marks inside this tag: an address names the tag, anything else is dropped. */
    const own: SettingMark[] = []
    if (raw.indexOf(MARK_OPEN) !== -1) {
      MARK.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = MARK.exec(raw))) {
        const mark = parseMark(m[1])
        const attr = attributeAt(raw, m.index)
        if (mark && attr && MARKED_ATTRIBUTES.has(attr)) own.push(mark)
      }
    }
    const entry: Open = { name, part: parts.length, text: [], attr: own }
    parts.push(stripMarks(raw))
    if (own.length) marked.push(entry)

    if (RAW_TEXT.has(name)) {
      const closeAt = html.toLowerCase().indexOf(`</${name}`, i)
      const stop = closeAt === -1 ? n : closeAt
      parts.push(stripMarks(html.slice(i, stop)))
      i = stop
      continue
    }
    const selfClosing = /\/\s*>$/.test(raw)
    if (!VOID.has(name) && !selfClosing) {
      stack.push(entry)
      if (!own.length) marked.push(entry)
    }
  }

  for (const el of marked) {
    const mark = el.text[0] ?? el.attr[0]
    if (!mark) continue
    const tag = parts[el.part]
    if (/\sdata-sl-setting\s*=/i.test(tag)) continue
    const attrs = ` data-sl-setting="${escapeAttr(mark.setting)}"${mark.block ? ` data-sl-block="${escapeAttr(mark.block)}"` : ""}`
    parts[el.part] = tag.replace(/\s*(\/?)>$/, (_m, slash: string) => `${attrs}${slash ? " /" : ""}>`)
  }
  return parts.join("")
}
