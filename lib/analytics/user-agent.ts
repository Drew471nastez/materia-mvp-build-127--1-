/**
 * Device, browser and system from a browser's signature.
 *
 * OnePage views keep the signature rather than the three answers, so they
 * are worked out when the views are read back. Deliberately coarse: the
 * names a creator would recognise, not every version of every engine. The
 * order of the tests matters, because every Chromium browser also says
 * "Chrome" and every browser on an iPhone also says "Safari".
 */

export interface ParsedAgent {
  device: "mobile" | "tablet" | "desktop" | null
  browser: string | null
  os: string | null
}

export function parseUserAgent(raw: string | null | undefined): ParsedAgent {
  const ua = (raw || "").toLowerCase()
  if (!ua) return { device: null, browser: null, os: null }

  const device: ParsedAgent["device"] = /ipad|tablet|playbook|silk|(android(?!.*mobile))/.test(ua)
    ? "tablet"
    : /mobile|iphone|ipod|android|blackberry|opera mini|iemobile/.test(ua)
      ? "mobile"
      : "desktop"

  const os = /iphone|ipad|ipod/.test(ua)
    ? "iOS"
    : /openharmony|harmonyos/.test(ua)
      ? "HarmonyOS"
      : /android/.test(ua)
        ? "Android"
        : /windows/.test(ua)
          ? "Windows"
          : /mac os x|macintosh/.test(ua)
            ? "macOS"
            : /cros/.test(ua)
              ? "ChromeOS"
              : /linux|freebsd|openbsd|x11/.test(ua)
                ? "Linux"
                : null

  const browser = /instagram/.test(ua)
    ? "Instagram"
    : /fban|fbav/.test(ua)
      ? "Facebook"
      : /tiktok|musical_ly|bytedancewebview/.test(ua)
        ? "TikTok"
        : /edg\/|edga\/|edgios\//.test(ua)
          ? "Edge"
          : /opr\/|opera/.test(ua)
            ? "Opera"
            : /samsungbrowser/.test(ua)
              ? "Samsung Internet"
              : /firefox|fxios/.test(ua)
                ? "Firefox"
                : /crios|chrome|chromium/.test(ua)
                  ? "Chrome"
                  : /safari/.test(ua)
                    ? "Safari"
                    : null

  return { device, browser, os }
}

/**
 * NOT A PERSON. Crawlers, link previews, uptime checks and headless browsers
 * that run a page's script and so reach the view tracker. Googlebot renders
 * JavaScript, and so do the audit tools a creator points at their own page:
 * every one of them was counted as a visit. Matched on the words these agents
 * put in their signatures. An empty signature is not a browser either.
 */
const BOT =
  /(^|[^a-z])bot([^a-z]|$)|bot\/|bot;|\+https?:\/\/|crawl|spider|slurp|mediapartners|facebookexternalhit|facebookcatalog|meta-externalagent|embedly|quora link preview|outbrain|vkshare|w3c_validator|telegrambot|discordbot|slackbot|linkedinbot|skypeuripreview|redditbot|applebot|bingpreview|headlesschrome|phantomjs|puppeteer|playwright|lighthouse|pagespeed|gtmetrix|pingdom|uptimerobot|statuscake|site24x7|checkly|curl\/|wget\/|python-requests|python-urllib|aiohttp|httpx|go-http-client|okhttp|java\/|libwww|axios\/|node-fetch|undici|scrapy|ahrefs|semrush|mj12|petalbot|bytespider|gptbot|chatgpt-user|oai-searchbot|claudebot|claude-web|anthropic-ai|perplexitybot|ccbot|amazonbot|yandex(bot|images)|baiduspider|duckduckbot|sogou|exabot|seznambot|ia_archiver|storebot|google-inspectiontool|googleother|google-read-aloud|vercel-screenshot|vercelbot|bitlybot/

export function isBotAgent(raw: string | null | undefined): boolean {
  const ua = (raw || "").trim().toLowerCase()
  if (!ua) return true
  return BOT.test(ua)
}

/**
 * THE SYSTEM FROM THE BROWSER'S OWN HINT. Chromium browsers send
 * Sec-CH-UA-Platform with every request ("Windows", "macOS", "Android",
 * "Chrome OS", "Linux"), and it stays exact while the user agent string is
 * being frozen. Used when the signature says nothing a system can be told
 * from.
 */
export function osFromPlatformHint(raw: string | null | undefined): string | null {
  const v = (raw || "").replace(/"/g, "").trim().toLowerCase()
  if (!v) return null
  if (v === "windows") return "Windows"
  if (v === "macos") return "macOS"
  if (v === "android") return "Android"
  if (v === "ios") return "iOS"
  if (v === "chrome os" || v === "chromeos" || v === "chromium os") return "ChromeOS"
  if (v === "linux") return "Linux"
  return null
}

/** The systems Analytics lists by name; anything else is Other. */
export const KNOWN_OS = ["iOS", "Android", "Windows", "macOS", "Linux", "ChromeOS", "HarmonyOS"] as const

/** A stored system as Analytics lists it: a known one by its name, a blank "unknown", anything else "other". */
export function osKey(stored: string | null | undefined): string {
  const v = (stored || "").trim().toLowerCase()
  if (!v || v === "unknown") return "unknown"
  if (v === "ios" || v === "ipados") return "iOS"
  if (v === "android") return "Android"
  if (v.startsWith("windows")) return "Windows"
  if (v.startsWith("mac")) return "macOS"
  if (v === "linux") return "Linux"
  if (v === "chromeos" || v === "chrome os") return "ChromeOS"
  if (v === "harmonyos") return "HarmonyOS"
  return "other"
}
