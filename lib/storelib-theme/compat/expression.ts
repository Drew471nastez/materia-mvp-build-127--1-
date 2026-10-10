/**
 * Expressions of the compatible profile (see ./lexer.ts): what goes between
 * `{{ }}`, after `{% if %}`, on the right of `{% assign x = %}`.
 *
 *   literals      "text" 'text' 12 -3.5 true false nil null empty blank
 *   ranges        (1..5) (1..section.settings.count)
 *   paths         product.title  collections['frontpage']  block.settings[key]
 *                 list.size  list.first  list.last
 *   comparisons   == != <> < > <= >= contains
 *   logic         and or, read right to left with no precedence, as Liquid does
 *   filters       x | upcase | default: 'none' | image_url: width: 600
 *
 * Positional arguments come first, keyword arguments (`width: 600`) after.
 */
import { CompatSyntaxError } from "./lexer"

export type Expr =
  | { t: "lit"; v: string | number | boolean | null; float?: boolean }
  | { t: "empty" }
  | { t: "blank" }
  | { t: "range"; from: Expr; to: Expr }
  | { t: "path"; root: string; segs: Seg[] }
  | { t: "cmp"; op: CmpOp; l: Expr; r: Expr }
  | { t: "logic"; op: "and" | "or"; l: Expr; r: Expr }
  | { t: "filter"; e: Expr; name: string; args: Expr[]; kwargs: [string, Expr][] }

export type Seg = { k: "name"; v: string } | { k: "index"; e: Expr }
export type CmpOp = "==" | "!=" | "<" | "<=" | ">" | ">=" | "contains"

type ETok =
  | { t: "num"; v: number; float?: boolean }
  | { t: "str"; v: string }
  | { t: "id"; v: string }
  | { t: "op"; v: string }
  | { t: "p"; v: string }

function lexExpr(src: string, line: number): ETok[] {
  const out: ETok[] = []
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (/\s/.test(ch)) { i++; continue }
    if (ch === '"' || ch === "'") {
      const end = src.indexOf(ch, i + 1)
      if (end < 0) throw new CompatSyntaxError(`a string in "${src.slice(0, 60)}" is never closed`, line)
      out.push({ t: "str", v: src.slice(i + 1, end) })
      i = end + 1
      continue
    }
    if (src.startsWith("..", i)) { out.push({ t: "p", v: ".." }); i += 2; continue }
    const num = src.slice(i).match(/^-?\d+(\.\d+)?(?![A-Za-z_])/)
    if (num && !(num[0].startsWith("-") && out.length && (out[out.length - 1].t === "num" || out[out.length - 1].t === "id"))) {
      out.push({ t: "num", v: Number(num[0]), float: num[0].includes(".") })
      i += num[0].length
      continue
    }
    const op = src.slice(i).match(/^(==|!=|<>|<=|>=|<|>)/)
    if (op) { out.push({ t: "op", v: op[0] === "<>" ? "!=" : op[0] }); i += op[0].length; continue }
    /* Names may hold dashes and end in a question mark: `section-title`, `product.available?` is not Liquid, but `settings.show-x` is. */
    const id = src.slice(i).match(/^[A-Za-z_][A-Za-z0-9_-]*\??/)
    if (id) {
      /* A dash at the end of a name is the minus of a following number, never part of the name. */
      out.push({ t: "id", v: id[0] })
      i += id[0].length
      continue
    }
    if ("|:,.[]()".includes(ch)) { out.push({ t: "p", v: ch }); i++; continue }
    /* Anything else (a stray character a theme carries) is skipped, as Shopify's lax parser does. */
    i++
  }
  return out
}

class Parser {
  private pos = 0
  constructor(private toks: ETok[], private line: number) {}
  private peek(o = 0): ETok | undefined { return this.toks[this.pos + o] }
  private take(): ETok {
    const t = this.toks[this.pos++]
    if (!t) throw new CompatSyntaxError(`an expression ends early`, this.line)
    return t
  }
  private is(t: ETok["t"], v?: string, o = 0): boolean {
    const p = this.peek(o)
    return !!p && p.t === t && (v === undefined || (p as { v: unknown }).v === v)
  }
  done(): boolean { return this.pos >= this.toks.length }

  /** A whole output expression: a value and its filters. */
  output(): Expr {
    let e = this.logic()
    while (this.is("p", "|")) {
      this.take()
      const n = this.take()
      if (n.t !== "id") throw new CompatSyntaxError(`a filter name must follow "|"`, this.line)
      const args: Expr[] = []
      const kwargs: [string, Expr][] = []
      if (this.is("p", ":")) {
        this.take()
        for (;;) {
          if (this.is("id") && this.is("p", ":", 1)) {
            const k = this.take() as { v: string }
            this.take()
            kwargs.push([k.v, this.logic()])
          } else {
            args.push(this.logic())
          }
          if (this.is("p", ",")) { this.take(); continue }
          break
        }
      }
      e = { t: "filter", e, name: n.v, args, kwargs }
    }
    return e
  }

  /** `and` and `or`, right to left, no precedence: `a or b and c` is `a or (b and c)`. */
  logic(): Expr {
    const l = this.cmp()
    if (this.is("id", "and") || this.is("id", "or")) {
      const op = (this.take() as { v: "and" | "or" }).v
      return { t: "logic", op, l, r: this.logic() }
    }
    return l
  }

  private cmp(): Expr {
    const l = this.value()
    if (this.is("op")) {
      const op = (this.take() as { v: string }).v as CmpOp
      return { t: "cmp", op, l, r: this.value() }
    }
    if (this.is("id", "contains")) {
      this.take()
      return { t: "cmp", op: "contains", l, r: this.value() }
    }
    return l
  }

