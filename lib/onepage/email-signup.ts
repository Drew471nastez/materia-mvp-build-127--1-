/**
 * ===========================================================================
 *  THE EMAIL SIGNUP'S LAYOUTS, NAMED ONCE
 * ===========================================================================
 * The "Join my newsletter" block (type email_capture) is drawn by
 * components/onepage/email-signup.tsx on the live page and, the same
 * drawing, in the editor's preview frame. The editor's Layout tab draws a
 * small picture of each from the same list.
 *
 * The owner: "it's not working when I select those". Featured ("pro") drew
 * its picture only when an image had been uploaded, and fell back to the
 * plain form without one, so choosing it changed nothing. Every layout now
 * draws its own shape with or without an image: where the picture would be,
 * a calm mail mark in the page's button colour.
 *
 *   default   Classic   centred words, the box and the button in one row
 *   pro       Featured  the picture (or the mail mark) beside the words
 *   cover     Cover     a wide picture (or a soft band) across the top
 *   bold      Solid     the whole card filled, in the page's text colour
 *   minimal   Simple    no card, words on the left, the form under them
 *
 * Round 43, three more:
 *
 *   connect   Connect   one pill: the box, and inside it a grey button with
 *                       the creator's picture ("Connect with" and the photo,
 *                       the owner's screenshot), the words above it
 *   letter    Letter    a note from the creator: their picture and name, the
 *                       words, a box drawn as a line with the button at its end
 *   bar       Bar       one slim row (picture, words, button); the button
 *                       slides the form open under it
 *
 * "pro" keeps its stored name, so a page saved with it before is unchanged.
 */

export const EMAIL_SIGNUP_LAYOUT_IDS = ["default", "pro", "cover", "bold", "minimal", "connect", "letter", "bar"] as const
export type EmailSignupLayout = (typeof EMAIL_SIGNUP_LAYOUT_IDS)[number]

/** What a saved block's layout_type means: anything unknown or missing is Classic. */
export function emailSignupLayout(value: unknown): EmailSignupLayout {
  return typeof value === "string" && (EMAIL_SIGNUP_LAYOUT_IDS as readonly string[]).includes(value) ? (value as EmailSignupLayout) : "default"
}

/** The picture a layout shows: the creator's own, else the free gift's cover, else none (the layout draws its mark). */
export function emailSignupImage(data: { product_image?: string | null; digital_product_thumbnail?: string | null } | null | undefined): string | null {
  const own = typeof data?.product_image === "string" ? data.product_image.trim() : ""
  if (own) return own
  const gift = typeof data?.digital_product_thumbnail === "string" ? data.digital_product_thumbnail.trim() : ""
  return gift || null
}

/**
 * The form under the words: one row (the box and a short button side by
 * side) or stacked (the box over a full-width button). Cover and Bold are
 * always stacked, the others go to stacked when the button's words are long.
 */
export function emailSignupStacked(layout: EmailSignupLayout, buttonText: string): boolean {
  if (layout === "cover" || layout === "bold") return true
  /* The pill and the line keep the box and the button in one row, whatever the words. */
  if (layout === "connect" || layout === "letter") return false
  return buttonText.length > 12
}

/**
 * A colour at a share of its strength over the page, for the card's tint.
 * The block added "10" to the button colour, which is a tint only for a
 * six-digit hex: "#000" became "#00010", which is no colour, and the card
 * lost its background. color-mix takes any colour the theme holds.
 */
export function tintOf(color: string | null | undefined, percent: number): string {
  const c = typeof color === "string" && color.trim() ? color.trim() : "#1a1a2e"
  return `color-mix(in srgb, ${c} ${percent}%, transparent)`
}

/**
 * THE BOLD CARD'S COLOURS. The card is filled with the page's text colour,
 * which always stands out on the page, and its words and its button are
 * in white or near-black, whichever reads on it. It was the button colour
 * first, and a theme with outline buttons has a clear button: the card
 * came out white and the button's words disappeared into it.
 */
export function boldColors(textColor: string | null | undefined): { fill: string; on: string } {
  const fill = typeof textColor === "string" && textColor.trim() ? textColor.trim() : "#111113"
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(fill)?.[1]
  if (!hex) return { fill, on: "#ffffff" }
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  const light = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return { fill, on: light > 0.4 ? "#111113" : "#ffffff" }
}

/** The layouts whose form draws the creator's picture: Connect's button, Letter's head and Bar's row. */
export function emailSignupShowsAvatar(layout: EmailSignupLayout): boolean {
  return layout === "connect" || layout === "letter" || layout === "bar"
}

/**
 * Picking Connect on a block whose button still has the standard words gives it "Connect with" (the words beside
 * the creator's picture in the owner's screenshot), written as the block's own custom text so the editor shows what
 * the page shows. Words the creator chose are kept.
 */
export function connectButtonPatch(data: { button_preset?: string | null; custom_button_text?: string | null }, words: string): { button_preset: "custom"; custom_button_text: string } | null {
  const standard = (!data.button_preset || data.button_preset === "subscribe") && !(data.custom_button_text ?? "").trim()
  return standard ? { button_preset: "custom", custom_button_text: words } : null
}
