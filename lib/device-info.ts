/**
 * Utility functions to parse device information from HTTP headers
 * Used to collect buyer device info for orders
 */

export interface DeviceInfo {
  deviceType: string // desktop, mobile, tablet
  os: string // Windows, macOS, iOS, Android, Linux
  browser: string // Chrome, Safari, Firefox, Edge
  userAgent: string
}

export interface GeoInfo {
  country: string // Country name
  countryCode: string // ISO country code (US, GB, etc.)
}

/**
 * Parse device type, OS, and browser from User-Agent string
 */
export function parseDeviceInfo(userAgent: string | null): DeviceInfo {
  if (!userAgent) {
    return {
      deviceType: "Unknown",
      os: "Unknown",
      browser: "Unknown",
      userAgent: "",
    }
  }

  const ua = userAgent.toLowerCase()

  // Detect device type
  let deviceType = "Desktop"
  if (/mobile|android|iphone|ipod|blackberry|iemobile|opera mini|webos/i.test(ua)) {
    deviceType = "Mobile"
  } else if (/ipad|tablet|playbook|silk/i.test(ua)) {
    deviceType = "Tablet"
  }

  // Detect OS
  let os = "Unknown"
  if (/windows nt 10/i.test(ua)) {
    os = "Windows 10/11"
  } else if (/windows nt 6\.3/i.test(ua)) {
    os = "Windows 8.1"
  } else if (/windows nt 6\.2/i.test(ua)) {
    os = "Windows 8"
  } else if (/windows nt 6\.1/i.test(ua)) {
    os = "Windows 7"
  } else if (/windows/i.test(ua)) {
    os = "Windows"
  } else if (/mac os x/i.test(ua)) {
    // Check for iOS first (includes Mac OS X in user agent)
    if (/iphone|ipad|ipod/i.test(ua)) {
      const match = ua.match(/os (\d+)[_\.](\d+)/i)
      os = match ? `iOS ${match[1]}.${match[2]}` : "iOS"
    } else {
      const match = ua.match(/mac os x (\d+)[_\.](\d+)/i)
      os = match ? `macOS ${match[1]}.${match[2]}` : "macOS"
    }
  } else if (/android/i.test(ua)) {
    const match = ua.match(/android (\d+\.?\d*)/i)
    os = match ? `Android ${match[1]}` : "Android"
  } else if (/linux/i.test(ua)) {
    os = "Linux"
  } else if (/cros/i.test(ua)) {
    os = "Chrome OS"
  }

  // Detect browser
  let browser = "Unknown"
  if (/edg\//i.test(ua)) {
    const match = ua.match(/edg\/(\d+)/i)
    browser = match ? `Edge ${match[1]}` : "Edge"
  } else if (/opr\/|opera/i.test(ua)) {
    const match = ua.match(/(?:opr|opera)\/(\d+)/i)
    browser = match ? `Opera ${match[1]}` : "Opera"
  } else if (/chrome|chromium|crios/i.test(ua)) {
    const match = ua.match(/(?:chrome|chromium|crios)\/(\d+)/i)
    browser = match ? `Chrome ${match[1]}` : "Chrome"
  } else if (/firefox|fxios/i.test(ua)) {
    const match = ua.match(/(?:firefox|fxios)\/(\d+)/i)
    browser = match ? `Firefox ${match[1]}` : "Firefox"
  } else if (/safari/i.test(ua) && !/chrome|chromium/i.test(ua)) {
    const match = ua.match(/version\/(\d+)/i)
    browser = match ? `Safari ${match[1]}` : "Safari"
  } else if (/msie|trident/i.test(ua)) {
    browser = "Internet Explorer"
  }

  return {
    deviceType,
    os,
    browser,
    userAgent,
  }
}

/**
 * Get country information from request headers
 * Most hosting providers (Vercel, Cloudflare, etc.) add geo headers
 */
export function getGeoInfo(headers: Headers): GeoInfo {
  // Try various geo headers from different providers
  // Vercel
  let countryCode = headers.get("x-vercel-ip-country") || ""

  // Cloudflare
  if (!countryCode) {
    countryCode = headers.get("cf-ipcountry") || ""
  }

  // AWS CloudFront
  if (!countryCode) {
    countryCode = headers.get("cloudfront-viewer-country") || ""
  }

  // Generic
  if (!countryCode) {
    countryCode = headers.get("x-country-code") || ""
  }

  // Map country codes to names
  const countryNames: Record<string, string> = {
    US: "United States",
    GB: "United Kingdom",
    CA: "Canada",
    AU: "Australia",
    DE: "Germany",
    FR: "France",
    ES: "Spain",
    IT: "Italy",
    JP: "Japan",
    KR: "South Korea",
    CN: "China",
    IN: "India",
    BR: "Brazil",
    MX: "Mexico",
    NL: "Netherlands",
    BE: "Belgium",
    CH: "Switzerland",
    AT: "Austria",
    SE: "Sweden",
    NO: "Norway",
    DK: "Denmark",
    FI: "Finland",
    PL: "Poland",
    PT: "Portugal",
    IE: "Ireland",
    NZ: "New Zealand",
    SG: "Singapore",
    HK: "Hong Kong",
    TW: "Taiwan",
    AE: "United Arab Emirates",
    SA: "Saudi Arabia",
    ZA: "South Africa",
    AR: "Argentina",
    CL: "Chile",
    CO: "Colombia",
    RU: "Russia",
    TR: "Turkey",
    IL: "Israel",
    TH: "Thailand",
    MY: "Malaysia",
    PH: "Philippines",
    ID: "Indonesia",
    VN: "Vietnam",
    EG: "Egypt",
    NG: "Nigeria",
    KE: "Kenya",
    GH: "Ghana",
    PK: "Pakistan",
    BD: "Bangladesh",
    UA: "Ukraine",
    CZ: "Czech Republic",
    RO: "Romania",
    HU: "Hungary",
    GR: "Greece",
    // Add more as needed
  }

  const country = countryNames[countryCode.toUpperCase()] || countryCode || "Unknown"

  return {
    country,
    countryCode: countryCode.toUpperCase() || "XX",
  }
}

/**
 * Collect all device and geo information from request
 */
export function collectOrderDeviceInfo(request: Request): {
  deviceInfo: DeviceInfo
  geoInfo: GeoInfo
} {
  const userAgent = request.headers.get("user-agent")
  const deviceInfo = parseDeviceInfo(userAgent)
  const geoInfo = getGeoInfo(request.headers)

  return { deviceInfo, geoInfo }
}
