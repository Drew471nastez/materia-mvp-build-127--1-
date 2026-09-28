/**
 * ===========================================================================
 *  WHAT THE SUBSCRIBE BAR SAYS, RESOLVED WHERE BOTH SIDES CAN ASK
 * ===========================================================================
 * These decide the two strings on the bar across the top of a creator page:
 * a custom sentence if there is one, then a stored one, then a preset built
 * from the creator's name.
 *
 * THEY USED TO LIVE IN subscribe-bar.tsx, WHICH IS "use client", AND THAT IS
 * NOT A TIDINESS PROBLEM. An export of a "use client" module is not a
 * function when a Server Component imports it — the bundler replaces it with
 * a client reference, and calling one on the server throws.
 *
 * The creator page is a Server Component, and it needs these answers to seed
 * the edit dialog with what the bar ACTUALLY shows rather than with the raw
 * stored value, which is usually empty. Importing them from the client module
 * took the whole page down, and because the workspace renders that page in a
 * frame, what a creator saw was "Something went wrong on this page" filling
 * the editor.
 *
 * Here, with no "use client", they are plain functions on both sides.
 * subscribe-bar.tsx re-exports every one of them, so nothing that already
 * imported them had to change.
 */

export type ButtonStylePreset = "style1" | "style2" | "style3" | "style4"

export const buttonStylePresets: Record<ButtonStylePreset, { default: string; subscribed: string }> = {
  style1: { default: "Subscribe", subscribed: "Subscribed" },
  style2: { default: "Join Now", subscribed: "Joined" },
  style3: { default: "Get It", subscribed: "🔥" },
  style4: { default: "Follow", subscribed: "Followed" },
}

export interface SubscribeBarSettings {
  visible: boolean
  text: string
  placeholder?: string
  buttonText?: string
  dismissible?: boolean
  position?: "top" | "bottom"
  backgroundColor?: string
  textColor?: string
  buttonColor?: string
  buttonTextColor?: string
  buttonBorderRadius?: number
  inputBorderColor?: string
  inputTextColor?: string
  inputPlaceholderColor?: string
  inputBackgroundColor?: string
  showAvatar?: boolean
  avatarUrl?: string
  /**
   * The creator's auth user id. Present only on the live storefront, where
   * subscribing also follows; the builder canvas leaves it out so a preview
   * cannot write to the follow graph.
   */
  creatorUserId?: string
  creatorName?: string
  style?: string
  customCtaText?: string
  enableStickyBar?: boolean
  enableStickyOnScrollUp?: boolean
  buttonStyle?: ButtonStylePreset
  /**
   * Whether `buttonText` is the creator's own words or a leftover default.
   * See getButtonText: this is the only thing that separates the two.
   */
  buttonTextPreset?: string
  // Allow colors object for compatibility with store builder config
  colors?: {
    backgroundColor?: string
    textColor?: string
    accentColor?: string
  }
}

/**
 * The sentence the bar writes for itself when a creator has not written one.
 *
 * SIX, NOT THREE. The first three were the same sentence three times — join
 * this, join that — so a creator choosing between them was choosing between
 * synonyms. The three added are the other reasons anybody puts an email box
 * at the top of a page: the drop, the discount, the release. An unknown style
 * falls back to the first, so a config written before these existed still
 * renders.
 */
function getStyleText(style: string | undefined, creatorName?: string): string {
  switch (style) {
    case "style2":
      return "Join our family!"
    case "style3":
      return "Join our community!"
    case "style4":
      return "Get new drops first"
    case "style5":
      return "Subscribers get 10% off"
    case "style6":
      return "Never miss a release"
    case "style1":
    default:
      /* No name to possess: "Join our's newsletter" is what the fallback
         wrote, so a creator Storelib has no name for gets the plain
         sentence instead of a broken possessive. */
      return creatorName ? `Join ${creatorName}'s newsletter!` : "Join our newsletter!"
  }
}

/** Get display text considering customCtaText */
export function getDisplayText(settings: SubscribeBarSettings, creatorName?: string): string {
  if (settings.customCtaText && settings.customCtaText.trim()) {
    return settings.customCtaText.trim()
  }
  if (settings.style === "style1") {
    return getStyleText("style1", creatorName)
  }
  return settings.text || getStyleText(settings.style, creatorName)
}

/**
 * The button's label: the creator's own words when they typed some, otherwise
 * the preset they picked.
 *
 * THE CUSTOM LABEL WAS BEING WRITTEN AND NEVER READ. This only ever returned
 * a preset, so "Or your own label" in the editor saved a string to the config
 * and the bar went on saying "Subscribe" — a field that persists and does
 * nothing, which is worse than not offering it.
 *
 * `buttonTextPreset === "custom"` is the discriminator rather than "is
 * `buttonText` non-empty", and that distinction matters: the builder writes
 * `buttonText: "Subscribe"` out on saves nobody asked it to, so treating any
 * non-empty string as a choice would pin thousands of existing pages to
 * "Subscribe" and quietly break the preset selector for all of them. The API
 * sets the flag alongside the text and clears it when the field is emptied.
 *
 * Subscribed is always the preset's word. "Subscribed" is a state, not a
 * label, and a creator who typed "Get the drop" did not mean it to be the
 * confirmation.
 */
export function getButtonText(settings: SubscribeBarSettings, isSubscribed: boolean): string {
  const stylePreset = settings.buttonStyle || "style1"
  const preset = buttonStylePresets[stylePreset]
  if (isSubscribed) return preset.subscribed
  const custom = settings.buttonTextPreset === "custom" ? settings.buttonText?.trim() : ""
  return custom || preset.default
}
