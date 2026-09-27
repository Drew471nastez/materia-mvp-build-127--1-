/**
 * ===========================================================================
 *  SAVING A FILE, IN A BROWSER AND IN THE APP
 * ===========================================================================
 * In a browser a file is saved the ordinary way: the bytes become a blob and
 * an <a download> is clicked.
 *
 * In the iOS and Android apps that click does nothing. Both are Capacitor
 * shells around storelib.com (capacitor.config.ts): WKWebView has no download
 * manager to hand a blob to, and Capacitor's Android WebView sets no download
 * listener. The plugins that would write into the app's Documents and open
 * the share sheet (@capacitor/filesystem, @capacitor/share) are not in
 * package.json, and adding one is a native change that needs an App Store
 * release. @capacitor/browser is installed and already used for downloads
 * (components/download-button.tsx), so the app opens the file in the system
 * browser sheet instead:
 *
 *   iOS       SFSafariViewController. A PDF is shown in Apple's own viewer,
 *             whose Share button has Save to Files. Anything else is offered
 *             as a download, which iOS keeps in Files, in Downloads.
 *   Android   A Chrome Custom Tab. The file is sent as an attachment, so
 *             Chrome saves it to Downloads and says so.
 *
 * That browser does not carry the app's session cookie, so it cannot open a
 * signed-in address. The caller supplies `link`, which asks the server for a
 * short lived address signed for this one file (lib/orders/signed-link.ts).
 *
 * Everything that touches the page is passed in, so tests/orders-detail.test.ts
 * runs every branch without a browser.
 */

export type SavePlatform = "web" | "ios" | "android"

/** Where the file went, which is what the notice tells the creator. */
export type SaveOutcome = "downloaded" | "ios-viewer" | "ios-download" | "android-download"

export type Disposition = "inline" | "attachment"

export interface SaveRequest {
  /** The file name the browser saves it under. */
  name: string
  /** The bytes, for a browser. */
  file: () => Promise<Blob>
  /** For the app: an address the system browser can open without this session. */
  link: (disposition: Disposition) => Promise<string>
  /** A PDF, which iOS can show in its own viewer rather than only download. */
  viewable?: boolean
}

export interface SaveDeps {
  platform: SavePlatform
  download: (blob: Blob, name: string) => void
  openInBrowser: (url: string) => Promise<void>
}

/**
 * Which app this page is running in, from the Capacitor bridge itself.
 * Not the user agent: the bridge is what the plugin needs, and a page that
 * only looks like the app has no plugin to call.
 */
export function savePlatform(): SavePlatform {
  if (typeof window === "undefined") return "web"
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } }).Capacitor
  if (!cap?.isNativePlatform?.()) return "web"
  const platform = cap.getPlatform?.()
  return platform === "ios" || platform === "android" ? platform : "web"
}

/** How each platform is sent the file. Pure, and the whole of the decision. */
export function savePlan(platform: SavePlatform, viewable: boolean): { via: "blob" | "browser"; disposition: Disposition; outcome: SaveOutcome } {
  if (platform === "ios") {
    return viewable
      ? { via: "browser", disposition: "inline", outcome: "ios-viewer" }
      : { via: "browser", disposition: "attachment", outcome: "ios-download" }
  }
  if (platform === "android") return { via: "browser", disposition: "attachment", outcome: "android-download" }
  return { via: "blob", disposition: "attachment", outcome: "downloaded" }
}

export async function saveFile(request: SaveRequest, deps: SaveDeps = browserDeps()): Promise<SaveOutcome> {
  const plan = savePlan(deps.platform, Boolean(request.viewable))
  if (plan.via === "blob") {
    deps.download(await request.file(), request.name)
  } else {
    await deps.openInBrowser(await request.link(plan.disposition))
  }
  return plan.outcome
}

/** The notice after a save, naming where the file is. `what` is "Invoice", "Orders file". */
export function savedMessage(outcome: SaveOutcome, what: string): string {
  switch (outcome) {
    case "downloaded":
      return `${what} downloaded`
    case "ios-viewer":
      return `${what} opened. Tap Share, then Save to Files`
    case "ios-download":
      return `${what} ready. Tap Download to keep it in Files, in Downloads`
    case "android-download":
      return `${what} saving to Downloads on this phone`
  }
}

/* ─── The real page ───────────────────────────────────────────────────── */

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.rel = "noopener"
  a.style.display = "none"
  document.body.appendChild(a)
  a.click()
  a.remove()
  /* Not at once: Safari and Firefox read the blob after the click returns,
     and a URL revoked in the same task can cancel the download. */
  window.setTimeout(() => URL.revokeObjectURL(url), 4000)
}

/**
 * The system browser, from inside the app.
 *
 * @capacitor/browser first: a Custom Tab on Android, SFSafariViewController
 * on iOS. But the Browser plugin has to be built into each app, and the iOS
 * project's Podfile (ios/App/Podfile) lists Capacitor, Cordova,
 * PushNotifications, Camera and Haptics and not Browser, so on an iPhone the
 * call can answer "not implemented". Then the page goes to the address
 * itself: Capacitor opens any address outside the app (server.url and
 * allowNavigation in capacitor.config.ts) in the system browser rather than
 * in its web view, Safari on iOS and the default browser on Android. No
 * plugin and no app release, and not a pop-up a gesture rule can block.
 */
export async function openInSystemBrowser(url: string): Promise<void> {
  try {
    const { Browser } = await import("@capacitor/browser")
    await Browser.open({ url, toolbarColor: "#ffffff" })
  } catch {
    window.location.assign(url)
  }
}

export function browserDeps(): SaveDeps {
  return { platform: savePlatform(), download: downloadBlob, openInBrowser: openInSystemBrowser }
}
