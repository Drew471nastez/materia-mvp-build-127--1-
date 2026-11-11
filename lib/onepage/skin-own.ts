/**
 * ===========================================================================
 *  A SKINNED THEME, THEN THE CREATOR'S OWN DESIGN OVER IT (wave 10)
 * ===========================================================================
 * The owner: "themes should control things very well and allow customization
 * in the design after applying: wallpaper, theme, layout, header, text,
 * buttons, social icons".
 *
 * A skin (lib/onepage/theme-skin) draws its material with !important rules:
 * Grunge's bars are black or paper whatever the button colour says, Aero's
 * glass carries its own shadow, Messenger's social keys are white tiles. So
 * on a skinned theme the Design tab's Buttons colour, shape, shadow and
 * border, and its social icon style, changed the setting and nothing on the
 * page.
 *
 * Now a change the creator makes in Design AFTER picking a skinned theme is
 * remembered as theirs (`theme.skin_own`, by group: the button's colours, its
 * shape, its shadow, its border, the social icons, the words' colour, the
 * typeface). The page's root carries the groups (data-sk-own) and, on the
 * page, honourOwnStyles() makes the renderer's own values for those groups win
 * over the skin's (the same inline values, raised to !important): the skin
 * keeps its material (gloss, grain, scene), the creator's colour, corners,
 * shadow and icons show through it. Picking a theme again starts over
 * (lib/onepage/theme-apply LOOK_RESET clears skin_own).
 */

/** The Design settings, grouped as the skin's rules are. */
export const SKIN_OWN_GROUPS = {
  button_colour: ["button_color", "button_text_color", "button_style"],
  /* Wave 11: a hover chosen over a skin is the hover's pair only; the button keeps the skin's rest colours (choosing Fill used to raise the theme's rest words over the skin's gel). */
  button_hover: ["button_hover_fill", "button_hover_text", "button_hover_color"],
  button_shape: ["button_border_radius"],
  button_shadow: ["button_shadow", "button_shadow_color"],
  button_border: ["button_border_width", "button_border_color"],
  socials: ["social_icon_style", "social_icon_color", "social_icon_tone"],
  text: ["text_color", "secondary_text_color", "title_color"],
  font: ["font_family", "title_font"],
} as const
export type SkinOwnGroup = keyof typeof SKIN_OWN_GROUPS

const GROUP_OF: Record<string, SkinOwnGroup> = Object.fromEntries(
  (Object.entries(SKIN_OWN_GROUPS) as [SkinOwnGroup, readonly string[]][]).flatMap(([g, keys]) => keys.map((k) => [k, g])),
)

/** The groups a theme says are the creator's own (only on a skinned theme; anything unknown is dropped). */
export function skinOwnOf(theme: { theme_skin?: unknown; skin_own?: unknown } | null | undefined): SkinOwnGroup[] {
  if (!theme || typeof theme.theme_skin !== "string" || !theme.theme_skin) return []
  const list = Array.isArray(theme.skin_own) ? theme.skin_own : []
  return list.filter((g): g is SkinOwnGroup => typeof g === "string" && g in SKIN_OWN_GROUPS)
}

/**
 * The theme update with what it makes the creator's own: on a skinned theme, every group a changed key belongs to is
 * added to `skin_own`. Unchanged when nothing new is owned (or there is no skin), so an undo step stays one step.
 */
export function withSkinOwn<T extends Record<string, unknown>>(theme: Record<string, unknown> | null | undefined, updates: T): T & { skin_own?: string[] } {
  const skin = "theme_skin" in updates ? updates.theme_skin : theme?.theme_skin
  if (typeof skin !== "string" || !skin || "skin_own" in updates) return updates
  const had = skinOwnOf({ theme_skin: skin, skin_own: theme?.skin_own })
  const next = new Set(had)
  for (const k of Object.keys(updates)) {
    const g = GROUP_OF[k]
    if (g && updates[k] !== theme?.[k]) next.add(g)
  }
  if (next.size === had.length) return updates
  return { ...updates, skin_own: [...next].sort() }
}

/** The root's attribute naming the creator's own groups; nothing without any. */
export function skinOwnRootProps(theme: { theme_skin?: unknown; skin_own?: unknown } | null | undefined): { "data-sk-own"?: string } {
  const own = skinOwnOf(theme)
  return own.length ? { "data-sk-own": own.join(" ") } : {}
}

