"use client"

import { useCallback } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"

/**
 * The way out of /settings.
 *
 * Settings is a subpage now — you get there through the gear on your profile,
 * not from a bottom tab — so it needs a back affordance of its own. History is
 * the honest one: it returns you to whatever you were actually doing. But
 * inside the Capacitor WebView settings is regularly the first entry of a fresh
 * stack (a cold start, a push notification), and calling back() there does
 * nothing at all, which reads as a dead button. The length check catches
 * exactly that case and falls through to the profile the gear lives on.
 */
export function SettingsBackButton() {
  const router = useRouter()

  const onClick = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back()
      return
    }
    router.push("/profile")
  }, [router])

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Înapoi"
      className="-ml-2.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-neutral-700 transition-transform active:scale-95"
    >
      <ArrowLeft className="h-[22px] w-[22px]" />
    </button>
  )
}
