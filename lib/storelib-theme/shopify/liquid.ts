/**
 * ===========================================================================
 *  SHOPIFY LIQUID, REWRITTEN AS STORELIB'S TEMPLATE LANGUAGE
 * ===========================================================================
 * The other half of ./convert.ts. That file reads a Shopify theme's folders;
 * this one takes the text of one `.liquid` file and writes the same markup
 * in the subset storelib/template.ts reads: `{{ }}`, if, for, content_for.
 *
 * NOTHING HERE RUNS LIQUID. There is no Liquid engine in this repository and
 * this file does not add one. It reads a tag, decides what the tag means,
 * and writes text. A tag that would compute something at render time is
 * either spelled the way Storelib spells it or taken out, and what was taken
 * out is said in the report, one line per kind of thing per file. Whatever
 * this writes then goes through compileSection like any other file, which
 * refuses anything unsafe on its own: this file is a translator, not a gate.
 *
 *   {{ section.settings.x }}      {{ settings.x }}
 *   {{ settings.x }}              {{ theme.settings.shopify.x }} (the theme's own settings, carried in config/settings.json)
 *   {% unless x %}                {% if not (x) %}
 *   {% case x %}{% when 'a' %}    {% if x == "a" %} … {% elsif … %}
 *   {% for b in section.blocks %} {% for b in blocks %}
 *   {% render 'card', a: b %}     the snippet's own markup, written in place, with `a` read as `b`
 *   {% assign x = y %}            every later `x` read as `y`
 *   {{ x | money }}               {{ x }}, and the report says the filter went
 *   {{ 'key' | t }}               the words from locales/en.default.json
 *   {{ img | image_url | image_tag }}  <img src="{{ img }}" alt="">
 *
 * A NAME STORELIB CANNOT READ IS READ AS NOTHING. `request.design_mode`,
 * `cart.item_count`, a setting the import dropped, a variable built by a
 * capture: each becomes `null`, which is what Liquid itself gives for a name
 * it does not know. So `{% if request.design_mode %}` takes its else branch,
 * `{% unless cart %}` its body, and `{{ x | default: "Shop" }}` prints Shop,
 * exactly as an unknown name would have behaved on Shopify. Nothing is
 * guessed into existence.
 *
 * PURE. Text in, text out, and notes through the context. Never throws for
 * anything a file can contain: an expression it cannot read is read as
 * nothing, a tag it does not know is removed, an unclosed block is closed.
 */
import { FILTER_NAMES } from "../storelib/template"

// ── What the file being converted declares ─────────────────────────────────

export interface Declared {
  /** A section (sections/*.liquid) or a theme block (blocks/*.liquid). */
  mode: "section" | "block"
  /** The value holding settings that survived the schema's conversion, id → Storelib type. */
  settings: Map<string, string>
  /** The settings of the section's own blocks, all block types together, id → type. */
  blockSettings: Map<string, string>
  /** The section declares blocks of its own. */
  localBlocks: boolean
  /** The section (or block) holds theme blocks: `{% content_for "blocks" %}` may stay. */
  themeBlocks: boolean
}

export interface CssChunk {
  css: string
  /** Read from `{% style %}`, so it may carry `{{ }}` and tags; left out first when the CSS does not compile. */
  dynamic: boolean
}

export interface LiquidContext {
  declared: Declared
  /** A key of locales/en.default.json, or null when the theme has no such key. */
  translate: (key: string) => string | null
  /** A file in snippets/, by name, or null. */
  snippet: (name: string) => string | null
  /** A file in assets/, by its name: a picture's asset reference, a stylesheet's text, or a script. */
  asset: (name: string) => { kind: "image"; ref: string } | { kind: "css"; text: string } | { kind: "script" } | null
  /** An SVG in assets/, cleaned (no script, no on…= handler, no outside reference), for `inline_asset_content`. */
  inlineSvg?: (name: string) => string | null
  /** One line for the report. The caller removes repeats. */
  note: (message: string) => void
  /** CSS gathered on the way: `{% stylesheet %}`, `{% style %}`, inlined stylesheets. */
  styles: CssChunk[]
  /** A section's `{% javascript %}`, kept for the compiler to judge. */
  script: string | null
  /** Snippets whose `{% stylesheet %}` was already taken, so a snippet used ten times adds its CSS once. */
  seen: Set<string>
  /** Characters a file may still grow by through inlined snippets. */
  budget: { chars: number }
  /** Names read that Storelib has no meaning for, read as nothing, with how often: for the report. */
  unread?: Map<string, number>
  /**
   * Every file's {% stylesheet %} is in the theme's stylesheet for the whole
   * page, as Shopify puts them all into one styles.css: the converter
   * gathered them, so a file leaves its own out.
   */
  stylesheetsGlobal?: boolean
}

/** How deep `{% render %}` is followed: a card that renders a price that renders an icon. */
const MAX_SNIPPET_DEPTH = 8

// ── Liquid's own tokens ─────────────────────────────────────────────────────

type LTok =
  | { kind: "text"; value: string }
  | { kind: "output"; value: string; ltrim: boolean; rtrim: boolean }
  | { kind: "tag"; name: string; rest: string; ltrim: boolean; rtrim: boolean }
  | { kind: "block"; name: string; rest: string; body: string; ltrim: boolean; rtrim: boolean }

/** Tags whose body is not Liquid to be read as tags: kept as text, or taken whole. */
const RAW_BLOCKS = new Set(["comment", "raw", "doc", "schema", "javascript", "stylesheet", "style"])

/**
 * The file as text, outputs and tags. A `{%-` or `-%}` trims the whitespace
 * beside it, the way Liquid does, and then the dash is gone: Storelib's
 * language has no whitespace control and does not need any. A `{{` that is
 * never closed is text, which the writer below makes safe.
 */
