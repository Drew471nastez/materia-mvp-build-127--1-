/**
 * ===========================================================================
 *  RICH TEXT, READ AND WRITTEN THE SAME WAY EVERYWHERE
 * ===========================================================================
 * A small HTML reader and two writers over it:
 *
 *   cleanStoredHtml   a description as it may be shown: the allow list in
 *                     ./policy.ts, applied tag by tag and attribute by
 *                     attribute. The editor loads through it, and the
 *                     renderer (RichDescriptionContent) draws through it.
 *   cleanPastedHtml   a paste from Word, Google Docs or a web page, reduced
 *                     to the structure the toolbar can make: paragraphs, two
 *                     heading levels, lists, quotes, links, bold, italic,
 *                     underline, strike. Styles, classes, fonts, colours and
 *                     everything else stay behind.
 *
 * WHY NOT THE DOM. Both run where there is none: the renderer on the server,
 * and the tests in node. A description rendered on the server and again on
 * hydration has to come out byte for byte the same or React replaces it, so
 * the cleaner has to be one piece of code that does not depend on where it
 * runs. And it is small: sanitize-html is 56KB gzipped in a browser bundle,
 * which is a lot to pay on a public product page to clean one field.
 *
 * SAFE BY CONSTRUCTION, NOT BY PARSING. The reader is lenient and will not
 * always build the tree a browser would from broken markup. That cannot
 * make the output unsafe: the writers only ever emit tag names from a fixed
 * list, attribute names from a fixed list with checked values, and text with
 * every `<`, `>`, `&` and quote escaped. Whatever the reader misunderstood
 * comes out as text or not at all. The server still runs sanitize-html on
 * save (lib/rich-text/sanitize.ts), so this is never the only guard.
 */
import { decodeHtmlEntities } from "@/lib/html-entities"
import {
  ATTRIBUTE_VALUES,
  DROPPED_TAGS,
  EXTERNAL_REL,
  STORED_ATTRIBUTES,
  STORED_CLASSES,
  LEGACY_IMAGE_WRAPPERS,
  STORED_TAGS,
  TAG_ALIASES,
  VOID_TAGS,
  filterStyle,
  isExternalHref,
  parseStyle,
  safeHref,
  safeIframeSrc,
  safeImageSrc,
} from "./policy"

// ===========================================================================
//  READING
// ===========================================================================

export interface HText {
  type: "text"
  value: string
}
export interface HElement {
  type: "el"
  name: string
  attrs: Record<string, string>
  children: HNode[]
}
export type HNode = HText | HElement

/** Elements whose content is not markup; read up to their end tag and skipped. */
const RAW_TEXT = new Set(["script", "style", "textarea", "title", "xmp", "iframe", "noembed", "noframes", "noscript", "plaintext"])

/** A start tag of one of these closes an open <p>, as it does in a browser. */
const CLOSES_P = new Set([
  "address", "article", "aside", "blockquote", "center", "details", "dialog", "dir", "div", "dl", "dd", "dt",
  "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hgroup",
  "hr", "li", "main", "menu", "nav", "ol", "p", "pre", "section", "summary", "table", "ul",
])

/** Where a search for an open <p> or <li> stops. */
const SCOPE = new Set(["button", "td", "th", "table", "caption", "marquee", "object", "applet", "template", "html"])

const START_TAG = /<([a-zA-Z][^\s/>]*)/y
const END_TAG = /<\/([a-zA-Z][^\s/>]*)[^>]*>/y

