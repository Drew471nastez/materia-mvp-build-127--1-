/**
 * Drawing a compatible-profile tree (./parser.ts) over a context.
 *
 * The rules are Liquid's, because a theme's markup depends on them:
 *
 *   only nil and false are false; "" and 0 are true
 *   `blank` is nil, false, "", white space, an empty list or an empty object;
 *   `empty` is "", an empty list or an empty object
 *   `assign` writes to the template's own variables, wherever it is
 *   `{% render %}` sees the globals and what it is passed, nothing else;
 *   `{% include %}` sees everything, and its assigns leak out
 *   `forloop` in every loop, with `parentloop` in a loop inside a loop
 *
 * WHAT IT CANNOT DO. A path only reads data that was put in the context: a
 * function is never called, and `__proto__`, `constructor` and `prototype`
 * are never read. There is no eval and nothing is compiled to JavaScript.
 * Every draw has a budget of steps, of output and of depth, so a template
 * that loops forever stops with an error instead of taking the server down.
 */
import type { CmpOp, Expr } from "./expression"
import type { Node, Parsed } from "./parser"
import { parseCompat } from "./parser"

/** What the runtime asks the outside world for: snippets, filters, sections, forms. */
export interface Env {
  /** A snippet's tree, by name, or null. */
  snippet(name: string): Parsed | null
  /** A filter, or undefined when it does not exist. */
  filter(name: string): FilterFn | undefined
  /** `{% section 'x' %}`, `{% sections 'group' %}`, `{% content_for 'blocks' %}`. */
  section?(ctx: Ctx, name: string): string
  sections?(ctx: Ctx, group: string): string
  contentFor?(ctx: Ctx, what: string, args: Record<string, unknown>): string
  /** `{% block 'name', … %}…{% endblock %}`: blocks/<name>, with what was between the tags as its `content`. */
  placedBlock?(ctx: Ctx, name: string, args: Record<string, unknown>, content: string): string
  /** `{% form %}`: the opening and closing markup around the body, and what the body sees as `form`. */
  form?(ctx: Ctx, type: string, obj: unknown, args: Record<string, unknown>): { open: string; close: string; form: Record<string, unknown>; body?: (html: string) => string }
  /** `{% paginate %}`: the page of the list the body sees, and the `paginate` object. */
  paginate?(ctx: Ctx, list: unknown, by: number): { page: unknown; paginate: Record<string, unknown> }
  /** A tag nobody knows: drawn as nothing, and reported. */
  unknownTag?(name: string): void
}

export type FilterFn = (input: unknown, args: unknown[], kwargs: Record<string, unknown>, ctx: Ctx) => unknown

export class CompatRenderError extends Error {
  constructor(message: string, public line?: number) {
    super(message)
  }
}

const BUDGET = {
  steps: 3_000_000,
  outputChars: 12_000_000,
  depth: 60,
  loopItems: 50_000,
}

const UNREACHABLE = new Set(["__proto__", "constructor", "prototype", "__defineGetter__", "__defineSetter__", "__lookupGetter__", "__lookupSetter__"])

/** The text an object draws as when it is output whole: an image draws its address, a font its family. */
export const OUTPUT = "__liquid_output__"

/**
 * A number that is a float even when it is whole: `10.0`, or what came out
 * of arithmetic with one. Liquid divides two whole numbers as integers and
 * anything with a float as a float, and themes lean on it (`| times: 1.0`
 * before a division for an aspect ratio), so the difference is kept.
 */
export class LFloat {
  constructor(public readonly v: number) {}
}

export class Ctx {
  /** The template's own variables: assign and capture write here. */
  scope: Record<string, unknown>
  /** Loop variables and render arguments, innermost last. */
  frames: Record<string, unknown>[] = []
  counters: Record<string, number>
  cycles: Record<string, number>
  steps = { n: 0 }
  out = { chars: 0 }
  depth = 0
  /** Anything a hook wants to keep for the whole draw: the section being drawn, the block, the form. */
  registers: Record<string, unknown>

