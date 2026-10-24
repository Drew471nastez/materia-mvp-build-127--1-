/**
 * ===========================================================================
 *  A VALUE UNDER A FINGER, DRAWN WITHOUT DRAWING THE SECTION AGAIN
 * ===========================================================================
 * The owner, round 35: "I adjust the header height and it's very laggy and
 * bad". On an imported theme every value a slider passed drew the section
 * again through the theme's Liquid in the builder (a header with its menus
 * and its country list: 25ms at full speed, 100ms on a slowed phone, most of
 * it the store's countries and currencies read again), and the page in the
 * frame parsed and compared the whole header (scripts/check-compat-live-edit.ts).
 *
 * Two things here make a value cost almost nothing while the finger moves.
 *
 * A TEMPLATE OF THE SECTION FOR THAT ONE SETTING. A slider's number reaches
 * the markup through a few prints: `{{ section.settings.header_height }}px`,
 * or `| times: 0.75 | round: 0` for the phone. The section is drawn with two
 * values nobody would choose (40000 and 80000) and the two drawings are
 * compared: if they differ only in numbers, every number that moved is a
 * straight line of the value (with the theme's rounding, read from two more
 * drawings at odd values when the line is not whole), and the section for
 * any value is that markup with those numbers worked out. A colour is the
 * same with two colours, printed as they are. It is used only when it gives,
 * for the value the section was drawn with, exactly the markup the theme
 * drew; a theme that branches on the value, or passes it through a filter
 * that is not a line, gets no template and is drawn by Liquid as before.
 * Whatever the template drew, the release draws the section through Liquid
 * once more, and that is what is kept and published.
 *
 * WHAT CHANGED, AND ONLY THAT. A drawing goes to the frame as the cut that
 * turns the last one into it (cutBetween), and when the change lies inside
 * one <style> or one tag, as that change too (editBetween), which the frame
 * writes without reading the rest of the section (canvas-bridge.ts).
 */

/** One leaf of a section: a path from the section to a value in its settings or its blocks'. */
export type LeafPath = (string | number)[]

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object"

/** The one value that differs between two versions of a section, or null when none or more than one does. */
export function oneChange(a: unknown, b: unknown): { path: LeafPath; from: unknown; to: unknown } | null {
  const out: { path: LeafPath; from: unknown; to: unknown }[] = []
  const walk = (x: unknown, y: unknown, at: LeafPath): boolean => {
    if (x === y) return true
    if (Array.isArray(x) && Array.isArray(y)) {
      if (x.length !== y.length) return false
      for (let i = 0; i < x.length; i++) if (!walk(x[i], y[i], [...at, i])) return false
      return true
    }
    if (isObject(x) && isObject(y) && !Array.isArray(x) && !Array.isArray(y)) {
      const keys = new Set([...Object.keys(x), ...Object.keys(y)])
      for (const k of keys) if (!walk(x[k], y[k], [...at, k])) return false
      return true
    }
    out.push({ path: at, from: x, to: y })
    return out.length <= 1
  }
  if (!walk(a, b, [])) return null
  return out.length === 1 ? out[0] : null
}

/** `value` put at `path` in `of`; the objects along the path are copied, nothing else is. */
export function withLeaf<T>(of: T, path: LeafPath, value: unknown): T {
  if (!path.length) return value as T
  const [head, ...rest] = path
  if (Array.isArray(of)) {
    const copy = [...of]
    copy[head as number] = withLeaf(copy[head as number], rest, value)
    return copy as T
  }
  const obj = (isObject(of) ? of : {}) as Record<string, unknown>
  return { ...obj, [head]: withLeaf(obj[head as string], rest, value) } as T
}

/* ── Templates ───────────────────────────────────────────────────────── */

type Line = { a: number; b: number; round: (x: number) => number }
export type LiveTemplate =
  | { kind: "number"; text: string[]; lines: Line[] }
  | { kind: "colour"; text: string[] }

const NUMBER = /(\d+(?:\.\d+)?)/
/** Values nobody would set: the first two far apart and even, so a line through them is read exactly; the last two odd, for the rounding. */
export const NUMBER_PROBES = [40000, 80000, 40001, 40003] as const
export const COLOUR_PROBES = ["#0b1a29", "#c3d2e1"] as const
const COLOUR = /^#[0-9a-f]{6}$/i

const ROUNDINGS: ((x: number) => number)[] = [(x) => x, Math.round, Math.floor, Math.ceil]

/** A drawing split into its text and its numbers: [text, number, text, ..., text]. */
const split = (html: string) => html.split(NUMBER)

