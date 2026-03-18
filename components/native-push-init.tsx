"use client"

import { useEffect } from "react"

export function NativePushInit() {
  useEffect(() => {
    // Only runs on native — no-op on web
    if (!(window as any).Capacitor?.isNativePlatform?.()) return

    import("@/lib/supabase/client").then(({ createClient }) => {
      const supabase = createClient()
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session) {
          console.log("[push] No session — skipping push init")
          return
        }
        import("@/lib/push/client")
          .then(({ initPushNotifications }) => initPushNotifications())
          .catch((err) => console.error("[push] initPushNotifications failed:", err))
      })
    })
  }, [])

  return null
}