  constructor(public globals: Record<string, unknown>, public env: Env, init?: Partial<Pick<Ctx, "scope" | "counters" | "cycles" | "registers" | "steps" | "out" | "depth">>) {
    this.scope = init?.scope ?? {}
    this.counters = init?.counters ?? {}
    this.cycles = init?.cycles ?? {}
    this.registers = init?.registers ?? {}
    if (init?.steps) this.steps = init.steps
    if (init?.out) this.out = init.out
    if (init?.depth !== undefined) this.depth = init.depth
  }

  /** A context for a `{% render %}`: the globals and the registers, nothing assigned. */
  isolated(vars: Record<string, unknown>): Ctx {
    /* A snippet's arguments are its own variables: `{% assign order = order | split: ',' %}` replaces the one it was handed. */
    return new Ctx(this.globals, this.env, { scope: { ...vars }, counters: {}, cycles: {}, registers: this.registers, steps: this.steps, out: this.out, depth: this.depth + 1 })
  }

  /** A context for a section or a block with its own globals (`section`, `block`), sharing the budget. */
  child(globals: Record<string, unknown>): Ctx {
    return new Ctx({ ...this.globals, ...globals }, this.env, { registers: { ...this.registers }, steps: this.steps, out: this.out, depth: this.depth + 1 })
  }

  lookup(name: string): unknown {
    for (let i = this.frames.length - 1; i >= 0; i--) {
      if (Object.prototype.hasOwnProperty.call(this.frames[i], name)) return this.frames[i][name]
    }
    if (Object.prototype.hasOwnProperty.call(this.scope, name)) return this.scope[name]
    if (Object.prototype.hasOwnProperty.call(this.globals, name)) return this.globals[name]
    return undefined
  }

  tick() {
    if (++this.steps.n > BUDGET.steps) throw new CompatRenderError("This template does too much work to draw a page (a loop that does not end?)")
  }
}

// ── Values ───────────────────────────────────────────────────────────────────

export function isBlank(v: unknown): boolean {
  if (v === null || v === undefined || v === false) return true
  if (v instanceof LFloat) return false
  if (typeof v === "string") return v.trim() === ""
  if (Array.isArray(v)) return v.length === 0
  if (typeof v === "object") {
    const out = (v as Record<string, unknown>)[OUTPUT]
    if (out !== undefined) return isBlank(out)
    return Object.keys(v).length === 0
  }
  return false
}

export function isEmpty(v: unknown): boolean {
  if (v instanceof LFloat) return false
  if (typeof v === "string") return v === ""
  if (Array.isArray(v)) return v.length === 0
  if (v && typeof v === "object") return Object.keys(v).filter((k) => k !== OUTPUT).length === 0
  return false
}

export function truthy(v: unknown): boolean {
  return v !== null && v !== undefined && v !== false
}

/** Read one name or index off a value. */
export function prop(base: unknown, key: unknown): unknown {
  if (base === null || base === undefined || base instanceof LFloat) return undefined
  if (typeof key === "number" || (typeof key === "string" && /^-?\d+$/.test(key) && Array.isArray(base))) {
    if (Array.isArray(base)) {
      const n = Number(key)
      return n < 0 ? base[base.length + n] : base[n]
    }
  }
  /*
    AN OBJECT AS A KEY IS ITS HANDLE. A section's product or collection
    setting is already the product or the collection, and themes still write
    all_products[section.settings.product] and
    collections[section.settings.collection], as they did when those settings
    were handles. Shopify answers both; reading the object as its handle (or
    what it prints as) does too, instead of a featured product that falls
    back to its placeholder.
  */
  const k = key && typeof key === "object" && !Array.isArray(key) && !(key instanceof LFloat)
    ? typeof (key as Record<string, unknown>).handle === "string" ? String((key as Record<string, unknown>).handle) : toOutput(key)
    : String(key)
  if (UNREACHABLE.has(k)) return undefined
  if (k === "size") {
    if (typeof base === "string" || Array.isArray(base)) return base.length
    if (typeof base === "object") {
      const own = (base as Record<string, unknown>).size
      if (own !== undefined && typeof own !== "function") return own
      return Object.keys(base).filter((x) => x !== OUTPUT).length
    }
    return undefined
  }
  if (Array.isArray(base)) {
    if (k === "first") return base[0]
    if (k === "last") return base[base.length - 1]
    return undefined
  }
  if (typeof base === "string") {
    if (k === "first") return base[0]
    if (k === "last") return base[base.length - 1]
    return undefined
  }
  if (typeof base !== "object") return undefined
  let v = (base as Record<string, unknown>)[k]
  /* `attached_to_variant?` is Ruby's spelling of a yes-or-no property. */
  if (v === undefined && k.endsWith("?")) v = (base as Record<string, unknown>)[k.slice(0, -1)]
  if (typeof v === "function") return undefined
  return v
}

