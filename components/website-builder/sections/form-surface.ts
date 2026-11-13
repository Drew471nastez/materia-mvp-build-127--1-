/**
 * Where an inline native form stands, read off the page: its ink is the text
 * colour there and its ground the first flat colour painted behind it. The
 * rule and the reason are in lib/website-builder/form-islands.ts
 * (formSurfaceVars). DOM only; measured by tests/form-surface.test.ts.
 */
import { formSurfaceVars, rgbOf } from "@/lib/website-builder/form-islands"

/** The first flat colour painted behind `el`, or null when what is behind it is a picture or a gradient. */
function groundOf(el: HTMLElement): string | null {
  for (let a: HTMLElement | null = el; a; a = a.parentElement) {
    const cs = getComputedStyle(a)
    if (cs.backgroundImage && cs.backgroundImage !== "none") return null
    const c = rgbOf(cs.backgroundColor)
    if (c && c.a >= 0.9) return cs.backgroundColor
    if (c && c.a > 0.05) return null
  }
  return "rgb(255, 255, 255)"
}

/** An inline form reads the surface it stands on (lib/website-builder/form-islands.ts formSurfaceVars); a section that sets --sheet-ink itself is left alone. */
export const FORM_SURFACE_MARK = "data-storelib-form-surface"
export function dressFormSurface(el: HTMLElement, inline: boolean) {
  const had = el.hasAttribute(FORM_SURFACE_MARK)
  if (had) {
    for (const name of Object.keys(formSurfaceVars("", null))) el.style.removeProperty(name)
    el.removeAttribute(FORM_SURFACE_MARK)
  }
  if (!inline || getComputedStyle(el).getPropertyValue("--sheet-ink").trim()) return
  const vars = formSurfaceVars(getComputedStyle(el).color, groundOf(el))
  for (const [name, value] of Object.entries(vars)) el.style.setProperty(name, value)
  el.setAttribute(FORM_SURFACE_MARK, "")
}
