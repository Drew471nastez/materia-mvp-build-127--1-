/**
 * ===========================================================================
 *  A THEME'S SETTINGS-DRIVEN CSS, WORKED OUT ONCE AT IMPORT
 * ===========================================================================
 * A Shopify theme builds its CSS variables in Liquid: Horizon's
 * theme-styles-variables and color-palette snippets read the theme's fonts
 * and colour schemes from settings_data.json and print `--font-body--family`,
 * `--color-background` and three hundred more. Every section's CSS reads
 * those variables, so without them an imported section draws unstyled.
 *
 * The values are all known at import: they come from the theme's own saved
 * settings. So this evaluates those snippets ONCE, here, against those
 * settings, and what comes out is plain CSS. Nothing of it runs on the site:
 * no Liquid runtime is shipped, and the CSS then goes through the same
 * cleaner as Custom CSS (lib/storelib-theme/custom-css.ts).
 *
 * What it reads is data and nothing else: settings, colour and font objects,
 * the theme's own snippets and stylesheets. It never fetches, never touches
 * the file system, and stops after STEP_LIMIT steps or OUTPUT_LIMIT
 * characters, so a theme cannot make it loop.
 *
 * The language is Liquid's: output with filters, liquid, assign, capture,
 * echo, if / elsif / else / unless, case / when, for (with ranges, limit,
 * offset, reversed, break, continue, forloop), render and include with
 * parameters, comment, doc and raw. A tag it does not know prints nothing.
 * Filters are the template language's own (template.ts liquidFilter), plus
 * Shopify's font and asset filters, which here mean what they can mean
 * without Shopify's CDN.
 */

import { liquidFilter } from "../storelib/template"

const STEP_LIMIT = 400_000
const OUTPUT_LIMIT = 2_000_000

/* ── Shopify's objects, as data ─────────────────────────────────────────── */

/** A colour setting, as Shopify hands one to Liquid: prints as itself, and has .red, .alpha and the rest. */
export class LiquidColor {
  readonly red: number
  readonly green: number
  readonly blue: number
  readonly alpha: number
  readonly hue: number
  readonly saturation: number
  readonly lightness: number
  constructor(public readonly raw: string, rgba: { r: number; g: number; b: number; a: number }) {
    this.red = rgba.r
    this.green = rgba.g
    this.blue = rgba.b
    this.alpha = rgba.a
    const R = rgba.r / 255, G = rgba.g / 255, B = rgba.b / 255
    const max = Math.max(R, G, B), min = Math.min(R, G, B)
    const l = (max + min) / 2
    let h = 0, s = 0
    if (max !== min) {
      const d = max - min
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
      h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4
    }
    this.hue = Math.round(h * 60)
    this.saturation = Math.round(s * 100)
    this.lightness = Math.round(l * 100)
  }
  get rgb(): string { return `${this.red} ${this.green} ${this.blue}` }
  get rgba(): string { return `${this.red} ${this.green} ${this.blue} / ${Math.round(this.alpha * 100) / 100}` }
  toString(): string {
    if (this.alpha < 1) return `rgba(${this.red}, ${this.green}, ${this.blue}, ${Math.round(this.alpha * 1000) / 1000})`
    return "#" + [this.red, this.green, this.blue].map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0")).join("")
  }
}

export function parseColor(v: unknown): LiquidColor | null {
  if (v instanceof LiquidColor) return v
  if (typeof v !== "string") return null
  const s = v.trim()
  let m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})([0-9a-f]{2})?$/i)
  if (m) {
    let h = m[1]
    if (h.length === 3) h = h.split("").map((c) => c + c).join("")
    const n = parseInt(h, 16)
    return new LiquidColor(s, { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: m[2] ? Math.round((parseInt(m[2], 16) / 255) * 1000) / 1000 : 1 })
  }
  m = s.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i)
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith("%") ? Number(m[4].slice(0, -1)) / 100 : Number(m[4])
    return new LiquidColor(s, { r: +m[1], g: +m[2], b: +m[3], a })
  }
  return null
}

/**
 * A font setting, as Shopify hands one to Liquid: `inter_n4` is Inter, 400,
 * normal. Shopify's font library is Google's and the system fonts, under the
 * same names, so the family a section asks for is the family Storelib loads.
 */