/**
 * The section as a function of one setting's value, read from drawings of it
 * at probe values, or null. Each value to draw is yielded and its drawing
 * sent back, so a caller can draw one per task (the canvas does: no one task
 * holds the thread for all of them). `base` is the value the section was
 * drawn with and what the theme drew for it.
 */
export function* learning(base: { value: unknown; html: string }): Generator<unknown, LiveTemplate | null, string> {
  if (typeof base.value === "number" && Number.isInteger(base.value)) {
    const [p1, p2, p3, p4] = NUMBER_PROBES
    const h1 = split(yield p1)
    const h2 = split(yield p2)
    if (h1.length !== h2.length || h1.length < 3) return null
    const text: string[] = []
    const lines: { a: number; b: number; at: number }[] = []
    let run = ""
    let whole = true
    for (let i = 0; i < h1.length; i++) {
      if (i % 2 === 0) {
        if (h1[i] !== h2[i]) return null
        run += h1[i]
        continue
      }
      if (h1[i] === h2[i]) { run += h1[i]; continue }
      /* A number printed with decimals is a float the theme worked out: how Liquid prints those is not copied here. */
      if (h1[i].includes(".") || h2[i].includes(".")) return null
      const n1 = Number(h1[i]), n2 = Number(h2[i])
      const a = (n2 - n1) / (p2 - p1)
      const b = n1 - a * p1
      if (!Number.isInteger(a) || !Number.isInteger(b)) whole = false
      text.push(run)
      run = ""
      lines.push({ a, b, at: i })
    }
    text.push(run)
    if (!lines.length) return null
    let roundings = lines.map(() => ROUNDINGS[0])
    if (!whole) {
      const h3 = split(yield p3)
      const h4 = split(yield p4)
      if (h3.length !== h1.length || h4.length !== h1.length) return null
      roundings = []
      for (const line of lines) {
        const n3 = Number(h3[line.at]), n4 = Number(h4[line.at])
        const fit = ROUNDINGS.find((r) => r(line.a * p3 + line.b) === n3 && r(line.a * p4 + line.b) === n4)
        if (!fit) return null
        roundings.push(fit)
      }
    }
    const t: LiveTemplate = { kind: "number", text, lines: lines.map((line, i) => ({ a: line.a, b: line.b, round: roundings[i] })) }
    return fillTemplate(t, base.value) === base.html ? t : null
  }
  if (typeof base.value === "string" && COLOUR.test(base.value)) {
    const [c1, c2] = COLOUR_PROBES
    const h1 = (yield c1).split(c1)
    const h2 = (yield c2).split(c2)
    if (h1.length < 2 || h1.length !== h2.length || h1.some((x, i) => x !== h2[i])) return null
    const t: LiveTemplate = { kind: "colour", text: h1 }
    return fillTemplate(t, base.value) === base.html ? t : null
  }
  return null
}

/** `learning`, drawn all at once: for a test. */
export function learnTemplate(draw: (value: unknown) => string, base: { value: unknown; html: string }): LiveTemplate | null {
  const g = learning(base)
  let step = g.next()
  while (!step.done) step = g.next(draw(step.value))
  return step.value
}

/** The section's markup for a value, from its template; null for a value it cannot print (Liquid draws that one). */
export function fillTemplate(t: LiveTemplate, value: unknown): string | null {
  if (t.kind === "colour") return typeof value === "string" && COLOUR.test(value) ? t.text.join(value) : null
  /* A whole number, as the probes were: one with decimals is printed by Liquid, which may round it. */
  if (typeof value !== "number" || !Number.isInteger(value)) return null
  let out = t.text[0]
  for (let i = 0; i < t.lines.length; i++) {
    const line = t.lines[i]
    const n = line.round(line.a * value + line.b)
    if (!Number.isInteger(n)) return null
    out += String(n) + t.text[i + 1]
  }
  return out
}

/**
 * The cut from a template's drawing for one value to its drawing for
 * another, read from where its numbers are rather than from the markup
 * (cutBetween reads all of it: a header is 400KB). Null when the two are the
 * same, or the template cannot print one of them.
 */
