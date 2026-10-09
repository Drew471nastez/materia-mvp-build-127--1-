/**
 * ===========================================================================
 *  THE MARKUP LANGUAGE
 * ===========================================================================
 * HTML, plus four things:
 *
 *   {{ expression }}                 output, HTML-escaped
 *   {% if … %} {% elsif … %} {% else %} {% endif %}
 *   {% for item in list %} … {% else %} {% endfor %}
 *   {% for item in list limit: 4 offset: 1 reversed %}
 *   {% content_for "blocks" %}       this section's (or block's) theme blocks
 *   {% content_for "block", type: "heading", id: "title" %}
 *                                    one theme block the template places itself
 *
 * An expression is a path into the context (`settings.heading`,
 * `block.settings.url`, `theme.colors.primary`), a literal, a comparison, or
 * any of those joined by `and`, `or`, `not`, followed by filters:
 *
 *   {{ settings.heading | default: "Welcome" | upcase }}
 *
 * ---------------------------------------------------------------------------
 *  WHY THIS IS NOT eval
 * ---------------------------------------------------------------------------
 * A template is compiled to a tree and the tree is walked. There is no
 * `eval`, no `new Function`, and no string of JavaScript anywhere in the
 * pipeline, which is what lets the storefront run under a strict CSP and
 * what makes the output deterministic: the same tree over the same context
 * produces the same string, every time, on every machine.
 *
 * A path can only read plain data. `__proto__`, `constructor` and
 * `prototype` are not reachable, and a value that is a function is never
 * called. Everything the template can see was put in the context on purpose.
 *
 * Output is escaped. A setting a customer typed cannot inject markup, and
 * the only way to emit raw HTML is the `raw` filter — which is for the
 * `richtext` control, whose value was sanitised on the way in.
 *
 * `<script>` and `on*=` attributes are refused at compile time. Behaviour
 * goes in the section's own <script> block, where it is checked and scoped.
 */
import type { RenderContext, Result, ThemeError } from "../types"
import { Linked, formatDatetime, parseVideoUrl, plainText, safeHref } from "../values"
import { mapEmbedSrc } from "@/lib/website-builder/map-embed"
import { guardRawHtml, isScriptScheme } from "./raw-html"
import { markFor, stripMarks } from "./marks"
import { priceNumber, shopifyField } from "./shopify-objects"

// ── AST ─────────────────────────────────────────────────────────────────────

export type Node =
  | { kind: "text"; value: string }
  | { kind: "output"; expr: Expr; line: number }
  | { kind: "if"; branches: { cond: Expr; body: Node[] }[]; else?: Node[]; line: number }
  | { kind: "for"; item: string; list: Expr; body: Node[]; else?: Node[]; line: number; limit?: Expr; offset?: Expr; reversed?: boolean }
  /* Liquid's {% break %} and {% continue %}: leave the loop, or go on to its next item. Outside a loop, nothing. */
  | { kind: "break"; line: number }
  | { kind: "continue"; line: number }
  | { kind: "content_for"; what: "blocks"; line: number; closest?: Record<string, Expr> }
  | { kind: "content_for"; what: "block"; type: string; id: string; line: number; closest?: Record<string, Expr> }
  /* Liquid's {% assign x = … %} and {% capture x %}…{% endcapture %}: a name the rest of the template reads. */
  | { kind: "assign"; name: string; expr: Expr; line: number }
  | { kind: "capture"; name: string; body: Node[]; line: number }

export type Expr =
  | { t: "lit"; v: string | number | boolean | null }
  /* `keys` holds the parts worked out as the template runs: `settings[key]` is segs ["settings", ""] with keys { 1: key }. */
  | { t: "path"; segs: string[]; keys?: Record<number, Expr> }
  | { t: "not"; e: Expr }
  | { t: "bin"; op: BinOp; l: Expr; r: Expr }
  | { t: "filter"; e: Expr; name: string; args: Expr[] }
  /* `(1..settings.count)`, Liquid's range: the whole numbers from one to the other, at most MAX_RANGE of them. */
  | { t: "range"; from: Expr; to: Expr }

type BinOp = "==" | "!=" | "<" | "<=" | ">" | ">=" | "and" | "or" | "contains"

export interface CompiledTemplate {
  nodes: Node[]
}

// ── Tokenising the outer markup ─────────────────────────────────────────────

type Tok = { kind: "text"; value: string; line: number } | { kind: "output"; value: string; line: number } | { kind: "tag"; value: string; line: number }

function tokenize(src: string): Tok[] {
  const toks: Tok[] = []
  let i = 0
  let line = 1
  const push = (t: Tok) => toks.push(t)
  while (i < src.length) {
    const out = src.indexOf("{{", i)
    const tag = src.indexOf("{%", i)
    /**
     * `{# … #}` is a comment: it is read and thrown away, and nothing about
     * it reaches the page. An HTML comment would have been sent to every
     * visitor of every site using the section, so a note to the next person
     * editing the file cost bytes on the wire and told a stranger how the
     * thing works. This costs nothing and can say as much as it needs to.
     */
    const note = src.indexOf("{#", i)
    let next = -1
    let kind: "output" | "tag" | "comment" = "output"
    const first = [
      out >= 0 ? { at: out, kind: "output" as const } : null,
      tag >= 0 ? { at: tag, kind: "tag" as const } : null,
      note >= 0 ? { at: note, kind: "comment" as const } : null,
    ].filter((x): x is { at: number; kind: "output" | "tag" | "comment" } => x !== null)
      .sort((a, b) => a.at - b.at)[0]
    if (first) { next = first.at; kind = first.kind }
    if (next < 0) {
      push({ kind: "text", value: src.slice(i), line })
      break
    }
    if (next > i) {
      const text = src.slice(i, next)
      push({ kind: "text", value: text, line })
      line += (text.match(/\n/g) ?? []).length
    }
    const closer = kind === "output" ? "}}" : kind === "tag" ? "%}" : "#}"
    const end = src.indexOf(closer, next + 2)
    if (end < 0) throw new TemplateError(`"${src.slice(next, next + 2)}" on line ${line} is never closed`, line)
    const inner = src.slice(next + 2, end)
    if (kind !== "comment") push({ kind, value: inner.trim(), line })
    line += (inner.match(/\n/g) ?? []).length
    i = end + 2
  }
  return toks
}

class TemplateError extends Error {
  constructor(message: string, public line: number) {
    super(message)
  }
}

// ── Expressions ─────────────────────────────────────────────────────────────

type ETok =
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "id"; v: string }
  | { t: "op"; v: string }
  | { t: "punct"; v: string }

function lexExpr(src: string, line: number): ETok[] {
  const out: ETok[] = []
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (/\s/.test(ch)) { i++; continue }
    if (ch === '"' || ch === "'") {
      const end = src.indexOf(ch, i + 1)
      if (end < 0) throw new TemplateError(`unterminated string in expression`, line)
      out.push({ t: "str", v: src.slice(i + 1, end) })
      i = end + 1
      continue
    }
    const num = src.slice(i).match(/^-?\d+(\.\d+)?/)
    if (num) { out.push({ t: "num", v: Number(num[0]) }); i += num[0].length; continue }
    const op = src.slice(i).match(/^(==|!=|<=|>=|<|>)/)
    if (op) { out.push({ t: "op", v: op[0] }); i += op[0].length; continue }
    const id = src.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/)
    if (id) { out.push({ t: "id", v: id[0] }); i += id[0].length; continue }
    if ("|:,.[]()".includes(ch)) { out.push({ t: "punct", v: ch }); i++; continue }
    throw new TemplateError(`unexpected "${ch}" in expression`, line)
  }
  return out
}

class ExprParser {
  private pos = 0
  constructor(private toks: ETok[], private line: number) {}

  private peek(): ETok | undefined { return this.toks[this.pos] }
  private take(): ETok {
    const t = this.toks[this.pos++]
    if (!t) throw new TemplateError(`expression ends early`, this.line)
    return t
  }
  private is(t: ETok["t"], v?: string): boolean {
    const p = this.peek()
    return !!p && p.t === t && (v === undefined || (p as { v: unknown }).v === v)
  }