export class LiquidFont {
  constructor(public readonly family: string, public readonly weight: number, public readonly style: "normal" | "italic", public readonly system: boolean, public readonly fallback_families: string) {}
  get ["system?"](): boolean { return this.system }
  get variants(): LiquidFont[] { return [this] }
  toString(): string { return this.family }
}

const FAMILY_CASE: Record<string, string> = { dm: "DM", pt: "PT", ibm: "IBM", eb: "EB", sc: "SC", ui: "UI", jp: "JP", kr: "KR", tc: "TC", sc_: "SC" }

export function parseFont(handle: unknown): LiquidFont | null {
  if (handle instanceof LiquidFont) return handle
  if (typeof handle !== "string" || !handle.trim()) return null
  const m = handle.trim().match(/^([a-z0-9_]+?)_([ni])(\d)$/i)
  if (!m) return null
  const name = m[1]
  const system = /^(system|sans-serif|serif|monospace)/.test(name)
  const family = system
    ? name.startsWith("monospace") ? "monospace" : name.includes("serif") && !name.includes("sans") ? "serif" : "system-ui"
    : name.split("_").map((w) => FAMILY_CASE[w] ?? (w.charAt(0).toUpperCase() + w.slice(1))).join(" ")
  const serifish = /serif|garamond|playfair|lora|merriweather|baskerville|caslon|bodoni|crimson|cormorant|libre_baskerville/i.test(name) && !/sans/i.test(name)
  return new LiquidFont(family, Number(m[3]) * 100, m[2] === "i" ? "italic" : "normal", system, system ? "" : serifish ? "serif" : "sans-serif")
}

/* ── Values ─────────────────────────────────────────────────────────────── */

const BLOCKED = new Set(["__proto__", "constructor", "prototype"])

function str(v: unknown): string {
  if (v === undefined || v === null || v === false) return ""
  if (v instanceof LiquidColor || v instanceof LiquidFont) return v.toString()
  if (Array.isArray(v)) return v.map(str).join("")
  if (typeof v === "object") return ""
  return String(v)
}

function truthy(v: unknown): boolean {
  return v !== undefined && v !== null && v !== false
}

function isBlank(v: unknown): boolean {
  if (v === undefined || v === null || v === false) return true
  if (typeof v === "string") return v.trim() === ""
  if (Array.isArray(v)) return v.length === 0
  if (typeof v === "object" && !(v instanceof LiquidColor) && !(v instanceof LiquidFont)) return Object.keys(v as object).length === 0
  return false
}

function prop(obj: unknown, key: string): unknown {
  if (obj === undefined || obj === null || BLOCKED.has(key)) return undefined
  if (Array.isArray(obj)) {
    if (key === "size") return obj.length
    if (key === "first") return obj[0]
    if (key === "last") return obj[obj.length - 1]
    const n = Number(key)
    return Number.isInteger(n) ? obj[n < 0 ? obj.length + n : n] : undefined
  }
  if (typeof obj === "string") return key === "size" ? obj.length : undefined
  if (obj instanceof LiquidColor || obj instanceof LiquidFont) return (obj as unknown as Record<string, unknown>)[key]
  if (typeof obj === "object") {
    const o = obj as Record<string, unknown>
    if (key === "size") return Object.prototype.hasOwnProperty.call(o, "size") ? o.size : Object.keys(o).length
    return Object.prototype.hasOwnProperty.call(o, key) ? o[key] : undefined
  }
  return undefined
}

/* ── Expressions ────────────────────────────────────────────────────────── */

type Tok = { t: "str" | "num" | "id" | "op" | "p"; v: string }

