/**
 * ===========================================================================
 *  THE LIVE SITE FROM THE BUILDER: THE PHONE'S BROWSER, NOTHING IN THE APP
 * ===========================================================================
 * The owner: "in the publish modal, the icon next to copy link of the
 * website URL: when I click it, in iOS Capacitor and Android it should take
 * me to the browser outside the app, and do nothing inside the app. Right
 * now it redirects inside the Capacitor frame to the live website."
 *
 * openInBrowser (lib/native-bridge.ts) is run against a stubbed window in
 * each shell, the click handler every live site link now carries
 * (lib/website-builder/live-site-link.ts) is run against a stubbed click,
 * and the builder's live site links are pinned to it.
 * scripts/check-publish-open-live.mjs taps the real publish sheet.
 */
import type React from "react"
import { readCode } from "./_source"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail)}`}`)
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const g = globalThis as unknown as Record<string, unknown>
  const opens: { url: string; target: string }[] = []
  let assigned: string | null = null
  const loc = {
    pathname: "/website-builder/editor/i1",
    origin: "https://storelib.com",
    host: "storelib.com",
    href: "https://storelib.com/website-builder/editor/i1",
    assign: (u: string) => void (assigned = u),
    replace: (u: string) => void (assigned = u),
  }
  const win: Record<string, unknown> = {
    location: new Proxy(loc, { set: (t, k, v) => { if (k === "href") assigned = String(v); (t as Record<string | symbol, unknown>)[k] = v; return true } }),
    open: (url: string, target: string) => { opens.push({ url: String(url), target: String(target) }); return null },
  }
  g.window = win
  const { openInBrowser } = await import("@/lib/native-bridge")
  const reset = () => { opens.length = 0; assigned = null }
  const URL_ = "https://ava.storelib.com"

  console.log("\nopenInBrowser, shell by shell")
  {
    reset()
    win.Capacitor = undefined
    openInBrowser(URL_)
    check("the web: one new tab", opens.length === 1 && opens[0].target === "_blank" && assigned === null, opens)
  }
  {
    reset()
    win.Capacitor = { isNativePlatform: () => true, getPlatform: () => "ios" }
    openInBrowser(URL_)
    await sleep(5)
    check("iOS: one window.open(url, \"_system\"), which Capacitor hands to Safari", opens.length === 1 && opens[0].target === "_system" && opens[0].url === URL_, opens)
    check("  its null answer is not a failure: this window is not sent anywhere after it", assigned === null, assigned)
  }
  {
    /*
      Android goes through the browser plugin, whose answer here is the
      plugin's web stand in, not the phone's: the Android paths (the plugin,
      and a build without it) are tapped in a browser by
      scripts/check-publish-open-live.mjs, and the rule is pinned below.
    */
    reset()
    win.Capacitor = { isNativePlatform: () => true, getPlatform: () => "android" }
    openInBrowser(URL_)
    await sleep(50)
    check("Android: this window is never sent anywhere", assigned === null, assigned)
  }

  console.log("\nThe click every live site link carries")
  {
    const { liveSiteLink, openLiveSite } = await import("@/lib/website-builder/live-site-link")
    reset()
    win.Capacitor = { isNativePlatform: () => true, getPlatform: () => "ios" }
    let prevented = false
    const click = (over: Record<string, unknown> = {}) => ({ defaultPrevented: false, button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, preventDefault: () => { prevented = true }, ...over }) as unknown as React.MouseEvent<HTMLElement>
    openLiveSite(URL_)(click())
    check("a tap is taken (nothing follows the link) and handed to the phone's browser", prevented && opens.length === 1 && opens[0].target === "_system", { prevented, opens })
    reset()
    prevented = false
    openLiveSite(URL_)(click({ metaKey: true }))
    check("a computer's Cmd click is left to the browser", !prevented && opens.length === 0)
    const props = liveSiteLink(URL_)
    check("the link keeps its address and new window, for a long press and Copy link", props.href === URL_ && props.target === "_blank" && props.rel === "noopener noreferrer" && typeof props.onClick === "function")
  }
  delete g.window

  console.log("\nThe builder's live site links")
  const panel = readCode("components/website-builder/publish-panel.tsx")
  const editor = readCode("app/(storelib)/website-builder/editor/[installId]/page.tsx")
  const parts = readCode("components/website-builder/website-settings/parts.tsx")
  const list = readCode("app/(storelib)/app/website-builder/website-builder-client.tsx")
  const tab = readCode("lib/website-builder/opening-tab.ts")
  const preview = readCode("lib/website-builder/open-preview.ts")
  const bridge = readCode("lib/native-bridge.ts")
  check("the publish sheet's icon beside Copy", /\{\.\.\.liveSiteLink\(ownOpen\(websiteUrl\)\)\}\s*data-publish-open-live=""/.test(panel) && !/href=\{ownOpen\(websiteUrl\)\}\s*target="_blank"/.test(panel))
  check("the editor bar's open icon, when the site is live", /\{\.\.\.liveSiteLink\(ownOpen\(websiteUrl\)\)\}/.test(editor) && /onClick=\{siteLive \? openLiveSite\(ownOpen\(websiteUrl\)\) :/.test(editor))
  check("Website settings' Open the website", /\{\.\.\.liveSiteLink\(url\)\}/.test(parts))
  check("the websites list's address and View website", /\{\.\.\.liveSiteLink\(ownOpen\(url\)\)\}/.test(list) && /<a \{\.\.\.liveSiteLink\(ownOpen\(siteUrl\)\)\} aria-label="View website"/.test(list))
  check("Preview: no holding tab in the app (a new window there is the app's), the address goes to openInBrowser", /if \(isNativeApp\(\)\) return null/.test(tab) && /if \(!tab\?\.go\(j\.url\)\) openInBrowser\(j\.url\)/.test(preview) && /if \(!tab\?\.go\(j\.url\)\) openInBrowser\(j\.url\)/.test(panel) && /openInBrowser\(previewUrl\)/.test(panel))
  check("openInBrowser never sends this window to storelib://external, and never opens one of our hosts in a new window on Android", !/export function openInBrowser[\s\S]{0,1800}storelib:\/\/external/.test(bridge) && /if \(link\.kind === "path" \|\| link\.kind === "host"\) return/.test(bridge))

  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
