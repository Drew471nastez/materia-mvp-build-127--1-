/**
 * WHERE A VISIT CAME FROM
 *
 * The one set of rules for turning a referrer, UTM tags and an in-app
 * browser's signature into a source: used when a view is recorded
 * (app/api/track-view) and when OnePage views are read back for Analytics
 * (lib/analytics/reports), so both pages name a visit the same way.
 */

function normalizeStr(v?: string | null): string {
  return (v || "").trim()
}

function normalizeLower(v?: string | null): string {
  return normalizeStr(v).toLowerCase()
}

/**
 * ✅ Server-side client app detection using User-Agent.
 * This is crucial when referrer is empty and clientApp isn't sent / is unreliable.
 *
 * Notes:
 * - Instagram/TikTok/FB/Threads/Snapchat/Telegram are usually detectable here.
 * - WhatsApp is inconsistent across devices; UTMs are the only guaranteed solution.
 */
export function detectClientAppFromUA(uaRaw: string | null): string | null {
  if (!uaRaw) return null
  const ua = uaRaw.toLowerCase()

  if (ua.includes("instagram")) return "instagram"
  if (ua.includes("tiktok")) return "tiktok"
  if (ua.includes("fbav") || ua.includes("fban") || ua.includes("facebook")) return "facebook"
  if (ua.includes("threads")) return "threads"
  if (ua.includes("snapchat")) return "snapchat"
  if (ua.includes("telegram")) return "telegram"
  if (ua.includes("whatsapp")) return "whatsapp"

  return null
}

export function categorizeServerSource(
  referrerDomain?: string | null,
  utmSource?: string | null,
  utmMedium?: string | null,
  clientApp?: string | null,
): string {
  const ref = normalizeLower(referrerDomain)
  const source = normalizeLower(utmSource)
  const medium = normalizeLower(utmMedium)
  const app = normalizeLower(clientApp)

  // 1) UTMs always win
  if (source || medium) {
    if (medium.includes("cpc") || medium.includes("ppc") || medium.includes("paid") || medium.includes("ads")) {
      if (source.includes("google")) return "paid_search"
      return "paid"
    }

    if (medium.includes("email") || source.includes("email") || medium.includes("newsletter")) return "email"
    if (medium.includes("affiliate") || source.includes("affiliate")) return "affiliate"

    // Explicit messaging UTMs
    if (source.includes("whatsapp")) return "social_whatsapp"
    if (source.includes("telegram")) return "social_telegram"

    // Social UTMs
    if (medium.includes("social") || source) {
      if (source.includes("instagram") || source.includes("ig")) return "social_instagram"
      if (source.includes("tiktok")) return "social_tiktok"
      if (source.includes("facebook") || source.includes("fb")) return "social_facebook"
      if (source === "x" || source.includes("twitter") || source.includes("x.com")) return "social_x"
      if (source.includes("youtube") || source.includes("yt")) return "social_youtube"
      if (source.includes("pinterest")) return "social_pinterest"
      if (source.includes("linkedin")) return "social_linkedin"
      if (source.includes("snapchat")) return "social_snapchat"
      if (source.includes("reddit")) return "social_reddit"
      if (source.includes("threads")) return "social_threads"
      return "social"
    }

    return "referral"
  }

  // 2) In-app browsers when referrer is blank
  if (!ref || ref === "direct") {
    if (app === "whatsapp") return "social_whatsapp"
    if (app === "telegram") return "social_telegram"
    if (app === "instagram") return "social_instagram"
    if (app === "tiktok") return "social_tiktok"
    if (app === "facebook") return "social_facebook"
    if (app === "threads") return "social_threads"
    if (app === "snapchat") return "social_snapchat"
    return "direct"
  }

  // 3) Email referrers
  if (
    ["mail.google.com", "gmail.com", "outlook.live.com", "outlook.office.com", "mail.yahoo.com"].some((d) => ref.includes(d))
  ) {
    return "email"
  }

  // 4) Social referrers + redirectors
  if (ref.includes("wa.me") || ref.includes("whatsapp")) return "social_whatsapp"
  if (ref.includes("t.me") || ref.includes("telegram")) return "social_telegram"
  if (ref.includes("instagram")) return "social_instagram"
  if (ref.includes("tiktok")) return "social_tiktok"
  if (ref.includes("facebook")) return "social_facebook"
  if (ref.includes("twitter") || ref.includes("x.com") || ref.includes("t.co")) return "social_x"
  if (ref.includes("youtube")) return "social_youtube"
  if (ref.includes("pinterest")) return "social_pinterest"
  if (ref.includes("linkedin")) return "social_linkedin"
  if (ref.includes("snapchat")) return "social_snapchat"
  if (ref.includes("reddit")) return "social_reddit"
  if (ref.includes("threads")) return "social_threads"

  // 5) Search engines
  if (["google.", "bing.", "yahoo.", "duckduckgo.", "baidu.", "yandex."].some((d) => ref.includes(d))) {
    return "organic_search"
  }

  return "referral"
}


/** The host of a referrer address, without www, or "" for none. */
export function referrerHost(referrer: string | null | undefined): string {
  const r = normalizeStr(referrer)
  if (!r) return ""
  try {
    return new URL(r.includes("://") ? r : `https://${r}`).hostname.toLowerCase().replace(/^www\./, "")
  } catch {
    return ""
  }
}