function lex(src: string): Tok[] {
  const out: Tok[] = []
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (/\s/.test(ch)) { i++; continue }
    if (ch === '"' || ch === "'") {
      const end = src.indexOf(ch, i + 1)
      const stop = end === -1 ? src.length : end
      out.push({ t: "str", v: src.slice(i + 1, stop) })
      i = stop + 1
      continue
    }
    const rest = src.slice(i)
    if (rest.startsWith("..")) { out.push({ t: "p", v: ".." }); i += 2; continue }
    const num = rest.match(/^-?\d+(\.\d+)?/)
    if (num && !(out.length && (out[out.length - 1].t === "id" || out[out.length - 1].t === "num") && ch === "-")) { out.push({ t: "num", v: num[0] }); i += num[0].length; continue }
    const op = rest.match(/^(==|!=|<>|<=|>=|<|>)/)
    if (op) { out.push({ t: "op", v: op[0] }); i += op[0].length; continue }
    const id = rest.match(/^[A-Za-z_][\w-]*\??/)
    if (id) { out.push({ t: "id", v: id[0] }); i += id[0].length; continue }
    if ("|:,.[]()=".includes(ch)) { out.push({ t: "p", v: ch }); i++; continue }
    i++
  }
  return out
}

class Reader {
  pos = 0
  constructor(public toks: Tok[]) {}
  peek(o = 0): Tok | undefined { return this.toks[this.pos + o] }
  is(t: Tok["t"], v?: string): boolean { const p = this.peek(); return !!p && p.t === t && (v === undefined || p.v === v) }
  done(): boolean { return this.pos >= this.toks.length }
}

/* ── The evaluator ──────────────────────────────────────────────────────── */

type Scope = Record<string, unknown>
class Signal { constructor(public readonly kind: "break" | "continue") {} }

export interface StaticLiquidInput {
  /** The theme's settings, from settings_data.json, with colours and fonts as objects. */
  settings: Record<string, unknown>
  /** A snippet's source by name, or null. */
  snippet: (name: string) => string | null
  /** A stylesheet in assets/ by name, or null; `asset_url | stylesheet_tag` writes it in. */
  stylesheet: (name: string) => string | null
  /** A picture or font in assets/ by name, as the package's `asset://` reference, or null. */
  asset?: (name: string) => string | null
}

export class StaticLiquid {
  private steps = 0
  private depth = 0
  readonly unknownTags = new Set<string>()
  readonly unknownFilters = new Set<string>()
  constructor(private readonly input: StaticLiquidInput) {}

  /** The text a template prints, with every tag and output worked out. Never throws. */
  render(source: string, scope: Scope = {}): string {
    const out: string[] = []
    try {
      this.run(this.parse(source), { settings: this.input.settings, ...scope }, out)
    } catch (e) {
      if (!(e instanceof Signal) && !(e instanceof Stop)) throw e
    }
    return out.join("")
  }

