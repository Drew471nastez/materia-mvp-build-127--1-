/**
 * ===========================================================================
 *  HOVER AND FOCUS, FOR A THEME THAT DOES NOT OFFER THEM
 * ===========================================================================
 * Dawn and Horizon work out a button's hover colour in their own code, so
 * neither Shopify's editor nor the theme's settings can change it. Storelib
 * adds one small group to Theme settings (OVERRIDE_GROUP) and writes what
 * is chosen there as one stylesheet after the theme's own: on the website,
 * in the builder and in Add section alike (page.ts, drawPage). A value left
 * empty leaves the theme as it is.
 *
 * The values live with the theme's settings under `storelib_*` ids, so they
 * save, publish and export with them.
 */

type O = Record<string, unknown>

/** The group the Theme settings panel shows after the theme's own. */
export const OVERRIDE_GROUP = {
  name: "Hover and focus",
  settings: [
    { type: "header", id: "storelib_hdr_buttons", label: "Buttons on hover" },
    { type: "color", id: "storelib_button_hover_bg", label: "Background", default: "" },
    { type: "color", id: "storelib_button_hover_text", label: "Text", default: "" },
    { type: "color", id: "storelib_button_hover_border", label: "Border", default: "" },
    {
      type: "select",
      id: "storelib_button_hover_effect",
      label: "Effect",
      default: "theme",
      options: [
        { value: "theme", label: "As the theme does" },
        { value: "none", label: "None" },
        { value: "lift", label: "Lift" },
        { value: "darken", label: "Darken" },
        { value: "underline", label: "Underline" },
      ],
    },
    { type: "header", id: "storelib_hdr_links", label: "Links on hover" },
    { type: "color", id: "storelib_link_hover", label: "Colour", default: "" },
    { type: "header", id: "storelib_hdr_inputs", label: "Fields" },
    { type: "color", id: "storelib_input_border", label: "Border", default: "" },
    { type: "color", id: "storelib_input_focus", label: "Focus ring", default: "" },
    { type: "range", id: "storelib_input_radius", label: "Corner radius", min: -1, max: 24, step: 1, unit: "px", default: -1, info: "-1 keeps the theme's own" },
  ],
} as const

/* A colour the stylesheet may print: hex, rgb(a) or hsl(a). Anything else is left out. */
const COLOUR = /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\([0-9.,%\s/]+\))$/i
const colour = (v: unknown): string | null => {
  if (typeof v === "string" && COLOUR.test(v.trim())) return v.trim()
  if (v && typeof v === "object" && typeof (v as O).hex === "string" && COLOUR.test((v as O).hex as string)) return (v as O).hex as string
  return null
}

/* What a theme calls a button: Dawn's and Horizon's classes, a plain submit, Shopify's own checkout button. */
const BUTTONS = [
  ".button:not(.button--tertiary):not(.button-unstyled):not(.link)",
  ".btn",
  "button[type=submit]:not(.button-unstyled):not(.link)",
  "input[type=submit]",
  ".shopify-payment-button__button--unbranded",
]
const FIELDS = "input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=hidden]):not([type=submit]),select,textarea,.field__input,.select__select"

/** The stylesheet for the chosen values, or "" when nothing is chosen. */
export function overrideCss(values: O): string {
  const rules: string[] = []
  const hover = (sel: string) => BUTTONS.map((b) => `${b}${sel}`).join(",")
  const bg = colour(values.storelib_button_hover_bg)
  const text = colour(values.storelib_button_hover_text)
  const border = colour(values.storelib_button_hover_border)
  const decl = [bg && `background-color:${bg}!important;--color-button:${bg};`, text && `color:${text}!important;`, border && `border-color:${border}!important;outline-color:${border}!important;`].filter(Boolean).join("")
  if (decl) rules.push(`${hover(":hover")},${hover(":focus-visible")}{${decl}}`)
  switch (values.storelib_button_hover_effect) {
    case "none":
      rules.push(`${hover(":hover")}{transform:none!important;box-shadow:none!important;filter:none!important}${BUTTONS.join(",")}{transition:none!important}`)
      break
    case "lift":
      rules.push(`${BUTTONS.join(",")}{transition:transform .18s ease,box-shadow .18s ease!important}${hover(":hover")}{transform:translateY(-2px)!important;box-shadow:0 6px 16px rgba(0,0,0,.12)!important}`)
      break
    case "darken":
      rules.push(`${BUTTONS.join(",")}{transition:filter .15s ease!important}${hover(":hover")}{filter:brightness(.9)!important}`)
      break
    case "underline":
      rules.push(`${hover(":hover")}{text-decoration:underline!important;text-underline-offset:3px}`)
      break
  }
  const link = colour(values.storelib_link_hover)
  if (link) rules.push(`a:not(.button):not(.btn):not([class*=button]):hover{color:${link}!important}`)
  const fieldBorder = colour(values.storelib_input_border)
  if (fieldBorder) rules.push(`${FIELDS}{border-color:${fieldBorder}!important}`)
  const focus = colour(values.storelib_input_focus)
  if (focus) rules.push(`${FIELDS.split(",").map((f) => `${f}:focus`).join(",")}{outline:2px solid ${focus}!important;outline-offset:1px;border-color:${focus}!important;box-shadow:none!important}`)
  const radius = Number(values.storelib_input_radius)
  if (Number.isFinite(radius) && radius >= 0 && radius <= 48) rules.push(`${FIELDS}{border-radius:${Math.round(radius)}px!important}`)
  return rules.join("")
}
