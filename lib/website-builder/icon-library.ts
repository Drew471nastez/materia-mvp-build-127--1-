/**
 * ===========================================================================
 *  THE ICONS A SITE CAN USE
 * ===========================================================================
 * Names only. The components live in
 * components/website-builder/sections/icon-map.tsx, and they are apart on
 * purpose: a published page needs the components and never needs the groups
 * or the search words, and the editor needs all of it.
 *
 * GENERATED against lucide-react's real exports, so a name in here cannot be
 * one that does not exist. tests/website-builder.test.ts checks that this
 * list and the map are the same set: an icon offered in the picker that then
 * renders as something else is worse than one that is not offered.
 *
 * Every name is kebab-case, which is the form the theme JSON already stores
 * ("user-plus", "refresh-cw").
 */

export interface IconGroup {
  label: string
  names: string[]
}

export const ICON_GROUPS: IconGroup[] = [
  { label: "Commerce", names: ["shopping-bag", "shopping-cart", "store", "tag", "credit-card", "wallet", "dollar-sign", "percent", "receipt", "gift", "package", "truck", "warehouse", "ticket", "calculator"] },
  { label: "Trust", names: ["shield", "shield-check", "star", "lock", "key", "fingerprint", "badge-check", "verified", "check-circle", "check", "award", "trophy", "medal", "crown", "gem", "diamond", "life-buoy", "handshake", "heart-handshake"] },
  { label: "People", names: ["users", "user-plus", "baby", "accessibility", "smile", "thumbs-up", "heart", "graduation-cap", "school", "briefcase", "building2", "chef-hat"] },
  { label: "Contact", names: ["mail", "phone", "message-circle", "send", "megaphone", "bell", "map-pin", "globe", "globe2", "languages", "share2", "link"] },
  { label: "Social", names: ["instagram", "twitter", "youtube", "linkedin", "facebook", "newspaper", "radio", "tv", "quote"] },
  { label: "Media", names: ["camera", "image", "video", "music", "mic", "headphones", "play", "volume2", "cast", "watch"] },
  { label: "Files", names: ["file-text", "folder", "download", "upload", "copy", "save", "bookmark", "book", "book-open", "clipboard-check", "printer"] },
  { label: "Interface", names: ["search", "filter", "settings", "sliders", "cog", "eye", "eye-off", "plus", "minus", "x", "edit", "trash2", "repeat", "refresh-cw", "move", "maximize2", "toggle-left", "list", "layout-grid", "grid3x3", "rows3", "columns3", "layers", "puzzle"] },
  { label: "Signals", names: ["zap", "sparkles", "lightbulb", "flame", "alert-triangle", "info", "help-circle", "flag", "target", "activity", "trending-up", "bar-chart3", "pie-chart", "rocket", "clock", "calendar"] },
  { label: "Tech", names: ["code", "terminal", "database", "server", "cloud", "wifi", "bluetooth", "smartphone", "monitor", "laptop", "cpu", "battery"] },
  { label: "Craft", names: ["brush", "palette", "pen-tool", "scissors", "wrench", "hammer", "ruler", "dumbbell", "anchor", "compass"] },
  { label: "Nature", names: ["sun", "moon", "leaf", "flower2", "tree-pine", "droplet", "wind", "snowflake", "umbrella", "mountain", "waves", "bird", "fish", "dog", "cat"] },
  { label: "Travel", names: ["plane", "car", "bike", "home", "door-open", "bed", "bath", "sofa", "armchair", "lamp", "footprints"] },
  { label: "Food", names: ["coffee", "utensils", "pizza", "ice-cream", "wine", "beer", "cake", "apple", "carrot", "salad", "egg"] },
  { label: "Style", names: ["shirt", "glasses"] },
]

export const ICON_NAMES: string[] = ICON_GROUPS.flatMap((g) => g.names)

/** Loose match on the name and on its group, for the picker's search box. */
export function searchIcons(query: string): string[] {
  const q = query.trim().toLowerCase()
  if (!q) return ICON_NAMES
  const hits: string[] = []
  for (const group of ICON_GROUPS) {
    const groupMatches = group.label.toLowerCase().includes(q)
    for (const name of group.names) {
      if (groupMatches || name.includes(q) || name.replace(/-/g, " ").includes(q)) hits.push(name)
    }
  }
  return hits
}