  /* Templates to a flat list of pieces, tags as they are. */
  private parse(src: string): Piece[] {
    const pieces: Piece[] = []
    const re = /\{%-?\s*raw\s*-?%\}([\s\S]*?)\{%-?\s*endraw\s*-?%\}|\{\{-?([\s\S]*?)-?\}\}|\{%-?([\s\S]*?)-?%\}/g
    let last = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(src))) {
      let text = src.slice(last, m.index)
      if (m[0].startsWith("{{-") || m[0].startsWith("{%-")) text = text.replace(/\s+$/, "")
      if (pieces.length && pieces[pieces.length - 1].trimNext) text = text.replace(/^\s+/, "")
      if (text) pieces.push({ k: "text", v: text })
      const trimNext = m[0].endsWith("-}}") || m[0].endsWith("-%}")
      if (m[1] !== undefined) pieces.push({ k: "text", v: m[1], trimNext })
      else if (m[2] !== undefined) pieces.push({ k: "out", v: m[2].trim(), trimNext })
      else {
        const body = (m[3] ?? "").trim()
        const name = body.match(/^(\w+)/)?.[1] ?? body.charAt(0)
        if (name === "liquid") {
          for (const line of body.slice(6).split("\n")) {
            const l = line.trim()
            if (!l) continue
            const n = l.match(/^(\w+)/)?.[1] ?? ""
            pieces.push({ k: "tag", name: n, rest: l.slice(n.length).trim() })
          }
          if (trimNext) pieces[pieces.length - 1] = { ...pieces[pieces.length - 1], trimNext }
        } else pieces.push({ k: "tag", name, rest: body.slice(name.length).trim(), trimNext })
      }
      last = m.index + m[0].length
    }
    let tail = src.slice(last)
    if (pieces.length && pieces[pieces.length - 1].trimNext) tail = tail.replace(/^\s+/, "")
    if (tail) pieces.push({ k: "text", v: tail })
    return pieces
  }

  private step() {
    if (++this.steps > STEP_LIMIT) throw new Stop()
  }

  private emit(out: string[], s: string) {
    out.push(s)
    if (out.length % 256 === 0 && out.join("").length > OUTPUT_LIMIT) throw new Stop()
  }

  /** Run pieces[from..to), with block structure found as it goes. */
  private run(pieces: Piece[], scope: Scope, out: string[], from = 0, to = pieces.length): void {
    let i = from
    while (i < to) {
      this.step()
      const p = pieces[i]
      if (p.k === "text") { this.emit(out, p.v); i++; continue }
      if (p.k === "out") { this.emit(out, str(this.chain(p.v, scope))); i++; continue }
      const { name, rest } = p
      switch (name) {
        case "comment":
        case "doc":
        case "schema":
        case "javascript": {
          i = this.match(pieces, i, to, name, `end${name}`) + 1
          continue
        }
        case "style":
        case "stylesheet": {
          const end = this.match(pieces, i, to, name, `end${name}`)
          const inner: string[] = []
          this.run(pieces, scope, inner, i + 1, end)
          this.emit(out, `<style>${inner.join("")}</style>`)
          i = end + 1
          continue
        }
        case "assign": {
          const m = rest.match(/^([\w-]+)\s*=\s*([\s\S]+)$/)
          if (m) scope[m[1]] = this.chain(m[2], scope)
          i++
          continue
        }
        case "capture": {
          const end = this.match(pieces, i, to, "capture", "endcapture")
          const inner: string[] = []
          this.run(pieces, scope, inner, i + 1, end)
          const v = rest.match(/^['"]?([\w-]+)/)?.[1]
          if (v) scope[v] = inner.join("")
          i = end + 1
          continue
        }
        case "echo": {
          this.emit(out, str(this.chain(rest, scope)))
          i++
          continue
        }
        case "increment":
        case "decrement": {
          const v = rest.trim()
          const n = Number(scope[`__counter_${v}`] ?? 0)
          if (name === "increment") { this.emit(out, String(n)); scope[`__counter_${v}`] = n + 1 } else { scope[`__counter_${v}`] = n - 1; this.emit(out, String(n - 1)) }
          i++
          continue
        }
        case "if":
        case "unless": {
          const parts = this.branches(pieces, i, to, name, `end${name}`, ["elsif", "else"])
          let done = false
          for (const b of parts.branches) {
            const cond = b.tag === "else" ? true : this.condition(b.rest, scope)
            const pass = b.tag === name && name === "unless" ? !cond : cond
            if (pass) { this.run(pieces, scope, out, b.from, b.to); done = true; break }
          }
          void done
          i = parts.end + 1
          continue
        }
        case "case": {
          const parts = this.branches(pieces, i, to, "case", "endcase", ["when", "else"])
          const subject = this.chain(rest, scope)
          for (const b of parts.branches.slice(1)) {
            if (b.tag === "else") { this.run(pieces, scope, out, b.from, b.to); break }
            const values = b.rest.split(/\s*(?:,|\bor\b)\s*/).filter(Boolean).map((v) => this.chain(v, scope))
            if (values.some((v) => str(v) === str(subject))) { this.run(pieces, scope, out, b.from, b.to); break }
          }
          i = parts.end + 1
          continue
        }
        case "for": {
          const parts = this.branches(pieces, i, to, "for", "endfor", ["else"])
          const m = rest.match(/^([\w-]+)\s+in\s+([\s\S]+)$/)
          const body = parts.branches[0]
          const elseB = parts.branches.find((b) => b.tag === "else")
          if (m) {
            let src = m[2].trim()
            let limit: number | null = null
            let offset = 0
            let reversed = false
            for (;;) {
              const r = src.match(/^(.*\S)\s+reversed$/)
              if (r) { reversed = true; src = r[1]; continue }
              const kv = src.match(/^(.*\S)\s+(limit|offset)\s*:\s*(\S+)$/)
              if (kv) { const n = Number(str(this.chain(kv[3], scope))); if (kv[2] === "limit") limit = n; else offset = n; src = kv[1]; continue }
              break
            }
            let list = this.listOf(this.chain(src, scope))
            list = list.slice(offset, limit === null ? undefined : offset + limit)
            if (reversed) list = [...list].reverse()
            if (list.length === 0) { if (elseB) this.run(pieces, scope, out, elseB.from, elseB.to) }
            else {
              const outer = scope.forloop
              for (let k = 0; k < list.length; k++) {
                scope[m[1]] = list[k]
                scope.forloop = { index: k + 1, index0: k, first: k === 0, last: k === list.length - 1, length: list.length, rindex: list.length - k, rindex0: list.length - k - 1 }
                try { this.run(pieces, scope, out, body.from, body.to) } catch (e) {
                  if (!(e instanceof Signal)) throw e
                  if (e.kind === "break") break
                }
              }
              scope.forloop = outer
            }
          }
          i = parts.end + 1
          continue
        }
        case "break":
        case "continue":
          throw new Signal(name)
        case "render":
        case "include": {
          this.renderTag(rest, scope, out, name === "include")
          i++
          continue
        }
        default:
          if (!name.startsWith("end") && !["else", "elsif", "when", "layout", "section", "sections", "content_for", "form", "paginate", "cycle", "tablerow", "#"].includes(name)) this.unknownTags.add(name)
          i++
      }
    }
  }

  /** Where the tag at `at` closes, counting nested ones of the same kind. */
  private match(pieces: Piece[], at: number, to: number, open: string, close: string): number {
    let depth = 0
    for (let j = at; j < to; j++) {
      const p = pieces[j]
      if (p.k !== "tag") continue
      if (p.name === open) depth++
      else if (p.name === close && --depth === 0) return j
    }
    return to
  }

  /** The branches of an if / unless / case / for, split at its own middle tags. */
  private branches(pieces: Piece[], at: number, to: number, open: string, close: string, middles: string[]) {
    const head = pieces[at] as Extract<Piece, { k: "tag" }>
    const branches: { tag: string; rest: string; from: number; to: number }[] = [{ tag: open, rest: head.rest, from: at + 1, to }]
    let depth = 0
    const BLOCKS: Record<string, string> = { if: "endif", unless: "endunless", case: "endcase", for: "endfor", capture: "endcapture", comment: "endcomment", style: "endstyle", tablerow: "endtablerow", form: "endform", paginate: "endpaginate", doc: "enddoc", javascript: "endjavascript", stylesheet: "endstylesheet", schema: "endschema" }
    const closers = new Set(Object.values(BLOCKS))
    for (let j = at + 1; j < to; j++) {
      const p = pieces[j]
      if (p.k !== "tag") continue
      if (BLOCKS[p.name]) { depth++; continue }
      if (closers.has(p.name)) {
        if (depth === 0 && p.name === close) {
          branches[branches.length - 1].to = j
          return { branches, end: j }
        }
        depth--
        continue
      }
      if (depth === 0 && middles.includes(p.name)) {
        branches[branches.length - 1].to = j
        branches.push({ tag: p.name, rest: p.rest, from: j + 1, to })
      }
    }
    return { branches, end: to }
  }

  private renderTag(rest: string, scope: Scope, out: string[], include: boolean) {
    const m = rest.match(/^['"]([^'"]+)['"]\s*(?:(with|for)\s+([^,]+?)(?:\s+as\s+([\w-]+))?)?\s*(?:,([\s\S]*))?$/)
    if (!m) return
    const src = this.input.snippet(m[1])
    if (src === null || this.depth > 12) return
    const child: Scope = include ? scope : { settings: this.input.settings }
    for (const kv of (m[5] ?? "").split(/,(?=\s*[\w-]+\s*:)/)) {
      const p = kv.match(/^\s*([\w-]+)\s*:\s*([\s\S]+)$/)
      if (p) child[p[1]] = this.chain(p[2], scope)
    }
    this.depth++
    try {
      if (m[2] === "for") {
        const list = this.listOf(this.chain(m[3], scope))
        for (const item of list) { child[m[4] ?? m[1]] = item; this.emit(out, this.render(src, child)) }
      } else {
        if (m[2] === "with") child[m[4] ?? m[1]] = this.chain(m[3], scope)
        this.emit(out, this.renderInto(src, child))
      }
    } finally {
      this.depth--
    }
  }

  private renderInto(src: string, scope: Scope): string {
    const out: string[] = []
    try { this.run(this.parse(src), scope, out) } catch (e) { if (!(e instanceof Signal)) throw e }
    return out.join("")
  }

  private listOf(v: unknown): unknown[] {
    if (Array.isArray(v)) return v
    if (v && typeof v === "object" && !(v instanceof LiquidColor) && !(v instanceof LiquidFont)) {
      const o = v as Record<string, unknown>
      if (Array.isArray(o.__list)) return o.__list as unknown[]
      return Object.values(o)
    }
    if (typeof v === "string" && v) return [v]
    return []
  }

  /* ── conditions and chains ─────────────────────────────────────────── */

  private condition(src: string, scope: Scope): boolean {
    /* Liquid reads and/or right to left, without precedence. */
    const parts = src.split(/\s+(and|or)\s+/)
    let value = this.comparison(parts[parts.length - 1], scope)
    for (let k = parts.length - 2; k > 0; k -= 2) {
      const left = this.comparison(parts[k - 1], scope)
      value = parts[k] === "and" ? left && value : left || value
    }
    return value
  }

  private comparison(src: string, scope: Scope): boolean {
    const m = src.match(/^([\s\S]+?)\s*(==|!=|<>|<=|>=|<|>|\bcontains\b)\s*([\s\S]+)$/)
    if (!m) return truthy(this.chain(src, scope)) && !(typeof this.chain(src, scope) === "string" && false)
    const l = this.chain(m[1], scope)
    const r = this.chain(m[3], scope)
    const blankR = /^(blank|empty)$/.test(m[3].trim())
    switch (m[2]) {
      case "==": return blankR ? isBlank(l) : eq(l, r)
      case "!=":
      case "<>": return blankR ? !isBlank(l) : !eq(l, r)
      case "<": return Number(str(l)) < Number(str(r))
      case "<=": return Number(str(l)) <= Number(str(r))
      case ">": return Number(str(l)) > Number(str(r))
      case ">=": return Number(str(l)) >= Number(str(r))
      case "contains": return Array.isArray(l) ? l.some((x) => str(x) === str(r)) : str(l).includes(str(r))
    }
    return false
  }

  /** `value | filter: a, b | filter`, worked out. */
  chain(src: string, scope: Scope): unknown {
    const toks = lex(src)
    const r = new Reader(toks)
    let v = this.value(r, scope)
    while (r.is("p", "|")) {
      r.pos++
      const name = r.peek()?.v ?? ""
      r.pos++
      const args: unknown[] = []
      const named: Record<string, unknown> = {}
      if (r.is("p", ":")) {
        r.pos++
        for (;;) {
          if (r.peek()?.t === "id" && r.peek(1)?.t === "p" && r.peek(1)?.v === ":") {
            const key = r.peek()!.v
            r.pos += 2
            named[key] = this.value(r, scope)
          } else args.push(this.value(r, scope))
          if (r.is("p", ",")) { r.pos++; continue }
          break
        }
      }
      v = this.filter(name, v, args, named)
    }
    return v
  }

  private value(r: Reader, scope: Scope): unknown {
    const t = r.peek()
    if (!t) return undefined
    r.pos++
    if (t.t === "str") return t.v
    if (t.t === "num") return Number(t.v)
    if (t.t === "p" && t.v === "(") {
      const a = this.value(r, scope)
      if (r.is("p", "..")) r.pos++
      const b = this.value(r, scope)
      if (r.is("p", ")")) r.pos++
      const from = Math.trunc(Number(str(a))), to = Math.trunc(Number(str(b)))
      if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return []
      return Array.from({ length: Math.min(1000, to - from + 1) }, (_, k) => from + k)
    }
    if (t.t !== "id") return undefined
    if (t.v === "true") return true
    if (t.v === "false") return false
    if (t.v === "nil" || t.v === "null") return null
    if (t.v === "blank" || t.v === "empty") return ""
    let cur: unknown = scope[t.v]
    for (;;) {
      if (r.is("p", ".")) {
        r.pos++
        const n = r.peek()
        r.pos++
        cur = n ? prop(cur, n.v) : undefined
      } else if (r.is("p", "[")) {
        r.pos++
        const k = this.value(r, scope)
        if (r.is("p", "]")) r.pos++
        cur = prop(cur, str(k))
      } else break
    }
    return cur
  }

  private filter(name: string, v: unknown, args: unknown[], named: Record<string, unknown>): unknown {
    switch (name) {
      /* Fonts: Storelib loads each family itself (Theme settings › Typography), so a face prints nothing. */
      case "font_face":
      case "font_url":
      case "preload_tag":
        return ""
      case "font_modify": {
        const f = parseFont(v) ?? (v instanceof LiquidFont ? v : null)
        if (!f) return v
        const [what, how] = args.map(str)
        if (what === "weight") {
          const w = how === "bold" ? 700 : how === "bolder" ? Math.min(900, f.weight + 300) : how === "lighter" ? Math.max(100, f.weight - 300) : how === "normal" ? 400 : Number(how) || f.weight
          return new LiquidFont(f.family, w, f.style, f.system, f.fallback_families)
        }
        if (what === "style") return new LiquidFont(f.family, f.weight, how === "italic" || how === "oblique" ? "italic" : "normal", f.system, f.fallback_families)
        return f
      }
      case "asset_url": {
        const name = str(v)
        /* A stylesheet is written in by stylesheet_tag; a picture is the package's own copy of it. */
        return /\.css$/i.test(name) ? { __asset: name } : (this.input.asset?.(name) ?? "")
      }
      case "stylesheet_tag": {
        const a = v as { __asset?: string }
        const css = a && typeof a === "object" && a.__asset ? this.input.stylesheet(a.__asset) : null
        return css === null ? "" : `<style>${css}</style>`
      }
      case "image_url":
      case "img_url":
      case "inline_asset_content":
      case "placeholder_svg_tag":
      case "image_tag":
      case "script_tag":
      case "t":
        return ""
      case "default":
        return isBlank(v) || v === false ? (args[0] ?? named.default ?? "") : v
      case "color_brightness":
      case "color_modify":
      case "color_lighten":
      case "color_darken":
      case "color_to_rgb":
      case "color_to_hex":
      case "color_to_hsl":
      case "color_extract":
      case "color_mix":
      case "color_contrast":
      case "brightness_difference":
      case "color_difference": {
        if (name === "color_mix") return mix(v, args[0], Number(str(args[1] ?? 50)))
        if (name === "color_contrast") return contrast(v, args[0])
        if (name === "brightness_difference" || name === "color_difference") return Math.abs(brightness(v) - brightness(args[0]))
        const f = liquidFilter(name)
        const out = f ? f(str(v), args.map((a) => (a instanceof LiquidColor ? a.toString() : a))) : v
        return typeof out === "string" ? parseColor(out) ?? out : out
      }
      case "size":
        return Array.isArray(v) ? v.length : typeof v === "string" ? v.length : v && typeof v === "object" ? Object.keys(v as object).length : 0
      case "first":
        return Array.isArray(v) ? v[0] : typeof v === "string" ? v.charAt(0) : undefined
      case "last":
        return Array.isArray(v) ? v[v.length - 1] : typeof v === "string" ? v.slice(-1) : undefined
      case "join":
        return Array.isArray(v) ? v.map(str).join(str(args[0] ?? " ")) : str(v)
      default: {
        const f = liquidFilter(name)
        if (!f) {
          this.unknownFilters.add(name)
          return v
        }
        const plain = (x: unknown) => (x instanceof LiquidColor || x instanceof LiquidFont ? x.toString() : x)
        return f(Array.isArray(v) ? v : plain(v), args.map(plain))
      }
    }
  }
}

class Stop {}

type Piece = { k: "text"; v: string; trimNext?: boolean } | { k: "out"; v: string; trimNext?: boolean } | { k: "tag"; name: string; rest: string; trimNext?: boolean }

function eq(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || a === undefined || b === null || b === undefined) return (a ?? null) === (b ?? null)
  return str(a) === str(b)
}

