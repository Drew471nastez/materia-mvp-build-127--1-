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
  style?: "style1" | "style2" | "style3"
  customCtaText?: string
  enableStickyBar?: boolean
  enableStickyOnScrollUp?: boolean
  buttonStyle?: ButtonStylePreset
  // Allow colors object for compatibility with store builder config
  colors?: {
    backgroundColor?: string
    textColor?: string
    accentColor?: string
  }
}

/** Get text based on style */
function getStyleText(style: string | undefined, creatorName?: string): string {
  switch (style) {
    case "style2":
      return "Join our family!"
    case "style3":
      return "Join our community!"
    case "style1":
    default:
      return `Join ${creatorName || "our"}'s newsletter!`
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

/** Get button text based on buttonStyle preset */
export function getButtonText(settings: SubscribeBarSettings, isSubscribed: boolean): string {
  const stylePreset = settings.buttonStyle || "style1"
  const preset = buttonStylePresets[stylePreset]
  return isSubscribed ? preset.subscribed : preset.default
}
