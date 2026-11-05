"use client"

import { CapacitorBounceGuard } from "@/components/platform/capacitor-bounce-guard"
import { KeyboardGuard } from "@/components/platform/keyboard-guard"
import { NativeChrome } from "@/components/platform/native-chrome"
import { NativeCookieKillSwitch } from "@/components/native-cookie-killswitch"
import { NativeLinkGuard } from "@/components/platform/native-link-guard"

/** The guards Storelib's root layout mounts for the phone app, for a website shown in it (site-native-shell.tsx). */
export function SiteNativeGuards() {
  return (
    <>
      <NativeCookieKillSwitch />
      <CapacitorBounceGuard />
      <KeyboardGuard />
      <NativeLinkGuard />
      <NativeChrome />
    </>
  )
}
