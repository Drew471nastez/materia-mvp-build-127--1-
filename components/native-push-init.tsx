"use client"

import { useEffect } from "react"

/* Registers this phone for pushes when someone is signed in: at launch, and again the moment someone signs in. */
export function NativePushInit() {
  useEffect(() => {
    if (!(window as any).Capacitor?.isNativePlatform?.()) return
    let unsubscribe: (() => void) | undefined
    let gone = false

    const init = () =>
      import("@/lib/push/client")
        .then(({ initPushNotifications }) => initPushNotifications())
        .catch((err) => console.error("[push] initPushNotifications failed:", err))

    import("@/lib/supabase/client").then(({ createClient }) => {
      if (gone) return
      const supabase = createClient()
      supabase.auth.getSession().then(({ data: { session } }: { data: { session: unknown } }) => {
        if (session) void init()
      })
      const { data } = supabase.auth.onAuthStateChange((event: string, session: unknown) => {
        if (event === "SIGNED_IN" && session) void init()
      })
      unsubscribe = () => data.subscription.unsubscribe()
    })

    return () => {
      gone = true
      unsubscribe?.()
    }
  }, [])

  return null
}