export function tokenizeLiquid(src: string): LTok[] {
  const toks: LTok[] = []
  let i = 0
  const open = /\{\{|\{%/g
  while (i < src.length) {
    open.lastIndex = i
    const m = open.exec(src)
    if (!m) {
      toks.push({ kind: "text", value: src.slice(i) })
      break
    }
    if (m.index > i) toks.push({ kind: "text", value: src.slice(i, m.index) })
    const isOutput = m[0] === "{{"
    const end = src.indexOf(isOutput ? "}}" : "%}", m.index + 2)
    if (end < 0) {
      toks.push({ kind: "text", value: src.slice(m.index) })
      break
    }
    let inner = src.slice(m.index + 2, end)
    const ltrim = inner.startsWith("-")
    if (ltrim) inner = inner.slice(1)
    const rtrim = inner.endsWith("-")
    if (rtrim) inner = inner.slice(0, -1)
    i = end + 2
    if (isOutput) {
      toks.push({ kind: "output", value: inner.trim(), ltrim, rtrim })
      continue
    }
    const body = inner.trim()
    const name = body.match(/^(#|[A-Za-z_]\w*)/)?.[1] ?? ""
    const rest = body.slice(name.length).trim()
    if (RAW_BLOCKS.has(name)) {
      /* Comments nest in Liquid; the rest end at their first closer. */
      const tagRe = new RegExp(`\\{%-?\\s*(end)?${name}\\b[^%]*?-?%\\}`, "g")
      tagRe.lastIndex = i
      let depth = 1
      let close: RegExpExecArray | null = null
      for (let t = tagRe.exec(src); t; t = tagRe.exec(src)) {
        if (t[1]) depth--
        else if (name === "comment") depth++
        if (depth === 0) {
          close = t
          break
        }
      }
      const bodyText = close ? src.slice(i, close.index) : src.slice(i)
      toks.push({ kind: "block", name, rest, body: bodyText, ltrim, rtrim: close ? /-%\}$/.test(close[0]) : false })
      i = close ? close.index + close[0].length : src.length
      continue
    }
    toks.push({ kind: "tag", name, rest, ltrim, rtrim })
  }
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k]
    if (t.kind === "text") continue
    const prev = toks[k - 1]
    const next = toks[k + 1]
    if (t.ltrim && prev?.kind === "text") prev.value = prev.value.replace(/\s+$/, "")
    if (t.rtrim && next?.kind === "text") next.value = next.value.replace(/^\s+/, "")
  }
  return toks
}

// ── Liquid expressions ──────────────────────────────────────────────────────

type ETok = { t: "str"; v: string } | { t: "num"; v: string } | { t: "id"; v: string } | { t: "op"; v: string } | { t: "p"; v: string }

/** A Liquid expression's pieces, or null when it holds a character no expression has. */
function lex(src: string): ETok[] | null {
  const out: ETok[] = []
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (/\s/.test(ch)) { i++; continue }
    if (ch === '"' || ch === "'") {
      const end = src.indexOf(ch, i + 1)
      if (end < 0) return null
      out.push({ t: "str", v: src.slice(i + 1, end) })
      i = end + 1
      continue
    }
    const rest = src.slice(i)
    if (rest.startsWith("..")) { out.push({ t: "p", v: ".." }); i += 2; continue }
    const num = rest.match(/^-?\d+(\.\d+)?/)
    if (num) { out.push({ t: "num", v: num[0] }); i += num[0].length; continue }
    const op = rest.match(/^(==|!=|<>|<=|>=|<|>)/)
    if (op) { out.push({ t: "op", v: op[0] }); i += op[0].length; continue }
    const id = rest.match(/^[A-Za-z_][\w-]*\??/)
    if (id) { out.push({ t: "id", v: id[0] }); i += id[0].length; continue }
    if ("|:,.[]()".includes(ch)) { out.push({ t: "p", v: ch }); i++; continue }
    return null
  }
  return out
}

/** A value: a literal, `blank`/`empty`, a path, or something Storelib cannot express (a range, a computed index). */
/** A part of a path worked out as the template runs: the `key` of `settings[key]`. */
interface DynSeg { dyn: LValue }
type Seg = string | number | DynSeg
type LValue = { k: "lit"; text: string } | { k: "blank" } | { k: "path"; segs: Seg[] } | { k: "range"; from: LValue; to: LValue } | { k: "bad" }
interface LFilter { name: string; args: LValue[]; named: string[] }
interface LExpr { head: LValue; filters: LFilter[] }

class Reader {
  pos = 0
  constructor(public toks: ETok[]) {}
  peek(): ETok | undefined { return this.toks[this.pos] }
  is(t: ETok["t"], v?: string): boolean {
    const p = this.peek()
    return !!p && p.t === t && (v === undefined || p.v === v)
  }
  done(): boolean { return this.pos >= this.toks.length }

  value(): LValue {
    const t = this.toks[this.pos++]
    if (!t) return { k: "bad" }
    if (t.t === "str") return { k: "lit", text: stringLiteral(t.v) }
    if (t.t === "num") return { k: "lit", text: t.v }
    if (t.t === "p" && t.v === "(") {
      /* A range, (1..5) or (1..section.settings.count): Storelib's loops take one. */
      const at = this.pos
      const from = this.value()
      if (from.k !== "bad" && from.k !== "range" && this.is("p", "..")) {
        this.pos++
        const to = this.value()
        if (to.k !== "bad" && to.k !== "range" && this.is("p", ")")) {
          this.pos++
          return { k: "range", from, to }
        }
      }
      this.pos = at
      let depth = 1
      while (!this.done() && depth > 0) {
        const n = this.toks[this.pos++]
        if (n.t === "p" && n.v === "(") depth++
        if (n.t === "p" && n.v === ")") depth--
      }
      return { k: "bad" }
    }
    if (t.t !== "id") return { k: "bad" }
    if (t.v === "true" || t.v === "false") return { k: "lit", text: t.v }
    if (t.v === "nil" || t.v === "null") return { k: "lit", text: "null" }
    if (t.v === "blank" || t.v === "empty") return { k: "blank" }
    const segs: Seg[] = [t.v]
    let bad = false
    for (;;) {
      if (this.is("p", ".")) {
        this.pos++
        const n = this.toks[this.pos]
        if (!n || n.t !== "id") return { k: "bad" }
        this.pos++
        segs.push(n.v)
      } else if (this.is("p", "[")) {
        this.pos++
        const k = this.peek()
        if (k && (k.t === "str" || k.t === "num") && this.toks[this.pos + 1]?.t === "p" && this.toks[this.pos + 1]?.v === "]") {
          segs.push(k.t === "num" ? Number(k.v) : k.v)
          this.pos += 2
        } else {
          /* A computed index, settings[key] or items[i]: worked out as the template runs. */
          const key = this.value()
          if (key.k === "bad" || !this.is("p", "]")) bad = true
          else { this.pos++; segs.push({ dyn: key }) }
        }
      } else break
    }
    return bad ? { k: "bad" } : { k: "path", segs }
  }

  /** `value | filter: a, key: b | filter`. */
  chain(): LExpr {
    const head = this.value()
    const filters: LFilter[] = []
    while (this.is("p", "|")) {
      this.pos++
      const name = this.toks[this.pos++]
      if (!name || name.t !== "id") break
      const f: LFilter = { name: name.v, args: [], named: [] }
      if (this.is("p", ":")) {
        this.pos++
        for (;;) {
          const a = this.peek()
          const b = this.toks[this.pos + 1]
          if (a && a.t === "id" && b && b.t === "p" && b.v === ":") {
            this.pos += 2
            this.value()
            f.named.push(a.v)
          } else f.args.push(this.value())
          if (this.is("p", ",")) { this.pos++; continue }
          break
        }
      }
      filters.push(f)
    }
    return { head, filters }
  }
}

function parseChain(src: string): LExpr | null {
  const toks = lex(src)
  if (!toks || toks.length === 0) return null
  const r = new Reader(toks)
  const e = r.chain()
  return r.done() ? e : null
}

interface Clause { l: LValue; op?: string; r?: LValue }

/** `a == b and c or d`: the clauses and the words between them, in order. */
function parseCondition(src: string): { clauses: Clause[]; joins: string[] } | null {
  const toks = lex(src)
  if (!toks || toks.length === 0) return null
  const r = new Reader(toks)
  const clauses: Clause[] = []
  const joins: string[] = []
  for (;;) {
    const l = r.value()
    const c: Clause = { l }
    const p = r.peek()
    if (p && (p.t === "op" || (p.t === "id" && p.v === "contains"))) {
      r.pos++
      c.op = p.v === "<>" ? "!=" : p.v
      c.r = r.value()
    }
    clauses.push(c)
    const j = r.peek()
    if (j && j.t === "id" && (j.v === "and" || j.v === "or")) {
      r.pos++
      joins.push(j.v)
      continue
    }
    break
  }
  return r.done() ? { clauses, joins } : null
}

/** A string as Storelib writes one: no escapes exist, so the quote is the one the text does not hold. */
export function stringLiteral(v: string): string {
  if (!v.includes('"')) return `"${v}"`
  if (!v.includes("'")) return `'${v}'`
  return `"${v.replace(/"/g, "")}"`
}

const STORELIB_ID = /^[A-Za-z_][A-Za-z0-9_]*$/

/** A path as Storelib writes one; null when a segment has no spelling there. */
/** A part of a path ready to write: a name, an index, or a converted expression for `[…]`. */
type PSeg = string | number | { expr: string }

function writePath(segs: PSeg[]): string | null {
  const [first, ...rest] = segs
  if (typeof first !== "string" || !STORELIB_ID.test(first)) return null
  let out = first
  for (const s of rest) {
    if (typeof s === "object") {
      if (s.expr === "null") return null
      out += `[${s.expr}]`
    } else if (typeof s === "number") out += `[${s}]`
    else if (STORELIB_ID.test(s)) out += `.${s}`
    else if (!s.includes('"')) out += `["${s}"]`
    else if (!s.includes("'")) out += `['${s}']`
    else return null
  }
  return out
}

// ── Scope: what a name means where it is read ───────────────────────────────

type Binding =
  /* A loop variable; `blocks` when it walks the section's own blocks, so block.settings.x can be checked. */
  | { kind: "loop"; blocks: boolean }
  /* `assign x = y` or a snippet's `x: y`: read as y, in the scope y was written in. */
  | { kind: "value"; node: LValue; scope: Scope }
  /* `assign x = y | upcase`: usable where the whole of x is printed. */
  | { kind: "chain"; expr: LExpr; scope: Scope }
  /* `capture x`: the converted markup it built, written in where x is printed. */
  | { kind: "captured"; text: string }
  /*
    A name the converted template keeps as a name: `{% assign %}` or
    `{% capture %}` written out for storelib/template.ts to run, because the
    value changes as the template goes (assigned twice, or inside an if or a
    loop). `name` is how it is spelled there.
  */
  | { kind: "var"; name: string; captured: boolean }
  /* Not one thing that can be read: read as nothing. */
  | { kind: "none" }

class Scope {
  vars = new Map<string, Binding>()
  frame: Scope
  constructor(public parent: Scope | null, public inFor: boolean, frame?: Scope) {
    this.frame = frame ?? this
  }
  lookup(name: string): Binding | undefined {
    for (let s: Scope | null = this; s; s = s.parent) {
      const b = s.vars.get(name)
      if (b) return b
    }
    return undefined
  }
}

// ── Filters ─────────────────────────────────────────────────────────────────

/** Storelib's own filters that mean what Shopify's of the same name mean. */
const SAME_FILTERS = new Set(FILTER_NAMES.filter((f) => !["date", "raw", "url", "embed", "map", "asset", "lines", "alpha", "escape"].includes(f)))

/** Shopify's spelling for one of those. */
const RENAMED: Record<string, string> = { replace_last: "replace" }

/** Removed without a word: Storelib already does what they did (escaping), or the value is right as it is (an image's address). */
const QUIET = new Set(["escape", "escape_once", "image_url", "img_url", "url_param_escape", "json_escape"])

/** Filters that turn a value into markup or into a different thing altogether: the output goes with them. */
const OUTPUT_GOES = new Set([
  "stylesheet_tag", "script_tag", "preload_tag", "img_tag", "placeholder_svg_tag", "link_to", "link_to_tag", "link_to_type", "link_to_vendor",
  "link_to_add_tag", "link_to_remove_tag", "payment_type_svg_tag", "payment_type_img_url", "payment_button", "payment_terms", "font_face", "font_url",
  "inline_asset_content", "time_tag", "highlight", "highlight_active_tag", "format_address", "default_pagination", "metafield_tag", "metafield_text",
  "external_video_tag", "external_video_url", "video_tag", "media_tag", "model_viewer_tag", "structured_data", "default_errors", "customer_login_link",
  "customer_logout_link", "customer_register_link", "login_button", "avatar", "currency_selector", "shopify_asset_url", "global_asset_url",
  "file_url", "file_img_url", "within", "url_for_type", "url_for_vendor", "sort_by", "item_count_for_variant", "line_items_for", "product_img_url",
  "collection_img_url", "article_img_url", "image_tag_srcset", "font_modify", "brightness_difference", "color_contrast",
])

/** Settings whose value is markup that was cleaned on the way in: Shopify prints them as they are, Storelib with `raw`. */
const MARKUP_TYPES = new Set(["richtext", "inline_richtext", "html"])

/** Filters after which a value is plain text again, so `raw` would be wrong. */
const TEXT_AFTER = new Set(["strip_html", "truncate", "upcase", "downcase", "size", "json"])

type Conv = { kind: "expr"; head: string; filters: string[] } | { kind: "text"; text: string } | { kind: "drop" } | { kind: "img"; src: string }

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string)
}