/** What a value prints as. */
export function toOutput(v: unknown): string {
  if (v === null || v === undefined) return ""
  if (typeof v === "string") return v
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : ""
  if (v instanceof LFloat) return Number.isFinite(v.v) ? (Number.isInteger(v.v) ? `${v.v}.0` : String(v.v)) : ""
  if (typeof v === "boolean") return v ? "true" : "false"
  if (Array.isArray(v)) return v.map(toOutput).join("")
  if (typeof v === "object") {
    const out = (v as Record<string, unknown>)[OUTPUT]
    if (out !== undefined) return toOutput(out)
    return ""
  }
  return ""
}

/** Liquid's `==`: numbers with numbers, strings with strings, a drop with what it prints as. */
function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if ((a === null || a === undefined) && (b === null || b === undefined)) return true
  const pa = primitive(a)
  const pb = primitive(b)
  if (typeof pa === "number" && typeof pb === "string" && pb.trim() !== "" && Number(pb) === pa) return false
  if (pa === pb) return true
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => equal(x, b[i]))
  /* Two objects are the same object when they share an id: `product == current_product`. */
  if (a && b && typeof a === "object" && typeof b === "object" && "id" in (a as object) && "id" in (b as object)) return (a as { id: unknown }).id === (b as { id: unknown }).id
  return false
}

function primitive(v: unknown): unknown {
  if (v instanceof LFloat) return v.v
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const out = (v as Record<string, unknown>)[OUTPUT]
    if (out !== undefined) return out
  }
  return v
}

function compare(op: CmpOp, a: unknown, b: unknown): boolean {
  if (op === "==") return equal(a, b)
  if (op === "!=") return !equal(a, b)
  if (op === "contains") {
    if (typeof a === "string") return b !== null && b !== undefined && a.includes(toOutput(b))
    if (Array.isArray(a)) return a.some((x) => equal(x, b))
    if (a && typeof a === "object") return Object.prototype.hasOwnProperty.call(a, toOutput(b))
    return false
  }
  const pa = primitive(a)
  const pb = primitive(b)
  if (pa === null || pa === undefined || pb === null || pb === undefined) return false
  const na = typeof pa === "number" ? pa : typeof pa === "string" && pa.trim() !== "" && Number.isFinite(Number(pa)) && typeof pb === "number" ? Number(pa) : pa
  const nb = typeof pb === "number" ? pb : typeof pb === "string" && pb.trim() !== "" && Number.isFinite(Number(pb)) && typeof pa === "number" ? Number(pb) : pb
  if (typeof na !== typeof nb) return false
  const x = na as number | string
  const y = nb as number | string
  if (op === "<") return x < y
  if (op === "<=") return x <= y
  if (op === ">") return x > y
  return x >= y
}

/** Anything a loop can go through, as a list: a list, a range, an object's values, a string as one item. */
export function toList(v: unknown): unknown[] {
  if (v === null || v === undefined || v === false) return []
  if (Array.isArray(v)) return v
  if (typeof v === "string") return v === "" ? [] : [v]
  if (v instanceof LFloat) return [v]
  if (typeof v === "object") {
    const o = v as Record<string, unknown>
    /* A drop that is a list (a collection's products, a paginated page) says so. */
    if (Array.isArray(o.__list__)) return o.__list__ as unknown[]
    /* One object (a picture, a product): a list of one, as Liquid makes of a drop. */
    if (OUTPUT in o || "id" in o) return [v]
    /* A map of objects (the colour schemes, the collections by handle): its objects, in order. */
    return Object.entries(o).filter(([k]) => k !== OUTPUT && !k.startsWith("__")).map(([, val]) => val)
  }
  return [v]
}

