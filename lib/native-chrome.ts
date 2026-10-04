/**
 * ===========================================================================
 *  THE STRIP UNDER THE CLOCK, AND THE CLOCK'S OWN COLOUR
 * ===========================================================================
 * Every page has one colour at its very top: the header's. In the phone app
 * the safe area under the clock is painted it (app/globals.css, the
 * html.capacitor::before shield and the canvas, both `var(--native-band)`),
 * in a phone's browser the browser's own bar is tinted it (theme-color), and
 * the status bar's text has to be readable on it: dark on a light band,
 * light on a dark one.
 *
 * It was three answers in three places. The shield was black unless a page
 * was on a list, theme-color was black on every page, and the status bar's
 * style was set by one hook (lib/ui/light-chrome) on the way into a white
 * page and set back to light text on the way out, whatever the next page
 * was. So Explore, after a community, had a black band with white text
 * above a white header (the owner's screenshot 56).
 *
 * Now there is one number, --native-band on <html>, and this reads it after
 * every move (components/platform/native-chrome.tsx) and makes the other
 * two agree. Pure functions first, so tests can hold them; the DOM and the
 * native calls after, each a safe no-op where there is nothing to call.
 */

/** The band when a page says nothing: every Storelib header is white. */
export const DEFAULT_BAND = "#ffffff"

/** The status bar's text, by the plugins' own names: LIGHT is dark text for a light band, DARK is light text for a dark one. */
export type StatusStyle = "LIGHT" | "DARK"

/** "#fff", "#ffffff", "rgb(1, 2, 3)" or "rgba(1, 2, 3, 0.5)" as [r, g, b], or null for anything else. */
export function parseColor(value: string | null | undefined): [number, number, number] | null {
  const v = (value || "").trim().toLowerCase()
  if (!v) return null
  let m = /^#([0-9a-f]{3})$/.exec(v)
  if (m) return [0, 1, 2].map((i) => parseInt(m![1][i] + m![1][i], 16)) as [number, number, number]
  m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(v)
  if (m) return [0, 2, 4].map((i) => parseInt(m![1].slice(i, i + 2), 16)) as [number, number, number]
  m = /^rgba?\(\s*(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)/.exec(v)
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])].map((n) => Math.max(0, Math.min(255, Math.round(n)))) as [number, number, number]
  if (v === "white") return [255, 255, 255]
  if (v === "black") return [0, 0, 0]
  return null
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/**
 * The status bar's text for a band: dark text on anything light, light text
 * on anything dark. The split is where black and white text have the same
 * contrast against the band (luminance 0.179), so the choice is always the
 * more readable of the two. A colour that cannot be read is taken as the
 * white default.
 */
export function statusStyleFor(band: string | null | undefined): StatusStyle {
  const rgb = parseColor(band) ?? (parseColor(DEFAULT_BAND) as [number, number, number])
  return luminance(rgb) > 0.179 ? "LIGHT" : "DARK"
}

/** "#FFF" and "rgb(255, 255, 255)" written the same way, so a change is only a change. */
export function normalizeBand(band: string | null | undefined): string {
  const rgb = parseColor(band)
  if (!rgb) return DEFAULT_BAND
  return "#" + rgb.map((n) => n.toString(16).padStart(2, "0")).join("")
}

/** The band this page has asked for, as <html> resolves it now. */
export function readBand(doc: Document = document): string {
  try {
    return normalizeBand(getComputedStyle(doc.documentElement).getPropertyValue("--native-band"))
  } catch {
    return DEFAULT_BAND
  }
}

