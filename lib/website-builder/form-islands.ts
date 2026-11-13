/**
 * ===========================================================================
 *  A PUBLISHED FORM INSIDE A .storelib SECTION
 * ===========================================================================
 * A section's markup is one string, so it cannot hold the live form (its
 * questions, its booking times, its consent, its answers sent to Leads). A
 * section that shows one leaves a mark where it goes:
 *
 *   <div data-storelib-native-form="{{ settings.form.id }}"
 *        data-presentation="inline" data-title="Book a call"></div>
 *
 * and the page draws Storelib's own form there
 * (components/website-builder/sections/form-islands.tsx, the same
 * NativeFormBlock a native form section draws), which loads the published
 * definition from /api/forms/<id>/public and sends answers to
 * /api/forms/<id>/submit, where ownership, rate limits, spam checks and the
 * answers are all decided on the server from the form row. The section's own
 * script never sees an answer.
 *
 * `settings.form.id` is only ever one of the creator's published forms
 * (lib/storelib-theme/resolve.ts formRef); a mark holding anything that is
 * not a form id draws nothing. Pure, so the rule has a test.
 */
export const NATIVE_FORM_ATTR = "data-storelib-native-form"

export type IslandPresentation = "inline" | "card" | "expandable" | "modal"

export interface FormIslandSpec {
  formId: string
  presentation: IslandPresentation
  /** The button's words for expandable and modal. */
  title: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PRESENTATIONS: readonly IslandPresentation[] = ["inline", "card", "expandable", "modal"]

/** One mark, read off its attributes; null when it names no form. */
export function formIslandOf(attr: (name: string) => string | null): FormIslandSpec | null {
  const formId = (attr(NATIVE_FORM_ATTR) ?? "").trim().toLowerCase()
  if (!UUID_RE.test(formId)) return null
  const p = (attr("data-presentation") ?? "").trim().toLowerCase() as IslandPresentation
  const title = (attr("data-title") ?? "").replace(/\s+/g, " ").trim().slice(0, 80)
  return { formId, presentation: PRESENTATIONS.includes(p) ? p : "inline", title: title || "Open form" }
}

/**
 * THE FORM TAKES THE COLOURS OF THE SECTION IT IS IN. Storelib's form is drawn
 * in its own ink (#1a1a2e) on white unless told otherwise, and a section told
 * it nothing: on a dark band the month, the dates and the questions were dark
 * navy on near black. An inline form has no surface of its own, so its ink is
 * the text colour where it stands and everything else is mixed from that ink
 * and the ground behind it. A card, an expandable and the pop-up bring their
 * own white surface and keep their own ink.
 *
 * `ink` and `ground` are computed colours (`rgb(...)`); `ground` is null when
 * nothing behind the form paints a flat colour (a picture, a gradient), and
 * the colour that reads on the ink is used for what sits on it.
 */
export function formSurfaceVars(ink: string, ground: string | null): Record<string, string> {
  const onInk = ground ?? (luminance(ink) > 0.45 ? "#111111" : "#ffffff")
  return {
    "--sheet-ink": ink,
    "--sheet-on-ink": onInk,
    "--sheet-body": `color-mix(in srgb, ${ink} 82%, transparent)`,
    "--sheet-muted": `color-mix(in srgb, ${ink} 62%, transparent)`,
    "--form-line": `color-mix(in srgb, ${ink} 24%, transparent)`,
    "--form-field": `color-mix(in srgb, ${ink} 5%, transparent)`,
    "--sheet-error": luminance(ink) > 0.45 ? "#ff9d94" : "#b42318",
  }
}

/** The channels of a computed `rgb()` / `rgba()` colour, alpha included; null for anything else. */
export function rgbOf(color: string): { r: number; g: number; b: number; a: number } | null {
  const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(color.trim())
  if (!m) return null
  const a = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4])
  return { r: +m[1], g: +m[2], b: +m[3], a }
}

/** Relative luminance, 0 (black) to 1 (white); 0 for a colour that is not rgb, which reads as dark ink. */
export function luminance(color: string): number {
  const c = rgbOf(color)
  if (!c) return 0
  const lin = (v: number) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b)
}