  value(): Expr {
    const t = this.take()
    if (t.t === "num") return { t: "lit", v: t.v, float: t.float }
    if (t.t === "str") return this.trail({ t: "lit", v: t.v })
    if (t.t === "p" && t.v === "(") {
      const from = this.value()
      if (this.is("p", "..")) {
        this.take()
        const to = this.value()
        this.expect(")")
        return { t: "range", from, to }
      }
      const inner = this.logicRest(from)
      this.expect(")")
      return inner
    }
    if (t.t === "p" && t.v === "[") {
      /* `['a', 'b']` is not Liquid, but `[key]` at the start is a variable named by key. */
      const e = this.output()
      this.expect("]")
      return this.trail({ t: "path", root: "", segs: [{ k: "index", e }] })
    }
    if (t.t === "id") {
      if (t.v === "true") return { t: "lit", v: true }
      if (t.v === "false") return { t: "lit", v: false }
      if (t.v === "nil" || t.v === "null") return { t: "lit", v: null }
      if (t.v === "empty") return { t: "empty" }
      if (t.v === "blank") return { t: "blank" }
      return this.trail({ t: "path", root: t.v.replace(/\?$/, ""), segs: [] })
    }
    throw new CompatSyntaxError(`"${(t as { v: unknown }).v}" cannot start a value`, this.line)
  }

  private logicRest(first: Expr): Expr {
    let l = first
    if (this.is("op")) { const op = (this.take() as { v: string }).v as CmpOp; l = { t: "cmp", op, l, r: this.value() } }
    else if (this.is("id", "contains")) { this.take(); l = { t: "cmp", op: "contains", l, r: this.value() } }
    if (this.is("id", "and") || this.is("id", "or")) {
      const op = (this.take() as { v: "and" | "or" }).v
      return { t: "logic", op, l, r: this.logic() }
    }
    return l
  }

  /** `.name`, `[expr]` after a value. */
  private trail(e: Expr): Expr {
    const segs: Seg[] = e.t === "path" ? [...e.segs] : []
    let base: Expr = e
    for (;;) {
      if (this.is("p", ".") ) {
        this.take()
        const n = this.take()
        if (n.t !== "id" && n.t !== "num") throw new CompatSyntaxError(`a name must follow "."`, this.line)
        segs.push({ k: "name", v: String(n.v).replace(/\?$/, "") })
      } else if (this.is("p", "[")) {
        this.take()
        const idx = this.output()
        this.expect("]")
        segs.push({ k: "index", e: idx })
      } else break
    }
    if (base.t === "path") return { ...base, segs }
    if (segs.length === 0) return base
    /* A literal with a trail: `'abc'.size`. Read through a path rooted at the literal. */
    base = { t: "path", root: "\u0000lit", segs: [{ k: "index", e }, ...segs] }
    return base
  }

  private expect(v: string) {
    const t = this.take()
    if (t.t !== "p" || t.v !== v) throw new CompatSyntaxError(`expected "${v}"`, this.line)
  }
}

const cache = new Map<string, Expr>()

/** An expression with its filters, as in `{{ … }}` and `{% assign x = … %}`. */
export function parseOutput(src: string, line: number): Expr {
  const key = `o\u0000${src}`
  const hit = cache.get(key)
  if (hit) return hit
  const p = new Parser(lexExpr(src, line), line)
  const e = p.done() ? ({ t: "lit", v: null } as Expr) : p.output()
  if (cache.size > 20_000) cache.clear()
  cache.set(key, e)
  return e
}

/** A condition, as in `{% if … %}`. Filters are allowed, as Shopify allows them. */
export function parseCondition(src: string, line: number): Expr {
  return parseOutput(src, line)
}

/** A list of values separated by commas or `or`: `{% when 'a', 'b' or 'c' %}`, `{% cycle 'a', 'b' %}`. */
export function parseValueList(src: string, line: number): Expr[] {
  const toks = lexExpr(src, line)
  const out: Expr[] = []
  let cur: ETok[] = []
  const flush = () => {
    if (cur.length) out.push(new Parser(cur, line).output())
    cur = []
  }
  for (const t of toks) {
    if ((t.t === "p" && t.v === ",") || (t.t === "id" && t.v === "or")) flush()
    /*
      Liquid reads a `when` as values joined by `or` and commas, and stops at
      anything else: `{% when 'collection' and collection.handle %}` is the
      value 'collection', the rest ignored, as on Shopify. Read as one
      expression it compared the template with the collection's handle, and
      a theme's collection script was never loaded.
    */
    else if (t.t === "id" && t.v === "and") break
    else cur.push(t)
  }
  flush()
  return out
}

/** `key: value, key: value` after a tag's first argument: `{% render 'x', product: p, show: true %}`. */
export function parseNamedArgs(src: string, line: number): [string, Expr][] {
  const out: [string, Expr][] = []
  let rest = src.trim()
  while (rest) {
    rest = rest.replace(/^,\s*/, "")
    const m = rest.match(/^([A-Za-z_][A-Za-z0-9_.-]*)\s*:\s*/)
    if (!m) break
    rest = rest.slice(m[0].length)
    /* The value runs to the next top-level comma. */
    let depth = 0
    let quote = ""
    let end = rest.length
    for (let i = 0; i < rest.length; i++) {
      const c = rest[i]
      if (quote) { if (c === quote) quote = ""; continue }
      if (c === '"' || c === "'") { quote = c; continue }
      if (c === "(" || c === "[") depth++
      else if (c === ")" || c === "]") depth--
      else if (c === "," && depth === 0) { end = i; break }
    }
    out.push([m[1], parseOutput(rest.slice(0, end).trim(), line)])
    rest = rest.slice(end)
  }
  return out
}
