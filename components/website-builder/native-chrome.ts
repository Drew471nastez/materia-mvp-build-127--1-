"use client"

import { useEffect, useState } from "react"
import { isNativeApp } from "@/lib/platform-utils"

export type ChromeTone = "dark" | "light"

/**
 * ===========================================================================
 *  WHICH TONE THE PHONE'S CHROME CAN BE
 * ===========================================================================
 * The editor's bar on a phone is light UI, like the sheet under it and the
 * rest of the app on a phone. One thing stands in the way of simply saying
 * so: the clock.
 *
 * In the native shell the status bar is drawn by iOS over the top of the
 * page, and its text colour is not the page's to choose. With no StatusBar
 * plugin in the shell it follows the system appearance: dark text in light
 * mode, white text in dark mode. A white bar under white text is a bar with
 * no clock on it, and that is worse than a dark one.
 *
 * So, in order:
 *   1. In a browser there is no status bar to speak of: light.
 *   2. In the shell with the StatusBar plugin present, the plugin is asked
 *      for dark text, and the bar is light. Put back on the way out, so the
 *      pages after it keep what they had.
 *   3. In the shell without the plugin, light only when the system is in
 *      light mode, where the text is already dark. Otherwise dark, and the
 *      clock stays readable.
 *
 * Case 3 is the shell that is in the store today; case 2 is the next build,
 * once `@capacitor/status-bar` is synced into it.
 */
export function usePhoneChromeTone(phone: boolean): ChromeTone {
  const [tone, setTone] = useState<ChromeTone>("dark")

  useEffect(() => {
    if (!phone) {
      setTone("dark")
      return
    }
    if (!isNativeApp()) {
      setTone("light")
      return
    }

    const statusBar = nativeStatusBar()
    if (statusBar) {
      setTone("light")
      // "LIGHT" is the plugin's name for a light BACKGROUND, so dark text.
      void statusBar.setStyle({ style: "LIGHT" }).catch(() => {})
      void statusBar.setBackgroundColor?.({ color: "#ffffff" }).catch(() => {})
      return () => {
        void statusBar.setStyle({ style: "DEFAULT" }).catch(() => {})
      }
    }

    const light = window.matchMedia?.("(prefers-color-scheme: light)")
    const apply = () => setTone(light?.matches ? "light" : "dark")
    apply()
    light?.addEventListener?.("change", apply)
    return () => light?.removeEventListener?.("change", apply)
  }, [phone])

  return tone
}

type StatusBarPlugin = {
  setStyle: (o: { style: "LIGHT" | "DARK" | "DEFAULT" }) => Promise<void>
  setBackgroundColor?: (o: { color: string }) => Promise<void>
}

/** The StatusBar plugin, if the shell this is running in was built with it. */
function nativeStatusBar(): StatusBarPlugin | null {
  const cap = (window as unknown as { Capacitor?: { isPluginAvailable?: (n: string) => boolean; Plugins?: Record<string, unknown> } }).Capacitor
  if (!cap?.isPluginAvailable?.("StatusBar")) return null
  const plugin = cap.Plugins?.StatusBar as StatusBarPlugin | undefined
  return plugin && typeof plugin.setStyle === "function" ? plugin : null
}