export function templateCut(t: LiveTemplate, from: unknown, to: unknown): SectionCut | null {
  if (t.kind !== "number" || typeof from !== "number" || typeof to !== "number" || !Number.isInteger(from) || !Number.isInteger(to)) return null
  const print = (line: Line, v: number) => String(line.round(line.a * v + line.b))
  const a = t.lines.map((line) => print(line, from))
  const b = t.lines.map((line) => print(line, to))
  let first = -1, last = -1
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) { if (first < 0) first = i; last = i }
  if (first < 0) return null
  let at = t.text[0].length
  for (let i = 0; i < first; i++) at += a[i].length + t.text[i + 1].length
  let cut = 0, put = ""
  for (let i = first; i <= last; i++) {
    cut += a[i].length
    put += b[i]
    if (i < last) { cut += t.text[i + 1].length; put += t.text[i + 1] }
  }
  let len = t.text[0].length
  for (let i = 0; i < a.length; i++) len += a[i].length + t.text[i + 1].length
  return { at, cut, put, len }
}

/* ── A theme setting, in the places of the page it is printed ──────────── */

/**
 * ===========================================================================
 *  A THEME VALUE, WRITTEN WHERE THE PAGE PRINTS IT
 * ===========================================================================
 * A theme setting reaches the whole page: Dawn prints its section spacing as
 * a variable in the layout's <style>, a custom theme its logo width in the
 * header's. Each value a slider passed drew the whole page through Liquid in
 * the builder (95ms at full speed on Dawn), parsed it (another 95ms) and
 * compared it with the page on screen: two values a second
 * (scripts/check-compat-live-edit.ts, "theme spacing").
 *
 * With the page's template for that setting (learning, above, drawn over
 * the whole page), each place a value is printed is known, and with it what
 * holds it: a <style>'s text or a tag. `placesOf` reads those once; for each
 * value, `placeEdits` gives the texts of the places whose print changed,
 * which the frame writes where they are (canvas-bridge.ts, "edits"). A value
 * printed in the words of the page has no place that can be written alone,
 * and the setting is drawn by Liquid as before.
 */
export type Place = { kind: "style" | "tag"; start: [number, number]; end: [number, number]; first: number; last: number }

/** One printed value of a template, for a value. */
function printAt(t: LiveTemplate, i: number, v: unknown): string | null {
  if (t.kind === "colour") return typeof v === "string" && COLOUR.test(v) ? v : null
  if (typeof v !== "number" || !Number.isInteger(v)) return null
  const n = t.lines[i].round(t.lines[i].a * v + t.lines[i].b)
  return Number.isInteger(n) ? String(n) : null
}
const slotCount = (t: LiveTemplate) => t.text.length - 1

export function placesOf(t: LiveTemplate, value: unknown): Place[] | null {
  const prints: string[] = []
  for (let i = 0; i < slotCount(t); i++) {
    const p = printAt(t, i, value)
    if (p === null) return null
    prints.push(p)
  }
  /* Where each text and each print starts in the drawing. */
  const textAt: number[] = []
  const slotAt: number[] = []
  let x = 0
  for (let i = 0; i < t.text.length; i++) {
    textAt.push(x)
    x += t.text[i].length
    if (i < prints.length) { slotAt.push(x); x += prints[i].length }
  }
  const html = t.text.map((s, i) => s + (prints[i] ?? "")).join("")
  /* A position as (text, offset into it), or null inside a print. */
  const inText = (pos: number): [number, number] | null => {
    for (let i = t.text.length - 1; i >= 0; i--) {
      if (pos >= textAt[i]) return pos <= textAt[i] + t.text[i].length ? [i, pos - textAt[i]] : null
    }
    return null
  }
  const places: Place[] = []
  for (let i = 0; i < prints.length; i++) {
    const at = slotAt[i]
    const open = html.lastIndexOf("<", at - 1)
    const close = open < 0 ? -1 : html.indexOf(">", open)
    if (open < 0 || close < 0) return null
    let from: number, to: number, kind: Place["kind"]
    if (close >= at + prints[i].length) {
      if (!/^<[a-z]/i.test(html.slice(open, open + 2))) return null
      kind = "tag"; from = open; to = close + 1
    } else if (/^<style[\s>]/i.test(html.slice(open, open + 7))) {
      const end = html.indexOf("</", close)
      if (end < at + prints[i].length || !/^<\/style/i.test(html.slice(end, end + 7))) return null
      kind = "style"; from = close + 1; to = end
    } else return null
    const start = inText(from), end = inText(to)
    if (!start || !end) return null
    const last = places[places.length - 1]
    if (last && last.kind === kind && last.start[0] === start[0] && last.start[1] === start[1]) { last.last = i; continue }
    places.push({ kind, start, end, first: i, last: i })
  }
  return places
}