/** Decodes what a browser would decode in an attribute value, as far as it matters here. */
function decodeAttr(value: string): string {
  /* Numeric references without their semicolon are decoded by browsers too,
     which is the classic way `javascript:` is spelled past a filter. */
  return decodeHtmlEntities(value.replace(/&#(x[0-9a-f]+|\d+)(?!;)/gi, "&#$1;"))
}

export function parseHtml(input: string): HElement {
  const root: HElement = { type: "el", name: "#root", attrs: {}, children: [] }
  const stack: HElement[] = [root]
  const n = input.length
  let foreign = 0
  let i = 0

  const top = () => stack[stack.length - 1]
  const recount = () => {
    foreign = 0
    for (const el of stack) if (el.name === "svg" || el.name === "math") foreign++
  }
  const text = (value: string) => {
    if (!value) return
    const kids = top().children
    const last = kids[kids.length - 1]
    if (last && last.type === "text") last.value += value
    else kids.push({ type: "text", value })
  }
  /** Pop back to (and including) the nearest `names`, unless `stopAt` or a scope boundary comes first. */
  const closeNearest = (names: Set<string>, stopAt: Set<string> = new Set()) => {
    for (let k = stack.length - 1; k > 0; k--) {
      const name = stack[k].name
      if (names.has(name)) {
        stack.length = k
        recount()
        return
      }
      if (stopAt.has(name) || SCOPE.has(name)) return
    }
  }

  const open = (name: string, attrs: Record<string, string>, selfClosing: boolean) => {
    if (!foreign) {
      if (name === "li") closeNearest(new Set(["li"]), new Set(["ul", "ol"]))
      if (name === "dd" || name === "dt") closeNearest(new Set(["dd", "dt"]), new Set(["dl"]))
      if (/^h[1-6]$/.test(name) && /^h[1-6]$/.test(top().name)) stack.pop()
      if (CLOSES_P.has(name)) closeNearest(new Set(["p"]))
      if (name === "a") closeNearest(new Set(["a"]))
    }
    const el: HElement = { type: "el", name, attrs, children: [] }
    top().children.push(el)
    const isVoid = foreign ? selfClosing : VOID_TAGS.has(name) || (selfClosing && (name === "svg" || name === "math"))
    if (!isVoid) {
      stack.push(el)
      if (name === "svg" || name === "math") foreign++
    }
    return el
  }

  while (i < n) {
    const lt = input.indexOf("<", i)
    if (lt === -1) {
      text(input.slice(i))
      break
    }
    if (lt > i) text(input.slice(i, lt))
    i = lt
    const next = input.charCodeAt(i + 1)

    // <!-- comment -->, including Word's conditional ones
    if (input.startsWith("<!--", i)) {
      const end = input.indexOf("-->", i + 4)
      i = end === -1 ? n : end + 3
      continue
    }
    // <!DOCTYPE>, <![if ...]>, <![CDATA[...]]>, <?xml ...?>
    if (next === 33 /* ! */ || next === 63 /* ? */) {
      const end = input.indexOf(">", i + 2)
      i = end === -1 ? n : end + 1
      continue
    }
    if (next === 47 /* / */) {
      END_TAG.lastIndex = i
      const m = END_TAG.exec(input)
      if (!m) {
        const end = input.indexOf(">", i + 2)
        i = end === -1 ? n : end + 1
        continue
      }
      i = END_TAG.lastIndex
      const name = m[1].toLowerCase()
      if (name === "br" && !foreign) {
        open("br", {}, true)
        continue
      }
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k].name === name) {
          stack.length = k
          recount()
          break
        }
        /* An end tag does not reach out of a table cell or a list it was
           not opened in. */
        if (!foreign && SCOPE.has(stack[k].name)) break
      }
      continue
    }

    START_TAG.lastIndex = i
    const m = START_TAG.exec(input)
    if (!m) {
      text("<")
      i += 1
      continue
    }
    const name = m[1].toLowerCase()
    let j = START_TAG.lastIndex
    const attrs: Record<string, string> = {}
    let selfClosing = false
    while (j < n) {
      let c = input[j]
      while (j < n && (c === " " || c === "\n" || c === "\t" || c === "\r" || c === "\f")) c = input[++j]
      if (j >= n) break
      if (c === ">") {
        j++
        break
      }
      if (c === "/") {
        if (input[j + 1] === ">") {
          selfClosing = true
          j += 2
          break
        }
        j++
        continue
      }
      let k = j + 1
      while (k < n && !/[\s/>=]/.test(input[k])) k++
      const attrName = input.slice(j, k).toLowerCase()
      j = k
      while (j < n && /\s/.test(input[j])) j++
      let value = ""
      if (input[j] === "=") {
        j++
        while (j < n && /\s/.test(input[j])) j++
        const q = input[j]
        if (q === '"' || q === "'") {
          const end = input.indexOf(q, j + 1)
          value = end === -1 ? input.slice(j + 1) : input.slice(j + 1, end)
          j = end === -1 ? n : end + 1
        } else {
          let e = j
          while (e < n && !/[\s>]/.test(input[e])) e++
          value = input.slice(j, e)
          j = e
        }
      }
      if (!(attrName in attrs)) attrs[attrName] = decodeAttr(value)
    }
    i = j

    if (!foreign && RAW_TEXT.has(name)) {
      /* Content up to the matching end tag is not markup. It is kept only
         for the elements whose text a reader might want, which here is
         none of them: the element goes into the tree empty. */
      const close = new RegExp(`</${name}[\\s/>]`, "ig")
      close.lastIndex = i
      const found = close.exec(input)
      const end = found ? found.index : n
      top().children.push({ type: "el", name, attrs, children: [] })
      const gt = found ? input.indexOf(">", end) : -1
      i = gt === -1 ? n : gt + 1
      continue
    }
    open(name, attrs, selfClosing)
  }
  return root
}