/** Text from the file as text in Storelib's template: a stray `{{` or `{#` must not start anything. */
function safeText(v: string, css: boolean): string {
  return css ? v.replace(/\{([{%#])/g, "{ $1") : v.replace(/\{([{%#])/g, "&#123;$1")
}

// ── The writer ──────────────────────────────────────────────────────────────

type Frame =
  | { k: "if"; end: "endif" | "endunless" }
  | { k: "case"; subject: string | null; started: boolean; prev: string[] }
  | { k: "for"; end: "endfor" | "endtablerow"; outer: Scope; inElse: boolean }
  | { k: "capture"; prev: string[]; name: string | null; buf: string[]; scope: Scope }
  /* A capture written out as one: its body goes straight to the output, between the tags. */
  | { k: "capture-var"; name: string; varName: string; scope: Scope }
  | { k: "pass"; end: string }

/** Names Storelib's template already reads, which a kept variable may not take (storelib/template.ts RESERVED_NAMES). */
const RESERVED_VARS = new Set(["settings", "blocks", "block", "products", "collections", "theme", "scheme", "page", "section", "shop", "routes", "customer", "wishlist", "creator", "product", "forloop", "true", "false", "null", "nil", "empty", "blank"])

/** Snippets drawn with render have names of their own; each is given a prefix so two never share one. */
const SNIPPET_PREFIX = new WeakMap<LiquidContext, { n: number }>()

/** How many times each name is assigned or captured in a file, read before it is converted. */
function assignCounts(src: string): Map<string, number> {
  const counts = new Map<string, number>()
  for (const m of src.matchAll(/(?:\x7b%-?|\n)\s*(assign|capture)\s+['"]?([A-Za-z_][\w-]*)/g)) {
    const n = m[2]
    counts.set(n, (counts.get(n) ?? 0) + (m[1] === "capture" ? 2 : 1))
  }
  return counts
}

/** Tags with a body that is kept as it is, without the tag around it. */
const PASS_THROUGH = new Set(["form", "paginate", "ifchanged"])

/** Tags that are removed with nothing said: they are about the page, not the section. */
const QUIET_TAGS = new Set(["layout", "#", "else", "break", "continue"])

class Writer {
  private out: string[] = []
  private sink: string[] = this.out
  private discard: string[] = []
  private frames: Frame[] = []
  private dropped = new Set<string>()
  private guard = 0
  /** Names assigned more than once, or captured, in this writer's source: kept as names from the first. */
  private changing = new Set<string>()

  /**
   * `snippet` is the snippet this writer draws, or null for the file itself.
   * `prefix` is put before every name it keeps, so a snippet's own names do
   * not meet the section's (`render` gives a snippet a scope of its own).
   */
  constructor(private ctx: LiquidContext, private scope: Scope, private css: boolean, private depth: number, private snippet: string | null = null, private prefix = "") {}

  run(src: string): string {
    for (const [name, n] of assignCounts(src)) if (n > 1) this.changing.add(name)
    for (const t of tokenizeLiquid(src)) this.token(t)
    while (this.frames.length) this.close(this.frames.length - 1, true)
    return this.out.join("")
  }

  private emit(s: string) {
    this.sink.push(s)
  }

  private token(t: LTok) {
    if (t.kind === "text") return this.emit(safeText(t.value, this.css))
    if (t.kind === "output") return this.output(t.value)
    if (t.kind === "block") return this.rawBlock(t.name, t.body)
    return this.tag(t.name, t.rest)
  }

  // ── Blocks taken whole ──
  private rawBlock(name: string, body: string) {
    if (name === "raw") return this.emit(safeText(body, this.css))
    if (name === "comment" || name === "doc" || name === "schema") return
    if (name === "stylesheet") {
      if (this.ctx.stylesheetsGlobal) return
      /* A snippet drawn ten times adds its stylesheet once. */
      if (this.snippet !== null) {
        if (this.ctx.seen.has(this.snippet)) return
        this.ctx.seen.add(this.snippet)
      }
      this.ctx.styles.push({ css: body, dynamic: false })
      return
    }
    if (name === "style") {
      /* Liquid inside a <style> element: the same conversion, into the section's <style> block. */
      const css = new Writer(this.ctx, this.scope, true, this.depth, this.snippet, this.prefix).run(body)
      if (css.trim()) this.ctx.styles.push({ css, dynamic: true })
      return
    }
    if (name === "javascript") {
      if (this.depth === 0 && this.ctx.declared.mode === "section") this.ctx.script = body
      else this.ctx.note(`A snippet's {% javascript %} was left out: a Storelib section's script is its own <script> block`)
    }
  }

  // ── {{ }} ──
  private output(src: string) {
    if (!src) return
    const expr = parseChain(src)
    if (!expr) {
      this.ctx.note(`{{ ${src.slice(0, 60)} }} was removed: Storelib could not read it`)
      return
    }
    this.emit(this.render(this.chain(expr, this.scope)))
  }

  private render(c: Conv): string {
    if (c.kind === "drop") return ""
    if (c.kind === "text") return c.text
    if (c.kind === "img") return this.css ? "" : `<img src="{{ ${c.src} }}" alt="" loading="lazy">`
    return `{{ ${[c.head, ...c.filters].join(" | ")} }}`
  }

  private chain(expr: LExpr, scope: Scope, depth = 0): Conv {
    /* `assign x = x | plus: 1` reads itself; a chain of names is followed a dozen deep at most. */
    if (depth > 12 || ++this.guard > 20000) return { kind: "drop" }
    let filters = expr.filters
    const out: string[] = []
    let head: string | null = null
    const h = expr.head

    if (h.k === "path") {
      const last = h.segs[h.segs.length - 1]
      if (last === "shopify_attributes") {
        if (this.ctx.declared.mode === "block" && h.segs[0] === "block" && h.segs.length === 2) return { kind: "expr", head: "block.storelib_attributes", filters: [] }
        return { kind: "drop" }
      }
      if (h.segs.length === 1) {
        const b = scope.lookup(String(h.segs[0]))
        if (b?.kind === "captured") {
          /* Filters that only tidy text are its own markup's business; anything else cannot apply to markup. */
          const rest = filters.filter((f) => !["strip", "strip_newlines", "lstrip", "rstrip", "escape", "escape_once"].includes(f.name))
          if (rest.length) this.ctx.note(`A captured value printed through ${rest.map((f) => `"${f.name}"`).join(", ")} was printed without ${rest.length === 1 ? "it" : "them"}: a filter cannot apply to markup`)
          return { kind: "text", text: b.text }
        }
        if (b?.kind === "chain") {
          const inner = this.chain(b.expr, b.scope, depth + 1)
          if (inner.kind !== "expr") return filters.length ? { kind: "drop" } : inner
          head = inner.head
          out.push(...inner.filters)
        }
      }
    }

    if (head === null && h.k === "lit" && filters[0]?.name === "t") {
      const key = unquote(h.text)
      const words = this.ctx.translate(key)
      if (words === null) {
        this.ctx.note(`The words for "${key}" are not in locales/en.default.json, so they were left out`)
        return { kind: "drop" }
      }
      const rest = filters.slice(1).filter((f) => !QUIET.has(f.name))
      const markup = /_html$/.test(key)
      if (rest.length === 0) return { kind: "text", text: this.css ? words : markup ? words : escapeHtml(words) }
      head = stringLiteral(words.replace(/\{\{[\s\S]*?\}\}/g, ""))
      filters = rest
    }

    /* An icon the theme inlines from assets/: the SVG itself, cleaned, written into the markup. */
    if (head === null && h.k === "lit" && filters[0]?.name === "inline_asset_content") {
      const name = unquote(h.text)
      const svg = !this.css && /\.svg$/i.test(name) ? this.ctx.inlineSvg?.(name) ?? null : null
      if (svg === null) {
        this.ctx.note(`assets/${name} could not be written in: only an SVG in the theme's assets is`)
        return { kind: "drop" }
      }
      return { kind: "text", text: safeText(svg, false) }
    }
    /* Shopify's picture for "nothing chosen yet": in the editor a quiet frame of the same shape, for a visitor nothing. */
    if (head === null && h.k === "lit" && filters[0]?.name === "placeholder_svg_tag" && !this.css) {
      const cls = filters[0].args[0]?.k === "lit" ? unquote(filters[0].args[0].text).replace(/[^\w\s-]/g, "") : ""
      return { kind: "text", text: `{% if page.in_editor %}<svg${cls ? ` class="${cls}"` : ""} viewBox="0 0 525 525" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false"><rect width="525" height="525" fill="currentColor" opacity="0.06"/></svg>{% endif %}` }
    }

    if (head === null && h.k === "lit" && filters[0]?.name === "asset_url") {
      const name = unquote(h.text)
      const a = this.ctx.asset(name)
      const next = filters[1]?.name
      if (a?.kind === "css" && next === "stylesheet_tag") {
        this.ctx.styles.push({ css: a.text, dynamic: false })
        return { kind: "drop" }
      }
      if (a?.kind === "image") {
        head = stringLiteral(a.ref)
        out.push("asset")
        filters = filters.slice(1)
      } else {
        if (a?.kind === "script" || /\.js$/i.test(name)) this.ctx.note(`The script ${name} was left out: a Shopify theme's scripts call Shopify's storefront`)
        else this.ctx.note(`assets/${name} was left out: it is not a picture or a stylesheet Storelib carries`)
        return { kind: "drop" }
      }
    }

    if (head === null) head = this.value(h, scope)

    for (let i = 0; i < filters.length; i++) {
      const f = filters[i]
      const name = RENAMED[f.name] ?? f.name
      if (QUIET.has(name)) continue
      if (name === "image_tag") {
        if (head === "null") return { kind: "drop" }
        return { kind: "img", src: [head, ...out].join(" | ") }
      }
      if (OUTPUT_GOES.has(name)) {
        this.ctx.note(`Output using the "${name}" filter was removed: it writes Shopify markup Storelib has no part for`)
        return { kind: "drop" }
      }
      if (name === "asset_url") {
        this.ctx.note(`An asset_url on a value that is not a file name was removed`)
        return { kind: "drop" }
      }
      if (name === "date") {
        if (h.k === "lit") return { kind: "drop" }
        this.ctx.note(`The "date" filter was removed: Storelib's date filter takes a style, not a format`)
        continue
      }
      if (name === "remove" || name === "remove_first" || name === "remove_last") {
        if (f.args[0]) out.push(`replace: ${this.value(f.args[0], scope)}, ""`)
        continue
      }
      if (name === "t") {
        this.ctx.note(`The "t" filter on a value that is not a key was removed`)
        continue
      }
      if (SAME_FILTERS.has(name)) {
        if (f.named.length) this.ctx.note(`The "${name}" filter's ${f.named.join(", ")} option was removed`)
        const args = f.args.map((a) => this.value(a, scope))
        out.push(args.length ? `${name}: ${args.join(", ")}` : name)
        continue
      }
      this.ctx.note(`The "${f.name}" filter was removed, so its value is printed as it is`)
    }

    if (head === "null" && !out.some((f) => f.startsWith("default"))) return { kind: "drop" }
    if (!this.css && this.isMarkup(head) && !out.some((f) => TEXT_AFTER.has(f.split(":")[0]))) out.push("raw")
    return { kind: "expr", head, filters: out }
  }

  /** Does this printed path hold markup a setting cleaned on the way in? */
  private isMarkup(path: string): boolean {
    const d = this.ctx.declared
    let m = path.match(/^settings\.([a-z0-9_]+)$/)
    if (m) return MARKUP_TYPES.has(d.settings.get(m[1]) ?? "")
    m = path.match(/^([A-Za-z_]\w*)\.settings\.([a-z0-9_]+)$/)
    if (!m) return false
    const own = d.mode === "block" && m[1] === "block"
    return MARKUP_TYPES.has((own ? d.settings : d.blockSettings).get(m[2]) ?? "")
  }

  /** A value as Storelib text: a literal, a path it can read, or `null`. */
  private value(v: LValue, scope: Scope): string {
    if (v.k === "lit") return v.text
    if (v.k === "blank" || v.k === "bad") return "null"
    if (v.k === "range") return `(${this.value(v.from, scope)}..${this.value(v.to, scope)})`
    /* A part worked out as it runs is converted here, in the scope it was written in. */
    const segs: PSeg[] = v.segs.map((x) => (typeof x === "object" ? { expr: this.value(x.dyn, scope) } : x))
    const p = this.path(segs, scope, 0)
    if (p === null && this.ctx.unread) {
      /* Followed to what it was assigned from, so the report names the Shopify object and not a local name. */
      const name = this.origin(segs, scope)
      if (name) this.ctx.unread.set(name, (this.ctx.unread.get(name) ?? 0) + 1)
    }
    return p ?? "null"
  }

  /** The name a path was read from, for the report: `closest.product.title`, `request.design_mode`. */
  private origin(segs: PSeg[], scope: Scope, depth = 0): string | null {
    const b = depth < 8 ? scope.lookup(String(segs[0])) : undefined
    if (b?.kind === "value" && b.node.k === "path") return this.origin([...b.node.segs.filter((x): x is string | number => typeof x !== "object"), ...segs.slice(1)], b.scope, depth + 1)
    if (b) return null
    return segs.slice(0, 3).filter((x) => typeof x === "string").join(".") || null
  }

  private path(segs: PSeg[], scope: Scope, depth: number): string | null {
    if (depth > 12) return null
    const d = this.ctx.declared
    const root = String(segs[0])
    const b = scope.lookup(root)
    if (b) {
      /* In a condition, a captured value is whether it built anything. */
      if (b.kind === "captured") return segs.length === 1 && b.text.trim() !== "" ? "true" : null
      if (b.kind === "var") return writePath([b.name, ...segs.slice(1)])
      /* `assign x = a | strip`, read in a condition or a loop: the filtered value, in parentheses. */
      if (b.kind === "chain") {
        const tail = segs.length === 2 && (segs[1] === "size" || segs[1] === "first" || segs[1] === "last") ? String(segs[1]) : null
        if (segs.length > 1 && !tail) return null
        const c = this.chain(b.expr, b.scope, depth + 1)
        const inner = c.kind === "expr" ? [c.head, ...c.filters.filter((f) => f !== "raw")].join(" | ") : c.kind === "text" ? stringLiteral(c.text) : null
        if (inner === null || inner === "null") return null
        return tail ? `(${inner} | ${tail})` : inner.includes("|") ? `(${inner})` : inner
      }
      if (b.kind === "none") return null
      if (b.kind === "value") {
        if (b.node.k === "path") {
          const head: PSeg[] = b.node.segs.map((x) => (typeof x === "object" ? { expr: this.value(x.dyn, b.scope) } : x))
          return this.path([...head, ...segs.slice(1)], b.scope, depth + 1)
        }
        return segs.length === 1 && b.node.k === "lit" ? b.node.text : null
      }
      /* A loop variable. Over the section's own blocks, a block setting must be one they declare. */
      if (segs[1] === "shopify_attributes") return null
      if (segs[1] === "settings" && typeof segs[2] === "object") return writePath(segs)
      if (segs[1] === "settings" && typeof segs[2] === "string") {
        const id = segs[2].replace(/-/g, "_")
        if (b.blocks && !d.blockSettings.has(id)) return null
        return writePath([...segs.slice(0, 2), id, ...segs.slice(3)])
      }
      if (b.blocks && segs[1] === "settings" && segs[2] !== undefined) return null
      return writePath(segs)
    }
    if (root === "forloop") return scope.inFor ? writePath(segs) : null
    if (root === "section") {
      if (segs[1] === "id" && segs.length === 2) return "section.id"
      if (d.mode !== "section") return null
      if (segs[1] === "settings" && segs.length === 2) return "settings"
      if (segs[1] === "settings" && typeof segs[2] === "object") return writePath(["settings", ...segs.slice(2)])
      if (segs[1] === "settings") {
        const id = typeof segs[2] === "string" ? segs[2].replace(/-/g, "_") : null
        if (id === null || !d.settings.has(id)) return null
        return writePath(["settings", id, ...segs.slice(3)])
      }
      if (segs[1] === "blocks") return d.localBlocks ? writePath(["blocks", ...segs.slice(2)]) : null
      return null
    }
    /* Shopify's `settings` is the theme's; Storelib's is the section's. */
    if (root === "settings") return segs.length > 1 ? writePath(["theme", "settings", "shopify", ...segs.slice(1)]) : null
    if (root === "block" && d.mode === "block") {
      if (segs[1] === "settings") {
        if (segs[2] === undefined || typeof segs[2] === "object") return writePath(segs)
        const id = String(segs[2]).replace(/-/g, "_")
        if (!d.settings.has(id)) return null
        return writePath(["block", "settings", id, ...segs.slice(3)])
      }
      if (segs[1] === "shopify_attributes") return "block.storelib_attributes"
      if ((segs[1] === "id" || segs[1] === "type") && segs.length === 2) return writePath(segs)
      return null
    }
    /* What both have under the same name: the product on a product page, the shop, its addresses, the visitor. */
    if (root === "product" || root === "shop" || root === "routes" || root === "customer") return writePath(segs)
    /* What a theme block was drawn for: content_for's closest.product and closest.collection. */
    if (root === "closest" && (segs[1] === "product" || segs[1] === "collection")) return writePath(segs)
    /* "Is the editor showing this": Storelib's builder. */
    if (root === "request" && (segs[1] === "design_mode" || segs[1] === "visual_preview_mode") && segs.length === 2) return "page.in_editor"
    if (root === "template" && segs[1] === "name" && segs.length === 2) return "page.template"
    /* Every product the shop has: the products the page was handed. */
    if (root === "collections" && segs[1] === "all" && segs[2] === "products") return writePath(["products", ...segs.slice(3)])
    return null
  }

  /** A Liquid condition as a Storelib one, read right to left the way Liquid reads it. */
  private condition(src: string, scope: Scope): string {
    const c = parseCondition(src)
    if (!c) {
      this.ctx.note(`The condition "${src.slice(0, 60)}" could not be read, so it is false`)
      return "false"
    }
    const parts = c.clauses.map((cl) => this.clause(cl, scope))
    let result = parts[parts.length - 1]
    for (let i = parts.length - 2; i >= 0; i--) result = `${parts[i]} ${c.joins[i]} (${result})`
    return result
  }

  private clause(c: Clause, scope: Scope): string {
    if (!c.op || !c.r) return this.value(c.l, scope)
    /* `x != blank` is "x has something in it", which in Storelib is x itself. */
    if (c.r.k === "blank" || c.l.k === "blank") {
      const side = c.r.k === "blank" ? c.l : c.r
      let other = this.value(side, scope)
      /* Captured markup that is only spaces and line breaks is blank to Liquid. */
      if (side.k === "path" && side.segs.length === 1) {
        const b = scope.lookup(String(side.segs[0]))
        if (b?.kind === "var" && b.captured) other = `(${other} | strip)`
      }
      if (c.op === "==") return `(not ${other})`
      if (c.op === "!=") return other
    }
    return `${this.value(c.l, scope)} ${c.op} ${this.value(c.r, scope)}`
  }

  // ── {% %} ──
  private tag(name: string, rest: string) {
    switch (name) {
      case "liquid":
        return this.liquidTag(rest)
      case "if":
        this.frames.push({ k: "if", end: "endif" })
        return this.emit(`{% if ${this.condition(rest, this.scope)} %}`)
      case "unless":
        this.frames.push({ k: "if", end: "endunless" })
        return this.emit(`{% if not (${this.condition(rest, this.scope)}) %}`)
      case "elsif": {
        const f = this.top()
        if (f?.k !== "if") return this.stray(name)
        return this.emit(`{% elsif ${this.condition(rest, this.scope)} %}`)
      }
      case "else":
        return this.elseTag()
      case "case": {
        const subject = parseChain(rest)
        const s = subject && subject.filters.length === 0 ? this.value(subject.head, this.scope) : null
        this.frames.push({ k: "case", subject: s, started: false, prev: this.sink })
        this.sink = this.discard
        return
      }
      case "when":
        return this.when(rest)
      case "for":
      case "tablerow":
        return this.forTag(name, rest)
      case "assign":
        return this.assign(rest)
      case "capture": {
        /*
          WHAT IT BUILDS IS WRITTEN IN WHERE IT IS PRINTED. The body is
          converted like any other markup into a buffer, and `{{ x }}` later
          becomes that markup, so a class list or an icon built once and used
          twice is still there. Captured twice, it is the second.
        */
        const v = rest.match(/^['"]?([A-Za-z_][\w-]*)['"]?/)?.[1] ?? null
        /* Captured more than once, or where it may not run: kept as a capture Storelib runs. */
        if (v && (this.changing.has(v) || this.controlled() || this.scope.frame.vars.get(v)?.kind === "var")) {
          const varName = this.varName(v)
          this.frames.push({ k: "capture-var", name: v, varName, scope: this.scope })
          this.emit(`{% capture ${varName} %}`)
          return
        }
        const buf: string[] = []
        this.frames.push({ k: "capture", prev: this.sink, name: v, buf, scope: this.scope })
        this.sink = buf
        return
      }
      case "echo": {
        const expr = parseChain(rest)
        if (expr) this.emit(this.render(this.chain(expr, this.scope)))
        return
      }
      case "render":
      case "include":
        return this.renderTag(name, rest)
      case "content_for":
        return this.contentFor(rest)
      case "section":
      case "sections":
        this.ctx.note(`{% ${name} %} was removed: sections are placed on a page in the editor`)
        return
      case "increment":
      case "decrement": {
        /* A counter of its own, apart from assigned names, as in Liquid: increment prints then adds, decrement takes away then prints. */
        const v = rest.match(/^([A-Za-z_][\w-]*)/)?.[1]
        if (!v) return
        const c = `count_${this.varName(v)}`
        if (name === "increment") return this.emit(`{{ ${c} | default: 0 }}{% assign ${c} = ${c} | default: 0 | plus: 1 %}`)
        return this.emit(`{% assign ${c} = ${c} | default: 0 | minus: 1 %}{{ ${c} }}`)
      }
      case "cycle":
        return this.cycle(rest)
      default:
        break
    }
    if (name.startsWith("end")) return this.end(name)
    if (PASS_THROUGH.has(name)) {
      this.frames.push({ k: "pass", end: `end${name}` })
      if (name === "form") this.ctx.note(`{% form %} was removed and what was inside it kept: a Shopify form posts to Shopify`)
      if (name === "paginate") this.ctx.note(`{% paginate %} was removed and what was inside it kept`)
      return
    }
    if (name === "break" || name === "continue") return this.emit(`{% ${name} %}`)
    if (QUIET_TAGS.has(name)) return
    this.dropped.add(name)
    this.ctx.note(`{% ${name} %} was removed: Storelib has no such tag`)
  }

  private top(): Frame | undefined {
    return this.frames[this.frames.length - 1]
  }

  private stray(name: string) {
    this.ctx.note(`A stray {% ${name} %} was removed`)
  }

  private elseTag() {
    const f = this.top()
    if (!f) return this.stray("else")
    if (f.k === "if") return this.emit("{% else %}")
    if (f.k === "for") {
      f.inElse = true
      this.scope = f.outer
      return this.emit("{% else %}")
    }
    if (f.k === "case") {
      if (!f.started) {
        f.started = true
        this.sink = f.prev
        return this.emit("{% if true %}")
      }
      return this.emit("{% else %}")
    }
  }

  private when(rest: string) {
    const f = this.top()
    if (f?.k !== "case") return this.stray("when")
    const toks = lex(rest)
    const values: string[] = []
    if (toks) {
      const r = new Reader(toks)
      while (!r.done()) {
        values.push(this.value(r.value(), this.scope))
        if (r.is("p", ",") || r.is("id", "or")) r.pos++
        else if (!r.done()) break
      }
    }
    const cond = f.subject && values.length ? values.map((v) => `${f.subject} == ${v}`).join(" or ") : "false"
    if (!f.started) {
      f.started = true
      this.sink = f.prev
      return this.emit(`{% if ${cond} %}`)
    }
    return this.emit(`{% elsif ${cond} %}`)
  }

  private forTag(name: string, rest: string) {
    const m = rest.match(/^([A-Za-z_][\w-]*)\s+in\s+([\s\S]+)$/)
    const end = name === "tablerow" ? "endtablerow" : "endfor"
    const outer = this.scope
    if (!m || !STORELIB_ID.test(m[1])) {
      this.ctx.note(`{% ${name} ${rest.slice(0, 40)} %} could not be read, so it shows nothing`)
      this.frames.push({ k: "for", end, outer, inElse: false })
      this.scope = new Scope(outer, true, outer.frame)
      return this.emit(`{% for item in null %}`)
    }
    const toks = lex(m[2]) ?? []
    const r = new Reader(toks)
    const listValue = toks.length ? r.value() : ({ k: "bad" } as LValue)
    /* limit:, offset: and reversed, as Storelib's loop takes them: a number or a plain setting. */
    const params: string[] = []
    while (!r.done()) {
      const t = r.peek()
      if (t?.t === "id" && t.v === "reversed") { r.pos++; params.push("reversed"); continue }
      if (t?.t === "id" && (t.v === "limit" || t.v === "offset") && r.toks[r.pos + 1]?.t === "p" && r.toks[r.pos + 1]?.v === ":") {
        r.pos += 2
        const v = this.value(r.value(), outer)
        if (/^[A-Za-z0-9_.]+$/.test(v) && v !== "null") params.push(`${t.v}: ${v}`)
        else this.ctx.note(`A loop's ${t.v} could not be read, so the loop goes through every item`)
        continue
      }
      this.ctx.note(`Part of a loop could not be read ("${m[2].slice(0, 40)}"), so it goes through every item`)
      break
    }
    if (listValue.k === "bad") this.ctx.note(`A loop over "${m[2].slice(0, 40)}" could not be read, so it shows nothing`)
    if (name === "tablerow") this.ctx.note(`{% tablerow %} is written as {% for %}; the table cells it made are not`)
    const list = this.value(listValue, outer)
    this.frames.push({ k: "for", end, outer, inElse: false })
    const inner = new Scope(outer, true, outer.frame)
    inner.vars.set(m[1], { kind: "loop", blocks: list === "blocks" })
    this.scope = inner
    this.emit(`{% for ${m[1]} in ${list}${params.length ? ` ${params.join(" ")}` : ""} %}`)
  }

  /**
   * ASSIGNED ONCE, READ AS WHAT IT IS; OTHERWISE KEPT AS A NAME.
   * `assign heading = section.settings.heading`, made once and before any
   * if or loop, is read as `settings.heading` wherever `heading` is: the
   * builder can then tell which setting a heading shows. A name assigned
   * again, or inside an if, a case or a loop, holds what the template
   * worked out as it ran, so it is written out as `{% assign %}` and the
   * template runs it.
   */
  private assign(rest: string) {
    const m = rest.match(/^([A-Za-z_][\w-]*)\s*=\s*([\s\S]+)$/)
    if (!m) return
    const frame = this.scope.frame
    const had = frame.vars.get(m[1])
    const expr = parseChain(m[2])
    /* `assign name = name | default: 'gap'` reads what name was before it: worked out where it stands, not later. */
    const selfRef = new RegExp(`(^|[^\\w.])${m[1].replace(/[^\w-]/g, "")}(?![\\w-])`).test(m[2])
    const keep = this.changing.has(m[1]) || this.controlled() || had !== undefined || selfRef
    if (!keep && expr) {
      frame.vars.set(m[1], expr.filters.length ? { kind: "chain", expr, scope: this.scope } : { kind: "value", node: expr.head, scope: this.scope })
      return
    }
    const varName = had?.kind === "var" ? had.name : this.varName(m[1])
    const value = expr ? this.assignValue(this.chain(expr, this.scope)) : "null"
    this.emit(`{% assign ${varName} = ${value} %}`)
    frame.vars.set(m[1], { kind: "var", name: varName, captured: false })
  }

  /** Inside an if, a case, a loop or a capture: somewhere a tag may not run, or may run many times. */
  private controlled(): boolean {
    return this.scope.inFor || this.frames.some((f) => f.k !== "pass")
  }

  /** A Liquid name as a name Storelib's template may keep. */
  private varName(name: string): string {
    let n = name.replace(/[^A-Za-z0-9_]/g, "_")
    if (RESERVED_VARS.has(n)) n = `v_${n}`
    return `${this.prefix}${n}`
  }

  /** What a converted value is, as the right side of an assign. */
  private assignValue(c: Conv): string {
    if (c.kind === "drop" || c.kind === "img") return "null"
    /* Text already written for the page (words from a locale, captured markup): kept as it is. */
    if (c.kind === "text") return `${stringLiteral(c.text.replace(/[\r\n]+/g, " ").replace(/%\}/g, "% }"))} | raw`
    return [c.head, ...c.filters].join(" | ")
  }

  /** {% cycle 'a', 'b' %}: each time it is reached, the next of its values. */
  private cycle(rest: string) {
    const body = rest.replace(/^(['"])[^'"]*\1\s*:\s*/, "")
    const toks = lex(body) ?? []
    const r = new Reader(toks)
    const values: string[] = []
    while (!r.done() && values.length < 20) {
      values.push(this.value(r.value(), this.scope))
      if (r.is("p", ",")) r.pos++
      else break
    }
    if (!values.length) return
    const key = `cycle_${this.prefix}${Math.abs([...rest].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7)).toString(36)}`
    const at = `${key}_at`
    const out = [`{% assign ${key} = ${key} | default: 0 %}{% assign ${at} = ${key} | modulo: ${values.length} %}`]
    values.forEach((v, i) => out.push(`${i === 0 ? "{% if" : "{% elsif"} ${at} == ${i} %}{{ ${v} }}`))
    out.push(`{% endif %}{% assign ${key} = ${key} | plus: 1 %}`)
    this.emit(out.join(""))
  }

  private liquidTag(body: string) {
    const lines = body.split("\n")
    let inComment = 0
    for (const raw of lines) {
      const line = raw.trim()
      if (!line || line.startsWith("#")) continue
      const name = line.match(/^[A-Za-z_]\w*/)?.[0] ?? ""
      if (name === "comment") { inComment++; continue }
      if (name === "endcomment") { inComment = Math.max(0, inComment - 1); continue }
      if (inComment) continue
      const rest = line.slice(name.length).trim()
      if (name === "echo") this.output(rest)
      else this.tag(name, rest)
    }
  }

  private contentFor(rest: string) {
    const m = rest.match(/^(['"])(blocks|block)\1([\s\S]*)$/)
    const d = this.ctx.declared
    if (!m) return
    /* closest.product: product, closest.collection: …: what the blocks are drawn for, kept. */
    let near = ""
    for (const c of m[3].matchAll(/closest\.(product|collection)\s*:\s*([^,]+)/g)) {
      const toks = lex(c[2].trim()) ?? []
      const v = toks.length ? this.value(new Reader(toks).value(), this.scope) : "null"
      near += `, closest.${c[1]}: ${v}`
    }
    if (m[2] === "blocks") {
      if (d.themeBlocks && !d.localBlocks) this.emit(`{% content_for "blocks"${near} %}`)
      return
    }
    const type = m[3].match(/\btype\s*:\s*(['"])([^'"]+)\1/)?.[2]
    const id = m[3].match(/\bid\s*:\s*(['"])([^'"]+)\1/)?.[2]
    if (!type || !id || !/^_?[a-z][a-z0-9_-]*$/.test(type) || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
      this.ctx.note(`A {% content_for "block" %} without a literal type and id was removed`)
      return
    }
    if (/,\s*(?!type\b|id\b|closest\.)[\w.]+\s*:/.test(m[3])) this.ctx.note(`What a {% content_for "block" %} passed besides its type, id and closest was removed`)
    this.emit(`{% content_for "block", type: "${type}", id: "${id}"${near} %}`)
  }

  /**
   * A SNIPPET IS WRITTEN IN PLACE. `{% render 'card', product: x %}` becomes
   * the snippet's own markup, converted, with every `product` in it read as
   * `x`. That is all `render` ever did; doing it once, here, instead of on
   * every page view means there is nothing left to do at render time. A
   * snippet that is missing, or deeper than four, or that would take the
   * section past its size, is removed and said.
   */
  private renderTag(name: string, rest: string) {
    const m = rest.match(/^(['"])([^'"]+)\1\s*([\s\S]*)$/)
    if (!m) {
      this.ctx.note(`A {% ${name} %} with a name worked out at render time was removed`)
      return
    }
    const snippetName = m[2]
    const source = this.ctx.snippet(snippetName)
    if (source === null) {
      this.ctx.note(`{% ${name} '${snippetName}' %} was removed: snippets/${snippetName}.liquid is not in the theme`)
      return
    }
    if (this.depth >= MAX_SNIPPET_DEPTH) {
      this.ctx.note(`{% ${name} '${snippetName}' %} was removed: snippets inside snippets are followed ${MAX_SNIPPET_DEPTH} deep`)
      return
    }
    if (source.length > this.ctx.budget.chars) {
      this.ctx.note(`{% ${name} '${snippetName}' %} was removed: the section was already as large as one may be`)
      return
    }
    this.ctx.budget.chars -= source.length

    const child = name === "include" ? new Scope(this.scope, this.scope.inFor, this.scope.frame) : new Scope(null, false)
    let tail = m[3].trim()
    let loop: { item: string; list: string } | null = null
    const w = tail.match(/^(with|for)\s+([\s\S]+?)(?:\s+as\s+([A-Za-z_]\w*))?\s*(?=,|$)/)
    if (w) {
      const as = w[3] ?? snippetName.replace(/[^A-Za-z0-9_]/g, "_")
      const toks = lex(w[2]) ?? []
      const v = toks.length ? new Reader(toks).value() : ({ k: "bad" } as LValue)
      if (w[1] === "with") child.vars.set(as, { kind: "value", node: v, scope: this.scope })
      else loop = { item: as, list: this.value(v, this.scope) }
      tail = tail.slice(w[0].length).trim()
    }
    const toks = lex(tail.replace(/^,/, "")) ?? []
    const r = new Reader(toks)
    while (!r.done()) {
      const k = r.peek()
      if (!k || k.t !== "id" || r.toks[r.pos + 1]?.t !== "p" || r.toks[r.pos + 1]?.v !== ":") break
      r.pos += 2
      child.vars.set(k.v, { kind: "value", node: r.value(), scope: this.scope })
      if (r.is("p", ",")) r.pos++
    }

    if (loop) {
      child.inFor = true
      child.vars.set(loop.item, { kind: "loop", blocks: loop.list === "blocks" })
      this.emit(`{% for ${loop.item} in ${loop.list} %}`)
    }
    let prefix = this.prefix
    if (name === "render") {
      const counter = SNIPPET_PREFIX.get(this.ctx) ?? { n: 0 }
      SNIPPET_PREFIX.set(this.ctx, counter)
      prefix = `s${++counter.n}_`
    }
    const writer = new Writer(this.ctx, child, this.css, this.depth + 1, snippetName, prefix)
    this.emit(writer.run(source))
    if (loop) this.emit(`{% endfor %}`)
  }

  private end(name: string) {
    const want = (f: Frame) =>
      (f.k === "if" && f.end === name) ||
      (f.k === "case" && name === "endcase") ||
      (f.k === "for" && f.end === name) ||
      ((f.k === "capture" || f.k === "capture-var") && name === "endcapture") ||
      (f.k === "pass" && f.end === name)
    for (let i = this.frames.length - 1; i >= 0; i--) {
      if (want(this.frames[i])) {
        while (this.frames.length - 1 > i) this.close(this.frames.length - 1, true)
        this.close(i, false)
        return
      }
    }
    /* The end of a tag removed above is removed with it, without a second word. */
    if (!this.dropped.has(name.slice(3))) this.stray(name)
  }

  private close(i: number, unclosed: boolean) {
    const f = this.frames[i]
    this.frames.splice(i, 1)
    if (unclosed) this.ctx.note(`A block that was never closed was closed at the end of the file`)
    switch (f.k) {
      case "if":
        return this.emit("{% endif %}")
      case "case":
        if (f.started) this.emit("{% endif %}")
        else this.sink = f.prev
        return
      case "for":
        this.scope = f.outer
        return this.emit("{% endfor %}")
      case "capture":
        this.sink = f.prev
        if (f.name) f.scope.frame.vars.set(f.name, { kind: "captured", text: f.buf.join("") })
        return
      case "capture-var":
        this.emit("{% endcapture %}")
        f.scope.frame.vars.set(f.name, { kind: "var", name: f.varName, captured: true })
        return
      case "pass":
        return
    }
  }
}

function unquote(text: string): string {
  return text.replace(/^["']|["']$/g, "")
}

/**
 * The whole of one file's markup, converted. CSS and the section's script
 * are gathered into the context on the way; the caller decides where they
 * go.
 */
export function convertLiquid(source: string, ctx: LiquidContext): string {
  const writer = new Writer(ctx, new Scope(null, false), false, 0)
  return writer.run(source)
}

/** Read for the tests and for anybody checking what a condition became. */
export function convertCondition(src: string, ctx: LiquidContext): string {
  const writer = new Writer(ctx, new Scope(null, false), false, 0)
  return writer.run(`{% if ${src} %}{% endif %}`).replace(/^\{% if ([\s\S]*) %\}\{% endif %\}$/, "$1")
}