/** The text of a place for a value. */
function placeText(t: LiveTemplate, p: Place, v: unknown): string | null {
  const [sj, so] = p.start, [ej, eo] = p.end
  if (sj === ej) return t.text[sj].slice(so, eo)
  let out = t.text[sj].slice(so)
  for (let i = sj; i < ej; i++) {
    const n = printAt(t, i, v)
    if (n === null) return null
    out += n + (i + 1 === ej ? t.text[ej].slice(0, eo) : t.text[i + 1])
  }
  return out
}

/** For a value moving from `from` to `to`: each place whose print changed, as it was and as it is. */
export function placeEdits(t: LiveTemplate, places: Place[], from: unknown, to: unknown): SectionEdit[] | null {
  const out: SectionEdit[] = []
  for (const p of places) {
    let moved = false
    for (let i = p.first; i <= p.last && !moved; i++) moved = printAt(t, i, from) !== printAt(t, i, to)
    if (!moved) continue
    const a = placeText(t, p, from), b = placeText(t, p, to)
    if (a === null || b === null) return null
    out.push(p.kind === "style" ? { style: true, from: a, to: b } : { tag: true, from: a, to: b })
  }
  return out
}

/* ── What changed between two drawings ─────────────────────────────────── */

/**
 * Where two drawings differ, as one cut: `cut` characters at `at` in the
 * first replaced by `put` give the second. `len` is the first's length, a
 * check that the frame holds the drawing the cut was read against.
 *
 * SENT INSTEAD OF THE MARKUP. A header carrying the store's country list is
 * 400KB of markup, and a message holding it twice (what it is now, and what
 * it was) cost the frame 30ms to read at full speed and 120ms with the CPU
 * slowed 4x, for every value of a slider, before the frame did anything
 * with it (scripts/check-compat-live-edit.ts, round 35). A cut is a few
 * bytes, and the frame makes the markup from the one it holds.
 */
export type SectionCut = { at: number; cut: number; put: string; len: number }

export function cutBetween(before: string, after: string): SectionCut | null {
  if (before === after) return null
  const n = Math.min(before.length, after.length)
  /* A chunk at a time while they agree (a native comparison), then a character at a time: a header is 400KB. */
  const CHUNK = 512
  let p = 0
  while (p + CHUNK <= n && before.slice(p, p + CHUNK) === after.slice(p, p + CHUNK)) p += CHUNK
  while (p < n && before.charCodeAt(p) === after.charCodeAt(p)) p++
  let s = 0
  const room = n - p
  while (s + CHUNK <= room && before.slice(before.length - s - CHUNK, before.length - s) === after.slice(after.length - s - CHUNK, after.length - s)) s += CHUNK
  while (s < room && before.charCodeAt(before.length - 1 - s) === after.charCodeAt(after.length - 1 - s)) s++
  return { at: p, cut: before.length - s - p, put: after.slice(p, after.length - s), len: before.length }
}

/** `before` with a cut made in it. */
export function applyCut(before: string, c: SectionCut): string | null {
  if (before.length !== c.len) return null
  return before.slice(0, c.at) + c.put + before.slice(c.at + c.cut)
}

export type SectionEdit =
  /** One <style>'s text, as it was and as it is. */
  | { style: true; from: string; to: string }
  /** One tag, its attributes as they were and as they are. */
  | { tag: true; from: string; to: string }

/**
 * The one change between two drawings of a section, when it lies inside one
 * <style>'s text or inside one tag, or null: what the frame can write
 * without reading the rest of the section.
 */
export function editBetween(before: string, after: string, c: SectionCut | null = cutBetween(before, after)): SectionEdit | null {
  if (!c) return null
  const p = c.at
  const endBefore = c.at + c.cut
  if (/[<>]/.test(before.slice(p, endBefore)) || /[<>]/.test(c.put)) return null
  const open = before.lastIndexOf("<", p - 1)
  if (open < 0) return null
  const close = before.indexOf(">", open)
  if (close < 0) return null
  const shift = after.length - before.length
  /* Inside the tag itself: that tag's attributes. */
  if (close >= endBefore) {
    if (!/^<[a-z]/i.test(before.slice(open, open + 2))) return null
    return { tag: true, from: before.slice(open, close + 1), to: after.slice(open, close + 1 + shift) }
  }
  /* Inside a <style>'s text: that text, whole. */
  if (/^<style[\s>]/i.test(before.slice(open, open + 7))) {
    const end = before.indexOf("</", close)
    if (end < endBefore || !/^<\/style/i.test(before.slice(end, end + 7))) return null
    return { style: true, from: before.slice(close + 1, end), to: after.slice(close + 1, end + shift) }
  }
  return null
}