// ===========================================================================
//  WRITING
// ===========================================================================

export function escapeText(value: string): string {
  return value.replace(/[&<>\u00a0]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&nbsp;"))
}

export function escapeAttr(value: string): string {
  return value.replace(/[&<>"'\u00a0]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "\u00a0": "&nbsp;" })[c] as string)
}

/** Text as written in the source, decoded once, ready to be escaped once. */
const textOf = (node: HText) => decodeHtmlEntities(node.value)

function canonical(name: string): string {
  return TAG_ALIASES[name] ?? name
}

/** The attributes `tag` keeps, in a stable order, as ` name="value"` pairs. */
function storedAttributes(tag: string, attrs: Record<string, string>, legacyImage = false): string | null {
  const allowed = STORED_ATTRIBUTES[tag]
  const out: Array<[string, string]> = []
  if (tag === "a") {
    const href = safeHref(attrs.href)
    if (href) {
      out.push(["href", href])
      if (isExternalHref(href)) {
        out.push(["target", "_blank"])
        out.push(["rel", EXTERNAL_REL])
      }
    }
  }
  if (tag === "img") {
    const src = safeImageSrc(attrs.src, legacyImage)
    if (!src) return null
    out.push(["src", src])
  }
  if (tag === "iframe") {
    const src = safeIframeSrc(attrs.src)
    if (!src) return null
    out.push(["src", src])
  }
  for (const name of allowed ?? []) {
    if (name === "href" || name === "src") continue
    /* A picture is lazy, always; its styles are only the old editor's. */
    if (tag === "img" && (name === "loading" || (name === "style" && !legacyImage))) continue
    const raw = attrs[name]
    if (raw === undefined) continue
    if (name === "style") {
      const style = filterStyle(tag, raw)
      if (style) out.push(["style", style])
      continue
    }
    if (name === "class") {
      const keep = (STORED_CLASSES[tag] ?? []).filter((c) => raw.split(/\s+/).includes(c))
      if (keep.length) out.push(["class", keep.join(" ")])
      continue
    }
    if (name === "title" || name === "alt") {
      out.push([name, raw.slice(0, 300)])
      continue
    }
    const rule = ATTRIBUTE_VALUES[name]
    if (rule && !rule.test(raw.trim())) continue
    out.push([name, raw.trim()])
  }
  if (tag === "img") out.push(["loading", "lazy"])
  return out.map(([k, v]) => ` ${k}="${escapeAttr(v)}"`).join("")
}

/** Written only when they hold something: an empty one is a gap with no line in it. */
const DROP_WHEN_EMPTY = new Set(["p", "h1", "h2", "h3", "h4", "blockquote", "li", "strong", "b", "em", "i", "u", "s", "span", "a", "sub", "sup", "small", "mark", "code"])

type StoredContext = { inLink: boolean; tidy: boolean; legacyImage?: boolean }

function writeStored(nodes: HNode[], ctx: StoredContext): string {
  let out = ""
  for (const node of nodes) {
    if (node.type === "text") {
      out += escapeText(textOf(node))
      continue
    }
    const name = canonical(node.name)
    if (DROPPED_TAGS.has(name)) continue
    if (!STORED_TAGS.has(name) || (name === "a" && ctx.inLink)) {
      out += writeStored(node.children, ctx)
      continue
    }
    const attrs = storedAttributes(name, node.attrs, !!ctx.legacyImage)
    if (attrs === null) continue
    /* A span that kept nothing, or a link whose address was refused, is
       only its text. */
    if ((name === "span" && !attrs) || (name === "a" && !attrs.includes(" href="))) {
      out += writeStored(node.children, ctx)
      continue
    }
    if (VOID_TAGS.has(name)) {
      out += `<${name}${attrs}>`
      continue
    }
    if (name === "iframe") {
      out += `<iframe${attrs}></iframe>`
      continue
    }
    const inner = writeStored(node.children, {
      inLink: ctx.inLink || name === "a",
      tidy: ctx.tidy,
      legacyImage: ctx.legacyImage || (name === "div" && LEGACY_IMAGE_WRAPPERS.has(node.attrs["data-embed-type"] ?? "")),
    })
    /* The editor's own output only: Chrome leaves `<p></p>` and `<b></b>`
       behind when a list or a format takes the line they were on. A stored
       description is drawn as it was saved. */
    if (ctx.tidy && !inner && DROP_WHEN_EMPTY.has(name)) continue
    out += `<${name}${attrs}>${inner}</${name}>`
  }
  return out
}

/** Inline-level for the purpose of grouping loose content into paragraphs. */
const INLINE = new Set(["a", "strong", "b", "em", "i", "u", "s", "strike", "del", "ins", "span", "sub", "sup", "small", "mark", "code", "br", "img", "font"])

function isInlineOnly(el: HElement): boolean {
  return el.children.every((c) => c.type === "text" || (INLINE.has(c.name) && isInlineOnly(c)))
}

/**
 * The top level as the editor writes it: loose text in a paragraph, and a
 * bare <div> the browser made for a new line turned into the <p> it means.
 * Only at the top, and only a div with nothing on it, so an embed wrapper
 * or an aligned block is left exactly as it was.
 */
function asBlocks(root: HElement): HNode[] {
  const out: HNode[] = []
  let run: HNode[] = []
  const flush = () => {
    if (run.some((n) => n.type === "el" || n.value.trim())) out.push({ type: "el", name: "p", attrs: {}, children: run })
    run = []
  }
  for (const node of root.children) {
    if (node.type === "text" || INLINE.has(node.name)) {
      run.push(node)
      continue
    }
    flush()
    if (node.name === "div" && Object.keys(node.attrs).length === 0 && isInlineOnly(node)) out.push({ ...node, name: "p" })
    else out.push(node)
  }
  flush()
  return out
}

/**
 * A description as it may be shown or edited. `blocks` also tidies the top
 * level the way the editor's output wants it; the renderer leaves the
 * structure alone so a stored description looks as it always did.
 */
export function cleanStoredHtml(html: string | null | undefined, options: { blocks?: boolean } = {}): string {
  if (!html) return ""
  const root = parseHtml(html)
  const nodes = options.blocks ? asBlocks(root) : root.children
  return writeStored(nodes, { inLink: false, tidy: !!options.blocks })
}

// ===========================================================================
//  PASTING
// ===========================================================================

type Marks = { strong: boolean; em: boolean; u: boolean; s: boolean; href: string | null }
type Seg = { kind: "text"; text: string; marks: Marks } | { kind: "br" }

const NO_MARKS: Marks = { strong: false, em: false, u: false, s: false, href: null }

/** Anything whose content is its own block in a paste. */
const PASTE_CONTAINERS = new Set([
  "p", "div", "section", "article", "header", "footer", "main", "aside", "nav", "address", "center", "form",
  "figure", "figcaption", "details", "summary", "dl", "dt", "dd", "table", "thead", "tbody", "tfoot", "tr", "td", "th",
  "caption", "fieldset", "hgroup", "pre", "body", "html", "font-block",
])

function styleMap(el: HElement): Map<string, string> {
  return new Map(parseStyle(el.attrs.style ?? ""))
}

/** Hidden in the source, or Word's own list marker, which the list replaces. */
function isHidden(el: HElement): boolean {
  const style = (el.attrs.style ?? "").toLowerCase()
  return /mso-list\s*:\s*ignore/.test(style) || /display\s*:\s*none/.test(style) || /visibility\s*:\s*hidden/.test(style) || "hidden" in el.attrs
}

function marksFor(el: HElement, parent: Marks): Marks {
  const m = { ...parent }
  const name = el.name
  if (name === "b" || name === "strong") m.strong = true
  if (name === "i" || name === "em" || name === "cite" || name === "dfn") m.em = true
  if (name === "u" || name === "ins") m.u = true
  if (name === "s" || name === "strike" || name === "del") m.s = true
  if (name === "a") {
    const href = safeHref(el.attrs.href)
    if (href) m.href = href
  }
  const style = styleMap(el)
  const weight = style.get("font-weight")
  if (weight) {
    if (/^(bold|bolder|[6-9]00)$/i.test(weight)) m.strong = true
    else if (/^(normal|lighter|[1-5]00)$/i.test(weight)) m.strong = false
  }
  const fontStyle = style.get("font-style")
  if (fontStyle) m.em = /italic|oblique/i.test(fontStyle)
  const deco = `${style.get("text-decoration") ?? ""} ${style.get("text-decoration-line") ?? ""}`
  if (/underline/i.test(deco)) m.u = true
  if (/line-through/i.test(deco)) m.s = true
  if (/^\s*none\s*$/i.test(deco)) {
    m.u = false
    m.s = false
  }
  return m
}

function hasBlockInside(el: HElement): boolean {
  return el.children.some((c) => c.type === "el" && (isBlockish(c.name) || (!isHidden(c) && hasBlockInside(c))))
}

function isBlockish(name: string): boolean {
  return PASTE_CONTAINERS.has(name) || /^h[1-6]$/.test(name) || name === "ul" || name === "ol" || name === "li" || name === "blockquote" || name === "hr"
}

function collectInline(nodes: HNode[], marks: Marks, into: Seg[]) {
  for (const node of nodes) {
    if (node.type === "text") {
      into.push({ kind: "text", text: textOf(node), marks })
      continue
    }
    if (DROPPED_TAGS.has(node.name) || node.name === "img" || node.name === "iframe" || isHidden(node)) continue
    if (node.name === "br") {
      into.push({ kind: "br" })
      continue
    }
    if (isBlockish(node.name)) {
      /* A block where only inline content can go (a list inside a heading,
         say): its text joins the line with a space either side. */
      into.push({ kind: "text", text: " ", marks })
      collectInline(node.children, marksFor(node, marks), into)
      into.push({ kind: "text", text: " ", marks })
      continue
    }
    collectInline(node.children, marksFor(node, marks), into)
  }
}

/** Segments as markup, each run of marks opened once and nested in one order. */
function writeInline(segs: Seg[], opts: { heading?: boolean } = {}): string {
  /* Whitespace the way a browser lays it out: runs collapse to one space,
     none at the start or end of the block, none either side of a break.
     A non-breaking space from Word or Docs is a space. */
  const flat: Seg[] = []
  for (const seg of segs) {
    if (seg.kind === "br") {
      flat.push(seg)
      continue
    }
    const text = seg.text.replace(/[\s\u00a0]+/g, " ")
    if (text) flat.push({ ...seg, text })
  }
  for (let k = 0; k < flat.length; k++) {
    const seg = flat[k]
    if (seg.kind !== "text") continue
    const prev = flat[k - 1]
    const atStart = !prev || prev.kind === "br" || (prev.kind === "text" && /\s$/.test(prev.text))
    if (atStart) seg.text = seg.text.replace(/^ /, "")
    const next = flat.slice(k + 1).find((s) => s.kind === "br" || (s.kind === "text" && s.text))
    if (!next || next.kind === "br") seg.text = seg.text.replace(/ $/, "")
  }
  while (flat.length && flat[flat.length - 1].kind === "br") flat.pop()
  while (flat.length && flat[0].kind === "br") flat.shift()

  /* Always opened in this order, so two runs with the same marks share
     their tags and a change closes only what changed. */
  const want = (m: Marks) => {
    const tags: string[] = []
    if (m.href) tags.push(`a:${m.href}`)
    if (m.strong && !opts.heading) tags.push("strong")
    if (m.em) tags.push("em")
    /* A link is underlined already; Docs underlines its links again. */
    if (m.u && !m.href) tags.push("u")
    if (m.s) tags.push("s")
    return tags
  }
  let out = ""
  const openTags: string[] = []
  const close = (to: number) => {
    while (openTags.length > to) {
      const t = openTags.pop() as string
      out += `</${t.startsWith("a:") ? "a" : t}>`
    }
  }
  for (const seg of flat) {
    if (seg.kind === "br") {
      close(0)
      out += "<br>"
      continue
    }
    if (!seg.text) continue
    const tags = want(seg.marks)
    let same = 0
    while (same < openTags.length && same < tags.length && openTags[same] === tags[same]) same++
    close(same)
    for (const t of tags.slice(same)) {
      out += t.startsWith("a:") ? `<a href="${escapeAttr(t.slice(2))}">` : `<${t}>`
      openTags.push(t)
    }
    out += escapeText(seg.text)
  }
  close(0)
  return out
}

/** Splits a run at two or more line breaks in a row, which a web page means as a new paragraph. */
function splitParagraphs(segs: Seg[]): Seg[][] {
  const parts: Seg[][] = [[]]
  for (let k = 0; k < segs.length; k++) {
    const seg = segs[k]
    if (seg.kind === "br") {
      let j = k + 1
      while (j < segs.length && segs[j].kind === "text" && !(segs[j] as { text: string }).text.trim()) j++
      if (j < segs.length && segs[j].kind === "br") {
        parts.push([])
        while (j < segs.length && (segs[j].kind === "br" || !(segs[j] as { text: string }).text.trim())) j++
        k = j - 1
        continue
      }
    }
    parts[parts.length - 1].push(seg)
  }
  return parts
}

type Container = "root" | "quote" | "li"

/** Word writes a list as paragraphs with `mso-list` on them. Grouped back into a list here. */
function wordListInfo(node: HNode): { level: number; ordered: boolean; list: string } | null {
  if (node.type !== "el" || !/^(p|h[1-6]|div)$/.test(node.name)) return null
  const style = node.attrs.style ?? ""
  const cls = node.attrs.class ?? ""
  const level = /mso-list\s*:[^;]*level(\d+)/i.exec(style)
  if (!level && !/MsoListParagraph/i.test(cls)) return null
  let marker = ""
  const find = (nodes: HNode[]): boolean => {
    for (const c of nodes) {
      if (c.type !== "el") continue
      if (/mso-list\s*:\s*ignore/i.test(c.attrs.style ?? "")) {
        marker = flatText(c).trim()
        return true
      }
      if (find(c.children)) return true
    }
    return false
  }
  find(node.children)
  /* Word numbers its lists l0, l1...; a new number is a new list, even
     when the paragraphs are next to each other. */
  const list = /mso-list\s*:\s*(l\d+)/i.exec(style)?.[1] ?? "l"
  return { level: level ? Math.max(1, Math.min(4, Number(level[1]))) : 1, ordered: /^(\d+|[a-z]|[ivxlcdm]+)[.)]$/i.test(marker), list }
}

function flatText(node: HNode): string {
  return node.type === "text" ? textOf(node) : node.children.map(flatText).join("")
}

function groupWordLists(nodes: HNode[]): HNode[] {
  const out: HNode[] = []
  let k = 0
  while (k < nodes.length) {
    const info = wordListInfo(nodes[k])
    if (!info) {
      out.push(nodes[k])
      k++
      continue
    }
    /* A run of list paragraphs, blank text between them allowed. */
    const items: Array<{ node: HElement; level: number; ordered: boolean; list: string }> = []
    while (k < nodes.length) {
      const node = nodes[k]
      if (node.type === "text" && !node.value.trim()) {
        k++
        continue
      }
      const it = wordListInfo(node)
      if (!it || (items.length && it.list !== items[0].list)) break
      items.push({ node: node as HElement, ...it })
      k++
    }
    const build = (from: number, level: number): [HElement, number] => {
      const list: HElement = { type: "el", name: items[from].ordered ? "ol" : "ul", attrs: {}, children: [] }
      let idx = from
      while (idx < items.length && items[idx].level >= level) {
        if (items[idx].level > level) {
          const [child, next] = build(idx, items[idx].level)
          const last = list.children[list.children.length - 1] as HElement | undefined
          if (last) last.children.push(child)
          else list.children.push({ type: "el", name: "li", attrs: {}, children: [child] })
          idx = next
          continue
        }
        list.children.push({ type: "el", name: "li", attrs: {}, children: items[idx].node.children })
        idx++
      }
      return [list, idx]
    }
    let idx = 0
    while (idx < items.length) {
      const [list, next] = build(idx, items[idx].level)
      out.push(list)
      idx = next
    }
  }
  return out
}

/** One piece of a pasted block's content: a line of inline markup, or a whole block. */
type Part = { inline: boolean; html: string }

/** Lines of inline content one after another are separate lines; a block stands on its own. */
function joinParts(parts: Part[]): string {
  let out = ""
  let prevInline = false
  for (const part of parts) {
    if (part.inline && prevInline) out += "<br>"
    out += part.html
    prevInline = part.inline
  }
  return out
}

/**
 * The blocks of a paste. At the top and in a quote, loose inline content is
 * a paragraph; inside a list item it stays inline, because the item is the
 * block. A container (a div, a table cell, Docs' <b> around everything)
 * adds nothing of its own: its content is read as if it were in its place.
 */
function pasteParts(nodes: HNode[], marks: Marks, container: Container): Part[] {
  const parts: Part[] = []
  let run: Seg[] = []
  const flush = () => {
    if (!run.length) return
    if (container === "li") {
      const html = writeInline(run)
      if (html) parts.push({ inline: true, html })
    } else {
      for (const para of splitParagraphs(run)) {
        const html = writeInline(para)
        if (html) parts.push({ inline: false, html: `<p>${html}</p>` })
      }
    }
    run = []
  }

  for (const node of groupWordLists(nodes)) {
    if (node.type === "text") {
      run.push({ kind: "text", text: textOf(node), marks })
      continue
    }
    const name = node.name
    if (DROPPED_TAGS.has(name) || name === "img" || name === "iframe" || isHidden(node)) continue
    if (name === "br") {
      run.push({ kind: "br" })
      continue
    }
    if (name === "hr") {
      flush()
      if (container !== "li") parts.push({ inline: false, html: "<hr>" })
      continue
    }
    const m = marksFor(node, marks)
    if (/^h[1-6]$/.test(name)) {
      flush()
      const segs: Seg[] = []
      collectInline(node.children, m, segs)
      const html = writeInline(segs, { heading: true })
      if (!html) continue
      if (container === "li") parts.push({ inline: true, html })
      else parts.push({ inline: false, html: name === "h1" || name === "h2" ? `<h2>${html}</h2>` : `<h3>${html}</h3>` })
      continue
    }
    if (name === "ul" || name === "ol") {
      flush()
      const html = writeList(node, m)
      if (html) parts.push({ inline: false, html })
      continue
    }
    if (name === "li") {
      flush()
      const inner = joinParts(pasteParts(node.children, m, "li"))
      if (inner) parts.push({ inline: false, html: `<ul><li>${inner}</li></ul>` })
      continue
    }
    if (name === "blockquote") {
      flush()
      if (container === "li") {
        parts.push(...pasteParts(node.children, m, "li"))
      } else {
        const inner = joinParts(pasteParts(node.children, m, "quote"))
        if (inner) parts.push({ inline: false, html: `<blockquote>${inner}</blockquote>` })
      }
      continue
    }
    if (PASTE_CONTAINERS.has(name) || hasBlockInside(node)) {
      flush()
      parts.push(...pasteParts(node.children, m, container))
      continue
    }
    collectInline([node], marks, run)
  }
  flush()
  return parts
}

function writeList(list: HElement, marks: Marks): string {
  let items = ""
  for (const child of list.children) {
    if (child.type === "text") continue
    if (DROPPED_TAGS.has(child.name) || isHidden(child)) continue
    if (child.name === "ul" || child.name === "ol") {
      /* A list directly inside a list: browsers make it, HTML does not
         allow it. It belongs to the item before it. */
      const nested = writeList(child, marks)
      if (!nested) continue
      if (items.endsWith("</li>")) items = `${items.slice(0, -5)}${nested}</li>`
      else items += `<li>${nested}</li>`
      continue
    }
    const inner = joinParts(pasteParts(child.name === "li" ? child.children : [child], child.name === "li" ? marksFor(child, marks) : marks, "li"))
    if (inner) items += `<li>${inner}</li>`
  }
  if (!items) return ""
  const tag = list.name === "ol" ? "ol" : "ul"
  const start = tag === "ol" && /^\d{1,5}$/.test(list.attrs.start ?? "") && list.attrs.start !== "1" ? ` start="${list.attrs.start}"` : ""
  return `<${tag}${start}>${items}</${tag}>`
}

/**
 * A paste, as the structure the toolbar can make. Empty string when there
 * is nothing left worth inserting.
 */
export function cleanPastedHtml(html: string): string {
  if (!html) return ""
  /* The clipboard wraps a copy in a whole document; only the body matters,
     and between StartFragment and EndFragment when the browser marked it. */
  const fragment = /<!--StartFragment-->([\s\S]*)<!--EndFragment-->/i.exec(html)
  const root = parseHtml(fragment ? fragment[1] : html)
  return joinParts(pasteParts(root.children, NO_MARKS, "root"))
    .replace(/<\/ul><ul>/g, "")
    .replace(/<\/ol><ol>/g, "")
}

// ===========================================================================
//  PLAIN TEXT, AND THE EDGES BETWEEN
// ===========================================================================

/** The same test the renderer has always used: text with a tag in it is HTML. */
export function looksLikeHtml(value: string | null | undefined): boolean {
  return !!value && /<[a-z][\s\S]*>/i.test(value)
}

/**
 * Plain text as the paragraphs it was typed as: a blank line starts a new
 * paragraph, a single line break stays a line break. Entities in it are
 * decoded first, because a description stripped of its tags keeps them
 * (see lib/html-entities.ts), and then everything is escaped once.
 */
export function plainTextToHtml(text: string | null | undefined): string {
  if (!text) return ""
  const normal = decodeHtmlEntities(text).replace(/\r\n?/g, "\n")
  return normal
    .split(/\n[ \t]*\n+/)
    .map((para) => para.replace(/^\n+|\n+$/g, ""))
    .filter((para) => para.trim())
    .map((para) => `<p>${para.split("\n").map(escapeText).join("<br>")}</p>`)
    .join("")
}

/** HTML back to the text it reads as: paragraphs by a blank line, breaks by a newline. */
export function htmlToPlainText(html: string | null | undefined): string {
  if (!html) return ""
  if (!looksLikeHtml(html)) return decodeHtmlEntities(html)
  const lines: string[] = []
  let line = ""
  const walk = (nodes: HNode[]) => {
    for (const node of nodes) {
      if (node.type === "text") {
        line += textOf(node).replace(/[\s\u00a0]+/g, " ")
        continue
      }
      if (DROPPED_TAGS.has(node.name)) continue
      if (node.name === "br") {
        lines.push(line.trim())
        line = ""
        continue
      }
      const block = isBlockish(node.name)
      if (block && line.trim()) {
        lines.push(line.trim())
        lines.push("")
      }
      if (block) line = ""
      walk(node.children)
      if (block && line.trim()) {
        lines.push(line.trim())
        lines.push("")
        line = ""
      }
    }
  }
  walk(parseHtml(html).children)
  if (line.trim()) lines.push(line.trim())
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()
}

/** Nothing a reader would see: no text, no image, no embed, no rule. */
export function isBlankHtml(html: string | null | undefined): boolean {
  if (!html) return true
  if (/<(img|iframe|hr)\b/i.test(html)) return false
  return !decodeHtmlEntities(html.replace(/<[^>]*>/g, "")).replace(/[\s\u00a0\u200b]+/g, "")
}

/** What the editor shows for a stored value, old plain text included. */
export function toEditorHtml(value: string | null | undefined): string {
  const html = looksLikeHtml(value) ? cleanStoredHtml(value) : plainTextToHtml(value)
  return isBlankHtml(html) ? "<p><br></p>" : html
}
