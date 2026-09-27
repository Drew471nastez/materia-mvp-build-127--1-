"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { isNativeApp } from "@/lib/platform-utils"
import { StorelibLogo } from "@/components/brand/storelib-logo"

const logoInner = (
  <>
    <StorelibLogo
      size={46}
      fluid
      priority
      className="h-[46px] w-[46px] md:h-[38px] md:w-[38px] lg:h-[40px] lg:w-[40px]"
    />
    <span className="text-[29px] md:text-[23px] lg:text-[24px] font-bold tracking-tight text-neutral-900">
      Storelib
    </span>
  </>
)

/**
 * Logo for auth pages (login, signup, etc.).
 * - In the Storelib Capacitor native app: renders as a non-navigating <div>
 *   so tapping the logo does nothing (prevents accidental exit to homepage).
 * - In a regular browser: renders as a <Link href="/"> as normal.
 */
export function AuthLogo() {
  // Evaluate after mount to avoid SSR mismatch (window is not available server-side)
  const [native, setNative] = useState(false)
  useEffect(() => { setNative(isNativeApp()) }, [])

  if (native) {
    return (
      <div className="mb-12 inline-flex items-center gap-2 cursor-default select-none">
        {logoInner}
      </div>
    )
  }

  return (
    <Link href="/" className="mb-12 inline-flex items-center gap-2">
      {logoInner}
    </Link>
  )
}
