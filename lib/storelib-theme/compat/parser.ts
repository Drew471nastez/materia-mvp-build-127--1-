/**
 * The tree of a compatible-profile file (see ./lexer.ts). Every tag a
 * Shopify theme writes has a node here; a tag nobody knows is kept as a node
 * that draws nothing and is named in the import report, never dropped
 * without a word.
 */
import { CompatSyntaxError, lex, type Tok } from "./lexer"
import { parseCondition, parseNamedArgs, parseOutput, parseValueList, type Expr } from "./expression"

export type Node =
  | { k: "text"; v: string }
  | { k: "out"; e: Expr; line: number }
  | { k: "if"; branches: { cond: Expr; body: Node[] }[]; else?: Node[]; negate?: boolean }
  | { k: "case"; subject: Expr; whens: { values: Expr[]; body: Node[] }[]; else?: Node[] }
  | { k: "for"; v: string; list: Expr; limit?: Expr; offset?: Expr; reversed: boolean; body: Node[]; else?: Node[]; line: number }
  | { k: "tablerow"; v: string; list: Expr; cols?: Expr; limit?: Expr; offset?: Expr; body: Node[] }
  | { k: "break" }
  | { k: "continue" }
  | { k: "assign"; name: string; e: Expr }
  | { k: "capture"; name: string; body: Node[] }
  | { k: "incdec"; name: string; by: 1 | -1 }
  | { k: "cycle"; group?: Expr; values: Expr[] }
  | { k: "render"; name: Expr; args: [string, Expr][]; with?: { e: Expr; as?: string; isFor: boolean }; include: boolean; line: number }
  | { k: "section"; name: string }
  | { k: "sections"; group: string }
  | { k: "content_for"; what: string; args: [string, Expr][] }
  | { k: "form"; type: Expr; obj?: Expr; args: [string, Expr][]; body: Node[] }
  | { k: "paginate"; list: Expr; by: Expr; body: Node[] }
  | { k: "style"; body: Node[] }
  | { k: "verbatim"; name: string; body: string }
  | { k: "layout"; name: Expr }
  /* `{% block 'header', tag: 'div' %}…{% endblock %}`: a theme block placed in a layout or template, what is between the tags its `content`. */
  | { k: "block"; name: Expr; args: [string, Expr][]; body: Node[] }
  /* `{% partial 'name' %}…{% endpartial %}`: a region a script can have drawn again (`@shopify/partial-rendering`). */
  | { k: "partial"; name: Expr; body: Node[] }
  | { k: "unknown"; name: string; line: number }

export interface Parsed {
  nodes: Node[]
  /** `{% schema %}`, `{% stylesheet %}` and `{% javascript %}`, taken out of the markup. */
  schema: string | null
  stylesheet: string
  javascript: string
  /** Tags this file uses that the profile does not know, for the report. */
  unknown: { name: string; line: number }[]
}

const ENDS: Record<string, string[]> = {
  if: ["elsif", "else", "endif"],
  unless: ["elsif", "else", "endunless"],
  case: ["when", "else", "endcase"],
  for: ["else", "endfor"],
  tablerow: ["endtablerow"],
  capture: ["endcapture"],
  block: ["endblock"],
  partial: ["endpartial"],
  form: ["endform"],
  paginate: ["endpaginate"],
  style: ["endstyle"],
  comment: ["endcomment"],
}

/** Where a lenient reading met something it could not read: a comment in the page, as Shopify writes one. */
const syntaxNote = (e: unknown, line: number): Node => ({
  k: "text",
  v: `<!-- Liquid syntax error (line ${e instanceof CompatSyntaxError ? e.line : line}): ${String((e as Error)?.message ?? e).replace(/--/g, "- -").slice(0, 200)} -->`,
})

/**
 * An expression read leniently: `x | append:` is x, `a and` is a, as
 * Shopify's lenient parser reads them. What still does not read is "" (an
 * output) or false (a condition).
 */