function brightness(v: unknown): number {
  const c = parseColor(v instanceof LiquidColor ? v : str(v))
  return c ? Math.round((c.red * 299 + c.green * 587 + c.blue * 114) / 1000) : 0
}

function mix(a: unknown, b: unknown, weight: number): LiquidColor | unknown {
  const x = parseColor(a instanceof LiquidColor ? a : str(a))
  const y = parseColor(b instanceof LiquidColor ? b : str(b))
  if (!x || !y) return a
  const w = Math.max(0, Math.min(100, weight)) / 100
  const ch = (p: number, q: number) => Math.round(p * w + q * (1 - w))
  const c = { r: ch(x.red, y.red), g: ch(x.green, y.green), b: ch(x.blue, y.blue), a: x.alpha * w + y.alpha * (1 - w) }
  return new LiquidColor("", c)
}

function contrast(a: unknown, b: unknown): number {
  const lum = (v: unknown) => {
    const c = parseColor(v instanceof LiquidColor ? v : str(v))
    if (!c) return 0
    const f = (n: number) => { const s = n / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
    return 0.2126 * f(c.red) + 0.7152 * f(c.green) + 0.0722 * f(c.blue)
  }
  const l1 = lum(a), l2 = lum(b)
  return Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 10) / 10
}

/**
 * settings_data.json's current settings as Liquid reads them: colours as
 * colour objects, fonts as font objects (by the setting's type in
 * settings_schema.json), and the colour schemes as a list of
 * `{ id, settings }`, each colour an object.
 */
