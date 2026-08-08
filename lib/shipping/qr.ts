import QRCode from "qrcode"

/**
 * ===========================================================================
 *  THE AWB AS A SCANNABLE CODE
 * ===========================================================================
 *
 * The courier's label PDF already carries a barcode, and that is what gets
 * scanned when the parcel is handed over. This is the same number as a QR, for
 * the moments a PDF is the wrong object: showing the code on a phone at the
 * locker, reading it out, checking at a glance that the AWB on screen is the
 * AWB on the parcel.
 *
 * ---------------------------------------------------------------------------
 * Generated on the SERVER, as SVG
 * ---------------------------------------------------------------------------
 * `qrcode` was already a dependency of this project (1.5.4, with types) and had
 * never been imported — so this adds nothing to install. Keeping it server-side
 * keeps it out of the client bundle entirely, and SVG stays sharp at any size,
 * which matters when the thing being scanned is a screen held under a scanner.
 *
 * ---------------------------------------------------------------------------
 * What goes in the code
 * ---------------------------------------------------------------------------
 * The AWB number, alone, exactly as the courier issued it — no URL, no prefix,
 * no JSON. A courier's scanner expects the tracking number and nothing else,
 * and anything wrapped around it produces a code that scans to something the
 * scanner cannot use. The plain number is also what a human can read back off
 * the screen if the scan fails, which is the whole fallback.
 */

/**
 * Error correction level Q — 25% of the code can be obscured and it still
 * reads. Higher than the default M because this is scanned off a phone screen,
 * through fingerprints and glare, often at an angle, and the cost is a slightly
 * denser code rather than anything a user notices.
 */
const ERROR_CORRECTION = "Q" as const

/** Two modules of quiet zone. The spec asks for four; two is the practical
 *  minimum that still scans, and the container adds white space around it. */
const MARGIN = 2

/**
 * An SVG QR code for this text, or null.
 *
 * Never throws. A QR is an aid — the AWB is always displayed as text beside it
 * — so a failure to render one must not take down the page that shows the
 * shipment. Empty input returns null rather than an empty code, because a QR
 * encoding nothing is worse than no QR: it scans, and yields nothing.
 */
export async function qrSvg(text: string): Promise<string | null> {
  const value = String(text ?? "").trim()
  if (!value) return null
  try {
    return await QRCode.toString(value, {
      type: "svg",
      errorCorrectionLevel: ERROR_CORRECTION,
      margin: MARGIN,
      // Pure black on pure white. Any tint costs scan reliability, and this is
      // one of the few places in the app where contrast is functional rather
      // than aesthetic.
      color: { dark: "#000000", light: "#FFFFFF" },
    })
  } catch {
    return null
  }
}

/**
 * The same code as a `data:` URI, for dropping straight into an `<img src>`.
 *
 * Returned inside JSON responses rather than served from its own endpoint: a
 * QR for a short AWB is about 1–2 KB of SVG, which is smaller than the extra
 * round trip a dedicated route would cost, and it cannot get out of step with
 * the AWB it was generated alongside.
 *
 * base64 rather than percent-encoded UTF-8 — SVG contains `#`, which terminates
 * a data URI early in some browsers unless it is escaped, and base64 sidesteps
 * the whole question.
 */
export async function qrDataUri(text: string): Promise<string | null> {
  const svg = await qrSvg(text)
  if (!svg) return null
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`
}
