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
    : /android/.test(ua)
      ? "Android"
      : /windows/.test(ua)
        ? "Windows"
        : /mac os x|macintosh/.test(ua)
          ? "macOS"
          : /cros/.test(ua)
            ? "ChromeOS"
            : /linux/.test(ua)
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
  /(^|[^a-z])bot([^a-z]|$)|bot\/|bot;|\+https?:\/\/|crawl|spider|slurp|mediapartners|facebookexternalhit|facebookcatalog|meta-externalagent|embedly|quora link preview|outbrain|vkshare|w3c_validator|telegrambot|discordbot|slackbot|linkedinbot|skypeuripreview|redditbot|applebot|bingpreview|headlesschrome|phantomjs|puppeteer|playwright|lighthouse|pagespeed|gtmetrix|pingdom|uptimerobot|statuscake|site24x7|checkly|curl\/|wget\/|python-requests|python-urllib|aiohttp|httpx|go-http-client|okhttp|java\/|libwww|axios\/|node-fetch|undici|scrapy|ahrefs|semrush|mj12|petalbot|bytespider|gptbot|chatgpt-user|oai-searchbot|claudebot|claude-web|anthropic-ai|perplexitybot|ccbot|amazonbot|yandex(bot|images)|baiduspider|duckduckbot|sogou|exabot|seznambot|ia_archiver/

export function isBotAgent(raw: string | null | undefined): boolean {
  const ua = (raw || "").trim().toLowerCase()
  if (!ua) return true
  return BOT.test(ua)
}
