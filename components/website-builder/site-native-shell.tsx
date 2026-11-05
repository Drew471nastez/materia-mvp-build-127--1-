"use client"

import { useEffect, useState, type ComponentType } from "react"
import { inNativeShell } from "@/lib/website-builder/site-shell-script"

/**
 * THE PHONE APP'S GUARDS, ON A WEBSITE OPENED IN IT, AND NOWHERE ELSE.
 * The app's shell can show a website (*.storelib.com is in its
 * allowNavigation). Storelib's root layout mounts its native guards on every
 * page; a website's root (app/(site)/layout.tsx) fetches them only inside the
 * app, so a browser never downloads them.
 */
export function SiteNativeShell() {
  const [Guards, setGuards] = useState<ComponentType | null>(null)
  useEffect(() => {
    if (!inNativeShell()) return
    let live = true
    import("./site-native-guards")
      .then((m) => {
        if (live) setGuards(() => m.SiteNativeGuards)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])
  return Guards ? <Guards /> : null
}