  parse(): Expr {
    const e = this.filtered(this.or())
    if (this.pos < this.toks.length) throw new TemplateError(`unexpected "${(this.peek() as { v: unknown }).v}" in expression`, this.line)
    return e
  }
  /* `x | f: a, b | g`, at the end of an expression or inside parentheses: `(c | strip) and settings.on`. */
  private filtered(start: Expr): Expr {
    let e = start
    while (this.is("punct", "|")) {
      this.take()
      const name = this.take()
      if (name.t !== "id") throw new TemplateError(`a filter name must follow "|"`, this.line)
      const args: Expr[] = []
      if (this.is("punct", ":")) {
        this.take()
        args.push(this.or())
        while (this.is("punct", ",")) { this.take(); args.push(this.or()) }
      }
      e = { t: "filter", e, name: name.v, args }
    }
    return e
  }
  private or(): Expr {
    let l = this.and()
    while (this.is("id", "or")) { this.take(); l = { t: "bin", op: "or", l, r: this.and() } }
    return l
  }
  private and(): Expr {
    let l = this.not()
    while (this.is("id", "and")) { this.take(); l = { t: "bin", op: "and", l, r: this.not() } }
    return l
  }
  private not(): Expr {
    if (this.is("id", "not")) { this.take(); return { t: "not", e: this.not() } }
    return this.cmp()
  }
  private cmp(): Expr {
    const l = this.primary()
    const p = this.peek()
    if (p && p.t === "op") { this.take(); return { t: "bin", op: p.v as BinOp, l, r: this.primary() } }
    if (p && p.t === "id" && p.v === "contains") { this.take(); return { t: "bin", op: "contains", l, r: this.primary() } }
    return l
  }
  private primary(): Expr {
    const t = this.take()
    if (t.t === "num") return { t: "lit", v: t.v }
    if (t.t === "str") return { t: "lit", v: t.v }
    if (t.t === "punct" && t.v === "(") { const e = this.filtered(this.or()); const c = this.take(); if (c.t !== "punct" || c.v !== ")") throw new TemplateError(`expected ")"`, this.line); return e }
    if (t.t === "id") {
      if (t.v === "true") return { t: "lit", v: true }
      if (t.v === "false") return { t: "lit", v: false }
      if (t.v === "null" || t.v === "nil" || t.v === "blank") return { t: "lit", v: null }
      const segs = [t.v]
      const keys: Record<number, Expr> = {}
      for (;;) {
        if (this.is("punct", ".")) {
          this.take()
          const n = this.take()
          if (n.t !== "id") throw new TemplateError(`a name must follow "."`, this.line)
          segs.push(n.v)
        } else if (this.is("punct", "[")) {
          this.take()
          const p = this.peek()
          const literal = (p?.t === "num" || p?.t === "str") && this.toks[this.pos + 1]?.t === "punct" && (this.toks[this.pos + 1] as { v: unknown }).v === "]"
          if (literal) {
            segs.push(String(this.take().v))
          } else {
            /* items[i], settings[key]: the part is worked out as the template runs. */
            keys[segs.length] = this.filtered(this.or())
            segs.push("")
          }
          const c = this.take()
          if (c.t !== "punct" || c.v !== "]") throw new TemplateError(`expected "]"`, this.line)
        } else break
      }
      return Object.keys(keys).length ? { t: "path", segs, keys } : { t: "path", segs }
    }
    throw new TemplateError(`unexpected "${(t as { v: unknown }).v}" in expression`, this.line)
  }
}

/**
 * `{% for block in products limit: 4 %}`, as a shop theme writes it: the list,
 * then `limit:` and `offset:` (a number or a setting) and `reversed`, in any
 * order after it. Offset first, then the limit, then the order turned round,
 * as Liquid does. "Show 4 products" is a range setting and one word here,
 * not a template that has no way to stop.
 */
function loopParams(src: string, line: number): { list: Expr; params: { limit?: Expr; offset?: Expr; reversed?: boolean } } {
  let rest = src.trim()
  const params: { limit?: Expr; offset?: Expr; reversed?: boolean } = {}
  for (;;) {
    const rev = rest.match(/^(.*\S)\s+reversed$/)
    if (rev && !params.reversed) { params.reversed = true; rest = rev[1]; continue }
    const kv = rest.match(/^(.*\S)\s+(limit|offset)\s*:\s*([A-Za-z0-9_.]+)$/)
    if (kv && !params[kv[2] as "limit" | "offset"]) { params[kv[2] as "limit" | "offset"] = parseExpr(kv[3], line); rest = kv[1]; continue }
    break
  }
  const range = splitRange(rest)
  if (range) return { list: { t: "range", from: parseExpr(range[0], line), to: parseExpr(range[1], line) }, params }
  return { list: parseExpr(rest, line), params }
}

/** `(a..b)` as its two ends, each of which may hold parentheses of its own: `(1..(total | divided_by: 2))`. */
function splitRange(src: string): [string, string] | null {
  if (!src.startsWith("(") || !src.endsWith(")")) return null
  const inner = src.slice(1, -1)
  let depth = 0
  let quote = ""
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i]
    if (quote) { if (c === quote) quote = ""; continue }
    if (c === '"' || c === "'") { quote = c; continue }
    if (c === "(") depth++
    else if (c === ")") { if (--depth < 0) return null }
    else if (depth === 0 && c === "." && inner[i + 1] === "." && i > 0) {
      const a = inner.slice(0, i).trim()
      const b = inner.slice(i + 2).trim()
      return a && b ? [a, b] : null
    }
  }
  return null
}

/** The most numbers one range gives a loop, so `(1..100000)` cannot draw a hundred thousand of anything. */
export const MAX_RANGE = 200

function parseExpr(src: string, line: number): Expr {
  return new ExprParser(lexExpr(src, line), line).parse()
}

// ── Building the tree ───────────────────────────────────────────────────────

/**
 * ===========================================================================
 *  VUE, REFUSED BY NAME, WITH WHAT TO WRITE INSTEAD
 * ===========================================================================
 * Each entry is a piece of Vue syntax and the Storelib way to say it. Module
 * level and exported so the Developer Hub's list of refusals is generated from
 * this rather than retyped (lib/developers/directives.ts).
 *
 * `v-on:` and `@click` name the two ways a section responds to a person:
 * HTML that does it with no script at all, which is right for open and
 * close, tabs and pop-ups, and a listener in the section's own <script>
 * block, which runs in a sandbox against a copy of the section. Both are
 * named, HTML first, because it works before any script has loaded.
 */
const HANDLER_INSTEAD = `HTML where it does it alone (<details> for open and close, a radio input with :checked for tabs, popovertarget for a pop-up), or a listener in the section's <script> block: root.querySelector(".x").addEventListener("click", …)`

export const FOREIGN_SYNTAX: [RegExp, string][] = [
  [/\sv-if\s*=/i, `{% if … %} … {% endif %}`],
  [/\sv-else-if\s*=/i, `{% elsif … %}`],
  [/\sv-else(\s|=|>)/i, `{% else %}`],
  [/\sv-for\s*=/i, `{% for item in list %} … {% endfor %}`],
  [/\sv-show\s*=/i, `{% if … %} … {% endif %}`],
  [/\sv-bind:/i, `an attribute written out: href="{{ settings.link }}"`],
  [/\sv-model\s*=/i, `a setting in the schema; a section does not hold state`],
  [/\sv-html\s*=/i, `{{ settings.body | raw }}, for a richtext setting`],
  [/\sv-text\s*=/i, `{{ settings.text }}`],
  [/\sv-on:/i, HANDLER_INSTEAD],
  [/\s@click\s*=/i, HANDLER_INSTEAD],
  [/\s:key\s*=/i, `nothing: a {% for %} needs no key`],
  [/\s:([a-z-]+)\s*=/i, `the attribute itself, with the value in it`],
]

const HANDLER_REFUSAL = "an on*= attribute. Add the listener in the section's <script> block instead, or use HTML that needs none: <details>, a radio input with :checked, or popovertarget"

export const FORBIDDEN_MARKUP: [RegExp, string][] = [
  [/<script\b/i, "a <script> tag inside <template>. A section's script goes in its own <script> block, beside <template>, where it runs in a sandbox"],
  [/\son[a-z]+\s*=/i, HANDLER_REFUSAL],
  [/javascript:/i, "a javascript: URL"],
  [/<object\b|<embed\b/i, "an <object> or <embed>"],
]

/**
 * ===========================================================================
 *  TAGS THAT BELONG TO THE WHOLE DOCUMENT, NOT TO A SECTION
 * ===========================================================================
 * A section's markup is drawn into a page it shares with every other section,
 * and in the builder into the editor's own document. These four tags act on
 * that whole document wherever they sit: a `<style>` here is not scoped and
 * restyles the editor and every other section, a `<link>` fetches a sheet
 * that does the same, a `<base>` moves every relative address on the page
 * (the editor's included), and a `<meta http-equiv>` can send the page
 * somewhere else.
 *
 * A save refuses them, so an author or an agent is told where the thing goes
 * instead. A section that was saved before this rule existed still compiles
 * (the runtime passes `lenient`) and `stripDocumentMarkup` removes the tags
 * from what it draws, so a live page loses the stray tag, not the section.
 */
export const DOCUMENT_MARKUP: [RegExp, string][] = [
  [/<style\b/i, "a <style> tag inside <template>. A section's CSS goes in its <style> block, beside <template>, where it is scoped to this section"],
  [/<link\b/i, "a <link> tag. A stylesheet or a font is added in the theme's layout, not in a section"],
  [/<base\b/i, "a <base> tag, which would change every address on the page"],
  [/<meta\b/i, "a <meta> tag. A page's title, description and sharing picture are set in Website Settings"],
]

/**
 * ===========================================================================
 *  THE SAME REFUSALS, SPELLED THE WAYS A BROWSER ALSO ACCEPTS
 * ===========================================================================
 * `\son…=` above reads a handler as a space and a name. A browser also
 * starts a new attribute after a slash or straight after a closing quote, so
 * `<img/onerror=…>` and `<img src="x"onerror=…>` are handlers too, and a
 * javascript: address still runs when it is written as `jav&#x61;script:` or
 * split by a tab. `srcdoc` is a whole page inside one attribute, character
 * references and all.
 *
 * Refused when a file is saved or a theme is imported. A file saved before
 * this existed still compiles as it did, so no live section changes.
 */