/** What each group raises to !important, on which boxes. */
const RAISE: Record<SkinOwnGroup, { boxes: string; props: string[]; clear?: Record<string, string> }> = {
  button_colour: { boxes: ".op-btn, [data-product-cta], [data-email-form] button[type=submit], [data-onepage-contact] button[type=submit]", props: ["background-color", "color", "--op-fill", "--op-fill-text"], clear: { "text-shadow": "none" } },
  button_hover: { boxes: ".op-btn, [data-product-cta], [data-email-form] button[type=submit], [data-onepage-contact] button[type=submit]", props: ["--op-fill", "--op-fill-text"] },
  button_shape: { boxes: ".op-btn, [data-product-cta], [data-email-form] button[type=submit], [data-onepage-contact] button[type=submit], .op-card", props: ["border-radius"], clear: { "clip-path": "none" } },
  button_shadow: { boxes: ".op-btn, [data-product-cta], .op-card", props: ["box-shadow"] },
  button_border: { boxes: ".op-btn, [data-product-cta], .op-card", props: ["border-width", "border-style", "border-color"] },
  socials: { boxes: "[data-op-social-icon]", props: ["background-color", "border-color", "border-radius", "color", "border-width", "box-shadow"], clear: { "background-image": "none" } },
  text: { boxes: "[data-op-header] h1, [data-op-header] p, [data-onepage-heading], [data-block-title], [data-email-layout] h3, [data-email-layout] p", props: ["color"] },
  font: { boxes: "[data-op-header] h1, [data-onepage-heading], [data-block-title], .op-btn, .op-label", props: ["font-family"] },
}

const MARK = "data-sk-raised"

/*
 * Wave 11: a button's own words raised to !important are written as var(--op-hover-ink, <colour>), so a Fill or Pop
 * hover (app/globals.css .op-btn, ONE HOVER) still turns them to its fill's words: an inline !important colour is
 * beyond every stylesheet, and the creator's rest colour on the hover's fill was the owner's "double hover".
 */
const INK = /^var\(--op-hover-ink,\s*(.*)\)$/
const unwrapInk = (v: string) => (INK.exec(v.trim())?.[1] ?? v).trim()

/** Takes back what honourOwnStyles raised or cleared (a theme picked again, a group no longer the creator's). */
function lower(h: HTMLElement): void {
  for (const entry of (h.getAttribute(MARK) || "").split(";").filter(Boolean)) {
    const [how, p] = entry.split(":")
    if (how === "c") h.style.removeProperty(p)
    else {
      const v = unwrapInk(h.style.getPropertyValue(p))
      if (v) h.style.setProperty(p, v)
    }
  }
  h.removeAttribute(MARK)
}

/**
 * On every skinned root with groups of the creator's own (data-sk-own), the renderer's own inline values for those
 * groups are raised to !important, so the skin's !important rules no longer cover them. Run it after every change
 * (components/onepage/legible-guard does, before it measures the words): it takes back what it did first.
 */
export function honourOwnStyles(doc: ParentNode): void {
  for (const el of doc.querySelectorAll(`[${MARK}]`)) lower(el as HTMLElement)
  for (const root of doc.querySelectorAll("[data-op-skin][data-sk-own]")) {
    const groups = (root.getAttribute("data-sk-own") || "").split(/\s+/).filter((g): g is SkinOwnGroup => g in RAISE)
    for (const g of groups) {
      const { boxes, props, clear } = RAISE[g]
      for (const el of root.querySelectorAll(boxes)) {
        const h = el as HTMLElement
        const done = new Set((h.getAttribute(MARK) || "").split(";").filter(Boolean))
        let raised = false
        for (const p of props) {
          const v = h.style.getPropertyValue(p)
          if (!v) continue
          raised = true
          if (h.style.getPropertyPriority(p) !== "important") {
            h.style.setProperty(p, p === "color" ? `var(--op-hover-ink, ${unwrapInk(v)})` : v, "important")
            done.add(`r:${p}`)
          }
        }
        if (raised && clear)
          for (const [p, v] of Object.entries(clear))
            if (!h.style.getPropertyValue(p)) {
              h.style.setProperty(p, v, "important")
              done.add(`c:${p}`)
            }
        if (done.size) h.setAttribute(MARK, [...done].join(";"))
      }
    }
  }
}
