/**
 * The real publish sheet (components/website-builder/publish-panel.tsx, phone
 * layout) and the real link guard (components/platform/native-link-guard.tsx)
 * for scripts/check-publish-open-live.mjs. The hash says which shell the page
 * is in:
 *
 *   #shell=web       a browser
 *   #shell=ios       the iOS app: window.Capacitor says ios
 *   #shell=android   the Android app; &plugin=0 is a build without the browser plugin
 *
 * Every way out is recorded instead of taken: window.__opens (window.open),
 * window.__browser (the browser plugin), and a navigation of this window
 * (a click's default, location.assign or href) shows as window.__left.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { PublishPanel } from "@/components/website-builder/publish-panel"
import { NativeLinkGuard } from "@/components/platform/native-link-guard"

const params = new URLSearchParams(location.hash.slice(1))
const w = window as any
const shell = params.get("shell") || "web"
w.__opens = [] as unknown[]
w.__browser = [] as unknown[]
w.__left = null
w.__pluginOn = params.get("plugin") !== "0"
if (shell !== "web") {
  w.Capacitor = { isNativePlatform: () => true, getPlatform: () => shell, Plugins: {} }
  document.documentElement.classList.add("capacitor")
}
w.__nav = { path: "/website-builder/editor/i1", subs: new Set() }

/* window.open, recorded. Returns null as Capacitor's iOS delegate does (it hands the address to Safari). */
window.open = ((url?: string | URL, target?: string) => {
  w.__opens.push({ url: url == null ? "" : String(url), target: target ?? "" })
  return null
}) as typeof window.open

/* A navigation of this window is the failure this probe looks for. */
window.addEventListener("beforeunload", () => {
  w.__left = w.__left || "unload"
})
document.addEventListener("click", (e) => {
  const a = (e.target as Element | null)?.closest?.("a[href]")
  /* Read after every handler has had its say: a click still not prevented would follow the link. */
  setTimeout(() => {
    if (a && !e.defaultPrevented) w.__left = (a as HTMLAnchorElement).href
  }, 0)
}, true)

createRoot(document.getElementById("app")!).render(
  <>
    <NativeLinkGuard />
    <PublishPanel
      open
      installId="i1"
      onOpenChange={() => {}}
      anchorRef={{ current: null }}
      mobile
      live
      pending={false}
      publishedAt={new Date(Date.now() - 3_600_000).toISOString()}
      websiteUrl="https://ava.storelib.com"
      websiteUrlDisplay="ava.storelib.com"
      busy={false}
      onPublish={() => {}}
      backupsReady
      connections={null}
      connectionsSettled
    />
  </>,
)