export function liquidSettings(current: Record<string, unknown>, schemaTypes: Map<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const toValue = (key: string, v: unknown): unknown => {
    const type = schemaTypes.get(key)
    if (type === "font_picker") return parseFont(v) ?? v
    if (type === "color" || type === "color_background") return parseColor(v) ?? v
    if (typeof v === "string" && /^#[0-9a-f]{3,8}$/i.test(v)) return parseColor(v) ?? v
    return v
  }
  for (const [k, v] of Object.entries(current)) {
    if (BLOCKED.has(k)) continue
    if (k === "color_schemes" && v && typeof v === "object") {
      const list = Object.entries(v as Record<string, { settings?: Record<string, unknown> }>).map(([id, scheme]) => {
        const settings: Record<string, unknown> = {}
        for (const [sk, sv] of Object.entries(scheme?.settings ?? {})) settings[sk] = parseColor(sv) ?? sv
        return { id, settings }
      })
      const map: Record<string, unknown> = Object.fromEntries(list.map((s) => [s.id, s]))
      Object.defineProperty(map, "__list", { value: list, enumerable: false })
      out[k] = map
      continue
    }
    /* A palette (Horizon's color_palette): its named colours, each a colour object. */
    if (v && typeof v === "object" && !Array.isArray(v) && (schemaTypes.get(k) === "color_palette" || Object.values(v as object).every((x) => typeof x === "string" && /^#[0-9a-f]{3,8}$/i.test(x)))) {
      out[k] = Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([pk]) => !BLOCKED.has(pk)).map(([pk, pv]) => [pk, parseColor(pv) ?? pv]))
      continue
    }
    out[k] = Array.isArray(v) ? v.map((x) => toValue(k, x)) : toValue(k, v)
  }
  return out
}

/**
 * A setting whose saved value refers to another (`{{ settings.color_palette.color2 }}`,
 * how Horizon ties a colour to the palette), worked out to what it refers
 * to, as a colour when it is one. A few passes, for a reference to a reference.
 */
export function resolveSettingReferences(settings: Record<string, unknown>, snippet: (name: string) => string | null): void {
  const engine = new StaticLiquid({ settings, snippet, stylesheet: () => null })
  for (let pass = 0; pass < 3; pass++) {
    let changed = false
    for (const [k, v] of Object.entries(settings)) {
      if (typeof v !== "string" || !v.includes("{{")) continue
      const out = engine.render(v).trim()
      settings[k] = parseColor(out) ?? out
      changed = true
    }
    if (!changed) break
  }
}