/** The browser's own bar (Safari's tint, Chrome's address bar on Android) in the band's colour. */
export function applyThemeColor(band: string, doc: Document = document): void {
  try {
    const metas = Array.from(doc.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'))
    if (!metas.length) {
      const m = doc.createElement("meta")
      m.name = "theme-color"
      doc.head.appendChild(m)
      metas.push(m)
    }
    for (const m of metas) if (m.getAttribute("content") !== band) m.setAttribute("content", band)
  } catch {
    /* no head to write to: nothing to tint */
  }
}

type CapacitorLike = { isNativePlatform?: () => boolean; getPlatform?: () => string }

function capacitor(): CapacitorLike | null {
  if (typeof window === "undefined") return null
  return ((window as unknown as { Capacitor?: CapacitorLike }).Capacitor ?? null) as CapacitorLike | null
}

/** Inside the iOS or Android app. */
export function isNativeShell(): boolean {
  return Boolean(capacitor()?.isNativePlatform?.())
}

let lastStyle: StatusStyle | null = null
let lastAndroidBand: string | null = null

/**
 * The status bar's text against `band`, in the app only. Capacitor 8's
 * SystemBars (in @capacitor/core, so no plugin to install on either
 * platform) first, the StatusBar plugin when the shell is older. On Android
 * the strip behind the status bar is painted the band too, for a phone whose
 * window is not edge to edge. Asked only when the answer changes.
 */
export async function applyStatusBar(band: string): Promise<void> {
  if (!isNativeShell()) return
  const style = statusStyleFor(band)
  const android = capacitor()?.getPlatform?.() === "android"
  if (style !== lastStyle) {
    lastStyle = style
    let done = false
    try {
      const { SystemBars } = await import("@capacitor/core")
      await SystemBars.setStyle({ style: style as never, bar: "StatusBar" as never })
      done = true
    } catch {
      /* a shell built before Capacitor 8: the StatusBar plugin below */
    }
    try {
      const { StatusBar, Style } = await import("@capacitor/status-bar")
      if (!done) await StatusBar.setStyle({ style: style === "LIGHT" ? Style.Light : Style.Dark })
    } catch {
      /* neither plugin in this shell: the status bar keeps the system's own style */
    }
  }
  if (android && band !== lastAndroidBand) {
    lastAndroidBand = band
    try {
      const { StatusBar } = await import("@capacitor/status-bar")
      await StatusBar.setBackgroundColor({ color: band })
    } catch {
      /* edge to edge, or no plugin: the page's own band shows under the bar */
    }
  }
}

/** For tests: forget what was last asked of the native side. */
export function resetNativeChromeMemory(): void {
  lastStyle = null
  lastAndroidBand = null
}

/**
 * ===========================================================================
 *  THE SPLASH COMES DOWN ON THE PAGE'S FIRST STEADY FRAME, WHEREVER IT LANDS
 * ===========================================================================
 * capacitor.config.ts keeps the launch screen up (launchAutoHide: false) so
 * nobody sees a half drawn page, and only three pages ever took it down: the
 * dashboard, the library and welcome. A start that resumes on Explore, a
 * community, a creator's page or the account (lib/native-resume.ts) relied
 * on the native side giving up instead. Now every landing page does it the
 * same way: after hydration, two frames (the first paint and the one after
 * it, so fonts and the header are on the glass), then the fade.
 *
 * Not on /native-start, the gate that only decides where to go (the page it
 * sends to does this), not on the three that time it themselves once their
 * own content is in (the dashboard, the library, welcome: hooks/use-hide-
 * native-splash.ts), and not while a sign in is still being finished
 * (nativeAuthInProgress, lib/native-bridge.ts).
 */
/* /library itself only redirects to /account/library now (app/library), so the library is the one address here. */
const HIDES_ITS_OWN = ["/native-start", "/app", "/account/library", "/welcome"]

export function shouldHideSplashOn(pathname: string, authInProgress: boolean): boolean {
  if (authInProgress) return false
  return !HIDES_ITS_OWN.some((p) => pathname === p || pathname.startsWith(p + "/"))
}

let splashDown = false

export async function hideSplashOnce(): Promise<void> {
  if (splashDown || !isNativeShell()) return
  splashDown = true
  try {
    const { SplashScreen } = await import("@capacitor/splash-screen")
    await SplashScreen.hide({ fadeOutDuration: 250 })
  } catch {
    /* no splash plugin in this shell: the launch screen is the system's own */
  }
}
