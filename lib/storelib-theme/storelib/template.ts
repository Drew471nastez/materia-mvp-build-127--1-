/**
 * ===========================================================================
 *  THE MARKUP LANGUAGE
 * ===========================================================================
 * HTML, plus three things:
 *
 *   {{ expression }}                 output, HTML-escaped
 *   {% if … %} {% elsif … %} {% else %} {% endif %}
 *   {% for item in list %} … {% else %} {% endfor %}
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

// ── AST ─────────────────────────────────────────────────────────────────────

export type Node =
  | { kind: "text"; value: string }
  | { kind: "output"; expr: Expr; line: number }
  | { kind: "if"; branches: { cond: Expr; body: Node[] }[]; else?: Node[]; line: number }
  | { kind: "for"; item: string; list: Expr; body: Node[]; else?: Node[]; line: number }

export type Expr =
  | { t: "lit"; v: string | number | boolean | null }
  | { t: "path"; segs: string[] }
  | { t: "not"; e: Expr }
  | { t: "bin"; op: BinOp; l: Expr; r: Expr }
  | { t: "filter"; e: Expr; name: string; args: Expr[] }

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
    let next = -1
    let kind: "output" | "tag" = "output"
    if (out >= 0 && (tag < 0 || out < tag)) { next = out; kind = "output" }
    else if (tag >= 0) { next = tag; kind = "tag" }
    if (next < 0) {
      push({ kind: "text", value: src.slice(i), line })
      break
    }
    if (next > i) {
      const text = src.slice(i, next)
      push({ kind: "text", value: text, line })
      line += (text.match(/\n/g) ?? []).length
    }
    const closer = kind === "output" ? "}}" : "%}"
    const end = src.indexOf(closer, next + 2)
    if (end < 0) throw new TemplateError(`"${src.slice(next, next + 2)}" on line ${line} is never closed`, line)
    const inner = src.slice(next + 2, end)
    push({ kind, value: inner.trim(), line })
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
    let e = this.or()
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
    if (this.pos < this.toks.length) throw new TemplateError(`unexpected "${(this.peek() as { v: unknown }).v}" in expression`, this.line)
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
    if (t.t === "punct" && t.v === "(") { const e = this.or(); const c = this.take(); if (c.t !== "punct" || c.v !== ")") throw new TemplateError(`expected ")"`, this.line); return e }
    if (t.t === "id") {
      if (t.v === "true") return { t: "lit", v: true }
      if (t.v === "false") return { t: "lit", v: false }
      if (t.v === "null" || t.v === "nil" || t.v === "blank") return { t: "lit", v: null }
      const segs = [t.v]
      for (;;) {
        if (this.is("punct", ".")) {
          this.take()
          const n = this.take()
          if (n.t !== "id") throw new TemplateError(`a name must follow "."`, this.line)
          segs.push(n.v)
        } else if (this.is("punct", "[")) {
          this.take()
          const k = this.take()
          if (k.t !== "num" && k.t !== "str") throw new TemplateError(`only a number or a string may index with []`, this.line)
          segs.push(String(k.v))
          const c = this.take()
          if (c.t !== "punct" || c.v !== "]") throw new TemplateError(`expected "]"`, this.line)
        } else break
      }
      return { t: "path", segs }
    }
    throw new TemplateError(`unexpected "${(t as { v: unknown }).v}" in expression`, this.line)
  }
}

function parseExpr(src: string, line: number): Expr {
  return new ExprParser(lexExpr(src, line), line).parse()
}

// ── Building the tree ───────────────────────────────────────────────────────

const FORBIDDEN_MARKUP: [RegExp, string][] = [
  [/<script\b/i, "a <script> tag inside <template>; put behaviour in the section's own <script> block"],
  [/\son[a-z]+\s*=/i, "an on*= attribute; put behaviour in the section's own <script> block"],
  [/javascript:/i, "a javascript: URL"],
  [/<iframe\b/i, "an <iframe>"],
  [/<object\b|<embed\b/i, "an <object> or <embed>"],
]

export function compileTemplate(src: string, opts: { file?: string; line?: number } = {}): Result<CompiledTemplate> {
  const base = (opts.line ?? 1) - 1
  const err = (message: string, line?: number): Result<CompiledTemplate> => ({
    ok: false,
    errors: [{ stage: "template", file: opts.file, line: line !== undefined ? base + line : undefined, message }],
  })

  for (const [re, what] of FORBIDDEN_MARKUP) {
    const m = src.match(re)
    if (m && m.index !== undefined) {
      const line = (src.slice(0, m.index).match(/\n/g)?.length ?? 0) + 1
      return err(`The template contains ${what}`, line)
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
        nodes.push({ kind: "for", item: m[1], list: parseExpr(m[2], t.line), body: body.nodes, else: elseBody, line: t.line })
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

// ── Rendering ───────────────────────────────────────────────────────────────

/** A string the template may emit unescaped. Only the `raw` filter makes one. */
class Safe {
  constructor(public readonly html: string) {}
}

const BLOCKED_KEYS = new Set(["__proto__", "constructor", "prototype"])

function lookup(scope: Record<string, unknown>, segs: string[]): unknown {
  let cur: unknown = scope
  for (const s of segs) {
    if (BLOCKED_KEYS.has(s)) return undefined
    if (cur === null || cur === undefined) return undefined
    if (typeof cur === "function") return undefined
    if (Array.isArray(cur)) {
      if (s === "size" || s === "length") { cur = cur.length; continue }
      if (s === "first") { cur = cur[0]; continue }
      if (s === "last") { cur = cur[cur.length - 1]; continue }
      const n = Number(s)
      cur = Number.isInteger(n) ? cur[n] : undefined
      continue
    }
    if (typeof cur === "object") {
      cur = Object.prototype.hasOwnProperty.call(cur, s) ? (cur as Record<string, unknown>)[s] : undefined
      continue
    }
    if (typeof cur === "string" && (s === "size" || s === "length")) { cur = cur.length; continue }
    return undefined
  }
  return typeof cur === "function" ? undefined : cur
}