// ── Expressions ──────────────────────────────────────────────────────────────

export function evaluate(e: Expr, ctx: Ctx): unknown {
  switch (e.t) {
    case "array": return e.items.map((x) => evaluate(x, ctx))
    case "lit": return e.float && typeof e.v === "number" ? new LFloat(e.v) : e.v
    case "empty": return EMPTY
    case "blank": return BLANK
    case "range": {
      const from = Math.trunc(Number(primitive(evaluate(e.from, ctx))) || 0)
      const to = Math.trunc(Number(primitive(evaluate(e.to, ctx))) || 0)
      const n = Math.max(0, Math.min(to - from + 1, BUDGET.loopItems))
      return Array.from({ length: n }, (_, i) => from + i)
    }
    case "path": {
      let v: unknown
      let segs = e.segs
      if (e.root === "\u0000lit") { v = evaluate((segs[0] as { e: Expr }).e, ctx); segs = segs.slice(1) }
      else if (e.root === "") { v = ctx.lookup(toOutput(evaluate((segs[0] as { e: Expr }).e, ctx))); segs = segs.slice(1) }
      else v = ctx.lookup(e.root)
      for (const s of segs) {
        if (v === undefined || v === null) return undefined
        v = prop(v, s.k === "name" ? s.v : (() => { const k = evaluate(s.e, ctx); return typeof k === "number" || (k !== null && typeof k === "object" && !Array.isArray(k) && !(k instanceof LFloat)) ? k : toOutput(k) })())
      }
      return v
    }
    case "cmp": {
      const l = evaluate(e.l, ctx)
      const r = evaluate(e.r, ctx)
      if (r === EMPTY) return e.op === "==" ? isEmpty(l) : e.op === "!=" ? !isEmpty(l) : false
      if (l === EMPTY) return e.op === "==" ? isEmpty(r) : e.op === "!=" ? !isEmpty(r) : false
      if (r === BLANK) return e.op === "==" ? isBlank(l) : e.op === "!=" ? !isBlank(l) : false
      if (l === BLANK) return e.op === "==" ? isBlank(r) : e.op === "!=" ? !isBlank(r) : false
      return compare(e.op, l, r)
    }
    case "logic": {
      const l = truthy(evaluate(e.l, ctx))
      if (e.op === "and") return l && truthy(evaluate(e.r, ctx))
      return l || truthy(evaluate(e.r, ctx))
    }
    case "filter": {
      const input = evaluate(e.e, ctx)
      const fn = ctx.env.filter(e.name)
      /* An unknown filter leaves the value as it was, as Shopify's lax mode does. The import report names it. */
      if (!fn) return input
      const args = e.args.map((a) => evaluate(a, ctx))
      const kwargs: Record<string, unknown> = {}
      for (const [k, v] of e.kwargs) kwargs[k] = evaluate(v, ctx)
      return fn(input, args, kwargs, ctx)
    }
  }
}

/* `empty` and `blank` compare by meaning, never by identity. */
const EMPTY = Object.freeze({ __special: "empty" })
const BLANK = Object.freeze({ __special: "blank" })

// ── Nodes ────────────────────────────────────────────────────────────────────

class Interrupt {
  constructor(public kind: "break" | "continue") {}
}

/**
 * ONE TAG THAT FAILS IS ONE COMMENT, NOT A BLANK SECTION. Shopify draws a
 * failing output or tag as "Liquid error (line n): ..." where it stood and
 * goes on with the rest; a theme written against that (a filter given a
 * value it does not take, a snippet that reads a missing object) drew a
 * whole section, or the whole layout with its header and footer, as
 * nothing here. A break or continue, and a page past its budget, still go
 * through: those are not a tag failing.
 */