function laxExpr(src: string, line: number, cond: boolean): Expr {
  let s = src
  for (let n = 0; n < 6; n++) {
    try {
      return parseOutput(s, line)
    } catch {
      const next = s
        .replace(/\s*(?:\band\b|\bor\b|==|!=|<=|>=|<|>|\bcontains\b)\s*$/, "")
        .replace(/\s*\|\s*[\w-]*\s*:?\s*(?:,\s*)?$/, "")
        .replace(/[\s,:|]+$/, "")
      if (next === s || !next) break
      s = next
    }
  }
  return { t: "lit", v: cond ? false : "" }
}

class TreeBuilder {
  private i = 0
  readonly out: Parsed = { nodes: [], schema: null, stylesheet: "", javascript: "", unknown: [] }
  constructor(private toks: Tok[], private lax = false) {}

  private cond(args: string, line: number): Expr {
    return this.lax ? laxExpr(args, line, true) : parseCondition(args, line)
  }

  private values(args: string, line: number): Expr[] {
    if (!this.lax) return parseValueList(args, line)
    try {
      return parseValueList(args, line)
    } catch {
      return [laxExpr(args, line, false)]
    }
  }

  /** The tag that closed a block, or null where a lenient reading ran out of file. */
  private closer(): Extract<Tok, { kind: "tag" }> | null {
    const next = this.toks[this.i]
    if (!next || next.kind !== "tag") return null
    this.i++
    return next
  }

  build(): Parsed {
    this.out.nodes = this.block([])
    return this.out
  }

  /** Nodes up to one of `stops` (left unread), or to the end. */
  private block(stops: string[]): Node[] {
    const nodes: Node[] = []
    while (this.i < this.toks.length) {
      const t = this.toks[this.i]
      if (t.kind === "tag" && stops.includes(t.name)) return nodes
      this.i++
      if (t.kind === "text") { nodes.push({ k: "text", v: t.value }); continue }
      if (t.kind === "output") { nodes.push({ k: "out", e: this.lax ? laxExpr(t.value, t.line, false) : parseOutput(t.value, t.line), line: t.line }); continue }
      if (t.kind === "verbatim") {
        if (t.name === "schema") this.out.schema = t.body
        else if (t.name === "stylesheet") this.out.stylesheet += t.body + "\n"
        else if (t.name === "javascript") this.out.javascript += t.body + "\n"
        continue
      }
      if (!this.lax) {
        const n = this.tag(t)
        if (n) nodes.push(n)
        continue
      }
      /* Lenient: a tag that does not read is a comment in the page, and the rest of the file still draws. */
      try {
        const n = this.tag(t)
        if (n) nodes.push(n)
      } catch (e) {
        nodes.push(syntaxNote(e, t.line))
      }
    }
    if (stops.length && !this.lax) throw new CompatSyntaxError(`a block is never closed: expected {% ${stops[stops.length - 1]} %}`, this.toks[this.toks.length - 1]?.line ?? 1)
    return nodes
  }

  private expectEnd(name: string) {
    const t = this.toks[this.i]
    if (!t || t.kind !== "tag" || t.name !== name) {
      if (this.lax) return
      throw new CompatSyntaxError(`expected {% ${name} %}`, t?.line ?? 1)
    }
    this.i++
  }