function truthy(v: unknown): boolean {
  if (v instanceof Safe) return v.html !== ""
  if (Array.isArray(v)) return v.length > 0
  return v !== undefined && v !== null && v !== false && v !== "" && !(typeof v === "number" && Number.isNaN(v))
}

function str(v: unknown): string {
  if (v === undefined || v === null || v === false) return ""
  if (v instanceof Safe) return v.html
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
  first: (v) => (Array.isArray(v) ? v[0] : undefined),
  last: (v) => (Array.isArray(v) ? v[v.length - 1] : undefined),
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
  /** Only for values that were sanitised on the way in: richtext. */
  raw: (v) => new Safe(str(v)),
  /** An href that is one of ours or an http(s)/mailto/tel address; anything else becomes "#". */
  url: (v) => { const s = str(v).trim(); return /^(\/(?!\/)|https?:\/\/|mailto:|tel:|#)/i.test(s) ? s : s === "" ? "" : "#" },
  /** asset://… → the URL this account serves it from; a plain URL passes through. */
  asset: (v, _a, ctx) => { const s = str(v); return s.startsWith("asset://") ? (ctx.assets[s] ?? "") : s },
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

export const FILTER_NAMES = Object.keys(FILTERS)

function evaluate(e: Expr, scope: Record<string, unknown>, ctx: RenderContext): unknown {
  switch (e.t) {
    case "lit": return e.v
    case "path": return lookup(scope, e.segs)
    case "not": return !truthy(evaluate(e.e, scope, ctx))
    case "bin": {
      if (e.op === "and") return truthy(evaluate(e.l, scope, ctx)) && truthy(evaluate(e.r, scope, ctx))
      if (e.op === "or") return truthy(evaluate(e.l, scope, ctx)) || truthy(evaluate(e.r, scope, ctx))
      const l = evaluate(e.l, scope, ctx)
      const r = evaluate(e.r, scope, ctx)
      switch (e.op) {
        case "==": return l === r || (l == null && r == null) || (typeof l !== "object" && typeof r !== "object" && String(l) === String(r))
        case "!=": return !(l === r || (l == null && r == null) || (typeof l !== "object" && typeof r !== "object" && String(l) === String(r)))
        case "<": return Number(l) < Number(r)
        case "<=": return Number(l) <= Number(r)
        case ">": return Number(l) > Number(r)
        case ">=": return Number(l) >= Number(r)
        case "contains": return Array.isArray(l) ? l.includes(r) : str(l).includes(str(r))
      }
      return false
    }
    case "filter": {
      const f = FILTERS[e.name]
      if (!f) return evaluate(e.e, scope, ctx)
      return f(evaluate(e.e, scope, ctx), e.args.map((a) => evaluate(a, scope, ctx)), ctx)
    }
  }
}

export interface RenderOptions {
  /**
   * "html" (the default) escapes output for markup. "css" is for a section's
   * style block, where HTML escaping would turn a quote into `&quot;` and
   * break the rule: a value is stripped of the characters that could end a
   * declaration or a block instead, since no legitimate CSS value holds one.
   */
  mode?: "html" | "css"
}

/** A value on its way into a stylesheet. No braces, no angle brackets, no at-rules. */
function cssValue(s: string): string {
  return s.replace(/[<>{}]/g, "").replace(/@import/gi, "")
}

export function renderTemplate(tpl: CompiledTemplate, ctx: RenderContext, opts: RenderOptions = {}): string {
  const css = opts.mode === "css"
  const out: string[] = []
  const base: Record<string, unknown> = {
    settings: ctx.settings,
    blocks: ctx.blocks,
    theme: ctx.theme,
    scheme: ctx.scheme,
    page: ctx.page,
    section: ctx.section,
  }
  const walk = (nodes: Node[], scope: Record<string, unknown>) => {
    for (const n of nodes) {
      switch (n.kind) {
        case "text": out.push(n.value); break
        case "output": {
          const v = evaluate(n.expr, scope, ctx)
          out.push(v instanceof Safe ? v.html : css ? cssValue(str(v)) : escapeHtml(str(v)))
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
          const items = Array.isArray(list) ? list : []
          if (items.length === 0) { if (n.else) walk(n.else, scope); break }
          items.forEach((item, idx) => {
            walk(n.body, {
              ...scope,
              [n.item]: item,
              forloop: { index: idx + 1, index0: idx, first: idx === 0, last: idx === items.length - 1, length: items.length },
            })
          })
          break
        }
      }
    }
  }
  walk(tpl.nodes, base)
  return out.join("")
}

/** Every path a template reads, for the AI and for "setting X is unused" warnings. */
export function pathsRead(tpl: CompiledTemplate): string[] {
  const seen = new Set<string>()
  const expr = (e: Expr) => {
    switch (e.t) {
      case "path": seen.add(e.segs.join(".")); break
      case "not": expr(e.e); break
      case "bin": expr(e.l); expr(e.r); break
      case "filter": expr(e.e); e.args.forEach(expr); break
    }
  }
  const walk = (nodes: Node[]) => {
    for (const n of nodes) {
      if (n.kind === "output") expr(n.expr)
      else if (n.kind === "if") { n.branches.forEach((b) => { expr(b.cond); walk(b.body) }); if (n.else) walk(n.else) }
      else if (n.kind === "for") { expr(n.list); walk(n.body); if (n.else) walk(n.else) }
    }
  }
  walk(tpl.nodes)
  return [...seen].sort()
}