export function renderNodes(nodes: Node[], ctx: Ctx, out: string[]): void {
  for (const n of nodes) {
    ctx.tick()
    try {
      renderNode(n, ctx, out)
    } catch (e) {
      if (e instanceof Interrupt || e instanceof CompatRenderError || ctx.registers.strictErrors === true) throw e
      const line = "line" in n && typeof n.line === "number" ? ` (line ${n.line})` : ""
      const said = String((e as Error)?.message ?? e).replace(/--/g, "- -").replace(/[<>]/g, "").slice(0, 200)
      push(out, ctx, `<!-- Liquid error${line}: ${said} -->`)
      /* Kept for the editor's note on the section, as the error itself was. */
      if (Array.isArray(ctx.registers.liquidErrors)) (ctx.registers.liquidErrors as string[]).push(`${said}${line}`)
    }
  }
}

function push(out: string[], ctx: Ctx, s: string) {
  if (!s) return
  ctx.out.chars += s.length
  if (ctx.out.chars > BUDGET.outputChars) throw new CompatRenderError("This page draws more markup than a page may have")
  out.push(s)
}

function renderNode(n: Node, ctx: Ctx, out: string[]): void {
  switch (n.k) {
    case "text": push(out, ctx, n.v); return
    case "out": push(out, ctx, toOutput(evaluate(n.e, ctx))); return
    case "if": {
      for (let i = 0; i < n.branches.length; i++) {
        const b = n.branches[i]
        const ok = truthy(evaluate(b.cond, ctx))
        /* `unless … elsif`: only the first condition is turned round; an elsif reads as an if. */
        if (n.negate && i === 0 ? !ok : ok) { renderNodes(b.body, ctx, out); return }
      }
      if (n.else) renderNodes(n.else, ctx, out)
      return
    }
    case "case": {
      const v = evaluate(n.subject, ctx)
      let hit = false
      for (const w of n.whens) {
        if (w.values.some((x) => equal(v, evaluate(x, ctx)))) { renderNodes(w.body, ctx, out); hit = true }
      }
      if (!hit && n.else) renderNodes(n.else, ctx, out)
      return
    }
    case "for": return renderFor(n, ctx, out)
    case "tablerow": return renderTablerow(n, ctx, out)
    case "break": throw new Interrupt("break")
    case "continue": throw new Interrupt("continue")
    case "assign": ctx.scope[n.name] = evaluate(n.e, ctx); return
    case "capture": {
      const inner: string[] = []
      renderNodes(n.body, ctx, inner)
      ctx.scope[n.name] = inner.join("")
      return
    }
    case "incdec": {
      const cur = ctx.counters[n.name] ?? 0
      if (n.by === 1) { push(out, ctx, String(cur)); ctx.counters[n.name] = cur + 1 }
      else { ctx.counters[n.name] = cur - 1; push(out, ctx, String(cur - 1)) }
      return
    }
    case "cycle": {
      const values = n.values.map((x) => evaluate(x, ctx))
      const key = n.group ? toOutput(evaluate(n.group, ctx)) : n.values.map((x) => JSON.stringify(x)).join(",")
      const at = ctx.cycles[key] ?? 0
      push(out, ctx, toOutput(values[at % values.length]))
      ctx.cycles[key] = at + 1
      return
    }
    case "render": return renderSnippet(n, ctx, out)
    case "section": if (ctx.env.section) push(out, ctx, ctx.env.section(ctx, n.name)); return
    case "sections": if (ctx.env.sections) push(out, ctx, ctx.env.sections(ctx, n.group)); return
    case "partial": {
      /* Marked so `partials.refresh(name)` finds it again; display: contents keeps the theme's layout as written. */
      const name = String(toOutput(evaluate(n.name, ctx))).replace(/[^\w.-]/g, "")
      push(out, ctx, `<div data-shopify-partial="${name}" style="display:contents">`)
      renderNodes(n.body, ctx, out)
      push(out, ctx, "</div>")
      return
    }
    case "block": {
      /* What is between the tags is drawn first, where it stands, and handed to the block as `content`. */
      const inner: string[] = []
      renderNodes(n.body, ctx, inner)
      if (!ctx.env.placedBlock) { push(out, ctx, inner.join("")); return }
      const args: Record<string, unknown> = {}
      for (const [k, v] of n.args) args[k] = evaluate(v, ctx)
      push(out, ctx, ctx.env.placedBlock(ctx, toOutput(evaluate(n.name, ctx)), args, inner.join("")))
      return
    }
    case "content_for": {
      if (!ctx.env.contentFor) return
      const args: Record<string, unknown> = {}
      for (const [k, v] of n.args) args[k] = evaluate(v, ctx)
      push(out, ctx, ctx.env.contentFor(ctx, n.what, args))
      return
    }
    case "form": {
      const type = toOutput(evaluate(n.type, ctx))
      const obj = n.obj ? evaluate(n.obj, ctx) : undefined
      const args: Record<string, unknown> = {}
      for (const [k, v] of n.args) args[k] = evaluate(v, ctx)
      const f = ctx.env.form ? ctx.env.form(ctx, type, obj, args) : { open: "<form>", close: "</form>", form: {} }
      push(out, ctx, f.open)
      ctx.frames.push({ form: f.form })
      /* `body`: the form's own markup, changed before it is written (a sign up form's password field, which Storelib never reads). */
      const inner: string[] = f.body ? [] : out
      try { renderNodes(n.body, ctx, inner) } finally { ctx.frames.pop() }
      if (f.body) { const shown = f.body(inner.join("")); if (shown) out.push(shown) }
      push(out, ctx, f.close)
      return
    }
    case "paginate": {
      const list = evaluate(n.list, ctx)
      const by = Math.max(1, Math.trunc(Number(primitive(evaluate(n.by, ctx))) || 1))
      const p = ctx.env.paginate ? ctx.env.paginate(ctx, list, by) : { page: list, paginate: {} }
      /* The body reads the list by the same path it was named with, so it sees only this page. */
      const frame: Record<string, unknown> = { paginate: p.paginate }
      if (n.list.t === "path" && n.list.root) {
        if (n.list.segs.length === 0) frame[n.list.root] = p.page
        else frame[n.list.root] = withPath(ctx.lookup(n.list.root), n.list.segs.map((s) => (s.k === "name" ? s.v : toOutput(evaluate(s.e, ctx)))), p.page)
      }
      ctx.frames.push(frame)
      try { renderNodes(n.body, ctx, out) } finally { ctx.frames.pop() }
      return
    }
    case "style": {
      const inner: string[] = []
      renderNodes(n.body, ctx, inner)
      push(out, ctx, `<style data-shopify>${inner.join("")}</style>`)
      return
    }
    case "verbatim": push(out, ctx, n.body); return
    /* `{% layout none %}` names no variable: it is the page without a layout, as an ajax template asks. */
    case "layout": ctx.registers.layout = evaluate(n.name, ctx) ?? "none"; return
    case "unknown": ctx.env.unknownTag?.(n.name); return
  }
}

