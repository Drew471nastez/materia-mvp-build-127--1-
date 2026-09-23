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
        : /edg\//.test(ua)
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
