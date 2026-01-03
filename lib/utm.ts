export type ShareChannel =
  | "whatsapp"
  | "telegram"
  | "instagram"
  | "tiktok"
  | "facebook"
  | "x"
  | "youtube"
  | "linkedin"
  | "pinterest"
  | "reddit"
  | "email"
  | "copy"
  | "direct_share"

export function buildTrackedUrl(
  rawUrl: string,
  {
    source,
    medium = "social",
    campaign = "share",
    content,
    term,
  }: {
    source: string
    medium?: string
    campaign?: string
    content?: string
    term?: string
  },
) {
  const url = new URL(rawUrl)

  // Do not double-tag if already tagged (but allow campaign refresh)
  url.searchParams.set("utm_source", source)
  url.searchParams.set("utm_medium", medium)
  url.searchParams.set("utm_campaign", campaign)

  if (content) url.searchParams.set("utm_content", content)
  if (term) url.searchParams.set("utm_term", term)

  return url.toString()
}

export function buildShareLink(channel: ShareChannel, pageUrl: string, campaign = "share") {
  const tracked = buildTrackedUrl(pageUrl, {
    source: channel,
    medium: channel === "email" ? "email" : "social",
    campaign,
    content: "share_button",
  })

  // Platform share endpoints (when applicable)
  switch (channel) {
    case "whatsapp":
      return `https://wa.me/?text=${encodeURIComponent(tracked)}`
    case "telegram":
      return `https://t.me/share/url?url=${encodeURIComponent(tracked)}`
    case "x":
      return `https://twitter.com/intent/tweet?url=${encodeURIComponent(tracked)}`
    case "facebook":
      return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(tracked)}`
    case "linkedin":
      return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(tracked)}`
    case "reddit":
      return `https://www.reddit.com/submit?url=${encodeURIComponent(tracked)}`
    case "pinterest":
      return `https://pinterest.com/pin/create/button/?url=${encodeURIComponent(tracked)}`
    case "email":
      return `mailto:?subject=${encodeURIComponent("Check this out")}&body=${encodeURIComponent(tracked)}`
    case "copy":
    case "direct_share":
    case "instagram":
    case "tiktok":
    case "youtube":
    default:
      // IG/TikTok/YT often don’t have reliable web share endpoints.
      // For these, you copy the tracked link.
      return tracked
  }
}