export const DISGUISED_MARKUP: [RegExp, string][] = [
  [/[/"']on[a-z]+\s*=/i, HANDLER_REFUSAL],
  [/[\s/"']srcdoc\s*=/i, "a srcdoc attribute, which puts a whole page inside one attribute"],
]

/** An address attribute written out in the template, with its value. */
const ADDRESS_IN_TEMPLATE = /[\s/"'](?:href|src|action|formaction|xlink:href|data|poster|background|codebase|cite|ping)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/gi

export function stripDocumentMarkup(html: string): string {
  if (!/<(?:style|link|base|meta)\b/i.test(html)) return html
  return html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*$/i, "")
    .replace(/<\/?(?:link|base|meta)\b[^>]*>/gi, "")
}

/**
 * ===========================================================================
 *  THE ONE FRAME A SECTION MAY OPEN
 * ===========================================================================
 * An `<iframe>` hands part of the page to somebody else's code, so a section
 * does not get one by asking nicely: it declares the `embed` capability, and
 * then every frame it opens has to take its address from the `embed` filter.
 *
 * The filter is the guarantee, not the check below. It knows five hosts and
 * the shape of their player addresses, normalises what people actually paste
 * (a youtu.be link, a watch?v= link), and answers with an empty string for
 * everything else — so a setting cannot point a frame at an arbitrary site
 * whatever anybody types into it.
 *
 * The check below is so that a section author finds out at compile time
 * rather than from a blank rectangle.
 */
const EMBED_HOSTS: { test: RegExp; to: (m: RegExpMatchArray) => string }[] = [
  { test: /^https?:\/\/player\.vimeo\.com\/video\/(\d+)/i, to: (m) => `https://player.vimeo.com/video/${m[1]}` },
  { test: /^https?:\/\/vimeo\.com\/(\d+)/i, to: (m) => `https://player.vimeo.com/video/${m[1]}` },
  { test: /^https?:\/\/open\.spotify\.com\/embed\/([\w/]+)/i, to: (m) => `https://open.spotify.com/embed/${m[1]}` },
  { test: /^https?:\/\/w\.soundcloud\.com\/player\/\?url=(.+)$/i, to: (m) => `https://w.soundcloud.com/player/?url=${encodeURIComponent(decodeURIComponent(m[1]))}` },
  /* A Google map: the embed address Share › Embed a map gives, or the keyless search the `map` filter writes. */
  { test: /^https:\/\/(?:www\.)?google\.com\/maps\/embed\?([^"<>\s]+)$/i, to: (m) => `https://www.google.com/maps/embed?${m[1]}` },
  { test: /^https:\/\/(?:www\.)?google\.com\/maps\?(q=[^"<>\s&]+)&output=embed$/i, to: (m) => `https://www.google.com/maps?${m[1]}&output=embed` },
]

/** The hosts the `embed` filter will hand back, for the docs and the editor. */
export const EMBED_ALLOWED = ["youtube.com", "youtube-nocookie.com", "youtu.be", "vimeo.com", "player.vimeo.com", "open.spotify.com", "w.soundcloud.com", "google.com/maps"] as const

export function embedUrl(raw: unknown): string {
  const v = typeof raw === "string" ? raw.trim() : ""
  if (!v) return ""
  /* Every YouTube shape a video_url setting accepts (watch, youtu.be, shorts, live, m.youtube), so a link the field took never draws an empty frame. */
  const video = parseVideoUrl(v, ["youtube"])
  if (video) return video.embed
  for (const { test, to } of EMBED_HOSTS) {
    const m = v.match(test)
    if (m) return to(m)
  }
  return ""
}

export function compileTemplate(src: string, opts: { file?: string; line?: number; capabilities?: string[]; lenient?: boolean } = {}): Result<CompiledTemplate> {
  const base = (opts.line ?? 1) - 1
  const err = (message: string, line?: number): Result<CompiledTemplate> => ({
    ok: false,
    errors: [{ stage: "template", file: opts.file, line: line !== undefined ? base + line : undefined, message }],
  })

  const lineAt = (index: number) => (src.slice(0, index).match(/\n/g)?.length ?? 0) + 1

  /**
   * ===========================================================================
   *  THIS IS NOT VUE, AND SAYING SO IS CHEAPER THAN LETTING IT LOOK LIKE IT IS
   * ===========================================================================
   * `v-if`, `@click` and `:class` are not syntax here. They are also not
   * errors to an HTML parser: they are attributes with unusual names, so a
   * template written in Vue used to compile, save and render, with every
   * directive passed through to the browser as dead markup. The section then
   * showed every branch of its own `v-if` at once and did nothing on click,
   * and there was nothing anywhere to say why.
   *
   * Anyone arriving from a framework tries these first. So each one is
   * refused by name, with the line and the thing to write instead, which is
   * the cheapest documentation there is: it arrives exactly when it is needed.
   */
  for (const [re, instead] of FOREIGN_SYNTAX) {
    const m = re.exec(src)
    if (!m) continue
    const found = m[0].trim().replace(/=$/, "").replace(/[>\s]$/, "")
    // `:style="x"` is `style="{{ x }}"`, and saying so with the author's own
    // attribute name beats a worked example of a different one.
    const say = m[1] ? `${instead}: ${m[1]}="{{ settings.… }}"` : instead
    return err(
      `"${found}" is Vue, and a section is not a Vue component. Write ${say}.`,
      lineAt(m.index),
    )
  }

  const mayEmbed = (opts.capabilities ?? []).includes("embed")
  for (const m of src.matchAll(/<iframe\b[^>]*>/gi)) {
    if (!mayEmbed) {
      return err(`The template contains an <iframe>. A section that shows somebody else's player declares the "embed" capability in its schema.`, lineAt(m.index ?? 0))
    }
    if (!/\bsrc\s*=\s*"\{\{[^"]*\|\s*embed\s*\}\}"/.test(m[0])) {
      return err(`This <iframe> takes its address from somewhere other than the embed filter. Write src="{{ settings.x | embed }}", which is what limits it to ${EMBED_ALLOWED.slice(0, 3).join(", ")} and the rest of the allowed players.`, lineAt(m.index ?? 0))
    }
  }

  /*
    The markup as a browser would see it, for the handler check: inside a tag
    or an output only its quoted strings are kept, the same length, so
    `{% assign onboarding = false %}` is a name and not an onclick, and
    `{% assign x = ' onclick=…' %}` is still caught.
  */
  const markupView = src.replace(/\{[{%][\s\S]*?[}%]\}/g, (t) => t.replace(/("[^"\n]*"|'[^'\n]*')|[^\n]/g, (m, q: string | undefined) => q ?? " "))
  for (const [re, what] of opts.lenient ? FORBIDDEN_MARKUP : [...FORBIDDEN_MARKUP, ...DOCUMENT_MARKUP, ...DISGUISED_MARKUP]) {
    const m = (re.source.startsWith("\\son") ? markupView : src).match(re)
    if (m && m.index !== undefined) {
      const line = lineAt(m.index)
      return err(`The template contains ${what}`, line)
    }
  }
  if (!opts.lenient) {
    for (const m of src.matchAll(ADDRESS_IN_TEMPLATE)) {
      if (isScriptScheme(m[1] ?? m[2] ?? m[3] ?? "")) return err("The template contains a javascript: URL", lineAt(m.index ?? 0))
    }
  }

  let toks: Tok[]
  try {
    toks = tokenize(src)
  } catch (e) {
    return e instanceof TemplateError ? err(e.message, e.line) : err(String(e))
  }

  let i = 0
  const parseBlock = (until: string[]): { nodes: Node[]; closer?: Tok } => {
    const nodes: Node[] = []
    while (i < toks.length) {
      const t = toks[i]
      if (t.kind === "text") { nodes.push({ kind: "text", value: t.value }); i++; continue }
      if (t.kind === "output") {
        nodes.push({ kind: "output", expr: parseExpr(t.value, t.line), line: t.line })
        i++
        continue
      }
      const word = t.value.split(/\s+/)[0]
      if (until.includes(word)) return { nodes, closer: t }
      i++
      if (word === "if") {
        const branches = [{ cond: parseExpr(t.value.slice(2), t.line), body: [] as Node[] }]
        let elseBody: Node[] | undefined
        for (;;) {
          const r = parseBlock(["elsif", "else", "endif"])
          if (!r.closer) throw new TemplateError(`{% if %} on line ${t.line} is never closed with {% endif %}`, t.line)
          const w = r.closer.value.split(/\s+/)[0]
          if (elseBody) elseBody = r.nodes
          else branches[branches.length - 1].body = r.nodes
          i++
          if (w === "endif") break
          if (w === "elsif") branches.push({ cond: parseExpr(r.closer.value.slice(5), r.closer.line), body: [] })
          if (w === "else") elseBody = []
        }
        nodes.push({ kind: "if", branches, else: elseBody, line: t.line })
        continue
      }
      if (word === "for") {
        const m = t.value.match(/^for\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\s+(.+)$/)
        if (!m) throw new TemplateError(`"{% ${t.value} %}" should read {% for item in list %}`, t.line)
        const body = parseBlock(["else", "endfor"])
        if (!body.closer) throw new TemplateError(`{% for %} on line ${t.line} is never closed with {% endfor %}`, t.line)
        let elseBody: Node[] | undefined
        i++
        if (body.closer.value.split(/\s+/)[0] === "else") {
          const e = parseBlock(["endfor"])
          if (!e.closer) throw new TemplateError(`{% for %} on line ${t.line} is never closed with {% endfor %}`, t.line)
          elseBody = e.nodes
          i++
        }
        const loop = loopParams(m[2], t.line)
        nodes.push({ kind: "for", item: m[1], list: loop.list, body: body.nodes, else: elseBody, line: t.line, ...loop.params })
        continue
      }
      if (word === "content_for") {
        nodes.push(parseContentFor(t.value, t.line))
        continue
      }
      if (word === "break" || word === "continue") {
        nodes.push({ kind: word, line: t.line })
        continue
      }
      if (word === "assign") {
        const m = t.value.match(/^assign\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([\s\S]+)$/)
        if (!m) throw new TemplateError(`"{% ${t.value} %}" should read {% assign name = value %}`, t.line)
        if (RESERVED_NAMES.has(m[1])) throw new TemplateError(`"${m[1]}" is a name the template already reads; assign to another name`, t.line)
        nodes.push({ kind: "assign", name: m[1], expr: parseExpr(m[2], t.line), line: t.line })
        continue
      }
      if (word === "capture") {
        const m = t.value.match(/^capture\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/)
        if (!m) throw new TemplateError(`"{% ${t.value} %}" should read {% capture name %}`, t.line)
        if (RESERVED_NAMES.has(m[1])) throw new TemplateError(`"${m[1]}" is a name the template already reads; capture into another name`, t.line)
        const body = parseBlock(["endcapture"])
        if (!body.closer) throw new TemplateError(`{% capture %} on line ${t.line} is never closed with {% endcapture %}`, t.line)
        i++
        nodes.push({ kind: "capture", name: m[1], body: body.nodes, line: t.line })
        continue
      }
      throw new TemplateError(`unknown tag {% ${word} %}`, t.line)
    }
    return { nodes }
  }

  try {
    const { nodes, closer } = parseBlock([])
    if (closer) return err(`stray {% ${closer.value} %}`, closer.line)
    return { ok: true, value: { nodes } }
  } catch (e) {
    return e instanceof TemplateError ? err(e.message, e.line) : err(String(e))
  }
}

/**
 * ===========================================================================
 *  {% content_for %}: WHERE THEME BLOCKS GO
 * ===========================================================================
 * Shopify's tag, with Shopify's arguments, so a theme author's hands already
 * know it:
 *
 *   {% content_for "blocks" %}
 *       every theme block this section (or this block) holds, in the order
 *       the person arranged them, each drawn by its own blocks/<type>.storelib
 *
 *   {% content_for "block", type: "heading", id: "title" %}
 *       one block the template places itself: STATIC. It cannot be moved or
 *       deleted, only edited, and it is drawn with its defaults until it is.
 *
 * Both arguments of the second form are literal strings. A type or an id
 * worked out at render time would be a block nobody can find again in the
 * sidebar, so they are refused here, with the line.
 */
const BLOCK_TYPE = /^_?[a-z][a-z0-9_-]*$/
const BLOCK_ID = /^[A-Za-z0-9_-]{1,64}$/

function parseContentFor(tag: string, line: number): Node {
  const rest = tag.replace(/^content_for\s*/, "")
  const head = rest.match(/^(["'])(blocks|block)\1\s*(.*)$/s)
  if (!head) {
    throw new TemplateError(`content_for takes "blocks", or "block" with a type and an id: {% content_for "block", type: "heading", id: "title" %}`, line)
  }
  /* `closest.product: product` and `closest.collection: …`: what the blocks are drawn for. An expression each. */
  const closest: Record<string, Expr> = {}
  let tail = head[3].trim()
  for (;;) {
    const m = tail.match(/,\s*closest\.(product|collection)\s*:\s*([^,]+?)\s*(?=,|$)/)
    if (!m || m.index === undefined) break
    closest[m[1]] = parseExpr(m[2], line)
    tail = (tail.slice(0, m.index) + tail.slice(m.index + m[0].length)).trim()
  }
  const near = Object.keys(closest).length ? { closest } : {}
  if (head[2] === "blocks") {
    if (tail !== "") throw new TemplateError(`{% content_for "blocks" %} takes nothing after "blocks" but closest.product or closest.collection`, line)
    return { kind: "content_for", what: "blocks", line, ...near }
  }
  const args: Record<string, string> = {}
  while (tail) {
    const m = tail.match(/^,\s*([a-z_]+)\s*:\s*(["'])([^"']*)\2\s*/)
    if (!m) throw new TemplateError(`{% content_for "block" %} reads type: "…" and id: "…", each a word in quotes`, line)
    if (m[1] !== "type" && m[1] !== "id") throw new TemplateError(`{% content_for "block" %} takes type and id, not ${m[1]}`, line)
    args[m[1]] = m[3]
    tail = tail.slice(m[0].length).trim()
  }
  if (!args.type || !BLOCK_TYPE.test(args.type)) throw new TemplateError(`{% content_for "block" %} needs type: "…", the name of a file in blocks/`, line)
  if (!args.id || !BLOCK_ID.test(args.id)) throw new TemplateError(`{% content_for "block" %} needs id: "…", letters, digits, - and _`, line)
  return { kind: "content_for", what: "block", type: args.type, id: args.id, line, ...near }
}

/** Every `content_for` in a template, in the order they appear. */
export function contentForRefs(tpl: CompiledTemplate): ({ what: "blocks"; line: number } | { what: "block"; type: string; id: string; line: number })[] {
  const out: ({ what: "blocks"; line: number } | { what: "block"; type: string; id: string; line: number })[] = []
  const walk = (nodes: Node[]) => {
    for (const n of nodes) {
      if (n.kind === "content_for") out.push(n.what === "blocks" ? { what: "blocks", line: n.line } : { what: "block", type: n.type, id: n.id, line: n.line })
      else if (n.kind === "capture") walk(n.body)
      else if (n.kind === "if") { n.branches.forEach((b) => walk(b.body)); if (n.else) walk(n.else) }
      else if (n.kind === "for") { walk(n.body); if (n.else) walk(n.else) }
    }
  }
  walk(tpl.nodes)
  return out
}

// ── Rendering ───────────────────────────────────────────────────────────────

/** A string the template may emit unescaped. Only the `raw` filter makes one, and the engine for `block.storelib_attributes`. */
class Safe {
  constructor(public readonly html: string) {}
}

/**
 * Names a template already reads, which an assign or a capture may not take:
 * `{% assign settings = … %}` would hide the section's own settings from
 * everything after it.
 */
const RESERVED_NAMES = new Set(["settings", "blocks", "block", "products", "collections", "theme", "scheme", "page", "section", "shop", "routes", "customer", "wishlist", "creator", "product", "forloop", "true", "false", "null", "nil", "empty", "blank"])

/**
 * Where a render keeps what `assign` and `capture` wrote. A symbol key on the
 * scope, because a loop's scope is a copy of the one around it and object
 * spread copies symbol keys too: an assign inside a loop is seen after it,
 * the way Liquid has it. A template cannot name a symbol, so cannot reach it.
 */
const LOCALS = Symbol("locals")
/** At most this many names, and this many characters captured, in one render. */
const MAX_LOCALS = 200
const MAX_CAPTURE = 200_000

/** Markup the engine built itself and a template may print as it is. Not reachable from a template. */
export function engineHtml(html: string): unknown {
  return new Safe(html)
}

const BLOCKED_KEYS = new Set(["__proto__", "constructor", "prototype"])

function lookup(scope: Record<string, unknown>, segs: string[]): unknown {
  let cur: unknown = scope
  for (const s of segs) {
    if (BLOCKED_KEYS.has(s)) return undefined
    if (cur === null || cur === undefined) return undefined
    if (typeof cur === "function") return undefined
    /* A product picker that knows its product: the path reads the product. */
    if (cur instanceof Linked) {
      cur = Object.prototype.hasOwnProperty.call(cur.fields, s) ? cur.fields[s] : shopifyField(cur, s)
      continue
    }
    if (Array.isArray(cur)) {
      if (s === "size" || s === "length") { cur = cur.length; continue }
      if (s === "first") { cur = cur[0]; continue }
      if (s === "last") { cur = cur[cur.length - 1]; continue }
      const n = Number(s)
      cur = Number.isInteger(n) ? cur[n] : undefined
      continue
    }
    if (typeof cur === "object") {
      /* A product or a collection also answers to Shopify's names for its fields: ./shopify-objects.ts. */
      /* A Shopify setting id is written padding-block-start; Storelib keeps it as padding_block_start. */
      const o = cur as Record<string, unknown>
      cur = Object.prototype.hasOwnProperty.call(o, s) ? o[s] : s.includes("-") && Object.prototype.hasOwnProperty.call(o, s.replace(/-/g, "_")) ? o[s.replace(/-/g, "_")] : shopifyField(cur, s)
      continue
    }
    if (typeof cur === "string" && (s === "size" || s === "length")) { cur = cur.length; continue }
    /* A colour setting has parts, as a Shopify colour does: `.rgb` is "255 136 0", `.alpha` 0 to 1. */
    if (typeof cur === "string" && COLOR_PARTS.has(s)) {
      const part = colorPart(cur, s)
      if (part === undefined) return undefined
      cur = part
      continue
    }
    return undefined
  }
  return typeof cur === "function" ? undefined : cur
}

function numeric(v: unknown): number {
  const n = Number(v)
  return typeof v === "string" && Number.isNaN(n) && /^\s*[$€£¥]/.test(v) ? priceNumber(v) : n
}

function truthy(v: unknown): boolean {
  if (v instanceof Safe) return v.html !== ""
  if (v instanceof Linked) return v.href !== ""
  if (Array.isArray(v)) return v.length > 0
  return v !== undefined && v !== null && v !== false && v !== "" && !(typeof v === "number" && Number.isNaN(v))
}

function str(v: unknown): string {
  if (v === undefined || v === null || v === false) return ""
  if (v instanceof Safe) return v.html
  if (v instanceof Linked) return v.href
  if (typeof v === "object") return JSON.stringify(v)
  return String(v)
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string)
}

type Filter = (v: unknown, args: unknown[], ctx: RenderContext) => unknown

const FILTERS: Record<string, Filter> = {
  default: (v, [d]) => (truthy(v) ? v : d),
  upcase: (v) => str(v).toUpperCase(),
  downcase: (v) => str(v).toLowerCase(),
  capitalize: (v) => { const s = str(v); return s.charAt(0).toUpperCase() + s.slice(1) },
  strip: (v) => str(v).trim(),
  size: (v) => (Array.isArray(v) || typeof v === "string" ? v.length : 0),
  /** The first item of a list, or the first character of a string. */
  first: (v) => (Array.isArray(v) ? v[0] : typeof v === "string" ? v.slice(0, 1) : undefined),
  /** The last item of a list, or the last character of a string. */
  last: (v) => (Array.isArray(v) ? v[v.length - 1] : typeof v === "string" ? v.slice(-1) : undefined),
  join: (v, [sep]) => (Array.isArray(v) ? v.map(str).join(str(sep ?? ", ")) : str(v)),
  truncate: (v, [n, tail]) => { const s = str(v); const len = Number(n ?? 50); return s.length > len ? s.slice(0, Math.max(0, len - 1)) + str(tail ?? "…") : s },
  append: (v, [s]) => str(v) + str(s),
  prepend: (v, [s]) => str(s) + str(v),
  replace: (v, [a, b]) => str(v).split(str(a)).join(str(b)),
  plus: (v, [n]) => Number(v) + Number(n),
  minus: (v, [n]) => Number(v) - Number(n),
  times: (v, [n]) => Number(v) * Number(n),
  divided_by: (v, [n]) => (Number(n) === 0 ? 0 : Number(v) / Number(n)),
  round: (v, [d]) => { const p = 10 ** Number(d ?? 0); return Math.round(Number(v) * p) / p },
  json: (v) => JSON.stringify(v ?? null),
  escape: (v) => escapeHtml(str(v)),
  /**
   * Only for values that were sanitised on the way in: richtext. What it
   * emits is looked at again as it is drawn: storelib/raw-html.ts.
   */
  raw: (v) => new Safe(str(v)),
  /**
   * An href that is one of ours or an http(s)/mailto/tel address; anything
   * else becomes "#". `/\other.site` is another site to a browser, which
   * reads the backslash as a slash, so it is not "one of ours".
   */
  url: (v) => safeHref(str(v)),
  /** A player address, or nothing. See EMBED_HOSTS. */
  embed: (v) => embedUrl(v),
  /**
   * A Google map for an address, typed the way a person writes it ("12 Rue
   * Oberkampf, Paris"), or for a Google Maps link they pasted. No key and no
   * embed code: {{ settings.address | map | embed }}.
   */
  map: (v) => { const s = str(v).trim(); return /^https?:\/\//i.test(s) ? mapEmbedSrc(s, []) : mapEmbedSrc("", [s]) },
  /** asset://… → the URL this account serves it from; a plain URL passes through. */
  asset: (v, _a, ctx) => { const s = str(v); return s.startsWith("asset://") ? (ctx.assets[s] ?? "") : s },
  /** A `datetime` for people to read: "long" (the default), "short", "time", "long_time" or "iso". */
  date: (v, [style]) => formatDatetime(str(v), style ?? "long"),
  /** The words of some markup, for an alt text or a title made from rich text. */
  strip_html: (v) => plainText(str(v)),
  /**
   * Each line with something on it, trimmed, as a list: a textarea somebody
   * typed one item per line. At most 100, so a pasted essay is not a loop of
   * ten thousand.
   */
  lines: (v) => str(v).split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== "").slice(0, 100),
  /** A colour with alpha, for overlays: {{ settings.color | alpha: 0.4 }} */
  alpha: (v, [a]) => {
    const m = str(v).match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
    if (!m) return str(v)
    let h = m[1]
    if (h.length === 3) h = h.split("").map((c) => c + c).join("")
    const n = parseInt(h, 16)
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Number(a ?? 1)})`
  },
}

/* ── Shopify's filters, as an imported theme writes them ────────────────────
   The ones a real theme uses (Horizon and Dawn measured: split, modulo,
   money, the colour filters, where, at_most and the rest), with Shopify's
   meaning, so a converted section prints what it printed there. Each is
   pure: a value in, a value out, nothing reached outside the render. */

/** Filters that, given markup, give markup back: they trim, join or replace text and add no tags of their own. */
const MARKUP_KEEPING = new Set(["strip", "lstrip", "rstrip", "strip_newlines", "append", "prepend", "replace", "replace_first", "remove", "remove_first", "upcase", "downcase", "capitalize", "default"])

const COLOR_PARTS = new Set(["red", "green", "blue", "alpha", "rgb", "rgba", "hue", "saturation", "lightness"])

function colorPart(v: string, part: string): string | number | undefined {
  const c = hexToRgb(v)
  if (!c) return undefined
  if (part === "red") return c.r
  if (part === "green") return c.g
  if (part === "blue") return c.b
  if (part === "alpha") return Math.round(c.a * 1000) / 1000
  if (part === "rgb") return `${c.r} ${c.g} ${c.b}`
  if (part === "rgba") return `${c.r} ${c.g} ${c.b} / ${Math.round(c.a * 1000) / 1000}`
  const hsl = rgbToHsl(c)
  return Math.round(part === "hue" ? hsl.h : part === "saturation" ? hsl.s : hsl.l)
}

function hexToRgb(v: unknown): { r: number; g: number; b: number; a: number } | null {
  const s = str(v).trim()
  let m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})([0-9a-f]{2})?$/i)
  if (m) {
    let h = m[1]
    if (h.length === 3) h = h.split("").map((c) => c + c).join("")
    const n = parseInt(h, 16)
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: m[2] ? parseInt(m[2], 16) / 255 : 1 }
  }
  m = s.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+))?\s*\)$/i)
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] !== undefined ? +m[4] : 1 }
  return null
}

function rgbToHsl({ r, g, b }: { r: number; g: number; b: number }): { h: number; s: number; l: number } {
  const R = r / 255, G = g / 255, B = b / 255
  const max = Math.max(R, G, B), min = Math.min(R, G, B)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l: l * 100 }
  const d = max - min
  const sat = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4
  return { h: h * 60, s: sat * 100, l: l * 100 }
}

function hslToRgb(h: number, sat: number, l: number): { r: number; g: number; b: number } {
  const S = sat / 100, L = l / 100
  const k = (n: number) => (n + h / 30) % 12
  const a = S * Math.min(L, 1 - L)
  const f = (n: number) => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) }
}

function colorOut(c: { r: number; g: number; b: number; a: number }): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)))
  if (c.a < 1) return `rgba(${clamp(c.r)}, ${clamp(c.g)}, ${clamp(c.b)}, ${Math.round(c.a * 1000) / 1000})`
  return "#" + [c.r, c.g, c.b].map((n) => clamp(n).toString(16).padStart(2, "0")).join("")
}

function shiftLightness(v: unknown, by: number): string {
  const c = hexToRgb(v)
  if (!c) return str(v)
  const hsl = rgbToHsl(c)
  return colorOut({ ...hslToRgb(hsl.h, hsl.s, Math.max(0, Math.min(100, hsl.l + by))), a: c.a })
}

/** Shopify's `money` for a number of cents; a price already written as money ("$48.00") stays as it is. */
function money(v: unknown, code: boolean): string {
  if (typeof v === "string" && /[^\d.\s-]/.test(v)) return v
  const cents = Number(v)
  if (!Number.isFinite(cents)) return str(v)
  const s = `$${(cents / 100).toFixed(2)}`
  return code ? `${s} USD` : s
}

/** A short stable hash, for the ids a theme makes with md5: the same input, the same id. */
function shortHash(s: string): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193
  for (let i = 0; i < s.length; i++) {
    h1 = Math.imul(h1 ^ s.charCodeAt(i), 16777619)
    h2 = Math.imul(h2 + s.charCodeAt(i), 2246822519)
  }
  return ((h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0")).repeat(2)
}

const listOf = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined || v === null || v === "" ? [] : [v])
const prop = (item: unknown, key: string): unknown => {
  if (item instanceof Linked) return Object.prototype.hasOwnProperty.call(item.fields, key) ? item.fields[key] : undefined
  if (item && typeof item === "object" && !BLOCKED_KEYS.has(key)) {
    const o = item as Record<string, unknown>
    if (Object.prototype.hasOwnProperty.call(o, key)) return o[key]
    const settings = o.settings as Record<string, unknown> | undefined
    if (settings && typeof settings === "object" && Object.prototype.hasOwnProperty.call(settings, key)) return settings[key]
  }
  return undefined
}

Object.assign(FILTERS, {
  split: (v: unknown, [sep]: unknown[]) => { const s = str(v); const d = str(sep ?? " "); return (d === "" ? [...s] : s.split(d)).slice(0, 500) },
  strip_newlines: (v: unknown) => str(v).replace(/\r?\n/g, ""),
  lstrip: (v: unknown) => str(v).replace(/^\s+/, ""),
  rstrip: (v: unknown) => str(v).replace(/\s+$/, ""),
  remove: (v: unknown, [a]: unknown[]) => str(v).split(str(a)).join(""),
  remove_first: (v: unknown, [a]: unknown[]) => str(v).replace(str(a), ""),
  replace_first: (v: unknown, [a, b]: unknown[]) => str(v).replace(str(a), str(b)),
  truncatewords: (v: unknown, [n, tail]: unknown[]) => { const w = str(v).split(/\s+/).filter(Boolean); const k = Math.max(1, Number(n ?? 15)); return w.length > k ? w.slice(0, k).join(" ") + str(tail ?? "…") : w.join(" ") },
  url_encode: (v: unknown) => encodeURIComponent(str(v)),
  url_escape: (v: unknown) => encodeURI(str(v)),
  handleize: (v: unknown) => str(v).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
  handle: (v: unknown) => str(v).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
  pluralize: (v: unknown, [one, many]: unknown[]) => (Number(v) === 1 ? str(one) : str(many)),
  modulo: (v: unknown, [n]: unknown[]) => (Number(n) === 0 ? 0 : Number(v) % Number(n)),
  at_most: (v: unknown, [n]: unknown[]) => Math.min(Number(v), Number(n)),
  at_least: (v: unknown, [n]: unknown[]) => Math.max(Number(v), Number(n)),
  ceil: (v: unknown) => Math.ceil(Number(v)),
  floor: (v: unknown) => Math.floor(Number(v)),
  abs: (v: unknown) => Math.abs(Number(v)),
  money: (v: unknown) => money(v, false),
  money_without_trailing_zeros: (v: unknown) => money(v, false).replace(/\.00(?=\D*$)/, ""),
  money_with_currency: (v: unknown) => money(v, true),
  money_without_currency: (v: unknown) => money(v, false).replace(/^\$/, ""),
  color_lighten: (v: unknown, [n]: unknown[]) => shiftLightness(v, Number(n ?? 0)),
  color_darken: (v: unknown, [n]: unknown[]) => shiftLightness(v, -Number(n ?? 0)),
  /** color_modify: 'alpha' | 'red' | 'green' | 'blue' | 'hue' | 'saturation' | 'lightness', value. */
  color_modify: (v: unknown, [what, n]: unknown[]) => {
    const c = hexToRgb(v)
    if (!c) return str(v)
    const k = str(what)
    const x = Number(n)
    if (k === "alpha") return colorOut({ ...c, a: Math.max(0, Math.min(1, x)) })
    if (k === "red" || k === "green" || k === "blue") return colorOut({ ...c, [k === "red" ? "r" : k === "green" ? "g" : "b"]: x })
    const hsl = rgbToHsl(c)
    const next = { ...hsl, [k === "hue" ? "h" : k === "saturation" ? "s" : "l"]: x }
    return colorOut({ ...hslToRgb(next.h, next.s, next.l), a: c.a })
  },
  color_to_rgb: (v: unknown) => { const c = hexToRgb(v); return c ? (c.a < 1 ? `rgba(${c.r}, ${c.g}, ${c.b}, ${c.a})` : `rgb(${c.r}, ${c.g}, ${c.b})`) : str(v) },
  color_to_hex: (v: unknown) => { const c = hexToRgb(v); return c ? colorOut({ ...c, a: 1 }) : str(v) },
  color_to_hsl: (v: unknown) => { const c = hexToRgb(v); if (!c) return str(v); const h = rgbToHsl(c); return `hsl(${Math.round(h.h)}, ${Math.round(h.s)}%, ${Math.round(h.l)}%)` },
  color_brightness: (v: unknown) => { const c = hexToRgb(v); return c ? Math.round((c.r * 299 + c.g * 587 + c.b * 114) / 1000) : 0 },
  color_extract: (v: unknown, [k]: unknown[]) => { const c = hexToRgb(v); if (!c) return 0; const hsl = rgbToHsl(c); const m: Record<string, number> = { red: c.r, green: c.g, blue: c.b, alpha: c.a, hue: Math.round(hsl.h), saturation: Math.round(hsl.s), lightness: Math.round(hsl.l) }; return m[str(k)] ?? 0 },
  md5: (v: unknown) => shortHash(str(v)),
  sha1: (v: unknown) => shortHash(str(v)),
  sha256: (v: unknown) => shortHash(str(v)),
  uniq: (v: unknown) => [...new Set(listOf(v))],
  compact: (v: unknown) => listOf(v).filter((x) => x !== null && x !== undefined && x !== ""),
  reverse: (v: unknown) => (Array.isArray(v) ? [...v].reverse() : [...str(v)].reverse().join("")),
  sort: (v: unknown, [key]: unknown[]) => [...listOf(v)].sort((a, b) => { const A = key ? prop(a, str(key)) : a; const B = key ? prop(b, str(key)) : b; return str(A) < str(B) ? -1 : str(A) > str(B) ? 1 : 0 }),
  sort_natural: (v: unknown, [key]: unknown[]) => [...listOf(v)].sort((a, b) => str(key ? prop(a, str(key)) : a).localeCompare(str(key ? prop(b, str(key)) : b), undefined, { numeric: true, sensitivity: "base" })),
  slice: (v: unknown, [from, len]: unknown[]) => { const f = Number(from ?? 0); const n = Number(len ?? 1); return Array.isArray(v) ? v.slice(f < 0 ? v.length + f : f, (f < 0 ? v.length + f : f) + n) : str(v).substr(f, n) },
  concat: (v: unknown, [other]: unknown[]) => [...listOf(v), ...listOf(other)],
  /** where: 'available' keeps the items whose field is true; where: 'type', 'shirt' keeps the ones whose field equals it. */
  where: (v: unknown, [key, value]: unknown[]) => listOf(v).filter((x) => { const got = prop(x, str(key)); return value === undefined ? truthy(got) : str(got) === str(value) }),
  find: (v: unknown, [key, value]: unknown[]) => listOf(v).find((x) => str(prop(x, str(key))) === str(value)),
  find_index: (v: unknown, [key, value]: unknown[]) => listOf(v).findIndex((x) => str(prop(x, str(key))) === str(value)),
  has: (v: unknown, [key, value]: unknown[]) => listOf(v).some((x) => (value === undefined ? truthy(prop(x, str(key))) : str(prop(x, str(key))) === str(value))),
  reject: (v: unknown, [key, value]: unknown[]) => listOf(v).filter((x) => { const got = prop(x, str(key)); return value === undefined ? !truthy(got) : str(got) !== str(value) }),
  /** map: 'title' takes one field from each item. A plain `map` with no field stays the address filter above. */
  sum: (v: unknown, [key]: unknown[]) => listOf(v).reduce<number>((n, x) => n + (Number(key ? prop(x, str(key)) : x) || 0), 0),
})

/* `map` is the address filter here; with a field name and a list it is Shopify's map. */
{
  const mapAddress = FILTERS.map
  FILTERS.map = (v, args, ctx) => (Array.isArray(v) && args.length > 0 ? v.map((x) => prop(x, str(args[0]))) : mapAddress(v, args, ctx))
}

export const FILTER_NAMES = Object.keys(FILTERS)

/**
 * One of the template language's filters, by name, for the import-time
 * evaluator (lib/storelib-theme/shopify/static-liquid.ts), so a theme's
 * settings-driven CSS is worked out with the same filters a section draws
 * with. Null for a name the language does not have.
 */
export function liquidFilter(name: string): ((v: unknown, args: unknown[]) => unknown) | null {
  const f = Object.prototype.hasOwnProperty.call(FILTERS, name) ? FILTERS[name] : undefined
  if (!f) return null
  const ctx = { settings: {}, blocks: [], theme: {}, page: { template: "index" }, section: { id: "", type: "" }, scheme: {}, assets: {} } as unknown as RenderContext
  return (v, args) => f(v, args, ctx)
}

/* ── conditions: `visible_if` ─────────────────────────────────────────── */

export type ParsedCondition = { ok: true; expr: Expr; paths: string[][] } | { ok: false; message: string }

const conditionCache = new Map<string, ParsedCondition>()

/**
 * A setting's `visible_if`, written the way Shopify writes it:
 * `{{ section.settings.source == 'chosen' }}`. Parsed with this language's
 * own expression grammar, so a condition can say what an `{% if %}` can and
 * nothing more, and a theme author learns one syntax rather than two.
 */
export function parseCondition(source: string): ParsedCondition {
  const hit = conditionCache.get(source)
  if (hit) return hit
  let out: ParsedCondition
  const m = source.trim().match(/^\{\{([\s\S]*)\}\}$/)
  if (!m || m[1].trim() === "") {
    out = { ok: false, message: `write it as {{ … }}, for example "{{ section.settings.layout == 'grid' }}"` }
  } else {
    try {
      const expr = parseExpr(m[1].trim(), 1)
      const paths: string[][] = []
      const walk = (e: Expr) => {
        switch (e.t) {
          case "path": paths.push(e.segs); break
          case "not": walk(e.e); break
          case "bin": walk(e.l); walk(e.r); break
          case "filter": walk(e.e); e.args.forEach(walk); break
          case "range": walk(e.from); walk(e.to); break
        }
      }
      walk(expr)
      out = { ok: true, expr, paths }
    } catch (e) {
      out = { ok: false, message: e instanceof Error ? e.message : String(e) }
    }
  }
  /* Conditions come from a handful of schemas; the cap only stops a
     generated one per keystroke from growing this without end. */
  if (conditionCache.size > 500) conditionCache.clear()
  conditionCache.set(source, out)
  return out
}

const CONDITION_CONTEXT = { settings: {}, blocks: [], theme: {}, scheme: {}, assets: {} } as unknown as RenderContext

/**
 * Does the condition hold for these values? A condition that does not parse
 * holds: showing a setting that should have been hidden costs a line in a
 * panel, and hiding one that should show makes it impossible to change.
 */
export function conditionHolds(source: string, scope: Record<string, unknown>): boolean {
  const parsed = parseCondition(source)
  if (!parsed.ok) return true
  try {
    return truthy(evaluate(parsed.expr, scope, CONDITION_CONTEXT))
  } catch {
    return true
  }
}

function evaluate(e: Expr, scope: Record<string, unknown>, ctx: RenderContext): unknown {
  switch (e.t) {
    case "lit": return e.v
    case "path": {
      if (e.keys) {
        const segs = e.segs.map((seg, i) => (e.keys && e.keys[i] ? str(evaluate(e.keys[i], scope, ctx)) : seg))
        return evaluate({ t: "path", segs }, scope, ctx)
      }
      const root = e.segs[0]
      if (!Object.prototype.hasOwnProperty.call(scope, root)) {
        const locals = (scope as { [LOCALS]?: Record<string, unknown> })[LOCALS]
        if (locals && Object.prototype.hasOwnProperty.call(locals, root)) return lookup(locals, e.segs)
      }
      return lookup(scope, e.segs)
    }
    case "not": return !truthy(evaluate(e.e, scope, ctx))
    case "bin": {
      if (e.op === "and") return truthy(evaluate(e.l, scope, ctx)) && truthy(evaluate(e.r, scope, ctx))
      if (e.op === "or") return truthy(evaluate(e.l, scope, ctx)) || truthy(evaluate(e.r, scope, ctx))
      /* A Linked value compares as the address it prints as. */
      const lv = evaluate(e.l, scope, ctx)
      const rv = evaluate(e.r, scope, ctx)
      const l = lv instanceof Linked ? lv.href : lv
      const r = rv instanceof Linked ? rv.href : rv
      switch (e.op) {
        case "==": return l === r || (l == null && r == null) || (typeof l !== "object" && typeof r !== "object" && String(l) === String(r))
        case "!=": return !(l === r || (l == null && r == null) || (typeof l !== "object" && typeof r !== "object" && String(l) === String(r)))
        /* "$48.00" compares as 48, so two prices compare as prices. */
        case "<": return numeric(l) < numeric(r)
        case "<=": return numeric(l) <= numeric(r)
        case ">": return numeric(l) > numeric(r)
        case ">=": return numeric(l) >= numeric(r)
        case "contains": return Array.isArray(l) ? l.includes(r) : str(l).includes(str(r))
      }
      return false
    }
    case "filter": {
      const f = FILTERS[e.name]
      if (!f) return evaluate(e.e, scope, ctx)
      const input = evaluate(e.e, scope, ctx)
      const args = e.args.map((a) => evaluate(a, scope, ctx))
      /*
        MARKUP STAYS MARKUP through the filters that only tidy or join text:
        a capture built of escaped values and the theme's own tags, passed
        through strip or append, is still that markup. What is joined to it
        and was not markup already is escaped first.
      */
      /* A string written in the template itself is the author's markup, as the template around it is: `"<h3>" | append: title`. */
      const authored = (x: Expr, v: unknown) => x.t === "lit" && typeof v === "string" && /<\/?[a-z]/i.test(v)
      if ((input instanceof Safe || authored(e.e, input)) && MARKUP_KEEPING.has(e.name)) {
        const out = f(input, args.map((a, i) => (a instanceof Safe || typeof a === "number" || e.args[i]?.t === "lit" ? a : escapeHtml(str(a)))), ctx)
        return typeof out === "string" ? new Safe(out) : out
      }
      return f(input, args, ctx)
    }
    case "range": {
      const a = Math.trunc(Number(evaluate(e.from, scope, ctx)))
      const b = Math.trunc(Number(evaluate(e.to, scope, ctx)))
      if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return []
      return Array.from({ length: Math.min(MAX_RANGE, b - a + 1) }, (_, i) => a + i)
    }
  }
}

/** Thrown inside a loop's body by {% break %} and {% continue %}, caught by the loop. Never escapes a render. */
class LoopSignal {
  constructor(public readonly kind: "break" | "continue") {}
}

export interface RenderOptions {
  /**
   * "html" (the default) escapes output for markup. "css" is for a section's
   * style block, where HTML escaping would turn a quote into `&quot;` and
   * break the rule: a value is stripped of the characters that could end a
   * declaration or a block instead, since no legitimate CSS value holds one.
   */
  mode?: "html" | "css"
  /**
   * The builder is drawing: every output of a section's or a block's own
   * setting is preceded by a mark naming the setting, which
   * `applySettingMarks` (./marks.ts) turns into `data-sl-setting` on the
   * element it lands in. Never on a published page. Ignored in "css" mode.
   */
  marks?: boolean
  /**
   * What `assign` and `capture` write, shared between renders of the same
   * instance: render.ts draws a section's markup and then its stylesheet
   * with one of these, so a value worked out in the markup is there for the
   * <style> that reads it, as it is in a Shopify section. Absent, each
   * render has its own.
   */
  locals?: Record<string, unknown>
}

/** A fresh store for RenderOptions.locals. */
export function renderLocals(): Record<string, unknown> {
  return Object.create(null) as Record<string, unknown>
}

/** The setting an output reads, when it reads one of the section's or a block's own. */
function markOf(e: Expr, scope: Record<string, unknown>, ctx: RenderContext): string {
  let base = e
  while (base.t === "filter") base = base.e
  if (base.t !== "path") return ""
  const segs = base.segs
  /* `settings.x` is the block's own inside a block's file, and the section's anywhere else. */
  if (segs[0] === "settings" && segs.length >= 2 && scope.settings === ctx.settings) {
    const id = ctx.block && typeof ctx.block.id === "string" ? ctx.block.id : null
    return markFor(segs[1], id)
  }
  if (segs[0] === "section" && segs[1] === "settings" && segs.length >= 3) return markFor(segs[2], null)
  if (segs[1] === "settings" && segs.length >= 3) {
    const root = scope[segs[0]]
    if (root && typeof root === "object" && isOwnBlock(root, ctx)) {
      const id = (root as { id?: unknown }).id
      if (typeof id === "string" && id) return markFor(segs[2], id)
    }
  }
  return ""
}

/** A block of this section (or the block being drawn), not a product card or anything else shaped like one. */
function isOwnBlock(v: object, ctx: RenderContext): boolean {
  if (v === ctx.block) return true
  const inTree = (list: unknown): boolean =>
    Array.isArray(list) && list.some((b) => b === v || (!!b && typeof b === "object" && inTree((b as { blocks?: unknown }).blocks)))
  return inTree(ctx.blocks) || inTree(ctx.sectionScope?.blocks)
}

/**
 * A value on its way into a stylesheet, kept to being a value.
 *
 * `{` and `}` would let it close the rule it is in and open one of its own.
 * `;` would let it end its own declaration and add more to the rule — not an
 * escape, but enough to add a `background: url(…)` nobody wrote. `<` and `>`
 * would let it end the <style> element. `@import` would fetch. A real CSS
 * value contains none of them, so taking them out costs nothing and closes
 * all four.
 */
function cssValue(s: string): string {
  return s.replace(/[<>{};]/g, "").replace(/@import/gi, "")
}

export function renderTemplate(tpl: CompiledTemplate, ctx: RenderContext, opts: RenderOptions = {}): string {
  const css = opts.mode === "css"
  const marks = opts.marks === true && !css
  const out: string[] = []
  /**
   * `settings` and `section.settings` are the same settings, and so are
   * `blocks` and `section.blocks`. Anybody who has written a theme before
   * reaches for the longer spelling, and reaching for it used to render
   * nothing at all: `section` was an object, `.settings` was not on it, and
   * a missing value is an empty string. One alias costs nothing and removes
   * a whole class of section that looks right and draws blank.
   */
  const base: Record<string, unknown> = {
    settings: ctx.settings,
    blocks: ctx.blocks,
    // Block-shaped, so a template loops over it with the body it already has.
    products: ctx.products ?? [],
    /* The creator's published collections the page was handed, block-shaped like products. */
    collections: ctx.collections ?? [],
    theme: ctx.theme,
    scheme: ctx.scheme,
    page: ctx.page,
    section: ctx.sectionScope ? { ...ctx.section, ...ctx.sectionScope } : { ...ctx.section, settings: ctx.settings, blocks: ctx.blocks },
    block: ctx.block ?? null,
    /* The store, its addresses, and the visitor: lib/storelib-theme/globals.ts.
       And what the storefront knows about itself: see RenderContext. */
    shop: ctx.shop ?? {},
    routes: ctx.routes ?? {},
    customer: ctx.customer ?? null,
    wishlist: ctx.wishlist ?? null,
    creator: ctx.creator ?? {},
    product: ctx.product ?? null,
    /* In a theme block: what it was drawn for (ContentForRequest.closest). */
    closest: ctx.closest ?? {},
  }
  /* What assign and capture wrote, for the whole render (see LOCALS). */
  const locals: Record<string, unknown> = opts.locals ?? Object.create(null)
  ;(base as { [LOCALS]?: Record<string, unknown> })[LOCALS] = locals
  const setLocal = (name: string, value: unknown) => {
    if (!(name in locals) && Object.keys(locals).length >= MAX_LOCALS) return
    locals[name] = value
  }
  /* How many loops the walk is inside: a {% break %} outside every loop does nothing, as in Liquid. */
  let loopDepth = 0
  const walk = (nodes: Node[], scope: Record<string, unknown>) => {
    for (const n of nodes) {
      switch (n.kind) {
        case "text": out.push(n.value); break
        case "output": {
          const v = evaluate(n.expr, scope, ctx)
          if (marks) {
            const mark = markOf(n.expr, scope, ctx)
            if (mark) out.push(mark)
          }
          /* In a stylesheet `raw` is checked with the whole sheet, in render.ts. */
          const printed = v instanceof Safe ? (css ? v.html : guardRawHtml(v.html)) : css ? cssValue(str(v)) : escapeHtml(str(v))
          /* A value cannot carry a mark of its own into the markup: only the engine writes them. */
          out.push(marks ? stripMarks(printed) : printed)
          break
        }
        case "if": {
          const branch = n.branches.find((b) => truthy(evaluate(b.cond, scope, ctx)))
          if (branch) walk(branch.body, scope)
          else if (n.else) walk(n.else, scope)
          break
        }
        case "for": {
          const list = evaluate(n.list, scope, ctx)
          let items = Array.isArray(list) ? list : []
          if (n.offset || n.limit) {
            const count = (e: Expr | undefined, fallback: number) => {
              if (!e) return fallback
              const v = Number(evaluate(e, scope, ctx))
              return Number.isFinite(v) ? Math.max(0, Math.floor(v)) : fallback
            }
            const from = count(n.offset, 0)
            items = items.slice(from, from + count(n.limit, items.length))
          }
          if (n.reversed) items = [...items].reverse()
          if (items.length === 0) { if (n.else) walk(n.else, scope); break }
          loopDepth++
          try {
          for (let idx = 0; idx < items.length; idx++) {
            try {
              walk(n.body, {
                ...scope,
                [n.item]: items[idx],
                forloop: { index: idx + 1, index0: idx, first: idx === 0, last: idx === items.length - 1, length: items.length, rindex: items.length - idx, rindex0: items.length - idx - 1 },
              })
            } catch (signal) {
              if (!(signal instanceof LoopSignal)) throw signal
              if (signal.kind === "break") break
            }
          }
          } finally {
            loopDepth--
          }
          break
        }
        case "break":
        case "continue":
          if (loopDepth > 0) throw new LoopSignal(n.kind)
          break
        case "assign":
          setLocal(n.name, evaluate(n.expr, scope, ctx))
          break
        case "capture": {
          /* The body is drawn as any other markup, escaped where it prints values, and kept as markup. */
          const start = out.length
          walk(n.body, scope)
          const text = out.splice(start).join("").slice(0, MAX_CAPTURE)
          setLocal(n.name, new Safe(marks ? stripMarks(text) : text))
          break
        }
        case "content_for": {
          /* Built by render.ts from blocks it has drawn and guarded; a stylesheet has no blocks. */
          if (css || !ctx.contentFor) break
          const closest = n.closest ? Object.fromEntries(Object.entries(n.closest).map(([k, e]) => [k, evaluate(e, scope, ctx) ?? null])) : undefined
          const near = closest ? { closest } : {}
          out.push(n.what === "blocks" ? ctx.contentFor({ what: "blocks", ...near }) : ctx.contentFor({ what: "block", type: n.type, id: n.id, ...near }))
          break
        }
      }
    }
  }
  walk(tpl.nodes, base)
  return out.join("")
}

/**
 * Every path a template reads, with the line that reads it and the loop
 * variables in scope where it does. This is what lets the compiler tell
 * `{{ settings.headng }}` from `{{ settings.heading }}`: both are legal
 * expressions, and only one of them will ever hold anything.
 *
 * `over` says what each loop variable iterates, so `block.settings.x` inside
 * `{% for block in blocks %}` can be checked against the block settings the
 * schema declares, and a loop over something else is left alone.
 */
export interface PathRef {
  segs: string[]
  line: number
  /** Loop variable name → the path it iterates, e.g. "block" → "blocks". */
  bound: Map<string, string>
}

export function pathRefs(tpl: CompiledTemplate): PathRef[] {
  const out: PathRef[] = []
  const expr = (e: Expr, line: number, bound: Map<string, string>) => {
    switch (e.t) {
      case "path": {
        /* Up to the first part worked out as it runs: `settings[key]` is a read of settings. */
        const cut = e.keys ? Math.min(...Object.keys(e.keys).map(Number)) : e.segs.length
        out.push({ segs: e.segs.slice(0, cut), line, bound })
        if (e.keys) Object.values(e.keys).forEach((k) => expr(k, line, bound))
        break
      }
      case "not": expr(e.e, line, bound); break
      case "bin": expr(e.l, line, bound); expr(e.r, line, bound); break
      case "filter": expr(e.e, line, bound); e.args.forEach((a) => expr(a, line, bound)); break
      case "range": expr(e.from, line, bound); expr(e.to, line, bound); break
    }
  }
  const walk = (nodes: Node[], bound: Map<string, string>) => {
    for (const n of nodes) {
      if (n.kind === "output") expr(n.expr, n.line, bound)
      else if (n.kind === "content_for" && n.closest) Object.values(n.closest).forEach((e) => expr(e, n.line, bound))
      else if (n.kind === "assign") expr(n.expr, n.line, bound)
      else if (n.kind === "capture") walk(n.body, bound)
      else if (n.kind === "if") {
        n.branches.forEach((b) => { expr(b.cond, n.line, bound); walk(b.body, bound) })
        if (n.else) walk(n.else, bound)
      } else if (n.kind === "for") {
        expr(n.list, n.line, bound)
        if (n.limit) expr(n.limit, n.line, bound)
        if (n.offset) expr(n.offset, n.line, bound)
        const inner = new Map(bound)
        inner.set(n.item, n.list.t === "path" ? n.list.segs.join(".") : "")
        walk(n.body, inner)
        if (n.else) walk(n.else, bound)
      }
    }
  }
  /* A name assigned or captured anywhere is the template's own, read before or after (a loop goes round). */
  walk(tpl.nodes, new Map([...assignedNames(tpl)].map((n) => [n, ""])))
  return out
}

/** Every name a template assigns or captures. */
export function assignedNames(tpl: CompiledTemplate): Set<string> {
  const names = new Set<string>()
  const walk = (nodes: Node[]) => {
    for (const n of nodes) {
      if (n.kind === "assign") names.add(n.name)
      else if (n.kind === "capture") { names.add(n.name); walk(n.body) }
      else if (n.kind === "if") { n.branches.forEach((b) => walk(b.body)); if (n.else) walk(n.else) }
      else if (n.kind === "for") { walk(n.body); if (n.else) walk(n.else) }
    }
  }
  walk(tpl.nodes)
  return names
}

/** Every path a template reads, for the AI and for "setting X is unused" warnings. */
export function pathsRead(tpl: CompiledTemplate): string[] {
  const seen = new Set<string>()
  const expr = (e: Expr) => {
    switch (e.t) {
      case "path": seen.add((e.keys ? e.segs.slice(0, Math.min(...Object.keys(e.keys).map(Number))) : e.segs).join(".")); break
      case "not": expr(e.e); break
      case "bin": expr(e.l); expr(e.r); break
      case "filter": expr(e.e); e.args.forEach(expr); break
      case "range": expr(e.from); expr(e.to); break
    }
  }
  const walk = (nodes: Node[]) => {
    for (const n of nodes) {
      if (n.kind === "output") expr(n.expr)
      else if (n.kind === "assign") expr(n.expr)
      else if (n.kind === "capture") walk(n.body)
      else if (n.kind === "if") { n.branches.forEach((b) => { expr(b.cond); walk(b.body) }); if (n.else) walk(n.else) }
      else if (n.kind === "for") { expr(n.list); if (n.limit) expr(n.limit); if (n.offset) expr(n.offset); walk(n.body); if (n.else) walk(n.else) }
    }
  }
  walk(tpl.nodes)
  return [...seen].sort()
}