/** A copy of `base` with the value at `segs` replaced: a paginated `collection.products`. */
function withPath(base: unknown, segs: string[], value: unknown): unknown {
  if (segs.length === 0) return value
  const obj = base && typeof base === "object" && !Array.isArray(base) ? { ...(base as Record<string, unknown>) } : {}
  obj[segs[0]] = withPath((base as Record<string, unknown> | undefined)?.[segs[0]], segs.slice(1), value)
  return obj
}

function sliceLoop(list: unknown[], ctx: Ctx, offset?: Expr, limit?: Expr): unknown[] {
  let items = list
  if (offset) {
    const o = evaluate(offset, ctx)
    const n = Math.trunc(Number(primitive(o)) || 0)
    items = items.slice(Math.max(0, n))
  }
  if (limit) {
    const n = Math.trunc(Number(primitive(evaluate(limit, ctx))) || 0)
    items = items.slice(0, Math.max(0, n))
  }
  return items.slice(0, BUDGET.loopItems)
}

function renderFor(n: Extract<Node, { k: "for" }>, ctx: Ctx, out: string[]) {
  let items = sliceLoop(toList(evaluate(n.list, ctx)), ctx, n.offset, n.limit)
  if (n.reversed) items = [...items].reverse()
  if (items.length === 0) {
    if (n.else) renderNodes(n.else, ctx, out)
    return
  }
  const parent = ctx.lookup("forloop")
  const loop: Record<string, unknown> = { length: items.length, parentloop: parent ?? null, name: `${n.v}-${n.line}` }
  const frame: Record<string, unknown> = { forloop: loop }
  ctx.frames.push(frame)
  try {
    for (let i = 0; i < items.length; i++) {
      loop.index = i + 1
      loop.index0 = i
      loop.rindex = items.length - i
      loop.rindex0 = items.length - i - 1
      loop.first = i === 0
      loop.last = i === items.length - 1
      frame[n.v] = items[i]
      try {
        renderNodes(n.body, ctx, out)
      } catch (e) {
        if (e instanceof Interrupt) {
          if (e.kind === "break") break
          continue
        }
        throw e
      }
    }
  } finally {
    ctx.frames.pop()
  }
}