  private tag(t: Extract<Tok, { kind: "tag" }>): Node | null {
    const { name, args, line } = t
    switch (name) {
      case "if":
      case "unless": {
        const end = name === "if" ? "endif" : "endunless"
        const branches: { cond: Expr; body: Node[] }[] = []
        let cond = this.cond(args, line)
        let elseBody: Node[] | undefined
        for (;;) {
          const body = this.block(ENDS[name])
          branches.push({ cond, body })
          const next = this.closer()
          if (!next) break
          if (next.name === "elsif") { cond = this.cond(next.args, next.line); continue }
          if (next.name === "else") { elseBody = this.block([end]); this.expectEnd(end) }
          break
        }
        return { k: "if", branches, else: elseBody, negate: name === "unless" }
      }
      case "case": {
        const subject = parseOutput(args, line)
        /* Whatever sits between case and the first when is dropped, as Liquid drops it. */
        this.block(ENDS.case)
        const whens: { values: Expr[]; body: Node[] }[] = []
        let elseBody: Node[] | undefined
        for (;;) {
          const next = this.closer()
          if (!next || next.name === "endcase") break
          if (next.name === "when") { whens.push({ values: this.values(next.args, next.line), body: this.block(ENDS.case) }); continue }
          if (next.name === "else") { elseBody = this.block(ENDS.case); continue }
        }
        return { k: "case", subject, whens, else: elseBody }
      }
      case "for": {
        const m = args.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s+in\s+([\s\S]+)$/)
        if (!m) throw new CompatSyntaxError(`{% for ${args} %} is not "item in list"`, line)
        const p = loopParams(m[2], line)
        const body = this.block(ENDS.for)
        let elseBody: Node[] | undefined
        const next = this.closer()
        if (next?.name === "else") { elseBody = this.block(["endfor"]); this.expectEnd("endfor") }
        return { k: "for", v: m[1], list: p.list, limit: p.limit, offset: p.offset, reversed: p.reversed, body, else: elseBody, line }
      }
      case "tablerow": {
        const m = args.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s+in\s+([\s\S]+)$/)
        if (!m) throw new CompatSyntaxError(`{% tablerow ${args} %} is not "item in list"`, line)
        const p = loopParams(m[2], line)
        const body = this.block(ENDS.tablerow)
        this.expectEnd("endtablerow")
        return { k: "tablerow", v: m[1], list: p.list, cols: p.cols, limit: p.limit, offset: p.offset, body }
      }
      case "break": return { k: "break" }
      case "continue": return { k: "continue" }
      case "assign": {
        const m = args.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*=\s*([\s\S]*)$/)
        if (!m) throw new CompatSyntaxError(`{% assign ${args} %} is not "name = value"`, line)
        return { k: "assign", name: m[1], e: parseOutput(m[2], line) }
      }
      case "capture": {
        const n = args.replace(/^['"]|['"]$/g, "").trim()
        const body = this.block(ENDS.capture)
        this.expectEnd("endcapture")
        return { k: "capture", name: n, body }
      }
      case "increment":
      case "decrement":
        return { k: "incdec", name: args.trim(), by: name === "increment" ? 1 : -1 }
      case "cycle": {
        const g = args.match(/^((?:"[^"]*"|'[^']*'|[A-Za-z_][\w.-]*))\s*:\s*([\s\S]+)$/)
        if (g) return { k: "cycle", group: parseOutput(g[1], line), values: parseValueList(g[2], line) }
        return { k: "cycle", values: parseValueList(args, line) }
      }
      case "render":
      case "include": {
        const m = args.match(/^("[^"]*"|'[^']*'|[A-Za-z_][\w.-]*)\s*([\s\S]*)$/)
        if (!m) throw new CompatSyntaxError(`{% ${name} %} needs a snippet name`, line)
        let rest = m[2].trim()
        let withPart: { e: Expr; as?: string; isFor: boolean } | undefined
        const w = rest.match(/^(with|for)\s+((?:"[^"]*"|'[^']*'|[A-Za-z_][\w.\[\]'"-]*))(?:\s+as\s+([A-Za-z_][\w-]*))?\s*(,?[\s\S]*)$/)
        if (w) {
          withPart = { e: parseOutput(w[2], line), as: w[3], isFor: w[1] === "for" }
          rest = w[4]
        }
        return { k: "render", name: parseOutput(m[1], line), args: parseNamedArgs(rest.replace(/^,/, ""), line), with: withPart, include: name === "include", line }
      }
      case "block": {
        const m = args.match(/^("[^"]*"|'[^']*'|[A-Za-z_][\w.-]*)\s*,?\s*([\s\S]*)$/)
        if (!m) throw new CompatSyntaxError(`{% block %} needs a block name`, line)
        const body = this.block(ENDS.block)
        this.expectEnd("endblock")
        return { k: "block", name: parseOutput(m[1], line), args: parseNamedArgs(m[2], line), body }
      }
      case "partial": {
        const body = this.block(ENDS.partial)
        this.expectEnd("endpartial")
        return { k: "partial", name: parseOutput(args.trim() || "''", line), body }
      }
      case "section":
        return { k: "section", name: args.replace(/^['"]|['"]$/g, "").trim() }
      case "sections":
        return { k: "sections", group: args.replace(/^['"]|['"]$/g, "").trim() }
      case "content_for": {
        const m = args.match(/^("[^"]*"|'[^']*')\s*,?\s*([\s\S]*)$/)
        if (!m) throw new CompatSyntaxError(`{% content_for %} needs "blocks" or "block"`, line)
        return { k: "content_for", what: m[1].slice(1, -1), args: parseNamedArgs(m[2], line) }
      }
      case "form": {
        const m = args.match(/^("[^"]*"|'[^']*')\s*,?\s*([\s\S]*)$/)
        if (!m) throw new CompatSyntaxError(`{% form %} needs a form type`, line)
        let rest = m[2].trim()
        let obj: Expr | undefined
        const o = rest.match(/^([A-Za-z_][\w.\[\]'"-]*)\s*(,[\s\S]*)?$/)
        if (o && !/:/.test(o[1])) { obj = parseOutput(o[1], line); rest = (o[2] ?? "").replace(/^,/, "") }
        const body = this.block(ENDS.form)
        this.expectEnd("endform")
        return { k: "form", type: parseOutput(m[1], line), obj, args: parseNamedArgs(rest, line), body }
      }
      case "paginate": {
        const m = args.match(/^([\s\S]+?)\s+by\s+([\s\S]+?)(?:\s*,[\s\S]*)?$/)
        if (!m) throw new CompatSyntaxError(`{% paginate ${args} %} is not "list by size"`, line)
        const body = this.block(ENDS.paginate)
        this.expectEnd("endpaginate")
        return { k: "paginate", list: parseOutput(m[1], line), by: parseOutput(m[2], line), body }
      }
      case "style": {
        const body = this.block(ENDS.style)
        this.expectEnd("endstyle")
        return { k: "style", body }
      }
      case "comment": {
        /* From a {% liquid %} block, where comment and endcomment are lines. */
        let depth = 1
        while (this.i < this.toks.length && depth > 0) {
          const n = this.toks[this.i++]
          if (n.kind === "tag" && n.name === "comment") depth++
          if (n.kind === "tag" && n.name === "endcomment") depth--
        }
        return null
      }
      case "layout":
        return { k: "layout", name: parseOutput(args, line) }
      case "else":
      case "elsif":
      case "when":
      case "endif":
      case "endunless":
      case "endfor":
      case "endcase":
      case "endcapture":
      case "endform":
      case "endpaginate":
      case "endstyle":
      case "endtablerow":
        throw new CompatSyntaxError(`{% ${name} %} has nothing to close`, line)
      default:
        this.out.unknown.push({ name, line })
        return { k: "unknown", name, line }
    }
  }
}

function loopParams(src: string, line: number): { list: Expr; limit?: Expr; offset?: Expr; cols?: Expr; reversed: boolean } {
  let rest = src.trim()
  let reversed = false
  const named: Record<string, Expr> = {}
  for (;;) {
    const rev = rest.match(/^([\s\S]*\S)\s+reversed\s*$/)
    if (rev) { reversed = true; rest = rev[1]; continue }
    const kv = rest.match(/^([\s\S]*\S)\s+(limit|offset|cols)\s*:\s*([^\s:]+)\s*$/)
    if (kv) { named[kv[2]] = parseOutput(kv[3], line); rest = kv[1]; continue }
    break
  }
  /* `reversed` may sit straight after the list too: `for x in list reversed limit: 3`. */
  const rev2 = rest.match(/^([\s\S]*\S)\s+reversed$/)
  if (rev2) { reversed = true; rest = rev2[1] }
  return { list: parseOutput(rest.replace(/,\s*$/, ""), line), limit: named.limit, offset: named.offset, cols: named.cols, reversed }
}

/** A file of the compatible profile, read and built. Throws CompatSyntaxError with a line. */
export function parseCompat(src: string, opts?: { lax?: boolean }): Parsed {
  const lax = opts?.lax === true
  return new TreeBuilder(lex(src, lax), lax).build()
}
