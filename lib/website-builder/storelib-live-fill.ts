/**
 * ===========================================================================
 *  A SECTION'S SLIDER, DRAWN WITHOUT DRAWING THE SECTION AGAIN
 * ===========================================================================
 * The owner, round 1022: "sliders lag while dragging ... the thumb must
 * follow the pointer at full frame rate, and the canvas should update live
 * during the drag". On a computer they did; on a phone's CPU a section's
 * slider cost a dropped frame a value (scripts/check-editor-live.mjs,
 * section range at 4x: frames p95 33ms, the longest 117ms). Each value drew
 * the section through its .storelib template again, in the frame the value
 * arrived in, for a number that lands in one style attribute.
 *
 * The idea an imported theme's canvas uses (lib/storelib-theme/compat/
 * live-draw.ts, round 35), from the drawings the drag makes anyway, so it
 * costs no drawing of its own. Two values of one setting drawn by the engine
 * are compared: when they differ only where each prints its own value, as
 * written (`{{ settings.padding_top }}px`, a colour), the section for any
 * value is that markup with the value put in those places. The third value
 * is drawn by the engine too and checked against it; from the fourth on a
 * value is a string written, not a template run. A section that prints the
 * value any other way (worked out, behind a condition), or whose stylesheet
 * moves with it, is drawn by the engine as before. The release draws the
 * section through the engine once more, and that is what is kept and
 * published.
 */
import { oneChange } from "@/lib/storelib-theme/compat/live-draw"
import type { SectionInstance, ThemeSettingsValues } from "./types"

type Drawn = { ok: true; html: string; css: string } | { ok: false }
type Ok = Extract<Drawn, { ok: true }>
type Render = (section: SectionInstance, theme: ThemeSettingsValues) => Drawn
/** The section's markup cut where the value is printed: pieces joined by the value. */
type Template = { pieces: string[]; css: string }
type Learned = { from: SectionInstance; theme: ThemeSettingsValues; render: Render; path: string; out: Ok; t: Template | null; checked: boolean }

/** Each section's last drawing by the engine, what it was drawn from. */
const engine = new Map<string, { section: SectionInstance; theme: ThemeSettingsValues; render: Render; out: Drawn }>()
/** Each section's template for the one setting a finger last moved (t null: it cannot have one). */
const learned = new Map<string, Learned>()

const pathKey = (p: (string | number)[]) => JSON.stringify(p)
const COLOUR = /^#[0-9a-f]{3,8}$/i

/** How a value is printed, when it is one a template can hold: a number as written, or a colour. */
function printed(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) return String(v)
  if (typeof v === "string" && COLOUR.test(v)) return v
  return null
}

/**
 * The markup as a function of one value, from two drawings of it, or null:
 * the two cut at every place each prints its own value must be the same
 * pieces in between. Exported for a test.
 */
export function templateFrom(a: { value: unknown; html: string }, b: { value: unknown; html: string }): string[] | null {
  const pa = printed(a.value), pb = printed(b.value)
  if (pa === null || pb === null || pa === pb) return null
  /* Not a number's digits inside a longer one ("8" in "180"): a printed value stands alone. */
  const cut = (html: string, v: string) => html.split(new RegExp(`(?<![\\w.#-])${v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\d]|\\.\\d)`))
  const x = cut(a.html, pa)
  const y = cut(b.html, pb)
  if (x.length < 2 || x.length !== y.length || x.some((piece, i) => piece !== y[i])) return null
  return x
}

/**
 * The section drawn: from its template while `live` and one is learned and
 * checked for the setting that moved, otherwise by `render`.
 */
export function drawLive<R extends Drawn>(section: SectionInstance, theme: ThemeSettingsValues, render: (section: SectionInstance, theme: ThemeSettingsValues) => R, live: boolean): R {
  const l = live ? learned.get(section.id) : undefined
  const c = l && l.t && l.theme === theme && l.render === render ? oneChange(l.from, section) : null
  const value = c && pathKey(c.path) === l!.path ? printed(c.to) : null
  if (l && l.t && l.checked && value !== null) return { ...l.out, html: l.t.pieces.join(value) } as R
  /* Back on the value it was learned from: that drawing. */
  if (l && l.t && l.checked && c === null && l.theme === theme && l.render === render && JSON.stringify(l.from) === JSON.stringify(section)) return l.out as R
  const before = engine.get(section.id)
  const out = render(section, theme)
  engine.set(section.id, { section, theme, render, out })
  if (!live || !out.ok) return out
  /* The third value: the template checked against the engine's drawing, once. */
  if (l && l.t && !l.checked && value !== null) {
    if (l.t.pieces.join(value) === out.html && out.css === l.t.css) l.checked = true
    else l.t = null
    return out
  }
  /* The second: a template made from this drawing and the one before it. */
  if (before && before.theme === theme && before.render === render && before.out.ok) {
    const change = oneChange(before.section, section)
    const key = change ? pathKey(change.path) : ""
    if (change && !(l && l.from === before.section && l.path === key)) {
      const pieces = before.out.css === out.css ? templateFrom({ value: change.from, html: before.out.html }, { value: change.to, html: out.html }) : null
      learned.set(section.id, { from: before.section, theme, render, path: key, out: before.out, t: pieces ? { pieces, css: out.css } : null, checked: false })
    }
  }
  return out
}

/** Everything learned forgotten: for a test. */
export function forgetLiveFill(): void {
  engine.clear()
  learned.clear()
}