function renderTablerow(n: Extract<Node, { k: "tablerow" }>, ctx: Ctx, out: string[]) {
  const items = sliceLoop(toList(evaluate(n.list, ctx)), ctx, n.offset, n.limit)
  const cols = n.cols ? Math.max(1, Math.trunc(Number(primitive(evaluate(n.cols, ctx))) || 1)) : items.length || 1
  const loop: Record<string, unknown> = { length: items.length }
  const frame: Record<string, unknown> = { tablerowloop: loop }
  ctx.frames.push(frame)
  try {
    push(out, ctx, `<tr class="row1">\n`)
    for (let i = 0; i < items.length; i++) {
      const col = i % cols
      const row = Math.floor(i / cols)
      if (i > 0 && col === 0) push(out, ctx, `</tr>\n<tr class="row${row + 1}">`)
      Object.assign(loop, { index: i + 1, index0: i, col: col + 1, col0: col, row: row + 1, first: i === 0, last: i === items.length - 1, col_first: col === 0, col_last: col === cols - 1 || i === items.length - 1 })
      frame[n.v] = items[i]
      push(out, ctx, `<td class="col${col + 1}">`)
      renderNodes(n.body, ctx, out)
      push(out, ctx, `</td>`)
    }
    push(out, ctx, `</tr>\n`)
  } finally {
    ctx.frames.pop()
  }
}

function renderSnippet(n: Extract<Node, { k: "render" }>, ctx: Ctx, out: string[]) {
  const name = toOutput(evaluate(n.name, ctx))
  if (ctx.depth > BUDGET.depth) throw new CompatRenderError(`Snippets render each other more than ${BUDGET.depth} deep (does ${name} render itself?)`, n.line)
  const tree = ctx.env.snippet(name)
  if (!tree) {
    ctx.env.unknownTag?.(`render:${name}`)
    return
  }
  const args: Record<string, unknown> = {}
  for (const [k, v] of n.args) args[k] = evaluate(v, ctx)
  if (n.include) {
    /* include shares everything, and its assigns are the caller's. */
    ctx.frames.push(args)
    ctx.depth++
    try { renderNodes(tree.nodes, ctx, out) } finally { ctx.depth--; ctx.frames.pop() }
    return
  }
  const as = n.with?.as ?? name
  if (n.with?.isFor) {
    const items = toList(evaluate(n.with.e, ctx))
    items.forEach((item, i) => {
      const forloop = { index: i + 1, index0: i, rindex: items.length - i, rindex0: items.length - i - 1, first: i === 0, last: i === items.length - 1, length: items.length }
      const c = ctx.isolated({ ...args, [as]: item, forloop })
      renderNodes(tree.nodes, c, out)
    })
    return
  }
  const vars = n.with ? { ...args, [as]: evaluate(n.with.e, ctx) } : args
  renderNodes(tree.nodes, ctx.isolated(vars), out)
}

/** Draw a tree to a string. */
export function renderTree(tree: Parsed | Node[], ctx: Ctx): string {
  const out: string[] = []
  try {
    renderNodes(Array.isArray(tree) ? tree : tree.nodes, ctx, out)
  } catch (e) {
    if (e instanceof Interrupt) return out.join("")
    throw e
  }
  return out.join("")
}

/** Parse and draw one string: for settings that hold the template language, and for tests. */
export function renderString(src: string, ctx: Ctx, opts?: { lax?: boolean }): string {
  return renderTree(parseCompat(src, opts), ctx)
}
